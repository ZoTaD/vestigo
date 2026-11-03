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
    for ch in re.findall(r"twitch\.tv/([A-Za-z0-9_]+)", html):
        if ch.lower() not in out:
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
