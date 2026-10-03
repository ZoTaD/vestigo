"""
Project Zomboid (Build 42) → el botín: qué puede aparecer en cada mueble, zombi, vehículo y bolso, y con qué chance
(2026-10-01).

Lee la instalación del juego (sólo lectura, con `luatable.py`: nunca ejecuta Lua):

  media/lua/server/Items/Distribution_*.lua       la "junk" (ClutterTables) y lo que traen los bolsos al encontrarlos
                                                  (BagsAndContainers), que usa Distributions.lua
  media/lua/server/Items/Distributions.lua        `distributionTable`: cuarto → mueble → tabla, más `all` (los muebles
                                                  fuera de un cuarto o en un cuarto sin tabla, y los zombis)
  media/lua/server/Items/ProceduralDistributions.lua   las listas que eligen los muebles procedurales
  media/lua/server/Vehicles/VehicleDistribution_*.lua y VehicleDistributions.lua   guanteras, baúles y asientos
  media/lua/server/Items/SuburbsDistributions.lua `NoContainerFillRooms` y los alias de cuartos (`garage` = `mechanic`)

y con lo que ya escribieron extract.py (data/items.json, index.json, meta.json) y map.py (data/map/buildings.json,
data/map/web/common.json) arma los archivos del sitio en games/zomboid/data/loot (ver `build`):

    python games/zomboid/tools/loot.py           escribe data/loot/** (sólo lo que cambió) e imprime los pesos
    python games/zomboid/tools/loot.py --check   imprime el inventario (cuartos, listas, vehículos, atuendos…) para
                                                 compararlo con el del plan (docs/superpowers/plans/2026-10-01-zomboid-loot.md)

Los nombres en/es de muebles, vehículos, atuendos, escondites y zonas están en loot_names.py.

Por qué así:
  - Las tablas son Lua, pero Lua de una sola forma (constructores de tablas): un lector propio alcanza y no hace falta
    instalar nada. Si un parche mete algo que el lector no entiende, corta (LuaError) en vez de leer mal.
  - Los archivos se leen en el orden del juego (alfabético dentro de cada carpeta): Distributions.lua y
    ProceduralDistributions.lua apuntan a tablas de los Distribution_*.lua (`junk = ClutterTables.BinJunk`), que
    tienen que existir antes.
  - Los alias están adentro de una función (`mergeDistributions`, que el juego corre al cargar): el lector saltea las
    funciones a propósito, así que se sacan con una regex sobre el cuerpo de esa función y se aplican en su orden.

La cuenta, leída del bytecode de zombie/inventory/ItemPickerJava.class (42.21; los pc son de esa versión):

  1. Qué tabla tira un mueble (fillContainerInternal pc 446–718, fillContainerTypeInternal pc 0–193): el cuarto se
     busca por su nombre exacto (mayúsculas incluidas) con los alias aplicados. Si tiene tabla: la del mueble; si no la
     define y el mueble no está en NO_GENERIC, la `other` del cuarto; si tampoco, la `all` del cuarto (sólo 3 cuartos
     la tienen, y no tienen otra cosa). Si nada de eso, o no hay cuarto, o el cuarto no tiene tabla: `all.<mueble>`,
     y si `all` no lo define y el mueble no está en NO_GENERIC, `all.other`. Ver `Loot.table_for`.
     (NoContainerFillRooms no cambia la tabla: en esos cuartos —tiendas— los bolsos que salen de un mueble común
     vienen vacíos, doRollItemInternal pc 1258; los que salen de un mueble procedural se llenan igual, porque
     rollProceduralItemInternal pc 936/950 pasa `true` fijo. Ver `Loot.fills_bags`.)
  2. Un mueble procedural (rollProceduralItemInternal pc 69–953) elige UNA lista de su procList y la tira como una
     tabla común. Una lista con forceForTiles/Items/Zones/Rooms que se cumple gana; si no se cumple, no participa.
     Las demás compiten por peso (weightChance; ≤ 0 o sin poner vale 1). Adentro de un cuarto, el juego lleva la
     cuenta de cuántas veces salió cada lista en ese cuarto (RoomDef.getProceduralSpawnedContainer: clave = nombre
     de la lista, no tipo de mueble): mientras una lista con min == 1 no haya salido en el cuarto va primero (si hay
     alguna, se elige sólo entre ellas, pc 772–812), y una lista que ya salió `max` veces no compite (pc 815–835).
     Afuera de un cuarto no hay ni prioridad ni tope: compiten todas.
     El sorteo (getDistribInHashMap pc 115–180) NO es proporcional al peso: arma un java.util.HashMap nuevo con las
     listas en el orden del procList (KahluaTableImpl usa LinkedHashMap: el procList se recorre en orden), saca
     r = Rand.Next(total) ∈ [0, total − 1] y devuelve la primera lista, en el orden de recorrido del HashMap, cuyo
     acumulado es ≥ r. La primera gana 1 de peso (w + 1 casos), la última pierde 1 (w − 1) y, con dos listas de peso
     1, la segunda no sale nunca (restaurantdining.fridge nunca trae FridgeSnacks). Ver `java_hashmap_order`.
  3. Tirar una tabla (rollItemInternal, doRollItemInternal pc 256–1832): primero su `junk` (como junk), después sus
     `items`; max(1, (int)(rolls × RollsMultiplier)) tiradas, y en cada una cada entrada ("Nombre", peso) sale por su
     cuenta si Rand.Next(10000) < chance. Con onlyOne, la tabla deja de tirar apenas sale algo (pc 1812–1819). Un
     nombre que no existe y termina en "Empty" se busca sin el "Empty" (pc 333–397). Al cargar
     (ExtractContainersFromLua pc 547–793) el juego arma los pares de a dos, saltea el que no es (texto, número) y
     descarta los nombres que no existen: ésos no ocupan lugar en la tirada.
  4. La chance de una entrada (getActualSpawnChance pc 0–96, getBaseChanceMultiplier pc 3–11), en float de 32 bits:
         chance = (peso × J × 100 × M + D) × L       J = 1,4 en la junk; M = multiplicador de botín de la categoría;
                                                     D = densidad de zombis (0 en la junk); L = botín que baja con los días
     y sale si (float) Rand.Next(10000) < chance (doRollItemInternal pc 400–419): como el sorteo es un entero de 0 a
     9.999, la probabilidad por tirada es ⌈chance⌉ / 10.000 (no chance / 10.000: con peso 0,001 el juego da 1 en
     10.000, no 1 en 100.000).

El sitio muestra el botín en "Normal" (REF: todos los multiplicadores en 1, sin efecto de la población de zombis, día
1): con peso w fuera de la junk, ⌈w × 100⌉ / 10.000 por tirada.

    P(≥ 1 en una tabla) = 1 − Π_entradas (1 − p)^tiradas          (junk e items juntos)
    P(≥ 1 en un mueble procedural) = Σ_listas libres (casos de r que la eligen / Σ pesos) × P(≥ 1 | esa lista)

Lo que no se modela (y por qué):
  - Que el mueble se llene: si no entra, el juego deja de tirar; depende de lo que ya salió.
  - Las listas min == 1 y los max se miran como en el primer mueble procedural del cuarto, cuando todavía no salió
    ninguna lista: lo que sale después depende de lo que ya salió en el cuarto (y en qué orden se abrió cada mueble).

La instalación se busca en la ruta de Steam de siempre; otra se indica con PZ_DIR (como extract.py y map.py).
"""
import argparse, datetime, glob, hashlib, json, math, os, re, struct, sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
import luatable  # noqa: E402
import loot_names  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PZ_DIR = os.environ.get("PZ_DIR") or r"C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid"
DATA = os.path.join(ROOT, "games", "zomboid", "data")

# El botín "Normal": la referencia de todas las cifras del sitio (ver "Decisión: qué número muestra el sitio" en el
# plan). Con otra configuración el número absoluto cambia, pero el orden entre lugares para un mismo objeto no (M es el
# mismo en todos los muebles: depende de la categoría del objeto, no del lugar).
REF = {"lootModifier": 1.0, "rollsMultiplier": 1.0, "zombiePopLootEffect": 0, "day": 1}
JUNK_MULT = 1.4  # getBaseChanceMultiplier pc 7: ldc 1.4f

