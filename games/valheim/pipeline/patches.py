"""
La Crónica: las notas de parche oficiales de Valheim, una edición por versión.

  cd games/valheim && .venv/Scripts/python -m pipeline.patches

Lee los anuncios de Steam (`ISteamNews/GetNewsForApp`, público y sin clave) y
se queda con los parches que salieron a la versión estable: fuera los "Public
Test" y los blogs de desarrollo. Los anuncios de la misma versión (un "[but
cooler]", un "(Hotfix)") van como hotfixes de la primera.

Escribe `data/site/patches/index.json` + `<slug>.json` y baja la primera imagen
de cada anuncio a `public/valheim/news/<slug>.webp` como portada.

**Español a mano, como en Deadlock:** Iron Gate publica sólo en inglés. Las
traducciones son diccionarios "línea en inglés → línea en español" en
`data/patches-es/<slug>.json` (más `common.json` para lo que se repite, como
"Multiple bug fixes"). Las líneas "Weapon: Nord Sword" se traducen solas con
los nombres oficiales del juego. Una edición sale en español sólo si están
todas sus líneas; si no, el log lista las que faltan y la web avisa que va en
inglés. Correrlo con `--todo <slug>` escribe las líneas que faltan en
`data/patches-es/<slug>.todo.json` para completarlas.

Se corre a mano en cada parche, después de `pipeline.site` (usa su índice para
enlazar los nombres de la enciclopedia). Tarda unos segundos.
"""
import html
import io
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
SITE = os.path.join(DATA, "site")
OUT = os.path.join(SITE, "patches")
ES_DIR = os.path.join(DATA, "patches-es")
COVERS = os.path.normpath(os.path.join(HERE, "..", "..", "..", "site", "public", "valheim", "news"))

APP = 892970
FEED = f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid={APP}&count=400&maxlength=0&feeds=steam_community_announcements"
CLAN_IMG = "https://clan.akamai.steamstatic.com/images"
UA = "Vestigo (vestigo.gg) valheim patch notes"

# Anuncios de parche sin número en el título: la versión sale del registro de
# cambios del juego (el del menú principal).
TITLE_VERSION = {"Update: Hearth & Home arrives!": "0.202.14"}

VERSION_RE = re.compile(r"\b(\d+\.\d+(?:\.\d+)?)\b")


def version_of(title: str) -> str | None:
    if title in TITLE_VERSION:
        return TITLE_VERSION[title]
    found = VERSION_RE.findall(title.replace("2021-02-04", ""))
    return found[-1] if found else None


def keep(title: str) -> bool:
    """Los parches de la versión estable: fuera las pruebas públicas y los blogs."""
    t = title.lower()
    if "public test" in t or "word from the devs" in t or "development" in t:
        return False
    return version_of(title) is not None


def slug_of(version: str) -> str:
    return version.replace(".", "-")


def vkey(version: str) -> tuple:
    return tuple(int(x) for x in version.split("."))


# ---------------------------------------------------------------- BBCode

def clean_inline(s: str) -> str:
    s = re.sub(r"\[url=[^\]]*\](.*?)\[/url\]", r"\1", s, flags=re.S)
    s = re.sub(r"\[/?(?:b|i|u|p|quote|spoiler|strike|noparse|url)\]", "", s)
    s = html.unescape(s)
    s = s.replace(" ", " ")
    return re.sub(r"[ \t]+", " ", s).strip()


def first_image(body: str) -> str | None:
    m = re.search(r"\[img\](.*?)\[/img\]", body, re.S)
    if not m:
        return None
    return m.group(1).strip().replace("{STEAM_CLAN_IMAGE}", CLAN_IMG)


