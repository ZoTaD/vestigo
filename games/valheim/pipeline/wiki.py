"""
Lo que dice la wiki de Fandom (valheim.fandom.com), leído de la copia local.

La copia la baja `Desktop/valheim-wiki/dump.py` (wikitext de cada artículo);
otra ruta con la variable VALHEIM_WIKI. Pedido de ZoTaD (2026-09-24): lo que
el sitio dice de cada bioma tiene que coincidir con la wiki ("no podemos decir
que la mejor comida del pantano es el racimo de parrabaya").

Acá sólo se lee: de qué bioma es cada comida (la tabla de `Food`), dónde vive
cada criatura (`location` de su ficha), de qué bioma sale cada objeto (`source`)
y los lugares (`Infobox location`) con su foto. Lo que se hace con eso está en
`wiki_check.py` (el informe) y en `site.py`.
"""
import os
import re
from functools import lru_cache

WIKI = os.environ.get("VALHEIM_WIKI") or os.path.join(os.path.expanduser("~"), "Desktop", "valheim-wiki")
PAGES = os.path.join(WIKI, "pages", "main")

# Cómo nombra la wiki a cada bioma (con los plurales y los viejos).
BIOME_NAMES = {
    "meadows": "meadows", "black forest": "blackforest", "black forests": "blackforest",
    "swamp": "swamp", "swamps": "swamp", "mountain": "mountain", "mountains": "mountain",
    "plains": "plains", "ocean": "ocean", "mistlands": "mistlands", "ashlands": "ashlands",
    "deep north": "deepnorth",
}
_BIOME_RE = re.compile(r"\b(" + "|".join(sorted(map(re.escape, BIOME_NAMES), key=len, reverse=True)) + r")\b", re.I)


