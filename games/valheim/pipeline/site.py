"""
De los datos del extractor a lo que consume la web.

  cd games/valheim && .venv/Scripts/python -m pipeline.site

Lee `data/*.json` (lo que escribe `pipeline.extract`) y escribe `data/site/`:
una lista por pestaña con todo lo que la ficha necesita ya resuelto —cada
ingrediente, fuente y uso como `{slug, tab, name, icon}`—, un índice buscable y
las guías de biomas y jefes. Así la web no cruza nada: abre la pestaña y dibuja.

Se corre después de `extract`, en cada parche. Tarda un segundo.
"""
import json
import os
import re
import unicodedata
from collections import defaultdict

from .biomes import BIOMES, BIOME_ORDER
from .tiers import armor_slot, food_focus, item_tier, mead_effect, weapon_class

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
OUT = os.path.join(DATA, "site")

KIND_TAB = {"food": "foods", "mead": "meads", "weapon": "weapons", "armor": "armor", "tool": "tools",
            "ammo": "tools", "material": "materials", "trophy": "materials", "misc": "materials"}

# Los consejos de Hugin y Munin que corresponden a cada bioma y a cada jefe.
# Elegidos leyendo los 40 temas del juego (2026-09-24): los que hablan del
# lugar o de lo que se consigue ahí.
HUGIN_BIOME = {
    "meadows": ["stemple1", "start", "food", "hammer", "workbench"],
    "blackforest": ["blackforest", "pickaxe", "ore", "smelter", "crypt"],
    "swamp": ["crypt"],
    "mountain": ["cold"],
    "ashlands": ["ashlands", "ashlandocean", "artisan_extension", "batteringram", "shieldgenerator"],
    "deepnorth": ["mould_hugin", "upgrader_hugin", "jotuninvasion_hugin"],
}
HUGIN_BOSS = {"Eikthyr": ["altar", "bosstrophy", "stemple4"], "Bonemass": ["wishbone"],
              "FrozenKing": ["prison", "sacrificialblood", "end_hugin"]}
HUGIN_ALL_BOSSES = ["altar", "bosstrophy"]


def slugify(name: str) -> str:
    """El mismo que `route.ts`: ASCII, minúsculas, guiones."""
    s = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"['.]", "", s.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def clean_txt(t: dict) -> dict:
    """Algunos nombres del juego traen marcas de Unity (`<color=orange>Thungr</color>`)."""
    return {k: re.sub(r"</?color[^>]*>", "", v).strip() for k, v in t.items()}


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def dump(name, obj):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(os.path.join(OUT, name))


