"""
El colector diario de Age of Empires II: DE (2026-11-20), directo de la API de World's Edge (sin login). Diseño:
docs/superpowers/specs/2026-11-20-aoe2-design.md; plan: docs/superpowers/plans/2026-11-20-aoe2-etapa1.md (Task 8).

    python games/aoe2/tools/daily.py [--days 28] [--budget 3000] [--deadline 2400] [--workers 4]
    python games/aoe2/tools/daily.py --todos --rehacer --days 120 --replays 0 --workers 12 --deadline 17000  # recorrido completo

Qué hace:
  1. Baja los rankings (RM, EW y DM, 1v1 y equipos) entero, de a 200 filas, y escribe `stats/ladder/<id>.json`: la
     foto del día (top 2000 + histograma de ELO de todo el ranking) y la de ayer (`prev`) para "Subieron hoy".
  2. Memoria de ELO del top 1000 de RM 1v1 y RM equipos (`stats/elo/<id>/<perfil % 16>.json`, 90 días): la curva del
     perfil, que baja sólo su pedazo.
  3. Pide los historiales (≈ 64 partidas) de jugadores activos elegidos **repartiendo el presupuesto entre bandas de
     ELO** (no sólo el top), hasta `--budget` pedidos o `--deadline` segundos.
  4. Cada partida de ranking cuenta una sola vez; los días completos (UTC) van a `stats/days/<fecha>.json` y se rehace
     `stats/summary.json` con las ventanas de 7, 14 y 28 días, la anterior de cada una (tendencia) y la del parche actual.
     Desde el 2026-11-26 los días **se suman entre corridas**: `vistas.py` recuerda qué partidas ya se contaron (en la
     caché de Actions), así cada corrida agrega las que trae de nuevo. Cada día se eligen jugadores distintos (al azar
     dentro de cada banda, con la fecha como semilla). `--todos` pide el historial de todo el ranking (el recorrido
     completo, `backfill-aoe2.yml`) y `--rehacer` reescribe los días de la ventana con lo juntado.

Formato de un día: `{date, games, patch, civ: {"<modo>|<banda>|<civ>": [partidas, victorias]},
map: {"<modo>|<mapa>|<civ>": […]}, vs: {"<banda>|<civA>|<civB>": [partidas, victorias de A]} (sólo RM 1v1, civA <
civB), dur: {"<modo>|<civ>": [partidas, segundos]}, n: {"<modo>|<banda>": [partidas, jugadores]}}`. La civ es su slug (`games/aoe2/data/civs.json`) o `civ_<id>`.
Un resultado que no es victoria ni derrota no cuenta. La IA (perfil ≤ 0) y las personalizadas quedan afuera.
"""
import argparse
import base64
import io
import zipfile
import zlib
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from itertools import islice
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, as_completed, wait
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import vistas as vistas_mod  # noqa: E402
from patches import NOTAS, NOTICIA, PARCHES  # noqa: E402
from openings import openings as _aperturas  # noqa: E402
from replay import leer as leer_grabacion  # noqa: E402
import grabaciones as grab  # noqa: E402
from pros import SALIDA as PROS_JSON  # noqa: E402
from names import actualizar as actualizar_nombres, escribir as escribir_nombres, leer as leer_nombres  # noqa: E402

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
DIAS_GUARDADOS = 180
DIAS_GRABACIONES = 14
VISTAS = RAIZ / "games" / "aoe2" / ".cache" / "vistas.json.gz"


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


def slots_of(b64: str | None) -> dict[int, int]:
    """`slotinfo` (base64 + zlib, `"<n>,[{…}]"`) → perfil → número de jugador en la grabación (`stationID`)."""
    try:
        txt = zlib.decompress(base64.b64decode(b64 or "")).decode("utf-8", "replace").rstrip(chr(0))
        return {s["profileInfo.id"]: s["stationID"] for s in json.loads(txt[txt.index(",") + 1 :]) if s["profileInfo.id"] > 0}
    except Exception:
        return {}


def _dia_vacio(fecha: str) -> dict:
    return {"date": fecha, "games": 0, "patch": None, "civ": {}, "map": {}, "vs": {}, "dur": {}, "open": {}, "n": {}, "rec": {}, "units": {}, "apm": {}, "age": {}, "top": {}}


