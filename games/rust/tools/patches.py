"""
Rust → la pestaña Parches (2026-10-09): las notas oficiales de cada actualización, como la Crónica de Valheim
(`games/valheim/pipeline/patches.py`). Plan: docs/superpowers/plans/2026-10-09-rust-parches.md.

Lee los anuncios de Steam de la app 252490 (`ISteamNews/GetNewsForApp`, público y sin clave): Facepunch publica uno por
actualización (la mensual del primer jueves y los eventos), con el texto de su devblog. Los hotfixes no salen en Steam
y quedan afuera; tampoco entran los "Community Update" (creaciones de la comunidad), las votaciones de los Steam Awards
ni los anuncios de DLC.

Escribe:
  games/rust/data/patches/index.json      la lista: slug, nombre, fecha, portada, secciones y si hay español
  games/rust/data/patches/<slug>.json     cada edición: secciones con sus renglones y los objetos que nombra
  site/public/rust/patches/<slug>.webp    la primera imagen del anuncio, 640 px (si no está ya)

Español a mano, como Valheim: `games/rust/data/patches-es/<slug>.json` es un diccionario "renglón en inglés → renglón en
español" (más `common.json` para lo que se repite). Una edición sale en español sólo si están todos sus renglones;
`--todo <slug>` (o `all`) escribe los que faltan en `patches-es/<slug>.todo.json` para completarlos.

Uso, desde la raíz del repo (unos segundos):
    python games/rust/tools/patches.py [--offline] [--todo <slug>]
`--offline` usa la última bajada (`games/rust/.cache/steam-news.json`, no versionada) en vez de pedirla de nuevo.
"""
import html
import io
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from extract import slugify  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "games" / "rust" / "data"
OUT = DATA / "patches"
ES_DIR = DATA / "patches-es"
COVERS = ROOT / "site" / "public" / "rust" / "patches"
CACHE = ROOT / "games" / "rust" / ".cache" / "steam-news.json"

APP = 252490
FEED = f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid={APP}&count=100&maxlength=0&feeds=steam_community_announcements"
CLAN_IMG = "https://clan.akamai.steamstatic.com/images"
UA = "Vestigo (vestigo.gg) rust patch notes"
SINCE = "2024-01-01"
COVER_W = 640

SKIP_TITLE = re.compile(r"community update|steam awards|vote for rust|labor of love|dlc pack|is coming to rust", re.I)
SMALL_WORDS = {"a", "an", "and", "or", "of", "the", "to", "in", "on", "for", "with", "x"}


def keep(title: str, date: str) -> bool:
    """Las actualizaciones del juego: fuera lo que no es un parche, y lo de antes de `SINCE`."""
    return date >= SINCE and not SKIP_TITLE.search(title)


def nice_name(title: str) -> str:
    """'UPGRADE HARD, RAID HARDER' → 'Upgrade Hard, Raid Harder'; un título que ya trae minúsculas queda como está."""
    if title != title.upper():
        return title.strip()
    words = title.strip().lower().split()
    out = []
    for i, w in enumerate(words):
        out.append(w if i and w in SMALL_WORDS else w[:1].upper() + w[1:])
    return " ".join(out)


# ---------------------------------------------------------------- BBCode

def clean_inline(s: str) -> str:
    s = re.sub(r"\[url=\"?[^\]\"]*\"?\](.*?)\[/url\]", r"\1", s, flags=re.S)
    s = re.sub(r"\[/?(?:b|i|u|c|strike|spoiler|noparse|url|quote)\]", "", s)
    # El espacio duro, el caracter roto que deja el feed (por un apostrofo) y los corchetes escapados.
    s = html.unescape(s).replace("\u00a0", " ").replace("\ufffd", "'").replace(r"\[", "[").replace(r"\]", "]")
    return re.sub(r"[ \t]+", " ", s).strip()


def first_image(body: str) -> str | None:
    m = re.search(r"\[img src=\"([^\"]+)\"", body) or re.search(r"\[img\](.*?)\[/img\]", body, re.S)
    return m.group(1).strip().replace("{STEAM_CLAN_IMAGE}", CLAN_IMG) if m else None


