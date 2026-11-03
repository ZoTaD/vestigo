"""
Los parches de CS2 para la pestaña Parches (2026-11-03, etapa 5): los anuncios de Steam (`ISteamNews/GetNewsForApp`,
público y sin clave) partidos en ediciones.

    python games/cs2/tools/patches.py

Dos clases de anuncio:
- **Parche** ("Counter-Strike 2 Update", "Release Notes for 6/6/2023"): notas en secciones (`[ MAPS ]`, `[ GAMEPLAY ]`),
  cada línea marcada como nuevo, cambio o arreglo, con los mapas, armas, cajas y colecciones que nombra.
- **Lanzamiento** (Rush Hour, una operación, un Major): texto con títulos, imágenes y viñetas, en orden.

Escribe `data/patches/index.json` (la lista, del más nuevo al más viejo) y `data/patches/e/<slug>.json` (una edición).
El slug de un parche es su fecha (`2026-10-28`; si hay dos el mismo día, el más nuevo lleva `-2`) y el de un
lanzamiento, su título. Lo de antes de CS2 (el Limited Test arrancó el 22/3/2023) queda afuera.
Lo bajado es dato no confiable: se lee como texto y se guarda como JSON, nunca se ejecuta.
"""
import datetime
import json
import re
import sys
import urllib.parse
import urllib.request

from cs2 import DATA, slugify, write_json

APP = 730
FEED = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=300&maxlength=0&feeds=steam_community_announcements"
# El anuncio del Limited Test de CS2: lo anterior es CS:GO.
DESDE = datetime.date(2023, 3, 22)
CLAN = "https://clan.fastly.steamstatic.com/images"

MAPS = ["Dust II", "Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Vertigo", "Overpass", "Train", "Office", "Italy", "Agency", "Cache", "Golden", "Palacio", "Basalt", "Edin", "Thera", "Mills", "Memento", "Assembly", "Grail", "Jura", "Sanctum", "Poseidon", "Brewery", "Dogtown", "Rooftop", "Transit", "Warden", "Stronghold", "Pool Day", "Shoots", "Hostage", "Arch", "Dust", "Lake", "Shortdust", "Baggage"]
WEAPONS = ["AK-47", "M4A4", "M4A1-S", "AWP", "Desert Eagle", "USP-S", "Glock-18", "P250", "Five-SeveN", "Tec-9", "CZ75-Auto", "R8 Revolver", "Dual Berettas", "P2000", "Zeus x27", "MP9", "MAC-10", "MP7", "MP5-SD", "UMP-45", "P90", "PP-Bizon", "Galil AR", "FAMAS", "SG 553", "AUG", "SSG 08", "SCAR-20", "G3SG1", "Nova", "XM1014", "MAG-7", "Sawed-Off", "M249", "Negev"]
# Un encabezado de sección: "[ MAPS ]" o "[ Premier ]" (con espacios adentro) o "[PARIS 2023 MAJOR]" (en mayúsculas),
# con o sin la barra que Steam le pone adelante.
HEADER = re.compile(r"\\?\[ (.+?) \\?\]|\\?\[([A-Z0-9][A-Z0-9 &'/.:\-]*)\\?\]")
# Una viñeta escrita a mano en las notas viejas: "- Fixed…", "– With…", "• …".
DASH = re.compile(r"^[-–•]\s+")
# Un nombre del catálogo que las notas usan como frase común ("a Limited Edition Item"): no se enlaza.
GENERIC = {"Limited Edition Item"}


