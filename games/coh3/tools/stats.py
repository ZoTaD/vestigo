"""
Las estadísticas de partidas de Company of Heroes 3 (2026-11-04), de los datos abiertos de coh3stats.com (piden
crédito, que va al pie de la página): un archivo por día con todas las partidas,
`https://storage.coh3stats.com/matches/matches-{ts}.json` (~90 MB, 00:00 UTC del día; se publica a las 06:00 UTC).

    python games/coh3/tools/stats.py [--days 28] [--since 2026-11-05]

Dos pasos, para que la Action diaria baje un solo archivo:
  1. Cada día que falta se resume en `games/coh3/stats/days/<fecha>.json` (unos KB): por modo de automatch (1v1–4v4) y
     banda de ELO, partidas y victorias por facción, facción contra facción (1v1), Eje contra Aliados, por mapa y la
     duración. El archivo crudo se borra apenas se resume (nunca hay dos en memoria).
  2. Se suman los días de la ventana (los últimos `--days`, sin pasar de `--since`, que es el día del último parche) y
     se escribe `games/coh3/stats/summary.json`, lo que lee la pestaña Estadísticas y la Tier list.

El battlegroup de cada jugador NO está en estos datos (sólo cosméticos en `matchhistoryitems`): una tier list por
battlegroup necesita leer los replays.
"""
import argparse
import gc
import json
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parent
STATS = AQUI.parent / "stats"
DAYS = STATS / "days"
TMP = AQUI.parent / "raw" / "matches"
URL = "https://storage.coh3stats.com/matches/matches-{ts}.json"
UA = "Mozilla/5.0 (compatible; vestigo-data)"

# Los ids de raza de la API de Relic → la clave del sitio.
RACE = {129494: "american", 137123: "german", 198437: "dak", 203852: "british"}
AXIS = {"german", "dak"}
# Los `matchtype_id` de automatch.
MODES = {20: "1v1", 21: "2v2", 22: "3v3", 23: "4v4"}
# Las bandas de ELO, por el promedio de `oldrating` de todos los jugadores de la partida. "all" las suma.
BANDS = [("lt1000", 0, 1000), ("1000", 1000, 1200), ("1200", 1200, 1400), ("1400", 1400, 1600), ("1600", 1600, 99999)]
# La duración, en tramos de 5 minutos hasta 60 (el último junta todo lo que sigue).
DUR_STEP, DUR_MAX = 300, 12


def band_of(elo: float) -> str:
    for k, lo, hi in BANDS:
        if lo <= elo < hi:
            return k
    return BANDS[-1][0]


def _inc(d: dict, k: str, g: int = 1, w: int = 0) -> None:
    c = d.setdefault(k, {"g": 0, "w": 0})
    c["g"] += g
    c["w"] += w


