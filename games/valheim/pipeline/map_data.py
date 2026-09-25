"""
Los datos del juego que necesita el mapa por semilla para ubicar los lugares.

  cd games/valheim && .venv/Scripts/python -m pipeline.map_data

El mapa porta a TypeScript el generador de Valheim-SeedLab (C#, MIT). SeedLab
saca estas tablas con un mod de BepInEx; acá salen de los archivos del juego con
UnityPy, con los mismos nombres de campo que su C# (`LocationDef`,
`AltBiomeDef`, `VegetationDef`, `PrefabConstantsFile`), para que el port lea lo
mismo.

Escribe en `games/valheim/data/map/`:
- `locations.json`: las `ZoneLocation` en el orden de `ZoneSystem.m_locations`
  DESPUÉS de `SetupLocations` (las de la escena, cada `LocationList` por
  `m_sortOrder` y al final las `m_addLocations` de cada variante de bioma).
  `orderedIndex` es la posición en la lista que recorre la colocación.
- `altbiomes.json`: las variantes de bioma en el orden de `m_alts`, con sus
  ubicaciones y su vegetación completas, como `AltBiomeDef`.
- `meta.json`: versión del juego, conteos y las constantes de prefab.
- `display.json`: nombre (en/es), categoría, ícono y ficha del sitio de cada
  prefab que se coloca.
Y los íconos del minimapa en `site/public/valheim/map/icons/`.

Convenciones (las de SeedLab): los biomas son la máscara `Heightmap.Biome`, los
enum van como enteros tal como están guardados (`biomeArea` 7 = todos los bits)
y no se omite nada por ser el valor por defecto. Cada float es el float32 del
juego escrito como double exacto: `Math.fround` lo devuelve sin pérdida, así que
no hace falta el objeto `bits` de SeedLab. Cada archivo lleva `stamp` con el
formato `DATA-STAMP` de SeedLab, para saber de qué compilación salió.
"""
import hashlib, json, os, re, sys, time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "data", "map"))
SITE = os.path.normpath(os.path.join(HERE, "..", "data", "site"))
ICONS = os.path.normpath(os.path.join(HERE, "..", "..", "..", "site", "public", "valheim", "map", "icons"))
GAME_ROOT = r"C:\Program Files (x86)\Steam\steamapps\common\Valheim"
PLAYER_LOG = os.path.expandvars(r"%USERPROFILE%\AppData\LocalLow\IronGate\Valheim\Player.log")
SCHEMA = 1
DUMPER = "vestigo-map_data/1"

# `Version.c_WorldGenVersion`: es una constante del IL, no un dato serializado,
# así que UnityPy no la ve. La confirma el log del juego ("Worldgenerator
# version setup:2"); `game_version` avisa si el log dice otra cosa.
WORLDGEN_VERSION = 2

CLASSES = {"ZoneSystem", "LocationList", "AltBiomeList", "Minimap", "Location", "Teleport", "OfferingBowl",
           "Trader", "RuneStone", "Vegvisir", "Heightmap"}

# El orden en que el juego registra las LocationList (`LocationList.Awake`) no
# está en los datos: UnityPy las da en otro orden. Todas tienen m_sortOrder 3 y
# `List.Sort` con 6 elementos ordena por inserción (estable), así que el orden
# efectivo es el de registro. Lo confirma el log del juego del 2026-09-24
# ("Added 3/2/27/4/25/25 locations"), y `log_list_order` lo vuelve a revisar
# en cada corrida. Una lista nueva que no esté acá corta el script.
LIST_ORDER = ["_LocationList_cp1", "_LocationList_MountainCaves", "_LocationList_Mistlands",
              "_LocationList_Hildir", "_LocationList_Ashlands", "_LocationList_DeepNorth"]

# Los 40 campos serializados de `ZoneLocation`, en orden de declaración, con su
# nombre en SeedLab (`LocationDef`). m_prefab va aparte: es una SoftReference.
LOCATION_FIELDS = [
    ("m_name", "name", str), ("m_enable", "enable", bool), ("m_biome", "biome", int),
    ("m_biomeArea", "biomeArea", int), ("m_quantity", "quantity", int), ("m_prioritized", "prioritized", bool),
    ("m_centerFirst", "centerFirst", bool), ("m_unique", "unique", bool), ("m_group", "group", str),
    ("m_minDistanceFromSimilar", "minDistanceFromSimilar", float), ("m_groupMax", "groupMax", str),
    ("m_maxDistanceFromSimilar", "maxDistanceFromSimilar", float), ("m_iconAlways", "iconAlways", bool),
    ("m_iconPlaced", "iconPlaced", bool), ("m_randomRotation", "randomRotation", bool),
    ("m_slopeRotation", "slopeRotation", bool), ("m_snapToWater", "snapToWater", bool),
    ("m_interiorRadius", "interiorRadius", float), ("m_exteriorRadius", "exteriorRadius", float),
    ("m_clearArea", "clearArea", bool), ("m_minTerrainDelta", "minTerrainDelta", float),
    ("m_maxTerrainDelta", "maxTerrainDelta", float), ("m_minimumVegetation", "minimumVegetation", float),
    ("m_maximumVegetation", "maximumVegetation", float), ("m_surroundCheckVegetation", "surroundCheckVegetation", bool),
    ("m_surroundCheckDistance", "surroundCheckDistance", float), ("m_surroundCheckLayers", "surroundCheckLayers", int),
    ("m_surroundBetterThanAverage", "surroundBetterThanAverage", float), ("m_inForest", "inForest", bool),
    ("m_forestTresholdMin", "forestTresholdMin", float), ("m_forestTresholdMax", "forestTresholdMax", float),
    ("m_minDistanceFromCenter", "minDistanceFromCenter", float), ("m_maxDistanceFromCenter", "maxDistanceFromCenter", float),
    ("m_minDistance", "minDistance", float), ("m_maxDistance", "maxDistance", float),
    ("m_minAltitude", "minAltitude", float), ("m_maxAltitude", "maxAltitude", float), ("m_foldout", "foldout", bool),
]