def _lines(body: str) -> list[tuple[str, str]]:
    """El cuerpo en líneas tipadas: ("h", título), ("li", viñeta) o ("p", párrafo)."""
    body = body.replace("\r", "")
    body = re.sub(r"\[previewyoutube[^\]]*\].*?\[/previewyoutube\]", "\n", body, flags=re.S)
    body = re.sub(r"\[img\].*?\[/img\]", "\n", body, flags=re.S)
    body = re.sub(r"\[h([1-6])\](.*?)\[/h\1\]", lambda m: f"\n\x01{m.group(2)}\n", body, flags=re.S)
    body = re.sub(r"\[/?p\]", "\n", body)
    body = re.sub(r"\[\*\]", "\n* ", body)
    body = re.sub(r"\[/?(?:o?list)\]", "\n", body)
    out: list[tuple[str, str]] = []
    for raw in body.split("\n"):
        s = raw.strip()
        if not s:
            continue
        if s.startswith("\x01"):
            t = clean_inline(s[1:])
            if t:
                out.append(("h", t.rstrip(":").strip()))
            continue
        # Un renglón entero en negrita que termina en ":" es un título de sección.
        m = re.fullmatch(r"\[b\](.+?)\[/b\]\s*:?", s)
        if m and (m.group(1).strip().endswith(":") or s.endswith(":")) and len(m.group(1)) < 80:
            out.append(("h", clean_inline(m.group(1)).rstrip(":").strip()))
            continue
        if re.match(r"^[*•\-–]\s+", s):
            # A veces la viñeta viene doble ("[*]* texto").
            t = clean_inline(re.sub(r"^([*•\-–]\s+)+", "", s))
            if t:
                out.append(("li", t))
            continue
        t = clean_inline(s)
        if t:
            out.append(("p", t))
    # Un renglón corto sin punto justo antes de viñetas también es un título
    # ("General improvements" en Hearth & Home).
    for i, (k, t) in enumerate(out):
        nxt = out[i + 1][0] if i + 1 < len(out) else None
        if k == "p" and nxt == "li" and len(t) < 60 and not t.endswith((".", "!", "?", ")")):
            out[i] = ("h", t.rstrip(":").strip())
    return out


# Encabezados que sólo repiten el título del anuncio ("Patch Notes – Valheim
# 1.0", "Patch 0.202.14 (HEARTH & HOME)").
# "Patch 1.0.10 – All Platforms" sí se queda: separa partes de un mismo anuncio.
SKIP_HEAD = re.compile(r"^patch notes?\b|^patch [\d.]+\s*\(", re.I)
# La firma y los enlaces a redes del final de los anuncios.
SKIP_TEXT = re.compile(r"https?://|^the iron gate team$|^(discord|twitter|facebook|instagram|reddit|tiktok|youtube|x)\s*:", re.I)


def parse(body: str) -> dict:
    """Intro (los párrafos antes de la primera viñeta o título) y secciones."""
    intro: list[str] = []
    sections: list[dict] = []
    cur: dict | None = None
    for k, t in _lines(body):
        if k != "h" and SKIP_TEXT.search(t):
            continue
        if k == "h":
            if SKIP_HEAD.search(t):
                continue
            cur = {"title": t, "lines": []}
            sections.append(cur)
        elif k == "li":
            if cur is None:
                cur = {"title": "", "lines": []}
                sections.append(cur)
            cur["lines"].append({"text": t})
        else:
            if cur is None:
                intro.append(t)
            else:
                cur["lines"].append({"text": t, "note": True})
    # Un título seguido de otro título (p. ej. "Abbreviated Patch Notes" antes de
    # "New Content") queda como separador: se marca `major`.
    for i, s in enumerate(sections):
        if not s["lines"] and i + 1 < len(sections):
            s["major"] = True
    sections = [s for s in sections if s["lines"] or s.get("major")]
    while sections and sections[-1].get("major"):
        sections.pop()
    return {"intro": intro, "sections": sections}


# ---------------------------------------------------------------- clasificación

# "Fixes & Improvements" no es todo arreglo: sólo las secciones de errores.
FIX_SEC = re.compile(r"bug|issue|^(hot)?fix(es)?$", re.I)
NEW_SEC = re.compile(r"\bnew\b|craft|content|build|item|weapon|armou?r|food|material|creature|location|mechanic|trinket|emote|hair|cosmetic", re.I)
FIX_LINE = re.compile(r"^(fix|fixed|fixes|fixing|hotfix|hotfixed|solved|resolved|prevent|corrected)\b", re.I)
NEW_LINE = re.compile(r"^(new|added|add|adds|introduc\w*|now available|\d+\+? new)\b|\badded\b", re.I)
# Las listas de novedades de las actualizaciones grandes ("Enemy: Barka").
NEW_CATS = {"Enemy", "Dungeon", "Building Pieces", "Building Piece", "Location", "Event", "Emote", "Hairstyle", "Beard", "Achievement"}
CAT_LINE = re.compile(r"^([A-Z][A-Za-z ]+?)\s*:\s+(.+)$")


