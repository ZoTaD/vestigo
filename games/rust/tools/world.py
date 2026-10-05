"""
El botín de cada caja y las tiendas de cada monumento de Rust (2026-10-05). Diseño: docs/design/2026-10-05-rust.md.

Lee las escenas del juego (`Bundles/shared/assetscenes.bundle`) junto con `content.bundle` (los `LootSpawn` y los
`NPCVendingOrder`) e `items.preload.bundle` (los objetos), porque las referencias cruzan de un archivo a otro.
Escribe:
  - `games/rust/data/loot.json`: por objeto, en qué cajas aparece, con la probabilidad de que una caja traiga al menos
    uno, la cantidad contando todas sus tiradas y si sale gastado; de los NPC (científicos, moradores,
    espantapájaros); y de los recolectables y objetos que se abren (regalos, bolsas de Halloween, huevos);
  - `games/rust/data/shops.json`: qué vende cada tienda de monumento (Outpost, Bandit Camp, pueblo pesquero, rancho,
    granero) y a qué precio. El pozo de agua tiene tienda, pero todas sus órdenes son de precio al azar: no entra;
  - `games/rust/data/mixing.json`: las recetas de la mesa de mezcla;
  - `games/rust/data/deployables.json`: qué se le pone a cada puerta, quién paga mantenimiento, cuánto tarda en
    romperse sin él (desgaste) y con qué nivel de vibración detecta el sensor sísmico cada explosivo.

La cuenta del botín sigue `LootContainer.PopulateLoot`/`GenerateScrap` y `LootSpawn.SpawnIntoContainer` del juego
(decompilados públicos: github.com/MillionthOdin16/RustChangelog, `LootContainer.cs` y `LootSpawn.cs`): si la caja
tiene ranuras (`LootSpawnSlots`) se tiran ésas, cada una `numberToSpawn` veces con su probabilidad; si no,
`lootDefinition` `maxDefinitionsToSpawn` veces. Un `LootSpawn` con subcategorías elige una por peso (una subcategoría
vacía cuenta en el peso y no da nada) y la tira 1 + `extraSpawns` veces; uno sin, da todos sus objetos. Al final
`scrapAmount` suma chatarra fija. Es la probabilidad por caja, no por partida: el servidor también decide cuántas cajas
hay.

Uso, desde la raíz del repo (tarda ~1 min: abrir los tres bundles y seguir las referencias):
    python games/rust/tools/world.py
"""
import json
import math
import sys
from pathlib import Path

import UnityPy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import BUNDLES, DATA, number, read_content, slugify, text_of  # noqa: E402

