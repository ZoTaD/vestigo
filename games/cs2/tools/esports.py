"""
Los lectores del HTML que devuelve la API de Liquipedia para la pestaña Torneos (2026-11-03, etapa 6). Funciones puras:
reciben el HTML de `action=parse` y devuelven datos; no piden nada. El HTML es dato no confiable: sólo se lee con
expresiones regulares.
"""
import html as htmllib
import re

CS = "/counterstrike/"


def _text(s: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def tournaments(html: str) -> list[dict]:
    """La lista de `Liquipedia:Tournaments`: entradas `slug|Nombre|iconfile=…` bajo Upcoming, Ongoing y Concluded."""
    out, state = [], None
    for m in re.finditer(r"\b(Upcoming|Ongoing|Concluded)\b|(\S+)\|([^|]+)\|iconfile", _text(html)):
        if m.group(1):
            state = m.group(1).lower()
        elif state:
            out.append({"slug": m.group(2), "name": m.group(3).strip(), "state": state})
    return out


FIELDS = {"Series": "series", "Organizer": "organizer", "Type": "type", "Location": "location", "Venue": "venue",
          "Prize Pool": "prize", "Start Date": "start", "End Date": "end", "Teams": "teams", "Liquipedia Tier": "tier"}


def infobox(html: str) -> dict:
    """Los datos de la ficha de un torneo. Lo que no está queda en `None`."""
    out = dict.fromkeys(FIELDS.values())
    for k, v in re.findall(r'infobox-cell-2 infobox-description">([^<]+?):</div>\s*<div[^>]*>(.*?)</div>', html, flags=re.S):
        key = FIELDS.get(k.strip())
        if not key or out[key] is not None:
            continue
        val = _text(v)
        if key == "prize":
            n = re.sub(r"[^\d]", "", val.split("USD")[0])
            out[key] = int(n) if n else None
        elif key == "teams":
            m = re.search(r"\d+", val)
            out[key] = int(m.group()) if m else None
        elif key == "tier":
            m = re.match(r"([SABCD])-Tier", val)
            out[key] = m.group(1) if m else None
        elif key in ("start", "end"):
            m = re.search(r"\d{4}-\d{2}-\d{2}", val)
            out[key] = m.group() if m else None
        else:
            out[key] = val or None
    return out


def streams(html: str) -> list[str]:
    """Los canales de Twitch que nombra la ficha, en minúsculas, sin repetir, en orden."""
    out = []
    # Rutas de Twitch que no son canales (`twitch.tv/videos/123`, `/directory/...`): no se pueden embeber.
    reserved = {"videos", "directory", "collections", "p", "settings", "downloads", "jobs", "subscriptions", "search"}
    for ch in re.findall(r"twitch\.tv/([A-Za-z0-9_]+)", html):
        if ch.lower() not in out and ch.lower() not in reserved:
            out.append(ch.lower())
    return out


def _logo_file(src: str) -> str | None:
    """El archivo de una imagen de Liquipedia: de la miniatura (`/thumb/a/ab/Archivo.png/44px-…`) o directo."""
    m = re.search(r"/thumb/[^/]+/[^/]+/([^/]+)/", src) or re.search(r"/images/[^/]+/[^/]+/([^/\"?]+)$", src)
    return htmllib.unescape(m.group(1)) if m else None


def teams_in(html: str) -> dict[str, dict]:
    """Los equipos que aparecen, por su página en Liquipedia: nombre y archivo del logo (el de modo claro o el único)."""
    out: dict[str, dict] = {}
    icon = r'<span class="team-template-image-icon(?: team-template-lightmode)?"><a href="' + CS + r'([^"#]+)" title="([^"]+)"><img[^>]*?src="([^"]+)"'
    for slug, name, src in re.findall(icon, html):
        if "/" in slug:
            continue
        out.setdefault(slug, {"name": htmllib.unescape(name), "logo": _logo_file(src)})
    for slug, name in re.findall(r'class="name"[^>]*><a href="' + CS + r'([^"#]+)" title="([^"]+)"', html):
        if "/" not in slug:
            out.setdefault(slug, {"name": htmllib.unescape(name), "logo": None})
    return out


# --- Etapa 6b: fichas de equipo y jugador, resultados y llaves -------------------------------------------------------

MONTHS = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], 1)}


