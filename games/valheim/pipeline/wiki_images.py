"""
Las fotos de la wiki de Fandom para criaturas, jefes y lugares, con su crédito.

  cd games/valheim && .venv/Scripts/python -m pipeline.wiki_images

El juego no trae fotos de lugares ni retratos de criaturas que sirvan para una
ficha; la wiki sí. Sus imágenes son CC BY-SA 3.0: por eso de cada una se guarda
el archivo, quién lo subió y la página del archivo, para poder dar el crédito.

Qué foto va con qué se decide leyendo la copia local (`wiki.py`); a Fandom sólo
se le pide la URL y el autor de cada archivo y la miniatura de 640 px. Escribe
los webp en `games/tft/ui/public/valheim/wiki/` y el índice con créditos en
`data/wiki_images.json`. Lo que ya está bajado con el mismo archivo de origen
no se vuelve a pedir, así que correrlo de nuevo es casi gratis.
"""
import html
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

from . import wiki

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
OUT_JSON = os.path.join(DATA, "wiki_images.json")
PUBLIC = os.path.normpath(os.path.join(HERE, "..", "..", "tft", "ui", "public", "valheim", "wiki"))
SRC_PREFIX = "/valheim/wiki/"
LOCAL_IMAGES = os.path.join(wiki.WIKI, "images")

SITE = "https://valheim.fandom.com"
API = SITE + "/api.php"
# El mismo que `Desktop/valheim-wiki/dump.py`: Fandom lo acepta y dice quiénes somos.
UA = "vestigo-local-mirror/1.0 (personal offline copy; contact via fandom user)"
WIDTH = 640
MAX_BYTES = 80 * 1024
IMG_RE = re.compile(r"[^|\[\]\n{}<>=]+?\.(?:png|jpe?g|webp|gif)", re.I)
# Dónde pone la foto cada ficha, en orden de preferencia (Lord Reto sólo tiene la de
# 2 estrellas; las fichas de estructura, como Volture Nest, la llaman `appearance`).
IMAGE_KEYS = ("image 0star", "image", "image 1star", "image 2star", "appearance")


def slugify(name: str) -> str:
    """Copia de `site.slugify` (el mismo que `route.ts`), para no depender de site.py."""
    s = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"['.]", "", s.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def wiki_url(title: str) -> str:
    return SITE + "/wiki/" + urllib.parse.quote(title.replace(" ", "_"), safe="/:()&',")


def api(params: dict) -> dict:
    """Un pedido a la API, con reintentos: Fandom a veces corta sin motivo."""
    url = API + "?" + urllib.parse.urlencode(dict(params, format="json"))
    return json.loads(fetch(url))


class Blocked(Exception):
    """El CDN de imágenes contestó con el desafío de Cloudflare: no se insiste ni se esquiva."""


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            # 403 es el "Just a moment…" de Cloudflare: reintentar sólo lo empeora.
            if e.code == 403:
                raise Blocked(url) from e
            print(f"  reintento {attempt + 1}: {e}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 — cualquier otro corte se reintenta igual
            print(f"  reintento {attempt + 1}: {e}", file=sys.stderr)
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"no se pudo bajar {url}")


def local_copy(f: str) -> bytes | None:
    """
    El archivo bajado a mano en `valheim-wiki/images/` (con espacios o guiones
    bajos): la salida cuando el CDN de Fandom pide el desafío del navegador.
    """
    for name in (f, f.replace(" ", "_")):
        p = os.path.join(LOCAL_IMAGES, name)
        if os.path.exists(p):
            with open(p, "rb") as fh:
                return fh.read()
    return None


def file_name(raw: str) -> str:
    """Normaliza como MediaWiki: espacios en vez de guiones bajos y la primera letra en mayúscula."""
    f = html.unescape(raw).replace("_", " ").strip()
    f = re.sub(r"^(?:File|Image):", "", f, flags=re.I).strip()
    return f[:1].upper() + f[1:]


def pick_image(value: str, name: str) -> str | None:
    """
    El archivo de un campo de imagen. Puede venir suelto, como `[[File:…]]` o
    dentro de un `<gallery>`/tabber; en la galería gana la línea cuyo archivo o
    leyenda es el nombre buscado (Zil y Thungr comparten página), si no la primera.
    """
    value = html.unescape(value or "")
    if "<gallery" in value or "<tabber" in value:
        want = wiki.norm(name)
        lines = [ln for ln in value.split("\n") if IMG_RE.search(ln)]
        for ln in lines:
            f, _, caption = ln.partition("|")
            if want in (wiki.norm(os.path.splitext(file_name(f))[0]), wiki.norm(caption)):
                return file_name(IMG_RE.search(f).group(0))
        value = lines[0] if lines else ""
    m = IMG_RE.search(re.sub(r"\[\[(?:File|Image):", "", value, flags=re.I))
    return file_name(m.group(0)) if m else None