# Las cajas que se muestran, por el nombre del prefab sin carpeta ni extensión; las del laboratorio submarino llevan
# delante `underwater_labs/`, porque varias se llaman igual que las de los monumentos. Sólo comparten clave los prefabs
# con la misma tabla de botín (`loot_tables`, y un test lo exige): los barriles azul y amarillo, las variantes de la
# caja bloqueada, las cajas del laboratorio que son copia de las del mundo. Las que tienen otra tabla (las de los
# vagones, buena parte de las del laboratorio) van aparte, porque mezclarlas mostraba un botín que ninguna da. Lo que
# no está acá no se muestra (el extractor lista lo que deja afuera): `dm *`, `invisible_*` y `hiddenhackablecrate` son
# de modding,
# `satellite_crate_*`, `giftbox_loot` y `xmastunnellootbox` son de eventos sin un nombre que la comunidad use,
# `loot-barrel-tutorial` de la isla
# del tutorial, y `loot_trash` y `loot_component_test` no aparecen en ningún monumento.
CONTAINERS = {
    "crate_elite": "elite", "underwater_labs/crate_elite": "elite",
    "crate_normal": "military",
    "underwater_labs/crate_normal": "military_lab",
    "wagon_crate_normal": "military_wagon",
    "crate_normal_2": "crate", "underwater_labs/crate_normal_2": "crate",
    "wagon_crate_normal_2": "crate_wagon",
    "crate_basic": "basic",
    "crate_basic_jungle": "jungle",
    "crate_tools": "tools", "underwater_labs/crate_tools": "tools",
    # La caja médica y la de comida que se ven en los monumentos son `crate_normal_2_medical` y `crate_normal_2_food`
    # (y sus copias en los vagones, con la misma tabla); las del laboratorio tienen otra.
    "crate_normal_2_medical": "medical", "wagon_crate_normal_2_medical": "medical",
    "underwater_labs/crate_medical": "medical_lab",
    "crate_normal_2_food": "food", "wagon_crate_normal_2_food": "food",
    "underwater_labs/crate_food_1": "food_lab",
    "foodbox": "foodbox",
    "underwater_labs/crate_food_2": "foodbox_lab",
    "crate_shore": "shore",
    "crate_cannons": "cannons",
    "underwater_labs/crate_ammunition": "ammo",
    "underwater_labs/crate_fuel": "fuel",
    "crate_mine": "mine", "minecart": "mine",
    "underwater_labs/tech_parts_1": "tech2", "underwater_labs/tech_parts_2": "tech3",
    "vehicle_parts": "vehicle", "underwater_labs/vehicle_parts": "vehicle",
    "vehicle_parts_advanced": "vehicle_adv",
    "loot-barrel-1": "barrel", "loot-barrel-2": "barrel", "loot_barrel_1": "barrel", "loot_barrel_2": "barrel",
    "oil_barrel": "oil", "diesel_barrel_world": "oil",
    "trash-pile-1": "trash",
    "roadsign1": "roadsign", "roadsign2": "roadsign", "roadsign3": "roadsign", "roadsign4": "roadsign",
    "roadsign5": "roadsign", "roadsign6": "roadsign", "roadsign7": "roadsign", "roadsign8": "roadsign",
    "roadsign9": "roadsign",
    "food_cache_001": "cache", "food_cache_002": "cache", "food_cache_003": "cache", "food_cache_004": "cache",
    "food_cache_005": "cache",
    "crate_underwater_basic": "underwater", "crate_underwater_advanced": "underwater_adv",
    "heli_crate": "heli",
    "bradley_crate": "bradley",
    # El barco fantasma y las variantes para mapas propios usan la misma caja (y la misma tabla) que la del Chinook.
    "codelockedhackablecrate": "locked", "codelockedhackablecrate_oilrig": "locked",
    "codelockedhackablecrate_ghostship": "locked", "codelockedhackablecrate_min_build_radius": "locked",
    "codelockedhackablecrate_no_build_radius": "locked",
    "supply_drop": "supply",
    # La entrega aérea del trineo de Papá Noel (evento de Navidad): un `SupplyDrop` con su propia tabla.
    "presentdrop": "santa",
}
# Los nombres de las cajas. Los que el juego tiene en engine.json van por su token (`lootfood`, `supplydrop`); los demás,
# escritos acá con el nombre que usan las wikis (rusthelp.com, 2026-10-05) y, en español, las palabras del juego
# ("Laboratorio submarino", "Vagón").
LAB = ("Underwater Lab", "laboratorio submarino")
CONTAINER_NAMES = {
    "elite": ("Elite Crate", "Caja de élite"),
    "military": ("Military Crate", "Caja militar"),
    "military_lab": (f"Military Crate ({LAB[0]})", f"Caja militar ({LAB[1]})"),
    "military_wagon": ("Military Crate (Wagon)", "Caja militar (vagón)"),
    "crate": ("Crate", "Caja"),
    "crate_wagon": ("Crate (Wagon)", "Caja (vagón)"),
    "basic": ("Basic Crate", "Caja básica"),
    "jungle": ("Basic Crate (Jungle)", "Caja básica (selva)"),
    "tools": ("Toolbox", "Caja de herramientas"),
    "medical": ("Medical Crate", "Caja médica"),
    "medical_lab": (f"Medical Crate ({LAB[0]})", f"Caja médica ({LAB[1]})"),
    "food": "lootfood",
    "food_lab": (f"Food Crate ({LAB[0]})", f"Caja de comida ({LAB[1]})"),
    "foodbox": ("Food Box", "Caja de víveres"),
    "foodbox_lab": (f"Food Box ({LAB[0]})", f"Caja de víveres ({LAB[1]})"),
    "shore": ("Shore Crate", "Caja costera"),
    "cannons": ("Cannon Crate", "Caja de cañón"),
    "ammo": (f"Ammo Crate ({LAB[0]})", f"Caja de munición ({LAB[1]})"),
    "fuel": (f"Fuel Crate ({LAB[0]})", f"Caja de combustible ({LAB[1]})"),
    "mine": ("Mine Crate", "Caja de mina"),
    "tech2": (f"Tier 2 Components ({LAB[0]})", f"Componentes de nivel 2 ({LAB[1]})"),
    "tech3": (f"Tier 3 Components ({LAB[0]})", f"Componentes de nivel 3 ({LAB[1]})"),
    "vehicle": ("Vehicle Parts Crate", "Caja de piezas de vehículo"),
    "vehicle_adv": ("Advanced Vehicle Parts Crate", "Caja de piezas de vehículo avanzadas"),
    "barrel": ("Barrel", "Barril"),
    "oil": ("Oil Barrel", "Barril de petróleo"),
    "trash": ("Trash Pile", "Pila de basura"),
    "roadsign": ("Road Sign", "Cartel de ruta"),
    "cache": ("Food Cache", "Escondite de comida"),
    "underwater": ("Underwater Crate", "Caja submarina"),
    "underwater_adv": ("Advanced Underwater Crate", "Caja submarina avanzada"),
    "heli": ("Patrol Helicopter Crate", "Caja del helicóptero de patrulla"),
    "bradley": ("Bradley APC Crate", "Caja del Bradley"),
    "locked": ("Locked Crate", "Caja bloqueada"),
    "supply": "supplydrop",
    "santa": ("Santa's Supply Drop", "Entrega aérea de Papá Noel"),
}
# Las cajas que sólo existen en un evento. La ficha lo marca, para que nadie las busque en julio.
CONTAINER_EVENTS = {"santa": "xmas"}
# Los `LootContainer.spawnType` en los que el juego gasta lo que sale (`PopulateLoot`): TOWN (2) y ROADSIDE (5). Ahí un
# objeto con condición sale entre `foundCondition.fractionMin` y `fractionMax` de su máximo (la AK de la caja de élite,
# al 10–20 %); en las demás, entero.
WORN_TYPES = {2, 5}
# Los NPC con botín, por el prefab sin carpeta ni extensión, con la regla de `CONTAINERS`: comparten clave sólo los que
# tienen la misma tabla (lo exige un test). Los científicos se separan por dónde están, con los nombres que usa la
# comunidad (rusthelp.com, 2026-10-05): los de monumentos (y el carguero, la plataforma, el Bradley, el Chinook) tienen
# una tabla; los de los túneles militares y los de las lanchas, otra (rusthelp les da la misma jeringa, 36,34 %).
# Afuera, y se listan al correr: los guardias de Bandit Camp y los científicos de Outpost (zonas seguras), los
# `scientist2*` sin botín, `npcplayertest` y los vendedores.
NPCS = {
    "scientistnpc_roam": "scientist", "scientistnpc_patrol": "scientist", "scientistnpc_roamtethered": "scientist",
    "scientistnpc_excavator": "scientist", "scientistnpc_oilrig": "scientist", "scientistnpc_cargo": "scientist",
    "scientistnpc_cargo_turret_any": "scientist", "scientistnpc_cargo_turret_lr300": "scientist",
    "scientistnpc_arena": "scientist", "scientistnpc_bradley": "scientist", "scientistnpc_ch47_gunner": "scientist",
    "scientistnpc_patrol_arctic": "scientist", "scientistnpc_outbreak": "scientist",
    "scientistnpc_roam_nvg_variant": "scientist_nvg",
    "scientistnpc_full_any": "scientist_tunnel", "scientistnpc_full_lr300": "scientist_tunnel",
    "scientistnpc_full_mp5": "scientist_tunnel", "scientistnpc_full_pistol": "scientist_tunnel",
    "scientistnpc_full_shotgun": "scientist_tunnel",
    "scientistnpc_rhib": "scientist_boat", "scientistnpc_ptboat": "scientist_boat",
    "scientistnpc_junkpile_pistol": "scientist_junkpile",
    "scientistnpc_heavy": "heavy", "scientistnpc_bradley_heavy": "heavy_bradley",
    "npc_tunneldweller": "tunnel_dweller", "npc_tunneldwellerspawned": "tunnel_dweller",
    "npc_underwaterdweller": "underwater_dweller",
    "scarecrow": "scarecrow", "scarecrow_dungeon": "scarecrow", "scarecrow_dungeonnoroam": "scarecrow",
    "gingerbread_dungeon": "gingerbread", "gingerbread_meleedungeon": "gingerbread",
}
# Los nombres: el token del juego cuando lo hay, y si no a mano, con las palabras del juego. Para el de la pila de
# chatarra y el de visión nocturna no hay token (2026-10-05); el primero va como lo escribe la comunidad ("Junkpile
# Scientist", rustexplore.com y Facepunch), el segundo no tiene un nombre de uso común.
NPC_NAMES = {
    "scientist": "scientist.name",
    "scientist_nvg": ("Night Vision Scientist", "Científico con visión nocturna"),
    "scientist_tunnel": ("Military Tunnel Scientist", "Científico de los túneles militares"),
    "scientist_boat": ("Boat Scientist", "Científico de lancha"),
    "scientist_junkpile": ("Junkpile Scientist", "Científico de la pila de chatarra"),
    "heavy": ("Heavy Scientist (Oil Rig)", "Científico pesado (plataforma petrolera)"),
    "heavy_bradley": ("Heavy Scientist (Bradley)", "Científico pesado (Bradley)"),
    "tunnel_dweller": "tunneldweller.name",
    "underwater_dweller": "underwaterdweller.name",
    "scarecrow": "scarecrow.name",
    "gingerbread": "gingerbread_man",
}
NPC_EVENTS = {"scarecrow": "halloween", "gingerbread": "xmas"}
NPC_CLASSES = {"ScientistNPC", "ScientistNPC2", "TunnelDweller", "UnderwaterDweller", "ScarecrowNPC", "GingerbreadNPC",
               "BanditGuard", "NPCShopKeeper", "NPCPlayer"}