# Los muebles que nunca caen en la `other` del cuarto: ItemPickerJava.initNoGenericLootContainers, un
# Set.add(ContainerType.X) por mueble; el nombre de cada X sale de ContainerType.<clinit> (registerBase("…")).
# test_no_generic_igual_al_bytecode lo compara con el .jar: si un parche agrega uno, falla.
NO_GENERIC = frozenset({
    "barbecue", "barbecuepropane", "bin", "brazier", "campfire", "cashregister", "clothingdryer",
    "clothingdryerbasic", "clothingrack", "clothingwasher", "coffeemaker", "coffin", "composter", "dishwasher",
    "doghouse", "dumpster", "fireplace", "freezer", "fridge", "icecream", "logs", "Mannequin", "medicine",
    "microwave", "newspaper_dispatch", "newspaper_herald", "newspaper_knews", "newspaper_times", "plankstash",
    "postbox", "shelter", "stonefurnace", "stove", "SurvivorCrate", "tent", "toaster", "trough", "vendingGt",
    "vendingpop", "vendingsnack", "woodstove",
})

# Las 4 listas que ProceduralDistributions.lua define con el nombre de otra como si fuera una variable
# (`Bakery = BakeryMisc`): en Lua quedan nil, así que no existen. Ningún procList las nombra en la 42.21.
KNOWN_MISSING_LISTS = frozenset({"Bakery", "WardrobeManClassy", "WardrobeWoman", "WardrobeWomanClassy"})

# Las listas que algún procList de Distributions.lua nombra y que ProceduralDistributions.lua no define (42.21): el
# mueble que las elige queda vacío (rollProceduralItemInternal pc 912–917), pero ocupan su parte del peso.
KNOWN_DANGLING_LISTS = frozenset({
    "CrateLeather_Large", "GlassWorkshopLiterature", "MedievalCounter", "MedievalDisplayAlchemy",
    "MedievalDisplayBible", "MedievalDisplayCooking", "MedievalDisplayTools", "MedievalDisplayWeapons",
    "MedievalDisplayWeaponsJapan", "PioneerBooks", "PioneerCounter", "PioneerDisplayClothing", "PioneerDisplayTools",
    "PioneerDisplayWeapons", "TeacherDesk",
})

# Los demás campos que el juego deja en nil por apuntar a un nombre que no existe (archivo, clave, nombre), 42.21:
# un bolso sin tabla y tres partes de vehículo sin tabla (traen nada, igual que en el juego).
KNOWN_NIL_FIELDS = frozenset({
    ("Distributions.lua", "Hatbox", "Hatbox"),
    ("VehicleDistributions.lua", "SeatFrontRight", "VehicleDistributions.SeatFront"),
    ("VehicleDistributions.lua", "SeatFrontRight", "VehicleDistributions.Van_CraftSuppliesFront"),
    ("VehicleDistributions.lua", "Normal", "VehicleDistributions.StepVan_ImportedBeer"),
})

# Las listas forzadas y su marca en container_chances: zona (con su nombre), baldosa, cuarto u objeto del mueble.
FORCE = {"forceForTiles": "t", "forceForRooms": "r", "forceForZones": "z", "forceForItems": "i"}

# Mínimos para no publicar algo roto si un parche cambia la forma de los archivos.
MIN_ROOMS, MIN_LISTS, MIN_VEHICLE_GROUPS, MIN_OUTFITS = 300, 1000, 50, 100


# ---------------------------------------------------------------------------
# La cuenta
# ---------------------------------------------------------------------------

def game_id(name):
    """El id del juego de un nombre de las tablas: "Pen" → "Base.Pen"; "Radio.X" queda igual."""
    return name if "." in name else "Base." + name


def resolve_item(name, known):
    """
    El id que sale de una entrada, o None si no sale nada. Con `known` (los ids que existen), un nombre que no existe y
    termina en "Empty" se busca sin el "Empty", como el juego (doRollItemInternal pc 333–397: "PopEmpty" da la lata
    vacía "Pop"). Con known=None todo id existe.
    """
    gid = game_id(name)
    if known is None or gid in known:
        return gid
    if gid.endswith("Empty") and gid[:-5] in known:
        return gid[:-5]
    return None


def _f32(x):
    """x redondeado a float de 32 bits: el juego hace la cuenta de la chance en float."""
    return struct.unpack("<f", struct.pack("<f", x))[0]


def entry_chance(weight, junk):
    """
    P de que una entrada ("Nombre", peso) salga en una tirada, con el botín en "Normal" (REF).

    Se repite la cuenta del juego en float de 32 bits (getActualSpawnChance) y después el sorteo: sale si
    (float) Rand.Next(10000) < chance, o sea para ⌈chance⌉ de los 10.000 enteros posibles. Por eso 0,05 en la junk
    (0,05 × 1,4 × 100 = 7) da 7 / 10.000, pero un peso de 0,001 (chance 0,1) da 1 / 10.000 y no 0,1 / 10.000.
    """
    c = _f32(weight)
    if junk:
        c = _f32(c * _f32(JUNK_MULT))  # getBaseChance: chance × getBaseChanceMultiplier (1,4f en la junk)
    c = _f32(c * 100.0)
    c = _f32(c * REF["lootModifier"])  # M (en la junk vale 1 si el multiplicador es > 0: con REF es 1 igual)
    c = _f32(c + 0.0)                   # D = min(densidad, 8) × ZombiePopLootEffect: 0 en REF y en la junk
    c = _f32(c * 1.0)                   # L: el día 1 todavía no bajó nada
    if c <= 0:
        return 0.0
    return min(10000, math.ceil(c)) / 10000


def _rolls(t):
    """max(1, (int)(rolls × RollsMultiplier)) (doRollItemInternal pc 256–280); sin `rolls`, 0 → 1."""
    return max(1, int(_f32(float(t.get("rolls", 0))) * REF["rollsMultiplier"]))


def _pairs(t):
    """
    Los pares (nombre, peso) de `items` como los arma el juego al cargar (ExtractContainersFromLua pc 547–793): recorre
    la parte de lista de a dos y saltea el par si el primero no es texto o el segundo no es número. Así un número suelto
    al final (ProceduralDistributions.ClothingStorageAllJackets termina en `"Jacket_WhiteTINT", 10,7` en la 42.21) no
    corre los pares: se ignora, como en el juego.
    """
    items = t.get("items", [])
    if isinstance(items, dict):  # `items = {}` lo lee luatable como dict vacío; con claves, sólo cuenta la parte de lista
        items = items.get("__arr", [])
    if not isinstance(items, list):
        raise ValueError(f"items no es una lista: {items!r:.60}")
    return [(n, w) for n, w in zip(items[::2], items[1::2])
            if isinstance(n, str) and isinstance(w, (int, float)) and not isinstance(w, bool)]


def _entries(t, junk, known):
    """
    [(id, p por tirada)] de la lista `items`. Un nombre que no existe ni se resuelve sin "Empty" no entra: el juego lo
    descarta al cargar ("ignoring invalid ItemPicker item type", ExtractContainersFromLua pc 633–742), así que tampoco
    ocupa un lugar en la tirada (importa con onlyOne).
    """
    out = []
    for name, w in _pairs(t):
        gid = resolve_item(name, known)
        if gid is not None:
            out.append((gid, entry_chance(w, junk)))
    return out


def _miss(t, junk, known):
    """{id: P de que NO salga} tirando sólo los `items` de `t` (sin su junk)."""
    entries = _entries(t, junk, known)
    rolls = _rolls(t)
    if t.get("onlyOne"):
        # La tabla corta en el primer acierto: una entrada sale sólo si todas las anteriores fallaron, en esta tirada
        # y en las anteriores.
        got, alive = defaultdict(float), 1.0
        for _ in range(rolls):
            for gid, p in entries:
                if p > 0:
                    got[gid] += alive * p
                alive *= 1 - p
        return {g: 1 - v for g, v in got.items()}
    miss = defaultdict(lambda: 1.0)
    for gid, p in entries:
        if p > 0:
            miss[gid] *= (1 - p) ** rolls  # cada entrada tira por su cuenta: un nombre repetido son dos chances
    return dict(miss)