def page_images(title: str, fields: dict, name: str, first: str | None = None) -> list[str]:
    """
    Las fotos candidatas de una página, de mejor a peor: la de la ficha; la del
    texto crudo si el lector no separó los campos (fichas en una sola línea,
    como la de Barka); y las `[[File:]]` de la página. Van varias porque la
    ficha a veces nombra un archivo que la wiki no tiene (Moose.png).
    """
    out = [first] if first else []
    for k in IMAGE_KEYS:
        out.append(pick_image(fields.get(k, ""), name))
    text = wiki.pages().get(title, "")
    for k in IMAGE_KEYS:
        m = re.search(r"\|\s*" + re.escape(k).replace(r"\ ", r"[ _]") + r"\s*=\s*([^|}]+)", text, re.I)
        out.append(m and pick_image(m.group(1), name))
    for m in re.findall(r"\[\[(?:File|Image):([^|\]]+)", text, re.I)[:3]:
        out.append(file_name(m) if IMG_RE.fullmatch(m.strip()) else None)
    return [f for f in dict.fromkeys(out) if f]


_redirects: dict[str, str] = {}


def resolve_live(names: list[str]) -> None:
    """
    La copia local no guarda redirecciones ("Zil" → "Zil & Thungr", "Dvergr
    Harbour" → "Dvergr Harbor"): para lo que no se encuentra se le pregunta a la wiki.
    """
    names = [n for n in names if n not in _redirects]
    for i in range(0, len(names), 50):
        q = api({"action": "query", "titles": "|".join(names[i:i + 50]), "redirects": 1})["query"]
        step = {x["from"]: x["to"] for x in q.get("normalized", [])}
        redir = {x["from"]: x["to"] for x in q.get("redirects", [])}
        for n in names[i:i + 50]:
            t = step.get(n, n)
            _redirects[n] = redir.get(t, t)


def find_page(name: str):
    """(título, tipo de ficha o None, campos) de un nombre, local primero y después por redirección."""
    b = wiki.lookup(name)
    if b:
        return b
    by_norm = {wiki.norm(t): t for t in wiki.pages()}
    for n in (name, _redirects.get(name)):
        if n and wiki.norm(n) in by_norm:
            t = by_norm[wiki.norm(n)]
            box = wiki.infobox(wiki.pages()[t])
            return (t, box[0], box[1]) if box else (t, None, {})
        if n and n != name and wiki.lookup(n):
            return wiki.lookup(n)
    return None


def biome_lists() -> dict[str, dict[str, list[str]]]:
    """
    bioma → {"structures": [...], "dungeons": [...]} como destinos de enlace.
    `wiki.biome_boxes()` junta en uno los enlaces separados por salto sin viñeta
    ("Putrid Hole Tomb of Lord Reto"); los enlaces del campo crudo no fallan.
    """
    out = {}
    for title, text in wiki.pages().items():
        b = wiki.infobox(text)
        bs = wiki.biomes_in(title)
        if b and b[0] == "biome" and len(bs) == 1:
            out[bs[0]] = {k: wiki.links(b[1].get(k, "")) for k in ("structures", "dungeons")}
    return out


def image_info(files: list[str]) -> dict[str, dict]:
    """archivo → {thumb, page, author, ow, oh}, de a 50 por pedido."""
    out = {}
    for i in range(0, len(files), 50):
        chunk = files[i:i + 50]
        params = {"action": "query", "prop": "imageinfo", "iiprop": "url|user|size|mime", "iiurlwidth": WIDTH,
                  "redirects": 1, "titles": "|".join("File:" + f for f in chunk)}
        # Nombre pedido → título final. Al revés no sirve: dos archivos pueden
        # redirigir al mismo ("Eikthyr Definitive.png" → "Eikthyr.png").
        final = {f: "File:" + f for f in chunk}
        cont = {}
        # Con miniaturas, la API devuelve de a pocas y sigue con `continue`: sin
        # esto, la mitad de los archivos parecían no existir.
        while True:
            d = api({**params, **cont})
            q = d.get("query", {})
            for key in ("normalized", "redirects"):
                step = {x["from"]: x["to"] for x in q.get(key, [])}
                final = {f: step.get(t, t) for f, t in final.items()}
            for p in q.get("pages", {}).values():
                ii = (p.get("imageinfo") or [None])[0]
                if ii:
                    for f, t in final.items():
                        if t == p["title"]:
                            out[f] = {"thumb": ii.get("thumburl") or ii["url"], "page": ii["descriptionurl"],
                                      "author": ii.get("user", ""), "ow": ii.get("width"), "oh": ii.get("height")}
            time.sleep(0.3)
            if "continue" not in d:
                break
            cont = d["continue"]
    return out