# Los objetos que se abren y lo que tiran (`revealList`), con el evento en el que aparecen: los regalos de Navidad
# (`ItemModUnwrap`), las bolsas de caramelos de Halloween (`ItemModOpenLootBag`) y los huevos de Pascua
# (`ItemModCrackOpen`).
OPENABLE = {"ItemModUnwrap": "xmas", "ItemModOpenLootBag": "halloween", "ItemModCrackOpen": "easter"}
COLLECTABLES = "assets/bundled/prefabs/autospawn/collectable/"
# Cuánto tarda en romperse sin mantenimiento algo de un grado de construcción (`BuildingGradeDecay` → `decay.duration_*`,
# valores por defecto del servidor: paja, madera, piedra, metal, blindado), en horas y sin demora (`decay.delay_*` = 0).
# Adentro de una base dura 10 veces más (`decay.upkeep_inside_decay_scale` = 0,1): eso lo multiplica el sitio.
DECAY_GRADE_HOURS = {0: 1, 1: 3, 2: 5, 3: 8, 4: 12}
# Los prefabs que explotan, con su `vibrationLevel` (lo que detecta el sensor sísmico), y las armas que se tiran y dicen
# qué prefab tiran (`prefabToThrow`): el C4 en la mano es `explosive.timed.entity`, el que explota `.deployed`.
EXPLOSIVE_CLASSES = {"TimedExplosive", "DudTimedExplosive", "RFTimedExplosive", "SeasonalTimedExplosive", "MLRSRocket",
                     "BeeGrenade", "DeployableSiegeExplosive", "Landmine"}
THROWER_CLASSES = {"ThrownWeapon", "GrenadeWeapon"}
LOOT_CLASSES = {"LootContainer", "LockedByEntCrate", "HackableLockedCrate", "SupplyDrop", "FreeableLootContainer"}
# Las tiendas, por el prefab del monumento donde está la máquina. La clave sale de la primera coincidencia; el nombre,
# del token oficial (engine.json). El pozo de agua queda en la lista para que su máquina no corte por "monumento sin
# nombre", pero hoy no aporta órdenes: todas son de precio al azar.
SHOP_MONUMENTS = [
    ("/monument/medium/compound.prefab", "outpost"),
    ("/monument/medium/bandit_town.prefab", "bandit"),
    ("/monument/fishing_village/", "fishing"),
    ("/monument/small/stables_a.prefab", "ranch"),
    ("/monument/small/stables_b.prefab", "barn"),
    ("/monument/tiny/water_well_", "well"),
]
SHOP_TOKENS = {
    "outpost": "outpost", "bandit": "bandit_camp", "fishing": "fishing_village_display_name",
    "ranch": "stables_a", "barn": "stables_b", "well": "waterwell",
}
VENDING_CLASSES = {"NPCVendingMachine", "InvisibleVendingMachine"}


