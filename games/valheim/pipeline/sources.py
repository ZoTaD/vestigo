"""
"De dónde sale" y "se usa en": los cruces que la ficha de cada objeto muestra.

Todo sale de registros ya limpios (`records.py`), así que acá no hay nada del
juego: sólo índices invertidos. El orden de las fuentes es el de cómo lo
consigue un jugador — lo hace, lo convierte, lo caza, lo junta, lo cultiva,
lo compra.
"""
from collections import defaultdict


def build_sources(recipes, conversions, creatures, gatherables, traders, farms=()) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = defaultdict(list)
    for r in recipes:
        out[r["item"]].append({"kind": "craft", "station": r["station"], "level": r["level"], "amount": r["amount"]})
    for c in conversions:
        out[c["to"]].append({"kind": "convert", "station": c["station"], "from": c["from"], "time": c.get("time"), "yield": c.get("yield")})
    for cid, cr in creatures.items():
        for d in cr["drops"]:
            out[d["item"]].append({"kind": "drop", "from": cid, "min": d["min"], "max": d["max"], "chance": d["chance"], "biomes": cr["biomes"]})
    for g in gatherables:
        for it in g["drops"]["items"]:
            out[it["item"]].append({"kind": "gather", "from": g["id"], "how": g["kind"], "biomes": g["biomes"]})
    # Cultivos (brotes del cultivador) y la colmena: `biomes` es dónde se puede
    # plantar o poner, no dónde aparece solo.
    for f in farms:
        out[f["item"]].append({"kind": "farm", "from": f["id"], "biomes": f["biomes"]})
    for tid, t in traders.items():
        for i in t["items"]:
            out[i["item"]].append({"kind": "trader", "from": tid, "price": i["price"], "stack": i["stack"], "requiredKey": i["requiredKey"]})
    return dict(out)


def build_used_in(recipes, conversions, pieces) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = defaultdict(list)
    for r in recipes:
        for q in r["requirements"]:
            out[q["item"]].append({"kind": "recipe", "item": r["item"], "amount": q["amount"]})
    for pid, p in pieces.items():
        for q in p["requirements"]:
            out[q["item"]].append({"kind": "piece", "item": pid, "amount": q["amount"]})
    for c in conversions:
        out[c["from"]].append({"kind": "convert", "item": c["to"], "station": c["station"]})
    return dict(out)


def share_by_name(items: dict) -> None:
    """
    Un objeto sin fuentes toma las de otro que se llama igual.

    El juego duplica los banquetes (1.0): `FeastDeepNorth` es el que se come y
    otro prefab con el mismo nombre es el que se fabrica en la mesa de
    preparación. Sin esto, "Desayuno del norte" aparecía sin receta.
    """
    by_name: dict[str, list[str]] = defaultdict(list)
    for pid, it in items.items():
        by_name[it["name"]["en"]].append(pid)
    for pid, it in items.items():
        if it["sources"]:
            continue
        for other in by_name[it["name"]["en"]]:
            if other != pid and items[other]["sources"]:
                it["sources"] = [dict(s, via=other) for s in items[other]["sources"] if "via" not in s]
                break
