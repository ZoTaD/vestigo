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

from . import fixes, places, planner, wiki
from .biomes import BIOMES, BIOME_ORDER
from .tiers import Tiers, armor_slot, food_focus, mead_effect, weapon_class

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
OUT = os.path.join(DATA, "site")

# Los rompibles que son botín al azar (las vasijas de la Tierra de Ceniza dan
# bronce y plata) y no un recurso de la zona.
LOOT_RE = re.compile(r"pot\d|_pot|urn|vase|barrel|crate|loot", re.I)

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

# La llave global que deja cada jefe al morir: con ella se habilitan (o se
# apagan) apariciones y eventos. Leídas del juego el 2026-09-24.
KEY_BOSS = {"defeated_eikthyr": "Eikthyr", "defeated_gdking": "gd_king", "defeated_bonemass": "Bonemass",
            "defeated_dragon": "Dragon", "defeated_goblinking": "GoblinKing", "defeated_queen": "SeekerQueen",
            "defeated_fader": "Fader"}


def ext_order(pid: str) -> int:
    """El orden de una mejora de estación: el número de su id (cauldron_ext3_… → 3); "…_ext" a secas es 1."""
    m = re.search(r"ext(\d*)", pid)
    return int(m.group(1) or 1) if m else 99


def slugify(name: str) -> str:
    """El mismo que `route.ts`: ASCII, minúsculas, guiones."""
    s = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"['.]", "", s.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def clean_txt(t: dict) -> dict:
    """Algunos nombres del juego traen marcas de Unity (`<color=orange>Thungr</color>`)."""
    return {k: re.sub(r"</?color[^>]*>", "", v).strip() for k, v in t.items()}


PUBLIC = os.path.normpath(os.path.join(DATA, "..", "..", "tft", "ui", "public"))


