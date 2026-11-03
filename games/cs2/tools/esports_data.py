"""
Los datos de la pestaña Torneos de CS2 (2026-11-03, etapa 6a). Lo corre la Action diaria (`publish-cs2.yml`).

    python games/cs2/tools/esports_data.py

Escribe en `games/cs2/data/esports/`:
- `tournaments.json`: los torneos de nivel S y A de Liquipedia, en curso primero, después los próximos por fecha y los
  6 últimos terminados, cada uno con su ficha (organizador, sede, premio, fechas, equipos) y sus canales de Twitch.
- `vrs.json`: el ranking oficial de Valve (30 del mundial, 20 por región), con el puesto del mes anterior y, de cada
  equipo, el "por qué" (valor de arranque, ajuste cara a cara, factores y sus 5 últimos partidos).
- `teams.json`: los equipos por su página de Liquipedia, con el nombre del logo (`site/public/cs2/t/<logo>.webp`).

Cachea en `games/cs2/raw/esports/` (fuera de git) para pedirle a Liquipedia lo menos posible: la ficha de un torneo en
curso se relee una vez por día, la de uno próximo cada 7 días y la de uno terminado nunca; un logo se baja una vez.
"""
import datetime
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image

from cs2 import DATA, JUEGO, slugify, write_json
from esports import infobox, streams, teams_in, tournaments
from liquipedia import Liquipedia
from vrs import detail, latest_dates, moves, standings

VRS_RAW = "https://raw.githubusercontent.com/ValveSoftware/counter-strike_regional_standings/main/live"
VRS_API = "https://api.github.com/repos/ValveSoftware/counter-strike_regional_standings/contents/live"
TIERS = ("S", "A")
LOGO_H = 64
# Logos nuevos por corrida: el primer día bajan los del ranking y los partidos; el resto, en los días siguientes.
LOGOS_PER_RUN = 80
REGIONS = {"global": 30, "europe": 20, "americas": 20, "asia": 20}


def norm(name: str) -> str:
    """El nombre de un equipo para cruzar el ranking con Liquipedia: "Team Vitality" = "Vitality", "BetBoom Team" =
    "BETBOOM", "G2 Esports" = "G2"."""
    words = [w for w in re.findall(r"[a-z0-9]+", name.lower()) if w not in ("team", "esports", "gaming", "the", "club", "clan", "cs")]
    return "".join(words)


