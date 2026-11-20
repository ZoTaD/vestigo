"""
El colector diario de Age of Empires II: DE (2026-11-20), directo de la API de World's Edge (sin login). Diseño:
docs/superpowers/specs/2026-11-20-aoe2-design.md; plan: docs/superpowers/plans/2026-11-20-aoe2-etapa1.md (Task 8).

    python games/aoe2/tools/daily.py [--days 28] [--budget 3000] [--deadline 2400] [--workers 4]

Qué hace:
  1. Baja los rankings (RM, EW y DM, 1v1 y equipos) entero, de a 200 filas, y escribe `stats/ladder/<id>.json`: la
     foto del día (top 2000 + histograma de ELO de todo el ranking) y la de ayer (`prev`) para "Subieron hoy".
  2. Memoria de ELO del top 1000 de RM 1v1 y RM equipos (`stats/elo/<id>.json`, 90 días): la curva del perfil.
  3. Pide los historiales (≈ 64 partidas) de jugadores activos elegidos **repartiendo el presupuesto entre bandas de
     ELO** (no sólo el top), hasta `--budget` pedidos o `--deadline` segundos.
  4. Cada partida de ranking cuenta una sola vez; los días completos (UTC) sin resumen van a `stats/days/<fecha>.json`
     y se rehace `stats/summary.json` con las ventanas de 7, 14 y 28 días, la anterior de cada una (tendencia) y la del
     parche actual.

Formato de un día: `{date, games, patch, civ: {"<modo>|<banda>|<civ>": [partidas, victorias]},
map: {"<modo>|<mapa>|<civ>": […]}, vs: {"<banda>|<civA>|<civB>": [partidas, victorias de A]} (sólo RM 1v1, civA <
civB), dur: {"<modo>|<civ>": [partidas, segundos]}}`. La civ es su slug (`games/aoe2/data/civs.json`) o `civ_<id>`.
Un resultado que no es victoria ni derrota no cuenta. La IA (perfil ≤ 0) y las personalizadas quedan afuera.
"""
import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from patches import PARCHES  # noqa: E402

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
STATS = RAIZ / "games" / "aoe2" / "stats"
CIVS_JSON = RAIZ / "games" / "aoe2" / "data" / "civs.json"
API = "https://aoe-api.worldsedgelink.com/community/leaderboard"
UA = "vestigo-data"
DIA = 86400

#: Rankings que se fotografían: id → modo.
LEADERBOARDS = {3: "rm1v1", 4: "rmteam", 13: "ew1v1", 14: "ewteam", 1: "dm1v1", 2: "dmteam"}
#: De qué rankings salen los jugadores cuyos historiales se piden, y qué parte del presupuesto lleva cada uno.
REPARTO = {3: 0.6, 4: 0.25, 13: 0.15}
#: Modos que entran en las estadísticas.
MODOS = {"rm1v1", "rmteam", "ew1v1", "ewteam"}
BANDAS = ["<1000", "1000-1400", "1400-1800", "1800+"]
TOP_FOTO = 2000
TOP_MEMORIA = 1000
DIAS_MEMORIA = 90
DIAS_GUARDADOS = 60


def mode_of(t: int) -> str:
    """`matchtype_id` → modo. La misma tabla que `modeOfMatchType` en `site/src/aoe2/api/wel.ts` (verificada el 20/11)."""
    if t == 6:
        return "rm1v1"
    if 7 <= t <= 9:
        return "rmteam"
    if t == 26:
        return "ew1v1"
    if 27 <= t <= 29:
        return "ewteam"
    if t == 2:
        return "dm1v1"
    if 3 <= t <= 5:
        return "dmteam"
    if 66 <= t <= 69:
        return "co"
    if t == 0:
        return "custom"
    return "other"


def map_slug(name: str) -> str:
    """Igual que `mapSlug` del sitio: `"Arabian Desert.rms"` → `"arabian-desert"`."""
    s = re.sub(r"\.rms2?$", "", name, flags=re.I).lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def band(elo: float) -> str:
    return "<1000" if elo < 1000 else "1000-1400" if elo < 1400 else "1400-1800" if elo < 1800 else "1800+"