def wiki_icon(photo: dict | None) -> str | None:
    """
    Un ícono cuadrado (84 px) sacado de la foto de la wiki, para las criaturas
    sin trofeo: así se ven en las listas, los biomas y los lugares. Se guarda
    junto a los íconos del juego como `wiki-<archivo>`.
    """
    if not photo or not photo.get("src"):
        return None
    src = os.path.join(PUBLIC, photo["src"].lstrip("/"))
    if not os.path.exists(src):
        return None
    name = "wiki-" + os.path.splitext(os.path.basename(src))[0]
    dest = os.path.join(PUBLIC, "valheim", "icons", name + ".webp")
    if not os.path.exists(dest) or os.path.getmtime(dest) < os.path.getmtime(src):
        from PIL import Image
        im = Image.open(src).convert("RGBA")
        side = min(im.size)
        box = ((im.width - side) // 2, (im.height - side) // 2)
        im.crop((box[0], box[1], box[0] + side, box[1] + side)).resize((84, 84), Image.LANCZOS).save(dest, "WEBP", quality=85)
    return name


def clean_se(se: dict) -> dict:
    """Los textos de un efecto sin las marcas de color de Unity."""
    return {**se, "name": clean_txt(se["name"]) if se.get("name") else None,
            "tooltip": clean_txt(se["tooltip"]) if se.get("tooltip") else None}


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
    fixes.apply(items)
    # Construcción = lo que se construye con el martillo y cuesta materiales
    # (ZoTaD, 2026-09-25: "construcción sólo van estructuras"). En la 1.0 la
    # bandeja ("Feaster") pone cada comida sobre la mesa como pieza, y el pan o
    # el pastel de luey salían en Construcción; lo que se planta con el
    # cultivador y las acciones sin costo (reparar, borrar) tampoco son
    # estructuras. `pieces` sigue entero para los biomas (los cultivos).
    built = {pid: p for pid, p in pieces.items() if p["tool"] == "Hammer" and p["requirements"]}
    # Los eventos, uno por id (el juego tiene dos listas con los mismos).
    events = list({e["id"]: e for e in (load("events.json") if os.path.exists(os.path.join(DATA, "events.json")) else [])}.values())
    # Ataques y consejos de cada criatura y jefe (`tips_build.py`), por nombre en inglés.
    tips = load("tips.json") if os.path.exists(os.path.join(DATA, "tips.json")) else {}
    # Las fotos de la wiki (`wiki_images.py`); sin el archivo, el sitio sale sin fotos.
    wiki_images = load("wiki_images.json") if os.path.exists(os.path.join(DATA, "wiki_images.json")) else {}
    # Por nombre en inglés, y sólo las que ya están bajadas (sin `src`, nada).
    photo_by_name = {v["name"]: {k: v[k] for k in ("src", "author", "w", "h") if k in v}
                     for g in ("creatures", "bosses") for v in wiki_images.get(g, {}).values() if v.get("src") and v.get("name")}

    # --- Dónde vive cada criatura (2026-09-24, comparado con la wiki a pedido
    # de ZoTaD). El juego mezcla hábitat con visitas: el esqueleto "vivía" en
    # las Praderas y las Llanuras por un aparecedor nocturno, y los de las
    # mazmorras (fantasma, surtling, restos rancios) no vivían en ningún lado.
    # Manda la ficha de la wiki (`location`) para los biomas de antes de la 1.0;
    # el Norte profundo sale del juego, porque la wiki todavía no lo terminó.
    # Las variantes con el mismo nombre (nueve "Skeleton") son una sola ficha.
    game_biomes = {k: list(c["biomes"]) for k, c in creatures.items()}
    by_name = defaultdict(set)
    for c in creatures.values():
        by_name[clean_txt(c["name"])["en"]].update(c["biomes"])
    habitat_by_name = {}
    for name, game in by_name.items():
        w = wiki.creature_biomes(name) if name else None
        hab = set(w) | (game & {"deepnorth"}) if w else game
        habitat_by_name[name] = sorted(hab, key=BIOME_ORDER.index)
    for c in creatures.values():
        c["biomes"] = habitat_by_name.get(clean_txt(c["name"])["en"], c["biomes"])
    # Y los hostiles que el recuadro de cada bioma de la wiki suma aparte (el
    # Draugr de las torres de la Montaña, el Gammeltrol del Norte profundo):
    # ZoTaD, 2026-09-25, "fijate que en cada bioma faltan cosas".
    by_norm = defaultdict(list)
    for c in creatures.values():
        by_norm[wiki.norm(clean_txt(c["name"])["en"])].append(c)
    for bid, box in wiki.biome_boxes().items():
        for h in box.get("hostile", []):
            for c in by_norm.get(wiki.norm(h.split("(")[0]), []):
                if bid not in c["biomes"]:
                    c["biomes"] = sorted({*c["biomes"], bid}, key=BIOME_ORDER.index)
    # Variantes que el juego llama igual pero que se juegan distinto (el Draugr
    # con arco): ficha propia, con el hábitat de la base (ya asignado arriba).
    for cid, name in fixes.CREATURE_NAMES.items():
        if cid in creatures:
            creatures[cid]["name"] = name
    for it in items.values():
        for s in it["sources"]:
            if s["kind"] == "drop" and s.get("from") in creatures:
                s["biomes"] = creatures[s["from"]]["biomes"]

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
    for pid, p in sorted(built.items(), key=lambda x: x[1]["name"]["en"]):
        claim(f"piece:{pid}", "building", p["name"], p["icon"])
    # Criaturas que se listan: las que viven en algún bioma, sueltan algo o son
    # jefes. Las demás (variantes invocadas, crías de prueba, apariciones de
    # eventos; 19 el 2026-09-24) no tienen nada que mostrar en su ficha.
    boss_ids0 = {b["id"] for b in bosses}
    for c in creatures.values():
        c["name"] = clean_txt(c["name"])
    creatures = {k: c for k, c in creatures.items() if c["name"]["en"] and (c["biomes"] or c["drops"] or k in boss_ids0)}

    def creature_icon(c):
        """
        La foto de la wiki recortada (`wiki_icon`): ZoTaD quiere ver cómo es cada
        criatura en todo el sitio (2026-09-24). Sin foto, el trofeo; si no, lo
        que suelta sólo si se llama igual (la cabeza de Kvastur). Antes caía en
        lo primero que soltaba y el murciélago salía con trozos de cuero: mejor
        sin imagen que con una ajena.
        """
        ic = wiki_icon(photo_by_name.get(c["name"]["en"]))
        if ic:
            return ic
        if c.get("icon"):
            return c["icon"]
        for d in c.get("drops", []):
            it = items.get(d["item"]) or {}
            if it.get("icon") and it["name"]["en"] == c["name"]["en"]:
                return it["icon"]
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

    # El bioma de progresión (tiers.py): sigue semillas, conversiones, recetas
    # y el nivel de estación que pide cada receta.
    station_piece = {tok: piece_by_en.get((st.get("name") or {}).get("en")) for tok, st in stations.items()}
    station_piece = {k: v for k, v in station_piece.items() if v}
    ups_by_station = defaultdict(list)
    for pid, p in pieces.items():
        if p.get("extends") and p["extends"] in station_piece:
            ups_by_station[station_piece[p["extends"]]].append(pid)
    for lst in ups_by_station.values():
        lst.sort(key=lambda x: (ext_order(x), x))
    tiers = Tiers(items, recipe_by_item, conv_from, pieces, station_piece, ups_by_station)
    # Las comidas: manda la columna "Biome progression" de la tabla de `Food`
    # de la wiki (el pescado es del Pantano, las serpientes también: hace falta
    # el asador de hierro). Se fija antes de calcular lo demás, así lo que se
    # cocina con ellas hereda el bioma corregido.
    food_tier = wiki.food_biomes()
    for pid, it in items.items():
        w = food_tier.get(wiki.norm(it["name"]["en"])) if it["kind"] == "food" else None
        if w:
            tiers._memo[pid] = w
    tier = {pid: tiers.item(pid) for pid in items}
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
            # Las de `fixes.py` traen el lugar exacto ("Enredadera de ceniza en ruinas carbonizadas").
            out["name"] = s.get("name") or gname.get(s.get("from"))
            out["from"] = s.get("from")
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
                       "req": req_list(r["requirements"]), **({"anyOne": True} if r.get("anyOne") else {})} if r else None,
            "sources": [src(s) for s in it["sources"]],
            "usedIn": [x for x in (use(u) for u in it["usedIn"]) if x],
        }

    set_members = defaultdict(list)
    for pid, it in items.items():
        if it.get("setName") and recipe_by_item.get(pid):
            set_members[it["setName"]].append(pid)

    tabs = defaultdict(list)
    for pid, it in items.items():
        row = base_row(pid, it)
        if it.get("effects"):
            # Bono de set, efecto al equipar o al tomar, resistencias y cuánto frena.
            row["effects"] = {k: (clean_se(v) if isinstance(v, dict) else v) for k, v in it["effects"].items()}
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
            if it["setName"]:
                row["setPieces"] = [ref[o] for o in sorted(set_members.get(it["setName"], [])) if o != pid and o in ref]
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
    for pid, p in built.items():
        st = station_ref(p["station"])
        if st and st["slug"] and f"piece:{pid}" in ref:
            crafts[st["slug"]].append({**ref[f"piece:{pid}"], "level": 1})

    # Las mejoras de cada estación (pedido de ZoTaD, 2026-09-24): las piezas que
    # la suben de nivel puestas cerca, cada una +1. Van en el orden de sus ids
    # (cauldron_ext1_spice, …_ext3_butchertable, …), que es el de progresión
    # que les dieron los desarrolladores; "piece_magetable_ext" a secas es la 1.
    def piece_tier(p):
        return tiers.piece(p["id"])

    upgrades = defaultdict(list)
    for pid, p in built.items():
        st = station_ref(p.get("extends"))
        if st and st["slug"] and f"piece:{pid}" in ref:
            upgrades[st["slug"]].append((pid, p))
    for slug, ups in upgrades.items():
        ups.sort(key=lambda x: (ext_order(x[0]), x[1]["name"]["en"]))

    for pid, p in built.items():
        key = f"piece:{pid}"
        cat = (piece_categories.get(p["tool"]) or {}).get(str(p["category"]))
        slug = ref[key]["slug"]
        seen = set()
        made = [x for x in sorted(crafts.get(slug, []), key=lambda x: (x["level"], x["name"]["en"]))
                if not (x["slug"] in seen or seen.add(x["slug"]))]
        tabs["building"].append({
            "id": pid, **ref[key], "desc": p["desc"], "tool": p["tool"], "category": p["category"], "categoryName": cat,
            "comfort": p["comfort"], "station": station_ref(p["station"]), "req": req_list(p["requirements"]),
            "tier": tiers.piece(pid),
            "processes": processes.get(slug) or None,
            "crafts": made or None,
            # Cada mejora con sus materiales y dónde se hace; la i-ésima deja la
            # estación en el nivel i + 2 (la estación sola es nivel 1).
            "upgrades": [{**ref[f"piece:{uid}"], "level": i + 2, "req": req_list(u["requirements"]),
                          "station": station_ref(u["station"]), "tier": piece_tier(u)}
                         for i, (uid, u) in enumerate(upgrades.get(slug, []))] or None,
            "extends": (lambda st: {**st, "slug": st["slug"], "tab": st["tab"]} if st and st["slug"] else None)(station_ref(p.get("extends"))),
        })

    boss_ids = {b["id"] for b in bosses}

    def key_ref(key):
        """La llave de un jefe ("defeated_bonemass") → su ficha; otras llaves, nada."""
        bid = KEY_BOSS.get(key or "")
        return ref.get(f"boss:{bid}") if bid else None

    # Los eventos en que aparece cada criatura (por prefab).
    events_of = defaultdict(list)
    for e in events:
        if not e.get("start"):
            continue
        row = {"name": clean_txt(e["start"]), "biomes": e["biomes"],
               "after": [r for r in (key_ref(k) for k in e["requires"]) if r],
               "until": [r for r in (key_ref(k) for k in e["until"]) if r]}
        for pf in e["spawn"]:
            if row not in events_of[pf]:
                events_of[pf].append(row)

    def creature_extras(cid, c):
        """
        Domesticar, criar, cuándo aparece, eventos, ataques y consejos (pedido de
        ZoTaD, 2026-09-24). Lo del juego sale de `extract.py`; ataques y consejos,
        de `tips.json` (redactados a partir de la wiki, con palabras propias).
        """
        out = {}
        eats = [ref[i] for i in c.get("eats", []) if i in ref]
        if c.get("tame"):
            t = c["tame"]
            out["tame"] = {"time": t["time"], "fed": t["fed"], "startsTamed": t["startsTamed"], "commandable": t["commandable"],
                           "saddle": ref.get(t["saddle"]) if t.get("saddle") else None, "eats": eats}
        if c.get("breed"):
            b = c["breed"]
            out["breed"] = {"max": b["max"], "love": b["love"], "pregnancy": b["pregnancy"],
                            "offspring": (ref.get(f"creature:{b['offspring']}") or ref.get(b["offspring"])) if b.get("offspring") else None}
        spawns = []
        for s in c.get("spawns", []):
            row = {k: v for k, v in s.items() if k != "key"}
            if s.get("key"):
                r = key_ref(s["key"])
                if not r:
                    continue  # llaves que no son de un jefe (eventos de Hildir): no se explican bien
                row["after"] = r
            spawns.append(row)
        if spawns:
            out["spawns"] = spawns
        if events_of.get(cid):
            out["events"] = events_of[cid]
        tp = tips.get(clean_txt(c["name"])["en"])
        if tp:
            out["attacks"] = tp.get("attacks") or []
            out["tips"] = tp.get("tips") or None
        return out

    for cid, c in creatures.items():
        tabs["creatures"].append({
            "id": cid, **ref[f"creature:{cid}"], "health": c["health"], "biomes": c["biomes"], "boss": cid in boss_ids,
            "weak": c["weak"], "resist": c["resist"], "immune": c["immune"],
            "drops": [{**ref[d["item"]], "min": d["min"], "max": d["max"], "chance": d["chance"]} for d in c["drops"] if d["item"] in ref],
            "bossRef": ref.get(f"boss:{cid}"),
            "photo": photo_by_name.get(c["name"]["en"]),
            "gameBiomes": game_biomes.get(cid, []),
            **creature_extras(cid, c),
        })

    # Una ficha por nombre: la criatura base (el id más corto: Greydwarf y no
    # Greydwarf_Frozen). Antes ganaba la que más soltaba y el enanogrís de las
    # Praderas mostraba la vida y el hielo del del Norte profundo (2026-09-24,
    # comparando con la wiki). Las versiones con otra vida u otro botín quedan
    # como variantes de la ficha, con el bioma donde aparecen.
    alias: dict[tuple, str] = {}
    groups = defaultdict(list)
    for r in tabs["creatures"]:
        groups[r["name"]["en"]].append(r)
    kept_rows = []
    for rows in groups.values():
        rows.sort(key=lambda r: (not r["boss"], len(r["id"]), -len(r["drops"]), r["id"]))
        base = rows[0]
        sig = lambda r: (r["health"], tuple(sorted(d["slug"] for d in r["drops"])))
        variants, seen = [], {sig(base)}
        for r in rows[1:]:
            alias[("creatures", r["slug"])] = base["slug"]
            if r["drops"] and sig(r) not in seen:
                seen.add(sig(r))
                variants.append({"biomes": r["gameBiomes"], "health": r["health"], "drops": r["drops"]})
        base["variants"] = variants
        for key in ("spawns", "events"):
            merged = []
            for r in rows:
                for x in r.get(key, []):
                    if x not in merged:
                        merged.append(x)
            if merged:
                base[key] = merged
        for key in ("tame", "breed"):
            if not base.get(key):
                other = next((r[key] for r in rows if r.get(key)), None)
                if other:
                    base[key] = other
        kept_rows.append(base)
    for r in kept_rows:
        r.pop("gameBiomes", None)
    tabs["creatures"] = kept_rows

    boss_rows = []
    for b in bosses:
        s_item = b["summon"]["item"]
        boss_rows.append({
            "id": b["id"], **ref[f"boss:{b['id']}"], "health": b["health"], "biome": b["biome"], "order": b["order"],
            "art": b["art"], "photo": photo_by_name.get(b["name"]["en"]), "power": b["power"], "weak": b["weak"], "resist": b["resist"], "immune": b["immune"],
            "summon": {"item": ref.get(s_item) if s_item else None, "amount": b["summon"]["amount"], "altar": b["summon"]["altar"],
                       "sources": [src(s) for s in items[s_item]["sources"]] if s_item in items else []},
            "drops": [{**ref[d["item"]], "min": d["min"], "max": d["max"], "chance": d["chance"]} for d in b["drops"] if d["item"] in ref],
            "creature": ref.get(f"creature:{b['id']}"),
            "tips": [hugin[k] for k in dict.fromkeys(HUGIN_ALL_BOSSES + HUGIN_BOSS.get(b["id"], [])) if k in hugin],
            "attacks": (tips.get(clean_txt(b["name"])["en"]) or {}).get("attacks") or [],
            "advice": (tips.get(clean_txt(b["name"])["en"]) or {}).get("tips"),
        })

    # Lo que invoca a un jefe lo dice en su ficha (ZoTaD, 2026-09-25: la Campana
    # no decía que invoca a Fader). "Se usa en" sólo mira recetas y piezas.
    summons = defaultdict(list)
    for b in bosses:
        s_item = b["summon"]["item"]
        if s_item:
            summons[s_item].append({**ref[f"boss:{b['id']}"], "amount": b["summon"]["amount"], "altar": b["summon"]["altar"]})
    for rows in tabs.values():
        for r in rows:
            if r.get("id") in summons:
                r["summons"] = summons[r["id"]]

    # --- Biomas: qué hay, qué conviene llevar y a quién hay que ganarle.
    # Los lugares (mazmorras, estructuras), con ficha propia en la pestaña
    # Lugares. Un jefe que vive en un lugar enlaza a su ficha de jefe.
    cre_by_name, item_by_name = {}, {}
    for b in boss_rows:
        cre_by_name.setdefault(wiki.norm(b["name"]["en"]), {k: b[k] for k in ("slug", "tab", "name", "icon")})
    for c in tabs["creatures"]:
        cre_by_name.setdefault(wiki.norm(c["name"]["en"]), {k: c[k] for k in ("slug", "tab", "name", "icon")})
    for pid in items:
        item_by_name.setdefault(wiki.norm(items[pid]["name"]["en"]), ref[pid])

    def by_name(table, name):
        n = wiki.norm(name)
        return table.get(n) or table.get(n.rstrip("s")) or table.get(n + "s")

    chest_drops = defaultdict(list)
    for g in gatherables:
        chest_drops[g["id"]] += [ref[d["item"]] for d in g["drops"]["items"] if d["item"] in ref]
    place_rows = places.build(wiki_images, lambda n: by_name(cre_by_name, n), lambda n: by_name(item_by_name, n),
                              lambda cid: chest_drops.get(cid, []))
    tabs["places"] = place_rows
    # Y al revés: en la ficha de cada criatura y jefe, dónde aparece.
    lives_in = defaultdict(list)
    for p in place_rows:
        for c in p["inhabitants"]:
            lives_in[(c["tab"], c["slug"])].append({k: p[k] for k in ("slug", "tab", "name")})
    for c in tabs["creatures"]:
        c["places"] = lives_in.get(("creatures", c["slug"]), [])
    for b in boss_rows:
        b["places"] = lives_in.get(("bosses", b["slug"]), [])
    biome_rows = []
    for bit, bid, _ in BIOMES:
        name = ref[f"biome:{bid}"]["name"]
        crs = sorted({c["name"]["en"]: c for c in tabs["creatures"] if bid in c["biomes"] and not c["boss"]}.values(), key=lambda c: c["health"] or 0)
        # Cuatro grupos (2026-09-24, ZoTaD vio el bronce "de la Tierra de Ceniza"
        # y faltaban pieles y carnes): lo que da la zona, lo que sueltan sus
        # criaturas, el botín de cofres y vasijas, y lo que se puede plantar.
        res, loot = {}, {}
        for g in gatherables:
            if bid not in g["biomes"]:
                continue
            es_botin = g["kind"] == "chest" or (g["kind"] == "destructible" and LOOT_RE.search(g["id"]))
            for d in g["drops"]["items"]:
                if d["item"] not in ref:
                    continue
                if es_botin:
                    loot.setdefault(d["item"], ref[d["item"]])
                else:
                    res.setdefault(d["item"], {**ref[d["item"]], "how": set()})["how"].add(g["kind"])
        # Lo que el juego no ubica y sale de la wiki (`fixes.py`): la parrabaya, la savia.
        for pid, it in items.items():
            for s in it["sources"]:
                if s.get("wiki") and s["kind"] == "gather" and bid in s["biomes"] and pid in ref:
                    if s["how"] == "chest":
                        loot.setdefault(pid, ref[pid])
                    else:
                        res.setdefault(pid, {**ref[pid], "how": set()})["how"].add(s["how"])
        drops = {}
        for c in crs:
            for d in c["drops"]:
                if d.get("slug"):
                    e = drops.setdefault((d["tab"], d["slug"]), {k: d[k] for k in ("slug", "tab", "name", "icon")} | {"from": []})
                    if c["slug"] not in {x["slug"] for x in e["from"]}:
                        e["from"].append({k: c[k] for k in ("slug", "tab", "name")})
        # Un cultivo que el juego deja plantar en 7 biomas o más es una regla
        # general (la uva de vid salía "en el Océano"), no algo de la zona.
        plant = {}
        for f in farms:
            if bid in f["biomes"] and f["item"] in ref and len(f["biomes"]) < 7:
                plant.setdefault(f["item"], ref[f["item"]])
        foods = sorted((r for r in tabs["foods"] if r["tier"] == bid), key=lambda r: -(r["food"]["hp"] + r["food"]["st"] + r["food"]["eitr"]))
        boss = next((b for b in boss_rows if b["biome"] == bid), None)
        # Enemigos y pacíficas (ZoTaD, 2026-09-25: "ahí sólo deberían aparecer
        # los enemigos de ese bioma"): manda la lista "passive" del recuadro del
        # bioma en la wiki; la cría de foca cuenta como la foca.
        passive = [wiki.norm(n) for n in (wiki.biome_boxes().get(bid) or {}).get("passive", [])]
        is_passive = lambda c: any(wiki.norm(c["name"]["en"]) == p or wiki.norm(c["name"]["en"]).endswith(" " + p) for p in passive)
        biome_rows.append({
            "id": bid, "slug": bid, "tab": "biomes", "name": name, "art": f"biome_{bid}",
            "env": environments.get(bid, {}),
            "creatures": [{**{k: c[k] for k in ("slug", "tab", "name", "icon", "health", "weak", "resist", "immune")},
                           **({"passive": True} if is_passive(c) else {})} for c in crs],
            "resources": [{**v, "how": sorted(v["how"])} for v in res.values()],
            "creatureDrops": sorted(drops.values(), key=lambda d: d["name"]["en"]),
            "loot": sorted(loot.values(), key=lambda d: d["name"]["en"]),
            "plant": sorted(plant.values(), key=lambda d: d["name"]["en"]),
            "places": [{k: p[k] for k in ("slug", "tab", "name", "type", "photo", "inhabitants")} for p in place_rows if bid in p["biomes"]],
            "foods": [{k: r[k] for k in ("slug", "tab", "name", "icon", "food")} for r in foods[:8]],
            "gear": {t: len([r for r in tabs[t] if r["tier"] == bid]) for t in ("weapons", "armor", "foods", "meads")},
            "boss": {k: boss[k] for k in ("slug", "tab", "name", "icon", "art")} if boss else None,
            "tips": [hugin[k] for k in HUGIN_BIOME.get(bid, []) if k in hugin],
        })

    sizes = {}
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
    # El Planificador (2026-09-25): su propio archivo, que sólo carga esa pestaña.
    boss_biome = {f"boss:{b['id']}": b["biome"] for b in bosses}

    def tier_of(k):
        return tiers.piece(k[6:]) if k.startswith("piece:") else boss_biome.get(k) or tier.get(k)

    listed = {("piece:" + r["id"] if t == "building" else r["id"]): t for t, rows in tabs.items() if t in planner.CATS for r in rows}
    plan = planner.build(items, recipes, built, conversions, bosses, ref, tier_of, station_ref, src, listed)
    remap(plan)
    for tab, rows in tabs.items():
        sizes[tab] = dump(f"{tab}.json", rows)
    sizes["planner"] = dump("planner.json", plan)
    sizes["biomes"] = dump("biomes.json", biome_rows)
    sizes["bosses"] = dump("bosses.json", boss_rows)
    # El índice sale de las filas publicadas, una entrada por ficha. Antes salía
    # de `ref`, y `remap` deja las variantes fusionadas (los nueve "Skeleton")
    # con el slug de la que quedó: el índice las repetía y el build de Netlify
    # escribía la misma página varias veces (2026-09-24).
    # Biomas y jefes no tienen ícono de inventario: el buscador muestra su ilustración.
    order = {("biomes", b["slug"]): b for b in biome_rows} | {("bosses", b["slug"]): b for b in boss_rows}
    # Los lugares no tienen ícono: el buscador muestra su foto.
    index = [{"slug": r["slug"], "tab": t, "en": r["name"]["en"], "es": r["name"]["es"], "icon": r.get("icon"),
              **({"photo": r["photo"]["src"]} if r.get("photo") else {})}
             for t, rows in tabs.items() for r in rows]
    index += [{"slug": b["slug"], "tab": t, "en": b["name"]["en"], "es": b["name"]["es"], "icon": b.get("icon"), "art": b["art"]}
              for (t, _), b in order.items()]
    index.sort(key=lambda e: e["en"].lower())
    sizes["index"] = dump("index.json", index)
    meta = load("meta.json")
    dump("meta.json", {"extractedAt": meta["extractedAt"], "counts": {t: len(r) for t, r in tabs.items()} | {"biomes": len(biome_rows), "bosses": len(boss_rows)}})
    print({t: len(r) for t, r in tabs.items()}, "biomas", len(biome_rows), "jefes", len(boss_rows))
    print(f"{sum(sizes.values()) / 1024:.0f} KB en data/site", {k: f"{v // 1024} KB" for k, v in sizes.items()})


if __name__ == "__main__":
    main()
