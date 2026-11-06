"""
El recolector diario de Company of Heroes 2 y Company of Heroes (relanzado) (2026-11-06), directo de la API de Relic
(sin credenciales). Diseño: docs/superpowers/specs/2026-11-06-coh-unificado-design.md.

    python games/coh/tools/relic_daily.py --game coh2|coh1 [--days 28] [--budget 1500] [--workers 4]

Qué hace:
  1. Baja todos los rankings del juego (1v1–4v4 por facción), de a 200 filas.
  2. Lee la memoria de ELO (`games/<juego>/stats/elo/<leaderboard>.json` = {statgroup: [rating, sello]}). El ranking de
     CoH1/CoH2 no trae el ELO, pero cada partida del historial trae el `newrating` de todos sus jugadores.
  3. Pide el historial (`getRecentMatchHistoryByProfileId`, ~40 partidas) de los jugadores con partida en los últimos 7
     días cuyo ELO todavía no se conoce al día, los de mejor puesto primero, hasta `--budget` pedidos. Como una partida da
     el ELO de todos sus jugadores, con pocos pedidos se cubre a casi todos.
  4. Las partidas 1v1–4v4 por facción de días completos (UTC) que todavía no tienen resumen van a
     `stats/days/<fecha>.json` con el mismo resumen que CoH3 (`games/coh3/tools/stats.py`), y se rehace `summary.json`
     con la ventana de `--days`. El primer día se juntan todos los días de la ventana que aparezcan en los historiales.
  5. Escribe la memoria de ELO (sólo los statgroups que siguen en el ranking) y `ladder.json` con el mismo resumen que la
     pestaña Rangos de CoH3 (`games/coh3/tools/ladder.py`), con el ELO de la memoria.

Un pedido que falla se reintenta dos veces (3 s) y después se saltea: la corrida termina igual con lo que juntó.
"""
import argparse
import json
import sys
import time
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(RAIZ / "games" / "coh3" / "tools"))
import ladder as _ladder  # noqa: E402
import stats as _stats  # noqa: E402

UA = "vestigo-data"
DIA = 86400
MODOS = ["1v1", "2v2", "3v3", "4v4"]
ACTIVOS = 7 * DIA


def _tabla(orden: list[str], extra: dict[int, tuple[str, str]] | None = None) -> dict[int, tuple[str, str]]:
    """4–19 = 1v1…4v4 con cuatro facciones por modo (los ids de `getAvailableLeaderboards`)."""
    out = {4 + i * 4 + j: (modo, f) for i, modo in enumerate(MODOS) for j, f in enumerate(orden)}
    out.update(extra or {})
    return out


JUEGOS = {
    "coh2": {
        "leaderboards": _tabla(["wehrmacht", "soviet", "okw", "usf"], {51 + i: (m, "british") for i, m in enumerate(MODOS)}),
        "race": {0: "wehrmacht", 1: "soviet", 2: "okw", 3: "usf", 4: "british"},
        "factions": ["wehrmacht", "soviet", "okw", "usf", "british"],
        "axis": {"wehrmacht", "okw"},
    },
    "coh1": {
        "leaderboards": _tabla(["american", "wehrmacht", "british", "panzer_elite"]),
        "race": {0: "american", 1: "wehrmacht", 2: "british", 3: "panzer_elite"},
        "factions": ["american", "wehrmacht", "british", "panzer_elite"],
        "axis": {"wehrmacht", "panzer_elite"},
    },
}
# 1–4 = 1v1…4v4 por facción en los dos juegos; el resto (IA, equipos armados, Assault, Panzerkrieg, personalizada) no.
MATCHTYPES = {1: "1v1", 2: "2v2", 3: "3v3", 4: "4v4"}


def api(game: str, path: str, **q) -> str:
    qs = "&".join(f"{k}={v}" for k, v in {**q, "title": game}.items())
    return f"https://{game}-api.reliclink.com/community/leaderboard/{path}?{qs}"


def http_get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())
    if (d.get("result") or {}).get("code", -1) != 0:
        raise OSError(f"relic {d.get('result')}")
    return d


