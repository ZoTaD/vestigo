"""
Las fichas de la etapa 6b de CS2 (2026-11-03): equipos, jugadores y torneos, y las estadísticas de mapas de cada
equipo (partidos jugados y ganados, y rondas ganadas defendiendo, CT, y atacando, T) a partir de las llaves de
Liquipedia (`esports.bracket_matches`).
"""
import datetime
import json
from pathlib import Path

from cs2 import slugify, write_json
from esports import bracket_matches, infobox, player_page, streams, team_page, team_results
from vrs import standings

# Días hasta releer cada cosa; `None`: un torneo terminado no se relee.
STALE = {"team": 7, "results": 7, "tour_live": 1, "tour": None, "player": 30}
ORDER = {"team": 0, "results": 1}
MONTHS_BACK = 182


def _ts(day: str) -> int:
    return int(datetime.datetime.fromisoformat(day).replace(tzinfo=datetime.UTC).timestamp())


def _side(m: dict, team_lp: str) -> str | None:
    """"a" o "b" según de qué lado juega el equipo; `None` si no juega."""
    return "a" if m.get("a_lp") == team_lp else "b" if m.get("b_lp") == team_lp else None


def map_stats(matches: list[dict], team_lp: str, since: str) -> list[dict]:
    """Por mapa, desde `since` (YYYY-MM-DD): jugados, ganados y rondas de CT y de T (ganadas y jugadas). Las rondas de
    cada mitad se cuentan contra la mitad del rival en el mismo orden. Un mapa por abandono no cuenta."""
    t0 = _ts(since)
    out: dict[str, dict] = {}
    for m in matches:
        me = _side(m, team_lp)
        if not me or m["t"] < t0:
            continue
        them = "b" if me == "a" else "a"
        for mp in m["maps"]:
            if mp.get(me) is None:
                continue
            s = out.setdefault(mp["map"], {"map": mp["map"], "played": 0, "won": 0, "ct_w": 0, "ct_p": 0, "t_w": 0, "t_p": 0})
            s["played"] += 1
            s["won"] += mp[me] > mp[them]
            for (side, won), (_, lost) in zip(mp["h" + me], mp["h" + them]):
                s[f"{side}_w"] += won
                s[f"{side}_p"] += won + lost
    return sorted(out.values(), key=lambda s: (-s["played"], -s["won"], s["map"]))


def team_matches(matches: list[dict], team_lp: str) -> list[dict]:
    """Los partidos de un equipo vistos desde él, del más nuevo al más viejo: rival, torneo, si ganó la serie y cada
    mapa con su resultado (un abandono, `ff`: True si lo ganó el equipo)."""
    out = []
    for m in matches:
        me = _side(m, team_lp)
        if not me:
            continue
        them = "b" if me == "a" else "a"
        maps, w, lo = [], 0, 0
        for mp in m["maps"]:
            if mp.get(me) is None:
                won = mp.get("ff") == me
                maps.append({"map": mp["map"], "us": None, "them": None, "ff": won})
            else:
                won = mp[me] > mp[them]
                maps.append({"map": mp["map"], "us": mp[me], "them": mp[them]})
            w, lo = w + won, lo + (not won)
        out.append({"t": m["t"], "opp": m[them], "opp_lp": m.get(f"{them}_lp"), "tour": m.get("tour"), "tour_lp": m.get("tour_lp"),
                    "won": None if w == lo else w > lo, "maps": maps})
    return sorted(out, key=lambda x: -x["t"])


# --- El armado: qué releer (con tope) y las fichas ---------------------------------------------------------------------


def _load(f: Path) -> dict | None:
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None


