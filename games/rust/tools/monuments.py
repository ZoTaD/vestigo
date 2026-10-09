"""
Rust → los datos de la pestaña Monumentos (2026-10-09). Plan: docs/superpowers/plans/2026-10-09-rust-monumentos.md.

Lee la caché cruda del cliente (`games/rust/cache/world/`, `io/configs.json`, `video_frames/`; ver su README) y escribe:

  games/rust/data/monuments.json                 los monumentos que ve el jugador, la red de Power Trip y el complejo
                                                 de apartamentos
  games/rust/data/site/monuments-slugs-es.json   los slugs en español de las fichas (`{"monuments": {...}}`)
  site/public/rust/monuments/<id>.webp           un cuadro del video del menú, 640 × 360, para los que tienen video

Lo que el cliente no trae sale de la caché del servidor dedicado (`games/rust/cache/server/`, `extract_server.py`,
2026-10-09): qué cajas, NPC y objetos sueltos aparecen en cada monumento y cuántos (`spawns`), el alquiler de las
tiendas, los apartamentos y lo que dura un fusible de la red (`rent`, `apartments`, `powergrid.fuse*`). Además escribe

  games/rust/data/monuments-loot.json            el botín de cada caja y NPC que aparece en algún monumento (lo baja la
                                                 ficha cuando se abre una caja)

Uso, desde la raíz del repo (un par de segundos, no abre bundles):
    python games/rust/tools/monuments.py
"""
import json
import math
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from extract import slugify, text_of  # noqa: E402
from farming import Items, dump  # noqa: E402
from world import CONTAINERS, NPCS, container_base, name_of  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
CACHE = Path(os.environ.get("RUST_CACHE_DIR", ROOT / "games" / "rust" / "cache"))
DATA = ROOT / "games" / "rust" / "data"
PICS = ROOT / "site" / "public" / "rust" / "monuments"
MON = "assets/bundled/prefabs/autospawn/monument/"

# `MonumentType` (MonumentType.cs del decompilado).
TYPES = ["cave", "airport", "building", "town", "radtown", "lighthouse", "waterwell", "roadside", "mountain", "lake"]
# `TriggerRadiation.RadiationTier` (TriggerRadiation.cs): 4 es NONE.
RADIATION = ["minimal", "low", "medium", "high"]
CARDS = {1: "green", 2: "blue", 3: "red"}
RECYCLERS = {0: "green", 1: "yellow", 2: "red"}

# Las piezas que el juego suma a un monumento desde la escena de props (`assets/scenes/prefabs/<carpeta>/...`): de qué
# monumento es cada carpeta. Una carpeta que no está acá no suma a nadie.
SCENE_TO_MONUMENT = {
    "airfield": "large/airfield_1.prefab",
    "gas_station": "roadside/gas_station_1.prefab",
    "water treatment plant": "large/water_treatment_plant_1.prefab",
    "powerplant": "large/powerplant_1.prefab",
    "supermarket": "roadside/supermarket_1.prefab",
    "bandid_town": "medium/bandit_town.prefab",
    "launch site": "xlarge/launch_site_1.prefab",
    "trainyard": "large/trainyard_1.prefab",
    "nuclear missile silo": "medium/nuclear_missile_silo.prefab",
    "military tunnels": "large/military_tunnel_1.prefab",
    "sphere tank": "small/sphere_tank.prefab",
    "satellite dish": "small/satellite_dish.prefab",
    "junkyard": "medium/junkyard_1.prefab",
    "compound": "medium/compound.prefab",
}
# Prefabs sueltos que son de un solo monumento.
PREFAB_TO_MONUMENT = {
    "assets/prefabs/misc/monument/spheretankfuelswitch.prefab": "small/sphere_tank.prefab",
    "assets/prefabs/misc/monument/spheretankfuelswitch.small.prefab": "small/sphere_tank.prefab",
}
# El video del menú de cada monumento (`video_frames/<video>/`), cuando hay uno; el cuadro que mejor lo muestra.
PHOTOS = {
    "arctic_bases/arctic_research_base_a.prefab": ("arcticlabs", 1),
    "medium/bandit_town.prefab": ("banditcamp1", 1),
    "fishing_village/fishing_village_b.prefab": ("boatvillage1", 0),
    "military_bases/desert_military_base_a.prefab": ("desertbase1", 1),
    "small/sphere_tank.prefab": ("dome", 1),
    "harbor/ferry_terminal_1.prefab": ("ferryterminal", 0),
    "harbor/harbor_1.prefab": ("harbor1", 1),
    "lighthouse/lighthouse.prefab": ("lighthouse", 0),
    "medium/nuclear_missile_silo.prefab": ("nukesilo", 1),
    "offshore/oilrig_1.prefab": ("oilrig", 0),
    "offshore/oilrig_2.prefab": ("oilrig", 1),
    "medium/compound.prefab": ("outpost", 1),
    "small/stables_b.prefab": ("stables", 1),
    "small/stables_a.prefab": ("stables", 2),
    "underwater_lab/underwater_lab_a.prefab": ("moonpool", 1),
}
# La tienda de NPC de cada monumento en `shops.json` (`world.py`).
SHOPS = {
    "medium/compound.prefab": "outpost", "medium/bandit_town.prefab": "bandit", "small/stables_a.prefab": "ranch",
    "small/stables_b.prefab": "barn", "fishing_village/fishing_village_a.prefab": "fishing",
    "fishing_village/fishing_village_b.prefab": "fishing", "fishing_village/fishing_village_c.prefab": "fishing",
}