def blog_url(body: str) -> str | None:
    """El enlace a la lista completa de cambios en rust.facepunch.com, si el anuncio lo trae (sin `#ancla`)."""
    m = re.search(r"https://rust\.facepunch\.com/news/([a-z0-9-]+)(?=[\"\]#])", body)
    return f"https://rust.facepunch.com/news/{m.group(1)}" if m else None


# Lo que se repite al pie y no es del parche: los enlaces a redes y la línea del devblog (va como enlace aparte).
SKIP_TEXT = re.compile(r"^(full devblog|full changelist|devblog)\b|^https?://\S+$", re.I)


def lines_of(body: str) -> list[tuple[str, str, int]]:
    """El cuerpo en renglones tipados: ("h", título, nivel), ("p", párrafo, 0), ("li", viñeta, 0) o ("code", código, 0)."""
    body = body.replace("\r", "")
    body = re.sub(r"\[previewyoutube[^\]]*\].*?\[/previewyoutube\]", "\n", body, flags=re.S)
    body = re.sub(r"\[img[^\]]*\].*?\[/img\]", "\n", body, flags=re.S)
    codes: list[str] = []

    def keep_code(m):
        codes.append(m.group(1).strip("\n"))
        return f"\n\x02{len(codes) - 1}\n"

    body = re.sub(r"\[code\](.*?)\[/code\]", keep_code, body, flags=re.S)
    body = re.sub(r"\[h([1-6])\](.*?)\[/h\1\]", lambda m: f"\n\x01{m.group(1)}{m.group(2)}\n", body, flags=re.S)
    body = re.sub(r"\[\*\]", "\n\x03", body)
    body = re.sub(r"\[/?(?:p|list|olist|\*)\]", "\n", body)
    out: list[tuple[str, str, int]] = []
    li = False
    for raw in body.split("\n"):
        s = raw.strip()
        if not s:
            continue
        if s.startswith("\x01"):
            t = clean_inline(s[2:]).rstrip(":").strip()
            if t:
                out.append(("h", t, int(s[1])))
            li = False
            continue
        if s.startswith("\x02"):
            out.append(("code", codes[int(s[1:])], 0))
            continue
        if s.startswith("\x03"):
            li = True
            s = s[1:].strip()
            if not s:
                continue
        t = clean_inline(s)
        if not t or SKIP_TEXT.search(t):
            continue
        out.append(("li" if li else "p", t, 0))
        li = False
    return out


def parse(body: str) -> dict:
    """La introducción (lo de antes del primer título) y las secciones, cada una con su nivel (1 grande, 3 chica)."""
    intro: list[dict] = []
    sections: list[dict] = []
    cur: dict | None = None
    for kind, text, level in lines_of(body):
        if kind == "h":
            cur = {"title": text, "level": level, "lines": []}
            sections.append(cur)
        elif cur is None:
            intro.append({"t": kind, "text": text})
        else:
            cur["lines"].append({"t": kind, "text": text})
    # Un título sin nada abajo seguido de otro (un "h1" que agrupa) queda como separador; al final, se va.
    sections = [s for i, s in enumerate(sections) if s["lines"] or (i + 1 < len(sections) and sections[i + 1]["level"] > s["level"])]
    return {"intro": intro, "sections": sections}


# ---------------------------------------------------------------- objetos nombrados