class World:
    """Los tres bundles juntos y cómo seguir una referencia de un archivo a otro."""

    def __init__(self):
        shared = BUNDLES / "shared"
        self.env = UnityPy.load(*(str(shared / b) for b in ("assetscenes.bundle", "content.bundle", "items.preload.bundle")))
        # Los archivos por nombre (`CAB-…` o `BuildPlayer-AssetScene-…`): una referencia con `m_FileID` > 0 nombra uno
        # de ésos, y cada archivo ya trae sus objetos por `path_id`. Las clases de los MonoScript, por (archivo, id).
        self.files = {}
        self.scripts = {}
        self.mono = []
        for o in self.env.objects:
            af = o.assets_file
            if af.name not in self.files:
                self.files[af.name] = af
            t = o.type.name
            if t == "MonoBehaviour":
                self.mono.append(o)
            elif t == "MonoScript":
                self.scripts[(af.name, o.path_id)] = o.read().m_ClassName
        self.trees = {}
        self.spawns = {}
        self.unresolved = {}  # qué se buscaba → [cuántas referencias no llevaron a nada, un ejemplo]

    def file_of(self, af, fid):
        return af.name if fid == 0 else af.externals[fid - 1].path.split("/")[-1]

    def obj(self, owner, ref):
        """El objeto al que apunta `ref` ({m_FileID, m_PathID}) desde `owner`, o `None`."""
        if not ref or not ref.get("m_PathID"):
            return None
        af = self.files.get(self.file_of(owner.assets_file, ref["m_FileID"]))
        return af.objects.get(ref["m_PathID"]) if af else None

    def follow(self, owner, ref, what):
        """
        Como `obj`, pero una referencia que apunta a algo (`m_PathID` ≠ 0) y no se encuentra queda anotada en
        `unresolved`: es botín o una orden que se pierde en silencio, y `report_unresolved` la avisa.
        """
        o = self.obj(owner, ref)
        if o is None and ref and ref.get("m_PathID"):
            slot = self.unresolved.setdefault(what, [0, None])
            slot[0] += 1
            slot[1] = slot[1] or f"{owner.assets_file.name}#{owner.path_id} -> {ref}"
        return o

    def report_unresolved(self):
        for what, (n, example) in sorted(self.unresolved.items()):
            print(f"[rust] {n} referencias sin resolver ({what}); por ejemplo {example}", file=sys.stderr)

    def tree(self, o):
        key = (o.assets_file.name, o.path_id)
        if key not in self.trees:
            self.trees[key] = o.read_typetree()
        return self.trees[key]

    def behaviours(self, classes):
        """
        (objeto, typetree, clase) de cada MonoBehaviour de esas clases. Son 1,25 millones entre los tres bundles y leer
        el typetree de todos tarda muchísimo; los de escena además tienen `m_Name` vacío, así que `peek_name` no sirve
        para filtrar. Se lee crudo sólo `m_Script`, que en todo MonoBehaviour va en el byte 16 (después de
        `m_GameObject`, un PPtr de 4 + 8 bytes, y `m_Enabled` alineado a 4), y se lee el typetree únicamente de los
        que coinciden: el escaneo entero tarda ~1 s.

        Depende de cómo UnityPy 1.25.4 expone el lector (`o.reader`, `o.byte_start`, `read_int`/`read_long`) y de que
        los PathID sean de 64 bits (formato ≥ 14). Para no dar datos mal en silencio si algo de eso cambia, cada
        coincidencia se compara con el `m_Script` del typetree, y un `m_FileID` imposible corta.
        """
        names = {}  # (id del archivo, m_FileID) → nombre del archivo
        for o in self.mono:
            af = o.assets_file
            r = o.reader
            r.Position = o.byte_start + 16
            fid, pid = r.read_int(), r.read_long()
            key = (id(af), fid)
            name = names.get(key)
            if name is None:
                if not 0 <= fid <= len(af.externals):
                    raise SystemExit(f"m_Script crudo imposible en {af.name}#{o.path_id}: m_FileID {fid}")
                name = names[key] = self.file_of(af, fid)
            cls = self.scripts.get((name, pid))
            if cls in classes:
                tt = self.tree(o)
                if (tt["m_Script"]["m_FileID"], tt["m_Script"]["m_PathID"]) != (fid, pid):
                    raise SystemExit(f"la lectura cruda de m_Script no coincide en {af.name}#{o.path_id}: "
                                     f"{(fid, pid)} contra {tt['m_Script']}")
                yield o, tt, cls

    def go_name(self, o, tt):
        go = self.obj(o, tt["m_GameObject"])
        return go.read().m_Name if go else ""

    def root_name(self, o, tt):
        """El nombre del GameObject raíz (en una escena de monumento, el prefab del monumento)."""
        go = self.obj(o, tt["m_GameObject"]).read()
        tr = None
        for c in go.m_Components:
            comp = getattr(c, "component", c).deref()  # la forma cambia entre versiones de UnityPy
            if comp.type.name == "Transform":
                tr = comp.read()
                break
        name = go.m_Name
        while tr is not None and tr.m_Father and tr.m_Father.m_PathID:
            tr = tr.m_Father.deref().read()
            name = tr.m_GameObject.deref().read().m_Name
        return name

    def shortname(self, owner, ref, what="objeto"):
        o = self.follow(owner, ref, what)
        return self.tree(o)["shortname"] if o else None

    def ref_key(self, owner, ref):
        """Un `LootSpawn` (u otro objeto) como (archivo, path_id), para comparar tablas entre prefabs."""
        o = self.obj(owner, ref)
        return (o.assets_file.name, o.path_id) if o else None

    def spawn_tree(self, owner, ref, _stack=()):
        """
        Un `LootSpawn` como árbol simple, con las referencias ya seguidas (cada una desde el archivo donde vive su
        dueño): `{"subSpawn": [{"weight", "category": árbol | None, "extraSpawns"}],
        "items": [{"sid", "amount", "isBP", "maxAmount"}]}`. `None` si `ref` no apunta a nada. Se arma una vez por
        `LootSpawn` (muchas cajas comparten subárboles).

        Una rama que se elige a sí misma (`Collection.Ballistic`) hace que el juego vuelva a tirar: es lo mismo que sacarla
        del sorteo, y así se trata. Un ciclo más largo corta con el nombre, en vez de una recursión infinita.
        """
        o = self.follow(owner, ref, "LootSpawn")
        if o is None:
            return None
        key = (o.assets_file.name, o.path_id)
        if key in _stack:
            raise SystemExit(f"LootSpawn en ciclo: {self.tree(o)['m_Name']}")
        if key not in self.spawns:
            t = self.tree(o)
            subs = []
            for s in t["subSpawn"]:
                child = self.obj(o, s["category"])
                if child is not None and (child.assets_file.name, child.path_id) == key:
                    continue
                subs.append({"weight": s["weight"], "category": self.spawn_tree(o, s["category"], _stack + (key,)),
                             "extraSpawns": s.get("extraSpawns", 0)})
            self.spawns[key] = {
                "subSpawn": subs,
                "items": [
                    {"sid": self.shortname(o, i["itemDef"], "objeto del botín"), "amount": i["amount"], "isBP": i["isBP"],
                     "maxAmount": i["maxAmount"]}
                    for i in t["items"]
                ],
            }
        return self.spawns[key]


def roll_chances(spawn, resolve):
    """
    Una tirada de un `LootSpawn`: {(shortname, es_plano): probabilidad de que salga}. `spawn` es el árbol de
    `World.spawn_tree` (o `None`, que no da nada); `resolve(x)` sigue una subcategoría. Con árboles ya resueltos (lo que
    arma `World.spawn_tree`, y los de los tests) es la identidad.

    La subcategoría elegida se tira 1 + `extraSpawns` veces (`SubCategoryIntoContainer`): dentro de esa rama, la
    probabilidad de cada objeto es 1 − (1 − v)^(1 + extraSpawns).
    """
    out = {}
    if not spawn:
        return out
    subs = spawn.get("subSpawn") or []
    if subs:
        total = sum(s["weight"] for s in subs)
        if total <= 0:
            return out
        for s in subs:
            child = resolve(s["category"])
            if not child:
                continue
            p = s["weight"] / total
            times = 1 + max(0, s.get("extraSpawns") or 0)
            for k, v in roll_chances(child, resolve).items():
                out[k] = out.get(k, 0.0) + p * (1 - (1 - v) ** times)
        return out
    for it in spawn.get("items") or []:
        if it["sid"]:
            out[(it["sid"], bool(it["isBP"]))] = 1.0
    return out


