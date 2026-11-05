"""
El ranking de Company of Heroes 3 por dentro (2026-11-05), de los datos abiertos de coh3stats.com (piden crédito, que va
al pie de la página): una foto diaria de cada ranking de automatch, por modo y facción,
`https://storage.coh3stats.com/leaderboards/{ts}/{ts}_{modo}_{facción}.json` (16 archivos, ~40 MB entre todos).

    python games/coh3/tools/ladder.py [--day 2026-11-04]

Se baja un archivo por vez, se resume y se suelta. Sale `games/coh3/stats/ladder.json`, lo que lee la pestaña Rangos:
por modo y facción, cuántos jugadores tienen rango, cuántos jugaron en los últimos 7 y 28 días, cuántos hay en cada
liga (`ranklevel` de Relic: 0 sin rango, 1–15 de Latón 3 a Oro 1, 16–20 Retador 5 a 1, que son los primeros 50, 25,
10, 5 y el 1.º), el ELO en tramos de 50 y los países; y por modo, los jugadores distintos y sus países.
"""
import argparse
import gc
import json
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI.parent / "stats" / "ladder.json"
URL = "https://storage.coh3stats.com/leaderboards/{ts}/{ts}_{modo}_{faccion}.json"
UA = "Mozilla/5.0 (compatible; vestigo-data)"
MODES = ["1v1", "2v2", "3v3", "4v4"]
FACTIONS = ["american", "british", "german", "dak"]
LEVELS = 21  # 0 (sin rango) a 20 (el 1.º)
ELO_START, ELO_STEP, ELO_BINS = 400, 50, 40  # de 400 a 2.400; los extremos juntan lo de afuera
TOP_COUNTRIES = 25
DIA = 86400


def summarize(entries: list[dict], now: int) -> dict:
    """Resume un ranking (un modo y una facción). `now` = el sello de la foto, para contar los activos."""
    lv = [0] * LEVELS
    elo = [0] * ELO_BINS
    paises: Counter = Counter()
    act7 = act28 = games = 0
    for e in entries:
        lv[max(0, min(LEVELS - 1, int(e.get("ranklevel") or 0)))] += 1
        r = int(e.get("rating") or 0)
        elo[max(0, min(ELO_BINS - 1, (r - ELO_START) // ELO_STEP))] += 1
        games += int(e.get("wins") or 0) + int(e.get("losses") or 0)
        ultima = int(e.get("lastmatchdate") or 0)
        act7 += ultima >= now - 7 * DIA
        act28 += ultima >= now - 28 * DIA
        for m in e.get("members") or []:
            paises[(m.get("country") or "").lower() or "?"] += 1
    return {"n": len(entries), "active7": act7, "active28": act28, "games": games, "lv": lv,
            "elo": elo, "countries": paises.most_common(TOP_COUNTRIES)}


def ts_of(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())


def fetch(ts: int, modo: str, faccion: str) -> dict | None:
    url = URL.format(ts=ts, modo=modo, faccion=faccion)
    for intento in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(5 * (intento + 1))
        except (urllib.error.URLError, TimeoutError):
            time.sleep(5 * (intento + 1))
    return None


def build(d: date) -> dict | None:
    ts = ts_of(d)
    out: dict = {"day": d.isoformat(), "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "eloStart": ELO_START, "eloStep": ELO_STEP, "modes": {}}
    for modo in MODES:
        perfiles: set = set()
        paises: dict = {}
        facs = {}
        for f in FACTIONS:
            datos = fetch(ts, modo, f)
            if datos is None:
                print(f"  falta {modo} {f} del {d}")
                return None
            entradas = datos.get("leaderboards") or []
            now = int(datos.get("timeStamp") or ts + DIA)
            facs[f] = summarize(entradas, now)
            for e in entradas:
                for m in e.get("members") or []:
                    pid = m.get("profile_id")
                    if pid is not None and pid not in perfiles:
                        perfiles.add(pid)
                        c = (m.get("country") or "").lower() or "?"
                        paises[c] = paises.get(c, 0) + 1
            del datos, entradas
            gc.collect()
        out["modes"][modo] = {"factions": facs, "unique": len(perfiles),
                              "countries": sorted(paises.items(), key=lambda x: (-x[1], x[0]))[:TOP_COUNTRIES]}
        print(f"  {modo}: {len(perfiles)} jugadores")
    return out


def main(argv: list[str]) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", help="día de la foto (por defecto, ayer en UTC; si no está, anteayer)")
    a = ap.parse_args(argv)
    hoy = datetime.now(timezone.utc).date()
    dias = [date.fromisoformat(a.day)] if a.day else [hoy - timedelta(days=1), hoy - timedelta(days=2)]
    for d in dias:
        res = build(d)
        if res:
            SALIDA.parent.mkdir(parents=True, exist_ok=True)
            SALIDA.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            print(f"ladder.json del {d}")
            return
    print("no hay foto del ranking; queda la anterior")


if __name__ == "__main__":
    main(sys.argv[1:])