def _sumar(d: dict, k: str, gano: bool | int, n: int = 1) -> None:
    c = d.setdefault(k, [0, 0])
    c[0] += n
    c[1] += int(gano)


class Acumulador:
    """Junta partidas de historiales (cada una una sola vez) en resúmenes por día."""

    def __init__(self, civs: dict[int, str], previas: dict[str, set[int]] | None = None):
        self.civs = civs
        self.vistas: set[int] = set()
        #: Lo ya contado en corridas anteriores (no se vuelve a sumar) y lo que cuenta esta, por día.
        self.previas = previas or {}
        self.nuevas: dict[str, set[int]] = {}
        self.dias: dict[str, dict] = {}
        #: Partidas de RM 1v1 candidatas a bajar la grabación (aperturas): id, día, banda, jugadores con lugar.
        self.muestras: list[dict] = []

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
        if m["id"] in self.previas.get(fecha, ()):
            return
        self.nuevas.setdefault(fecha, set()).add(m["id"])
        d = self.dias.setdefault(fecha, _dia_vacio(fecha))
        d["games"] += 1
        _sumar(d.setdefault("n", {}), f"{modo}|{b}", len(js), 1)
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
            lugares = slots_of(m.get("slotinfo"))
            if len(self.muestras) < 20000 and all(j["profile_id"] in lugares for j in js):
                self.muestras.append({"id": m["id"], "fecha": fecha, "band": b, "jugador": js[0]["profile_id"], "js": [(lugares[j["profile_id"]], self.civ(j["civilization_id"]), j["outcome"] == 1, j["profile_id"]) for j in js]})
            a, z = sorted(js, key=lambda j: self.civ(j["civilization_id"]))
            ca, cz = self.civ(a["civilization_id"]), self.civ(z["civilization_id"])
            if ca != cz:
                _sumar(d["vs"], f"{b}|{ca}|{cz}", a["outcome"] == 1)

    def aperturas(self, muestra: dict, por_lugar: dict[int, str]) -> None:
        """Suma las aperturas de una partida de la muestra: `"<banda>|<civ>|<apertura>": [partidas, victorias]`."""
        d = self.dias.setdefault(muestra["fecha"], _dia_vacio(muestra["fecha"]))
        for lugar, civ, gano, *_ in muestra["js"]:
            if lugar in por_lugar:
                _sumar(d.setdefault("open", {}), f"{muestra['band']}|{civ}|{por_lugar[lugar]}", gano)

    def grabacion(self, muestra: dict, lectura, linea: dict[int, int]) -> None:
        """Todo lo de una grabación leída: aperturas (primeros 25 minutos) y lo de `grabaciones.py`."""
        self.aperturas(muestra, _aperturas([a for a in lectura.acciones if a.t <= 25 * 60]))
        d = self.dias.setdefault(muestra["fecha"], _dia_vacio(muestra["fecha"]))
        b = muestra["band"]
        datos = grab.por_jugador(lectura, linea)
        for lugar, civ, gano, perfil in muestra["js"]:
            x = datos.get(lugar)
            if not x:
                continue
            _sumar(d.setdefault("rec", {}), f"{b}|{civ}", gano)
            for k, n in x["units"].items():
                if n >= grab.MASA and k not in grab.ECONOMICAS:
                    _sumar(d.setdefault("units", {}), f"{b}|{civ}|{k}", gano)
            if x["apm"] is not None:
                _sumar(d.setdefault("apm", {}), b, x["apm"])
            for i, t in enumerate(x["ages"]):
                if t is not None:
                    _sumar(d.setdefault("age", {}), f"{b}|{i}", t)
            top = d.setdefault("top", {})
            for marca, (valor, extra) in grab.marcas(x).items():
                top[marca] = grab.sumar_top(top.get(marca, []), [valor, muestra["id"], perfil, civ, extra], marca)

    def completos(self, hoy: date):
        """Los días ya terminados (UTC)."""
        for f, d in sorted(self.dias.items()):
            if f < hoy.isoformat():
                yield f, d


SHARDS = 16