def main() -> None:
    items, recipes, pieces = load("items.json"), load("recipes.json"), load("pieces.json")
    conversions, stations, creatures = load("conversions.json"), load("stations.json"), load("creatures.json")
    gatherables, farms, traders = load("gatherables.json"), load("farms.json"), load("traders.json")
    bosses, environments, hugin = load("bosses.json"), load("environments.json"), load("hugin.json")
    piece_categories = load("piece_categories.json")
    biomes_meta = load("biomes.json")

    recipe_by_item = {r["item"]: r for r in recipes}
    req_by_item = {r["item"]: r["requirements"] for r in recipes}
    conv_from = defaultdict(list)
    for c in conversions:
        conv_from[c["to"]].append(c["from"])

    # --- Slugs únicos por pestaña, desde el nombre en inglés.
    ref: dict[str, dict] = {}
    taken = defaultdict(set)

    def claim(key, tab, name, icon):
        base = slugify(name["en"]) or slugify(key)
        slug, n = base, 2
        while slug in taken[tab]:
            slug, n = f"{base}-{n}", n + 1
        taken[tab].add(slug)
        ref[key] = {"slug": slug, "tab": tab, "name": name, "icon": icon}

    for pid, it in sorted(items.items(), key=lambda x: x[1]["name"]["en"]):
        claim(pid, KIND_TAB[it["kind"]], it["name"], it["icon"])
    for pid, p in sorted(pieces.items(), key=lambda x: x[1]["name"]["en"]):
        claim(f"piece:{pid}", "building", p["name"], p["icon"])
    # Criaturas que se listan: las que viven en algún bioma, sueltan algo o son
    # jefes. Las demás (variantes invocadas, crías de prueba, apariciones de
    # eventos; 19 el 2026-09-24) no tienen nada que mostrar en su ficha.
    boss_ids0 = {b["id"] for b in bosses}
    for c in creatures.values():
        c["name"] = clean_txt(c["name"])
    creatures = {k: c for k, c in creatures.items() if c["name"]["en"] and (c["biomes"] or c["drops"] or k in boss_ids0)}

    def creature_icon(c):
        """El trofeo; sin trofeo, lo primero que suelta (la gallina, su carne)."""
        if c.get("icon"):
            return c["icon"]
        for d in c.get("drops", []):
            ic = (items.get(d["item"]) or {}).get("icon")
            if ic:
                return ic
        return None

    for cid, c in sorted(creatures.items(), key=lambda x: x[1]["name"]["en"]):
        claim(f"creature:{cid}", "creatures", c["name"], creature_icon(c))
    for b in bosses:
        claim(f"boss:{b['id']}", "bosses", b["name"], creature_icon(b))
    for bit, bid, _ in BIOMES:
        name = next(m["name"] for m in biomes_meta if m["id"] == bid)
        ref[f"biome:{bid}"] = {"slug": bid, "tab": "biomes", "name": name, "icon": None}
        taken["biomes"].add(bid)

    # La estación enlaza a su pieza de construcción (por nombre en inglés).
    piece_by_en = {p["name"]["en"]: pid for pid, p in pieces.items()}

    def station_ref(tok):
        if not tok:
            return None
        st = stations.get(tok) or {}
        name = st.get("name") or {"en": tok, "es": tok}
        pid = piece_by_en.get(name["en"])
        r = ref.get(f"piece:{pid}") if pid else None
        return {"slug": r["slug"] if r else None, "tab": "building" if r else None, "name": name, "icon": st.get("icon") or (r or {}).get("icon")}

    tier = {pid: item_tier(pid, items, req_by_item and {k: v for k, v in req_by_item.items()}, conv_from) for pid in items}
    gname = {g["id"]: g.get("name") for g in gatherables}
    fname = {f["id"]: f.get("name") for f in farms}

    def src(s):
        """Una fuente del extractor, con la referencia resuelta para dibujarla."""
        k = s["kind"]
        out = {"kind": k, **{x: s[x] for x in ("level", "amount", "min", "max", "chance", "price", "stack", "requiredKey", "time", "yield", "how", "biomes") if x in s}}
        if k == "craft":
            out["station"] = station_ref(s["station"])
        elif k == "convert":
            out["station"] = station_ref(s["station"])
            out["ref"] = ref.get(s["from"])
        elif k == "drop":
            out["ref"] = ref.get(f"creature:{s['from']}")
        elif k == "gather":
            out["name"] = gname.get(s["from"])
            out["from"] = s["from"]
        elif k == "farm":
            out["name"] = fname.get(s["from"])
        elif k == "trader":
            out["name"] = (traders.get(s["from"]) or {}).get("name")
        if "via" in s:
            out["via"] = ref.get(s["via"])
        return out

    def use(u):
        key = f"piece:{u['item']}" if u["kind"] == "piece" else u["item"]
        r = ref.get(key)
        return {"kind": u["kind"], "amount": u.get("amount"), **(r or {})} if r else None

    def req_list(reqs):
        return [{**ref[q["item"]], "amount": q["amount"], "perLevel": q.get("perLevel", 0)} for q in reqs if q["item"] in ref]

    def base_row(pid, it):
        r = recipe_by_item.get(pid)
        return {
            "id": pid, **ref[pid], "desc": it["desc"], "tier": tier.get(pid),
            "weight": it["weight"], "stack": it["stack"], "value": it["value"] or None,
            "recipe": {"station": station_ref(r["station"]), "level": r["level"], "amount": r["amount"],
                       "req": req_list(r["requirements"])} if r else None,
            "sources": [src(s) for s in it["sources"]],
            "usedIn": [x for x in (use(u) for u in it["usedIn"]) if x],
        }

    tabs = defaultdict(list)
    for pid, it in items.items():
        row = base_row(pid, it)
        tab = KIND_TAB[it["kind"]]
        if tab == "foods":
            row.update(food=it["food"], focus=food_focus(it["food"]))
        elif tab == "meads":
            base = next((c for c in conversions if c["to"] == pid), None)
            row.update(effect=mead_effect(pid))
            if base and base["from"] in items:
                br = recipe_by_item.get(base["from"])
                row["chain"] = {"base": ref[base["from"]], "ferment": station_ref(base["station"]), "time": base["time"], "yield": base["yield"],
                                "station": station_ref(br["station"]) if br else None, "req": req_list(br["requirements"]) if br else []}
        elif tab == "weapons":
            row.update(damage=it["damage"], damagePerLevel=it["damagePerLevel"], cls=weapon_class(it["skill"]),
                       maxQuality=it["maxQuality"], blockPower=it["blockPower"])
        elif tab == "armor":
            row.update(slot=armor_slot(it["itemType"]), armor=it["armor"], armorPerLevel=it["armorPerLevel"],
                       blockPower=it["blockPower"], setName=it["setName"], maxQuality=it["maxQuality"])
        elif tab == "tools":
            low = pid.lower()
            row.update(toolKind="arrow" if "arrow" in low else "bolt" if "bolt" in low else "ammo" if it["kind"] == "ammo" else "tool",
                       damage=it["damage"], maxQuality=it["maxQuality"])
        elif tab == "materials":
            hows = set()
            for s in it["sources"]:
                hows.add(s.get("how") or s["kind"])
            used = {x["tab"] for x in row["usedIn"] if x}
            row.update(matKind="trophy" if it["kind"] == "trophy" else "material", hows=sorted(hows), usedFor=sorted(used),
                       biomes=sorted({b for s in it["sources"] for b in s.get("biomes") or []}, key=BIOME_ORDER.index))
        tabs[tab].append(row)

    # Lo que pasa en cada estación (pedido de ZoTaD, 2026-09-24: el molino tiene
    # que mostrar la cebada): lo que procesa (cebada → harina) y lo que se fabrica
    # o se construye ahí. Se cuelga de la pieza por el slug de su estación.
    processes, crafts = defaultdict(list), defaultdict(list)
    for c in conversions:
        st = station_ref(c["station"])
        if st and st["slug"] and c["from"] in ref and c["to"] in ref:
            processes[st["slug"]].append({"from": ref[c["from"]], "to": ref[c["to"]], "time": c.get("time"), "yield": c.get("yield")})
    for iid, r in recipe_by_item.items():
        st = station_ref(r["station"])
        if st and st["slug"] and iid in ref:
            crafts[st["slug"]].append({**ref[iid], "level": r["level"]})
    for pid, p in pieces.items():
        st = station_ref(p["station"])
        if st and st["slug"] and f"piece:{pid}" in ref:
            crafts[st["slug"]].append({**ref[f"piece:{pid}"], "level": 1})

    for pid, p in pieces.items():
        key = f"piece:{pid}"
        cat = (piece_categories.get(p["tool"]) or {}).get(str(p["category"]))
        slug = ref[key]["slug"]
        seen = set()
        made = [x for x in sorted(crafts.get(slug, []), key=lambda x: (x["level"], x["name"]["en"]))
                if not (x["slug"] in seen or seen.add(x["slug"]))]
        tabs["building"].append({
            "id": pid, **ref[key], "desc": p["desc"], "tool": p["tool"], "category": p["category"], "categoryName": cat,
            "comfort": p["comfort"], "station": station_ref(p["station"]), "req": req_list(p["requirements"]),
            "tier": max((t for t in (tier.get(q["item"]) for q in p["requirements"]) if t), key=BIOME_ORDER.index, default=None),
            "processes": processes.get(slug) or None,
            "crafts": made or None,
        })

    boss_ids = {b["id"] for b in bosses}
    for cid, c in creatures.items():
        tabs["creatures"].append({
            "id": cid, **ref[f"creature:{cid}"], "health": c["health"], "biomes": c["biomes"], "boss": cid in boss_ids,
            "weak": c["weak"], "resist": c["resist"], "immune": c["immune"],
            "drops": [{**ref[d["item"]], "min": d["min"], "max": d["max"], "chance": d["chance"]} for d in c["drops"] if d["item"] in ref],
            "bossRef": ref.get(f"boss:{cid}"),
        })

    boss_rows = []
    for b in bosses:
        s_item = b["summon"]["item"]
        boss_rows.append({
            "id": b["id"], **ref[f"boss:{b['id']}"], "health": b["health"], "biome": b["biome"], "order": b["order"],
            "art": b["art"], "power": b["power"], "weak": b["weak"], "resist": b["resist"], "immune": b["immune"],
            "summon": {"item": ref.get(s_item) if s_item else None, "amount": b["summon"]["amount"], "altar": b["summon"]["altar"],
                       "sources": [src(s) for s in items[s_item]["sources"]] if s_item in items else []},
            "drops": [{**ref[d["item"]], "min": d["min"], "max": d["max"], "chance": d["chance"]} for d in b["drops"] if d["item"] in ref],
            "creature": ref.get(f"creature:{b['id']}"),
            "tips": [hugin[k] for k in dict.fromkeys(HUGIN_ALL_BOSSES + HUGIN_BOSS.get(b["id"], [])) if k in hugin],
        })

    # --- Biomas: qué hay, qué conviene llevar y a quién hay que ganarle.
    biome_rows = []
    for bit, bid, _ in BIOMES:
        name = ref[f"biome:{bid}"]["name"]
        crs = sorted({c["name"]["en"]: c for c in tabs["creatures"] if bid in c["biomes"] and not c["boss"]}.values(), key=lambda c: c["health"] or 0)
        res = {}
        for g in gatherables:
            if bid in g["biomes"]:
                for d in g["drops"]["items"]:
                    if d["item"] in ref:
                        res.setdefault(d["item"], {**ref[d["item"]], "how": set()})["how"].add(g["kind"])
        for f in farms:
            if bid in f["biomes"] and f["item"] in ref:
                res.setdefault(f["item"], {**ref[f["item"]], "how": set()})["how"].add("farm")
        foods = sorted((r for r in tabs["foods"] if r["tier"] == bid), key=lambda r: -(r["food"]["hp"] + r["food"]["st"] + r["food"]["eitr"]))
        boss = next((b for b in boss_rows if b["biome"] == bid), None)
        biome_rows.append({
            "id": bid, "slug": bid, "tab": "biomes", "name": name, "art": f"biome_{bid}",
            "env": environments.get(bid, {}),
            "creatures": [{k: c[k] for k in ("slug", "tab", "name", "icon", "health", "weak", "resist", "immune")} for c in crs],
            "resources": [{**v, "how": sorted(v["how"])} for v in res.values()],
            "foods": [{k: r[k] for k in ("slug", "tab", "name", "icon", "food")} for r in foods[:8]],
            "gear": {t: len([r for r in tabs[t] if r["tier"] == bid]) for t in ("weapons", "armor", "foods", "meads")},
            "boss": {k: boss[k] for k in ("slug", "tab", "name", "icon", "art")} if boss else None,
            "tips": [hugin[k] for k in HUGIN_BIOME.get(bid, []) if k in hugin],
        })

    sizes = {}
    alias: dict[tuple, str] = {}
    for tab, rows in tabs.items():
        # El juego tiene variantes internas con el mismo nombre (tres "Hacha
        # de bronce", dos "Elaking"): queda la que se puede fabricar o
        # conseguir, y el resto sale de la lista (su slug sigue resolviendo).
        best = {}
        for r in rows:
            k = r["name"]["en"]
            score = (bool(r.get("recipe") or r.get("req")), len(r.get("sources") or r.get("drops") or []), bool(r.get("tier")))
            if k not in best or score > best[k][0]:
                best[k] = (score, r)
        kept = {r["name"]["en"]: r["slug"] for _, r in best.values()}
        for r in rows:
            if r["slug"] != kept[r["name"]["en"]]:
                alias[(tab, r["slug"])] = kept[r["name"]["en"]]
        rows[:] = [r for _, r in best.values()]
        rows.sort(key=lambda r: r["name"]["en"])

    def remap(o):
        """Los enlaces a una variante que salió de la lista van a la que quedó."""
        if isinstance(o, dict):
            if "slug" in o and "tab" in o and (o["tab"], o["slug"]) in alias:
                o["slug"] = alias[(o["tab"], o["slug"])]
            for v in o.values():
                remap(v)
        elif isinstance(o, list):
            for v in o:
                remap(v)

    for rows in tabs.values():
        remap(rows)
    remap(biome_rows)
    remap(boss_rows)
    for tab, rows in tabs.items():
        sizes[tab] = dump(f"{tab}.json", rows)
    sizes["biomes"] = dump("biomes.json", biome_rows)
    sizes["bosses"] = dump("bosses.json", boss_rows)
    listed = {(t, r["slug"]) for t, rows in tabs.items() for r in rows} | {("biomes", b["slug"]) for b in biome_rows} | {("bosses", b["slug"]) for b in boss_rows}
    # Biomas y jefes no tienen ícono de inventario: el buscador muestra su ilustración.
    art_of = {("biomes", b["slug"]): b["art"] for b in biome_rows} | {("bosses", b["slug"]): b["art"] for b in boss_rows}
    index = [{"slug": r["slug"], "tab": r["tab"], "en": r["name"]["en"], "es": r["name"]["es"], "icon": r["icon"],
              **({"art": art_of[(r["tab"], r["slug"])]} if (r["tab"], r["slug"]) in art_of else {})}
             for r in ref.values() if (r["tab"], r["slug"]) in listed]
    sizes["index"] = dump("index.json", index)
    meta = load("meta.json")
    dump("meta.json", {"extractedAt": meta["extractedAt"], "counts": {t: len(r) for t, r in tabs.items()} | {"biomes": len(biome_rows), "bosses": len(boss_rows)}})
    print({t: len(r) for t, r in tabs.items()}, "biomas", len(biome_rows), "jefes", len(boss_rows))
    print(f"{sum(sizes.values()) / 1024:.0f} KB en data/site", {k: f"{v // 1024} KB" for k, v in sizes.items()})


if __name__ == "__main__":
    main()