# --- lo que aparece (servidor) ---
# Los NPC que `world.NPCS` no lista (no tienen botín en `loot.json`): los científicos nuevos de las plataformas
# petroleras (`gen2/scientist2`, botín en `cache/server/npc_loot.json`) y los guardias de las zonas seguras (sin botín).
EXTRA_NPCS = {"scientist2": "scientist_rig", "npc_bandit_guard": "bandit_guard", "scientistnpc_peacekeeper": "peacekeeper"}
EXTRA_NPC_NAMES = {
    "scientist_rig": ("Oil Rig Scientist", "Científico de la plataforma petrolera"),
    "bandit_guard": "banditguard.name",
    "peacekeeper": ("Peacekeeper Scientist", "Científico pacificador"),
}
RIG_SCIENTIST = "assets/rust.ai/agents/npcplayer/humannpc/scientist/gen2/scientist2.prefab"
# Lo que se junta del suelo dentro del monumento: tarjetas, fragmentos de planos y barriles de diésel (el objeto que dan).
PICKUPS = {
    "keycard_green_pickup.entity": "keycard_green", "keycard_blue_pickup.entity": "keycard_blue",
    "keycard_red_pickup.entity": "keycard_red", "basicblueprintfragment_pickup.entity": "basicblueprintfragment",
    "basicblueprintfragment_singlepickup.entity": "basicblueprintfragment",
    "advancedblueprintfragment_pickup.entity": "advancedblueprintfragment", "diesel_collectable": "diesel_barrel",
}
# Los puntos que sostienen una sola entidad (`GenericSpawnPoint.ObjectSpawned` los apaga hasta que se va); un
# `RadialSpawnPoint` reparte en un radio y no se ocupa.
SINGLE_POINTS = ("GenericSpawnPoint", "SpaceCheckingSpawnPoint", "VehicleSpawnPoint")


def prefab_base(path: str) -> str:
    return path.rsplit("/", 1)[-1].removesuffix(".prefab")


def classify(path: str | None):
    """Qué es lo que aparece: ("loot", clave de loot.json), ("npc", clave), ("pickup", objeto) o None (minerales,
    troncos, vehículos, barricadas, decoración: no se muestran; un prefab que el manifiesto no conoce, tampoco)."""
    if not path:
        return None
    base = prefab_base(path)
    if container_base(path) in CONTAINERS:
        return ("loot", CONTAINERS[container_base(path)])
    if base in NPCS:
        return ("npc", NPCS[base])
    if base in EXTRA_NPCS:
        return ("npc", EXTRA_NPCS[base])
    if base in PICKUPS:
        return ("pickup", PICKUPS[base])
    return None