_PARCHES = sorted((int(datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp()), n) for n, t in PARCHES.items())


def patch_of(ts: int) -> str | None:
    """El parche vigente en ese momento (`patches.py`), o None si es anterior a todos."""
    vigente = None
    for desde, nombre in _PARCHES:
        if ts >= desde:
            vigente = nombre
    return vigente


def _dia_vacio(fecha: str) -> dict:
    return {"date": fecha, "games": 0, "patch": None, "civ": {}, "map": {}, "vs": {}, "dur": {}}


def _sumar(d: dict, k: str, gano: bool | int, n: int = 1) -> None:
    c = d.setdefault(k, [0, 0])
    c[0] += n
    c[1] += int(gano)


class Acumulador:
    """Junta partidas de historiales (cada una una sola vez) en resúmenes por día."""

    def __init__(self, civs: dict[int, str]):
        self.civs = civs
        self.vistas: set[int] = set()
        self.dias: dict[str, dict] = {}

    def civ(self, cid: int) -> str:
        return self.civs.get(cid, f"civ_{cid}")

    def agregar(self, m: dict) -> None:
        if m["id"] in self.vistas:
            return
        self.vistas.add(m["id"])
        modo = mode_of(m["matchtype_id"])
        js = m.get("matchhistorymember") or []
        if modo not in MODOS or len(js) < 2 or any(j["profile_id"] <= 0 for j in js):
            return
        validos = [j for j in js if j["outcome"] in (0, 1)]
        if len(validos) != len(js):
            return
        elos = [j["oldrating"] for j in js if j["oldrating"] > 0]
        if not elos:
            return
        b = band(sum(elos) / len(elos))
        fecha = datetime.fromtimestamp(m["startgametime"], timezone.utc).date().isoformat()
        d = self.dias.setdefault(fecha, _dia_vacio(fecha))
        d["games"] += 1
        d["patch"] = patch_of(int(datetime.fromisoformat(fecha).replace(tzinfo=timezone.utc).timestamp()) + DIA - 1)
        mapa = map_slug(m["mapname"])
        dur = max(0, m["completiontime"] - m["startgametime"])
        for j in js:
            c = self.civ(j["civilization_id"])
            gano = j["outcome"] == 1
            _sumar(d["civ"], f"{modo}|{b}|{c}", gano)
            _sumar(d["map"], f"{modo}|{mapa}|{c}", gano)
            k = f"{modo}|{c}"
            x = d["dur"].setdefault(k, [0, 0])
            x[0] += 1
            x[1] += dur
        if modo == "rm1v1" and len(js) == 2:
            a, z = sorted(js, key=lambda j: self.civ(j["civilization_id"]))
            ca, cz = self.civ(a["civilization_id"]), self.civ(z["civilization_id"])
            if ca != cz:
                _sumar(d["vs"], f"{b}|{ca}|{cz}", a["outcome"] == 1)

    def completos(self, hoy: date):
        """Los días ya terminados (UTC)."""
        for f, d in sorted(self.dias.items()):
            if f < hoy.isoformat():
                yield f, d