def summarize_day(matches: list[dict], race: dict = RACE, modes: dict = MODES, axis: set = AXIS) -> dict:
    """Resume las partidas de automatch de un día. Las que no tienen ganador claro (empates, abandonos sin resultado) no cuentan.

    `race`, `modes` y `axis` son los de CoH3; CoH1 y CoH2 pasan los suyos (`games/coh/tools/relic_daily.py`)."""
    out: dict = {"matches": 0, "modes": {}}
    for m in matches:
        mode = modes.get(m.get("matchtype_id"))
        if not mode:
            continue
        players = m.get("matchhistoryreportresults") or []
        teams: dict[int, list] = {}
        ok = True
        for p in players:
            f = race.get(p.get("race_id"))
            if f is None or p.get("resulttype") not in (0, 1):
                ok = False
                break
            teams.setdefault(p.get("teamid"), []).append((f, p["resulttype"] == 1, (p.get("matchhistorymember") or {}).get("oldrating")))
        n = int(mode[0])
        if not ok or len(teams) != 2 or any(len(t) != n for t in teams.values()):
            continue
        sides = list(teams.values())
        # Un equipo es todo Eje o todo Aliados; si no, la partida está rota.
        side_axis = [all(f in axis for f, _, _ in t) for t in sides]
        if side_axis[0] == side_axis[1] or any(any(f in axis for f, _, _ in t) != a for t, a in zip(sides, side_axis)):
            continue
        won = [t[0][1] for t in sides]
        if won[0] == won[1]:
            continue
        elos = [e for t in sides for _, _, e in t if isinstance(e, (int, float)) and e > 0]
        band = band_of(sum(elos) / len(elos)) if elos else None
        out["matches"] += 1
        md = out["modes"].setdefault(mode, {"g": 0, "axisW": 0, "bands": {}, "fvf": {}, "maps": {}, "dur": [0] * (DUR_MAX + 1)})
        axis_won = won[0] if side_axis[0] else won[1]
        md["g"] += 1
        md["axisW"] += int(axis_won)
        gt = (m.get("completiontime") or 0) - (m.get("startgametime") or 0)
        if gt > 0:
            md["dur"][min(DUR_MAX, gt // DUR_STEP)] += 1
        for b in ("all", band) if band else ("all",):
            bd = md["bands"].setdefault(b, {"g": 0, "axisW": 0, "f": {}})
            bd["g"] += 1
            bd["axisW"] += int(axis_won)
            for t in sides:
                for f, w, _ in t:
                    _inc(bd["f"], f, 1, int(w))
            if mode == "1v1":
                (fa, wa, _), (fb, _, _) = sides[0][0], sides[1][0]
                fv = md["fvf"].setdefault(b, {})
                _inc(fv, f"{fa}>{fb}", 1, int(wa))
                _inc(fv, f"{fb}>{fa}", 1, int(not wa))
        mp = md["maps"].setdefault(m.get("mapname") or "?", {"g": 0, "axisW": 0, "f": {}})
        mp["g"] += 1
        mp["axisW"] += int(axis_won)
        for t in sides:
            for f, w, _ in t:
                _inc(mp["f"], f, 1, int(w))
    return out


def merge(into: dict, day: dict) -> None:
    """Suma un día a lo acumulado (mismas claves, contadores enteros)."""

    def add(a, b):
        if isinstance(b, dict):
            for k, v in b.items():
                if k in a:
                    a[k] = add(a[k], v)
                else:
                    a[k] = json.loads(json.dumps(v))
            return a
        if isinstance(b, list):
            return [x + y for x, y in zip(a, b)]
        return a + b

    add(into, day)


def ts_of(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())


def fetch_day(d: date) -> list[dict] | None:
    """Baja y lee el archivo de un día. None si todavía no existe (404)."""
    TMP.mkdir(parents=True, exist_ok=True)
    f = TMP / f"{d.isoformat()}.json"
    req = urllib.request.Request(URL.format(ts=ts_of(d)), headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=120) as r, f.open("wb") as out:
            while chunk := r.read(1 << 20):
                out.write(chunk)
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            return None
        raise
    try:
        with f.open(encoding="utf-8") as fh:
            return json.load(fh)["matches"]
    finally:
        f.unlink(missing_ok=True)


def build_day(d: date) -> bool:
    out = DAYS / f"{d.isoformat()}.json"
    if out.exists():
        return True
    matches = fetch_day(d)
    if matches is None:
        print(f"{d}: todavía no está publicado")
        return False
    day = summarize_day(matches)
    del matches
    gc.collect()
    day["date"] = d.isoformat()
    DAYS.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(day, separators=(",", ":")), encoding="utf-8")
    print(f"{d}: {day['matches']} partidas de automatch")
    return True


def build_summary(days: list[date], days_dir: Path = DAYS) -> dict:
    acc: dict = {"matches": 0, "modes": {}}
    used = []
    for d in days:
        f = days_dir / f"{d.isoformat()}.json"
        if not f.exists():
            continue
        day = json.loads(f.read_text(encoding="utf-8"))
        day.pop("date", None)
        merge(acc, day)
        used.append(d.isoformat())
    acc["from"] = used[0] if used else None
    acc["to"] = used[-1] if used else None
    acc["days"] = len(used)
    acc["bands"] = [k for k, _, _ in BANDS]
    acc["durStep"] = DUR_STEP
    acc["generatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return acc


def main(argv: list[str]) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=28)
    ap.add_argument("--since", type=str, default=None, help="el día del último parche: la ventana no lo pasa")
    a = ap.parse_args(argv)
    today = datetime.now(timezone.utc).date()
    # El archivo de un día sale a las 06:00 UTC del siguiente: el último seguro es anteayer o ayer.
    last = today - timedelta(days=1)
    window = [last - timedelta(days=i) for i in range(a.days)][::-1]
    if a.since:
        since = date.fromisoformat(a.since)
        window = [d for d in window if d >= since]
    for d in window:
        build_day(d)
        time.sleep(1)
    summary = build_summary(window)
    STATS.mkdir(parents=True, exist_ok=True)
    (STATS / "summary.json").write_text(json.dumps(summary, separators=(",", ":")), encoding="utf-8")
    # Los días que quedaron fuera de la ventana no hacen falta más.
    keep = {d.isoformat() for d in window}
    for f in DAYS.glob("*.json"):
        if f.stem not in keep:
            f.unlink()
    print(f"summary.json: {summary['matches']} partidas, {summary['days']} días ({summary['from']} a {summary['to']})")


if __name__ == "__main__":
    main(sys.argv[1:])
