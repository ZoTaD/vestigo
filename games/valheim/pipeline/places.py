"""
Mazmorras y lugares de cada bioma, con ficha propia (2026-09-24).

El juego no trae fotos de lugares ni una lista legible de qué hay en cada uno:
qué lugares hay, de qué bioma son y quién vive ahí sale de las fichas
`Infobox location` de la wiki (`wiki.locations()`); la foto, de
`data/wiki_images.json` (`wiki_images.py`). Lo que se consigue adentro sale
del juego: el botín de sus cofres (`CHESTS`) y lo que sueltan sus habitantes.

Pedido de ZoTaD: nada enlaza a la wiki; cada lugar es una ficha de Vestigo y
el crédito de las fotos va sólo en el pie de la página.
"""
from . import wiki

# Los tipos de ficha de la wiki, como se muestran. El orden es el de la lista:
# primero las mazmorras, al final de dónde sale cada recurso.
TYPES = [
    ("dungeon", {"en": "Dungeon", "es": "Mazmorra"}),
    ("boss arena", {"en": "Boss arena", "es": "Arena de jefe"}),
    ("structure", {"en": "Structure", "es": "Estructura"}),
    ("point of interest", {"en": "Point of interest", "es": "Punto de interés"}),
    ("poi", {"en": "Point of interest", "es": "Punto de interés"}),
    ("resource node", {"en": "Resource node", "es": "Fuente de recursos"}),
    ("ore deposit", {"en": "Ore deposit", "es": "Veta"}),
]
TYPE_ORDER = [k for k, _ in TYPES]
TYPE_NAME = dict(TYPES)

# Nombres en español: los lugares no tienen nombre en el juego y van traducidos
# a mano; los que son de un recurso usan el nombre del recurso en el juego.
ES = {
    "Abandoned House": "Casa abandonada", "Abandoned Village": "Aldea abandonada", "Ancient Stone Circle": "Círculo de piedras antiguo",
    "Bee Nest": "Colmena silvestre", "Combat Ruin": "Ruina de batalla", "Dolmen": "Dolmen", "Draugr Village": "Aldea draugr",
    "Glade": "Claro", "Sacrificial Stones": "Piedras de sacrificio", "Viking Graveyard": "Cementerio vikingo",
    "Big Rock Clearing": "Claro de la gran roca", "Burial Chambers": "Cámaras funerarias", "Shipwreck": "Naufragio",
    "Smouldering Tomb": "Tumba humeante", "Tin Deposit": "Depósito de estaño", "Troll Cave": "Cueva del trol",
    "Abandoned Hut": "Choza abandonada", "Geyser": "Géiser", "Gucksack": "Saco de légamo", "Inverted Tower": "Torre invertida",
    "Muddy Scrap Pile": "Montón de chatarra fangosa", "Sunken Crypts": "Criptas hundidas", "Swamp Grave": "Tumba del pantano",
    "Swamp Runestone Tower": "Torre de la piedra rúnica", "Abandoned Cabin": "Cabaña abandonada", "Cairns": "Túmulos",
    "Drake Nest": "Nido de draco", "Frost Caves": "Cuevas heladas", "Hidden Forge": "Forja oculta", "Howling Cavern": "Caverna aullante",
    "Mountain Tower": "Torre de la montaña", "Mountain grave": "Tumba de la montaña", "Obsidian Deposit": "Depósito de obsidiana",
    "Silver Vein": "Veta de plata", "Fuling Outpost": "Puesto fuling", "Fuling Ruin": "Ruina fuling", "Fuling Village": "Aldea fuling",
    "Sealed Tower": "Torre sellada", "Stonehenge": "Círculo de monolitos", "Tar Pit": "Pozo de alquitrán",
    "Ancient Armor": "Armadura antigua", "Ancient Roots": "Raíces ancestrales", "Ancient Sword": "Espada antigua",
    "Dvergr Excavation Site": "Excavación dvergr", "Dvergr Guard Tower": "Torre de guardia dvergr", "Dvergr Harbor": "Puerto dvergr",
    "Dvergr Lighthouse": "Faro dvergr", "Dvergr viaduct": "Viaducto dvergr", "Giant Remains": "Restos de gigante",
    "Infested Citadel": "Ciudadela infestada", "Infested Mine": "Mina infestada", "Ashlands ruins": "Ruinas de la Tierra de Ceniza",
    "Charred Fortress": "Fortaleza carbonizada", "Charred Ruins": "Ruinas carbonizadas", "Dvergr Charred Tower Ruins": "Ruinas de torre dvergr carbonizada",
    "Flametal Ore Vein": "Veta de mineral de llametal", "Mysterious Location": "Lugar misterioso", "Putrid Hole": "Pozo pútrido",
    "Sulfur Arch": "Arco de azufre", "Tomb of Lord Reto": "Tumba de lord Reto", "Unstable Lava Rock": "Roca de lava inestable",
}

