"""
Arma el catálogo de CS2 del sitio en `games/cs2/data/` (2026-11-03) a partir de ByMykel/CSGO-API (MIT) en `raw/`.

    python games/cs2/tools/site_data.py

Por pestaña (`skins`, `cases`, `collections`): `list.json` liviano y las fichas en `f/NN.json` (`{slug: ficha}`), NN =
`shard(slug)`. Los nombres van en inglés en los dos idiomas (decisión de ZoTaD, 3/11). Los precios no están acá: los
arma `prices.py` en `games/cs2/prices/`, todos los días. `meta.json` lleva la fecha del último cambio de catálogo
(`lastmod` del sitemap) y el hash de lo crudo, para no moverla si nada cambió.
"""
import hashlib
import re
import shutil
import sys
from datetime import date

from cs2 import CHUNKS, DATA, RAW, WEARS, load, rarity, shard, slugify, write_json

# La categoría de ByMykel → la del sitio. `equipment` es el Zeus.
CATS = {
    "csgo_inventory_weapon_category_rifles": "rifles",
    "csgo_inventory_weapon_category_pistols": "pistols",
    "csgo_inventory_weapon_category_smgs": "smgs",
    "csgo_inventory_weapon_category_heavy": "heavy",
    "sfui_invpanel_filter_melee": "knives",
    "sfui_invpanel_filter_gloves": "gloves",
    "loadoutslot_equipment": "equipment",
}
# Los grupos de una caja, de la rareza más alta a la más baja.
ORDEN = ["contraband", "extraordinary", "covert", "classified", "restricted", "milspec", "industrial", "consumer"]
TABS = ("skins", "cases", "collections")


def _fecha(s: str | None) -> str | None:
    if not s:
        return None
    a, m, d = re.split(r"[-/]", s)
    return f"{int(a):04d}-{int(m):02d}-{int(d):02d}"


def _texto(s: str | None) -> str:
    """La descripción de ByMykel trae `\\n` escritos y etiquetas `<i>`: queda texto plano con saltos de línea."""
    if not s:
        return ""
    s = s.replace("\\n", "\n").replace('\\"', '"')
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\n{3,}", "\n\n", s).strip()


# Lo que `slugify` borraría y deja dos skins con el mismo slug: los kanji de "Sunset Storm 壱/弐" (uno y dos).
LETRAS = {"壱": " ichi", "弐": " ni"}


def _slug_skin(s: dict) -> str:
    nombre = s["name"] + (f" {s['phase']}" if s.get("phase") else "")
    for k, v in LETRAS.items():
        nombre = nombre.replace(k, v)
    return slugify(nombre)


def _kind(c: dict) -> str | None:
    """Qué contenedor es, o None si no va (cápsulas de stickers, kits de música, grafitis, pins, regalos vacíos)."""
    if c["type"] == "Case":
        return "case"
    if c["type"] == "Souvenir":
        return "souvenir"
    if c["type"] is None and "Terminal" in c["name"]:
        return "terminal"
    if c["type"] is None and c["name"].endswith("Package"):
        return "package"
    return None


def _grupos(ids: list[str], slug_de: dict, rar_de: dict) -> list[dict]:
    por = {}
    for i in ids:
        if i in slug_de:
            por.setdefault(rar_de[i], []).append(slug_de[i])
    return [{"rarity": r, "skins": por[r]} for r in ORDEN if r in por]