def amounts(spawn, resolve, acc=None, times=1):
    """
    {(shortname, es_plano): (mínimo, máximo)} de una tirada: la cantidad de cada ítem en las hojas del árbol. Una rama
    con `extraSpawns` se tira 1 + `extraSpawns` veces, así que el máximo se multiplica (`times` acumula los niveles); el
    mínimo no, porque el objeto puede salir en una sola de esas tiradas. Una rama de peso 0 nunca se elige (las de
    `ScientistLoot` hacia `ToolsBasic` y `GunParts`) y un árbol sin peso no da nada, igual que en `roll_chances`: si
    no, su cantidad se sumaría al máximo de la caja.
    """
    acc = {} if acc is None else acc
    if not spawn:
        return acc
    subs = spawn.get("subSpawn") or []
    if subs and sum(s["weight"] for s in subs) <= 0:
        return acc
    for s in subs:
        if s["weight"] <= 0:
            continue
        amounts(resolve(s["category"]), resolve, acc, times * (1 + max(0, s.get("extraSpawns") or 0)))
    for it in spawn.get("items") or []:
        sid = it["sid"]
        if not sid:
            continue
        lo = max(1, int(it["amount"]))
        # El juego hace `(int)Random.Range(amount, maxAmount)` con floats (`ItemAmountRanged.GetAmount`, decompilado en
        # github.com/MillionthOdin16/RustChangelog): trunca, así que el tope real es el entero anterior a `maxAmount`
        # (con 5, sale hasta 4), y nunca menos que el mínimo. Sin rango (`maxAmount` ≤ `amount`), sale `amount`.
        top = it["maxAmount"]
        hi = max(lo, math.ceil(top) - 1) if top > 0 and top > it["amount"] else lo
        hi *= times
        key = (sid, bool(it["isBP"]))
        old = acc.get(key)
        acc[key] = (min(lo, old[0]), max(hi, old[1])) if old else (lo, hi)
    return acc


def container_chances(tt, resolve, sum_slots=True):
    """
    {(shortname, es_plano): (probabilidad de que la caja traiga al menos uno, mínimo, máximo)}. Cada tirada es
    independiente: P = 1 − Π (1 − p_tirada). El mínimo es lo menos que da una tirada que lo trae; el máximo, lo que darían
    juntas todas las tiradas que pueden traerlo (la caja bloqueada tira dos veces la tabla de la AK: hasta 2). Una ranura
    con probabilidad 0 no cuenta para nada.

    Con `sum_slots=False` (los NPC) la cantidad sale de la ranura que más probabilidad le aporta a ese objeto, con sus
    tiradas repetidas (`numberToSpawn`) sumadas; la probabilidad sigue combinando todas las ranuras. Las ranuras de un NPC
    son kits ("arma con su munición") que en la práctica no salen todos juntos: sumarlas daba al científico pesado
    ×8–136 de 5,56, y rusthelp (2026-10-05) muestra ×12–36, que es la ranura de munición tirada tres veces.
    """
    rolls = []  # (ranura, spawn, probabilidad de que la tirada ocurra)
    slots = tt.get("LootSpawnSlots") or []
    if slots:
        for i, s in enumerate(slots):
            rolls += [(i, resolve(s["definition"]), s["probability"])] * s["numberToSpawn"]
    elif tt.get("lootDefinition"):
        rolls += [(0, resolve(tt["lootDefinition"]), 1.0)] * tt["maxDefinitionsToSpawn"]
    miss, per_slot, slot_miss = {}, {}, {}
    for slot, spawn, p_roll in rolls:
        if p_roll <= 0:
            continue
        sm = slot_miss.setdefault(slot, {})
        for key, p in roll_chances(spawn, resolve).items():
            miss[key] = miss.get(key, 1.0) * (1 - min(1.0, p_roll) * p)
            sm[key] = sm.get(key, 1.0) * (1 - min(1.0, p_roll) * p)
        dst = per_slot.setdefault(slot, {})
        for key, (lo, hi) in amounts(spawn, resolve).items():
            old = dst.get(key)
            dst[key] = (lo, hi) if old is None else (min(lo, old[0]), old[1] + hi)
    amt = {}
    if sum_slots:
        for got in per_slot.values():
            for key, (lo, hi) in got.items():
                old = amt.get(key)
                amt[key] = (lo, hi) if old is None else (min(lo, old[0]), old[1] + hi)
    else:
        best = {}  # objeto → (probabilidad que le aporta la ranura, ranura)
        for slot, sm in slot_miss.items():
            for key, m in sm.items():
                if key not in best or 1 - m > best[key][0]:
                    best[key] = (1 - m, slot)
        amt = {key: per_slot[slot][key] for key, (_, slot) in best.items()}
    out = {k: (1 - m, *amt[k]) for k, m in miss.items() if m < 1}
    fixed = tt.get("scrapAmount") or 0
    if fixed > 0:
        # `GenerateScrap` mete la chatarra fija además de la que haya dado el botín: si el árbol la da siempre, el
        # mínimo también la suma; si la da a veces, el mínimo es sólo la fija.
        key = ("scrap", False)
        if key in out:
            p, lo, hi = out[key]
            out[key] = (1.0, fixed + (lo if p >= 1 else 0), fixed + hi)
        else:
            out[key] = (1.0, fixed, fixed)
    return out


def npc_chances(per_loadout):
    """
    El botín de un NPC que elige su equipo al azar entre `loadouts`, todos igual de probables (`EquipLoadout`):
    `per_loadout` trae el resultado de `container_chances` con cada equipo (las ranuras `onlyWithLoadoutNamed` cambian de
    uno a otro: la minigun del científico pesado). La probabilidad es el promedio; la cantidad, el rango de todos.
    """
    n = len(per_loadout)
    out = {}
    for got in per_loadout:
        for key, (p, lo, hi) in got.items():
            o = out.get(key)
            out[key] = (p / n, lo, hi) if o is None else (o[0] + p / n, min(lo, o[1]), max(hi, o[2]))
    return out


def container_base(path):
    """`assets/…/radtown/crate_elite.prefab` → `crate_elite`; las del laboratorio submarino, con `underwater_labs/`."""
    base = path.rsplit("/", 1)[-1].removesuffix(".prefab").removesuffix(".entity")
    return f"underwater_labs/{base}" if "/underwater_labs/" in path else base


def name_of(texts, n):
    """Un nombre de `CONTAINER_NAMES` o `NPC_NAMES`: un token de engine.json o un par (inglés, español) escrito a mano."""
    if isinstance(n, tuple):
        return {"en": n[0], "es": n[1]}
    return {"en": text_of(texts, "en", n), "es": text_of(texts, "es", n)}


def merge(found, key, got):
    """
    Suma a `found[key]` lo de un prefab más. Los prefabs de una clave tienen la misma tabla (lo exige un test), así que dan
    lo mismo; igual, por las dudas, se queda la probabilidad más alta y el rango de cantidades de todos.
    """
    dst = found.setdefault(key, {})
    for item_key, (p, lo, hi) in got.items():
        prev = dst.get(item_key)
        dst[item_key] = (p, lo, hi) if prev is None else (max(p, prev[0]), min(lo, prev[1]), max(hi, prev[2]))