def con_reintentos(get: Callable[[str], dict], url: str, sleep: Callable[[float], None]) -> dict | None:
    for intento in range(3):
        try:
            return get(url)
        except Exception:  # noqa: BLE001 — cualquier falla de red o de Relic cuenta igual
            if intento < 2:
                sleep(3)
    return None


def bajar_rankings(game: str, get, sleep) -> tuple[list[dict], set[int]]:
    """Todas las filas de todos los rankings del juego, y los leaderboards que fallaron (quedan incompletos)."""
    filas, rotos = [], set()
    for lb, (modo, faccion) in JUEGOS[game]["leaderboards"].items():
        start = 1
        while True:
            d = con_reintentos(get, api(game, "getLeaderBoard2", leaderboard_id=lb, start=start, count=200, sortBy=1), sleep)
            if d is None:
                print(f"  {game} leaderboard {lb}: falló en {start}; se conserva lo de ayer")
                rotos.add(lb)
                break
            grupos = {g["id"]: g for g in d.get("statGroups") or []}
            stats = d.get("leaderboardStats") or []
            for s in stats:
                g = grupos.get(s["statgroup_id"])
                if not g:
                    continue
                filas.append({
                    "lb": lb, "mode": modo, "faction": faccion, "sg": s["statgroup_id"],
                    "members": [{"profile_id": m["profile_id"], "country": m.get("country") or ""} for m in g["members"]],
                    "rank": s.get("rank"), "ranklevel": s.get("ranklevel") or 0,
                    "wins": s.get("wins") or 0, "losses": s.get("losses") or 0, "lastmatchdate": s.get("lastmatchdate") or 0,
                })
            if len(stats) < 200:
                break
            start += 200
    return filas, rotos


def leer_memoria(out: Path) -> dict[int, dict[int, list]]:
    mem: dict[int, dict[int, list]] = {}
    for f in (out / "elo").glob("*.json"):
        mem[int(f.stem)] = {int(k): v for k, v in json.loads(f.read_text(encoding="utf-8")).items()}
    return mem


def _lb_de(game: str, mt: int, race: int) -> int | None:
    modo = MATCHTYPES.get(mt)
    faccion = JUEGOS[game]["race"].get(race)
    if not modo or not faccion:
        return None
    for lb, (m, f) in JUEGOS[game]["leaderboards"].items():
        if m == modo and f == faccion:
            return lb
    return None


def a_formato_stats(m: dict) -> dict:
    """Una partida de Relic → la forma que lee `stats.summarize_day` (la de los datos de coh3stats)."""
    miembros = {mm["profile_id"]: mm for mm in m.get("matchhistorymember") or []}
    return {
        "matchtype_id": m.get("matchtype_id"),
        "mapname": (m.get("mapname") or "?").lower(),
        "startgametime": m.get("startgametime"),
        "completiontime": m.get("completiontime"),
        "matchhistoryreportresults": [
            {
                "profile_id": mm["profile_id"], "race_id": mm.get("race_id"), "teamid": mm.get("teamid"),
                # El resultado sale del miembro (1 ganó, 0 perdió); si no, del reporte.
                "resulttype": mm.get("outcome") if mm.get("outcome") in (0, 1) else None,
                "matchhistorymember": {"oldrating": mm.get("oldrating")},
            }
            for mm in miembros.values()
        ],
    }