def build() -> dict:
    """{tab: {"list": [...], "fichas": [...]}, "images": {slug: url}}: todo lo que se escribe, sin escribir nada."""
    skins = [s for s in load("skins") if s["category"]["id"] in CATS]
    slug_de = {s["id"]: _slug_skin(s) for s in skins}
    rar_de = {s["id"]: rarity(s["rarity"]) for s in skins}
    crates, crate_slug = [], {}
    for c in load("crates"):
        k = _kind(c)
        ids = [i["id"] for i in c["contains"]]
        if not k or not ids or not all(i in slug_de for i in ids):
            continue
        crate_slug[c["id"]] = slugify(c["name"])
        crates.append((c, k))
    colls = load("collections")
    coll_slug = {c["id"]: slugify(c["name"]) for c in colls}
    images = {}
    # Otras imágenes que probar si la principal no baja (una fase de cuchillo con 404, un ícono SVG).
    fallbacks: dict[str, list[str]] = {}

    # Las fases de una misma skin (Doppler, Gamma Doppler) se enlazan entre sí.
    por_nombre = {}
    for s in skins:
        por_nombre.setdefault(s["name"], []).append(slug_de[s["id"]])
    sk_list, sk_fichas = [], []
    for s in skins:
        slug = slug_de[s["id"]]
        row = {
            "slug": slug, "name": s["name"], "weapon": s["weapon"]["name"], "cat": CATS[s["category"]["id"]],
            "rarity": rar_de[s["id"]], "min": s["min_float"], "max": s["max_float"],
            "st": bool(s.get("stattrak")), "sv": bool(s.get("souvenir")), "img": slug,
        }
        if s.get("phase"):
            row["phase"] = s["phase"]
        sk_list.append(row)
        sk_fichas.append({
            **row,
            "desc": _texto(s.get("description")),
            "wears": [w["name"] for w in s.get("wears") or []],
            "cases": [crate_slug[c["id"]] for c in s.get("crates") or [] if c["id"] in crate_slug],
            "collections": [coll_slug[c["id"]] for c in s.get("collections") or [] if c["id"] in coll_slug],
            "variants": [v for v in por_nombre[s["name"]] if v != slug],
        })
        images[slug] = s["image"]

    # Una fase sin imagen usa la de otra fase del mismo cuchillo.
    for f in sk_fichas:
        fallbacks.setdefault(f["slug"], []).extend(images[v] for v in f["variants"])

    cs_list, cs_fichas = [], []
    for c, k in crates:
        slug = crate_slug[c["id"]]
        rare = [slug_de[i["id"]] for i in c.get("contains_rare") or [] if i["id"] in slug_de]
        row = {"slug": slug, "name": c["name"], "kind": k, "date": _fecha(c.get("first_sale_date")), "img": slug, "n": len(c["contains"])}
        cs_list.append(row)
        cs_fichas.append({**row, "groups": _grupos([i["id"] for i in c["contains"]], slug_de, rar_de), "rare": rare})
        images[slug] = c["image"]

    co_list, co_fichas = [], []
    for c in colls:
        slug = coll_slug[c["id"]]
        ids = [i["id"] for i in c["contains"] if i["id"] in slug_de]
        if not ids:  # colecciones de stickers o llaveros: no van en la etapa 1
            continue
        row = {"slug": slug, "name": c["name"], "date": _fecha(c.get("release_date")), "img": slug, "n": len(ids)}
        co_list.append(row)
        co_fichas.append({**row, "groups": _grupos(ids, slug_de, rar_de), "cases": [crate_slug[x["id"]] for x in c.get("crates") or [] if x["id"] in crate_slug]})
        # Los íconos de colección nuevos vienen en SVG (Pillow no los lee): respaldo, su PNG y si no la skin más rara.
        if c.get("image"):
            images[slug] = c["image"]
        respaldo = fallbacks.setdefault(slug, [])
        if (c.get("image") or "").endswith(".svg"):
            respaldo.append(c["image"].replace(".svg", "_png.png"))
        la_mas_rara = co_fichas[-1]["groups"][0]["skins"][0]
        if la_mas_rara in images:
            respaldo.append(images[la_mas_rara])

    # Cajas y colecciones de la más nueva a la más vieja; skins por arma y nombre.
    nueva = lambda r: r["date"] or ""
    cs_list.sort(key=nueva, reverse=True)
    co_list.sort(key=nueva, reverse=True)
    sk_list.sort(key=lambda r: (r["weapon"], r["name"], r.get("phase", "")))
    return {
        "skins": {"list": sk_list, "fichas": sk_fichas},
        "cases": {"list": cs_list, "fichas": cs_fichas},
        "collections": {"list": co_list, "fichas": co_fichas},
        "images": images,
        "fallbacks": fallbacks,
    }


def _hash_crudo() -> str:
    h = hashlib.sha256()
    for n in ("skins", "crates", "collections"):
        h.update((RAW / f"{n}.json").read_bytes())
    return h.hexdigest()


def main() -> None:
    d = build()
    for tab in TABS:
        carpeta = DATA / tab / "f"
        if carpeta.exists():
            shutil.rmtree(carpeta)
        write_json(DATA / tab / "list.json", d[tab]["list"])
        partes = [{} for _ in range(CHUNKS)]
        for f in d[tab]["fichas"]:
            partes[shard(f["slug"])][f["slug"]] = f
        for i, p in enumerate(partes):
            write_json(carpeta / f"{i:02d}.json", p)
        print(f"{tab}: {len(d[tab]['list'])}")
    crudo = _hash_crudo()
    meta_f = DATA / "meta.json"
    viejo = __import__("json").loads(meta_f.read_text(encoding="utf-8")) if meta_f.exists() else {}
    # La portada del sitio muestra los conteos sin bajar las listas.
    counts = {tab: len(d[tab]["list"]) for tab in TABS}
    fecha = viejo.get("generatedAt") if viejo.get("catalog") == crudo else date.today().isoformat()
    write_json(meta_f, {"generatedAt": fecha, "catalog": crudo, "counts": counts})


if __name__ == "__main__":
    main()
    sys.exit(0)