# Los campos de `ZoneVegetation` (`VegetationDef`), sin m_prefab, que es una
# referencia a un GameObject y va aparte. Sólo se usan en las variantes de
# bioma: la vegetación se acepta con raycasts y no se reproduce fuera del juego.
VEGETATION_FIELDS = [
    ("m_name", "name", str), ("m_enable", "enable", bool), ("m_min", "min", float), ("m_max", "max", float),
    ("m_forcePlacement", "forcePlacement", bool), ("m_scaleMin", "scaleMin", float), ("m_scaleMax", "scaleMax", float),
    ("m_randTilt", "randTilt", float), ("m_chanceToUseGroundTilt", "chanceToUseGroundTilt", float),
    ("m_biome", "biome", int), ("m_biomeArea", "biomeArea", int), ("m_blockCheck", "blockCheck", bool),
    ("m_snapToStaticSolid", "snapToStaticSolid", bool), ("m_minAltitude", "minAltitude", float),
    ("m_maxAltitude", "maxAltitude", float), ("m_minVegetation", "minVegetation", float),
    ("m_maxVegetation", "maxVegetation", float), ("m_surroundCheckVegetation", "surroundCheckVegetation", bool),
    ("m_surroundCheckDistance", "surroundCheckDistance", float), ("m_surroundCheckLayers", "surroundCheckLayers", int),
    ("m_surroundBetterThanAverage", "surroundBetterThanAverage", float), ("m_minOceanDepth", "minOceanDepth", float),
    ("m_maxOceanDepth", "maxOceanDepth", float), ("m_minTilt", "minTilt", float), ("m_maxTilt", "maxTilt", float),
    ("m_terrainDeltaRadius", "terrainDeltaRadius", float), ("m_maxTerrainDelta", "maxTerrainDelta", float),
    ("m_minTerrainDelta", "minTerrainDelta", float), ("m_snapToWater", "snapToWater", bool),
    ("m_groundOffset", "groundOffset", float), ("m_groupSizeMin", "groupSizeMin", int),
    ("m_groupSizeMax", "groupSizeMax", int), ("m_groupRadius", "groupRadius", float),
    ("m_minDistanceFromCenter", "minDistanceFromCenter", float), ("m_maxDistanceFromCenter", "maxDistanceFromCenter", float),
    ("m_inForest", "inForest", bool), ("m_forestTresholdMin", "forestTresholdMin", float),
    ("m_forestTresholdMax", "forestTresholdMax", float), ("m_foldout", "foldout", bool),
]

# Los colores de bioma del minimapa (Llanuras es "heath"). El océano no tiene:
# `GetPixelColor` lo pinta blanco y el shader lo tiñe por profundidad.
MINIMAP_COLORS = ["m_meadowsColor", "m_ashlandsColor", "m_blackforestColor", "m_deepnorthColor", "m_heathColor",
                  "m_swampColor", "m_mountainColor", "m_mistlandsColor"]

ALT_FIELDS = [
    ("m_name", "name", str), ("m_enabled", "enabled", bool), ("m_biome", "biome", int),
    ("m_namePrefix", "namePrefix", str), ("m_nameSuffix", "nameSuffix", str), ("m_nameOverride", "nameOverride", str),
    ("m_levelUpChanceMultiplier", "levelUpChanceMultiplier", float),
    ("m_minDistanceFromCenter", "minDistanceFromCenter", float), ("m_minAmountSpawned", "minAmountSpawned", int),
    ("m_maxAmountSpawned", "maxAmountSpawned", int), ("m_chance", "chance", float),
    ("m_requireNeighbor", "requireNeighbor", int), ("m_notNeighbor", "notNeighbor", int),
    ("m_minEdgeSize", "minEdgeSize", int), ("m_maxEdgeSize", "maxEdgeSize", int),
    ("m_minAvgHeight", "minAvgHeight", float), ("m_maxAvgHeight", "maxAvgHeight", float),
    ("m_belowWorldX", "belowWorldX", float), ("m_aboveWorldX", "aboveWorldX", float),
    ("m_belowWorldY", "belowWorldY", float), ("m_aboveWorldY", "aboveWorldY", float),
    ("m_forceMusic", "forceMusic", str), ("m_forceEnvironment", "forceEnvironment", str),
    ("m_terrainTextureOverride", "terrainTextureOverride", int),
    # Apagados en compilación (`AltBiome.heightMapChanges = false`): hoy no
    # cambian el relieve. Van para que un parche que los prenda se note.
    ("m_baseHeightMultiplier", "baseHeightMultiplier", float), ("m_baseHeightOffset", "baseHeightOffset", float),
    ("m_heightMapMultiplier", "heightMapMultiplier", float), ("m_heightMapOffset", "heightMapOffset", float),
    ("m_heightMapBiomeOverride", "heightMapBiomeOverride", int), ("m_customGenerator", "customGenerator", bool),
]


# ---------------------------------------------------------------- funciones puras

def stable_hash(s: str) -> int:
    """
    `StringExtensionMethods.GetStableHashCode` (assembly_utils): djb2 doble que
    alterna caracteres pares e impares, en int32. Es la semilla del RNG de cada
    tipo de lugar (`seed + hash(prefab)`) y de cada variante de bioma.
    """
    h1 = h2 = 5381
    i, n = 0, len(s)
    while i < n and s[i] != "\0":
        h1 = (((h1 << 5) + h1) ^ ord(s[i])) & 0xFFFFFFFF
        if i == n - 1 or s[i + 1] == "\0":
            break
        h2 = (((h2 << 5) + h2) ^ ord(s[i + 1])) & 0xFFFFFFFF
        i += 2
    h = (h1 + h2 * 1566083941) & 0xFFFFFFFF
    return h - (1 << 32) if h >= 1 << 31 else h