def _cells(html: str) -> dict[str, str]:
    """Las celdas de la ficha (infobox), por su etiqueta, con el HTML adentro."""
    return {k.strip(): v for k, v in re.findall(r'infobox-cell-2 infobox-description">([^<]+?):</div>\s*<div[^>]*>(.*?)</div>', html, flags=re.S)}


def _money(s: str | None) -> int | None:
    n = re.sub(r"[^\d]", "", (s or "").split(".")[0])
    return int(n) if n else None


def clean_place(p: str) -> str:
    """Un puesto como texto común: "5th&#160;-&#160;6th" → "5th - 6th"."""
    return htmllib.unescape(p).replace("\xa0", " ").strip()


def clean_location(loc: str | None, region: str | None) -> str | None:
    """La sede sin la región que Liquipedia le pega al final ("Germany Europe" → "Germany")."""
    if loc and region and loc.endswith(" " + region):
        loc = loc[: -len(region) - 1]
    return loc or None


def _flag(s: str) -> str | None:
    """El código del país de una bandera de Liquipedia: el archivo se llama `Hu_hd.png`."""
    m = re.search(r'class="flag">(?:<a[^>]*>)?<img[^>]*src="[^"]*/([A-Za-z]{2})_hd\.png', s)
    return m.group(1).lower() if m else None


def team_page(html: str) -> dict:
    """La ficha de un equipo: sede, región, líder, entrenadores, premios, fundación y el plantel activo."""
    c = _cells(html)
    created = re.search(r"\d{4}", _text(c.get("Created", "")))
    roster = []
    seg = html[html.find('id="Active"') :]
    seg = seg[: seg.find("</table>")]
    for row in seg.split("table2&#95;&#95;row--body")[1:]:
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S)
        if not tds:
            continue
        # Un recién llegado puede no tener página todavía: queda con su apodo y sin enlace.
        pid = re.search(r'<a href="/counterstrike/([^"#?]+)" title="[^"]+">([^<]+)</a>', tds[0])
        nick = htmllib.unescape(pid.group(2)) if pid else _text(tds[0]).replace(" ", " ").strip()
        if not nick:
            continue
        pos = _text(tds[2]) if len(tds) > 2 else ""
        roster.append({
            "lp": pid.group(1) if pid else None, "id": nick, "name": _text(tds[1]) if len(tds) > 1 else "",
            "flag": _flag(row), "since": (re.search(r"\d{4}-\d{2}-\d{2}", row) or [None])[0],
            "captain": "fa-crown" in row, "role": "coach" if "coach" in pos.lower() else "player",
        })
    region = _text(c.get("Region", "")) or None
    # El logo de la ficha: el de modo claro si hay dos (el sitio es claro), si no el único.
    logo = re.search(r'class="infobox-image lightmode">.*?<img[^>]*?src="([^"]+)"', html, flags=re.S) or re.search(
        r'class="infobox-image(?: allmode)?\s*">.*?<img[^>]*?src="([^"]+)"', html, flags=re.S)
    return {
        "logo_file": _logo_file(logo.group(1)) if logo else None,
        "location": clean_location(_text(c.get("Location", "")), region), "region": region,
        "coaches": [_text(x) for x in re.findall(r"<a [^>]*>([^<]+)</a>", c.get("Coaches", ""))],
        "igl": _text(c.get("In-Game Leader", "")) or None, "winnings": _money(_text(c.get("Approx. Total Winnings", ""))),
        "created": created.group() if created else None, "roster": roster,
    }


def team_results(html: str) -> list[dict]:
    """Los torneos S y A que jugó un equipo (su página `/Results`): fecha, puesto, torneo y premio."""
    out = []
    for row in html.split('<tr class="table2&#95;&#95;row--body">')[1:]:
        row = row.split("</tr>")[0]
        date = re.search(r"<td[^>]*>(\d{4}-\d{2}-\d{2})</td>", row)
        place = re.search(r'placement-text">([^<]+)<', row)
        tier = re.search(r'title="([SA])-Tier Tournaments"', row)
        tour = re.search(r'data-sort-value="([^"]+)"><span class="league-icon-small-image[^"]*"><a href="/counterstrike/([^"#]+)"', row)
        if not (date and place and tier and tour):
            continue
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S)
        out.append({"date": date.group(1), "place": clean_place(place.group(1)), "tier": tier.group(1), "tour": htmllib.unescape(tour.group(1)),
                    "tour_lp": tour.group(2), "prize": _money(_text(tds[-1]))})
    return out


