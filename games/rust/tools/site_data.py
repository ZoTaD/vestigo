"""
Los archivos que baja la pestaña Objetos de Rust (2026-10-05), armados de lo que escribieron `extract.py` (objetos,
recetas, reciclaje) y `world.py` (botín, tiendas). No lee el juego: corre en un segundo.

Escribe en `games/rust/data/site/`:
  - `list.json`: la lista liviana (id, slugs, nombres, categoría) y las categorías con objetos, en orden;
  - `items/NN.json`: las fichas, repartidas en 32 archivos por el hash del slug, para que cada página baje uno solo;
  - `slugs-es.json`: los slugs en español que cambian, para que la pestaña traduzca una dirección antes de bajar nada.

Uso, desde la raíz del repo:
    python games/rust/tools/site_data.py
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = DATA / "site"
# 1.032 fichas en 32 archivos: ~32 por archivo, ~8 KB con gzip cada uno.
SHARDS = 32
# El orden de los filtros: el del inventario del juego.
CATEGORY_ORDER = [
    "weapon", "construction", "items", "resources", "attire", "tool", "medical", "food", "ammunition", "traps",
    "misc", "component", "electrical", "fun",
]


def fnv1a32(s):
    """FNV-1a de 32 bits sobre los bytes UTF-8 de `s`: `pzHash` de site/src/zomboid/shard.ts paso por paso."""
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def shard(slug, n=SHARDS):
    """El archivo de una ficha: `pzShardOf(slug, 32)` del sitio. Si se cambia uno se cambia el otro."""
    return f"{fnv1a32(slug) % n:02d}"


def recycled_from(items, ref):
    """
    La inversa del reciclaje: por cada objeto, qué otros lo dan al reciclarlos y cuánto por unidad al 100 % (la chatarra
    fija va con `scrap: True`, porque el sitio la escala distinto). De lo que más da a lo que menos.
    """
    out = {}
    for i in items:
        rec = i.get("recycle")
        if not i["slug"] or not rec:
            continue
        for o in rec["out"]:
            out.setdefault(o["id"], []).append({**ref(i["id"]), "amount": o["amount"], "scrap": False})
        if rec["scrap"]:
            out.setdefault("scrap", []).append({**ref(i["id"]), "amount": rec["scrap"], "scrap": True})
    for rows in out.values():
        # Todo a la escala de la recicladora verde (50 %): la chatarra fija se multiplica por 1 y el resto por 0,5, así que
        # con la cantidad cruda una fila de chatarra quedaría el doble de arriba de lo que da. Duplicado para seguir con enteros.
        rows.sort(key=lambda r: (-(r["amount"] * 2 if r["scrap"] else r["amount"]), r["name"]["en"].lower(), r["id"]))
    return out


def repair_of(i, ref):
    """La reparación en el banco, con cada ingrediente como referencia (para el ícono y el enlace)."""
    r = i.get("repair")
    if not r:
        return None
    return {"cost": [{**ref(c["id"]), "amount": c["amount"]} for c in r["cost"]], "bp": r["bp"], "loss": r["loss"]}


def use_of(i, ref):
    """Los efectos de usarlo o comerlo, con el objeto en el que se pudre como referencia."""
    u = i.get("use")
    if not u:
        return None
    spoil = u.get("spoil")
    if spoil:
        spoil = {"hours": spoil["hours"], "into": ref(spoil["into"]) if spoil.get("into") else None}
    return {"effects": u["effects"], "mods": u["mods"], "spoil": spoil}


def build(items_doc, loot, shops):
    items = items_doc["items"]
    by_id = {i["id"]: i for i in items}

    def ref(sid):
        # Un objeto sin ficha (redirect u oculto) igual se nombra, pero sin slug: el sitio no lo enlaza.
        i = by_id.get(sid)
        if i is None:
            return {"id": sid, "slug": None, "name": {"en": sid, "es": None}}
        return {"id": sid, "slug": i["slug"], "name": i["name"]}

    visible = sorted((i for i in items if i["slug"]), key=lambda i: (i["name"]["en"].lower(), i["id"]))
    used_in = {}
    for i in visible:
        for ing in (i["craft"] or {}).get("ingredients", []):
            used_in.setdefault(ing["id"], []).append(i["id"])
    recycled = recycled_from(items, ref)

    containers = loot["containers"]
    shops_by_item = {}
    for o in shops["orders"]:
        shops_by_item.setdefault(o["item"], []).append({
            "shop": shops["shops"][o["shop"]], "amount": o["amount"], "bp": o["bp"], "currency": ref(o["currency"]),
            "price": o["price"],
        })

    fichas = {}
    for i in visible:
        craft = None
        if i["craft"]:
            c = i["craft"]
            craft = {
                "amount": c["amount"], "time": c["time"], "workbench": c["workbench"],
                "researchScrap": c.get("researchScrap"), "default": c["default"],
                "ingredients": [{**ref(g["id"]), "amount": g["amount"]} for g in c["ingredients"]],
            }
        recycle = None
        if i.get("recycle"):
            recycle = {
                "scrap": i["recycle"]["scrap"],
                "out": [{**ref(o["id"]), "amount": o["amount"]} for o in i["recycle"]["out"]],
                "eff": items_doc["recyclers"],
            }
        fichas[i["slug"]] = {
            "id": i["id"], "itemid": i["itemid"], "slug": i["slug"], "slugEs": i["slugEs"], "name": i["name"],
            "desc": i["desc"], "cat": i["category"], "rarity": i["rarity"], "stack": i["stack"],
            "condition": i["condition"], "craft": craft,
            "despawn": i.get("despawn"),
            "repair": repair_of(i, ref),
            "use": use_of(i, ref),
            "usedIn": [ref(u) for u in used_in.get(i["id"], [])],
            "recycle": recycle,
            "recycledFrom": {"eff": items_doc["recyclers"], "rows": recycled[i["id"]]} if i["id"] in recycled else None,
            "loot": [{"c": r["c"], "name": containers[r["c"]], "chance": r["chance"], "min": r["min"], "max": r["max"], "bp": r["bp"]}
                     for r in loot["items"].get(i["id"], [])],
            "shops": shops_by_item.get(i["id"], []),
        }

    present = {i["category"] for i in visible}
    return {
        "list": {
            "cats": [c for c in CATEGORY_ORDER if c in present],
            "rows": [{"id": i["id"], "slug": i["slug"], "slugEs": i["slugEs"], "en": i["name"]["en"], "es": i["name"]["es"], "cat": i["category"]}
                     for i in visible],
        },
        "fichas": fichas,
        "slugsEs": {"items": {i["slug"]: i["slugEs"] for i in visible if i["slugEs"] != i["slug"]}},
    }


def main():
    load = lambda n: json.loads((DATA / n).read_text(encoding="utf-8"))  # noqa: E731
    out = build(load("items.json"), load("loot.json"), load("shops.json"))
    (OUT / "items").mkdir(parents=True, exist_ok=True)
    dump = lambda path, obj: path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")  # noqa: E731
    dump(OUT / "list.json", out["list"])
    dump(OUT / "slugs-es.json", out["slugsEs"])
    # Todos los archivos siempre, aunque alguno quede vacío: el sitio los carga con un glob.
    shards = {f"{n:02d}": {} for n in range(SHARDS)}
    for slug, f in out["fichas"].items():
        shards[shard(slug)][slug] = f
    for n, content in shards.items():
        dump(OUT / "items" / f"{n}.json", content)
    print(f"[rust] sitio: {len(out['fichas'])} fichas en {SHARDS} archivos")


if __name__ == "__main__":
    main()
