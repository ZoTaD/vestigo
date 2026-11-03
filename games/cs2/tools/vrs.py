"""
Los lectores del ranking oficial de Valve (Valve Regional Standings, `github.com/ValveSoftware/
counter-strike_regional_standings`) para la pestaña Torneos (2026-11-03, etapa 6): la tabla de un mes, el detalle de
un equipo (por qué tiene esos puntos) y el movimiento contra el mes anterior. Funciones puras sobre el markdown.
"""
import re

ROW = re.compile(r"^\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*\[details\]\(([^)]+)\)", re.M)


def standings(md: str) -> list[dict]:
    """Las filas de `standings_<region>_<fecha>.md`: puesto, puntos, equipo, plantel y la ruta de su detalle."""
    return [
        {"rank": int(r), "pts": int(p), "team": t, "roster": [x.strip() for x in ro.split(",")], "detail": d}
        for r, p, t, ro, d in ROW.findall(md)
    ]


def moves(now: list[dict], before: list[dict]) -> list[dict]:
    """Cada fila con `prev`: su puesto del mes anterior, por nombre de equipo (`None` si no estaba)."""
    prev = {r["team"]: r["rank"] for r in before}
    return [{**r, "prev": prev.get(r["team"])} for r in now]


FACTORS = {"Bounty Offered": "bounty_offered", "Bounty Collected": "bounty_collected", "Opponent Network": "network", "LAN Wins": "lan"}


def detail(md: str) -> dict:
    """El detalle de un equipo: valor de arranque, ajuste cara a cara, los cuatro factores y sus partidos (del más
    nuevo al más viejo)."""
    m = re.search(r"Starting Rank Value \(([\d.]+)\) \+ Head To Head Adjustments \((-?[\d.]+)\)", md)
    factors = {v: float(x) for k, v in FACTORS.items() for x in re.findall(rf"^- {k}: ([\d.]+)", md, flags=re.M)[:1]}
    matches = [
        {"date": d, "opp": o.strip(), "won": wl == "W"}
        for d, o, wl in re.findall(r"^\|\s*\d+\s*\|\s*\d+\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]+?)\s*\|\s*([WL])\s*\|", md, flags=re.M)
    ]
    matches.sort(key=lambda x: x["date"], reverse=True)
    return {"start": float(m.group(1)) if m else None, "h2h": float(m.group(2)) if m else None, "factors": factors, "matches": matches}


def latest_dates(names: list[str]) -> tuple[str, str | None]:
    """La fecha del último ranking mundial y la del anterior, de los nombres de archivo."""
    ds = sorted({m.group(1) for n in names if (m := re.fullmatch(r"standings_global_(\d{4}_\d{2}_\d{2})\.md", n))}, reverse=True)
    return ds[0], (ds[1] if len(ds) > 1 else None)