def loot_doc(found, sources):
    """`loot.json`: las fuentes con algo que mostrar y, por objeto, en cuáles aparece, de la más probable a la menos."""
    items = {}
    for key, got in found.items():
        for (sid, bp), (p, lo, hi) in got.items():
            if round(p, 4) <= 0:
                continue  # menos de 1 en 20.000: mostrarlo como 0 % confunde más de lo que informa
            items.setdefault(sid, []).append({"c": key, "chance": round(p, 4), "min": lo, "max": hi, "bp": bp})
    for rows in items.values():
        rows.sort(key=lambda r: (-r["chance"], r["c"], r["bp"]))
    return {"containers": {k: sources[k] for k in sorted(found)}, "items": dict(sorted(items.items()))}


def collect_boxes(w, texts, found, sources, tables):
    """Las cajas de `CONTAINERS`: su botín va a `found`, su nombre a `sources`, su firma a `tables`. Devuelve las que no se muestran."""
    ignored, worn = set(), {}
    for o, tt, _ in w.behaviours(LOOT_CLASSES):
        path = w.go_name(o, tt)
        if not path.startswith("assets/"):
            continue  # una instancia dentro de una escena: el prefab ya cuenta
        base = container_base(path)
        key = CONTAINERS.get(base)
        if key is None:
            ignored.add(base)
            continue
        tables.setdefault(key, {})[base] = (
            w.ref_key(o, tt.get("lootDefinition")), tt.get("maxDefinitionsToSpawn", 0), tt.get("scrapAmount", 0),
            tuple((w.ref_key(o, s["definition"]), s["numberToSpawn"], round(s["probability"], 6))
                  for s in tt.get("LootSpawnSlots") or []),
        )
        # Sin `.get`: si una caja no trae el campo, que corte, en vez de darla por "entera" en silencio.
        worn.setdefault(key, set()).add(tt["SpawnType"] in WORN_TYPES)
        # La caja con sus árboles ya resueltos: `container_chances` y `roll_chances` reciben la identidad, igual que en
        # los tests.
        resolved = {
            "lootDefinition": w.spawn_tree(o, tt.get("lootDefinition")),
            "maxDefinitionsToSpawn": tt.get("maxDefinitionsToSpawn", 0),
            "LootSpawnSlots": [
                {"definition": w.spawn_tree(o, s["definition"]), "numberToSpawn": s["numberToSpawn"], "probability": s["probability"]}
                for s in tt.get("LootSpawnSlots") or []
            ],
            "scrapAmount": tt.get("scrapAmount", 0),
        }
        merge(found, key, container_chances(resolved, lambda x: x))
    for key, flags in worn.items():
        # Los barriles juntan prefabs de los dos tipos: "a veces" gastado.
        sources[key] = {**name_of(texts, CONTAINER_NAMES[key]), "kind": "box", "event": CONTAINER_EVENTS.get(key),
                        "worn": "all" if flags == {True} else "none" if flags == {False} else "some"}
    return ignored


def collect_npcs(w, texts, found, sources, tables):
    """
    El botín de los NPC de `NPCS` (`HumanNPC.LootSpawnSlots`, que el cadáver recibe al morir). Cada ranura se tira
    `numberToSpawn` veces con su probabilidad, y las que tienen `onlyWithLoadoutNamed`, sólo con ese equipo. La ropa que
    queda puesta en el cadáver no se cuenta. Devuelve los prefabs con botín que no se muestran.
    """
    ignored, seen = set(), set()
    for o, tt, _ in w.behaviours(NPC_CLASSES):
        path = w.go_name(o, tt)
        if not path.startswith("assets/"):
            continue
        base = path.rsplit("/", 1)[-1].removesuffix(".prefab")
        slots = tt.get("LootSpawnSlots") or []
        key = NPCS.get(base)
        if key is None:
            if slots:
                ignored.add(base)
            continue
        if not slots:
            # Un NPC de la lista que se quedó sin botín: no se muestra, pero que se note (un parche lo vació o lo movió).
            print(f"[rust] NPC sin LootSpawnSlots: {base}", file=sys.stderr)
            continue
        tables.setdefault(key, {})[base] = tuple(
            (w.ref_key(o, s["definition"]), s["numberToSpawn"], round(s["probability"], 6), s.get("onlyWithLoadoutNamed") or "")
            for s in slots
        )
        names = []
        for ref in tt.get("loadouts") or []:
            lo = w.follow(o, ref, "PlayerInventoryProperties")
            if lo is None:
                raise SystemExit(f"NPC {base}: un equipo (loadout) no resuelve: {ref}")
            names.append(w.tree(lo)["niceName"])
        for s in slots:
            only = s.get("onlyWithLoadoutNamed") or ""
            if only and only not in names:
                # Un parche que renombra un equipo borraría esa ranura en silencio (nunca coincidiría): mejor cortar.
                raise SystemExit(f"NPC {base}: la ranura pide el equipo {only!r}, que no está entre {names}")
        per = []
        for name in names or [""]:
            res = {"lootDefinition": None, "maxDefinitionsToSpawn": 0, "scrapAmount": 0, "LootSpawnSlots": [
                {"definition": w.spawn_tree(o, s["definition"]), "numberToSpawn": s["numberToSpawn"], "probability": s["probability"]}
                for s in slots if not s.get("onlyWithLoadoutNamed") or s["onlyWithLoadoutNamed"] == name
            ]}
            per.append(container_chances(res, lambda x: x, sum_slots=False))
        merge(found, key, npc_chances(per))
        seen.add(key)
    for key in seen:
        sources[key] = {**name_of(texts, NPC_NAMES[key]), "kind": "npc", "event": NPC_EVENTS.get(key), "worn": "none"}
    return ignored


def collect_collectibles(w, texts, found, sources):
    """
    Lo que se junta del suelo (`CollectibleEntity`: cáñamo, hongos, bayas, piedras y metal sueltos): siempre lo mismo, con
    el nombre del juego (`itemName`). Los de Halloween dan más y van con su clave.
    """
    for o, tt, _ in w.behaviours({"CollectibleEntity"}):
        path = w.go_name(o, tt)
        if not path.startswith(COLLECTABLES):
            continue  # el diésel del excavador y las instancias en escenas
        token = tt["itemName"]["token"]
        halloween = "/halloween/" in path
        key = ("collect_halloween_" if halloween else "collect_") + slugify(token).replace("-", "")
        got = {}
        for i in tt.get("itemList") or []:
            sid = w.shortname(o, i["itemDef"], "objeto recolectable")
            if sid:
                n = max(1, int(i["amount"]))
                got[(sid, False)] = (1.0, n, n)
        merge(found, key, got)
        sources[key] = {
            "en": text_of(texts, "en", token) or tt["itemName"]["legacyEnglish"].strip(),
            "es": text_of(texts, "es", token),
            "kind": "collect", "event": "halloween" if halloween else None, "worn": "none",
        }