def run(game: str, get=http_get, out: Path | None = None, days: int = 28, budget: int = 1500, workers: int = 4,
        now: int | None = None, sleep: Callable[[float], None] = time.sleep, deadline: float | None = None) -> dict:
    """`deadline`: segundos de reloj para pedir historiales; al pasarlos se deja de pedir y se escribe lo juntado."""
    out = Path(out) if out else RAIZ / "games" / game / "stats"
    now = now or int(time.time())
    hoy = datetime.fromtimestamp(now, timezone.utc).date()
    t0 = time.time()
    conf = JUEGOS[game]

    filas, rotos = bajar_rankings(game, get, sleep)
    inicio_hoy = int(datetime(hoy.year, hoy.month, hoy.day, tzinfo=timezone.utc).timestamp())
    mem = leer_memoria(out)
    dias_dir = out / "days"
    ventana = [hoy - timedelta(days=i) for i in range(days, 0, -1)]
    faltan = {d for d in ventana if not (dias_dir / f"{d.isoformat()}.json").exists()}

    # Candidatos: perfiles activos en 7 días con alguna fila cuyo ELO no está al día.
    def cubierta(f: dict) -> bool:
        # Un ELO conocido hoy no alcanza: el día todavía no tiene resumen, y mañana hay que volver a pedir el historial
        # para que sus partidas de hoy entren (si no, las de la madrugada UTC quedarían afuera de las estadísticas).
        r = mem.get(f["lb"], {}).get(f["sg"])
        return bool(r) and r[1] >= f["lastmatchdate"] - 60 and r[1] < inicio_hoy

    # Primero los de mejor puesto (las filas de arriba de cada ranking son las que más se ven); a igual puesto, el que
    # jugó más recién.
    puesto: dict[int, int] = {}
    ultima: dict[int, int] = {}
    for f in filas:
        if f["lastmatchdate"] >= now - ACTIVOS and not cubierta(f):
            for m in f["members"]:
                pid = m["profile_id"]
                puesto[pid] = min(puesto.get(pid, 10**9), f["rank"] if f["rank"] and f["rank"] > 0 else 10**8)
                ultima[pid] = max(ultima.get(pid, 0), f["lastmatchdate"])
    pendientes = sorted(ultima, key=lambda p: (puesto[p], -ultima[p]))
    por_perfil: dict[int, list[dict]] = {}
    for f in filas:
        for m in f["members"]:
            por_perfil.setdefault(m["profile_id"], []).append(f)

    partidas: dict[int, dict] = {}
    pedidos = fallados = 0

    def absorber(hist: dict) -> None:
        for m in hist.get("matchHistoryStats") or []:
            if m["id"] in partidas:
                continue
            partidas[m["id"]] = m
            for mm in m.get("matchhistorymember") or []:
                lb = _lb_de(game, m.get("matchtype_id"), mm.get("race_id"))
                nr, sg = mm.get("newrating"), mm.get("statgroup_id")
                if lb is None or not sg or not isinstance(nr, (int, float)) or nr <= 0:
                    continue
                prev = mem.setdefault(lb, {}).get(sg)
                if not prev or prev[1] < m["completiontime"]:
                    mem[lb][sg] = [int(nr), m["completiontime"]]

    def falta(pid: int) -> bool:
        return any(f["lastmatchdate"] >= now - ACTIVOS and not cubierta(f) for f in por_perfil.get(pid, []))

    with ThreadPoolExecutor(max(1, workers)) as ex:
        i = 0
        while i < len(pendientes) and pedidos < budget and (deadline is None or time.time() - t0 < deadline):
            tanda = []
            while i < len(pendientes) and len(tanda) < workers and pedidos + len(tanda) < budget:
                pid = pendientes[i]
                i += 1
                if falta(pid):
                    tanda.append(pid)
            url = lambda pid: api(game, "getRecentMatchHistoryByProfileId", profile_id=pid)  # noqa: E731
            for hist in ex.map(lambda pid: con_reintentos(get, url(pid), sleep), tanda):
                pedidos += 1
                if hist is None:
                    fallados += 1
                else:
                    absorber(hist)

    # Los días.
    por_dia: dict[date, list[dict]] = {}
    for m in partidas.values():
        d = datetime.fromtimestamp(m["completiontime"], timezone.utc).date()
        if d in faltan:
            por_dia.setdefault(d, []).append(a_formato_stats(m))
    dias_dir.mkdir(parents=True, exist_ok=True)
    race = conf["race"]
    for d, ms in sorted(por_dia.items()):
        dia = _stats.summarize_day(ms, race=race, modes=MATCHTYPES, axis=conf["axis"])
        dia["date"] = d.isoformat()
        (dias_dir / f"{d.isoformat()}.json").write_text(json.dumps(dia, separators=(",", ":")), encoding="utf-8")
    resumen = _stats.build_summary(ventana, days_dir=dias_dir)
    (out / "summary.json").write_text(json.dumps(resumen, separators=(",", ":")), encoding="utf-8")
    quedan = {d.isoformat() for d in ventana}
    for f in dias_dir.glob("*.json"):
        if f.stem not in quedan:
            f.unlink()

    # Memoria de ELO: sólo lo que sigue en el ranking.
    (out / "elo").mkdir(parents=True, exist_ok=True)
    vivos: dict[int, set] = {}
    for f in filas:
        vivos.setdefault(f["lb"], set()).add(f["sg"])
    for lb in conf["leaderboards"]:
        # Un ranking que falló no poda: se guarda todo lo conocido, así un mal día de Relic no borra el ELO.
        datos = {str(sg): v for sg, v in sorted(mem.get(lb, {}).items()) if lb in rotos or sg in vivos.get(lb, set())}
        (out / "elo" / f"{lb}.json").write_text(json.dumps(datos, separators=(",", ":")), encoding="utf-8")

    # Rangos (mismo formato que CoH3).
    lad = {"day": (hoy - timedelta(days=1)).isoformat(), "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "eloStart": _ladder.ELO_START, "eloStep": _ladder.ELO_STEP, "modes": {}}
    con_elo = total = 0
    previo_f = out / "ladder.json"
    previo = json.loads(previo_f.read_text(encoding="utf-8")) if previo_f.exists() else {}
    lb_de = {(m, f): lb for lb, (m, f) in conf["leaderboards"].items()}
    for modo in MODOS:
        facs, perfiles, paises = {}, set(), Counter()
        for fac in conf["factions"]:
            entradas = []
            for f in filas:
                if f["mode"] != modo or f["faction"] != fac:
                    continue
                r = mem.get(f["lb"], {}).get(f["sg"])
                entradas.append({**f, "rating": r[0] if r else None})
                total += f["lastmatchdate"] >= now - ACTIVOS
                con_elo += bool(r) and f["lastmatchdate"] >= now - ACTIVOS
                for m in f["members"]:
                    if m["profile_id"] not in perfiles:
                        perfiles.add(m["profile_id"])
                        paises[(m["country"] or "").lower() or "?"] += 1
            s = _ladder.summarize([e for e in entradas if e["rating"]], now)
            todos = _ladder.summarize(entradas, now)
            # El histograma de ELO sólo con los que tienen ELO conocido; el resto, con todos.
            todos["elo"] = s["elo"]
            facs[fac] = todos
            # Si su ranking falló hoy, queda la foto anterior de esa facción.
            if lb_de.get((modo, fac)) in rotos:
                facs[fac] = ((previo.get("modes") or {}).get(modo) or {}).get("factions", {}).get(fac, todos)
        lad["modes"][modo] = {"factions": facs, "unique": len(perfiles),
                              "countries": sorted(paises.items(), key=lambda x: (-x[1], x[0]))[:_ladder.TOP_COUNTRIES]}
    (out / "ladder.json").write_text(json.dumps(lad, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    res = {"rows": len(filas), "requests": pedidos, "failed": fallados, "brokenLeaderboards": sorted(rotos), "matches": len(partidas),
           "days": {d.isoformat(): len(v) for d, v in sorted(por_dia.items())},
           "eloCoverage": round(con_elo / total, 3) if total else None, "seconds": round(time.time() - t0)}
    print(f"{game}: {json.dumps(res)}")
    return res


def main(argv: list[str]) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", required=True, choices=sorted(JUEGOS))
    ap.add_argument("--days", type=int, default=28)
    ap.add_argument("--budget", type=int, default=1500)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--deadline", type=float, default=None, help="segundos para pedir historiales (después escribe lo juntado)")
    a = ap.parse_args(argv)
    run(a.game, days=a.days, budget=a.budget, workers=a.workers, deadline=a.deadline)


if __name__ == "__main__":
    main(sys.argv[1:])