def asset_id(raw: dict | None) -> dict:
    """`SoftReferenceableAssets.AssetID` v3..v0; `hex` es la clave del manifiesto SoftRef."""
    raw = raw or {}
    v = [int(raw.get(k, 0)) & 0xFFFFFFFF for k in ("v3", "v2", "v1", "v0")]
    return {"v3": v[0], "v2": v[1], "v1": v[2], "v0": v[3], "hex": "".join(f"{x:08x}" for x in v), "isValid": any(v)}


def parse_softref_manifest(text: str) -> dict[str, str]:
    """
    asset ID → nombre del prefab, del manifiesto `StreamingAssets/SoftRef/manifest`.

    Hace falta porque varias listas guardan un `m_prefabName` viejo (la del
    Norte profundo dice `TarPit1` donde el prefab es `NorthVillage`). El juego
    usa `m_prefab.Name`, que es el nombre del archivo del prefab.
    """
    out, cur = {}, None
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("- asset ID:"):
            cur = s.split(":", 1)[1].strip().lower()
        elif s.startswith("path in bundle:") and cur:
            path = s.split(":", 1)[1].strip()
            if path.lower().endswith(".prefab"):
                out[cur] = os.path.splitext(os.path.basename(path))[0]
            cur = None
    return out


def log_list_order(log_text: str) -> list[tuple[int, int]]:
    """
    (ubicaciones, vegetación) de cada `LocationList` en el orden en que el juego
    las registró, de las líneas "Added N locations, M vegetations … from main"
    de la última carga del log.
    """
    rows = re.findall(r"Added (\d+) locations, (\d+) vegetations", log_text)
    sig = [(int(a), int(b)) for a, b in rows]
    # Si el log trae varias cargas, vale la última tanda.
    return sig[-len(LIST_ORDER):] if len(sig) >= len(LIST_ORDER) else sig


def sort_lists(lists: list[dict]) -> list[dict]:
    """Las LocationList en el orden de `SetupLocations`: registro (`LIST_ORDER`) y después `m_sortOrder`, estable."""
    unknown = [l["name"] for l in lists if l["name"] not in LIST_ORDER]
    if unknown:
        raise SystemExit(f"LocationList nuevas sin orden conocido: {unknown}. Mirar el log del juego y sumarlas a LIST_ORDER.")
    names = [l["name"] for l in lists]
    if len(set(names)) != len(names):
        raise SystemExit(f"LocationList repetidas en los bundles: {names}. Revisar cuál es la de main.")
    by_reg = sorted(lists, key=lambda l: LIST_ORDER.index(l["name"]))
    return sorted(by_reg, key=lambda l: l["sortOrder"])   # sorted es estable


def fields(raw: dict, spec: list[tuple]) -> dict:
    """Copia los campos con el nombre de SeedLab y el tipo del C#. Un faltante queda en su valor nulo."""
    d = {}
    for src, dst, typ in spec:
        v = raw.get(src)
        d[dst] = typ(v) if v is not None else (None if typ is str else typ())
    return d


def location_def(raw: dict, index: int, source: dict, prefab: str | None, alt_parent: str | None) -> dict:
    """
    Un `ZoneLocation` con los nombres de `LocationDef` de SeedLab.

    `prefabName` es el valor en tiempo de ejecución: `SetupLocations` pisa el
    guardado con `m_prefab.Name` (el del manifiesto) cuando la entrada está
    habilitada o su asset ID es válido. `softRefName` es ese `m_prefab.Name`,
    la clave del RNG del tipo.
    """
    d = {"index": index, "orderedIndex": -1, "source": source}
    d.update(fields(raw, LOCATION_FIELDS))
    serialized = raw.get("m_prefabName") or ""
    aid = asset_id((raw.get("m_prefab") or {}).get("m_assetID"))
    # Sin prefab en el manifiesto (19 casos en 1.0.15, todos deshabilitados y
    # con el asset ID en cero) queda el nombre guardado, y si está vacío el m_name.
    name = prefab or serialized or d["name"] or ""
    d.update({"prefabName": name, "softRefName": prefab, "serializedPrefabName": serialized,
              "nameHash": stable_hash(name), "assetId": aid, "altBiomeParent": alt_parent})
    return d


def vegetation_def(raw: dict, index: int, source: dict, prefab: str | None, alt_parent: str | None) -> dict:
    """Un `ZoneVegetation` con los nombres de `VegetationDef` de SeedLab."""
    d = {"index": index, "source": source}
    d.update(fields(raw, VEGETATION_FIELDS))
    d["prefabName"] = prefab
    d["nameHash"] = stable_hash(prefab) if prefab else 0
    d["altBiomeParent"] = alt_parent
    return d


def placement_order(defs: list[dict]) -> list[int]:
    """
    Los índices que recorre `GenerateLocationsTimeSliced`: primero los
    prioritarios y después el resto, cada grupo en su orden (OrderByDescending
    es estable), sacando los deshabilitados o con cantidad 0.
    """
    ordered = [d for d in defs if d["prioritized"]] + [d for d in defs if not d["prioritized"]]
    return [d["index"] for d in ordered if d["enable"] and d["quantity"] != 0]


def duplicate_hashes(defs: list[dict]) -> list[str]:
    """
    Los prefabs que `SetupLocations` descarta de `m_locationsByHash` (con un
    error en el log) porque otra entrada anterior tiene el mismo hash. Sólo
    entran las habilitadas o con asset ID válido, como en el juego.
    """
    seen, dup = set(), []
    for d in defs:
        if not (d["enable"] or d["assetId"]["isValid"]):
            continue
        if d["nameHash"] in seen:
            dup.append(d["prefabName"])
        seen.add(d["nameHash"])
    return dup