def pick_players(ladder: list[tuple[int, float]], budget: int) -> list[tuple[int, float]]:
    """`budget` jugadores repartidos en partes iguales entre las bandas de ELO (lo que sobra de una banda chica pasa a
    las otras); dentro de cada banda, espaciados a lo largo del ranking."""
    por = {b: [x for x in ladder if band(x[1]) == b] for b in BANDAS}
    por = {b: v for b, v in por.items() if v}
    out: list[tuple[int, float]] = []
    restantes = budget
    pendientes = sorted(por, key=lambda b: len(por[b]))
    while pendientes and restantes > 0:
        b = pendientes.pop(0)
        cupo = min(len(por[b]), restantes // (len(pendientes) + 1) or restantes)
        v = por[b]
        paso = len(v) / cupo
        out += [v[int(i * paso)] for i in range(cupo)]
        restantes -= cupo
    return out


def _suma(dias: list[dict], clave: str) -> dict:
    out: dict[str, list[int]] = {}
    for d in dias:
        for k, (a, b) in d.get(clave, {}).items():
            c = out.setdefault(k, [0, 0])
            c[0] += a
            c[1] += b
    return out


def resumen(dias: dict[str, dict], hoy: date, ventanas=(7, 14, 28)) -> dict:
    """Las ventanas de los últimos N días completos, la anterior de cada una (sólo civ, para la tendencia) y la del
    parche actual: los días desde el siguiente al del parche (`patches.py`)."""
    def entre(desde: date, hasta: date) -> list[dict]:
        return [d for f, d in dias.items() if desde.isoformat() <= f <= hasta.isoformat()]

    def ventana(ds):
        return {"games": sum(d["games"] for d in ds), "days": len(ds), "civ": _suma(ds, "civ"), "map": _suma(ds, "map"), "vs": _suma(ds, "vs"), "dur": _suma(ds, "dur")}

    ayer = hoy - timedelta(days=1)
    out = {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "patch": None, "windows": {}, "prev": {}}
    for n in ventanas:
        out["windows"][str(n)] = ventana(entre(ayer - timedelta(days=n - 1), ayer))
        prev = entre(ayer - timedelta(days=2 * n - 1), ayer - timedelta(days=n))
        out["prev"][str(n)] = {"games": sum(d["games"] for d in prev), "civ": _suma(prev, "civ")}
    actual = patch_of(int(datetime(ayer.year, ayer.month, ayer.day, tzinfo=timezone.utc).timestamp()) + DIA - 1)
    if actual:
        desde = (datetime.fromisoformat(PARCHES[actual].replace("Z", "+00:00")).date() + timedelta(days=1)).isoformat()
        out["patch"] = {"name": actual, "since": desde}
        out["windows"]["patch"] = ventana([d for f, d in dias.items() if f >= desde])
    return out


def ladder_snapshot(filas: list[tuple], hoy: date, top: int = TOP_FOTO, prev: dict | None = None) -> dict:
    """La foto de un ranking: top `top` como `[perfil, ELO]` o `[perfil, ELO, alias]`, histograma de a 100 de todo el
    ranking y la foto de ayer."""
    cuenta = Counter(int(f[1] // 100) * 100 for f in filas)
    hist = [{"from": k, "count": cuenta.get(k, 0)} for k in range(min(cuenta), max(cuenta) + 100, 100)] if cuenta else []
    out = {"date": hoy.isoformat(), "total": len(filas), "hist": hist, "top": [[f[0], int(f[1]), *f[2:3]] for f in filas[:top]]}
    if prev and prev.get("date") != hoy.isoformat():
        out["prev"] = {"date": prev["date"], "top": prev["top"]}
    elif prev and prev.get("prev"):
        out["prev"] = prev["prev"]
    return out


# ---------- Red ----------

def _get(endpoint: str, params: dict, intentos: int = 3) -> dict | None:
    q = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in {**params, "title": "age2"}.items())
    for i in range(intentos):
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{API}/{endpoint}?{q}", headers={"User-Agent": UA}), timeout=20) as r:
                d = json.load(r)
            if d.get("result", {}).get("code") == 0:
                return d
            return None
        except Exception:
            if i + 1 < intentos:
                time.sleep(3)
    return None


def bajar_ranking(lb: int, workers: int) -> list[tuple[int, float, int, str]]:
    """Todo el ranking: `(perfil, ELO, última partida, alias)` en orden."""
    primera = _get("getLeaderBoard2", {"leaderboard_id": lb, "start": 1, "count": 200, "sortBy": 1})
    if not primera:
        return []
    total = primera.get("rankTotal", 0)
    paginas = {1: primera}
    with ThreadPoolExecutor(workers) as ex:
        fut = {ex.submit(_get, "getLeaderBoard2", {"leaderboard_id": lb, "start": s, "count": 200, "sortBy": 1}): s for s in range(201, total + 1, 200)}
        for f in as_completed(fut):
            if f.result():
                paginas[fut[f]] = f.result()
    filas = []
    for s in sorted(paginas):
        p = paginas[s]
        grupos = {g["id"]: g["members"][0] for g in p["statGroups"] if g["members"]}
        for st in p["leaderboardStats"]:
            if st["statgroup_id"] in grupos:
                m = grupos[st["statgroup_id"]]
                filas.append((m["profile_id"], st["rating"], st["lastmatchdate"], st["rank"], m.get("alias", "")))
    filas.sort(key=lambda x: x[3])
    return [(p, e, u, a) for p, e, u, _, a in filas]


# ---------- Archivos ----------

def _leer(ruta: Path):
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except Exception:
        return None


def _escribir(ruta: Path, obj) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--days", type=int, default=28)
    ap.add_argument("--budget", type=int, default=3000)
    ap.add_argument("--deadline", type=int, default=2400, help="segundos para pedir historiales")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    hoy = datetime.now(timezone.utc).date()
    ahora = int(time.time())
    civs = {c["id"]: c["slug"] for c in json.loads(CIVS_JSON.read_text(encoding="utf-8"))}

    # 1 y 2: rankings, fotos y memoria de ELO.
    activos: dict[int, list[tuple[int, float]]] = {}
    for lb in LEADERBOARDS:
        filas = bajar_ranking(lb, a.workers)
        print(f"ranking {lb}: {len(filas)} filas", flush=True)
        if not filas:
            continue
        ruta = STATS / "ladder" / f"{lb}.json"
        _escribir(ruta, ladder_snapshot([(p, e, a_) for p, e, _, a_ in filas], hoy, prev=_leer(ruta)))
        activos[lb] = [(p, e) for p, e, u, _ in filas if ahora - u < 7 * DIA]
        if lb in (3, 4):
            ruta = STATS / "elo" / f"{lb}.json"
            mem = _leer(ruta) or {}
            ts = int(datetime(hoy.year, hoy.month, hoy.day, tzinfo=timezone.utc).timestamp())
            nueva = {}
            for p, e, *_ in filas[:TOP_MEMORIA]:
                serie = [x for x in mem.get(str(p), []) if x[0] >= ts - DIAS_MEMORIA * DIA and x[0] != ts]
                nueva[str(p)] = serie + [[ts, int(e)]]
            _escribir(ruta, nueva)

    # 3: historiales.
    acc = Acumulador(civs)
    elegidos = [p for lb, parte in REPARTO.items() for p, _ in pick_players(activos.get(lb, []), int(a.budget * parte))]
    elegidos = list(dict.fromkeys(elegidos))
    fin = time.time() + a.deadline
    hechos = 0
    with ThreadPoolExecutor(a.workers) as ex:
        futs = []
        for pid in elegidos:
            futs.append(ex.submit(_get, "getRecentMatchHistory", {"profile_ids": json.dumps([pid])}))
        for f in as_completed(futs):
            if time.time() > fin:
                print("plazo cumplido: se escribe lo juntado", flush=True)
                for x in futs:
                    x.cancel()
                break
            h = f.result()
            hechos += 1
            for m in (h or {}).get("matchHistoryStats", []):
                acc.agregar(m)
    print(f"historiales: {hechos}; partidas vistas: {len(acc.vistas)}", flush=True)

    # 4: días nuevos y resumen.
    for f, d in acc.completos(hoy):
        ruta = STATS / "days" / f"{f}.json"
        if not ruta.exists() and f >= (hoy - timedelta(days=a.days)).isoformat():
            _escribir(ruta, d)
    limite = (hoy - timedelta(days=DIAS_GUARDADOS)).isoformat()
    dias = {}
    for r in sorted((STATS / "days").glob("*.json")):
        if r.stem < limite:
            r.unlink()
            continue
        dias[r.stem] = _leer(r)
    if dias:
        _escribir(STATS / "summary.json", resumen({k: v for k, v in dias.items() if v}, hoy))
    print(f"días guardados: {len(dias)}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