def group_full(g) -> int:
    """Cuántas entidades tiene un grupo lleno (`SpawnGroup.Spawn`): `maxPopulation`, sin pasar de los puntos que
    sostienen una sola; sin puntos no aparece nada."""
    pts = g.get("points") or {}
    single = sum(n for k, n in pts.items() if k in SINGLE_POINTS)
    if pts.get("RadialSpawnPoint"):
        return g["data"]["maxPopulation"]
    return min(g["data"]["maxPopulation"], single)


def tier_applies(mask: int, tier: int) -> bool:
    """`SpawnGroup.Tier` (flags de `MonumentTier`; -1 o 0 = en todos): si el grupo aparece en un monumento de ese tier."""
    return mask <= 0 or bool(mask & (1 << tier))


def tally(groups, singles, tier, nested, respawn, power=False, depth=0):
    """
    {(tipo, clave, con red): (seguro, máximo, esperado)} de un conjunto de grupos y entidades sueltas en un tier. Cada
    lugar de un grupo lleno elige un prefab por peso: lo esperado suma la probabilidad de cada opción; lo seguro, lo que
    dan todas las opciones a la vez (barril azul o amarillo: 1 barril siempre). Un prefab que trae sus propios grupos
    (las carpas de la base militar abandonada, las pilas de chatarra) se abre y suma lo suyo (`nested`).
    """
    acc: dict = {}

    def add(key, lo, hi, avg):
        a, b, c = acc.get(key, (0, 0, 0.0))
        acc[key] = (a + lo, b + hi, c + avg)

    def contrib(path, pw):
        what = classify(path)
        if what:
            return {(*what, pw): (1, 1, 1.0)}
        if path in nested and depth < 4:
            return tally(*nested[path], tier, nested, respawn, pw, depth + 1)
        return {}

    for g in groups:
        if not tier_applies(g["data"]["Tier"], tier):
            continue
        full = group_full(g)
        pw = power or "powergrid" in g["ctx"].get("go", "").lower()
        options = [(p["weight"], contrib((p.get("prefab") or {}).get("prefab"), pw)) for p in g["data"]["prefabs"] if p["weight"] > 0]
        total = sum(w for w, _ in options)
        if not full or total <= 0:
            continue
        # Un retraso infinito (el volcado lo guarda como texto, "inf") es un grupo que no se repone.
        lo_s, hi_s = float(g["data"]["respawnDelayMin"]), float(g["data"]["respawnDelayMax"])
        for key in {k for _, c in options for k in c}:
            vals = [c.get(key, (0, 0, 0.0)) for _, c in options]
            add(key, full * min(v[0] for v in vals), full * max(v[1] for v in vals),
                full * sum(w / total * c.get(key, (0, 0, 0.0))[2] for w, c in options))
            if depth == 0 and math.isfinite(hi_s) and hi_s > 0:
                r = respawn.setdefault(key, [math.inf, 0])
                r[0], r[1] = min(r[0], lo_s), max(r[1], hi_s)
    for path in singles:
        for key, v in contrib(path, power).items():
            add(key, *v)
    return acc


def spawns_of(groups, singles, tiers: list[int], nested=None):
    """
    Lo que aparece en un monumento, por cosa: `lo` lo seguro, `hi` lo máximo (todos los grupos donde puede salir,
    llenos) y `avg` lo esperado; `respawn`, los minutos entre reapariciones de las cajas (de los grupos del monumento). Si hay grupos
    que dependen del tier del monumento, se cuenta cada tier y queda el rango de todos (`by_tier`). `power` marca lo que
    sólo aparece con la red de Power Trip prendida (los grupos `Powergrid` de las salas de botín).
    """
    nested = nested or {}
    respawn: dict = {}
    per_tier = [tally(groups, singles, t, nested, respawn) for t in (tiers or [0, 1, 2])]
    keys = sorted({k for acc in per_tier for k in acc}, key=lambda k: (k[0], k[2], k[1]))
    out = {"loot": [], "npc": [], "pickup": []}
    for key in keys:
        vals = [acc.get(key, (0, 0, 0.0)) for acc in per_tier]
        row = {"id": key[1], "lo": min(v[0] for v in vals), "hi": max(v[1] for v in vals),
               "avg": round(sum(v[2] for v in vals) / len(vals), 1)}
        if key[2]:
            row["power"] = True
        out[key[0]].append(row)
    for rows in out.values():
        rows.sort(key=lambda r: (bool(r.get("power")), -r["avg"], r["id"]))
    # Cada cuánto se reponen las cajas (minutos, de los grupos del monumento que se reponen al menos cada minuto).
    waits = [r for k, r in respawn.items() if k[0] == "loot" and r[0] >= 60]
    out["respawn"] = [round(min(r[0] for r in waits) / 60), round(max(r[1] for r in waits) / 60)] if waits else None
    by_tier = any(g["data"]["Tier"] > 0 for g in groups)
    return out, by_tier


