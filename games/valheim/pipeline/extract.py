"""
Saca del Valheim instalado todo lo que muestra la sección.

  cd games/valheim && .venv/Scripts/python -m pipeline.extract

Se corre A MANO, una vez por parche (decisión de ZoTaD del 2026-09-24: los
parches de Valheim salen poco). Tarda ~1-2 min. Escribe `games/valheim/data/`
y los webp de `games/tft/ui/public/valheim/`.

Qué entra:
- Objetos: los de `ObjectDB.m_items` que tienen nombre traducido. Es la lista
  que el propio juego usa para saber qué existe; los ItemDrop sueltos que no
  están ahí son ataques de monstruos y piezas de prueba.
- Recetas: `ObjectDB.m_recipes` habilitadas.
- Piezas: las de cada `PieceTable` (martillo, azada, cultivador…), con la
  herramienta que las construye.
- Conversiones: `CookingStation`, `Fermenter` y `Smelter` (horno, fundición,
  alto horno, molino, rueca, refinería de eitr…).
- Criaturas: `Humanoid`/`Character` con `CharacterDrop`; su bioma sale de
  `SpawnSystemList` descartando las máscaras de 7+ biomas (eventos).
- Recolectables y minerales: los prefabs de la vegetación de `ZoneSystem` y de
  cada `LocationList` (ahí definen Mistlands, Ashlands y el Norte profundo su
  vegetación), con su `Pickable`, `MineRock5`, `MineRock`, `TreeBase` o
  `DropOnDestroyed`.
- Cultivos: cada `Plant` (brote del cultivador) con el recolectable en que se
  convierte; y la colmena (`Beehive`). Sus biomas son dónde se pueden plantar.
- Recolectables de ubicaciones: los `Pickable` que no están en ninguna lista de
  vegetación viven dentro de cuevas, criptas y ruinas (setas amarillas, larvas
  luminosas, helechos). Entran sin bioma: el juego los ubica por la ubicación,
  no por el bioma.
- Comerciantes: `Trader`. La Bruja del pantano trae el nombre vacío; se toma
  del prefab (`npc_bogwitch`).
- Los banquetes están duplicados con el mismo nombre; el que no tiene fuente
  toma la del otro (`share_by_name`).
"""
import json, os, re, time
from datetime import datetime, timezone
from .unity import Game
from .loc import Loc, parse_localization
from .biomes import BIOMES, BIOME_ORDER, biomes_of, is_everywhere
from .records import item_record, recipe_record, requirements, drop_table, character_drops, trader_items
from .sources import build_sources, build_used_in, share_by_name

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
PUBLIC = os.path.normpath(os.path.join(HERE, "..", "..", "tft", "ui", "public", "valheim"))

CLASSES = {"ObjectDB", "ItemDrop", "Recipe", "Piece", "PieceTable", "CraftingStation", "CookingStation",
           "Fermenter", "Smelter", "Humanoid", "Character", "CharacterDrop", "SpawnSystemList", "ZoneSystem",
           "LocationList", "Pickable", "MineRock5", "MineRock", "TreeBase", "DropOnDestroyed", "Trader",
           "Plant", "Beehive", "TreeLog", "Destructible", "Container"}

# Personalización (barbas y peinados): son "objetos" para el juego pero no se
# consiguen ni se usan; eran 114 sin ícono.
CUSTOMIZATION = 10


def dump(name: str, obj) -> None:
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)


class Icons:
    """Exporta cada sprite una sola vez, por nombre, a webp."""

    def __init__(self, game: Game, folder: str):
        self.game, self.folder, self.done = game, folder, set()
        os.makedirs(folder, exist_ok=True)

    def save(self, file, pptr) -> str | None:
        name = self.game.sprite_name(file, pptr)
        if not name:
            return None
        slug = name.lower().replace(" ", "_")
        if slug not in self.done:
            img = self.game.sprite_image(file, pptr)
            if img is None:
                return None
            img.save(os.path.join(self.folder, f"{slug}.webp"), "WEBP", quality=90, method=6)
            self.done.add(slug)
        return slug