def table_chances(t, junk=False, known=None):
    """
    {id: P(≥ 1)} en un mueble que tira la tabla `t` (más su `junk`, que va con J = 1,4). `junk=True` es para tirar
    una tabla que ya es de junk. Las entradas con chance 0 no aparecen.
    """
    miss = defaultdict(lambda: 1.0)
    parts = [(t, junk)]
    if isinstance(t.get("junk"), dict):
        parts.insert(0, (t["junk"], True))  # el juego tira primero la junk (rollItemInternal pc 58–79)
    for table, is_junk in parts:
        for gid, q in _miss(table, is_junk, known).items():
            miss[gid] *= q
    return {gid: 1 - q for gid, q in sorted(miss.items()) if q < 1}


def _force_tag(entry):
    """
    La marca de una lista forzada ("z:Rich", "t", "r", "i"), o None si compite por peso. Como el juego
    (`ExtractProcList`, `isNullOrWhitespace`): una condición vacía o en blanco no fuerza nada.
    """
    kinds = [k for k in FORCE if k in entry and str(entry[k]).strip()]
    if not kinds:
        return None
    if len(kinds) > 1:
        # El juego no falla: prueba en orden Items → Tiles → Zones → Rooms (pc 180/423/525/667) y cualquiera que se
        # cumpla la fuerza. En la 42.21 no pasa en ninguna lista; si un parche lo trae, mejor cortar que elegir una
        # sola marca y mostrar una condición a medias.
        _die(f"la lista {entry.get('name')} trae dos condiciones de forzado ({', '.join(kinds)}): container_chances "
             f"sólo modela una")
    k = kinds[0]
    if k == "forceForZones" and ";" in str(entry[k]):
        # El juego parte forceForZones por ";" (varias zonas); en la 42.21 ninguna lista trae más de una.
        _die(f"la lista {entry.get('name')} se fuerza en varias zonas ({entry[k]}): container_chances sólo modela una")
    return "z:" + entry[k] if k == "forceForZones" else FORCE[k]


# java.util.HashMap: capacidad inicial 16 que se duplica cuando el tamaño pasa 0,75 × capacidad; un bucket con 8
# nodos está a uno de `treeifyBin` (que con capacidad < 64 hace un resize y si no lo convierte en árbol): el orden
# dejaría de ser el que se emula acá.
_HM_CAP, _HM_LOAD, _HM_BUCKET_MAX = 16, 0.75, 8


def java_string_hash(s):
    """String.hashCode() de Java (s[0]·31^(n−1) + … + s[n−1] sobre unidades UTF-16, int de 32 bits con desborde)."""
    b = s.encode("utf-16-le")
    h = 0
    for (u,) in struct.iter_unpack("<H", b):
        h = (31 * h + u) & 0xFFFFFFFF
    return h - (1 << 32) if h & 0x80000000 else h


def java_hashmap_order(keys):
    """
    El orden en que `new HashMap<String, …>()` con esos `put` (en ese orden) recorre su keySet(). Un nombre repetido
    conserva su primer lugar (put sobre una clave que ya está sólo cambia el valor).

    Cómo lo hace Java (HashMap desde Java 8; el juego trae Zulu 25): bucket = (h ^ (h >>> 16)) & (capacidad − 1) con
    h = String.hashCode(); los nodos de un bucket quedan en orden de inserción, y el resize (al pasar 0,75 ×
    capacidad) parte cada bucket en dos conservando ese orden. O sea: el orden final es (bucket con la capacidad
    final, orden de inserción). Se simula inserción por inserción para cortar si algún bucket llega a 8 nodos.
    """
    order = list(dict.fromkeys(keys))
    spread = []
    cap = _HM_CAP
    for i, k in enumerate(order):
        h = java_string_hash(k) & 0xFFFFFFFF
        spread.append(h ^ (h >> 16))
        idx = spread[i] & (cap - 1)
        if sum(1 for s in spread if s & (cap - 1) == idx) >= _HM_BUCKET_MAX:
            _die(f"un HashMap de listas procedurales junta {_HM_BUCKET_MAX} nombres en un bucket ({order[:i + 1]}): "
                 f"Java lo convertiría en árbol y el orden de sorteo ya no sería el que emula loot.py")
        if i + 1 > int(cap * _HM_LOAD):
            cap *= 2
    return [k for _, _, k in sorted((s & (cap - 1), i, k) for i, (s, k) in enumerate(zip(spread, order)))]


def pick_chances(pool):
    """
    {nombre: P de que getDistribInHashMap la elija}, con `pool` = {nombre: peso} en el orden de los `put`.

    r = Rand.Next(total) es un entero de 0 a total − 1 y gana la primera lista (en el orden del HashMap) con
    acumulado ≥ r: la primera se queda con r ∈ [0, w₁] (w₁ + 1 casos), cada una de las del medio con wᵢ y la última
    con wₙ − 1. Una lista puede quedar con 0 casos (dos listas de peso 1: la segunda nunca sale).
    """
    total = sum(pool.values())
    out, prev, acc = {}, -1, 0
    for name in java_hashmap_order(list(pool)):
        acc += pool[name]
        out[name] = max(0, min(acc, total - 1) - prev) / total
        prev = acc
    return out


def _proc_maps(c, in_room):
    """
    Los dos HashMap de rollProceduralItemInternal (pc 48–64) como quedan en el primer mueble procedural del cuarto,
    llenados en el orden del procList como el juego: el 8 (prioridad: min == 1 y todavía no salió en el cuarto, pc
    772–812) y el 9 (los demás, si no llegaron a su max en el cuarto, pc 815–850; afuera de un cuarto, todos). Un dict
    de Python hace lo mismo que put: un nombre repetido conserva su lugar y se queda con el último peso. Devuelve
    (mapa 8, mapa 9, [(lista forzada, marca)]).
    """
    first, rest, forced = {}, {}, []
    for e in c.get("procList", []):
        tag = _force_tag(e)
        if tag is not None:
            forced.append((e["name"], tag))
            continue
        w = int(e.get("weightChance", 0))
        w = w if w > 0 else 1
        if in_room and int(e.get("min", 0)) == 1:
            first[e["name"]] = w
        elif not in_room or int(e.get("max", 0)) > 0:  # en el primer mueble nada salió todavía: 0 < max
            rest[e["name"]] = w
    return first, rest, forced


def container_chances(c, procedural, known=None, in_room=True):
    """
    [(id, P, fuerza)] para un mueble que tira `c` (la tabla que da `Loot.table_for`). `in_room` tiene que ser False
    para lo que está fuera de un cuarto (`Loot.chances` lo pone solo); en un cuarto sin tabla propia sigue siendo True.

    Si `c` no es procedural, es la tabla misma (fuerza None). Si es procedural:
      - fuerza None: lo que sale al elegir entre las listas que compiten, con el sorteo del juego (`pick_chances`).
        Adentro de un cuarto (`in_room`), como en el primer mueble procedural del cuarto: mientras ninguna lista salió,
        las de min == 1 van primero (si hay alguna, se elige sólo entre ellas) y no compiten las de max ≤ 0. Afuera
        de un cuarto no hay ni prioridad ni tope. Una lista que no existe ocupa su parte del peso y no trae nada, como
        en el juego (rollProceduralItemInternal pc 912–917). Una lista que el sorteo nunca elige no suma nada.
      - fuerza "z:<zona>", "t", "r" o "i": lo de una lista forzada (por zona, baldosa, cuarto u objeto), con P dada esa
        lista: cuándo se cumple la condición depende del lugar exacto, no de la tabla.
    El orden es fijo: primero lo que compite (por id), después cada lista forzada en el orden de procList.
    """
    if not c:
        return []
    if not c.get("procedural"):
        return [(gid, p, None) for gid, p in table_chances(c, known=known).items()]
    first, rest, forced = _proc_maps(c, in_room)
    acc = defaultdict(float)
    for name, share in pick_chances(first or rest).items():
        t = procedural.get(name)
        if t is None or share == 0:
            continue
        for gid, p in table_chances(t, known=known).items():
            acc[gid] += share * p
    out = [(gid, acc[gid], None) for gid in sorted(acc)]
    for name, tag in forced:
        t = procedural.get(name)
        if t is not None:
            out += [(gid, p, tag) for gid, p in table_chances(t, known=known).items()]
    return out