def load(rel):
    with open(CACHE / rel, encoding="utf-8") as f:
        return json.load(f)


def monument_of(root: str, known: set[str]) -> str | None:
    """El monumento (ruta corta, `large/airfield_1.prefab`) al que pertenece una pieza por su raíz, o None."""
    if root.startswith(MON):
        short = root[len(MON):]
        return short if short in known else None
    if root in PREFAB_TO_MONUMENT:
        return PREFAB_TO_MONUMENT[root]
    if root.startswith("assets/scenes/prefabs/"):
        folder = root[len("assets/scenes/prefabs/"):].split("/")[0]
        return SCENE_TO_MONUMENT.get(folder)
    return None


def visible(m) -> bool:
    """Los que el jugador ve en el mapa con nombre: fuera cuevas, pozos, montañas, túneles del tren y piezas de desarrollo
    (todos esos están fuera de `autospawn/monument/` o no se muestran en el mapa)."""
    name = (m.get("name") or {}).get("en")
    return bool(name and m["shouldDisplayOnMap"] and m["root"].startswith(MON))


def tiers_of(mask: int) -> list[int]:
    return [] if mask < 0 else [i for i in range(3) if mask & (1 << i)]


def power_kind(go: str) -> str:
    g = go.lower()
    if "controlroomloot" in g or "loot_room" in g or "powergrid_hidden" in g:
        return "lootroom"
    if "lootfridge" in g:
        return "fridge"
    return "systems"