class Names:
    """
    Los nombres de los objetos de un idioma: los de dos palabras o más sin mirar mayúsculas ("Heavy Fuse"), los de una
    sola respetándolas y con 5 letras o más (para que "Rope" o "Fuse" sueltos en una frase no enlacen). Una regex por
    grupo; gana el más largo y no se pisan.
    """

    def __init__(self, pairs: list[tuple[str, str]]):
        pairs = sorted({(n.strip(), s) for n, s in pairs if n and n.strip()}, key=lambda x: (-len(x[0]), x[0]))
        self.multi = {n.lower(): s for n, s in pairs if " " in n}
        self.single = {n: s for n, s in pairs if " " not in n and len(n) >= 5}
        alt = lambda ns: "|".join(re.escape(n) for n in ns)
        edge_a, edge_b = r"(?<![\w-])(", r")(?![\w-])"
        self.re_multi = re.compile(edge_a + alt([n for n, _ in pairs if n.lower() in self.multi]) + edge_b, re.I) if self.multi else None
        self.re_single = re.compile(edge_a + alt(list(self.single)) + edge_b) if self.single else None

    def find(self, text: str) -> list[dict]:
        hits = []
        if self.re_multi:
            hits += [(m.start(), m.end(), m.group(1), self.multi[m.group(1).lower()]) for m in self.re_multi.finditer(text)]
        if self.re_single:
            hits += [(m.start(), m.end(), m.group(1), self.single[m.group(1)]) for m in self.re_single.finditer(text)]
        hits.sort(key=lambda h: (-(h[1] - h[0]), h[0]))
        taken: list[tuple[int, int]] = []
        found: list[dict] = []
        for a, b, n, slug in hits:
            if any(a < y and x < b for x, y in taken) or any(f["s"] == slug for f in found):
                continue
            taken.append((a, b))
            found.append({"n": n, "s": slug})
        return found


def names_of(items: list[dict], monuments: list[dict] | None = None) -> dict[str, Names]:
    """
    Los nombres de los objetos y de los monumentos. Un monumento se anota como "m:<id>" para que el sitio sepa que va a
    la pestaña Monumentos; si un nombre es de los dos, gana el monumento ("Outpost" es el lugar, no un cartel).
    """
    out = {"en": [], "es": []}
    for it in items:
        if not it.get("slug"):
            continue
        for lang in ("en", "es"):
            n = (it["name"].get(lang) or "").strip()
            if len(n) >= 4:
                out[lang].append((n, it["slug"]))
    for m in monuments or []:
        for lang in ("en", "es"):
            n = (m["name"].get(lang) or "").strip()
            if len(n) >= 4:
                out[lang] = [(x, s) for x, s in out[lang] if x.lower() != n.lower()] + [(n, f"m:{m['id']}")]
    return {lang: Names(p) for lang, p in out.items()}


def load_monuments() -> list[dict]:
    p = DATA / "monuments.json"
    if not p.exists():
        return []
    with open(p, encoding="utf-8") as f:
        return json.load(f)["monuments"]


def link(block: dict, names: Names) -> dict:
    if block["t"] == "code":
        return block
    refs = names.find(block["text"])
    return {**block, "refs": refs} if refs else block


# ---------------------------------------------------------------- español

def en_strings(ed: dict) -> list[str]:
    out = [b["text"] for b in ed["intro"] if b["t"] != "code"]
    for s in ed["sections"]:
        out.append(s["title"])
        out += [b["text"] for b in s["lines"] if b["t"] != "code"]
    return [x for x in out if x]


def load_es(slug: str) -> dict[str, str]:
    d: dict[str, str] = {}
    for name in ("common.json", f"{slug}.json"):
        p = ES_DIR / name
        if p.exists():
            with open(p, encoding="utf-8") as f:
                d.update({k: v for k, v in json.load(f).items() if not k.startswith("_") and v})
    return d


def translate(ed: dict, tr: dict[str, str], names_es: Names) -> tuple[dict | None, list[str]]:
    """La edición en español (intro y secciones), o None y los renglones que faltan."""
    missing = list(dict.fromkeys(s for s in en_strings(ed) if s not in tr))
    if missing:
        return None, missing

    def blocks(bs):
        return [b if b["t"] == "code" else link({"t": b["t"], "text": tr[b["text"]]}, names_es) for b in bs]

    return {
        "intro": blocks(ed["intro"]),
        "sections": [{"title": tr[s["title"]], "level": s["level"], "lines": blocks(s["lines"])} for s in ed["sections"]],
    }, []


# ---------------------------------------------------------------- armado