# ---------------------------------------------------------------------------
# Las tablas del juego
# ---------------------------------------------------------------------------

ALIAS_RE = re.compile(r"^\s*SuburbsDistributions\.(\w+)\s*=\s*SuburbsDistributions\.(\w+)", re.M)


def _die(msg):
    raise SystemExit(f"loot.py: {msg}")


def _read(path):
    if not os.path.isfile(path):
        _die(f"falta {path} (¿está instalado el juego? se indica otra carpeta con PZ_DIR)")
    with open(path, encoding="utf-8") as f:
        return f.read()


def _run(path, env, nils):
    try:
        return luatable.run_lua(_read(path), env, os.path.basename(path), nils)
    except luatable.LuaError as e:
        _die(f"no entiendo un .lua del juego: {e}")


def _is_table(v):
    """Una tabla de botín (algo que se tira), y no un cuarto o un grupo de tablas."""
    return isinstance(v, dict) and ("rolls" in v or "items" in v or "procedural" in v)


def _merge_body(src):
    """El cuerpo de `local function mergeDistributions()`, hasta el primer `end` en la columna 0."""
    m = re.search(r"function\s+mergeDistributions\s*\(\s*\)(.*?)^end\b", src, re.S | re.M)
    if not m:
        _die("SuburbsDistributions.lua ya no tiene mergeDistributions: cambió la forma de los alias")
    return m.group(1)


class Loot:
    """
    Las tablas de botín del juego, ya armadas:

      rooms        cuarto → {mueble → tabla}, con los alias aplicados, sin `all`, sin escondites y sin las 5 tablas de
                   "historia" (las que traen `roomTypes`)
      stashes      los escondites y refugios (las claves de primer nivel que empiezan con mayúscula)
      general      `all` sin los zombis: el mueble fuera de un cuarto o en un cuarto sin tabla
      zombie       {"m": all.inventorymale, "f": all.inventoryfemale}
      outfits      atuendo de zombi (sin "Outfit_") → tabla
      bags         lo que trae un bolso o una caja al encontrarlo (claves de primer nivel que son una tabla)
      vehicles     grupo de vehículo → parte (GloveBox, TruckBed…) → tabla
      procedural   las listas de ProceduralDistributions.list
      aliases      cuarto → cuarto del que copia la tabla, en el orden de mergeDistributions
      missing_lists  las listas de ProceduralDistributions.list que quedan nil (`Bakery = BakeryMisc`)
      dangling_lists las listas que nombra algún procList y no existen (el mueble que las elige queda vacío)
      no_fill_rooms  NoContainerFillRooms (los bolsos que salen ahí de un mueble común vienen vacíos; ver fills_bags)
      dist         distributionTable con los alias aplicados, completo (para el inventario)
    """

    def __init__(self, game_dir=PZ_DIR, known=None):
        self.known = known
        server = os.path.join(game_dir, "media", "lua", "server")
        items_dir, veh_dir = os.path.join(server, "Items"), os.path.join(server, "Vehicles")
        # Un campo que queda nil por apuntar a un nombre que no existe es casi siempre un error del juego (y se
        # reproduce igual), pero también es lo primero que se vería si el lector leyera mal: se anotan todos y uno
        # nuevo corta.
        env, nils = {}, []
        junk_files = sorted(glob.glob(os.path.join(items_dir, "Distribution_*.lua")))
        if not junk_files:
            _die(f"no hay Distribution_*.lua en {items_dir}")
        for path in junk_files:
            _run(path, env, nils)
        dist = _run(os.path.join(items_dir, "Distributions.lua"), env, nils).get("distributionTable")
        _run(os.path.join(items_dir, "ProceduralDistributions.lua"), env, nils)
        for path in sorted(glob.glob(os.path.join(veh_dir, "VehicleDistribution_*.lua"))):
            _run(path, env, nils)
        _run(os.path.join(veh_dir, "VehicleDistributions.lua"), env, nils)
        suburbs_path = os.path.join(items_dir, "SuburbsDistributions.lua")
        _run(suburbs_path, env, nils)
        if not isinstance(dist, dict):
            _die("Distributions.lua ya no define el local distributionTable")
        self.raw_keys = len(dist)

        # Los alias, en el orden del archivo: dist[X] = dist[Y]; si Y no existe, X queda sin tabla (nil en Lua).
        self.aliases = {}
        for x, y in ALIAS_RE.findall(_merge_body(_read(suburbs_path))):
            self.aliases[x] = y
            if y in dist:
                dist[x] = dist[y]
            else:
                dist.pop(x, None)
        if not self.aliases:
            _die("mergeDistributions no tiene alias: cambió la forma del archivo")
        self.dist = dist
        self.no_fill_rooms = sorted(env.get("NoContainerFillRooms") or {})

        self.rooms, self.stashes, self.bags, self.story = {}, {}, {}, {}
        for key, v in dist.items():
            if key == "all":
                continue
            if not isinstance(v, dict):
                _die(f"distributionTable.{key} no es una tabla")
            if "rolls" in v or "items" in v:
                self.bags[key] = v
            elif "roomTypes" in v:
                self.story[key] = v
            elif key[:1].isupper():
                self.stashes[key] = v
            else:
                self.rooms[key] = v
        for key, v in self.rooms.items():
            if "all" in v and len(v) > 1:
                # El juego tiraría `all` además del mueble (fillContainerTypeInternal pc 50–87); table_for devuelve una
                # sola tabla, así que mejor cortar que mostrar la mitad.
                _die(f"el cuarto {key} trae `all` y otros muebles: table_for no lo modela")

        al = dist.get("all")
        if not isinstance(al, dict):
            _die("distributionTable ya no tiene `all`")
        self.general = {k: v for k, v in al.items() if not k.startswith(("Outfit_", "inventory"))}
        self.zombie = {"m": al.get("inventorymale"), "f": al.get("inventoryfemale")}
        if not all(_is_table(t) for t in self.zombie.values()):
            _die("all.inventorymale / all.inventoryfemale ya no son tablas")
        self.outfits = {k[len("Outfit_"):]: v for k, v in al.items() if k.startswith("Outfit_")}

        self.procedural = (env.get("ProceduralDistributions") or {}).get("list") or {}

        self.vehicles, self.vehicle_tables = {}, {}
        for key, v in (env.get("VehicleDistributions") or {}).items():
            if _is_table(v):
                self.vehicle_tables[key] = v
            elif isinstance(v, dict) and any(_is_table(t) for t in v.values()) and \
                    all(_is_table(t) or not isinstance(t, (dict, list)) for t in v.values()):
                # Un grupo: parte → tabla. Algunos traen además un dato suelto (`specificId = "Survivalist"`), que no
                # es una parte.
                self.vehicles[key] = {part: t for part, t in v.items() if _is_table(t)}
            else:
                _die(f"VehicleDistributions.{key} no es ni una tabla ni un grupo de partes")

        names = set()
        for room in list(self.rooms.values()) + list(self.stashes.values()) + [al] + list(self.bags.values()):
            for c in (room.values() if not _is_table(room) else [room]):
                if isinstance(c, dict) and c.get("procedural"):
                    names.update(e["name"] for e in c.get("procList", []))
        self.dangling_lists = sorted(n for n in names if n not in self.procedural)
        self.missing_lists = sorted(k for f, _, k, _ in nils if f == "ProceduralDistributions.lua")
        self.nil_fields = sorted({(f, k, n) for f, _, k, n in nils if f != "ProceduralDistributions.lua"}, key=str)
        new = ([n for n in self.missing_lists if n not in KNOWN_MISSING_LISTS]
               + [n for n in self.dangling_lists if n not in KNOWN_DANGLING_LISTS]
               + [f"{f}: {k} = {n}" for f, k, n in self.nil_fields if (f, k, n) not in KNOWN_NIL_FIELDS])
        if new:
            _die(f"tablas que apuntan a algo que no existe (nuevas desde la 42.21; revisar si el lector leyó bien): {new}")
        if self.missing_lists or self.dangling_lists:
            print(f"loot.py: aviso: listas que no existen (sus muebles quedan vacíos, como en el juego): "
                  f"{', '.join(self.missing_lists + self.dangling_lists)}", file=sys.stderr)

        for what, n, lo in (("cuartos", len(self.rooms), MIN_ROOMS), ("listas procedurales", len(self.procedural), MIN_LISTS),
                            ("grupos de vehículo", len(self.vehicles), MIN_VEHICLE_GROUPS),
                            ("atuendos de zombi", len(self.outfits), MIN_OUTFITS)):
            if n < lo:
                _die(f"sólo {n} {what} (se esperaban al menos {lo}): cambió la forma de los archivos")

    def table_for(self, room, container):
        """
        La tabla que tira un mueble `container` en el cuarto `room` (None = fuera de un cuarto), o None si no tira
        ninguna. Es la regla de fillContainerInternal pc 446–718 y fillContainerTypeInternal pc 119–190:
          1. si el cuarto (nombre exacto) tiene tabla: la del mueble; si no, `other` (salvo un mueble de NO_GENERIC);
             si no, la `all` del cuarto;
          2. si no salió ninguna (o no hay cuarto, o el cuarto no tiene tabla): `all.<mueble>`, y si no existe,
             `all.other` (salvo un mueble de NO_GENERIC).
        """
        r = self.rooms.get(room) if room is not None else None
        if r is not None:
            c = r.get(container)
            if c is None and container not in NO_GENERIC:
                c = r.get("other")
            if c is None:
                c = r.get("all")
            if c is not None:
                return c
        c = self.general.get(container)
        if c is None and container not in NO_GENERIC:
            c = self.general.get("other")
        return c

    def fills_bags(self, room, container):
        """
        Si un bolso o caja que sale en ese mueble viene lleno (tira su propia tabla) o vacío. En los NoContainerFillRooms
        (tiendas) fillContainerTypeInternal pc 0–14 apaga el llenado, pero sólo llega a las tablas comunes
        (rollItemInternal pc 75/89 → doRollItemInternal pc 1258–1293): un mueble procedural tira su lista con `true`
        fijo (rollProceduralItemInternal pc 936/950), así que ahí los bolsos se llenan igual. El nombre que se mira es
        siempre el del cuarto, también cuando se tira la `all` del propio cuarto: el "all" que guarda
        fillContainerInternal pc 637–640 no llega al llenado (pc 753–763 llama a fillContainerTypeInternal con
        room.getName(), y ésa tira la `all` del cuarto en pc 50–87 con el mismo flag).
        """
        if room is None or room not in self.no_fill_rooms:
            return True
        c = self.table_for(room, container)
        return bool(c and c.get("procedural"))

    def chances(self, room, container, known=None):
        """
        container_chances del mueble `container` en el cuarto `room` (None = fuera de un cuarto), con la tabla de
        `table_for` y el `in_room` que corresponde: el juego mira si el mueble está en un cuarto, tenga tabla o no
        (rollProceduralItemInternal pc 8–23), así que sólo `room=None` sortea sin prioridad ni tope. Así nadie tiene
        que acordarse de pasarlo a mano. `known` por defecto es el del Loot.
        """
        return container_chances(self.table_for(room, container), self.procedural,
                                 self.known if known is None else known, in_room=room is not None)