def _days(a: str, b: str) -> int:
    return (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days


def _stale(entry: dict | None, state: str, today: str) -> bool:
    if entry is None:
        return True
    if state == "concluded":
        return False
    return _days(entry["at"], today) >= (1 if state == "ongoing" else 7)


def build_tournaments(lp, raw: Path, today: str) -> tuple[list[dict], dict]:
    """Los torneos S y A con su ficha, y los equipos que aparecen en sus fichas."""
    cache_f = raw / "tournaments.json"
    cache = json.loads(cache_f.read_text(encoding="utf-8")) if cache_f.exists() else {}
    listed = tournaments(lp.parse("Liquipedia:Tournaments"))
    teams: dict = {}
    for t in listed:
        entry = cache.get(t["slug"])
        if _stale(entry, t["state"], today):
            html = lp.parse(t["slug"])
            entry = {"at": today, "info": infobox(html), "streams": streams(html), "teams": teams_in(html)}
            cache[t["slug"]] = entry
        for k, v in entry["teams"].items():
            teams.setdefault(k, v)
    raw.mkdir(parents=True, exist_ok=True)
    cache_f.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    rows = [{**t, **cache[t["slug"]]["info"], "streams": cache[t["slug"]]["streams"]} for t in listed]
    rows = [r for r in rows if r["tier"] in TIERS]
    ongoing = sorted((r for r in rows if r["state"] == "ongoing"), key=lambda r: r["start"] or "")
    upcoming = sorted((r for r in rows if r["state"] == "upcoming"), key=lambda r: r["start"] or "9999")
    done = sorted((r for r in rows if r["state"] == "concluded"), key=lambda r: r["end"] or "", reverse=True)[:6]
    return ongoing + upcoming + done, teams


class GitHub:
    """El repositorio del ranking de Valve: la lista de archivos de un año y el texto de uno."""

    def _get(self, url: str) -> bytes:
        req = urllib.request.Request(url, headers={"User-Agent": "VestigoBot/1.0 (https://vestigo.gg)"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()

    def names(self, year: int) -> list[str]:
        try:
            return [x["name"] for x in json.loads(self._get(f"{VRS_API}/{year}"))]
        except Exception:  # un año que todavía no tiene carpeta
            return []

    def text(self, path: str) -> str:
        return self._get(f"{VRS_RAW}/{path}").decode("utf-8")


def build_vrs(gh, year: int, index: dict[str, str]) -> dict:
    """El ranking del último mes con el movimiento contra el anterior y el "por qué" de cada equipo."""
    # Los dos últimos años: en enero, el mes anterior está en la carpeta del año pasado.
    now, before = latest_dates(gh.names(year) + gh.names(year - 1))
    ynow = now[:4]
    prev_rows = standings(gh.text(f"{before[:4]}/standings_global_{before}.md")) if before else []
    out = {"date": now.replace("_", "-"), "before": before.replace("_", "-") if before else None}
    whys: dict[str, dict] = {}
    for region, n in REGIONS.items():
        rows = standings(gh.text(f"{ynow}/standings_{region}_{now}.md"))[:n]
        if region == "global":
            rows = moves(rows, prev_rows)
        for r in rows:
            if r["detail"] not in whys:
                d = detail(gh.text(f"{ynow}/{r['detail']}"))
                whys[r["detail"]] = {**d, "matches": d["matches"][:5]}
            r["why"] = whys[r["detail"]]
            r["lp"] = index.get(norm(r["team"]))
            del r["detail"]
        out[region] = rows
    return out


def fetch_logos(lp, teams: dict, logos: Path, want: list[str]) -> None:
    """Baja los logos que faltan (los de `want` primero), a WebP de 64 px de alto."""
    logos.mkdir(parents=True, exist_ok=True)
    falta = [k for k in want if teams.get(k, {}).get("logo") and not (logos / f"{slugify(k)}.webp").exists()][:LOGOS_PER_RUN]
    for i in range(0, len(falta), 50):
        lote = falta[i : i + 50]
        titles = "|".join(f"File:{teams[k]['logo']}" for k in lote)
        pages = lp.query(action="query", prop="imageinfo", iiprop="url", titles=titles)["query"]["pages"].values()
        urls = {p["title"][5:].replace(" ", "_"): p["imageinfo"][0]["url"] for p in pages if p.get("imageinfo")}
        for k in lote:
            url = urls.get(teams[k]["logo"].replace(" ", "_"))
            if not url:
                continue
            img = Image.open(io.BytesIO(lp.file(url))).convert("RGBA")
            img = img.resize((max(1, round(img.width * LOGO_H / img.height)), LOGO_H), Image.LANCZOS)
            img.save(logos / f"{slugify(k)}.webp", "WEBP", quality=90, method=4)


def run(lp, gh, root: Path, today: str, year: int, out: Path | None = None, raw: Path | None = None, logos: Path | None = None) -> None:
    out = out or root / "data" / "esports"
    raw = raw or root / "raw" / "esports"
    logos = logos or root / "public" / "cs2" / "t"
    tours, teams = build_tournaments(lp, raw, today)
    playing = teams_in(lp.parse("Liquipedia:Matches"))
    teams = {**teams, **playing}
    index = {}
    for k, v in teams.items():
        index.setdefault(norm(v["name"]), k)
        index.setdefault(norm(k.replace("_", " ")), k)
    vrs = build_vrs(gh, year, index)
    ranked = [r["lp"] for reg in REGIONS for r in vrs[reg] if r["lp"]]
    fetch_logos(lp, teams, logos, list(dict.fromkeys(ranked + list(playing) + list(teams))))
    team_rows = {k: {"name": v["name"], "logo": slugify(k) if (logos / f"{slugify(k)}.webp").exists() else None} for k, v in sorted(teams.items())}
    write_json(out / "tournaments.json", tours)
    write_json(out / "vrs.json", vrs)
    write_json(out / "teams.json", team_rows)


def main() -> None:
    today = datetime.datetime.now(datetime.UTC).date()
    run(Liquipedia(), GitHub(), JUEGO, today.isoformat(), today.year,
        out=DATA / "esports", raw=JUEGO / "raw" / "esports", logos=JUEGO.parents[1] / "site" / "public" / "cs2" / "t")
    print(f"listo: {sum(1 for _ in (JUEGO.parents[1] / 'site' / 'public' / 'cs2' / 't').glob('*.webp'))} logos")


if __name__ == "__main__":
    sys.exit(main())