def classify(line: str, section: str) -> str:
    if FIX_LINE.search(line):
        return "fix"
    if NEW_LINE.search(line):
        return "new"
    if FIX_SEC.search(section):
        return "fix"
    cat = CAT_LINE.match(line)
    if cat and (cat.group(1) in CAT_ES or cat.group(1) in NEW_CATS):
        return "new"
    if NEW_SEC.search(section) and (cat or len(line) < 60):
        return "new"
    return "mid"


# ---------------------------------------------------------------- menciones

class Names:
    """
    Los nombres de la enciclopedia de un idioma, listos para buscar. Los de dos
    palabras o más sin mirar mayúsculas ("Crystal battleaxe"); los de una,
    respetándolas, para que "stone" suelto no enlace. Una sola regex por grupo
    (con miles de nombres, una por nombre tardaba minutos).
    """

    def __init__(self, pairs: list[tuple[str, str]]):
        # Si un nombre está en dos pestañas (la carne cocida es comida y también
        # pieza de la bandeja), gana la que no es Construcción.
        pairs = sorted(pairs, key=lambda x: (-len(x[0]), x[1].startswith("building/")))
        self.multi: dict[str, str] = {}
        self.single: dict[str, str] = {}
        for n, r in pairs:
            if " " in n:
                self.multi.setdefault(n.lower(), r)
            else:
                self.single.setdefault(n, r)
        alt = lambda ns: "|".join(re.escape(n) for n in ns)
        edge_a, edge_b = r"(?<![\w-])(", r")(?![\w-])"
        self.re_multi = re.compile(edge_a + alt([n for n, _ in pairs if " " in n]) + edge_b, re.I) if self.multi else None
        self.re_single = re.compile(edge_a + alt([n for n, _ in pairs if " " not in n]) + edge_b) if self.single else None

    def find(self, text: str) -> list[str]:
        hits = []
        if self.re_multi:
            hits += [(m.start(), m.end(), self.multi[m.group(1).lower()]) for m in self.re_multi.finditer(text)]
        if self.re_single:
            hits += [(m.start(), m.end(), self.single[m.group(1)]) for m in self.re_single.finditer(text)]
        # Del más largo al más corto, sin pisarse.
        hits.sort(key=lambda h: (-(h[1] - h[0]), h[0]))
        taken: list[tuple[int, int]] = []
        found: list[str] = []
        for a, b, ref in hits:
            if any(a < y and x < b for x, y in taken):
                continue
            taken.append((a, b))
            if ref not in found:
                found.append(ref)
        return found


def build_names(index: list[dict]) -> dict[str, Names]:
    out: dict[str, list[tuple[str, str]]] = {"en": [], "es": []}
    for e in index:
        ref = f"{e['tab']}/{e['slug']}"
        for lang in ("en", "es"):
            n = (e.get(lang) or "").strip()
            if len(n) >= 3:
                out[lang].append((n, ref))
    return {lang: Names(pairs) for lang, pairs in out.items()}


def refs_in(text: str, names: Names) -> list[str]:
    return names.find(text)


# ---------------------------------------------------------------- español

# Las etiquetas de las listas de novedades ("Weapon: Nord Sword").
CAT_ES = {
    "Material": "Material", "Plantable": "Cultivo", "Production": "Producción", "Weapon": "Arma",
    "Staff": "Bastón", "Shield": "Escudo", "Armour": "Armadura", "Armor": "Armadura", "Armour set": "Conjunto de armadura",
    "Armor set": "Conjunto de armadura", "Ammunition": "Munición", "Trinket": "Abalorio", "Cape": "Capa",
    "Bomb": "Bomba", "Item": "Objeto", "Tool": "Herramienta", "Food": "Comida", "Mead": "Hidromiel",
    "Creature": "Criatura", "Boss": "Jefe", "Location": "Lugar", "Building": "Construcción",
    "Build piece": "Pieza de construcción", "Furniture": "Mueble", "Feast": "Festín", "Potion": "Poción",
    "Black Forge Extension": "Extensión de la forja negra", "Cauldron Extension": "Extensión del caldero",
    "Galdr Table Extension": "Extensión de la mesa de galdr", "Forge Extension": "Extensión de la forja",
    "Workbench Extension": "Extensión del banco de trabajo", "Artisan Table Extension": "Extensión de la mesa de artesano",
    "Enemy": "Enemigo", "Dungeon": "Mazmorra", "Mini boss": "Minijefe", "Miniboss": "Minijefe",
    "Building Piece": "Pieza de construcción", "Stack": "Pila", "Valuable": "Objeto de valor", "Upgrade": "Mejora",
    "Misc": "Varios",
}