# ---------------------------------------------------------------------------
# --check: el inventario
# ---------------------------------------------------------------------------

def never_chosen(pairs):
    """[(cuarto, mueble, lista)] de las listas que compiten en el primer mueble del cuarto y que getDistribInHashMap
    nunca elige (0 casos de r): sus objetos no salen ahí aunque la lista esté en el procList.

    `inventory` la llama sólo con los cuartos propios (las 13 de la 42.21). Afuera de ellos hay al menos un caso más,
    `all.clothingrack` → ClothingStoresShirtsFormal (afuera o en un cuarto sin tabla): container_chances ya lo trata
    bien (no suma), sólo que no entra en esa cifra."""
    out = []
    for r, c, t in pairs:
        if not t.get("procedural"):
            continue
        first, rest, _ = _proc_maps(t, in_room=True)
        out += [(r, c, n) for n, share in pick_chances(first or rest).items() if share == 0]
    return out


def _known_ids():
    """Los ids de data/items.json (lo escribe extract.py), o None si todavía no está."""
    path = os.path.join(DATA, "items.json")
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return {it["id"] for it in json.load(f)["items"]}


def _names(t, out):
    """Junta los nombres de objeto de una tabla (y su junk)."""
    for table in (t, t.get("junk")):
        if isinstance(table, dict):
            out.update(n for n, _ in _pairs(table))


def _pairs_of(groups):
    """[(cuarto, mueble, tabla)] de los grupos dados (cuarto → mueble → tabla)."""
    return [(r, c, t) for r, rt in groups for c, t in rt.items() if _is_table(t)]


def inventory(L, known):
    """
    Las cifras del inventario (las de --check y las de data/loot/meta.json), con las mismas definiciones que la tabla
    "Lo que hay en el juego" del plan donde se pudo (las cifras del prototipo que no coinciden están explicadas en el
    informe de la Task 1). Devuelve (cifras, detalle): las cifras son números; el detalle, las listas que se imprimen.
    """
    raw_rooms = {k: v for k, v in L.rooms.items() if k not in L.aliases}
    groups = list(raw_rooms.items()) + [("all", L.dist["all"])] + list(L.stashes.items()) + list(L.story.items())
    allp = _pairs_of(groups)
    roomp = _pairs_of(L.rooms.items())
    force, zones = Counter(), Counter()
    for *_, t in _pairs_of(list(raw_rooms.items()) + [("all", L.dist["all"])] + list(L.stashes.items())):
        for e in t.get("procList") or []:
            for k in FORCE:
                if k in e and str(e[k]).strip():  # la misma regla que _force_tag
                    force[k] += 1
                    if k == "forceForZones":
                        zones[e[k]] += 1
    tables = list(L.procedural.values()) + list(L.bags.values()) + list(L.vehicle_tables.values())
    tables += [t for g in L.vehicles.values() for t in g.values()] + [t for *_, t in allp]

    def names(pairs):
        out = set()
        for _, _, t in pairs:
            _names(t, out)
            for e in t.get("procList") or []:
                if e["name"] in L.procedural:
                    _names(L.procedural[e["name"]], out)
        return out
    every = set()
    for t in tables:
        _names(t, every)
    in_rooms = names(_pairs_of(raw_rooms.items()))
    never = never_chosen(_pairs_of(raw_rooms.items()))
    counts = {
        "topKeys": L.raw_keys, "rooms": len(raw_rooms), "roomsWithAliases": len(L.rooms), "stashes": len(L.stashes),
        "story": len(L.story), "bags": len(L.bags), "pairs": len(allp),
        "proceduralPairs": sum(1 for *_, t in allp if t.get("procedural")), "roomPairs": len(roomp),
        "containerTypes": len({c for _, c, _ in allp if not c.startswith(("Outfit_", "inventory"))}),
        "lists": len(L.procedural), "missingLists": len(L.missing_lists), "danglingLists": len(L.dangling_lists),
        "aliases": len(L.aliases), "noFillRooms": len(L.no_fill_rooms),
        "zombieItems": {"m": len(_pairs(L.zombie["m"])), "f": len(_pairs(L.zombie["f"]))},
        "outfits": len(L.outfits), "vehicleGroups": len(L.vehicles), "vehicleTables": len(L.vehicle_tables),
        "forced": dict(force), "zones": dict(zones.most_common()),
        "onlyOne": sum(1 for t in tables if t.get("onlyOne")),
        "oddPairs": sum(1 for t in tables if isinstance(t.get("items"), list) and len(t["items"]) != 2 * len(_pairs(t))),
        "itemNames": len(every), "itemNamesInRooms": len(in_rooms),
        "combos": sum(1 for *_, t in roomp for _, pr, f in container_chances(t, L.procedural, known) if f is None and pr > 0),
        "neverChosen": len(never),
    }
    detail = {
        "story": sorted(L.story), "never": never,
        "parts": sorted({x for g in L.vehicles.values() for x in g}),
        "unknownInRooms": sorted(n for n in in_rooms if known is not None and resolve_item(n, known) is None),
        "unknown": sorted(n for n in every if known is not None and resolve_item(n, known) is None),
    }
    return counts, detail