def player_page(html: str) -> dict:
    """La ficha de un jugador: nombre (el romanizado si hay), bandera, nacimiento, roles, equipo y premios."""
    c = _cells(html)
    born = re.search(r"(\w+) (\d{1,2}), (\d{4})", _text(c.get("Born", "")))
    team = re.search(r'<a href="/counterstrike/([^"#]+)"', c.get("Team", ""))
    return {
        "name": _text(c.get("Romanized Name") or c.get("Name", "")) or None, "flag": _flag(c.get("Nationality", "")),
        "born": f"{born.group(3)}-{MONTHS.get(born.group(1), 1):02d}-{int(born.group(2)):02d}" if born else None,
        "roles": [_text(x) for x in re.findall(r"<a [^>]*>([^<]+)</a>", c.get("Roles", ""))],
        "team_lp": team.group(1) if team else None, "winnings": _money(_text(c.get("Approx. Total Winnings", ""))),
    }


def _halves(block: str) -> list[list]:
    return [[side, int(n)] for side, n in re.findall(r'brkts-cs-score-color-(ct|t)">(\d+)<', block)]


def bracket_matches(html: str) -> list[dict]:
    """Los partidos terminados de las llaves de un torneo, cada mapa con su resultado y las rondas de cada mitad (CT o
    T). Un mapa sin jugar no cuenta; uno ganado por abandono va sin números, con `ff` del lado que ganó."""
    out = []
    for p in html.split("brkts-popup brkts-popup-container")[1:]:
        if 'data-finished="finished"' not in p:
            continue
        # Cada lado por separado: un equipo sin página en Liquipedia no tiene enlace, y una lista de enlaces de los dos
        # lados juntos le daría al de la izquierda el enlace del de la derecha.
        head = p.split('class="brkts-popup-body"')[0]
        blocks = head.split('class="match-info-header-opponent')[1:3]
        sides, names = [], []
        for blk in blocks:
            lnk = re.search(r'<span class="name[^"]*"[^>]*><a href="/counterstrike/([^"#]+)"', blk)
            nm = re.search(r'<div class="team-name">([^<]+)</div>', blk)
            sides.append(lnk.group(1) if lnk else None)
            if nm:
                names.append(nm.group(1))
        ts = re.search(r'data-timestamp="(\d+)"', p)
        bo = re.search(r"\(Bo(\d+)\)", p)
        maps = []
        body = p.split('class="brkts-popup-body"')[1] if 'class="brkts-popup-body"' in p else ""
        for row in body.split('brkts-popup-body-grid-row"')[1:]:
            parts = row.split('class="brkts-popup-spaced"')
            mp = re.search(r'title="([^"]+)">[^<]+</a></div>', row)
            if len(parts) < 4 or not mp:
                continue
            sa = re.search(r'main-score">([^<]*)<', parts[1])
            sb = re.search(r'main-score">([^<]*)<', parts[3])
            va, vb = (sa.group(1) if sa else ""), (sb.group(1) if sb else "")
            if va.isdigit() and vb.isdigit():
                maps.append({"map": mp.group(1), "a": int(va), "b": int(vb), "ha": _halves(parts[1]), "hb": _halves(parts[3])})
            elif "W" in (va, vb):
                maps.append({"map": mp.group(1), "a": None, "b": None, "ha": [], "hb": [], "ff": "a" if va == "W" else "b"})
        if len(names) == 2 and maps:
            out.append({"t": int(ts.group(1)) if ts else 0, "a": htmllib.unescape(names[0]), "b": htmllib.unescape(names[1]),
                        "a_lp": sides[0] if len(sides) > 0 else None, "b_lp": sides[1] if len(sides) > 1 else None,
                        "bo": int(bo.group(1)) if bo else None, "maps": maps})
    return out