def inline(s: str) -> str:
    """El texto de una línea sin bbcode de formato ni enlaces (queda el texto del enlace)."""
    s = re.sub(r"\[url=[^\]]*\]|\[/url\]|\[/?(b|i|u|strike|spoiler|code|h\d)\]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def direction(text: str) -> str:
    """Nuevo, cambio o arreglo, por cómo arranca la línea (y un "fix" en el medio también es arreglo)."""
    low = text.lower()
    if re.match(r"(fixed|fix |resolved|addressed)", low) or re.search(r"\bfix(ed|es)?\b", low):
        return "fix"
    if re.match(r"(added|adding|new |introduc|now available|launched)", low):
        return "new"
    return "mid"


def find_refs(text: str, named: dict) -> list:
    """Lo que nombra la línea, en el orden en que aparece: cajas y colecciones de `named`, mapas y armas."""
    hits = []
    for name, (kind, slug, img) in named.items():
        if name in GENERIC:
            continue
        i = text.find(name)
        if i >= 0:
            hits.append((i, {"kind": kind, "name": name, "slug": slug, "img": img}))
    for kind, names in (("map", MAPS), ("weapon", WEAPONS)):
        for n in names:
            m = re.search(rf"(?<![\w-]){re.escape(n)}(?![\w-])", text)
            if m:
                hits.append((m.start(), {"kind": kind, "name": n}))
    hits.sort(key=lambda h: h[0])
    out, seen = [], set()
    for _, r in hits:
        # "Dust" dentro de "Dust II" no cuenta dos veces.
        if any(r["name"] in s and r["name"] != s for s in (h["name"] for _, h in hits)):
            continue
        if r["name"] not in seen:
            seen.add(r["name"])
            out.append(r)
    return out


def parse_notes(raw: str, named: dict | None = None) -> list:
    """Las secciones de un parche: `[{title, lines}]`. Un párrafo suelto corto dentro de una sección (el nombre de un
    mapa) es un subtítulo, y las líneas que siguen llevan `map`."""
    named = named or {}
    tokens = re.split(r"(\[/?list\]|\[/?olist\]|\[\*\]|\[/\*\]|\[/?p\]|\n)", raw)
    secs, cur, depth, head, buf = [], None, 0, None, []

    def flush():
        nonlocal cur, head
        text = inline(re.sub(r"\[img\].*?\[/img\]", "", "".join(buf)))
        buf.clear()
        if not text:
            return
        m = HEADER.fullmatch(text)
        if m:
            cur = {"title": (m.group(1) or m.group(2)).strip(), "lines": []}
            secs.append(cur)
            head = None
            return
        if cur is None:
            cur = {"title": "", "lines": []}
            secs.append(cur)
        dash = DASH.match(text)
        if dash:
            text = text[dash.end():]
        level = max(depth, 1) if dash else depth
        refs = find_refs(text, named)
        if level == 0 and len(text) <= 40 and not text.endswith((".", ":", "!")):
            head = text
            line = {"text": text, "head": True}
        else:
            line = {"text": text, "dir": direction(text)}
            if level > 1:
                line["sub"] = True
            if head and level > 0:
                line["map"] = head
            elif level == 0:
                head = None
        if refs:
            line["refs"] = refs
        cur["lines"].append(line)

    for tok in tokens:
        if tok in ("[list]", "[olist]"):
            flush()
            depth += 1
        elif tok in ("[/list]", "[/olist]"):
            flush()
            depth = max(depth - 1, 0)
        elif tok in ("[*]", "[/*]", "[p]", "[/p]", "\n"):
            flush()
        else:
            buf.append(tok)
    flush()
    # Un subtítulo sin nada abajo no es subtítulo: es una línea más.
    for s in secs:
        ls = s["lines"]
        for i, ln in enumerate(ls):
            if ln.get("head") and (i + 1 == len(ls) or "map" not in ls[i + 1]):
                ln.pop("head")
                ln["dir"] = direction(ln["text"])
    return [s for s in secs if s["lines"]]


def counts(secs: list) -> dict:
    c = {"new": 0, "mid": 0, "fix": 0}
    for s in secs:
        for ln in s["lines"]:
            if not ln.get("head"):
                c[ln["dir"]] += 1
    return c


def clan(url: str) -> str:
    return url.replace("{STEAM_CLAN_IMAGE}", CLAN)


def parse_content(raw: str) -> list:
    """Un lanzamiento como bloques en orden: `{"img"}`, `{"h"}`, `{"p"}` y `{"li"}`. Los videos quedan como su póster."""
    raw = re.sub(r'\[video[^\]]*?poster="([^"]+)"[^\]]*\].*?\[/video\]', lambda m: f"\n[img]{m.group(1)}[/img]\n", raw, flags=re.S)
    raw = re.sub(r"\[video[^\]]*\].*?\[/video\]", "\n", raw, flags=re.S)
    tokens = re.split(r"(\[img\].*?\[/img\]|\[h\d\].*?\[/h\d\]|\[/?list\]|\[\*\]|\[/\*\]|\[/?p\]|\n)", raw, flags=re.S)
    out, depth, buf = [], 0, []

    def flush():
        text = inline("".join(buf))
        buf.clear()
        if text:
            out.append({"li": text} if depth > 0 else {"p": text})

    for tok in tokens:
        if not tok:
            continue
        m = re.fullmatch(r"\[img\](.*?)\[/img\]", tok, flags=re.S)
        if m:
            flush()
            out.append({"img": clan(m.group(1).strip())})
            continue
        m = re.fullmatch(r"\[h\d\](.*?)\[/h\d\]", tok, flags=re.S)
        if m:
            flush()
            if inline(m.group(1)):
                out.append({"h": inline(m.group(1))})
            continue
        if tok == "[list]":
            flush()
            depth += 1
        elif tok == "[/list]":
            flush()
            depth = max(depth - 1, 0)
        elif tok in ("[*]", "[/*]", "[p]", "[/p]", "\n"):
            flush()
        else:
            buf.append(tok)
    flush()
    return out


def is_patch(title: str) -> bool:
    return bool(re.match(r"(Counter-Strike 2 Update|Release Notes for)", title))


def editions(items: list, named: dict) -> list:
    """Las ediciones, del más nuevo al más viejo, con su slug. `items` viene de Steam en ese orden."""
    eds = []
    for n in items:
        day = datetime.datetime.fromtimestamp(n["date"], datetime.UTC).date()
        if day < DESDE:
            continue
        e = {"date": day.isoformat(), "title": n["title"].strip(), "url": n["url"], "kind": "patch" if is_patch(n["title"]) else "content"}
        if e["kind"] == "patch":
            e["sections"] = parse_notes(n["contents"], named)
            if not e["sections"]:
                continue
        else:
            e["body"] = parse_content(n["contents"])
            e["refs"] = find_refs(inline(re.sub(r"\[[^\]]*\]", " ", n["contents"])), named)
        eds.append(e)
    # Slugs del más viejo al más nuevo, así uno ya publicado no cambia cuando sale otro el mismo día.
    used = set()
    for e in reversed(eds):
        base = e["date"] if e["kind"] == "patch" else slugify(e["title"]) or e["date"]
        slug, k = base, 2
        while slug in used:
            slug = f"{base}-{k}" if e["kind"] == "patch" else f"{base}-{e['date']}"
            k += 1
        used.add(slug)
        e["slug"] = slug
    return eds


def meta(e: dict) -> dict:
    """La fila del índice: lo que la lista del costado necesita sin bajar la edición."""
    m = {"slug": e["slug"], "date": e["date"], "kind": e["kind"], "title": e["title"]}
    if e["kind"] == "patch":
        m["counts"] = counts(e["sections"])
        m["secs"] = [s["title"] for s in e["sections"] if s["title"]]
    else:
        cover = next((b["img"] for b in e["body"] if "img" in b), None)
        if cover:
            m["cover"] = cover
    return m


def fetch_all() -> list:
    """Todos los anuncios, de a 300, hasta pasar `DESDE`."""
    items, end = [], None
    while True:
        url = FEED + (f"&enddate={end}" if end else "")
        req = urllib.request.Request(url, headers={"User-Agent": "vestigo-fetch"})
        with urllib.request.urlopen(req, timeout=120) as r:
            page = json.loads(r.read().decode("utf-8"))["appnews"]["newsitems"]
        page = [n for n in page if n["gid"] not in {i["gid"] for i in items}]
        if not page:
            return items
        items += page
        last = min(n["date"] for n in page)
        if datetime.datetime.fromtimestamp(last, datetime.UTC).date() < DESDE:
            return items
        end = last - 1


def named_items() -> dict:
    """Las cajas y colecciones del catálogo, por nombre: `{nombre: (kind, slug, img)}`."""
    out = {}
    for f, kind in (("cases/list.json", "case"), ("collections/list.json", "coll")):
        for r in json.loads((DATA / f).read_text(encoding="utf-8")):
            out[r["name"]] = (kind, r["slug"], r.get("img"))
    return out


def main() -> None:
    items = sorted(fetch_all(), key=lambda n: -n["date"])
    eds = editions(items, named_items())
    root = DATA / "patches"
    escritos = sum(write_json(root / "e" / f"{e['slug']}.json", e) for e in eds)
    # Una edición que ya no sale (cambió de slug o Valve la borró) no queda colgada.
    vivos = {f"{e['slug']}.json" for e in eds}
    for f in (root / "e").glob("*.json"):
        if f.name not in vivos:
            f.unlink()
    write_json(root / "index.json", [meta(e) for e in eds])
    print(f"{len(eds)} ediciones ({sum(e['kind'] == 'patch' for e in eds)} parches), {escritos} nuevas o cambiadas")


if __name__ == "__main__":
    sys.exit(main())