def alt_def(raw: dict, index: int, add_locations: list[dict], add_vegetation: list[dict]) -> dict:
    """Una `AltBiome` con los nombres de `AltBiomeDef` de SeedLab."""
    d = {"index": index}
    d.update(fields(raw, ALT_FIELDS))
    d["nameHash"] = stable_hash(d["name"] or "")
    d["incompatibleAltBiomes"] = list(raw.get("m_incompatibleAltBiomes") or [])
    d["blockLocationNames"] = list(raw.get("m_blockLocationNames") or [])
    d["blockVegetationNames"] = list(raw.get("m_blockVegetationNames") or [])
    d["blockEnvironments"] = list(raw.get("m_blockEnvironments") or [])
    d["blockSpawnNames"] = list(raw.get("m_blockSpawnNames") or [])
    d["addEnvironmentsCount"] = len(raw.get("m_addEnvironments") or [])
    d["spawnCount"] = len(raw.get("m_spawn") or [])
    # Como en SeedLab, las ubicaciones que agrega van completas acá además de
    # en locations.json (mismo `index`, con `altBiomeParent`).
    d["addLocations"] = add_locations
    d["addVegetation"] = add_vegetation
    return d


def door_caption(captions: list[str]) -> str | None:
    """
    El cartel de la puerta de la mazmorra (`Teleport.m_enterText`), la regla de
    SeedLab: vale si todas las puertas del prefab dicen lo mismo. Dos carteles
    distintos no nombran nada.
    """
    distinct = {c for c in captions if c}
    return distinct.pop() if len(distinct) == 1 else None


def stamp_line(ver: dict, unity: str, extracted: str) -> str:
    """El `DATA-STAMP` de SeedLab en una línea, para reconocer la compilación de cada archivo."""
    return (f"DATA-STAMP game-version={ver.get('gameVersion')} network={ver.get('networkVersion')} unity={unity} "
            f"assembly_valheim-sha256={ver['assemblyValheimSha256']} dumped={extracted[:10]} "
            f"dumper={DUMPER} mode=assets schema={SCHEMA}")


