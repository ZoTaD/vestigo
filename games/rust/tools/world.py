"""
El botín de cada caja y las tiendas de cada monumento de Rust (2026-10-05). Diseño: docs/design/2026-10-05-rust.md.

Lee las escenas del juego (`Bundles/shared/assetscenes.bundle`) junto con `content.bundle` (los `LootSpawn` y los
`NPCVendingOrder`) e `items.preload.bundle` (los objetos), porque las referencias cruzan de un archivo a otro.
Escribe:
  - `games/rust/data/loot.json`: por objeto, en qué cajas aparece, con la probabilidad de que una caja traiga al menos
    uno y la cantidad;
  - `games/rust/data/shops.json`: qué vende cada tienda de monumento (Outpost, Bandit Camp, pueblo pesquero, rancho,
    granero) y a qué precio. El pozo de agua tiene tienda, pero todas sus órdenes son de precio al azar: no entra.

La cuenta del botín sigue `LootContainer.PopulateLoot` y `LootSpawn.SpawnIntoContainer` del juego: si la caja tiene
ranuras (`LootSpawnSlots`) se tiran ésas, cada una `numberToSpawn` veces con su probabilidad; si no, `lootDefinition`
`maxDefinitionsToSpawn` veces. Un `LootSpawn` con subcategorías elige una por peso; uno sin, da todos sus objetos. Es
la probabilidad por caja, no por partida: el servidor también decide cuántas cajas hay.

Uso, desde la raíz del repo (tarda ~1 min: abrir los tres bundles y seguir las referencias):
    python games/rust/tools/world.py
"""
import json
import sys
from pathlib import Path

import UnityPy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import BUNDLES, DATA, read_content, text_of  # noqa: E402

# Las cajas que se muestran, por el nombre del prefab sin carpeta ni extensión. Varios prefabs que el jugador ve como
# la misma caja (los barriles azul y amarillo, las cajas de los vagones) comparten clave; la ficha se queda con la
# probabilidad más alta. Lo que no está acá no se muestra: el extractor lista lo que deja afuera.
CONTAINERS = {
    "crate_elite": "elite",
    "crate_normal": "military", "wagon_crate_normal": "military",
    "crate_normal_2": "crate", "wagon_crate_normal_2": "crate",
    "crate_basic": "basic",
    "crate_tools": "tools",
    # La caja médica y la de comida que se ven en los monumentos son `crate_normal_2_medical` y `crate_normal_2_food`
    # (y sus copias en los vagones); `crate_medical` y `crate_food_*` son las de los laboratorios submarinos.
    "crate_medical": "medical", "crate_normal_2_medical": "medical", "wagon_crate_normal_2_medical": "medical",
    "crate_food_1": "food", "crate_food_2": "food", "foodbox": "food",
    "crate_normal_2_food": "food", "wagon_crate_normal_2_food": "food",
    "crate_ammunition": "ammo",
    "crate_fuel": "fuel",
    "crate_mine": "mine", "minecart": "mine",
    "tech_parts_1": "tech", "tech_parts_2": "tech",
    "vehicle_parts": "vehicle", "vehicle_parts_advanced": "vehicle",
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
    "codelockedhackablecrate": "locked", "codelockedhackablecrate_oilrig": "locked",
    "supply_drop": "supply",
}
# Los nombres de las cajas. Los que el juego tiene en engine.json van por su token (`lootfood`, `supplydrop`); los demás,
# escritos acá: el juego no los nombra en ningún texto.
CONTAINER_NAMES = {
    "elite": ("Elite Crate", "Caja de élite"),
    "military": ("Military Crate", "Caja militar"),
    "crate": ("Crate", "Caja"),
    "basic": ("Basic Crate", "Caja básica"),
    "tools": ("Toolbox", "Caja de herramientas"),
    "medical": ("Medical Crate", "Caja médica"),
    "food": "lootfood",
    "ammo": ("Ammo Crate", "Caja de munición"),
    "fuel": ("Fuel Crate", "Caja de combustible"),
    "mine": ("Mine Crate", "Caja de mina"),
    "tech": ("Tech Parts Crate", "Caja de componentes"),
    "vehicle": ("Vehicle Parts Crate", "Caja de piezas de vehículo"),
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
}
LOOT_CLASSES = {"LootContainer", "LockedByEntCrate", "HackableLockedCrate", "SupplyDrop", "FreeableLootContainer"}
# Las tiendas, por el prefab del monumento donde está la máquina. La clave sale de la primera coincidencia; el nombre,
# del token oficial (engine.json).
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

    def file_of(self, af, fid):
        return af.name if fid == 0 else af.externals[fid - 1].path.split("/")[-1]

    def obj(self, owner, ref):
        """El objeto al que apunta `ref` ({m_FileID, m_PathID}) desde `owner`, o `None`."""
        if not ref or not ref.get("m_PathID"):
            return None
        af = self.files.get(self.file_of(owner.assets_file, ref["m_FileID"]))
        return af.objects.get(ref["m_PathID"]) if af else None

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
                name = names[key] = self.file_of(af, fid)
            cls = self.scripts.get((name, pid))
            if cls in classes:
                yield o, self.tree(o), cls

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

    def shortname(self, owner, ref):
        o = self.obj(owner, ref)
        return self.tree(o)["shortname"] if o else None

    def spawn_tree(self, owner, ref):
        """
        Un `LootSpawn` como árbol simple, con las referencias ya seguidas (cada una desde el archivo donde vive su
        dueño): `{"subSpawn": [{"weight", "category": árbol | None}], "items": [{"sid", "amount", "isBP", "maxAmount"}]}`.
        `None` si `ref` no apunta a nada. Se arma una vez por `LootSpawn` (muchas cajas comparten subárboles).
        `extraSpawns` todavía no se cuenta: si alguna subcategoría lo trae, avisa por stderr para revisarlo.
        """
        o = self.obj(owner, ref)
        if o is None:
            return None
        key = (o.assets_file.name, o.path_id)
        if key not in self.spawns:
            t = self.tree(o)
            if any(s.get("extraSpawns") for s in t["subSpawn"]):
                print(f"[rust] {t['m_Name']}: subcategorías con extraSpawns, sin contar", file=sys.stderr)
            self.spawns[key] = {
                "subSpawn": [{"weight": s["weight"], "category": self.spawn_tree(o, s["category"])} for s in t["subSpawn"]],
                "items": [
                    {"sid": self.shortname(o, i["itemDef"]), "amount": i["amount"], "isBP": i["isBP"], "maxAmount": i["maxAmount"]}
                    for i in t["items"]
                ],
            }
        return self.spawns[key]