# Fichas de la wiki que no son un lugar de un bioma: aparecen en todos (los
# altares), son del mundo entero o quedaron viejas (el metal brillante de antes
# de la Tierra de Ceniza).
SKIP = {"Forsaken Altars", "Valheim (world)", "World Edge", "Glowing metal", "Lava"}

# Los cofres del juego que están en cada lugar, por el nombre del prefab. Sólo
# los seguros: el cofre que la wiki nombra en `resources` ("Meadows chest",
# "Swamp chest") o el que lleva el nombre del lugar (forestcrypt, sunkencrypt).
CHESTS = {
    "Burial Chambers": ["TreasureChest_forestcrypt", "TreasureChest_fCrypt"],
    "Smouldering Tomb": ["TreasureChest_forestcrypt_hildir"],
    "Troll Cave": ["TreasureChest_trollcave"],
    "Sunken Crypts": ["TreasureChest_sunkencrypt"],
    "Frost Caves": ["TreasureChest_mountaincave"],
    "Howling Cavern": ["TreasureChest_mountaincave_hildir"],
    "Sealed Tower": ["TreasureChest_plainsfortress_hildir"],
    "Charred Fortress": ["TreasureChest_charredfortress"],
    "Dvergr Guard Tower": ["TreasureChest_dvergrtower"],
    "Abandoned House": ["TreasureChest_meadows"], "Abandoned Village": ["TreasureChest_meadows"], "Draugr Village": ["TreasureChest_meadows"],
    "Combat Ruin": ["TreasureChest_meadows_combat"],
    "Abandoned Hut": ["TreasureChest_blackforest"],
    "Swamp Runestone Tower": ["TreasureChest_swamp"], "Swamp Grave": ["TreasureChest_swamp"],
    "Mountain Tower": ["TreasureChest_mountains"], "Inverted Tower": ["TreasureChest_mountains"],
    "Fuling Outpost": ["TreasureChest_heath"], "Fuling Ruin": ["TreasureChest_heath"],
    "Stonehenge": ["TreasureChest_plains_stone"],
    "Shipwreck": ["shipwreck_karve_chest"],
}


def place_slug(title: str) -> str:
    return wiki.norm(title).replace("'", "").replace(" ", "-")


def build(images: dict, creature_ref, item_ref, chest_items) -> list[dict]:
    """
    Una fila por lugar: nombre, tipo, biomas, foto, habitantes (con ficha),
    botín de sus cofres y recursos. `creature_ref`/`item_ref` cruzan un nombre de
    la wiki con una ficha del sitio; `chest_items` da lo que trae un cofre del juego.
    """
    photos = images.get("places", {})
    by_title = {v.get("title"): v for v in photos.values() if v.get("title")}
    rows = []
    for loc in wiki.locations():
        title = loc["title"]
        if title in SKIP or not loc["biomes"]:
            continue
        kind = loc["type"].lower().strip()
        p = by_title.get(title) or {}
        photo = {k: p[k] for k in ("src", "file", "page", "author", "w", "h") if k in p} if p.get("src") else None

        def refs(names, fn):
            out, seen = [], set()
            for n in names:
                r = fn(n.split("#")[0])
                if r and (r["tab"], r["slug"]) not in seen:
                    seen.add((r["tab"], r["slug"]))
                    out.append(r)
            return out

        loot, seen = [], set()
        for chest in CHESTS.get(title, []):
            for r in chest_items(chest):
                if r["slug"] not in seen:
                    seen.add(r["slug"])
                    loot.append(r)
        rows.append({
            "slug": place_slug(title), "tab": "places", "name": {"en": title, "es": ES.get(title, title)},
            "kind": kind if kind in TYPE_ORDER else "other",
            "type": TYPE_NAME.get(kind, {"en": loc["type"], "es": loc["type"]}),
            "biomes": loc["biomes"], "photo": photo,
            "inhabitants": refs(loc["inhabitants"], creature_ref),
            "resources": refs(loc["resources"], item_ref),
            "loot": sorted(loot, key=lambda r: r["name"]["en"]),
            "order": TYPE_ORDER.index(kind) if kind in TYPE_ORDER else 99,
        })
    rows.sort(key=lambda r: (r["order"], r["name"]["en"]))
    return rows