def collect_openables(w, texts, found, sources):
    """
    Lo que trae un objeto al abrirlo (`OPENABLE`): `revealList` tirada `maxTries` veces. Hoy todos tiran una vez; si un
    parche pone `minTries` ≠ `maxTries` corta, porque la cuenta de la probabilidad cambia.
    """
    defs = {}
    for o, tt, _ in w.behaviours({"ItemDefinition"}):
        defs[(o.assets_file.name, tt["m_GameObject"]["m_PathID"])] = tt
    for o, tt, cls in w.behaviours(set(OPENABLE)):
        d = defs[(o.assets_file.name, tt["m_GameObject"]["m_PathID"])]
        if d["hidden"]:
            continue
        sid = d["shortname"]
        if tt["minTries"] != tt["maxTries"]:
            raise SystemExit(f"{sid}: se abre entre {tt['minTries']} y {tt['maxTries']} veces; revisar la cuenta")
        res = {"lootDefinition": w.spawn_tree(o, tt["revealList"]), "maxDefinitionsToSpawn": tt["maxTries"],
               "LootSpawnSlots": [], "scrapAmount": 0}
        key = f"open_{sid}"
        merge(found, key, container_chances(res, lambda x: x))
        token = d["displayName"]["token"]
        sources[key] = {"en": text_of(texts, "en", token) or d["displayName"]["legacyEnglish"], "es": text_of(texts, "es", token),
                        "kind": "item", "item": sid, "event": OPENABLE[cls], "worn": "none"}


def collect_mixing(w):
    """
    Las recetas de la mesa de mezcla (`MixingTable.Recipes` → `RecipeList` → `Recipe`): cada ingrediente ocupa una
    ranura y puede repetirse, así que se suman por objeto. `RequiresBlueprint` dice si hace falta saber el plano del
    producto.
    """
    seen, out = set(), []
    for o, tt, _ in w.behaviours({"MixingTable"}):
        if not w.go_name(o, tt).startswith("assets/"):
            continue
        rl = w.follow(o, tt["Recipes"], "RecipeList de la mesa de mezcla")
        if rl is None:
            continue
        for ref in w.tree(rl)["Recipes"]:
            r = w.follow(rl, ref, "receta de la mesa de mezcla")
            if r is None:
                continue
            t = w.tree(r)
            if t["m_Name"] in seen:
                continue
            seen.add(t["m_Name"])
            product = w.shortname(r, t["ProducedItem"], "producto de la mesa de mezcla")
            if not product:
                continue
            ins = {}
            for i in t["Ingredients"]:
                sid = w.shortname(r, i["Ingredient"], "ingrediente de la mesa de mezcla")
                if sid:
                    ins[sid] = ins.get(sid, 0) + i["Count"]
            out.append({"name": t["m_Name"], "out": product, "amount": t["ProducedItemCount"],
                        "time": number(t["MixingDuration"]), "bp": bool(t["RequiresBlueprint"]),
                        "in": [{"id": k, "amount": v} for k, v in ins.items()]})
    out.sort(key=lambda r: (r["out"], r["name"]))
    return {"recipes": out}


def prefab_paths(w):
    """{guid: ruta del prefab}, del `GameManifest` de content.bundle (`prefabProperties`, ~17.300 entradas)."""
    for _, tt, _ in w.behaviours({"GameManifest"}):
        return {p["guid"]: p["name"] for p in tt["prefabProperties"]}
    raise SystemExit("No encontré el GameManifest en content.bundle")


def item_prefabs(w, paths):
    """
    Los prefabs de cada objeto, por shortname: `deploy` (lo que se coloca, `ItemModDeployable`), `entity` (lo que se
    tiene en la mano, `ItemModEntity`) y `projectile` (lo que dispara, `ItemModProjectile`). Todo vive en items.preload.
    """
    sid_of = {}
    for o, tt, _ in w.behaviours({"ItemDefinition"}):
        if not tt["hidden"]:
            sid_of[(o.assets_file.name, tt["m_GameObject"]["m_PathID"])] = tt["shortname"]
    out = {}
    fields = {"ItemModDeployable": ("deploy", "entityPrefab"), "ItemModEntity": ("entity", "entityPrefab"),
              "ItemModProjectile": ("projectile", "projectileObject")}
    for o, tt, cls in w.behaviours(set(fields)):
        sid = sid_of.get((o.assets_file.name, tt["m_GameObject"]["m_PathID"]))
        what, field = fields[cls]
        guid = tt[field]["guid"]
        path = paths.get(guid)
        if sid and path:
            out.setdefault(sid, {})[what] = path
        elif sid and guid and cls == "ItemModDeployable":
            # Un objeto que se coloca y cuyo prefab no está en el manifiesto se quedaría sin puerta, mantenimiento ni
            # desgaste sin que nadie se entere: se avisa como el resto de lo que no se resuelve.
            slot = w.unresolved.setdefault("prefab de ItemModDeployable", [0, None])
            slot[0] += 1
            slot[1] = slot[1] or f"{sid} -> guid {guid}"
    return out