def _days(a: str, b: str) -> int:
    return (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days


def _due(at: str | None, kind: str, today: str) -> bool:
    if at is None:
        return True
    limit = STALE[kind]
    return limit is not None and _days(at, today) >= limit


def vrs_history(gh, raw: Path, year: int) -> dict[str, list[dict]]:
    """Cada equipo del mundial con su puesto y puntos en cada ranking desde 2024. Los archivos viejos quedan en `raw`."""
    raw.mkdir(parents=True, exist_ok=True)
    out: dict[str, list[dict]] = {}
    names = sorted(n for y in range(2024, year + 1) for n in gh.names(y) if n.startswith("standings_global_"))
    for n in names:
        f = raw / n
        if not f.exists():
            f.write_text(gh.text(f"{n[17:21]}/{n}"), encoding="utf-8")
        date = n[17:27].replace("_", "-")
        for r in standings(f.read_text(encoding="utf-8")):
            out.setdefault(r["team"], []).append({"date": date, "rank": r["rank"], "pts": r["pts"]})
    return out


def _ranked(vrs: dict) -> list[dict]:
    """Los equipos del ranking sin repetir: el mundial primero (con su puesto) y después los de cada región."""
    out: dict[str, dict] = {}
    for region in ("global", "europe", "americas", "asia"):
        for r in vrs.get(region, []):
            if r["team"] not in out:
                out[r["team"]] = {**r, "region": None if region == "global" else region}
    return list(out.values())


def build(lp, gh, out: Path, raw: Path, today: str, vrs: dict, teams: dict, tours_now: list[dict], budget: int = 16) -> None:
    """Relee de Liquipedia lo vencido (equipos, sus resultados, torneos de los últimos 6 meses y jugadores de los 30 del
    mundial), hasta `budget` lecturas, y arma una ficha por equipo, jugador y torneo, más `index.json`."""
    since = (datetime.date.fromisoformat(today) - datetime.timedelta(days=MONTHS_BACK)).isoformat()
    ranked = _ranked(vrs)
    tslug = lambda r: slugify(r["lp"] or r["team"])  # noqa: E731
    left = [budget]

    def fetch(page: str) -> str | None:
        if left[0] <= 0:
            return None
        left[0] -= 1
        try:
            return lp.parse(page)
        except Exception as e:  # noqa: BLE001 - una lectura que falla se reintenta mañana
            print(f"::warning::sin {page}: {e}")
            return None

    # 1. Equipos y sus resultados: lo nunca leído primero, después lo más viejo.
    files = {r["team"]: out / "teams" / f"{tslug(r)}.json" for r in ranked}
    data = {r["team"]: _load(files[r["team"]]) or {} for r in ranked}
    jobs = []
    for r in ranked:
        if not r["lp"]:
            continue
        d = data[r["team"]]
        if _due(d.get("at"), "team", today):
            jobs.append((d.get("at") or "", ORDER["team"], "team", r))
        if _due(d.get("results_at"), "results", today):
            jobs.append((d.get("results_at") or "", ORDER["results"], "results", r))
    for _, _, kind, r in sorted(jobs, key=lambda j: (j[0], j[1])):
        d = data[r["team"]]
        html = fetch(r["lp"] if kind == "team" else f"{r['lp']}/Results")
        if html is None:
            continue
        if kind == "team":
            d.update(team_page(html), at=today)
        else:
            d.update(results=team_results(html), results_at=today)

    # 2. Torneos de los últimos 6 meses (de los resultados de los equipos) y los que se juegan ahora.
    live = {t["slug"]: t for t in tours_now}
    names: dict[str, str] = {t["slug"]: t["name"] for t in tours_now if t["state"] != "upcoming"}
    for d in data.values():
        for res in d.get("results", []):
            if res["date"] >= since:
                names.setdefault(res["tour_lp"], res["tour"])
    tours = {}
    for tlp, name in names.items():
        f = out / "tours" / f"{slugify(tlp)}.json"
        t = _load(f)
        state = live.get(tlp, {}).get("state", "concluded")
        if t is None or _due(t.get("at"), "tour_live" if state == "ongoing" else "tour", today):
            html = fetch(tlp)
            if html is not None:
                ms = [{**m, "tour": name, "tour_lp": tlp} for m in bracket_matches(html)]
                t = {"slug": slugify(tlp), "lp": tlp, "name": name, **infobox(html), "streams": streams(html),
                     "teams": sorted({x for m in ms for x in (m["a_lp"], m["b_lp"]) if x}), "matches": ms, "at": today, "state": state}
                write_json(f, t)
        if t:
            tours[tlp] = t
    every = [m for t in tours.values() for m in t["matches"]]

    # 3. Jugadores de los planteles de los 30 del mundial.
    players = {}
    for r in vrs.get("global", []):
        for p in data.get(r["team"], {}).get("roster", []):
            if p["role"] != "player":
                continue
            f = out / "players" / f"{slugify(p['lp'])}.json"
            pd = _load(f)
            if pd is None or _due(pd.get("at"), "player", today):
                html = fetch(p["lp"])
                if html is not None:
                    info = player_page(html)
                    pd = {"slug": slugify(p["lp"]), "lp": p["lp"], "id": p["id"], **info,
                          "team_slug": slugify(info["team_lp"]) if info["team_lp"] else None, "at": today}
                    write_json(f, pd)
            if pd:
                players[pd["slug"]] = pd

    # 4. Las fichas de los equipos (sin red) y el índice.
    hist = vrs_history(gh, raw / "vrs", int(today[:4]))
    flags = {p["flag"] for p in players.values() if p.get("flag")}
    index_teams = []
    for r in ranked:
        d = data[r["team"]]
        roster = d.get("roster", [])
        flags |= {p["flag"] for p in roster if p.get("flag")}
        known = teams.get(r["lp"], {}) if r["lp"] else {}
        team = {
            "slug": tslug(r), "lp": r["lp"], "name": known.get("name", r["team"]), "logo": known.get("logo"),
            "vrs": {"rank": r["rank"] if r["region"] is None else None, "pts": r["pts"], "region": r["region"], "prev": r.get("prev"),
                    "history": hist.get(r["team"], [])},
            **{k: d.get(k) for k in ("location", "igl", "coaches", "winnings", "created")},
            "roster": roster, "results": d.get("results", [])[:15],
            "maps": map_stats(every, r["lp"], since) if r["lp"] else [],
            "matches": team_matches(every, r["lp"])[:20] if r["lp"] else [],
            "at": d.get("at"), "results_at": d.get("results_at"),
        }
        write_json(files[r["team"]], team)
        index_teams.append({"slug": team["slug"], "name": team["name"], "logo": team["logo"], "rank": team["vrs"]["rank"], "region": r["region"], "pts": r["pts"]})
    write_json(out / "index.json", {
        "teams": index_teams,
        "players": sorted(({"slug": p["slug"], "id": p["id"], "team_slug": p.get("team_slug")} for p in players.values()), key=lambda p: p["slug"]),
        "tours": sorted(({"slug": t["slug"], "name": t["name"], "state": t["state"], "start": t.get("start")} for t in tours.values()),
                        key=lambda t: t["start"] or "", reverse=True),
        "flags": sorted(flags),
    })


# --- Banderas ------------------------------------------------------------------------------------------------------

# `flag-icons` (MIT), la versión fijada: un SVG por país, por su código de dos letras.
FLAGS_URL = "https://cdn.jsdelivr.net/npm/flag-icons@7.6.0/flags/4x3/{}.svg"


def _get(url: str) -> bytes:
    import urllib.request

    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "VestigoBot/1.0 (https://vestigo.gg)"}), timeout=60) as r:
        return r.read()


def fetch_flags(codes, out: Path, get=_get) -> None:
    """Baja a `out/<código>.svg` las banderas que faltan. Sólo códigos de dos letras (lo que sale de Liquipedia es dato
    no confiable: nada de rutas)."""
    out.mkdir(parents=True, exist_ok=True)
    for c in sorted(set(codes)):
        if not (len(c) == 2 and c.isalpha() and c.islower()) or (out / f"{c}.svg").exists():
            continue
        try:
            (out / f"{c}.svg").write_bytes(get(FLAGS_URL.format(c)))
        except Exception as e:  # noqa: BLE001 - sin bandera queda el código en texto
            print(f"::warning::sin la bandera {c}: {e}")