def main() -> None:
    t0 = time.time()
    g = Game()
    g.index(CLASSES)
    loc = Loc({})
    for text in g.localization_texts():
        loc.table.update(parse_localization(text))
    icons = Icons(g, os.path.join(PUBLIC, "icons"))
    print(f"juego cargado ({g.unity_version}), {len(loc.table)} textos, {time.time() - t0:.0f}s")

    # --- ObjectDB: la que más objetos tiene es la del juego (hay 3 copias).
    odb = max(g.components("ObjectDB"), key=lambda c: len(c.tree["m_items"]))
    item_gos = {g.ref(odb.file, p) for p in odb.tree["m_items"]}
    recipe_keys = {g.ref(odb.file, p) for p in odb.tree["m_recipes"]}

    # --- Estaciones de crafteo: token → nombre e ícono.
    stations = {}
    station_by_key = {}
    for c in g.components("CraftingStation"):
        tok = c.tree["m_name"].lstrip("$")
        station_by_key[c.key] = tok
        if tok not in stations:
            stations[tok] = {"name": loc.t(tok), "icon": icons.save(c.file, c.tree.get("m_icon"))}

    # --- Objetos
    items = {}
    build_tables = {}   # clave de PieceTable → herramienta
    for c in g.components("ItemDrop"):
        if c.go not in item_gos:
            continue
        prefab = g.prefab(c.go)
        sh = c.tree["m_itemData"]["m_shared"]
        if sh["m_itemType"] == CUSTOMIZATION:
            continue
        icon = icons.save(c.file, sh["m_icons"][0]) if sh.get("m_icons") else None
        rec = item_record(prefab, sh, loc, icon)
        if rec:
            items[prefab] = rec
            bt = g.ref(c.file, sh.get("m_buildPieces"))
            if bt:
                build_tables[bt] = prefab

    # --- Recetas
    recipes = []
    for c in g.components("Recipe"):
        if c.key not in recipe_keys:
            continue
        r = recipe_record(c.tree, g.name_of_in(c.file), lambda p, f=c.file: station_by_key.get(g.ref(f, p)))
        if r and r["item"] in items:
            recipes.append(r)

    # --- Piezas, con la herramienta que las construye
    pieces = {}
    for t in g.components("PieceTable"):
        tool = build_tables.get(t.go) or build_tables.get(t.key)
        for p in t.tree["m_pieces"]:
            go = g.ref(t.file, p)
            for pc in g.comps_on(go):
                if pc.cls != "Piece":
                    continue
                name = loc.t(pc.tree["m_name"])
                if not name:
                    continue
                prefab = g.prefab(go)
                pieces[prefab] = {
                    "id": prefab, "name": name, "desc": loc.t(pc.tree.get("m_description")),
                    "icon": icons.save(pc.file, pc.tree.get("m_icon")), "tool": tool,
                    "category": pc.tree["m_category"], "comfort": pc.tree["m_comfort"] or None,
                    "station": station_by_key.get(g.ref(pc.file, pc.tree["m_craftingStation"])),
                    "requirements": [{"item": q["item"], "amount": q["amount"]} for q in requirements(pc.tree["m_resources"], g.name_of_in(pc.file))],
                }

    # --- Conversiones (sin repetir la misma estación con el mismo par)
    conversions, seen = [], set()
    for cls in ("CookingStation", "Fermenter", "Smelter"):
        for c in g.components(cls):
            st = c.tree["m_name"].lstrip("$")
            name_of = g.name_of_in(c.file)
            for cv in c.tree.get("m_conversion", []):
                frm, to = name_of(cv["m_from"]), name_of(cv["m_to"])
                if not frm or not to or (st, frm, to) in seen:
                    continue
                seen.add((st, frm, to))
                time_s = cv.get("m_cookTime") or (c.tree.get("m_fermentationDuration") if cls == "Fermenter" else c.tree.get("m_secPerProduct"))
                conversions.append({"station": st, "from": frm, "to": to, "time": time_s, "yield": cv.get("m_producedItems", 1)})
            if st not in stations:
                stations[st] = {"name": loc.t(st), "icon": None}

    # --- Criaturas y sus biomas
    spawn_biomes: dict[str, set] = {}
    for c in g.components("SpawnSystemList"):
        for s in c.tree["m_spawners"]:
            if not s.get("m_enabled", 1) or is_everywhere(s["m_biome"]):
                continue
            name = g.prefab(g.ref(c.file, s["m_prefab"]))
            if name:
                spawn_biomes.setdefault(name, set()).update(biomes_of(s["m_biome"]))
    creatures = {}
    for cls in ("Humanoid", "Character"):
        for c in g.components(cls):
            prefab = g.prefab(c.go)
            name = loc.t(c.tree.get("m_name"))
            if not prefab or not name or prefab in creatures or prefab == "Player":
                continue
            drops = next((character_drops(d.tree, g.name_of_in(d.file)) for d in g.comps_on(c.go) if d.cls == "CharacterDrop"), [])
            creatures[prefab] = {"id": prefab, "name": name, "health": c.tree.get("m_health"), "boss": bool(c.tree.get("m_boss")),
                                 "biomes": sorted(spawn_biomes.get(prefab, []), key=lambda b: [x[1] for x in BIOMES].index(b)),
                                 "drops": [d for d in drops if d["item"] in items]}

    # --- Vegetación → recolectables y minerales
    veg: dict[tuple, int] = {}
    for cls in ("ZoneSystem", "LocationList"):
        for c in g.components(cls):
            for v in c.tree.get("m_vegetation", []):
                if v.get("m_enable"):
                    k = g.ref(c.file, v["m_prefab"])
                    if k:
                        veg[k] = veg.get(k, 0) | v["m_biome"]
    def log_drops(file, pptr, depth=0) -> list[dict]:
        """El tronco que deja un árbol, y el que deja ese tronco: ahí está la madera noble."""
        out = []
        for lc in g.comps_on(g.ref(file, pptr)) if depth < 4 else []:
            if lc.cls == "TreeLog":
                out += drop_table(lc.tree["m_dropWhenDestroyed"], g.name_of_in(lc.file))["items"]
                out += log_drops(lc.file, lc.tree.get("m_subLogPrefab"), depth + 1)
        return out

    def drops_of(go, depth=0) -> list[tuple[str, dict]]:
        """
        Qué suelta un prefab de la vegetación, y de qué manera.

        Sigue dos cadenas del juego: el `Destructible` que al romperse deja otro
        prefab (`m_spawnWhenDestroyed`: la veta de cobre entera sólo tiene eso,
        y la fracturada es la que suelta el mineral), y el árbol que deja
        troncos (`log_drops`).
        """
        out = []
        for pc in g.comps_in_tree(go):
            name_of = g.name_of_in(pc.file)
            if pc.cls == "Pickable":
                it = name_of(pc.tree["m_itemPrefab"])
                items_ = [{"item": it, "min": pc.tree["m_amount"], "max": pc.tree["m_amount"], "weight": 1.0}] if it else []
                out.append(("pickable", {"items": items_ + drop_table(pc.tree["m_extraDrops"], name_of)["items"]}))
            elif pc.cls in ("MineRock5", "MineRock"):
                out.append(("mine", drop_table(pc.tree["m_dropItems"], name_of)))
            elif pc.cls == "TreeBase":
                d = drop_table(pc.tree["m_dropWhenDestroyed"], name_of)
                d["items"] += log_drops(pc.file, pc.tree.get("m_logPrefab"))
                out.append(("tree", d))
            elif pc.cls == "DropOnDestroyed":
                out.append(("destructible", drop_table(pc.tree["m_dropWhenDestroyed"], name_of)))
            elif pc.cls == "Destructible" and depth < 3:
                nxt = g.ref(pc.file, pc.tree.get("m_spawnWhenDestroyed"))
                if nxt:
                    out += [("mine" if k == "mine" else k, d) for k, d in drops_of(nxt, depth + 1)]
        return out

    gatherables = []
    for go, mask in veg.items():
        prefab = g.prefab(go)
        por_tipo: dict[str, dict] = {}
        for kind, d in drops_of(go):
            bucket = por_tipo.setdefault(kind, {})
            for it in d["items"]:
                if it["item"] in items:
                    bucket.setdefault(it["item"], it)
        for kind, bucket in por_tipo.items():
            if bucket:
                gatherables.append({"id": prefab, "name": None, "kind": kind, "biomes": biomes_of(mask), "drops": {"items": list(bucket.values())}})

    # --- Recolectables de ubicaciones (fuera de toda vegetación), uno por prefab base
    en_vegetacion = {d["item"] for gt in gatherables for d in gt["drops"]["items"]}
    vistos = set()
    for c in g.components("Pickable"):
        if c.go in veg:
            continue
        it = g.name_of_in(c.file)(c.tree["m_itemPrefab"])
        base = re.sub(r" \(\d+\)$", "", g.prefab(c.go) or "")
        if not it or it not in items or it in en_vegetacion or not base.startswith("Pickable_") or base in vistos:
            continue
        vistos.add(base)
        gatherables.append({"id": base, "name": None, "kind": "location", "biomes": [],
                            "drops": {"items": [{"item": it, "min": c.tree["m_amount"], "max": c.tree["m_amount"], "weight": 1.0}]}})

    # --- Cofres de las ubicaciones: ámbar, rubíes, collares, moldes del Norte
    # profundo. Sin bioma, igual que los recolectables de ubicación.
    for c in g.components("Container"):
        dt = c.tree.get("m_defaultItems")
        if not dt or not dt.get("m_drops"):
            continue
        base = re.sub(r" \(\d+\)$", "", g.prefab(c.go) or "")
        # Un cofre que el jugador construye trae botín sólo cuando el juego lo
        # pone en una ubicación; listarlo como fuente haría creer que
        # construirlo da ámbar.
        if base in pieces:
            continue
        d = drop_table(dt, g.name_of_in(c.file))
        its = [x for x in d["items"] if x["item"] in items]
        if not its:
            continue
        prev = next((x for x in gatherables if x["id"] == base and x["kind"] == "chest"), None)
        if prev:
            have = {x["item"] for x in prev["drops"]["items"]}
            prev["drops"]["items"] += [x for x in its if x["item"] not in have]
        else:
            gatherables.append({"id": base, "name": loc.t(c.tree.get("m_name")), "kind": "chest", "biomes": [], "drops": {"items": its}})

    # --- Cultivos y colmena
    farms = []
    for c in g.components("Plant"):
        sapling = re.sub(r" \(\d+\)$", "", g.prefab(c.go) or "")
        for gp in c.tree.get("m_grownPrefabs", []):
            for pk in g.comps_on(g.ref(c.file, gp)):
                if pk.cls == "Pickable":
                    it = g.name_of_in(pk.file)(pk.tree["m_itemPrefab"])
                    if it in items and not any(f["id"] == sapling and f["item"] == it for f in farms):
                        farms.append({"id": sapling, "name": loc.t(c.tree.get("m_name")), "item": it, "biomes": biomes_of(c.tree["m_biome"])})
    for c in g.components("Beehive"):
        it = g.name_of_in(c.file)(c.tree["m_honeyItem"])
        hive = re.sub(r" \(\d+\)$", "", g.prefab(c.go) or "")
        if it in items and not any(f["id"] == hive for f in farms):
            farms.append({"id": hive, "name": loc.t(c.tree.get("m_name")), "item": it, "biomes": biomes_of(c.tree["m_biome"])})

    # --- Comerciantes
    traders = {}
    for c in g.components("Trader"):
        prefab = g.prefab(c.go)
        traders[prefab] = {"id": prefab, "name": loc.t(c.tree["m_name"]) or loc.t(f"npc_{prefab.lower()}"),
                           "items": [i for i in trader_items(c.tree, g.name_of_in(c.file)) if i["item"] in items]}

    # --- Peces: el pez es a la vez criatura y objeto, y su aparecedor dice el bioma.
    fishing = [{"id": pid, "name": items[pid]["name"], "kind": "fish", "biomes": sorted(spawn_biomes[pid], key=BIOME_ORDER.index),
                "drops": {"items": [{"item": pid, "min": 1, "max": 1, "weight": 1.0}]}}
               for pid in items if pid in spawn_biomes and items[pid]["itemType"] == 21]
    gatherables += fishing
    # Un cultivo que también aparece como recolectable de ubicación: queda el cultivo.
    cultivados = {f["item"] for f in farms}
    gatherables = [x for x in gatherables if not (x["kind"] == "location" and x["drops"]["items"][0]["item"] in cultivados)]

    # --- Cruces
    sources = build_sources(recipes, conversions, creatures, gatherables, traders, farms)
    used = build_used_in(recipes, conversions, pieces)
    for pid, it in items.items():
        it["sources"] = sources.get(pid, [])
        it["usedIn"] = used.get(pid, [])
    share_by_name(items)

    dump("items.json", items)
    dump("recipes.json", recipes)
    dump("pieces.json", pieces)
    dump("conversions.json", conversions)
    dump("stations.json", stations)
    dump("creatures.json", creatures)
    dump("gatherables.json", gatherables)
    dump("traders.json", traders)
    dump("farms.json", farms)
    dump("biomes.json", [{"id": bid, "bit": bit, "name": loc.t(tok)} for bit, bid, tok in BIOMES])
    counts = {"items": len(items), "recipes": len(recipes), "pieces": len(pieces), "conversions": len(conversions),
              "creatures": len(creatures), "gatherables": len(gatherables), "traders": len(traders), "farms": len(farms), "icons": len(icons.done)}
    # Lo que queda sin fuente se publica en meta.json: es la lista de trabajo
    # para completar a mano (o desde la wiki) en la próxima pasada.
    sin_fuente = sorted(pid for pid, it in items.items() if it["kind"] in ("food", "mead", "material") and not it["sources"])
    dump("meta.json", {"withoutSource": sin_fuente, "unity": g.unity_version, "extractedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "counts": counts})
    print(counts, f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
