"""
Las fichas de la etapa 6b de CS2 (2026-11-03): equipos, jugadores y torneos, y las estadísticas de mapas de cada
equipo (partidos jugados y ganados, y rondas ganadas defendiendo, CT, y atacando, T) a partir de las llaves de
Liquipedia (`esports.bracket_matches`).
"""
import datetime


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