def check():
    """Imprime el inventario de las tablas (ver `inventory`)."""
    L = Loot()
    known = _known_ids()
    c, d = inventory(L, known)
    p = print
    p(f"distributionTable: {c['topKeys']} claves de primer nivel (Hatbox = Hatbox queda nil)")
    p(f"  cuartos: {c['rooms']} propios, {c['roomsWithAliases']} con los alias | escondites: {c['stashes']} | all: 1 | "
      f"historia (afuera): {c['story']} ({', '.join(d['story'])}) | bolsos y cajas: {c['bags']}")
    p(f"  pares lugar × mueble (cuartos propios, all, escondites, historia): {c['pairs']} ({c['proceduralPairs']} "
      f"procedurales, {c['pairs'] - c['proceduralPairs']} comunes); sólo cuartos con alias: {c['roomPairs']}")
    p(f"  tipos de mueble (sin Outfit_* ni inventory*): {c['containerTypes']}")
    p(f"ProceduralDistributions.list: {c['lists']} listas (+ {c['missingLists']} en nil: {', '.join(L.missing_lists)})")
    p(f"  nombradas en un procList y que no existen: {c['danglingLists']} ({', '.join(L.dangling_lists)})")
    p(f"  otros campos en nil: {'; '.join(f'{f}: {k} = {n}' for f, k, n in L.nil_fields)}")
    p(f"alias: {c['aliases']} | NoContainerFillRooms: {c['noFillRooms']}")
    for s, k in (("hombre", "m"), ("mujer", "f")):
        p(f"zombi ({s}): {_rolls(L.zombie[k])} tirada(s), {c['zombieItems'][k]} objetos")
    p(f"atuendos de zombi: {c['outfits']}")
    p(f"VehicleDistributions: {c['vehicleGroups'] + c['vehicleTables']} claves: {c['vehicleGroups']} grupos y "
      f"{c['vehicleTables']} tablas; partes: {', '.join(d['parts'])}")
    p(f"listas forzadas: {', '.join(f'{k} {n}' for k, n in c['forced'].items())} | zonas: "
      f"{', '.join(f'{k} {n}' for k, n in c['zones'].items())}")
    p(f"tablas con onlyOne: {c['onlyOne']} | listas con pares raros (se ignoran como en el juego): {c['oddPairs']}")
    p(f"nombres de objeto distintos: {c['itemNames']} | en cuartos (con sus listas): {c['itemNamesInRooms']}")
    if known is not None:
        miss = d["unknownInRooms"]
        p(f"  existen en data/items.json: {c['itemNamesInRooms'] - len(miss)}; no: {len(miss)} ({', '.join(miss)})")
    else:
        p("  (sin data/items.json: no se cuenta cuáles existen)")
    p(f"combinaciones (objeto, cuarto, mueble) con chance > 0, sin listas forzadas, cuartos con alias: {c['combos']}")
    p(f"listas que el sorteo del juego nunca elige (cuartos propios): {c['neverChosen']} "
      f"({', '.join(f'{r}.{cc}: {n}' for r, cc, n in d['never'])})")


# ---------------------------------------------------------------------------
# Los archivos del sitio (data/loot)
# ---------------------------------------------------------------------------

LOOT_OUT = os.path.join(DATA, "loot")
# 32 archivos de habitaciones y no 100: son ~380 habitaciones del mapa con tabla (no 3.826 fichas), y con 32 cada
# archivo junta ~12. Es `PZ_LOOT_ROOM_SHARDS` de site/src/zomboid/shard.ts: si cambia uno, cambia el otro.
ROOM_SHARDS = 32
# Cuántas filas viajan por objeto y por habitación. La ficha muestra unas pocas y cuenta el resto ("y 12 lugares más"):
# con todas, un objeto común (el tazón sale en cientos de habitaciones) pesaría más que su ficha entera.
TOP_ROOMS, TOP_STASH, TOP_OUTFITS, TOP_VEHICLES, TOP_BAGS, TOP_ROOM_ITEMS = 10, 5, 8, 5, 5, 30
DIGITS = 5          # 0,00001 = 0,001 %: el sitio escribe "< 0,1 %" debajo de 0,1 %, así que más decimales no se ven
HOME = "Muldraugh"  # donde arranca la mayoría de las partidas: el edificio de ejemplo de cada tabla es el más cercano