def build(posts: list[dict], items: list[dict], monuments: list[dict] | None = None) -> list[dict]:
    names = names_of(items, monuments)
    eds: list[dict] = []
    for n in sorted(posts, key=lambda x: x["date"]):
        date = datetime.fromtimestamp(n["date"], timezone.utc).strftime("%Y-%m-%d")
        if not keep(n["title"], date):
            continue
        p = parse(n["contents"])
        eds.append({
            "slug": slugify(n["title"]),
            "title": n["title"].strip(),
            "name": nice_name(n["title"]),
            "date": date,
            "steam": f"https://store.steampowered.com/news/app/{APP}/view/{n['gid']}",
            "blog": blog_url(n["contents"]),
            "cover": first_image(n["contents"]),
            "intro": [link(b, names["en"]) for b in p["intro"]],
            "sections": [{**s, "lines": [link(b, names["en"]) for b in s["lines"]]} for s in p["sections"]],
        })
    # Dos ediciones con el mismo nombre (dos "Season's Beatings"): la más vieja lleva su año.
    seen: dict[str, int] = {}
    for ed in reversed(eds):
        if ed["slug"] in seen:
            ed["slug"] = f"{ed['slug']}-{ed['date'][:4]}"
        seen[ed["slug"]] = 1
    return sorted(eds, key=lambda e: e["date"], reverse=True)


def save_cover(url: str, slug: str) -> bool:
    dst = COVERS / f"{slug}.webp"
    if dst.exists():
        return True
    try:
        from PIL import Image
        req = urllib.request.Request(url.replace(" ", "%20"), headers={"User-Agent": UA})
        raw = urllib.request.urlopen(req, timeout=30).read()
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        if im.width > COVER_W:
            im = im.resize((COVER_W, round(im.height * COVER_W / im.width)), Image.LANCZOS)
        COVERS.mkdir(parents=True, exist_ok=True)
        im.save(dst, "WEBP", quality=74, method=6)
        return True
    except Exception as e:  # noqa: BLE001 — una portada que no baja no frena la edición
        print(f"  portada {slug}: {e}")
        return False


def fetch(offline: bool = False) -> list[dict]:
    if offline and CACHE.exists():
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    req = urllib.request.Request(FEED, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        items = json.load(r)["appnews"]["newsitems"]
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False)
    return items


def strip_empty(o):
    if isinstance(o, dict):
        return {k: strip_empty(v) for k, v in o.items() if v not in (None, [], "")}
    if isinstance(o, list):
        return [strip_empty(x) for x in o]
    return o


def dump(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(strip_empty(obj), f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")


def main(argv: list[str]) -> None:
    with open(DATA / "items.json", encoding="utf-8") as f:
        items = json.load(f)["items"]
    mons = load_monuments()
    names_es = names_of(items, mons)["es"]
    eds = build(fetch("--offline" in argv), items, mons)
    todo = set(argv[argv.index("--todo") + 1].split(",")) if "--todo" in argv else set()
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.iterdir():
        old.unlink()
    index = []
    es_ok = 0
    for ed in eds:
        ed["cover"] = ed["slug"] if ed["cover"] and save_cover(ed["cover"], ed["slug"]) else None
        es, missing = translate(ed, load_es(ed["slug"]), names_es)
        ed["es"] = es
        if es:
            es_ok += 1
        elif missing and (ed["slug"] in todo or "all" in todo):
            ES_DIR.mkdir(parents=True, exist_ok=True)
            with open(ES_DIR / f"{ed['slug']}.todo.json", "w", encoding="utf-8", newline="\n") as f:
                json.dump({s: "" for s in missing}, f, ensure_ascii=False, indent=1)
        index.append({
            "slug": ed["slug"], "name": ed["name"], "date": ed["date"], "cover": ed["cover"],
            "heads": [s["title"] for s in ed["sections"] if s["level"] <= 2][:8],
            "headsEs": [s["title"] for s in es["sections"] if s["level"] <= 2][:8] if es else None,
            "es": bool(es),
        })
        dump(OUT / f"{ed['slug']}.json", ed)
    dump(OUT / "index.json", {"editions": index})
    print(f"[rust] parches: {len(eds)} ediciones ({es_ok} en español), de {eds[-1]['date']} a {eds[0]['date']}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1:])