def auto_es(line: str, en2es: dict[str, str]) -> str | None:
    """'Weapon: Nord Sword' → 'Arma: Espada nórdica', si todo tiene nombre oficial."""
    m = CAT_LINE.match(line)
    if not m or m.group(1) not in CAT_ES:
        return None
    parts = [p.strip() for p in re.split(r",\s*", m.group(2).strip())]
    es = [en2es.get(p) or en2es.get(p.replace("Armour", "Armor")) for p in parts]
    if not all(es):
        return None
    return f"{CAT_ES[m.group(1)]}: {', '.join(es)}"


def en_strings(ed: dict) -> list[str]:
    """Todo lo traducible de una edición, en orden."""
    out = [ed["title"]["en"], *ed["intro"]]
    for s in ed["sections"]:
        out.append(s["title"])
        out += [l["text"] for l in s["lines"]]
    for h in ed["hotfixes"]:
        out += [*h["intro"]]
        for s in h["sections"]:
            out.append(s["title"])
            out += [l["text"] for l in s["lines"]]
    return [s for s in out if s]


def load_es(slug: str) -> dict[str, str]:
    d: dict[str, str] = {}
    for name in ("common.json", f"{slug}.json"):
        p = os.path.join(ES_DIR, name)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                d.update({k: v for k, v in json.load(f).items() if not k.startswith("_")})
    return d


def translate(ed: dict, tr: dict[str, str], en2es: dict[str, str], names_es) -> tuple[dict | None, list[str]]:
    """La edición en español, o None y las líneas que faltan."""
    def t(s: str) -> str | None:
        if not s:
            return ""
        return tr.get(s) or auto_es(s, en2es)

    missing = [s for s in en_strings(ed) if t(s) is None]
    if missing:
        return None, missing

    def secs(sections):
        return [{**s, "title": t(s["title"]), "lines": [{**l, "text": t(l["text"]), "refs": refs_in(t(l["text"]), names_es) or None} for l in s["lines"]]} for s in sections]

    return {
        "title": t(ed["title"]["en"]),
        "intro": [t(p) for p in ed["intro"]],
        "sections": secs(ed["sections"]),
        "hotfixes": [{"intro": [t(p) for p in h["intro"]], "sections": secs(h["sections"])} for h in ed["hotfixes"]],
    }, []


# ---------------------------------------------------------------- armado

def headline(title: str, version: str) -> str | None:
    """
    El nombre de la actualización: 'Patch 0.221.4 – Call To Arms' → 'Call To
    Arms', 'Update: Hearth & Home arrives!' → 'Hearth & Home'. Un "Patch 0.217.30"
    a secas no tiene nombre (la versión ya va grande en la portada).
    """
    m = re.search(r"\s[–-]\s(.+)$", title) or re.match(r"Update:\s*(.+?)\s+arrives!?$", title)
    if m:
        return m.group(1).strip().rstrip("!").strip()
    rest = re.sub(r"^(patch( note)?\s*)?(\d{4}-\d\d-\d\d\s*)?" + re.escape(version) + r"$", "", title.strip(), flags=re.I)
    return rest.strip() or None


def edition_kind(title: str, sections: list[dict]) -> str:
    n = sum(len(s["lines"]) for s in sections)
    return "content" if re.search(r"\s[–-]\s|update:|has arrived", title, re.I) or n >= 60 else "patch"


def strip_nulls(o):
    if isinstance(o, dict):
        # Ojo: `0 in (False,)` es True en Python; los ceros de los conteos se quedan.
        return {k: strip_nulls(v) for k, v in o.items() if not (v is None or v is False or v == [] or v == "")}
    if isinstance(o, list):
        return [strip_nulls(x) for x in o]
    return o