def build():
    raw = load("world/monuments.json")
    mons = [m for m in raw if visible(m)]
    known = {m["root"][len(MON):] for m in mons}
    cls = lambda n: load(f"world/classes/{n}.json")
    per: dict[str, dict] = defaultdict(lambda: {"cards": Counter(), "recyclers": Counter(), "fuses": 0, "radiation": -1, "power": Counter()})

    seen = set()

    def owner(x):
        """El monumento de la pieza, o None. Las piezas de la escena de props (`assets/scenes/prefabs/...`) vienen dos
        veces: dentro del prefab del monumento y sueltas en su escena, en la misma posición local; se cuentan una vez
        (sin esto, el patio ferroviario sumaba 5 lectores verdes en vez de 3 y la central 2 recicladoras rojas)."""
        k = monument_of(x["ctx"].get("root", ""), known)
        if not k:
            return None
        sig = (k, x["ctx"].get("go"), tuple(round(v, 1) for v in x["ctx"].get("local") or ()))
        if sig in seen:
            return None
        seen.add(sig)
        return k

    for x in cls("CardReader"):
        k = owner(x)
        if k and x["data"]["accessLevel"] in CARDS:
            per[k]["cards"][CARDS[x["data"]["accessLevel"]]] += 1
    for x in cls("Recycler"):
        k = owner(x)
        if k:
            per[k]["recyclers"][RECYCLERS.get(x["data"]["recyclerType"], "green")] += 1
    for x in cls("ItemBasedFlowRestrictor"):
        k = owner(x)
        if k:
            per[k]["fuses"] += x["data"].get("numSlots", 1)
    for x in cls("TriggerRadiation"):
        k = owner(x)
        t = x["data"].get("radiationTier", 4)
        if k and t < len(RADIATION):
            per[k]["radiation"] = max(per[k]["radiation"], t)
    for x in cls("ElectricGenerator"):
        s = x["data"].get("requiredPowergridStage") or 0
        if not s:
            continue
        k = owner(x)
        if k:
            per[k]["power"][(s, power_kind(x["ctx"].get("go", "")))] += 1

    # Lo que aparece en cada monumento (servidor). Sólo los grupos de las escenas de monumento: las piezas de
    # `assets/scenes/prefabs/` y los `*_ai.prefab` de la escena de props ya están copiados adentro de la escena.
    spawners: dict[str, list] = defaultdict(list)
    singles: dict[str, list] = defaultdict(list)
    # Los prefabs que no son monumento pero traen grupos (carpas, pilas de chatarra) se abren cuando un grupo los elige.
    nested: dict[str, tuple] = defaultdict(lambda: ([], []))
    for g in load("server/spawners.json"):
        root = g["ctx"].get("root", "")
        if root.startswith(MON):
            spawners[root[len(MON):]].append(g)
        elif root.startswith("assets/"):
            nested[root][0].append(g)
    for x in load("server/individual.json"):
        root = x["ctx"].get("root", "")
        path = (x["data"].get("entityPrefab") or {}).get("prefab")
        if root.startswith(MON):
            singles[root[len(MON):]].append(path)
        elif root.startswith("assets/"):
            nested[root][1].append(path)
    nested = dict(nested)

    with open(DATA / "items.json", encoding="utf-8") as f:
        items = Items(json.load(f)["items"], load("farming/items.json") + load("io/items.json"))

    # Un monumento por nombre: las variantes (Harbor 1 y 2, los cuatro laboratorios) se juntan en una ficha.
    groups: dict[str, list] = defaultdict(list)
    for m in mons:
        groups[m["name"]["en"].strip()].append(m)
    out = []
    for en, ms in sorted(groups.items()):
        first = ms[0]
        keys = [m["root"][len(MON):] for m in ms]
        agg = {"cards": Counter(), "recyclers": Counter(), "fuses": 0, "radiation": -1, "power": Counter()}
        for k in keys[:1]:  # las variantes repiten lo mismo: se cuenta la primera
            p = per.get(k)
            if p:
                agg = p
        size = first["monument"][0]["size"] if first.get("monument") else None
        photo = next((PHOTOS[k] for k in keys if k in PHOTOS), None)
        mid = slugify(en)
        spawns, by_tier = spawns_of(spawners.get(keys[0], []), singles.get(keys[0], []), tiers_of(first["tier"]), nested)
        for row in spawns["pickup"]:
            row["item"] = items.ref(row.pop("id"))
        out.append({
            "id": mid,
            "slugEs": slugify(first["name"]["es"] or en),
            "key": keys[0],
            "name": {"en": en, "es": first["name"]["es"]},
            "type": TYPES[first["type"]] if 0 <= first["type"] < len(TYPES) else "building",
            "tiers": tiers_of(first["tier"]),
            "minWorldSize": first["minWorldSize"] or None,
            "safeZone": bool(first["safeZone"]),
            "size": [round(size["x"]), round(size["z"])] if size and size["x"] > 0 else None,
            "variants": len(ms),
            "photo": mid if photo else None,
            "_photo": photo,
            "cards": dict(agg["cards"]),
            "recyclers": dict(agg["recyclers"]),
            "fuses": agg["fuses"],
            "radiation": RADIATION[agg["radiation"]] if agg["radiation"] >= 0 else None,
            "power": sorted(({"stage": s, "what": w, "n": n} for (s, w), n in agg["power"].items()), key=lambda x: (x["stage"], x["what"])),
            "shop": next((SHOPS[k] for k in keys if k in SHOPS), None),
            "apartments": "apartments_complex" in keys[0],
            "spawns": spawns,
            "spawnsByTier": by_tier,
        })

    stages = [s["requiredFuses"] for s in load("io/configs.json")["PowergridStageConfig"][0]["data"]["stages"]]
    boxes = sorted({len(x["data"]["fuses"]) for x in load("io/configs.json")["PowergridFuseBox"] if "data" in x}, reverse=True)
    # La caja de la central acepta `fuse.heavy.item` (GameObject), que es el objeto `fuse.highgrade` ("Heavy Fuse").
    heavy = items.ref("fuse.highgrade")
    powergrid = {
        "stages": stages,
        "boxes": boxes,
        "fuse": heavy,
        "byStage": [{"stage": i + 1, "fuses": f, "monuments": [m["id"] for m in out if any(p["stage"] == i + 1 for p in m["power"])]} for i, f in enumerate(stages)],
    }
    # Lo que dura un fusible en la central (`PowergridManager.ServerFuseDeteriorationTick`, convars `powergrid.*` del
    # servidor): los `fuseFullDecayCount` más gastados duran `fuseLifespanSeconds` con `fuseDecayHighPop` jugadores o más
    # (con `fuseDecayLowPop` o menos, a `fuseDecayLowPopScale` de esa velocidad); el resto se gasta a una fracción al azar
    # entre `fuseSlowDecayFractionMin` y `Max`.
    code = load("server/code.json")
    pg = code["Powergrid"]
    powergrid["wear"] = {
        "seconds": pg["fuseLifespanSeconds"], "worst": pg["fuseFullDecayCount"],
        "slow": [pg["fuseSlowDecayFractionMin"], pg["fuseSlowDecayFractionMax"]],
        "pop": [pg["fuseDecayLowPop"], pg["fuseDecayHighPop"]], "lowPopScale": pg["fuseDecayLowPopScale"],
    }
    rooms = Counter((x["data"]["Size"], x["data"]["PurchaseCost"], x["data"]["MinimumRent"]) for x in cls("ApartmentRoom"))
    tax = {}
    for x in cls("ItemModApartmentTax"):
        sid = items.sid_of_go(x["ctx"]["go"])
        if sid:
            tax[sid] = x["data"]["ScrapPerStack"]
    apartments = {
        "rooms": [{"size": s, "cost": c, "rent": r} for (s, c, r) in sorted(rooms)],
        "tax": [{"item": items.ref(sid), "scrap": v} for sid, v in sorted(tax.items(), key=lambda kv: (-kv[1], kv[0]))],
        "shops": sum(1 for x in cls("RentableShop") if x["ctx"].get("root", "").endswith("apartments_complex_1.prefab")),
        "scrap": items.ref("scrap"),
    }
    # Los costos que el servidor pone en código (`ConVar.ApartmentCommands`, `RentableShop`): horas de alquiler gratis al
    # entrar, la llave maestra del guardia, cuánto pesa el impuesto por recursos (`rentscaling`: con 0, el alquiler es el
    # mínimo del cuarto: `ApartmentRoom.GetDailyUpkeepCost` = máx(mínimo, impuesto × rentscaling)) y el alquiler de una
    # tienda: abrirla cuesta `InitialScrapFee` + `InitialRentHoursRequired` horas de `ScrapPerHourRent`, y quitársela a
    # otro jugador sube el multiplicador en 1 (`Server_OpenStore`), que también multiplica el alquiler por hora.
    ap, shop = code["ConVar.ApartmentCommands"], code["RentableShop"]
    apartments["freeHours"] = ap["apartmentfreerenthours"]
    apartments["masterKey"] = ap["masterkeyprice"]
    apartments["taxScale"] = ap["rentscaling"]
    apartments["evictHours"] = round(ap["apartmentevictiondelay"] / 3600)
    apartments["shopRent"] = {
        "fee": shop["InitialScrapFee"], "perHour": shop["ScrapPerHourRent"], "hours": shop["InitialRentHoursRequired"],
        "protectHours": shop["ProtectionFromTakeoverHours"],
    }
    texts = {lang: load(f"localization/{lang}/engine.json") for lang in ("en", "es-es")}
    room_names = {
        1: ("apartment_npc.want_small", "Basement"), 2: ("apartment_npc.want_medium", "Standard"), 3: ("apartment_npc.want_large", "Penthouse"),
    }
    for r in apartments["rooms"]:
        tok, fb = room_names.get(r["size"], (None, str(r["size"])))
        en = (text_of(texts, "en", tok) or fb).split(" (")[0]
        es = (text_of(texts, "es-es", tok) or "").split(" (")[0] or None
        r["name"] = {"en": en, "es": es}
    # Lo que vende la tienda de NPC de cada monumento (`shops.json` de world.py), con nombre y enlace de cada objeto.
    with open(DATA / "shops.json", encoding="utf-8") as f:
        sh = json.load(f)
    shops = {key: {"name": sh["shops"][key], "orders": [
        {"item": items.ref(o["item"]), "amount": o["amount"], "bp": o["bp"], "currency": items.ref(o["currency"]), "price": o["price"]}
        for o in sh["orders"] if o["shop"] == key
    ]} for key in sorted({m["shop"] for m in out if m["shop"]})}
    sources, loot = loot_tables(out, items, texts)
    doc = {"monuments": out, "powergrid": powergrid, "apartments": apartments, "shops": shops, "sources": sources}
    slugs = {"monuments": {m["id"]: m["slugEs"] for m in out if m["slugEs"] != m["id"]}}
    return doc, slugs, loot


