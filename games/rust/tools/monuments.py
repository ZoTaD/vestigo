"""
Rust → los datos de la pestaña Monumentos (2026-10-09). Plan: docs/superpowers/plans/2026-10-09-rust-monumentos.md.

Lee la caché cruda del cliente (`games/rust/cache/world/`, `io/configs.json`, `video_frames/`; ver su README) y escribe:

  games/rust/data/monuments.json                 los monumentos que ve el jugador, la red de Power Trip y el complejo
                                                 de apartamentos
  games/rust/data/site/monuments-slugs-es.json   los slugs en español de las fichas (`{"monuments": {...}}`)
  site/public/rust/monuments/<id>.webp           un cuadro del video del menú, 640 × 360, para los que tienen video

Lo que el cliente no trae (qué cajas y NPC aparecen en cada uno, el alquiler de las tiendas, el mantenimiento de los
monumentos que mantienen los jugadores) es del servidor: no se inventa, no sale.

Uso, desde la raíz del repo (un par de segundos, no abre bundles):
    python games/rust/tools/monuments.py
"""
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from extract import slugify, text_of  # noqa: E402
from farming import Items, dump  # noqa: E402

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
    doc = {"monuments": out, "powergrid": powergrid, "apartments": apartments, "shops": shops}
    slugs = {"monuments": {m["id"]: m["slugEs"] for m in out if m["slugEs"] != m["id"]}}
    return doc, slugs


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
    doc, slugs = build()
    write_photos(doc["monuments"])
    for m in doc["monuments"]:
        m.pop("_photo")
    dump(DATA / "monuments.json", doc)
    dump(DATA / "site" / "monuments-slugs-es.json", slugs)
    print(f"[rust] monumentos: {len(doc['monuments'])}, red eléctrica en {sum(1 for m in doc['monuments'] if m['power'])}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