def collect_deployables(w):
    """
    Lo de construcción de cada objeto que se coloca:
      - `door`: qué se le puede poner (`Door.canTakeLock`, `canTakeCloser`, `canTakeKnocker`) y si tiene mirilla
        (`hasHatch`);
      - `upkeep`: si el armario le cobra mantenimiento (`Upkeep`; cuánto lo calcula el sitio con la receta);
      - `decay`: demora y duración del desgaste en horas (`BuildingGradeDecay` o `DeployableDecay`). Viven en el
        GameObject raíz con el nombre corto del prefab, y el cliente los trae sólo para 89 prefabs de los 532 que se
        colocan: 67 son de objetos visibles y el resto de objetos ocultos (o sin ItemDefinition, como la maceta de vía
        triangular). Lo demás queda sin dato. El nombre se compara en minúsculas, porque el GameObject a veces no lleva
        las mismas mayúsculas que el archivo del prefab (la cerca de animales y su portón, el emisor RF) y se perdían
        sin aviso.
    Y `vibration`: el nivel con que el sensor sísmico detecta cada explosivo.
    """
    paths = prefab_paths(w)
    prefabs = item_prefabs(w, paths)
    by_path, decay_by_name, decay_own, vibration_by_path, thrown = {}, {}, {}, {}, {}
    for o, tt, cls in w.behaviours({"Door", "Upkeep", "DeployableDecay", "BuildingGradeDecay"} | EXPLOSIVE_CLASSES | THROWER_CLASSES):
        name = w.go_name(o, tt)
        if cls == "Door" and name.startswith("assets/"):
            # La puerta de garaje sale con `canTakeCloser` false. Rusthelp lista el cierrapuertas en la página del
            # garaje, pero su propia página del cierrapuertas no incluye el garaje, y el juego dice que no: queda false.
            by_path.setdefault(name, {})["door"] = {"lock": bool(tt["canTakeLock"]), "closer": bool(tt["canTakeCloser"]),
                                                    "knocker": bool(tt["canTakeKnocker"]), "hatch": bool(tt["hasHatch"])}
        elif cls == "Upkeep" and name.startswith("assets/"):
            by_path.setdefault(name, {})["upkeep"] = tt["upkeepMultiplier"] > 0
        elif cls in ("DeployableDecay", "BuildingGradeDecay") and not name.startswith("assets/"):
            # Manda el del prefab mismo (la raíz es el GameObject). Si sólo hay copias dentro de un monumento (el horno de
            # los departamentos), vale la copia: es el mismo prefab colocado.
            own = w.root_name(o, tt) == name
            name = name.lower()
            if name in decay_by_name and (decay_own[name] or not own):
                continue
            if cls == "BuildingGradeDecay":
                decay_by_name[name] = {"delay": 0, "duration": DECAY_GRADE_HOURS[tt["decayGrade"]]}
            else:
                decay_by_name[name] = {"delay": number(tt["decayDelay"]), "duration": number(tt["decayDuration"])}
            decay_own[name] = own
        elif cls in EXPLOSIVE_CLASSES and name.startswith("assets/"):
            vibration_by_path[name] = tt.get("vibrationLevel", 0)
        elif cls in THROWER_CLASSES and name.startswith("assets/") and tt.get("prefabToThrow", {}).get("guid"):
            thrown[name] = paths.get(tt["prefabToThrow"]["guid"])
    items, vibration = {}, {}
    for sid, p in sorted(prefabs.items()):
        deploy = p.get("deploy")
        if deploy:
            short = deploy.rsplit("/", 1)[-1].removesuffix(".prefab")
            got = {"door": by_path.get(deploy, {}).get("door"), "upkeep": by_path.get(deploy, {}).get("upkeep", False),
                   "decay": decay_by_name.get(short.lower())}
            if got["door"] or got["upkeep"] or got["decay"]:
                items[sid] = got
        for path in (p.get("projectile"), thrown.get(p.get("entity")), deploy):
            level = vibration_by_path.get(path)
            if level:
                vibration[sid] = level
                break
    return {"items": items, "vibration": vibration}


def collect_loot(w, texts):
    """
    El botín de todas las fuentes y, aparte, `tables`: por clave, la firma de la tabla de cada prefab (para el test que
    las compara). `found` junta, por clave, {(sid, plano): (probabilidad, mínimo, máximo)}; `sources`, qué es cada clave.
    """
    found, sources, tables = {}, {}, {}
    ignored = collect_boxes(w, texts, found, sources, tables)
    if ignored:
        print(f"[rust] cajas que no se muestran: {', '.join(sorted(ignored))}", file=sys.stderr)
    npcs_out = collect_npcs(w, texts, found, sources, tables)
    if npcs_out:
        print(f"[rust] NPC con botín que no se muestran: {', '.join(sorted(npcs_out))}", file=sys.stderr)
    collect_collectibles(w, texts, found, sources)
    collect_openables(w, texts, found, sources)
    return loot_doc(found, sources), tables


def collect_shops(w, texts):
    orders, seen = [], set()
    for o, tt, _ in w.behaviours(VENDING_CLASSES):
        if not o.assets_file.name.startswith("BuildPlayer-AssetScene-monument"):
            continue  # el prefab suelto, o la ciudad flotante (todavía no es un monumento del mapa)
        root = w.root_name(o, tt)
        shop = next((k for frag, k in SHOP_MONUMENTS if frag in root), None)
        if shop is None:
            raise SystemExit(f"tienda en un monumento sin nombre: {root}")
        vo = w.follow(o, tt.get("vendingOrders"), "NPCVendingOrder")
        if vo is None:
            continue
        name = w.tree(vo)["m_Name"]
        if (shop, name) in seen:
            continue  # el mismo monumento en sus variantes (pueblo pesquero a/b/c)
        seen.add((shop, name))
        for od in w.tree(vo)["orders"]:
            if od["randomDetails"]["useRandom"]:
                continue  # precio al azar (el pozo de agua, el vendedor ambulante): no hay un número que mostrar
            item = w.shortname(vo, od["sellItem"], "objeto de tienda")
            currency = w.shortname(vo, od["currencyItem"], "moneda de tienda")
            if not item or not currency:
                continue
            orders.append({
                "shop": shop, "item": item, "amount": od["sellItemAmount"], "bp": bool(od["sellItemAsBP"]),
                "currency": currency, "price": od["currencyAmount"],
            })
    orders.sort(key=lambda r: (r["shop"], r["item"], r["bp"], r["price"]))
    shops = {k: {"en": text_of(texts, "en", t), "es": text_of(texts, "es", t)} for k, t in SHOP_TOKENS.items()
             if any(r["shop"] == k for r in orders)}
    return {"shops": shops, "orders": orders}


def collect(w=None):
    """
    Lee el juego y devuelve `{"loot": ..., "shops": ..., "mixing": ..., "deployables": ..., "tables": ...}` sin escribir nada (lo usan los tests, que le
    pasan un `World` ya abierto). `tables` no se escribe: es la firma de la tabla de cada prefab por clave, para
    comprobar que no se mezclan.
    """
    texts, _ = read_content()
    w = w or World()
    loot, tables = collect_loot(w, texts)
    shops = collect_shops(w, texts)
    mixing = collect_mixing(w)
    deployables = collect_deployables(w)
    w.report_unresolved()
    return {"loot": loot, "shops": shops, "mixing": mixing, "deployables": deployables, "tables": tables}


def main():
    got = collect()
    for name in ("loot", "shops", "mixing", "deployables"):
        (DATA / f"{name}.json").write_text(json.dumps(got[name], ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n_items = len(got["loot"]["items"])
    print(f"[rust] botín: {len(got['loot']['containers'])} cajas, {n_items} objetos; tiendas: {len(got['shops']['orders'])} órdenes; "
          f"mesa de mezcla: {len(got['mixing']['recipes'])} recetas; construcción: {len(got['deployables']['items'])} objetos")


if __name__ == "__main__":
    main()