def roll_chances(spawn, resolve):
    """
    Una tirada de un `LootSpawn`: {(shortname, es_plano): probabilidad de que salga}. `spawn` es el árbol de
    `World.spawn_tree` (o `None`, que no da nada); `resolve(x)` sigue una subcategoría. Con árboles ya resueltos (lo que
    arma `World.spawn_tree`, y los de los tests) es la identidad.
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
            for k, v in roll_chances(child, resolve).items():
                out[k] = out.get(k, 0.0) + p * v
        return out
    for it in spawn.get("items") or []:
        if it["sid"]:
            out[(it["sid"], bool(it["isBP"]))] = 1.0
    return out


def amounts(spawn, resolve, acc=None):
    """{(shortname, es_plano): (mínimo, máximo)} de una tirada: la cantidad de cada ítem en las hojas del árbol."""
    acc = {} if acc is None else acc
    if not spawn:
        return acc
    for s in spawn.get("subSpawn") or []:
        amounts(resolve(s["category"]), resolve, acc)
    for it in spawn.get("items") or []:
        sid = it["sid"]
        if not sid:
            continue
        lo = max(1, int(it["amount"]))
        hi = max(lo, int(it["maxAmount"])) if it["maxAmount"] > 0 else lo
        key = (sid, bool(it["isBP"]))
        old = acc.get(key)
        acc[key] = (min(lo, old[0]), max(hi, old[1])) if old else (lo, hi)
    return acc


def container_chances(tt, resolve):
    """
    {(shortname, es_plano): (probabilidad de que la caja traiga al menos uno, mínimo, máximo)}. Cada tirada es
    independiente: P = 1 − Π (1 − p_tirada).
    """
    rolls = []  # (spawn, probabilidad de que la tirada ocurra)
    slots = tt.get("LootSpawnSlots") or []
    if slots:
        for s in slots:
            rolls += [(resolve(s["definition"]), s["probability"])] * s["numberToSpawn"]
    elif tt.get("lootDefinition"):
        rolls += [(resolve(tt["lootDefinition"]), 1.0)] * tt["maxDefinitionsToSpawn"]
    miss, amt = {}, {}
    for spawn, p_roll in rolls:
        for key, p in roll_chances(spawn, resolve).items():
            miss[key] = miss.get(key, 1.0) * (1 - min(1.0, p_roll) * p)
        amounts(spawn, resolve, amt)
    out = {k: (1 - m, *amt[k]) for k, m in miss.items() if m < 1}
    if tt.get("scrapAmount"):
        out[("scrap", False)] = (1.0, tt["scrapAmount"], tt["scrapAmount"])
    return out


def collect_loot(w, texts):
    by_key, ignored = {}, set()
    for o, tt, _ in w.behaviours(LOOT_CLASSES):
        path = w.go_name(o, tt)
        if not path.startswith("assets/"):
            continue  # una instancia dentro de una escena: el prefab ya cuenta
        base = path.rsplit("/", 1)[-1].removesuffix(".prefab").removesuffix(".entity")
        key = CONTAINERS.get(base)
        if key is None:
            ignored.add(base)
            continue
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
        for item_key, (p, lo, hi) in container_chances(resolved, lambda x: x).items():
            prev = by_key.setdefault(key, {}).get(item_key)
            if prev is None or p > prev[0]:
                by_key[key][item_key] = (p, lo, hi)
    if ignored:
        print(f"[rust] cajas que no se muestran: {', '.join(sorted(ignored))}", file=sys.stderr)

    items = {}
    for key, found in by_key.items():
        for (sid, bp), (p, lo, hi) in found.items():
            items.setdefault(sid, []).append({"c": key, "chance": round(p, 4), "min": lo, "max": hi, "bp": bp})
    for rows in items.values():
        rows.sort(key=lambda r: (-r["chance"], r["c"], r["bp"]))
    names = {}
    for key in sorted(by_key):
        n = CONTAINER_NAMES[key]
        names[key] = {"en": n[0], "es": n[1]} if isinstance(n, tuple) else {"en": text_of(texts, "en", n), "es": text_of(texts, "es", n)}
    return {"containers": names, "items": dict(sorted(items.items()))}


def collect_shops(w, texts):
    orders, seen = [], set()
    for o, tt, _ in w.behaviours(VENDING_CLASSES):
        if not o.assets_file.name.startswith("BuildPlayer-AssetScene-monument"):
            continue  # el prefab suelto, o la ciudad flotante (todavía no es un monumento del mapa)
        root = w.root_name(o, tt)
        shop = next((k for frag, k in SHOP_MONUMENTS if frag in root), None)
        if shop is None:
            raise SystemExit(f"tienda en un monumento sin nombre: {root}")
        vo = w.obj(o, tt.get("vendingOrders"))
        if vo is None:
            continue
        name = w.tree(vo)["m_Name"]
        if (shop, name) in seen:
            continue  # el mismo monumento en sus variantes (pueblo pesquero a/b/c, pozo a…e)
        seen.add((shop, name))
        for od in w.tree(vo)["orders"]:
            if od["randomDetails"]["useRandom"]:
                continue  # precio al azar (vendedor ambulante): no hay un número que mostrar
            item, currency = w.shortname(vo, od["sellItem"]), w.shortname(vo, od["currencyItem"])
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


def collect():
    """Lee el juego y devuelve `{"loot": ..., "shops": ...}` sin escribir nada (lo usan los tests)."""
    texts, _ = read_content()
    w = World()
    return {"loot": collect_loot(w, texts), "shops": collect_shops(w, texts)}


def main():
    got = collect()
    for name in ("loot", "shops"):
        (DATA / f"{name}.json").write_text(json.dumps(got[name], ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n_items = len(got["loot"]["items"])
    print(f"[rust] botín: {len(got['loot']['containers'])} cajas, {n_items} objetos; tiendas: {len(got['shops']['orders'])} órdenes")


if __name__ == "__main__":
    main()