def to_webp(data: bytes, dest: str) -> tuple[int, int]:
    """Convierte a webp; si pasa de 80 KB baja la calidad y, en última instancia, el ancho."""
    im = Image.open(io.BytesIO(data))
    im.seek(0)
    alpha = im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info)
    im = im.convert("RGBA" if alpha else "RGB")
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    for q, w in ((80, None), (70, None), (60, None), (60, 480), (55, 400)):
        cur = im if not w or im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        buf = io.BytesIO()
        cur.save(buf, "WEBP", quality=q, method=6)
        if buf.tell() <= MAX_BYTES:
            break
    with open(dest, "wb") as f:
        f.write(buf.getvalue())
    return cur.width, cur.height


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    creatures = load_json(os.path.join(DATA, "site", "creatures.json"))
    bosses = load_json(os.path.join(DATA, "site", "bosses.json"))
    old = load_json(OUT_JSON) if os.path.exists(OUT_JSON) else {}
    os.makedirs(PUBLIC, exist_ok=True)

    # Qué hay que resolver en vivo: lo que la copia local no encuentra.
    lists = biome_lists()
    listed_names = [n for v in lists.values() for k in ("structures", "dungeons") for n in v[k]]
    names = [c["name"]["en"] for c in creatures + bosses] + listed_names
    resolve_live([n for n in dict.fromkeys(names) if not wiki.lookup(n)])

    # Los pedidos: (grupo, llave, archivo, título de la página, datos extra).
    wants, unmatched, no_image = [], [], {"creatures": [], "bosses": [], "places": []}
    for group, rows in (("bosses", bosses), ("creatures", creatures)):
        for c in rows:
            name = c["name"]["en"]
            b = find_page(name)
            if not b or (b[1] and "creature" not in b[1]):
                unmatched.append(f"{group}:{name}")
                no_image[group].append(name)
                continue
            fs = page_images(b[0], b[2], name)
            if not fs:
                no_image[group].append(name)
                continue
            wants.append((group, c["slug"], fs, b[0], {"name": name}))

    # Lugares: los de ficha con bioma, más los que nombra la ficha de cada bioma.
    places = {}
    for loc in wiki.locations():
        places[loc["title"]] = dict(loc, listed=[])
    skipped = []
    for biome, v in lists.items():
        for kind in ("structures", "dungeons"):
            for n in v[kind]:
                b = find_page(n)
                if not b:
                    skipped.append(f"{n} (sin página)")
                    continue
                # "structure" también: así se llaman las fichas de Volture Nest o Monument of Torment.
                if b[1] and b[1] not in ("location", "structure"):
                    skipped.append(f"{n} (ficha de {b[1]})")
                    continue
                p = places.setdefault(b[0], {"title": b[0], "type": "", "biomes": [], "image": None,
                                             "inhabitants": [], "resources": [], "listed": []})
                entry = {"biome": biome, "as": kind[:-1]}
                if entry not in p["listed"]:
                    p["listed"].append(entry)
    place_meta = {}
    for title, p in places.items():
        if not p["biomes"] and not p["listed"]:
            continue
        slug = slugify(title)
        meta = {k: p[k] for k in ("title", "type", "biomes", "inhabitants", "resources", "listed")}
        place_meta[slug] = meta
        box = wiki.infobox(wiki.pages().get(title, "")) or (None, {})
        fs = page_images(title, box[1], title, p["image"] and file_name(p["image"]))
        if not fs:
            no_image["places"].append(title)
            continue
        wants.append(("places", slug, fs, title, meta))

    # Cache: lo ya bajado con el mismo archivo de origen se reusa tal cual.
    cached = {}
    for group in ("creatures", "bosses", "places"):
        for e in (old.get(group) or {}).values():
            if e.get("file") and e.get("src") and os.path.exists(os.path.join(PUBLIC, e["src"][len(SRC_PREFIX):])):
                cached.setdefault(e["file"], e)
    info = image_info(sorted({f for _, _, fs, _, _ in wants for f in fs if f not in cached}))

    prefix = {"creatures": "creature", "bosses": "boss", "places": "place"}
    out = {"license": "CC BY-SA 3.0", "source": SITE, "creatures": {}, "bosses": {}, "places": {}}
    done, downloaded, from_local, missing_file, blocked = {}, 0, 0, [], False
    pending = set()  # los archivos que el CDN no dejó bajar
    for group, slug, fs, title, extra in wants:
        # El primer candidato que la wiki tiene de verdad.
        f = next((x for x in fs if x in cached or x in info), fs[0])
        if f in done or f in cached:
            # El mismo archivo para dos llaves (un jefe también es criatura): un solo webp.
            img = {k: (done.get(f) or cached[f])[k] for k in ("src", "file", "page", "author", "w", "h", "orig")
                   if k in (done.get(f) or cached[f])}
        elif f in info:
            i = info[f]
            name = f"{prefix[group]}-{slug}.webp"
            data = local_copy(f)
            try:
                if data is None and not blocked:
                    data = fetch(i["thumb"])
                    downloaded += 1
                    time.sleep(0.3)
                elif data is not None:
                    from_local += 1
            except Blocked:
                blocked = True
                print("  el CDN de Fandom pide el desafío de Cloudflare: no se baja nada más", file=sys.stderr)
            except Exception as e:  # noqa: BLE001 — una foto rota no frena al resto
                print(f"  falló {f}: {e}", file=sys.stderr)
            if data is None:
                # Sin webp pero con el crédito ya resuelto: al volver a correr (con el
                # archivo en valheim-wiki/images/ o el CDN respondiendo) se completa.
                pending.add(f)
                no_image[group].append(title)
                out[group][slug] = {**extra, "src": None, "file": f, "page": i["page"], "author": i["author"],
                                    "wiki": wiki_url(title)}
                continue
            try:
                w, h = to_webp(data, os.path.join(PUBLIC, name))
            except Exception as e:  # noqa: BLE001 — un archivo que Pillow no abre
                print(f"  no se pudo convertir {f}: {e}", file=sys.stderr)
                no_image[group].append(title)
                continue
            img = {"src": SRC_PREFIX + name, "file": f, "page": i["page"], "author": i["author"],
                   "w": w, "h": h, "orig": {"w": i["ow"], "h": i["oh"]}}
        else:
            missing_file.append(f"{title}: {f}")
            no_image[group].append(title)
            continue
        done.setdefault(f, img)
        out[group][slug] = {**extra, **img, "wiki": wiki_url(title)}

    # Todas las criaturas y jefes del sitio van, con `src: null` si no hay foto,
    # para que quien lea el JSON no tenga que adivinar si falta o no se buscó.
    for group, rows in (("bosses", bosses), ("creatures", creatures)):
        for c in rows:
            out[group].setdefault(c["slug"], {"name": c["name"]["en"], "src": None})
    # Los lugares sin foto también van: el sitio los lista por bioma igual.
    for slug, meta in place_meta.items():
        out["places"].setdefault(slug, {**meta, "src": None, "wiki": wiki_url(meta["title"])})
    for group in ("creatures", "bosses", "places"):
        out[group] = dict(sorted(out[group].items()))

    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)

    with_img = {g: sum(1 for e in out[g].values() if e.get("src")) for g in ("creatures", "bosses", "places")}
    print(f"bajadas: {downloaded} · de la copia local: {from_local} · pendientes: {len(pending)} · {OUT_JSON}")
    if blocked:
        print(f"el CDN (static.wikia.nocookie.net) contestó con el desafío de Cloudflare; "
              f"los que quedaron con src null se pueden dejar a mano en {LOCAL_IMAGES}")
    for g in ("creatures", "bosses", "places"):
        print(f"{g}: {with_img[g]} con foto, {len(no_image[g])} sin foto")
        if no_image[g]:
            print("   sin foto: " + ", ".join(sorted(set(no_image[g]))))
    if unmatched:
        print("sin página en la wiki: " + ", ".join(unmatched))
    if skipped:
        print("nombrados en las fichas de bioma y dejados afuera: " + ", ".join(skipped))
    if missing_file:
        print("archivos que la wiki no tiene: " + "; ".join(missing_file))


if __name__ == "__main__":
    main()