def loot_tables(mons, items, texts):
    """
    Los nombres de cada caja y NPC que aparece en algún monumento (`sources`, en monuments.json) y su botín
    (`monuments-loot.json`: por fuente, filas `[objeto, probabilidad, mínimo, máximo, plano]` de la más probable a la
    menos, más los nombres y slugs de los objetos). El botín es el de `loot.json` (world.py); el del científico de las
    plataformas, el de `cache/server/npc_loot.json`.
    """
    with open(DATA / "loot.json", encoding="utf-8") as f:
        lj = json.load(f)
    used = sorted({(kind, r["id"]) for m in mons for kind in ("loot", "npc") for r in m["spawns"][kind]})
    sources, tables = {}, {}
    for kind, key in used:
        src = lj["containers"].get(key)
        if src:
            sources[key] = {"en": src["en"], "es": src["es"], "kind": kind, "event": src.get("event")}
        elif key in EXTRA_NPC_NAMES:
            sources[key] = {**name_of({"en": texts["en"], "es": texts["es-es"]}, EXTRA_NPC_NAMES[key]), "kind": kind,
                            "event": None}
        else:
            raise SystemExit(f"[rust] {key} aparece en un monumento y no tiene nombre (loot.json ni EXTRA_NPC_NAMES)")
    for sid, rows in lj["items"].items():
        for r in rows:
            if r["c"] in sources:
                tables.setdefault(r["c"], []).append([sid, r["chance"], r["min"], r["max"], r["bp"]])
    if "scientist_rig" in sources:
        rig = load("server/npc_loot.json").get(RIG_SCIENTIST) or []
        tables["scientist_rig"] = [[r["sid"], r["chance"], r["min"], r["max"], r["bp"]] for r in rig]
    for rows in tables.values():
        rows.sort(key=lambda r: (-r[1], r[0], r[4]))
    ids = sorted({r[0] for rows in tables.values() for r in rows})
    refs = {sid: {"slug": items.ref(sid)["slug"], "name": items.ref(sid)["name"]} for sid in ids}
    for key, src in sources.items():
        src["loot"] = bool(tables.get(key))
    return sources, {"items": refs, "tables": dict(sorted(tables.items()))}