def site_module():
    """site.py cargado por su ruta: `import site` daría el módulo de la biblioteca estándar (ver extract.py)."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("zomboid_site", os.path.join(os.path.dirname(__file__), "site.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _need(rel, script):
    path = os.path.join(DATA, *rel.split("/"))
    if not os.path.isfile(path):
        _die(f"falta games/zomboid/data/{rel}: primero hay que correr python games/zomboid/tools/{script} "
             f"(el orden es extract.py → map.py → loot.py)")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _wins(p, force, cur_p, cur_force):
    """¿(p, force) le gana a la fila que ya estaba? Una fila sin fuerza le gana a una forzada (sale siempre que esté el
    mueble, no sólo si se cumple la condición); entre iguales, la mayor p. Un empate deja la primera."""
    return (force is None, p) > (cur_force is None, cur_p)


def _row(key, cont, p, force):
    return [key, cont, p] + ([force] if force else [])


def _by_p(rows, p=2, key=0):
    """Ordenadas por p (de mayor a menor) y después por clave: el orden de todas las listas del sitio."""
    return sorted(rows, key=lambda r: (-r[p], r[key] if isinstance(r[key], str) else r[key]["id"]))


class _Site:
    """Arma data/loot/** (ver `build`)."""

    def __init__(self, L):
        self.L = L
        items = _need("items.json", "extract.py")
        index = _need("index.json", "extract.py")
        self.meta_game = _need("meta.json", "extract.py")
        self.buildings = _need("map/buildings.json", "map.py")
        self.places = _need("map/web/common.json", "map.py").get("places") or []
        self.known = {it["id"] for it in items["items"]}
        self.icon = {it["id"]: it.get("icon") for it in items["items"]}
        self.entry, self.slug_of = {}, {}
        for e in index:
            if e["sec"] == "items":
                self.entry[e["id"]] = e
                for gid in e["ref"]:
                    self.slug_of[gid] = e["id"]
        self.no_ficha = set()   # ids que salen y no tienen ficha (extract.py deja afuera los de prueba)
        self._plain_cache = {}
        self._canon = {}
        for k, v in L.rooms.items():
            if k not in L.aliases:
                self._canon.setdefault(id(v), k)
        for k, v in L.rooms.items():
            self._canon.setdefault(id(v), k)   # un alias cuyo dueño ya no existe se nombra a sí mismo

    def slug(self, gid):
        s = self.slug_of.get(gid)
        if s is None:
            self.no_ficha.add(gid)
        return s

    def canon(self, room):
        """La clave de la tabla de un cuarto: la del cuarto dueño (`mechanic` para `garage`), no la del alias."""
        return self._canon[id(self.L.rooms[room])]

    def map_rooms(self):
        """
        {tabla: [(id del edificio, centro x, centro y), …]} de cada habitación del mapa (cada piso) que tira esa tabla:
        la habitación se llama como la tabla o como uno de sus alias, o sea ({t} ∩ cuartos del mapa) ∪ alias[t].

        Una tabla que no queda acá (`Hoarderkitchen`, `hunterstorage`…) nunca llena nada en Knox County: el juego busca
        la tabla por el nombre del cuarto, y ningún cuarto del mapa se llama así. Por eso no va en "Dónde aparece"
        (sería mandar a buscar un lugar que no existe), con la misma regla que el Mapa usó para las historias que el
        juego nunca pone.
        """
        names = self.buildings["rooms"]
        out = defaultdict(list)
        for b in self.buildings["buildings"]:
            x1, y1, x2, y2 = b["box"]
            center = (b["id"], (x1 + x2) / 2, (y1 + y2) / 2)
            for floor in b["floors"].values():
                for room in floor:
                    raw = names[room[0]]
                    if raw in self.L.rooms:
                        out[self.canon(raw)].append(center)
        return out

    def by_slug(self, rows):
        """{slug: (p, fuerza)} de las filas [(id, P, fuerza)] de un mueble: las variantes de una ficha (`bowl` son dos
        ids del juego) se juntan en la mejor. p ya redondeada; lo que redondea a 0 no va."""
        out = {}
        for gid, p, force in rows:
            p = round(p, DIGITS)
            if p <= 0:
                continue
            s = self.slug(gid)
            if s is None:
                continue
            cur = out.get(s)
            if cur is None or _wins(p, force, *cur):
                out[s] = (p, force)
        return out

    def place(self, conts):
        """{slug: (mueble, p, fuerza)} de un lugar con [(mueble, filas)]: por ficha, su mejor mueble."""
        best = {}
        for cont, rows in conts:
            for s, (p, force) in self.by_slug(rows).items():
                cur = best.get(s)
                if cur is None or _wins(p, force, cur[1], cur[2]):
                    best[s] = (cont, p, force)
        return best

    def plain(self, t):
        """{slug: p} de una tabla que no depende del cuarto (zombi, vehículo, bolso). Ninguna es procedural en la 42.21;
        si un parche cambia eso, se sortea como afuera de un cuarto y sin las listas forzadas."""
        key = id(t)
        if key not in self._plain_cache:
            rows = [(g, p, f) for g, p, f in container_chances(t, self.L.procedural, self.known, in_room=False) if f is None]
            self._plain_cache[key] = {s: p for s, (p, _) in self.by_slug(rows).items()}
        return self._plain_cache[key]

    def _plain_ids(self, t):
        """{id: P} sin redondear ni juntar variantes: la cuenta del zombi combina dos tablas por id antes de redondear."""
        acc = {}
        for gid, p, f in container_chances(t, self.L.procedural, self.known, in_room=False):
            if f is None:
                acc[gid] = max(acc.get(gid, 0.0), p)
        return acc

    def build(self):
        L = self.L
        # Sólo las tablas que alguna habitación del mapa tira (ver `map_rooms`): las demás no llenan nada en vanilla.
        # `_all` (afuera de un cuarto), los escondites, los zombis, los vehículos y los bolsos no dependen del nombre de
        # un cuarto y quedan como están.
        self.on_map = self.map_rooms()
        tables = sorted({self.canon(k) for k in L.rooms} & set(self.on_map))

        # Las habitaciones: cada tabla propia (con sus muebles, `other` incluido) y `_all`, la general (afuera de un
        # cuarto o en uno sin tabla: lo que se tira es lo mismo).
        places = {k: self.place([(c, L.chances(k, c, self.known)) for c in sorted(L.rooms[k]) if _is_table(L.rooms[k][c])])
                  for k in tables}
        places["_all"] = self.place([(c, L.chances(None, c, self.known)) for c in sorted(L.general)
                                     if _is_table(L.general[c])])
        # Los escondites: sus muebles están adentro de un cuarto del edificio (in_room).
        stashes = {s: self.place([(c, container_chances(t, L.procedural, self.known, in_room=True))
                                  for c, t in sorted(L.stashes[s].items()) if _is_table(t)])
                   for s in sorted(L.stashes)}

        fichas = defaultdict(dict)
        for field, group in (("rooms", places), ("stash", stashes)):
            for key in sorted(group):
                for s, (cont, p, force) in group[key].items():
                    fichas[s].setdefault(field, []).append(_row(key, cont, p, force))

        # Zombis: la tabla del atuendo y, si la trae en true (o no la trae), también la de su sexo. La ficha no sabe si
        # el zombi es hombre o mujer: se combina con la mayor de las dos.
        sex = {k: self._plain_ids(L.zombie[k]) for k in ("m", "f")}
        zm = {k: self.plain(L.zombie[k]) for k in ("m", "f")}
        outfits = defaultdict(dict)
        for o in sorted(L.outfits):
            t = L.outfits[o]
            default = t.get("defaultInventoryLoot", True) is not False
            rows = []
            for gid, p in self._plain_ids(t).items():
                if p > 0 and default:
                    p = 1 - (1 - p) * (1 - max(sex["m"].get(gid, 0.0), sex["f"].get(gid, 0.0)))
                rows.append((gid, p, None))
            for s, (p, _) in self.by_slug(rows).items():
                outfits[s][o] = p
        for s in sorted(set(zm["m"]) | set(zm["f"]) | set(outfits)):
            rows = _by_p([[o, p] for o, p in outfits.get(s, {}).items()], p=1)
            fichas[s]["zombie"] = {"m": zm["m"].get(s, 0), "f": zm["f"].get(s, 0), "outfits": rows[:TOP_OUTFITS],
                                   "nOutfits": len(rows)}

        # Vehículos: por grupo, la parte donde más sale.
        veh = defaultdict(dict)
        for g in sorted(L.vehicles):
            for part in sorted(L.vehicles[g]):
                for s, p in self.plain(L.vehicles[g][part]).items():
                    if g not in veh[s] or p > veh[s][g][1]:
                        veh[s][g] = (part, p)
        for s, groups in veh.items():
            rows = _by_p([[g, part, p] for g, (part, p) in groups.items()])
            fichas[s]["vehicles"] = rows[:TOP_VEHICLES]
            fichas[s]["nVehicles"] = len(rows)

        # Bolsos y cajas: el objeto-contenedor (si tiene ficha) y lo que trae al encontrarlo.
        bags = defaultdict(dict)
        for b in sorted(L.bags):
            bag_gid = resolve_item(b, self.known)
            bag = self.slug(bag_gid) if bag_gid else None
            if bag is None:
                continue
            for s, p in self.plain(L.bags[b]).items():
                if bag not in bags[s] or p > bags[s][bag][1]:
                    bags[s][bag] = (bag_gid, p)
        for s, found in bags.items():
            rows = [[{"id": bag, "en": self.entry[bag]["en"], "es": self.entry[bag]["es"], "icon": self.icon.get(gid)}, p]
                    for bag, (gid, p) in found.items()]
            fichas[s]["bags"] = _by_p(rows, p=1)[:TOP_BAGS]

        site = site_module()
        files = {f"items/{i:02d}.json": {} for i in range(site.SHARDS)}
        named = defaultdict(set)   # lo que nombran los archivos: sus nombres van en common.json

        def name_row(r):
            named["containers"].add(r[1])
            if len(r) > 3 and r[3].startswith("z:"):
                named["zones"].add(r[3][2:])
        for s in sorted(fichas):
            f = fichas[s]
            rooms = _by_p(f.get("rooms", []))
            out = {"rooms": rooms[:TOP_ROOMS], "nRooms": len(rooms)}
            if f.get("stash"):
                out["stash"] = _by_p(f["stash"])[:TOP_STASH]
            for k in ("zombie", "vehicles", "nVehicles", "bags"):
                if k in f:
                    out[k] = f[k]
            for r in out["rooms"] + out.get("stash", []):
                name_row(r)
            named["stashes"].update(r[0] for r in out.get("stash", []))
            named["outfits"].update(o for o, _ in out.get("zombie", {}).get("outfits", []))
            named["vehicles"].update(g for g, _, _ in out.get("vehicles", []))
            named["parts"].update(part for _, part, _ in out.get("vehicles", []))
            files[f"items/{site.shard(s)}.json"][s] = out

        # Por habitación del mapa, con su nombre tal cual (el de map.py) y la tabla que usa; más `_all`.
        tops = {}
        for k in tables + ["_all"]:
            rows = _by_p([_row(s, cont, p, force) for s, (cont, p, force) in places[k].items()])
            tops[k] = (len(rows), rows[:TOP_ROOM_ITEMS])
        rfiles = {f"rooms/{i:02d}.json": {"items": {}, "conts": {}, "rooms": {}} for i in range(ROOM_SHARDS)}
        for raw in sorted({n for n in self.buildings["rooms"] if n in L.rooms and self.canon(n) in self.on_map}) + ["_all"]:
            k = "_all" if raw == "_all" else self.canon(raw)
            n, top = tops[k]
            rf = rfiles[f"rooms/{site.shard(raw, ROOM_SHARDS)}.json"]
            rf["rooms"][raw] = {"t": k, "n": n, "top": top}
            for row in top:
                e = self.entry[row[0]]
                rf["items"][row[0]] = [e["en"], e["es"], self.icon.get(e["ref"][0])]
                rf["conts"][row[1]] = list(self.cont_name(row[1]))
                name_row(row)
        for rf in rfiles.values():   # por clave: el archivo no depende del orden en que se llenó
            for part in rf:
                rf[part] = dict(sorted(rf[part].items()))
        files.update(rfiles)

        files["common.json"] = self.common(named, tables)
        files["meta.json"] = self.meta(files)
        return files

    def cont_name(self, key):
        """(en, es) de un mueble. Uno que es un objeto (`Bag_DuffelBagTINT` puesto como mueble en los escondites de
        armas) toma el de su ficha."""
        n = loot_names
        if key not in n.CONTAINERS:
            gid = resolve_item(key, self.known)
            s = self.slug_of.get(gid) if gid else None
            if s:
                return (self.entry[s]["en"], self.entry[s]["es"])
        return n.name(n.CONTAINERS, key)

    def common(self, named, tables):
        n = loot_names

        def locs(keys, get):
            return {k: dict(zip(("en", "es"), get(k))) for k in sorted(keys)}
        out = {
            "containers": locs(named["containers"], self.cont_name),
            "parts": locs(named["parts"], lambda k: n.name(n.PARTS, k)),
            "vehicles": locs(named["vehicles"], lambda k: n.name(n.VEHICLES, k)),
            "outfits": locs(named["outfits"], lambda k: n.name(n.OUTFITS, k)),
            "stashes": locs(named["stashes"], lambda k: n.name(n.STASHES, k)),
            "zones": locs(named["zones"], lambda k: n.name(n.ZONES, k)),
        }
        # Los alias son copias de tabla del Lua; la ficha los muestra como "también: ...". Sólo van los que son nombres
        # de habitación del mapa: "House kitchen" no existe en ningún edificio y sería ruido (Cocina diría "también: ...").
        on_map = set(self.buildings["rooms"])
        aliases = defaultdict(list)
        for k in sorted(self.L.rooms):
            if self.canon(k) != k and k in on_map:
                aliases[self.canon(k)].append(k)
        out["aliases"] = dict(sorted(aliases.items()))

        # Cuántas habitaciones del mapa usan cada tabla (cada habitación de cada piso), y un edificio de ejemplo: el
        # que tiene una con el centro de su caja más cerca de Muldraugh (ante un empate, el id menor).
        # `tables` ya son sólo las que están en el mapa, así que toda tabla tiene n > 0 y su edificio de ejemplo.
        home = next((p for p in self.places if p.get("name") == HOME), None)
        if home is None:
            _die(f"map/web/common.json no trae {HOME} en `places`: cambió la forma de los datos del mapa")
        spots = {}
        for k in tables:
            d, bid, cx, cy = min(((cx - home["x"]) ** 2 + (cy - home["y"]) ** 2, bid, cx, cy)
                                 for bid, cx, cy in self.on_map[k])
            spots[k] = {"n": len(self.on_map[k]), "at": [bid, math.floor(cx + 0.5), math.floor(cy + 0.5)]}
        out["spots"] = spots
        return out

    def meta(self, files):
        """{ version, extractedAt, dataHash, ref, counts, unknown }. extractedAt se mueve sólo si cambia el hash de los
        datos (como data/map/meta.json): es el `lastmod` del botín, y una fecha que se mueve sin cambios no sirve."""
        site = site_module()
        h = hashlib.sha256()
        for name in sorted(files):
            if name != "meta.json":
                h.update(name.encode() + b"\0" + site.dumps(files[name]).encode("utf-8"))
        digest = h.hexdigest()
        old = {}
        path = os.path.join(LOOT_OUT, "meta.json")
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as f:
                old = json.load(f)
        same = old.get("dataHash") == digest and "extractedAt" in old
        counts, detail = inventory(self.L, self.known)
        return {"version": self.meta_game.get("version"),
                "extractedAt": old["extractedAt"] if same else datetime.date.today().isoformat(),
                "dataHash": digest, "ref": REF, "counts": counts, "unknown": detail["unknown"]}


def build(L=None):
    """
    {ruta en data/loot: contenido} para el sitio:

      items/<NN>.json   (NN = shard(slug), los 100 siempre) dónde aparece cada ficha: habitaciones (por habitación su
                        mejor mueble), escondites, zombis, vehículos y bolsos, con la P del botín en "Normal"
      rooms/<NN>.json   (NN = shard(nombre, 32), los 32 siempre) qué puede salir en cada habitación del mapa con tabla
                        propia (con su nombre tal cual: `garage`, `Bathroom`) y en `_all`
      common.json       los nombres en/es de muebles, partes, vehículos, atuendos, escondites y zonas, los alias y, por
                        tabla, cuántas habitaciones del mapa la usan y una de ejemplo
      meta.json         versión, fecha, hash de los datos, la referencia (REF), el inventario y los nombres que no existen
    """
    return _Site(L or Loot(known=_known_ids())).build()


def main(argv=None):
    # Como extract.py y site.py: los avisos llevan tildes y tienen que llegar bien aunque se redirijan.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    ap = argparse.ArgumentParser(description="El botín de Project Zomboid.")
    ap.add_argument("--check", action="store_true", help="imprime el inventario de las tablas y no escribe nada")
    args = ap.parse_args(argv)
    if args.check:
        check()
        return
    s = _Site(Loot(known=_known_ids()))
    files = s.build()
    sizes = site_module().write(files, LOOT_OUT)

    def kb(n):
        return f"{n / 1024:.1f}"

    nfichas = sum(len(v) for k, v in files.items() if k.startswith("items/"))
    nrooms = sum(len(v["rooms"]) for k, v in files.items() if k.startswith("rooms/"))
    print(f"Botín (data/loot): {nfichas} fichas que aparecen en algún lado, {nrooms} habitaciones del mapa (con _all)")
    for folder in ("items", "rooms"):
        sh = [v for k, v in sizes.items() if k.startswith(folder + "/")]
        big = max(sh)
        print(f"  {folder}/NN.json ({len(sh)}): el más grande {kb(big[0])}/{kb(big[1])} KB, promedio "
              f"{kb(sum(x[0] for x in sh) / len(sh))}/{kb(sum(x[1] for x in sh) / len(sh))} KB, en total "
              f"{kb(sum(x[0] for x in sh))}/{kb(sum(x[1] for x in sh))} KB (crudo/gzip)")
    for name in ("common.json", "meta.json"):
        print(f"  {name}: {kb(sizes[name][0])}/{kb(sizes[name][1])} KB (crudo/gzip)")
    print(f"  todo data/loot: {kb(sum(x[0] for x in sizes.values()))}/{kb(sum(x[1] for x in sizes.values()))} KB "
          f"(crudo/gzip)")
    unknown = files["meta.json"]["unknown"]
    if unknown:
        print(f"  AVISO: {len(unknown)} nombres de las tablas no existen en data/items.json (no salen, como en el "
              f"juego): {', '.join(unknown)}", file=sys.stderr)
    if s.no_ficha:
        print(f"  AVISO: {len(s.no_ficha)} objetos salen y no tienen ficha (quedaron afuera): {sorted(s.no_ficha)[:10]}",
              file=sys.stderr)
    # Fabricación usa dónde aparece cada cosa para saber qué se junta y qué se fabrica: craft.json se rearma con este
    # botín. Por su ruta, como site.py (ver `site_module`).
    import importlib.util
    spec = importlib.util.spec_from_file_location("zomboid_craft", os.path.join(os.path.dirname(__file__), "craft.py"))
    craft = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(craft)
    craft.main()


if __name__ == "__main__":
    main()