def norm(name: str) -> str:
    """La llave para cruzar nombres: la wiki escribe "Vineberry cluster" y el juego "Vineberry Cluster"."""
    s = name.lower().replace("’", "'").replace("_", " ")
    s = re.sub(r"[^a-z0-9' ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def biomes_in(text: str) -> list[str]:
    """Los biomas que nombra un texto, en el orden en que aparecen, sin repetir."""
    out = []
    for m in _BIOME_RE.finditer(text or ""):
        b = BIOME_NAMES[m.group(1).lower()]
        if b not in out:
            out.append(b)
    return out


def links(text: str) -> list[str]:
    """Los destinos de los [[enlaces]] de un texto."""
    return [m.split("|")[0].strip() for m in re.findall(r"\[\[([^\]]+)\]\]", text or "") if not m.lower().startswith(("file:", "category:"))]


def plain(text: str) -> str:
    """Wikitext a texto: enlaces por su nombre visible, sin plantillas ni etiquetas."""
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", text or "")
    t = re.sub(r"\{\{[^{}]*\}\}", "", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"'{2,}", "", t)
    return re.sub(r"\s+", " ", t).strip()


@lru_cache(maxsize=None)
def pages() -> dict[str, str]:
    """Título → wikitext."""
    out = {}
    for fn in os.listdir(PAGES):
        if fn.endswith(".txt"):
            with open(os.path.join(PAGES, fn), encoding="utf-8") as f:
                out[fn[:-4]] = f.read()
    return out


def infobox(text: str) -> tuple[str, dict[str, str]] | None:
    """La primera ficha (`{{Infobox …}}`) de la página: tipo y campos."""
    m = re.search(r"\{\{\s*infobox[ _]([a-z_ ]+?)\s*\|", text, re.I)
    if not m:
        return None
    # Hasta la llave que la cierra, contando las plantillas de adentro.
    depth, i = 0, m.start()
    while i < len(text):
        if text.startswith("{{", i):
            depth, i = depth + 1, i + 2
            continue
        if text.startswith("}}", i):
            depth, i = depth - 1, i + 2
            if depth == 0:
                break
            continue
        i += 1
    body = text[m.end():i - 2]
    fields, key = {}, None
    # Los campos van "| clave = valor" al principio de línea (o pegados).
    for part in re.split(r"(?:^|\n)\s*\|(?![^\[]*\]\])", "\n" + body):
        k, sep, v = part.partition("=")
        if sep and re.fullmatch(r"\s*[A-Za-z0-9 _]+\s*", k):
            key = k.strip().lower().replace("_", " ")
            fields[key] = v.strip()
        elif key:
            fields[key] += "|" + part
    return m.group(1).strip().lower().replace("_", " "), fields


@lru_cache(maxsize=None)
def boxes() -> dict[str, tuple[str, str, dict]]:
    """norm(título) → (título, tipo de ficha, campos)."""
    out = {}
    for title, text in pages().items():
        b = infobox(text)
        if b:
            out[norm(title)] = (title, b[0], b[1])
    return out


def lookup(name: str):
    """La ficha de un nombre del juego: exacto, o el singular/plural."""
    bx = boxes()
    n = norm(name)
    for k in (n, n.rstrip("s"), n + "s", re.sub(r"ies$", "y", n), re.sub(r"y$", "ies", n)):
        if k in bx:
            return bx[k]
    return None


@lru_cache(maxsize=None)
def food_biomes() -> dict[str, str]:
    """norm(comida) → bioma de progresión, de la tabla "List of foods" de `Food`."""
    out = {}
    text = pages().get("Food", "")
    for row in text.split("\n|-")[1:]:
        m = re.search(r"^\s*\|\s*\[\[([^\]|]+)", row, re.M)
        tier = re.search(r'data-sort-value="\d+"\|\s*([A-Za-z ]+?)\s*\|\|', row)
        if m and tier:
            bs = biomes_in(tier.group(1))
            if bs:
                out[norm(m.group(1))] = bs[0]
    return out


def creature_biomes(name: str) -> list[str] | None:
    """Los biomas de `location` en la ficha de la criatura (None: sin ficha)."""
    b = lookup(name)
    if not b or "creature" not in b[1]:
        return None
    return biomes_in(b[2].get("location", ""))


def item_biomes(name: str) -> list[str] | None:
    """Los biomas que nombra el `source` de la ficha del objeto (None: sin ficha)."""
    b = lookup(name)
    if not b or b[1] in ("creature", "location", "biome", "character", "skill"):
        return None
    return biomes_in(b[2].get("source", "") + " " + b[2].get("biomes", ""))


@lru_cache(maxsize=None)
def biome_boxes() -> dict[str, dict[str, list[str]]]:
    """bioma → las listas de su ficha (passive, hostile, structures, dungeons…) como nombres."""
    out = {}
    for title, text in pages().items():
        b = infobox(text)
        if not b or b[0] != "biome":
            continue
        bs = biomes_in(title)
        if len(bs) != 1:
            continue
        out[bs[0]] = {k: [plain(x) for x in re.findall(r"\*\s*([^\n*]+)", v)] or ([plain(v)] if plain(v) else [])
                      for k, v in b[1].items()}
    return out


@lru_cache(maxsize=None)
def locations() -> list[dict]:
    """Los lugares de la wiki (`Infobox location`): título, bioma, foto, habitantes y recursos."""
    out = []
    for title, text in pages().items():
        b = infobox(text)
        if not b or b[0] != "location":
            continue
        f = b[1]
        img = re.sub(r"^\[\[(?:File|Image):", "", (f.get("image") or "").split("|")[0]).strip()
        out.append({
            "title": title, "type": plain(f.get("type", "")), "biomes": biomes_in(f.get("location", "")),
            "image": img or None, "inhabitants": links(f.get("inhabitants", "")), "resources": links(f.get("resources", "")),
        })
    return out


@lru_cache(maxsize=None)
def armor_biomes() -> dict[str, str]:
    """norm(pieza de armadura) → bioma, de la tabla "Sets" de `Armor` (la fila hereda el rowspan)."""
    out, cur = {}, None
    text = pages().get("Armor", "")
    table = text.split("==Sets==", 1)[-1].split("\n|}", 1)[0]
    for row in table.split("\n|-")[1:]:
        m = re.search(r"^\|\s*(?:rowspan=\"\d+\"\s*\|)?\s*\[\[([^\]|]+)\]\]\s*$", row.strip().split("\n")[0])
        if m and biomes_in(m.group(1)):
            cur = biomes_in(m.group(1))[0]
        if not cur:
            continue
        for name in re.findall(r"\{\{(?:image|item) link\|([^}|]+)", row, re.I):
            out.setdefault(norm(name), cur)
    return out