def shard_of(perfil: int) -> int:
    """El pedazo de la memoria de ELO de un perfil (`stats/elo/<ranking>/<n>.json`): el perfil baja sólo el suyo."""
    return perfil % SHARDS


def memoria_elo(filas: list[tuple[int, float]], viejas: dict[int, dict], ahora: int, dias: int = 90) -> dict[int, dict]:
    """La memoria de ELO del top: por pedazo, `{perfil: [[ts, elo], …]}` con el punto de hoy (hora de la corrida) y sin
    los de hace más de `dias`. Los perfiles que salieron del top se caen."""
    out: dict[int, dict] = {n: {} for n in range(SHARDS)}
    for p, e in filas:
        n = shard_of(p)
        previa = [x for x in viejas.get(n, {}).get(str(p), []) if x[0] >= ahora - dias * DIA and x[0] // DIA != ahora // DIA]
        out[n][str(p)] = previa + [[ahora, int(e)]]
    return out


def dias_a_escribir(acc: "Acumulador", hoy: date, guardados: dict[str, int], dias: int) -> set[str]:
    """Los días completos de la ventana que no están guardados o que esta corrida juntó con más partidas (los primeros
    días del arranque salen con pocas: se corrigen solos en las corridas siguientes)."""
    desde = (hoy - timedelta(days=dias)).isoformat()
    return {f for f, d in acc.completos(hoy) if f >= desde and d["games"] > guardados.get(f, 0)}


def pick_players(ladder: list[tuple[int, float]], budget: int, semilla: int | None = None) -> list[tuple[int, float]]:
    """`budget` jugadores repartidos en partes iguales entre las bandas de ELO (lo que sobra de una banda chica pasa a
    las otras); dentro de cada banda, espaciados a lo largo del ranking, o al azar con `semilla` (la fecha: cada día
    otros jugadores, así las corridas se completan entre sí)."""
    import random

    por = {b: [x for x in ladder if band(x[1]) == b] for b in BANDAS}
    por = {b: v for b, v in por.items() if v}
    out: list[tuple[int, float]] = []
    restantes = budget
    pendientes = sorted(por, key=lambda b: len(por[b]))
    while pendientes and restantes > 0:
        b = pendientes.pop(0)
        cupo = min(len(por[b]), restantes // (len(pendientes) + 1) or restantes)
        v = por[b]
        if semilla is not None:
            out += random.Random(semilla).sample(v, cupo)
        else:
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


def _tops(dias: list[dict]) -> dict:
    """Las mejores marcas de varios días juntos (`grabaciones.MARCAS`)."""
    out: dict[str, list] = {}
    for d in dias:
        for marca, filas in (d.get("top") or {}).items():
            if marca not in grab.MARCAS:
                continue
            for f in filas:
                if f[0] < grab.PISO.get(marca, 0):  # los días guardados con un piso más bajo
                    continue
                out[marca] = grab.sumar_top(out.get(marca, []), f, marca)
    return out


def _n(dias: list[dict]) -> dict:
    """Las partidas por modo y banda, sólo si todos los días las tienen (los guardados antes del 21/11 no): con un día
    sin la cuenta, la elección dividiría las civs de toda la ventana por las partidas de parte de ella."""
    return _suma(dias, "n") if all("n" in x for x in dias) else {}


def resumen(dias: dict[str, dict], hoy: date, ventanas=(7, 14, 28)) -> dict:
    """Las ventanas de los últimos N días completos, la anterior de cada una (sólo civ, para la tendencia) y la del
    parche actual: los días desde el siguiente al del parche (`patches.py`)."""
    def entre(desde: date, hasta: date) -> list[dict]:
        return [d for f, d in dias.items() if desde.isoformat() <= f <= hasta.isoformat()]

    def ventana(ds):
        return {
            "games": sum(d["games"] for d in ds), "days": len(ds), "civ": _suma(ds, "civ"), "map": _suma(ds, "map"), "vs": _suma(ds, "vs"),
            "dur": _suma(ds, "dur"), "open": _suma(ds, "open"), "n": _n(ds),
            # De las grabaciones (2026-11-26): unidades, APM, edades y marcas.
            "rec": _suma(ds, "rec"), "units": _suma(ds, "units"), "apm": _suma(ds, "apm"), "age": _suma(ds, "age"), "top": _tops(ds),
        }

    ayer = hoy - timedelta(days=1)
    out = {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "patch": None, "windows": {}, "prev": {}}
    for n in ventanas:
        out["windows"][str(n)] = ventana(entre(ayer - timedelta(days=n - 1), ayer))
        prev = entre(ayer - timedelta(days=2 * n - 1), ayer - timedelta(days=n))
        out["prev"][str(n)] = {"games": sum(d["games"] for d in prev), "civ": _suma(prev, "civ"), "n": _n(prev)}
    actual = patch_of(int(datetime(ayer.year, ayer.month, ayer.day, tzinfo=timezone.utc).timestamp()) + DIA - 1)
    if actual:
        desde = (datetime.fromisoformat(PARCHES[actual].replace("Z", "+00:00")).date() + timedelta(days=1)).isoformat()
        out["patch"] = {"name": actual, "since": desde}
        out["windows"]["patch"] = ventana([d for f, d in dias.items() if f >= desde])
    return out


def con_alias(sumario: dict, alias: dict[int, str]) -> None:
    """Pone el nombre del jugador al final de cada marca (`top`) que todavía no lo tiene: de lo bajado en esta corrida o,
    si no está, del índice del buscador."""
    faltan = {f[2] for w in sumario["windows"].values() for filas in (w.get("top") or {}).values() for f in filas if len(f) < 6 and f[2] not in alias}
    if faltan:
        indice = leer_nombres()
        alias = {**alias, **{p: indice[p][0] for p in faltan if p in indice}}
    for w in sumario["windows"].values():
        for filas in (w.get("top") or {}).values():
            for f in filas:
                if len(f) < 6:
                    f.append(alias.get(f[2], ""))


def parches_json(dias: dict[str, dict], ventana: int = 7, min_partidas: int = 200) -> list[dict]:
    """Los parches de `NOTAS`, del más nuevo al más viejo, con cómo le fue a cada civ en RM 1v1 (todas las bandas) en
    hasta `ventana` días antes (sin el día del parche, que mezcla los dos) y después: `[civ, %antes, partidas antes,
    %después, partidas después]`, sólo con `min_partidas` de cada lado, de la que más subió a la que más bajó."""
    out = []
    orden = sorted(NOTAS.items(), key=lambda x: x[1][0])
    siguiente = {n: datetime.fromisoformat(orden[i + 1][1][0].replace("Z", "+00:00")).date() for i, (n, _) in enumerate(orden[:-1])}
    for nombre, (cuando, menor, gid) in reversed(orden):
        dia = datetime.fromisoformat(cuando.replace("Z", "+00:00")).date()
        # El "después" termina antes del parche siguiente (un arreglo rápido no se mezcla con éste).
        hasta = min(dia + timedelta(days=ventana), siguiente[nombre] - timedelta(days=1)) if nombre in siguiente else dia + timedelta(days=ventana)
        antes = [dias[f] for f in sorted(dias) if dia - timedelta(days=ventana) <= date.fromisoformat(f) < dia]
        despues = [dias[f] for f in sorted(dias) if dia < date.fromisoformat(f) <= hasta]
        filas = []
        if antes and despues:
            def por_civ(ds):
                c: dict[str, list[int]] = {}
                for k, (g, v) in _suma(ds, "civ").items():
                    modo, _banda, civ = k.split("|")
                    if modo == "rm1v1":
                        x = c.setdefault(civ, [0, 0])
                        x[0] += g
                        x[1] += v
                return c
            a, b = por_civ(antes), por_civ(despues)
            for civ in sorted(set(a) & set(b)):
                (ga, va), (gb, vb) = a[civ], b[civ]
                if ga >= min_partidas and gb >= min_partidas:
                    filas.append([civ, round(va / ga, 4), ga, round(vb / gb, 4), gb])
            filas.sort(key=lambda r: -(r[3] - r[1]))
        out.append({"name": nombre, "date": cuando, "minor": menor, "url": NOTICIA.format(gid=gid), "civs": filas, "days": [len(antes), len(despues)]})
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


def home_json(foto: dict | None, resumen_: dict | None, top: int = 5) -> dict:
    """Lo chico que muestra la portada de la sección (`stats/home.json`): top de RM 1v1, los que más subieron, la mejor
    civ de cada banda en RM 1v1 (con 200 partidas o más) y los mapas más jugados, de la ventana de 14 días."""
    out: dict = {"date": (foto or {}).get("date"), "top": [], "climbers": [], "best": {}, "maps": [], "patch": (resumen_ or {}).get("patch")}
    if foto:
        out["top"] = [list(f) for f in foto["top"][:top]]
        ayer = {f[0]: f[1] for f in (foto.get("prev") or {}).get("top", [])}
        suben = [[f[0], f[1], f[2] if len(f) > 2 else "", f[1] - ayer[f[0]]] for f in foto["top"] if f[0] in ayer and f[1] > ayer[f[0]]]
        out["climbers"] = sorted(suben, key=lambda x: (-x[3], -x[1]))[:top]
    w = ((resumen_ or {}).get("windows") or {}).get("14") or {}
    mejores: dict[str, list] = {}
    for k, (g, v) in (w.get("civ") or {}).items():
        modo, banda, civ = k.split("|")
        if modo != "rm1v1" or g < 200:
            continue
        if banda not in mejores or v / g > mejores[banda][1]:
            mejores[banda] = [civ, round(v / g, 4), g]
    out["best"] = {b: mejores[b] for b in BANDAS if b in mejores}
    mapas: Counter = Counter()
    for k, (g, _) in (w.get("map") or {}).items():
        modo, mapa, _civ = k.split("|")
        if modo == "rm1v1":
            mapas[mapa] += g
    out["maps"] = [[m, g // 2] for m, g in mapas.most_common(6)]
    out["facts"] = datos_curiosos(((resumen_ or {}).get("windows") or {}).get("28") or {})
    return out


def datos_curiosos(w: dict, minimo: int = 30) -> dict | None:
    """Los datos curiosos de la portada (2026-11-26), de las grabaciones de los últimos 28 días: la mejor marca de cada
    tipo (`grabaciones.MARCAS`), APM y clic a Feudal promedio por banda, y la
    unidad que más se usa en serio. None si todavía no hay grabaciones con unidades."""
    if not w.get("rec"):
        return None
    u = {x["id"]: x for x in json.loads((RAIZ / "games" / "aoe2" / "data" / "encyclopedia" / "units.json").read_text(encoding="utf-8"))["units"]}
    unidad = lambda i: {"id": i, "pic": u[i]["pic"], "name": u[i]["name"]} if i in u else None
    top = {}
    for marca, filas in (w.get("top") or {}).items():
        if filas and marca in grab.MARCAS:
            f = filas[0]
            top[marca] = {"value": f[0], "match": f[1], "profile": f[2], "civ": f[3], "alias": f[5] if len(f) > 5 else "", "unit": unidad(f[4]) if f[4] else None}
    promedio = lambda clave: [[b, round(x[1] / x[0])] for b in BANDAS if (x := (w.get(clave) or {}).get(b)) and x[0] >= minimo]
    feudal = [[b, round(x[1] / x[0])] for b in BANDAS if (x := (w.get("age") or {}).get(f"{b}|0")) and x[0] >= minimo]
    jugadores = sum(g for g, _ in (w.get("rec") or {}).values())
    lineas: Counter = Counter()
    for k, (g, _) in (w.get("units") or {}).items():
        if int(k.split("|")[2]) not in grab.ECONOMICAS:
            lineas[int(k.split("|")[2])] += g
    masa = None
    if lineas and jugadores:
        linea, g = lineas.most_common(1)[0]
        masa = {"unit": unidad(linea), "share": round(g / jugadores, 3)}
    return {"players": jugadores, "top": top, "apm": promedio("apm"), "feudal": feudal, "mostMassed": masa}


# ---------- Red ----------

#: El país que representa cada pro (`pros.py`): pisa al del perfil, que suele ser donde vive.
PROS: dict[int, str] = {int(k): v for k, v in json.loads(PROS_JSON.read_text(encoding="utf-8")).items()} if PROS_JSON.exists() else {}


def pais_de(perfil: int, pais: str | None) -> str:
    return PROS.get(perfil) or pais or ""


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


def bajar_ranking(lb: int, workers: int) -> list[tuple[int, float, int, str, str]]:
    """Todo el ranking: `(perfil, ELO, última partida, alias, país)` en orden."""
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
    faltan = sorted(set(fut.values()) - set(paginas))
    if faltan:
        print(f"ranking {lb}: páginas salteadas: {len(faltan)} ({', '.join(map(str, faltan[:20]))})", flush=True)
    filas = []
    for s in sorted(paginas):
        p = paginas[s]
        grupos = {g["id"]: g["members"][0] for g in p["statGroups"] if g["members"]}
        for st in p["leaderboardStats"]:
            if st["statgroup_id"] in grupos:
                m = grupos[st["statgroup_id"]]
                filas.append((m["profile_id"], st["rating"], st["lastmatchdate"], st["rank"], m.get("alias", ""), pais_de(m["profile_id"], m.get("country"))))
    filas.sort(key=lambda x: x[3])
    return [(p, e, u, a, c) for p, e, u, _, a, c in filas]


def _grabacion(match_id: int, perfil: int) -> tuple[bytes | None, int]:
    """La grabación de una partida (zip del servidor de Microsoft), descomprimida, y el estado HTTP (0 si no contestó)."""
    try:
        req = urllib.request.Request(f"https://aoe.ms/replay/?gameId={match_id}&profileId={perfil}", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            z = zipfile.ZipFile(io.BytesIO(r.read()))
        return z.read(z.namelist()[0]), 200
    except urllib.error.HTTPError as e:
        return None, e.code
    except Exception:
        return None, 0


#: El servidor de grabaciones corta con 429 tras ~100 pedidos seguidos y deja de contestar un rato (medido el 26/11, sin
#: `Retry-After`): se piden de a una, con una pausa, y ante un 429 se espera cada vez más.
PAUSA_REC = 1.5
ESPERAS_429 = (60, 120, 300, 600, 900)


def bajar_grabaciones(elegidas: list[dict], fin: float, leer) -> tuple[int, int]:
    """Baja y lee (`leer(muestra, datos)`) las grabaciones de `elegidas` hasta `fin` (hora). Si la del primer jugador no
    está, prueba con el otro. Devuelve (leídas, cortes por 429)."""
    leidas = cortes = seguidos = 0
    for m in elegidas:
        if time.time() > fin:
            break
        perfiles = [x[3] for x in m["js"]]
        for perfil in perfiles:
            datos, estado = _grabacion(m["id"], perfil)
            while estado == 429 and time.time() < fin:
                cortes += 1
                espera = ESPERAS_429[min(seguidos, len(ESPERAS_429) - 1)]
                seguidos += 1
                print(f"  429 tras {leidas} grabaciones: espero {espera} s", flush=True)
                time.sleep(min(espera, max(0, fin - time.time())))
                datos, estado = _grabacion(m["id"], perfil)
            time.sleep(PAUSA_REC)
            if estado == 200:
                seguidos = 0
            if datos:
                try:
                    leer(m, datos)
                    leidas += 1
                except Exception as e:  # una grabación rara no puede dejar el día sin escribir
                    print(f"grabación {m['id']} salteada: {e}", flush=True)
                break
            if estado != 404:
                break
    return leidas, cortes


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
    ap.add_argument("--replays", type=int, default=500, help="grabaciones de RM 1v1 a bajar (aperturas, unidades, APM)")
    ap.add_argument("--deadline-rec", type=int, default=2400, help="segundos para bajar grabaciones")
    ap.add_argument("--todos", action="store_true", help="el historial de todo el ranking (recorrido completo)")
    ap.add_argument("--rehacer", action="store_true", help="reescribir los días de la ventana con lo juntado")
    ap.add_argument("--vistas", type=Path, default=VISTAS, help="las partidas ya contadas (caché de Actions)")
    a = ap.parse_args()
    hoy = datetime.now(timezone.utc).date()
    ahora = int(time.time())
    civs = {c["id"]: c["slug"] for c in json.loads(CIVS_JSON.read_text(encoding="utf-8"))}

    # 1 y 2: rankings, fotos y memoria de ELO.
    activos: dict[int, list[tuple[int, float]]] = {}
    todos: dict[int, int] = {}
    del_ranking: dict[int, tuple[str, str, float]] = {}
    de_historiales: dict[int, tuple[str, str]] = {}
    for lb in LEADERBOARDS:
        filas = bajar_ranking(lb, a.workers)
        print(f"ranking {lb}: {len(filas)} filas", flush=True)
        if not filas:
            continue
        ruta = STATS / "ladder" / f"{lb}.json"
        _escribir(ruta, ladder_snapshot([(p, e, a_) for p, e, _, a_, _c in filas], hoy, prev=_leer(ruta)))
        for p, e, _, a_, c in filas:
            if p not in del_ranking or e > del_ranking[p][2]:
                del_ranking[p] = (a_, c, e)
        activos[lb] = [(p, e) for p, e, u, *_ in filas if ahora - u < 7 * DIA]
        if lb in (3, 4, 13, 14):
            for p, _e, u, *_ in filas:
                todos[p] = max(todos.get(p, 0), u)
        if lb in (3, 4):
            carpeta = STATS / "elo" / str(lb)
            viejas = {n: _leer(carpeta / f"{n}.json") or {} for n in range(SHARDS)}
            for n, mem in memoria_elo([(p, e) for p, e, *_ in filas[:TOP_MEMORIA]], viejas, ahora, DIAS_MEMORIA).items():
                _escribir(carpeta / f"{n}.json", mem)
            (STATS / "elo" / f"{lb}.json").unlink(missing_ok=True)

    # 3: historiales.
    previas = None if a.rehacer else vistas_mod.leer(a.vistas)
    contadas = "ninguna guardada" if previas is None else sum(len(v) for v in previas.values())
    print(f"partidas ya contadas: {contadas}", flush=True)
    acc = Acumulador(civs, previas)
    if a.todos:
        # Primero los que jugaron hace menos: si el plazo corta, se cortan los que menos aportan.
        elegidos = [p for p, _ in sorted(todos.items(), key=lambda x: -x[1])]
    else:
        semilla = hoy.toordinal()
        elegidos = [p for lb, parte in REPARTO.items() for p, _ in pick_players(activos.get(lb, []), int(a.budget * parte), semilla)]
        elegidos = list(dict.fromkeys(elegidos))
    print(f"historiales a pedir: {len(elegidos)}", flush=True)
    fin = time.time() + a.deadline
    hechos = 0
    # Ventana acotada de pedidos en vuelo y cada respuesta se suelta al procesarla: con todos encolados de una, las
    # ~95 mil respuestas del recorrido completo quedaban vivas en la lista y el runner se quedaba sin memoria (26/11).
    pendientes = iter(elegidos)
    with ThreadPoolExecutor(a.workers) as ex:
        en_vuelo = set()

        def pedir(n: int) -> None:
            for pid in islice(pendientes, n):
                en_vuelo.add(ex.submit(_get, "getRecentMatchHistory", {"profile_ids": json.dumps([pid])}))

        pedir(a.workers * 4)
        while en_vuelo:
            listos, en_vuelo = wait(en_vuelo, return_when=FIRST_COMPLETED)
            for f in listos:
                h = f.result()
                hechos += 1
                for m in (h or {}).get("matchHistoryStats", []):
                    acc.agregar(m)
                for pr in (h or {}).get("profiles", []):
                    de_historiales[pr.get("profile_id", 0)] = (pr.get("alias", ""), pais_de(pr.get("profile_id", 0), pr.get("country")))
                if hechos % 5000 == 0:
                    print(f"  historiales: {hechos}; partidas vistas: {len(acc.vistas)}", flush=True)
            del listos, f, h
            if time.time() > fin:
                print("plazo cumplido: se escribe lo juntado", flush=True)
                for x in en_vuelo:
                    x.cancel()
                break
            pedir(a.workers * 4 - len(en_vuelo))
    print(f"historiales: {hechos}; partidas vistas: {len(acc.vistas)}", flush=True)

    # 3b: aperturas. Grabaciones de una muestra de RM 1v1 de días completos, repartida entre bandas de ELO.
    guardados = {r.stem: (_leer(r) or {}).get("games", 0) for r in (STATS / "days").glob("*.json")}
    desde = (hoy - timedelta(days=a.days)).isoformat()
    if a.rehacer:
        a_escribir = {f for f, _ in acc.completos(hoy) if f >= desde}
    elif previas is not None:
        # Se suma a los días que ya se vienen sumando y a los que no tienen archivo; un día guardado sin registro de qué
        # partidas tiene (de antes de la caché) queda como está, para no contar nada dos veces.
        a_escribir = {f for f, _ in acc.completos(hoy) if f >= desde and (f in previas or f not in guardados)}
    else:
        a_escribir = dias_a_escribir(acc, hoy, guardados, a.days)
    # Sólo de los últimos días: las grabaciones viejas ya no están en el servidor (y cada pedido fallido cuenta para el 429).
    reciente = (hoy - timedelta(days=DIAS_GRABACIONES)).isoformat()
    candidatas = [m for m in acc.muestras if m["fecha"] in a_escribir and m["fecha"] >= reciente]
    por_banda = {b: [m for m in candidatas if m["band"] == b] for b in BANDAS}
    elegidas = []
    for b, ms in por_banda.items():
        cupo = a.replays // len(BANDAS)
        paso = max(1, len(ms) // max(1, cupo))
        elegidas += ms[::paso][:cupo]
    linea = grab.lineas()
    hechas, cortes = bajar_grabaciones(elegidas, time.time() + a.deadline_rec, lambda m, datos: acc.grabacion(m, leer_grabacion(datos), linea))
    print(f"grabaciones leídas: {hechas} de {len(elegidas)} ({cortes} cortes por 429)", flush=True)

    # 4: días nuevos y resumen.
    sumar = previas is not None and not a.rehacer
    nuevas_vistas = {k: set(v) for k, v in (previas or {}).items()}
    for f, d in acc.completos(hoy):
        if f not in a_escribir:
            continue
        ruta = STATS / "days" / f"{f}.json"
        if sumar and f in guardados:
            _escribir(ruta, vistas_mod.sumar_dia(_leer(ruta) or _dia_vacio(f), d))
            nuevas_vistas[f] = nuevas_vistas.get(f, set()) | acc.nuevas.get(f, set())
        else:
            _escribir(ruta, d)
            nuevas_vistas[f] = set(acc.nuevas.get(f, set()))
    vistas_mod.escribir(a.vistas, nuevas_vistas, (hoy - timedelta(days=DIAS_GUARDADOS)).isoformat())
    recordadas = sum(len(v) for v in nuevas_vistas.values())
    print(f"días escritos: {len(a_escribir)}; partidas recordadas: {recordadas}", flush=True)
    limite = (hoy - timedelta(days=DIAS_GUARDADOS)).isoformat()
    dias = {}
    for r in sorted((STATS / "days").glob("*.json")):
        if r.stem < limite:
            r.unlink()
            continue
        dias[r.stem] = _leer(r)
    sumario = resumen({k: v for k, v in dias.items() if v}, hoy) if dias else None
    if sumario:
        con_alias(sumario, {**{p: a for p, (a, _c) in de_historiales.items()}, **{p: v[0] for p, v in del_ranking.items()}})
        _escribir(STATS / "summary.json", sumario)
    # Parches: los días viejos se borran, así que lo ya calculado con más días se conserva.
    viejos = {p["name"]: p for p in (_leer(STATS / "patches.json") or [])}
    parches = [p if sum(p["days"]) >= sum(viejos.get(p["name"], {}).get("days", [0, 0])) else {**p, "civs": viejos[p["name"]]["civs"], "days": viejos[p["name"]]["days"]} for p in parches_json({k: v for k, v in dias.items() if v})]
    _escribir(STATS / "patches.json", parches)
    _escribir(STATS / "home.json", home_json(_leer(STATS / "ladder" / "3.json"), sumario or _leer(STATS / "summary.json")))
    print(f"días guardados: {len(dias)}", flush=True)

    # 5: el índice de nombres del buscador (`names.py`). Sin rankings (API caída) no se toca.
    if del_ranking:
        indice = actualizar_nombres(leer_nombres(), del_ranking, de_historiales)
        print(f"índice de nombres: {len(indice)} jugadores en {escribir_nombres(indice)} archivos", flush=True)


if __name__ == "__main__":
    sys.exit(main())
