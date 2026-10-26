"""Datos del planificador de granja de Stardew Valley: las granjas y lo que se puede colocar.

Uso: python games/stardew/tools/planner_data.py

Lee los mapas volcados por `dump.sh MapDump` (`games/stardew/raw/maps/`) y los JSON que ya escribieron `site_data.py`,
`crops_data.py`, `more_data.py` y `farm_data.py`, y escribe `games/stardew/data/planner.json`. Las reglas de cada
casilla salen del código del juego 1.6.15 (diseño: docs/superpowers/specs/2026-10-26-stardew-planificador-design.md).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sdv  # noqa: E402
import site_data  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"
MAPAS = sdv.RAW / "maps"

# Cada tipo de granja: mapa, clave de `Data/Locations` (para el nombre) y su `Game1.whichFarm`.
GRANJAS = [
    ("Farm", "Farm_Standard", 0), ("Farm_Fishing", "Farm_Riverland", 1), ("Farm_Foraging", "Farm_Forest", 2),
    ("Farm_Mining", "Farm_Hilltop", 3), ("Farm_Combat", "Farm_Wilderness", 4), ("Farm_FourCorners", "Farm_FourCorners", 5),
    ("Farm_Island", "Farm_Beach", 6), ("Farm_Ranching", "Farm_MeadowlandsFarm", 7),
]

# Lo que se puede hacer en cada casilla, un bit por regla; la casilla va como un carácter de `_ALFABETO`.
AZADA = 1  # cultivos: `Diggable` en Back, transitable y sin agua
OBJETO = 2  # objetos sólidos: `isTilePlaceable` sin `NoFurniture` y transitable
PISO = 4  # caminos y pisos (`itemIsPassable`): como OBJETO, pero `NoFurniture` T no los frena al aire libre
EDIFICIO = 8  # `GameLocation.isBuildable`
SIN_ASPERSOR = 16  # `NoSprinklers` T en Back
ARBOL = 32  # frutales: transitable, sin agua y sin `NoSpawn` de árboles (salvo `CanPlantTrees` T)
_ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

# Las capas que se ven; `Paths` marca dónde nacen árboles y pasto al crear la partida y no se dibuja.
CAPAS = ["Back", "Back2", "Buildings", "Buildings2", "Front", "AlwaysFront", "AlwaysFront2", "AlwaysFront3"]

# `Object.GetBaseRadiusForSprinkler`; la boquilla de presión (O)915 suma 1 (`GetModifiedRadiusForSprinkler`).
ASPERSORES = {"599": 0, "621": 1, "645": 2}
BOQUILLA = "915"
# `Utility.findCloseFlower(…, 5)`: la colmena busca flores a distancia Manhattan ≤ 5.
COLMENA, RADIO_COLMENA = "(BC)10", 5
# `JunimoHut.cropHarvestRadius`.
RADIO_JUNIMO = 8
# Lo que va en Máquinas: lo que se fabrica y se deja en la granja (los cofres, las máquinas y la luz).
MAQUINAS = [
    "(BC)130", "(BC)BigChest", "(BC)232", "(BC)BigStoneChest", "(BC)10", "(BC)12", "(BC)163", "(BC)15",
    "(BC)Dehydrator", "(BC)16", "(BC)24", "(BC)17", "(BC)19", "(BC)25", "(BC)20", "(BC)13", "(BC)HeavyFurnace",
    "(BC)114", "(BC)154", "(BC)DeluxeWormBin", "(BC)BaitMaker", "(BC)FishSmoker", "(BC)21", "(BC)9",
    "(BC)MushroomLog", "(BC)231", "(BC)90", "(BC)182", "(BC)156", "(BC)158", "(BC)62", "(BC)238", "(BC)239",
    "(BC)275", "(BC)152", "(BC)153",
]
CERCAS = ["322", "323", "324", "298", "325"]
# Los edificios que vienen con la granja (`Farm.AddDefaultBuildings`) y el dibujo de cada uno.
FIJOS = ["Farmhouse", "Greenhouse", "Shipping Bin", "Pet Bowl"]


def _props(tile) -> dict:
    return tile[2] if tile and len(tile) > 2 else {}


def _si(v: str | None) -> bool:
    return v is not None and v.lower() in ("t", "true")


def mapa(nombre: str) -> dict:
    return json.loads((MAPAS / f"{nombre}.json").read_text(encoding="utf-8"))


def reglas(m: dict) -> list[int]:
    """El bit de reglas de cada casilla, fila por fila."""
    back, edif = m["layers"]["Back"], m["layers"]["Buildings"]
    out = []
    for i, t in enumerate(back["t"]):
        p = _props(t)
        b = edif["t"][i]
        # `isTilePassable`: Back sin `Passable`; Buildings vacío o con `Shadow`/`Passable`.
        pasa = t is not None and "Passable" not in p and (b is None or "Shadow" in _props(b) or "Passable" in _props(b))
        agua = "Water" in p
        bits = 0
        if pasa and not agua:
            sin_muebles = p.get("NoFurniture")
            if sin_muebles is None:
                bits |= OBJETO
            if sin_muebles != "total":
                bits |= PISO
            if "Diggable" in p:
                bits |= AZADA
            construible = p.get("Buildable", "")
            if _si(construible) or ("Diggable" in p and construible.lower() != "f"):
                bits |= EDIFICIO
            no_nace = p.get("NoSpawn", "").lower()
            if no_nace not in ("all", "tree", "trees", "t", "true") or _si(p.get("CanPlantTrees")):
                bits |= ARBOL
        if _si(p.get("NoSprinklers")):
            bits |= SIN_ASPERSOR
        out.append(bits)
    return out


def _vec(m: dict, prop: str, defecto: tuple[int, int]) -> tuple[int, int]:
    v = m.get("props", {}).get(prop)
    if not v:
        return defecto
    x, y = v.split()[:2]
    return int(x), int(y)


def fijos(m: dict, which: int) -> list[dict]:
    """Casa, invernadero, caja de envíos y cuenco donde los pone `Farm.AddDefaultBuildings` (propiedad del mapa o el
    valor por defecto del código)."""
    entrada = _vec(m, "FarmHouseEntry", (64, 15))
    invernadero = _vec(m, "GreenhouseLocation", {5: (36, 29), 6: (14, 14)}.get(which, (25, 10)))
    lugares = {
        "Farmhouse": (entrada[0] - 5, entrada[1] - 3), "Greenhouse": invernadero,
        "Shipping Bin": _vec(m, "ShippingBinLocation", (71, 14)), "Pet Bowl": _vec(m, "PetBowlLocation", (53, 7)),
    }
    datos = sdv.raw("Data/Buildings")
    out = []
    for k in FIJOS:
        x, y = lugares[k]
        s = datos[k]["Size"]
        # La casa no tiene texto en el juego (`Name` es "Farmhouse" a secas): el nombre de la wiki en cada idioma.
        nombre = ["Farmhouse", "Casa de campo"] if k == "Farmhouse" else \
            [sdv.text(datos[k]["Name"], "en"), sdv.text(datos[k]["Name"], "es")]
        out.append({"key": k, "x": x, "y": y, "w": s["X"], "h": s["Y"], "name": nombre})
    return out


def granjas() -> list[dict]:
    nombres = site_data.Nombres()
    out = []
    for mapa_, clave, which in GRANJAS:
        m = mapa(mapa_)
        back = m["layers"]["Back"]
        out.append({
            "key": clave, "map": mapa_, "name": nombres.lugar(clave), "w": back["w"], "h": back["h"],
            "grid": "".join(_ALFABETO[b] for b in reglas(m)), "fixed": fijos(m, which),
            "img": f"planner/{mapa_.lower()}.webp",
        })
    return out


def _lista() -> dict[str, list]:
    """id -> [slug, nombre en, nombre es] de las fichas de objetos."""
    filas = json.loads((DATA / "site" / "list.json").read_text(encoding="utf-8"))
    en = json.loads((DATA / "site" / "names-en.json").read_text(encoding="utf-8"))
    es = json.loads((DATA / "site" / "names-es.json").read_text(encoding="utf-8"))
    return {r[0]: [r[1], en[i], es[i]] for i, r in enumerate(filas)}


def catalogo() -> dict:
    lista = _lista()
    recetas = json.loads((DATA / "recipes.json").read_text(encoding="utf-8"))
    fabricar = {r["out"]: r["ings"] for r in recetas["recipes"] if r["kind"] == "craft"}
    cultivos = json.loads((DATA / "crops.json").read_text(encoding="utf-8"))
    granja = json.loads((DATA / "farm.json").read_text(encoding="utf-8"))
    usados: set[str] = set()

    def ficha(item_id: str) -> dict:
        slug, en, es = lista[item_id]
        return {"name": [en, es], "slug": slug}

    def mats(item_id: str) -> list:
        ings = fabricar.get(item_id) or []
        usados.update(i for i, _ in ings)
        return [[i, n] for i, n in ings]

    items: list[dict] = []
    for c in cultivos["crops"]:
        items.append({"id": c["seed"], "cat": "crop", "name": c["name"], "slug": c["slug"], "place": "hoe",
                      "img": f"planner/crop-{c['seed']}.png", "iw": 16, "ih": 32, "seed": c["seed"],
                      "seasons": c["seasons"], "price": c["seedPrice"], "raised": c["raised"]})
    for s, r in ASPERSORES.items():
        base = {**ficha(s), "cat": "water", "place": "obj", "img": f"items/{s}.png", "iw": 16, "ih": 16,
                "mats": mats(s)}
        items.append({**base, "id": s, "range": ["sprinkler", r]})
        items.append({**base, "id": f"{s}+{BOQUILLA}", "range": ["sprinkler", r + 1], "nozzle": BOQUILLA,
                      "mats": mats(s) + [[BOQUILLA, 1]]})
        usados.add(BOQUILLA)
    grandes = sdv.raw("Data/BigCraftables")
    for k, b in grandes.items():
        if "arecrow" not in b["Name"]:
            continue
        radio = 17 if b["Name"].startswith("Deluxe") else 9
        for t in b.get("ContextTags") or []:
            if t.lower().startswith("crow_scare_radius_"):
                radio = int(t[len("crow_scare_radius_"):])
        qid = f"(BC){k}"
        items.append({**ficha(qid), "id": qid, "cat": "scare", "place": "obj", "img": f"items/bc-{k}.png",
                      "iw": 16, "ih": 32, "range": ["circle", radio], "mats": mats(qid)})
    for qid in MAQUINAS:
        it = {**ficha(qid), "id": qid, "cat": "machine", "place": "obj", "img": f"items/bc-{qid[4:]}.png",
              "iw": 16, "ih": 32, "mats": mats(qid)}
        if qid == COLMENA:
            it["range"] = ["diamond", RADIO_COLMENA]
        items.append(it)
    for p in sdv.raw("Data/FloorsAndPaths").values():
        i = p["ItemId"]
        items.append({**ficha(i), "id": i, "cat": "path", "place": "floor", "img": f"planner/floor-{p['Id']}.png",
                      "iw": 16, "ih": 16, "mats": mats(i)})
    for i in CERCAS:
        items.append({**ficha(i), "id": i, "cat": "path", "place": "obj", "img": f"items/{i}.png", "iw": 16, "ih": 16,
                      "mats": mats(i)})
    for t in cultivos["fruitTrees"]:
        items.append({"id": t["sapling"], "cat": "tree", "name": t["treeName"], "slug": t["slug"], "place": "tree",
                      "img": f"planner/tree-{t['sapling']}.png", "iw": 48, "ih": 80, "seasons": t["seasons"],
                      "price": t["saplingPrice"]})
    for b in granja["buildings"]:
        it = {"id": "B:" + b["key"], "cat": "building", "name": b["name"], "anchor": b["slug"], "place": "build",
              "img": f"buildings/{b['slug']}.png", "iw": b["sprite"][0], "ih": b["sprite"][1], "w": b["size"][0],
              "h": b["size"][1], "cost": b["cost"], "mats": b["materials"]}
        usados.update(m for m, _ in b["materials"])
        if b["key"] == "Junimo Hut":
            it["range"] = ["junimo", RADIO_JUNIMO]
        items.append(it)

    cats = recetas["refs"]["cats"]
    nombres = {}
    for i in sorted(usados):
        if i in lista:
            nombres[i] = [lista[i][1], lista[i][2], lista[i][0]]
        elif i in cats:
            nombres[i] = [*cats[i], None]
        else:
            raise KeyError(f"material sin nombre: {i}")
    return {"items": items, "mats": nombres}


def build() -> dict:
    return {"farms": granjas(), **catalogo()}


def main() -> None:
    out = build()
    (DATA / "planner.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"planner.json: {len(out['farms'])} granjas, {len(out['items'])} cosas, "
          f"{(DATA / 'planner.json').stat().st_size} bytes")


if __name__ == "__main__":
    main()
