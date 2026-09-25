"""
El Planificador (2026-09-25): `data/site/planner.json`, el grafo con el que la
pestaña calcula cuánto juntar de cada cosa y dónde.

Pedido de ZoTaD: eliges lo que quieres fabricar y te dice qué juntar, cuánto y
de dónde sale. Diseño: docs/design/2026-09-25-valheim-planificador.md. Lo arma
`site.py` al final, con las referencias ya resueltas; la web sólo suma.
"""
from .fixes import PLANNER_PREFER

CATS = ("weapons", "armor", "tools", "foods", "meads", "materials", "building", "bosses")
# Lo que se junta en la zona primero (la madera se tala, no se le saca a un
# enanogrís), después lo que sueltan las criaturas y al final el botín.
HOW_ORDER = ["mine", "tree", "pickable", "farm", "fish", "extract", "drop", "location", "destructible", "trader", "chest"]
MAX_SOURCES = 4


def is_idol(iid: str) -> bool:
    """Los ídolos de la forja oculta (1.0, wiki "Bronze Battle Idol"): botín para una mejora al azar, no un material."""
    return iid.startswith("Upgrader")


def build(items, recipes, pieces, conversions, bosses, ref, tier_of, station_ref, src, listed) -> dict:
    """
    `listed`: los ids publicados en cada pestaña ({"SwordIron": "weapons",
    "piece:forge": "building"}). Entra al catálogo lo que de eso se fabrica, se
    cocina o se construye, más las ofrendas de cada jefe; el resto del grafo son
    sus ingredientes.
    """
    recipe: dict[str, dict] = {}
    by_item: dict[str, list] = {}
    for r in recipes:
        by_item.setdefault(r["item"], []).append(r)
    for iid, rs in by_item.items():
        # Con dos recetas (bronce de a 1 y de a 5) va la más chica: suma exacto.
        r = min(rs, key=lambda x: (x["amount"], x["level"]))
        recipe[iid] = {"st": r["station"], "lv": r["level"], "n": r["amount"],
                       "req": [[q["item"], q["amount"], q.get("perLevel", 0)] for q in r["requirements"] if not is_idol(q["item"])],
                       **({"any": True} if r.get("anyOne") else {})}
    for pid, p in pieces.items():
        recipe[f"piece:{pid}"] = {"st": p["station"], "lv": 1, "n": 1, "req": [[q["item"], q["amount"], 0] for q in p["requirements"]]}
    altars = {}
    for b in bosses:
        s, key = b["summon"], f"boss:{b['id']}"
        if s.get("item") and key in ref:
            recipe[key] = {"st": f"altar:{b['id']}", "lv": 1, "n": 1, "req": [[s["item"], s["amount"], 0]]}
            altars[f"altar:{b['id']}"] = {"name": s.get("altar") or ref[key]["name"], "icon": None, "slug": ref[key]["slug"], "tab": ref[key]["tab"]}

    # Una conversión por par: la misma carne se asa en dos estaciones de cocina.
    convert: dict[str, list] = {}
    for c in sorted(conversions, key=lambda c: (c["to"], c["from"])):
        rows = convert.setdefault(c["to"], [])
        if any(x["from"] == c["from"] for x in rows):
            continue
        row = {"st": c["station"], "from": c["from"], "time": c.get("time"), "n": c.get("yield") or 1}
        if c.get("fuel"):
            row["fuel"] = [c["fuel"]["item"], c["fuel"]["perProduct"]]
        rows.append(row)

    # Lo fundido del Norte profundo (1.0): la pieza "Cast: Nord Sword" se hace en
    # la forja negra con los mismos materiales y se termina en la fundición
    # helada. No es otro camino: es el último paso de la receta del objeto.
    for k in list(convert):
        casts = [c for c in convert[k] if c["from"] in recipe and k in recipe]
        if casts:
            recipe[k]["post"] = casts[0]["st"]
            convert[k] = [c for c in convert[k] if c not in casts]
            if not convert[k]:
                del convert[k]

    catalog = {k: cat for k, cat in listed.items() if cat in CATS and (k in recipe or k in convert)}
    catalog |= {k: "bosses" for k in recipe if k.startswith("boss:")}

    # Todo lo que se alcanza desde el catálogo por recetas, conversiones y combustible.
    seen, todo = set(), list(catalog)
    while todo:
        k = todo.pop()
        if k in seen or k not in ref:
            continue
        seen.add(k)
        todo += [q[0] for q in recipe.get(k, {}).get("req", [])]
        for c in convert.get(k, []):
            todo.append(c["from"])
            if c.get("fuel"):
                todo.append(c["fuel"][0])

    out_items = {}
    for k in sorted(seen):
        r, it = ref[k], items.get(k) or {}
        row = {"name": r["name"], "icon": r["icon"], "weight": it.get("weight", 0), "tier": tier_of(k), "slug": r["slug"], "tab": r["tab"]}
        if k in catalog:
            row["cat"] = catalog[k]
        if (it.get("maxQuality") or 1) > 1:
            row["maxQ"] = it["maxQuality"]
        out_items[k] = row

    out_recipes = {k: {**r, "req": [q for q in r["req"] if q[0] in out_items]} for k, r in recipe.items() if k in out_items}
    out_convert = {}
    for k, rows in convert.items():
        if k not in out_items:
            continue
        ok = [c for c in rows if c["from"] in out_items and (not c.get("fuel") or c["fuel"][0] in out_items)]
        if ok:
            out_convert[k] = ok

    def summary(k):
        it = items.get(k)
        if not it:
            return []
        rows, keys = [], set()
        for s in it["sources"]:
            if s["kind"] not in ("drop", "gather", "farm", "trader"):
                continue
            x = src(s)
            how = x.get("how") or x["kind"]
            name = (x.get("ref") or {}).get("name") if x["kind"] == "drop" else x.get("name")
            if x["kind"] == "drop" and not name:
                continue  # una criatura que no se lista (variante de prueba)
            key = (how, (name or {}).get("en"))
            if key in keys:
                continue
            keys.add(key)
            row = {"how": how, "biomes": x.get("biomes") or [], "name": name}
            if x["kind"] == "drop":
                row |= {"slug": x["ref"]["slug"], "tab": x["ref"]["tab"]}
            for f in ("chance", "min", "max", "price"):
                if x.get(f) is not None:
                    row[f] = x[f]
            rows.append(row)
        rows.sort(key=lambda r: HOW_ORDER.index(r["how"]) if r["how"] in HOW_ORDER else len(HOW_ORDER))
        return rows[:MAX_SOURCES]

    sources = {k: v for k in out_items if (v := summary(k))}

    tokens = ({r["st"] for r in out_recipes.values() if r["st"]} | {r["post"] for r in out_recipes.values() if r.get("post")}
              | {c["st"] for rows in out_convert.values() for c in rows})
    stations = {}
    for t in sorted(tokens):
        if t in altars:
            stations[t] = altars[t]
            continue
        s = station_ref(t)
        if s:
            stations[t] = {"name": s["name"], "icon": s["icon"], "slug": s["slug"], "tab": s["tab"]}

    prefer = {k: v for k, v in PLANNER_PREFER.items() if k in out_items}
    return {"items": out_items, "recipes": out_recipes, "convert": out_convert, "sources": sources, "stations": stations, "prefer": prefer}