def norm(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


# ------------------------------------------------------------ nombres para mostrar

# Nombres de lugares que el juego no trae. En inglés, los de la wiki (los mismos
# que usa `places.json`, así se cruzan con su ficha); en español, los de
# `places.ES` o traducidos acá. Orden: de lo más específico a lo más general.
# Categorías: start, boss, trader, dungeon, village, camp, tower, runestone,
# shipwreck, resource, poi. start/boss/trader/dungeon/runestone salen del juego.
MANUAL: list[tuple[str, str, str, str]] = [
    (r"StartTemple", "Sacrificial Stones", "Piedras de sacrificio", "start"),
    (r"StoneCircle", "Ancient Stone Circle", "Círculo de piedras antiguo", "poi"),
    (r"Greydwarf_camp\d", "Greydwarf Camp", "Campamento de grisucios", "camp"),
    (r"Grave1", "Swamp Grave", "Tumba del pantano", "poi"),
    (r"SwampRuin\d", "Swamp Runestone Tower", "Torre de la piedra rúnica", "tower"),
    (r"FireHole", "Geyser", "Géiser", "poi"),
    (r"Ruin1|StoneHouse[34]", "Abandoned Outpost", "Puesto abandonado", "poi"),
    (r"Ruin2", "Greydwarf Tower", "Torre de grisucios", "tower"),
    (r"StoneTowerRuins03", "Contested Tower", "Torre disputada", "tower"),
    (r"StoneTowerRuins\d\d_sunk", "Sunken Tower", "Torre hundida", "tower"),
    (r"StoneTowerRuins(0[789]|10)", "Skeleton Tower", "Torre de esqueletos", "tower"),
    (r"StoneTowerRuins0[45](_leet)?", "Mountain Tower", "Torre de la montaña", "tower"),
    (r"Ruin3", "Fuling Ruin", "Ruina fuling", "poi"),
    (r"GoblinCamp\d(_1)?", "Fuling Village", "Aldea fuling", "village"),
    (r"GoblinHut\d\d", "Fuling Hut", "Choza fuling", "village"),
    (r"StoneTower[1-4]", "Fuling Outpost", "Puesto fuling", "tower"),
    (r"StoneHenge\d", "Stonehenge", "Círculo de monolitos", "poi"),
    (r"WoodHouse\d+", "Abandoned House", "Casa abandonada", "poi"),
    (r"WoodFarm\d", "Abandoned Village", "Aldea abandonada", "village"),
    (r"WoodVillage\d", "Draugr Village", "Aldea draugr", "village"),
    (r"Dolmen\d\d", "Dolmen", "Dolmen", "poi"),
    (r"InfestedTree\d\d", "Gucksack", "Saco de légamo", "resource"),
    (r"SwampHut\d(_1)?", "Abandoned Hut", "Choza abandonada", "poi"),
    (r"SwampWell\d|MountainWell\d", "Inverted Tower", "Torre invertida", "tower"),
    (r"ShipSetting\d\d", "Viking Graveyard", "Cementerio vikingo", "poi"),
    (r"DrakeNest\d\d", "Drake Nest", "Nido de draco", "poi"),
    (r"Waymarker\d\d", "Cairns", "Túmulos", "poi"),
    (r"AbandonedLogCabin\d\d", "Abandoned Cabin", "Cabaña abandonada", "poi"),
    (r"MountainGrave\d\d", "Mountain grave", "Tumba de la montaña", "poi"),
    (r"FrozenShip\d\d_DN", "Frozen Ship", "Barco congelado", "shipwreck"),
    (r"ShipWreck\d\d(_DN)?", "Shipwreck", "Naufragio", "shipwreck"),
    (r"CombatRuin\d\d", "Combat Ruin", "Ruina de batalla", "poi"),
    (r"BigRockClearing", "Big Rock Clearing", "Claro de la gran roca", "poi"),
    (r"TarPit\d(_1)?", "Tar Pit", "Pozo de alquitrán", "resource"),
    (r"AncientUpgradeStation", "Forge of Potential", "Forja del Potencial", "poi"),
    (r"Mistlands_Lighthouse\d_new", "Dvergr Lighthouse", "Faro dvergr", "tower"),
    (r"Mistlands_GuardTower.*", "Dvergr Guard Tower", "Torre de guardia dvergr", "tower"),
    (r"Mistlands_Excavation\d", "Dvergr Excavation Site", "Excavación dvergr", "poi"),
    (r"Mistlands_Harbour\d", "Dvergr Harbor", "Puerto dvergr", "poi"),
    (r"Mistlands_Viaduct\d", "Dvergr viaduct", "Viaducto dvergr", "poi"),
    (r"Mistlands_RockSpire\d", "Rock Spire", "Aguja de roca", "poi"),
    (r"Mistlands_Giant\d", "Giant Remains", "Restos de gigante", "resource"),
    (r"Mistlands_RoadPost\d", "Dvergr Road Post", "Poste de camino dvergr", "poi"),
    (r"Mistlands_Statue(Group)?\d", "Dvergr Statues", "Estatuas dvergr", "poi"),
    (r"Mistlands_Swords\d", "Ancient Sword", "Espada antigua", "resource"),
    (r"PlaceofMystery\d", "Mysterious Location", "Ubicación misteriosa", "poi"),
    (r"CharredFortress", "Charred Fortress", "Fortaleza carbonizada", "poi"),
    (r"FortressRuins|AshlandRuins", "Ashlands ruins", "Ruinas de la Tierra de Ceniza", "poi"),
    (r"CharredRuins\d", "Charred Ruins", "Ruinas carbonizadas", "poi"),
    (r"CharredTowerRuins\d_dvergr", "Dvergr Charred Tower Ruins", "Ruinas de torre dvergr carbonizada", "tower"),
    (r"CharredTowerRuins\d", "Charred Tower Ruins", "Ruinas de torre carbonizada", "tower"),
    (r"CharredStone_Spawner", "Charred Stone", "Piedra carbonizada", "poi"),
    (r"LeviathanLava", "Flametal Ore Vein", "Veta de mineral de llametal", "resource"),
    (r"SulfurArch", "Sulfur Arch", "Arco de azufre", "resource"),
    (r"VoltureNest", "Volture Nest", "Nido de buicán", "poi"),
    (r"NorthVillage", "Northern Village", "Aldea norteña", "village"),
    (r"NorthMemorialPlace", "Memorial Site", "Sitio conmemorativo", "poi"),
    (r"IcePond\d", "Ice Pond", "Estanque helado", "poi"),
    (r"HotSpring\d", "Hot Spring", "Fuente termal", "poi"),
    (r"DN_hut\d\d", "Northern Hut", "Choza norteña", "poi"),
    (r"LumberCamp", "Lumber Camp", "Campamento maderero", "camp"),
    (r"DN_gammeltrollFrac\d\d", "Ancient Troll Remains", "Restos de trol antiguo", "resource"),
]

# El altar de la Reina está en una sala de la mazmorra, no en la ubicación
# (`dvergr_new_bossroom_ENTRANCE02`): el vínculo lo dan los pines del juego
# (Vegvisir con `$enemy_seekerqueen`), que resuelve `main` con `boss_by_token`.


def manual_entry(prefab: str) -> tuple[str, str, str] | None:
    for pat, en, es, cat in MANUAL:
        if re.fullmatch(pat, prefab):
            return en, es, cat
    return None


def display_entry(prefab: str, facts: dict, loc, bosses: dict, places: dict, pin_sprite: dict) -> dict:
    """
    Nombre, categoría, ícono y fichas de un prefab. Prioridad del nombre: jefe
    (altar o pin de jefe) > comerciante > `m_discoverLabel` > cartel de la
    puerta de la mazmorra > pin del juego > tabla `MANUAL` (el orden de
    SeedLab, más los pines y la tabla). `places` va de nombre normalizado a su
    `{tab, slug}`.
    """
    man = manual_entry(prefab)
    name, source, category = None, None, man[2] if man else "poi"
    boss = facts.get("boss")
    if boss and boss in bosses:
        name, source, category = dict(bosses[boss]["name"]), "boss", "boss"
    elif facts.get("trader"):
        name, source, category = loc.t(facts["trader"]), "trader", "trader"
    if not name and facts.get("discoverLabel"):
        name, source = loc.t(facts["discoverLabel"]), "discoverLabel"
    if not name and facts.get("door"):
        name, source = loc.t(facts["door"]), "door"
    pin = facts.get("pin")
    if not name and pin and pin["type"] != 9:
        name, source = loc.t(pin["name"]), "pin"
    if not name and man:
        name, source = {"en": man[0], "es": man[1]}, "manual"
    if facts.get("hasInterior") and category not in ("boss", "trader"):
        category = "dungeon"
    if prefab.startswith("Hildir_") and category != "trader":
        category = "dungeon"          # las tres mazmorras de las misiones de Hildir
    if facts.get("runestone") and category == "poi" and not man:
        category = "runestone"
    if facts.get("centerFirst"):
        category = "start"
    if category == "runestone" and not name:
        name, source = loc.t("piece_lorestone"), "runestone"
    icon = facts.get("locationIcon") or (pin_sprite.get(pin["type"]) if pin else None)
    # La ficha de lugar se busca por todos los nombres que tiene: el de la
    # Reina es su jefe, pero la puerta dice "Infested Citadel".
    names = [(name or {}).get("en")] + [(loc.t(facts.get(k)) or {}).get("en") for k in ("door", "discoverLabel")]
    names += [man[0]] if man else []
    place = next((places[norm(n)] for n in names if n and norm(n) in places), None)
    boss_page = {"tab": bosses[boss].get("tab", "bosses"), "slug": bosses[boss]["slug"]} if boss in bosses else None
    return {
        "name": name or {"en": prefab, "es": prefab}, "nameSource": source or "prefab", "category": category,
        "icon": icon, "iconSource": "locationIcon" if facts.get("locationIcon") else ("pin" if icon else None),
        "pin": {"name": loc.t(pin["name"]) or {"en": pin["name"], "es": pin["name"]}, "type": pin["type"]} if pin else None,
        # La ficha del sitio (el jefe antes que el lugar) y todas las que hay:
        # la Reina tiene la suya y la de la Ciudadela infestada.
        "page": boss_page or place, "pages": [p for p in (boss_page, place) if p],
        "candidates": facts.get("candidates", False),
    }


# ------------------------------------------------------------------- el juego

def game_version(root: str = GAME_ROOT) -> dict:
    """
    La versión no está en los datos serializados (es una constante del IL en
    `Version..cctor`). Sale del log del juego, y va con el SHA-256 del
    assembly para detectar un log viejo después de un parche.
    """
    dll = os.path.join(root, "valheim_Data", "Managed", "assembly_valheim.dll")
    with open(dll, "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    ver, net, wg, log_time = None, None, None, None
    try:
        with open(PLAYER_LOG, encoding="utf-8", errors="replace") as f:
            text = f.read()
        m = re.findall(r"Valheim version: ([\w.\-]+) \(network version (\d+)\)", text)
        if m:
            ver, net = m[-1][0], int(m[-1][1])
        w = re.findall(r"Worldgenerator version setup:(\d+)", text)
        wg = int(w[-1]) if w else None
        log_time = datetime.fromtimestamp(os.path.getmtime(PLAYER_LOG), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except OSError:
        pass
    # Un log escrito antes del último cambio del DLL es de otra versión.
    stale = log_time is not None and os.path.getmtime(PLAYER_LOG) < os.path.getmtime(dll)
    build = None
    acf = os.path.normpath(os.path.join(root, "..", "..", "appmanifest_892970.acf"))
    if os.path.exists(acf):
        with open(acf, encoding="utf-8", errors="replace") as f:
            b = re.search(r'"buildid"\s+"(\d+)"', f.read())
            build = int(b.group(1)) if b else None
    return {"gameVersion": ver, "networkVersion": net, "assemblyValheimSha256": sha, "steamBuildId": build,
            "versionSource": "Player.log" if ver else None, "playerLogWrittenAt": log_time, "playerLogStale": stale,
            "logWorldGenVersion": wg}


def dump(name: str, obj) -> None:
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")


def same_copies(comps: list, key) -> None:
    """Varias copias de un componente en los bundles tienen que decir lo mismo."""
    if len({json.dumps(key(c), sort_keys=True, default=str) for c in comps}) > 1:
        raise SystemExit(f"Hay copias distintas de {comps[0].cls}: revisar cuál es la de main.")


def main() -> None:
    from .unity import Game
    from .loc import Loc, parse_localization
    from .extract import Icons

    sys.stdout.reconfigure(encoding="utf-8")
    t0 = time.time()
    g = Game()
    g.index(CLASSES)
    loc = Loc({})
    for text in g.localization_texts():
        loc.table.update(parse_localization(text))
    with open(os.path.join(GAME_ROOT, "valheim_Data", "StreamingAssets", "SoftRef", "manifest"), encoding="utf-8-sig") as f:
        manifest = parse_softref_manifest(f.read())
    print(f"juego cargado ({g.unity_version}), {len(manifest)} prefabs en el manifiesto, {time.time() - t0:.0f}s")

    # --- ZoneSystem: hay 3 copias en los bundles (dos iguales de 130 y una
    # vieja de 124). La de la escena main es la de más ubicaciones.
    zss = g.components("ZoneSystem")
    zs = max(zss, key=lambda c: len(c.tree["m_locations"]))
    big = [c for c in zss if len(c.tree["m_locations"]) == len(zs.tree["m_locations"])]
    same_copies(big, lambda c: c.tree["m_locations"])

    lists = [{"name": g.prefab(c.go), "sortOrder": c.tree.get("m_sortOrder", 0), "comp": c}
             for c in g.components("LocationList")]
    lists = sort_lists(lists)
    try:
        with open(PLAYER_LOG, encoding="utf-8", errors="replace") as f:
            seen = log_list_order(f.read())
    except OSError:
        seen = []
    ours = [(len(l["comp"].tree["m_locations"]), len(l["comp"].tree.get("m_vegetation", []))) for l in lists]
    order_check = "ok" if seen == ours else ("sin log" if not seen else "DISTINTO")
    if order_check == "DISTINTO":
        print(f"⚠ el log registró las LocationList como {seen} y LIST_ORDER da {ours}")

    # --- AltBiomeList: la que referencia el ZoneSystem (`m_altBiomeLists`).
    alt_names = [g.prefab(g.ref(zs.file, p)) for p in zs.tree.get("m_altBiomeLists") or []]
    alts_comp = g.components("AltBiomeList")
    if not alts_comp:
        raise SystemExit("No apareció ninguna AltBiomeList.")
    same_copies(alts_comp, lambda c: c.tree.get("m_alts") or c.tree.get("m_altBiomes"))
    ab = alts_comp[0]
    if alt_names and g.prefab(ab.go) not in alt_names:
        print(f"⚠ la AltBiomeList es {g.prefab(ab.go)} y el ZoneSystem referencia {alt_names}")
    alts_raw = ab.tree.get("m_alts") or ab.tree.get("m_altBiomes") or []

    # --- La lista de SetupLocations, en orden.
    sources = []
    for raw in zs.tree["m_locations"]:
        sources.append((raw, {"kind": "ZoneSystemPrefab", "name": g.prefab(zs.go), "sortOrder": -1}, None))
    for l in lists:
        for raw in l["comp"].tree["m_locations"]:
            sources.append((raw, {"kind": "LocationList", "name": l["name"], "sortOrder": l["sortOrder"]}, None))
    for a in alts_raw:
        for raw in a.get("m_addLocations") or []:
            sources.append((raw, {"kind": "AltBiome", "name": a["m_name"], "sortOrder": -1}, a["m_name"]))
    defs, missing = [], []
    for i, (raw, src, parent) in enumerate(sources):
        aid = asset_id((raw.get("m_prefab") or {}).get("m_assetID"))
        prefab = manifest.get(aid["hex"])
        d = location_def(raw, i, src, prefab, parent)
        if prefab is None:
            missing.append({"prefabName": d["prefabName"], "enable": d["enable"], "quantity": d["quantity"],
                            "assetIdValid": aid["isValid"]})
        defs.append(d)
    order = placement_order(defs)
    for pos, idx in enumerate(order):
        defs[idx]["orderedIndex"] = pos
    dup = duplicate_hashes(defs)
    runs_without_prefab = [m["prefabName"] for m in missing if m["enable"] or m["assetIdValid"]]
    if runs_without_prefab:
        raise SystemExit(f"Ubicaciones habilitadas (o con asset ID) sin prefab en el manifiesto SoftRef: {runs_without_prefab}")

    # La vegetación de las variantes, con su índice en `ZoneSystem.m_vegetation`
    # después de SetupLocations (escena, listas y variantes, en ese orden).
    veg_index = len(zs.tree.get("m_vegetation") or []) + sum(len(l["comp"].tree.get("m_vegetation") or []) for l in lists)
    alt_defs = []
    for i, a in enumerate(alts_raw):
        locs = [d for d in defs if d["altBiomeParent"] == a["m_name"]]
        vegs = []
        for raw in a.get("m_addVegetation") or []:
            prefab = g.prefab(g.ref(ab.file, raw.get("m_prefab")))
            src = {"kind": "AltBiome", "name": a["m_name"], "sortOrder": -1}
            vegs.append(vegetation_def(raw, veg_index, src, prefab, a["m_name"]))
            veg_index += 1
        alt_defs.append(alt_def(a, i, locs, vegs))

    # --- Constantes de prefab (las que SeedLab toma de su PrefabConstantsFile).
    mms = [c for c in g.components("Minimap") if c.tree.get("m_locationIcons")]
    same_copies(mms, lambda c: [c.tree.get(k) for k in MINIMAP_COLORS + ["m_textureSize", "m_pixelSize"]])
    mm = mms[0]
    # El Heightmap de la zona está en un hijo del prefab `_Zone`, no en la raíz.
    zone_go = g.ref(zs.file, zs.tree.get("m_zonePrefab"))
    zone_hm = next((c for c in g.comps_in_tree(zone_go, 3) if c.cls == "Heightmap"), None)
    colors = {k[2:]: {c: mm.tree[k][c] for c in "rgba"} for k in MINIMAP_COLORS if isinstance(mm.tree.get(k), dict)}
    # m_mistlandsColor es privado sin [SerializeField]: vale el del código.
    colors.setdefault("mistlandsColor", {"r": 0.2, "g": 0.2, "b": 0.2, "a": 1.0, "codeDefault": True})
    ver = game_version()
    if ver["logWorldGenVersion"] not in (None, WORLDGEN_VERSION):
        print(f"⚠ el log dice worldGenVersion {ver['logWorldGenVersion']} y el script asume {WORLDGEN_VERSION}")
    if ver["playerLogStale"]:
        print("⚠ el Player.log es anterior al assembly: la versión y el orden de listas pueden ser de otro parche")

    # --- Íconos del minimapa: los fijos por ubicación (m_locationIcons) y los
    # de cada tipo de pin (m_icons), que el juego pone con Vegvisir y piedras.
    icons = Icons(g, ICONS)
    loc_icon = {x["m_name"]: icons.save(mm.file, x["m_icon"]) for x in mm.tree["m_locationIcons"]}
    pin_sprite = {x["m_name"]: g.sprite_name(mm.file, x["m_icon"]) for x in mm.tree["m_icons"]}

    # --- Las fichas del sitio, para enlazar (site.py las genera antes).
    bosses_site, places = {}, {}
    try:
        with open(os.path.join(SITE, "bosses.json"), encoding="utf-8") as f:
            bosses_site = {b["id"]: b for b in json.load(f)}
        with open(os.path.join(SITE, "places.json"), encoding="utf-8") as f:
            places = {norm(p["name"]["en"]): {"tab": p.get("tab", "places"), "slug": p["slug"]} for p in json.load(f)}
    except FileNotFoundError:
        print("⚠ faltan data/site/bosses.json o places.json: sin enlaces a fichas")

    # --- Lo que dicen del lugar los componentes de su prefab.
    facts: dict[str, dict] = {}
    def fact(root):
        return facts.setdefault(root, {}) if root else {}
    for c in g.components("Location"):
        f = fact(g.prefab(c.go))
        f["hasInterior"] = bool(c.tree.get("m_hasInterior"))
        f["discoverLabel"] = c.tree.get("m_discoverLabel") or None
    doors: dict[str, list[str]] = {}
    for c in g.components("Teleport"):
        doors.setdefault(g.root_name(c.go), []).append(c.tree.get("m_enterText") or "")
    for root, captions in doors.items():
        if root and door_caption(captions):
            fact(root)["door"] = door_caption(captions)
    for c in g.components("OfferingBowl"):
        # El altar del Norte profundo tiene dos cuencos (uno sólo abre la
        # puerta) y el del sitio conmemorativo no invoca un jefe: vale sólo si
        # lo que invoca es un jefe del sitio.
        boss = g.prefab(g.ref(c.file, c.tree.get("m_bossPrefab")))
        if boss in bosses_site:
            fact(g.root_name(c.go))["boss"] = boss
    for c in g.components("Trader"):
        # La bruja del pantano tiene el m_name vacío: queda el token `$npc_`
        # del prefab (`npc_bogwitch`), la misma unión a mano que hace SeedLab.
        fact(g.root_name(c.go))["trader"] = c.tree.get("m_name") or f"npc_{(g.prefab(c.go) or '').lower()}"
    for c in g.components("RuneStone"):
        fact(g.root_name(c.go))["runestone"] = True
    for c in g.components("Vegvisir") + g.components("RuneStone"):
        pins = c.tree.get("m_locations") or ([c.tree] if c.tree.get("m_locationName") else [])
        for p in pins:
            target = p.get("m_locationName")
            if target:
                fact(target).setdefault("pin", {"name": p.get("m_pinName"), "type": p.get("m_pinType")})
    boss_by_token = {norm(b["name"]["en"]): bid for bid, b in bosses_site.items()}
    for name, f in facts.items():
        # Un pin de jefe apunta a su ubicación aunque el altar esté en una sala
        # aparte (la Reina): el nombre del pin es el del jefe.
        if not f.get("boss") and (f.get("pin") or {}).get("type") == 9:
            t = loc.t(f["pin"]["name"])
            if t and norm(t["en"]) in boss_by_token:
                f["boss"] = boss_by_token[norm(t["en"])]
        if name in loc_icon:
            f["locationIcon"] = loc_icon[name]
    used_pins = set()
    display = {}
    for d in defs:
        if not (d["enable"] and d["quantity"]) or d["prefabName"] in display:
            continue
        f = dict(facts.get(d["prefabName"], {}))
        f["centerFirst"] = d["centerFirst"]
        f["candidates"] = d["unique"] and d["quantity"] > 1
        e = display_entry(d["prefabName"], f, loc, bosses_site, places, pin_sprite)
        if e["iconSource"] == "pin":
            used_pins.add(e["icon"])
        display[d["prefabName"]] = e
    # Los sprites de pin que usa algún lugar se exportan como los fijos.
    for x in mm.tree["m_icons"]:
        if g.sprite_name(mm.file, x["m_icon"]) in used_pins:
            icons.save(mm.file, x["m_icon"])
    for e in display.values():
        if e["icon"]:
            e["icon"] = e["icon"].lower().replace(" ", "_")

    # --- Escribir.
    extracted = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    stamp = {"stamp": stamp_line(ver, g.unity_version, extracted), "gameVersion": ver["gameVersion"],
             "assemblyValheimSha256": ver["assemblyValheimSha256"], "extractedAt": extracted, "schema": SCHEMA}
    placed = len(order)
    dump("locations.json", {**stamp, "count": len(defs), "enabledCount": placed,
                            "duplicateHashPrefabNames": dup, "orderedPrefabNames": [defs[i]["prefabName"] for i in order],
                            "locations": defs})
    dump("altbiomes.json", {**stamp, "count": len(alt_defs),
                            "enabledCount": sum(1 for a in alt_defs if a["enabled"]), "altBiomes": alt_defs})
    lists_meta, first = [], len(zs.tree["m_locations"])
    first_veg = len(zs.tree.get("m_vegetation") or [])
    for l in lists:
        n, nv = len(l["comp"].tree["m_locations"]), len(l["comp"].tree.get("m_vegetation") or [])
        lists_meta.append({"name": l["name"], "sortOrder": l["sortOrder"], "locationCount": n, "vegetationCount": nv,
                           "firstLocationIndex": first, "firstVegetationIndex": first_veg})
        first, first_veg = first + n, first_veg + nv
    counts = {
        "locations": len(defs), "enabled": sum(1 for d in defs if d["enable"]), "placed": placed,
        "withQuantity": sum(1 for d in defs if d["quantity"]), "requested": sum(defs[i]["quantity"] for i in order),
        "prioritized": sum(1 for i in order if defs[i]["prioritized"]), "fromAltBiomes": sum(1 for d in defs if d["altBiomeParent"]),
        "withoutSoftRef": len(missing), "renamedBySoftRef": sum(1 for d in defs if d["softRefName"] and d["softRefName"] != d["serializedPrefabName"]),
        "altBiomes": len(alt_defs), "altBiomesEnabled": sum(1 for a in alt_defs if a["enabled"]),
        "display": len(display), "displayManual": sum(1 for e in display.values() if e["nameSource"] == "manual"),
        "displayFromGame": sum(1 for e in display.values() if e["nameSource"] not in ("manual", "prefab")),
        "displayUnnamed": sum(1 for e in display.values() if e["nameSource"] == "prefab"),
        "icons": len(icons.done),
    }
    dump("meta.json", {
        **stamp, **ver, "unity": g.unity_version, "worldGenVersion": WORLDGEN_VERSION,
        "counts": counts, "listOrderCheck": order_check, "listOrderFromLog": seen,
        "withoutSoftRef": missing,
        "zoneSystem": {"locationVersion": zs.tree.get("m_locationVersion"), "waterLevel": zs.tree.get("m_waterLevel"),
                       "zoneSize": zs.tree.get("m_zoneSize"), "zoneTTL": zs.tree.get("m_zoneTTL"), "zoneTTS": zs.tree.get("m_zoneTTS"),
                       "locationScenes": list(zs.tree.get("m_locationScenes") or []),
                       "locationLists": lists_meta, "sortOrderTies": len({l["sortOrder"] for l in lists}) < len(lists),
                       "altBiomeListNames": alt_names or [g.prefab(ab.go)],
                       "zoneCtrlPrefabPresent": int(bool(g.ref(zs.file, zs.tree.get("m_zoneCtrlPrefab")))),
                       "locationProxyPrefabPresent": int(bool(g.ref(zs.file, zs.tree.get("m_locationProxyPrefab"))))},
        "minimap": {"textureSize": mm.tree.get("m_textureSize"), "pixelSize": mm.tree.get("m_pixelSize"),
                    "exploreRadius": mm.tree.get("m_exploreRadius"), "exploreInterval": mm.tree.get("m_exploreInterval"),
                    "removeRadius": mm.tree.get("m_removeRadius"), "colors": colors,
                    "oceanColorHardcoded": {"r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0},
                    "locationIcons": [x["m_name"] for x in mm.tree["m_locationIcons"]],
                    "locationIconSprites": loc_icon,
                    "pinIcons": {str(k): v for k, v in pin_sprite.items()}},
        "heightmap": {"zoneWidth": zone_hm.tree.get("m_width"), "zoneScale": zone_hm.tree.get("m_scale"),
                      "zoneIsDistantLod": bool(zone_hm.tree.get("m_isDistantLod"))} if zone_hm else None,
    })
    dump("display.json", {**stamp, "count": len(display), "locations": display})
    print(counts, f"orden de listas: {order_check}", f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