def write_photos(mons):
    from PIL import Image
    PICS.mkdir(parents=True, exist_ok=True)
    for m in mons:
        if not m["_photo"]:
            continue
        dst = PICS / f"{m['id']}.webp"
        if dst.exists():
            continue
        video, i = m["_photo"]
        frames = sorted((CACHE / "video_frames" / video).iterdir())
        im = Image.open(frames[min(i, len(frames) - 1)]).convert("RGB")
        w, h = im.size
        top = max(0, (h - w * 9 // 16) // 2)
        im = im.crop((0, top, w, top + w * 9 // 16)).resize((640, 360), Image.LANCZOS)
        im.save(dst, "WEBP", quality=72, method=6)


def main():
    doc, slugs, loot = build()
    write_photos(doc["monuments"])
    for m in doc["monuments"]:
        m.pop("_photo")
    dump(DATA / "monuments.json", doc)
    dump(DATA / "monuments-loot.json", loot)
    dump(DATA / "site" / "monuments-slugs-es.json", slugs)
    print(f"[rust] monumentos: {len(doc['monuments'])}, red eléctrica en {sum(1 for m in doc['monuments'] if m['power'])}, "
          f"con cajas {sum(1 for m in doc['monuments'] if m['spawns']['loot'])}, con NPC "
          f"{sum(1 for m in doc['monuments'] if m['spawns']['npc'])}; {len(loot['tables'])} tablas de botín")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