def build(items: list[dict], index: list[dict]) -> list[dict]:
    names = build_names(index)
    posts = sorted((n for n in items if keep(n["title"])), key=lambda n: n["date"])
    eds: dict[str, dict] = {}
    for n in posts:
        v = version_of(n["title"])
        p = parse(n["contents"])
        for s in p["sections"]:
            for l in s["lines"]:
                if not l.get("note"):
                    l["dir"] = classify(l["text"], s["title"])
                l["refs"] = refs_in(l["text"], names["en"]) or None
        date = datetime.fromtimestamp(n["date"], timezone.utc).strftime("%Y-%m-%d")
        url = f"https://store.steampowered.com/news/app/{APP}/view/{n['gid']}"
        if v in eds:
            eds[v]["hotfixes"].append({"title": n["title"], "date": date, "url": url, **p})
            continue
        eds[v] = {
            "version": v, "slug": slug_of(v), "date": date, "url": url,
            "kind": edition_kind(n["title"], p["sections"]),
            "title": {"en": headline(n["title"], v)},
            "cover": first_image(n["contents"]),
            "hotfixes": [], **p,
        }
    return sorted(eds.values(), key=lambda e: vkey(e["version"]), reverse=True)


def counts(sections: list[dict]) -> dict:
    c = {"new": 0, "mid": 0, "fix": 0}
    for s in sections:
        for l in s["lines"]:
            if l.get("dir"):
                c[l["dir"]] += 1
    return c


def save_cover(url: str, slug: str) -> bool:
    """La primera imagen del anuncio, a 960 px en webp. Si ya está, no la baja."""
    dst = os.path.join(COVERS, f"{slug}.webp")
    if os.path.exists(dst):
        return True
    try:
        from PIL import Image
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        raw = urllib.request.urlopen(req, timeout=30).read()
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        if im.width > 960:
            im = im.resize((960, round(im.height * 960 / im.width)), Image.LANCZOS)
        os.makedirs(COVERS, exist_ok=True)
        im.save(dst, "WEBP", quality=78, method=6)
        return True
    except Exception as e:  # noqa: BLE001 — una portada que no baja no frena la edición
        print(f"  portada {slug}: {e}")
        return False


CACHE = os.path.normpath(os.path.join(HERE, "..", ".cache", "steam-news.json"))


def fetch(offline: bool = False) -> list[dict]:
    """Los anuncios de Steam; con `--offline`, los de la última bajada (para traducir sin pedirlos de nuevo)."""
    if offline and os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    req = urllib.request.Request(FEED, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        items = json.load(r)["appnews"]["newsitems"]
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False)
    return items


def main(argv: list[str]) -> None:
    with open(os.path.join(SITE, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    en2es = {e["en"]: e["es"] for e in index if e.get("en") and e.get("es")}
    names_es = build_names(index)["es"]
    eds = build(fetch("--offline" in argv), index)
    todo = set(argv[argv.index("--todo") + 1].split(",")) if "--todo" in argv else set()

    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        os.remove(os.path.join(OUT, old))
    meta = []
    es_ok = 0
    for ed in eds:
        ed["cover"] = ed["slug"] if ed["cover"] and save_cover(ed["cover"], ed["slug"]) else None
        es, missing = translate(ed, load_es(ed["slug"]), en2es, names_es)
        ed["title"]["es"] = es["title"] if es else None
        ed["es"] = es
        if es:
            es_ok += 1
        elif (ed["slug"] in todo or "all" in todo) and missing:
            os.makedirs(ES_DIR, exist_ok=True)
            with open(os.path.join(ES_DIR, f"{ed['slug']}.todo.json"), "w", encoding="utf-8") as f:
                json.dump({s: "" for s in dict.fromkeys(missing)}, f, ensure_ascii=False, indent=1)
        c = counts(ed["sections"])
        meta.append({k: ed[k] for k in ("version", "slug", "date", "kind", "title", "cover")} | {"counts": c})
        with open(os.path.join(OUT, f"{ed['slug']}.json"), "w", encoding="utf-8") as f:
            json.dump(strip_nulls(ed), f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"editions": strip_nulls(meta)}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(eds)} ediciones ({es_ok} en español), de {eds[-1]['version']} a {eds[0]['version']}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1:])
