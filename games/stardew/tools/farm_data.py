"""Datos de la granja de Stardew Valley para el sitio: animales, edificios, la casa y los cuidados de los animales.

Uso: python games/stardew/tools/farm_data.py

Escribe `games/stardew/data/farm.json`. Animales, edificios y reformas salen de `Data/FarmAnimals`, `Data/Buildings` y
`Data/HomeRenovations`; lo que el juego tiene en el código (las mejoras de la casa, de dónde salen los animales que no
vende Marnie y lo que suma o resta amistad y ánimo) se copió como valores a las tablas de abajo, y cada una nombra el
método de origen.
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crops_data  # noqa: E402
import mines_data  # noqa: E402
import relations  # noqa: E402
import sdv  # noqa: E402

DATA = crops_data.DATA

# Edificios que vienen con la granja y no se construyen.
_NO_SE_CONSTRUYEN = {"Farmhouse", "Greenhouse"}

# `FarmAnimalHarvestType`: 0 cae solo a la noche, 1 se junta con una herramienta (`HarvestTool`), 2 se desentierra.
_HERRAMIENTA = {"Milk Pail": "pail", "Shears": "shears"}

# Recorte del dibujo del menú de construcción, cuando el edificio lo pisa (`getSourceRectForMenu`): el estanque sin el
# agua de alrededor (`FishPond`) y la choza de Junimos en primavera, el primero de sus cuatro cuadros (`JunimoHut`). El
# resto usa `SourceRect`, o la textura entera si viene vacío (`Building.getSourceRect`).
_RECORTE_MENU = {"Fish Pond": (0, 0, 80, 80), "Junimo Hut": (0, 0, 48, 64)}
# Lo que el menú dibuja encima o debajo de ese recorte. Las aspas del molino y la puerta de los animales (cerrada) son
# capas aparte (`DrawLayers` de `Data/Buildings`, el primer cuadro si es animada): sin ellas el molino sale sin aspas y
# el gallinero y el establo con un agujero en la pared. Las puertas abiertas y el eje del molino (que gira con algo
# adentro) no van. El agua del estanque va debajo, el gris de (0, 80, 80, 80) teñido de (60, 126, 150)
# (`FishPond.drawInMenu`).
_PUERTA_GALLINERO = {"Default_AnimalDoor"}
_PUERTA_ESTABLO = {"Default_AnimalDoor_Top", "Default_AnimalDoor_Bottom"}
_CAPAS_MENU = {
    "Mill": {"Default_WindSails"},
    **dict.fromkeys(("Coop", "Big Coop", "Deluxe Coop"), _PUERTA_GALLINERO),
    **dict.fromkeys(("Barn", "Big Barn", "Deluxe Barn"), _PUERTA_ESTABLO),
}
_AGUA_MENU = {"Fish Pond": ((0, 80, 80, 80), (60, 126, 150))}

# Mejoras de la casa (`GameLocation.houseUpgradeAccept`): precio, materiales y días de obra (`daysUntilHouseUpgrade`).
# Lo que suma cada una sale de lo que ofrece Robin (`houseUpgradeOffer`); el texto es propio, corto.
_MEJORAS_CASA = [
    (1, 10000, [["388", 450]], 3, ["A bigger house with a kitchen.", "Casa más grande, con cocina."]),
    (2, 65000, [["709", 100]], 3, ["More room and a nursery for children.", "Más lugar y un cuarto para los hijos."]),
    (3, 100000, [], 3, ["A cellar with casks to age wine, cheese and more.", "Un sótano con barriles para añejar vino, queso y más."]),
]
# Reformas: sólo las que suman algo; las `remove_*` y `close_*` son su revés.
_REFORMA = ("add_", "open_", "build_")


# Claves de `Strings/*` que no están en `.es-ES` porque el nombre es el mismo en los dos idiomas.
_IGUALES: set[tuple[str, str]] = set()


def _par(archivo: str, clave: str) -> list[str]:
    """[en, es] de una clave de `Strings/*`. Si falta en `.es-ES` tira error, salvo en `_IGUALES` (nombres propios que
    el juego deja igual en los dos idiomas): así un texto sin traducir no pasa al sitio en inglés sin que nadie se entere."""
    en = sdv.raw(archivo)[clave]
    es = sdv.raw(archivo + ".es-ES").get(clave)
    if not es:
        if (archivo, clave) not in _IGUALES:
            raise KeyError(f"{archivo}.es-ES no tiene {clave}")
        es = en
    return [en, es]


def _tok(token: str) -> list[str]:
    return [sdv.text(token, "en").strip(), sdv.text(token, "es").strip()]


def _mayuscula(par: list[str]) -> list[str]:
    """El juego escribe en minúscula los tipos de animal en español ("gallina blanca"): en el sitio son títulos."""
    return [t[:1].upper() + t[1:] for t in par]


def _obj(n: str) -> list[str]:
    return mines_data.objeto(n)


def _grande(n: str) -> list[str]:
    return _tok(sdv.raw("Data/BigCraftables")[n]["DisplayName"])


def _edificio(clave: str) -> list[str]:
    """[en, es] del nombre de un edificio de `Data/Buildings` (el Barn es "Establo")."""
    return _tok(sdv.raw("Data/Buildings")[clave]["Name"])


def _npc(n: str) -> list[str]:
    return _par("Strings/NPCNames", n)


def _sin_prefijo(i: str) -> str:
    return i[3:] if i.startswith("(O)") else i


def slug(clave: str) -> str:
    """El ancla de una fila: la clave del juego en minúsculas, con espacios y "_" cambiados por "-"."""
    return clave.lower().replace(" ", "-").replace("_", "-")


def _origenes() -> dict[str, list[str]]:
    """De dónde salen los animales que Marnie no vende (`Utility.getPurchaseAnimalStock` sólo lista los de
    `PurchasePrice` >= 0) y la gallina azul, que sale en lugar de una común.

    Los nombres son del juego y la frase alrededor, propia. Fuentes: la incubadora y el huevo de cada animal
    (`EggItemIds`); el Huevo del vacío lo vende Krobus (`Data/Shops` ShadowShop); el Huevo de oro, después de la
    perfección, Marnie y el Sr. Qi (`Data/Shops` AnimalShop y QiGemShop, con `Farm_Eternal`); el Huevo de dinosaurio
    lo suelta el Rex pimienta (`DinoMonster.getExtraDropItems`, 10 %) y sale en los pisos de dinosaurios
    (`MineShaft.getRandomItemForThisLevel`); el Huevo de avestruz, el tesoro enterrado del norte de la isla
    (`IslandNorth.checkForBuriedItem`) y los cofres del volcán (`VolcanoDungeon.PopulateChest`). La azul: 1 de cada 4
    gallinas después del evento de 8 corazones de Shane (`AlternatePurchaseTypes`, evento 3900074 con Shane 2000).
    """
    inc, inc_av = _grande("101"), _grande("254")
    krobus, shane = _npc("Krobus"), _npc("Shane")
    cloaca = _par("Strings/StringsFromCSFiles", "MapPage.cs.11089")
    rancho = _par("Strings/StringsFromCSFiles", "MapPage.cs.11068")
    nueces = _par("Strings/WorldMap", "GingerIsland_West_QiWalnutRoom")
    isla = _par("Strings/StringsFromCSFiles", "IslandName")
    volcan = _par("Strings/WorldMap", "GingerIsland_North_Volcano")
    rex = [sdv.raw("Data/Monsters")["Pepper Rex"].split("/")[14], sdv.raw("Data/Monsters.es-ES")["Pepper Rex"].split("/")[14]]
    vacio, oro, dino, avestruz = _obj("305"), _obj("928"), _obj("107"), _obj("289")
    return {
        "Void Chicken": [f"{inc[0]}: {vacio[0]}. Sold by {krobus[0]} ({cloaca[0]}).",
                         f"{inc[1]}: {vacio[1]}. Lo vende {krobus[1]} ({cloaca[1]})."],
        "Golden Chicken": [f"{inc[0]}: {oro[0]}. After perfection: {rancho[0]} or {nueces[0]}.",
                           f"{inc[1]}: {oro[1]}. Después de la perfección: {rancho[1]} o {nueces[1]}."],
        "Dinosaur": [f"{inc[0]}: {dino[0]}. Dropped by the {rex[0]}; also found on the Skull Cavern dinosaur floors.",
                     f"{inc[1]}: {dino[1]}. Lo suelta el {rex[1]}; también sale en los pisos de dinosaurios de la Caverna Calavera."],
        "Ostrich": [f"{inc_av[0]}: {avestruz[0]}. On {isla[0]}: buried treasure in the north and the {volcan[0]} chests.",
                    f"{inc_av[1]}: {avestruz[1]}. En {isla[1]}: un tesoro enterrado en el norte y los cofres del {volcan[1]}."],
        "Blue Chicken": [f"Sometimes (1 in 4) instead of a chicken at {rancho[0]}, after {shane[0]}'s 8-heart event.",
                         f"A veces (1 de cada 4) en lugar de una gallina en el {rancho[1]}, después del evento de 8 corazones de {shane[1]}."],
    }


# Los que salen de la incubadora común: el `(BC)101` sólo viene adentro del Gallinero grande y el de lujo (`IndoorItems`
# de `Data/Buildings`) y no se fabrica, así que piden el grande como el pato. La incubadora de avestruz se fabrica y va
# en cualquier establo: el avestruz no pide nada más.
_PIDE_INCUBADORA = {"Void Chicken": "Big Coop", "Golden Chicken": "Big Coop", "Dinosaur": "Big Coop"}


def _tienda() -> dict[str, tuple[int, str | None]]:
    """clave -> (precio, edificio que pide) de lo que vende Marnie. Las variantes de `AlternatePurchaseTypes` (la
    gallina marrón y la azul al comprar una gallina, la vaca marrón al comprar una vaca) valen lo mismo que la que se
    compra (`PurchaseAnimalsMenu`)."""
    out = {}
    for k, a in sdv.raw("Data/FarmAnimals").items():
        if a["PurchasePrice"] < 0:
            continue
        out[k] = (a["PurchasePrice"], a.get("RequiredBuilding"))
        for alt in a.get("AlternatePurchaseTypes") or []:
            for otro in alt["AnimalIds"]:
                out.setdefault(otro, out[k])
    return out


def animal_textures(clave: str) -> tuple[str, str | None]:
    """(textura adulta, textura de bebé o None) sin carpeta: `Animals/<nombre>.png`."""
    a = sdv.raw("Data/FarmAnimals")[clave]
    bebe = a.get("BabyTexture")
    return a["Texture"].split("\\")[-1], bebe.split("\\")[-1] if bebe else None


def animals() -> list[dict]:
    tienda, origen = _tienda(), _origenes()
    out = []
    for k, a in sdv.raw("Data/FarmAnimals").items():
        precio, pide = tienda.get(k, (None, _PIDE_INCUBADORA.get(k)))
        tipo, herr = a["HarvestType"], a.get("HarvestTool")
        tool = "dig" if tipo == 2 else _HERRAMIENTA[herr] if tipo == 1 else None
        produce = [{"id": _sin_prefijo(p["ItemId"]), "deluxe": False, "minFriendship": p.get("MinimumFriendship") or 0}
                   for p in a.get("ProduceItemIds") or []]
        # El producto de lujo pide además `DeluxeProduceMinimumFriendship` (`FarmAnimal.dayUpdate`).
        produce += [{"id": _sin_prefijo(p["ItemId"]), "deluxe": True,
                     "minFriendship": max(p.get("MinimumFriendship") or 0, a.get("DeluxeProduceMinimumFriendship") or 0)}
                    for p in a.get("DeluxeProduceItemIds") or []]
        huevos = a.get("EggItemIds") or []
        out.append({
            "key": k, "slug": slug(k), "name": _mayuscula(_tok(a["DisplayName"])), "house": a["House"],
            "price": precio, "needs": pide, "from": origen.get(k), "egg": _sin_prefijo(huevos[0]) if huevos else None,
            "mature": a["DaysToMature"], "every": a["DaysToProduce"], "tool": tool, "produce": produce,
            # Precio base al venderlo: el juego lo multiplica por (amistad / 1000 + 0,3) (`FarmAnimal.getSellPrice`).
            "sell": a["SellPrice"], "drain": a["HappinessDrain"],
            "sprite": [a["SpriteWidth"], a["SpriteHeight"]], "baby": animal_textures(k)[1] is not None,
        })
    return out


def building_box(clave: str) -> tuple[str, int, int, int, int]:
    """(textura sin extensión, x, y, ancho, alto) del dibujo de un edificio en el menú de construcción."""
    b = sdv.raw("Data/Buildings")[clave]
    textura = b["Texture"].replace("\\", "/")
    if clave in _RECORTE_MENU:
        return (textura, *_RECORTE_MENU[clave])
    r = b["SourceRect"]
    if r["Width"] and r["Height"]:
        return textura, r["X"], r["Y"], r["Width"], r["Height"]
    with Image.open(sdv.RAW / "textures" / f"{textura}.png") as im:
        w, h = im.size
    return textura, 0, 0, w, h


def building_layers(clave: str) -> list[tuple[int, int, int, int, int, int]]:
    """(x, y, ancho, alto, x destino, y destino) de las capas que van encima del dibujo del menú (`_CAPAS_MENU`)."""
    ids = _CAPAS_MENU.get(clave, set())
    out = []
    for c in sdv.raw("Data/Buildings")[clave].get("DrawLayers") or []:
        if c["Id"] in ids:
            r, d = c["SourceRect"], c["DrawPosition"]
            out.append((r["X"], r["Y"], r["Width"], r["Height"], d["X"], d["Y"]))
    return out


def building_water(clave: str) -> tuple[tuple[int, int, int, int], tuple[int, int, int]] | None:
    """El agua que va debajo del dibujo del menú (sólo el estanque): recorte y color con que se tiñe."""
    return _AGUA_MENU.get(clave)


def buildings(animales: list[dict]) -> list[dict]:
    out = []
    for k, b in sdv.raw("Data/Buildings").items():
        if k in _NO_SE_CONSTRUYEN:
            continue
        caja = building_box(k)
        out.append({
            "key": k, "slug": slug(k), "name": _tok(b["Name"]), "desc": _tok(b["Description"]),
            "builder": b["Builder"], "cost": b["BuildCost"],
            "materials": [[_sin_prefijo(m["ItemId"]), m["Amount"]] for m in b.get("BuildMaterials") or []],
            "days": b["BuildDays"], "upgradeOf": b.get("BuildingToUpgrade"),
            "size": [b["Size"]["X"], b["Size"]["Y"]],
            # Quién vive: los animales cuya `House` está en `ValidOccupantTypes` (`FarmAnimal.CanLiveIn`).
            "animals": [a["key"] for a in animales if a["house"] in (b.get("ValidOccupantTypes") or [])],
            "sprite": [caja[3], caja[4]],
        })
    return out


def house() -> dict:
    mejoras = [{"level": n, "cost": c, "materials": m, "days": d, "adds": t} for n, c, m, d, t in _MEJORAS_CASA]
    reformas = []
    for k, r in sdv.raw("Data/HomeRenovations").items():
        if not k.startswith(_REFORMA):
            continue
        archivo, clave = r["TextStrings"].replace("\\", "/").split(":", 1)
        en, es = (t.split("/") for t in _par(archivo, clave))
        reformas.append({"key": k, "slug": slug(k), "name": [en[0], es[0]], "desc": [en[1], es[1]], "price": r["Price"]})
    return {"upgrades": mejoras, "renovations": reformas}


def care(animales: list[dict]) -> list[dict]:
    """Lo que suma y resta amistad (0 a 1000) y ánimo (0 a 255), de `FarmAnimal.pet`, `FarmAnimal.dayUpdate`,
    `FarmAnimal.Eat` y `FarmAnimal.updatePerTenMinutes`. `value` es la cifra tal cual se muestra; `stat` dice si toca
    la amistad, el ánimo o los dos. Los textos son propios, con los nombres del juego."""
    heno, auto, calefactor = _obj("178"), _grande("272"), _grande("104")
    corral_ed, establo_ed = _edificio("Coop"), _edificio("Barn")
    corral = _par("Strings/UI", "LevelUp_ProfessionName_Coopmaster")
    pastor = _par("Strings/UI", "LevelUp_ProfessionName_Shepherd")
    drenaje = sorted({a["drain"] for a in animales})
    rango = f"{drenaje[0]}…{drenaje[-1]}"
    return [
        # `pet`: +15 de amistad y ánimo + max(5, 30 + HappinessDrain), una vez por día.
        {"key": "pet", "stat": "both", "value": "+15",
         "text": ["Pet it once a day: +15 friendship and a better mood.",
                  "Acariciarlo una vez por día: +15 de amistad y mejor ánimo."]},
        # `pet`: `ProfessionForHappinessBoost` (2 Corralero, 3 Pastor) repite la suba de amistad y de ánimo.
        {"key": "profession", "stat": "both", "value": "+15",
         "text": [f"{corral[0]} ({corral_ed[0].lower()}) or {pastor[0]} ({establo_ed[0].lower()}): petting gives 15 more friendship.",
                  f"{corral[1]} ({corral_ed[1].lower()}) o {pastor[1]} ({establo_ed[1].lower()}): acariciarlo da 15 más de amistad."]},
        # `pet(is_auto_pet: true)`: 15 − 7 de amistad; la caricia a mano después suma los 7 que faltan.
        {"key": "autoPetter", "stat": "both", "value": "+8",
         "text": [f"{auto[0]} in the building: +8 friendship a day; petting by hand adds 7 more.",
                  f"{auto[1]} en el edificio: +8 de amistad por día; acariciarlo a mano suma 7 más."]},
        # `dayUpdate`: sin caricia, −(10 − amistad / 200) de amistad y −50 de ánimo.
        {"key": "notPet", "stat": "both", "value": "−10",
         "text": ["A day without petting: up to −10 friendship (less the higher it is) and −50 mood.",
                  "Un día sin caricias: hasta −10 de amistad (menos cuanto más alta) y −50 de ánimo."]},
        # `Eat`: pasto afuera y sin lluvia, ánimo al máximo y +8 de amistad (+16 con el pasto azul, `grassType` 7).
        {"key": "grass", "stat": "both", "value": "+8",
         "text": ["Eating grass outside, without rain: +8 friendship (+16 with blue grass) and full mood.",
                  "Comer pasto afuera, sin lluvia: +8 de amistad (+16 con pasto azul) y el ánimo al máximo."]},
        # `dayUpdate`: con `fullness` < 200 (sin heno en el comedero ni pasto), −20 de amistad y −100 de ánimo.
        {"key": "hungry", "stat": "both", "value": "−20",
         "text": [f"A night without {heno[0].lower()} or grass: −20 friendship and −100 mood.",
                  f"Una noche sin {heno[1].lower()} ni pasto: −20 de amistad y −100 de ánimo."]},
        # `dayUpdate`: si duerme afuera de su edificio, el ánimo se divide por 2.
        {"key": "outsideNight", "stat": "mood", "value": "÷2",
         "text": ["Left outside overnight: mood cut in half.",
                  "Dejarlo afuera de noche: el ánimo baja a la mitad."]},
        # `updatePerTenMinutes`: desde las 18, afuera después de las 19, con lluvia o en invierno, −HappinessDrain.
        {"key": "lateOutdoors", "stat": "mood", "value": f"−{rango}",
         "text": ["Outside after 7 PM, in the rain or in winter: mood drops every 10 minutes.",
                  "Afuera después de las 19, con lluvia o en invierno: el ánimo baja cada 10 minutos."]},
        # `updatePerTenMinutes`: en invierno, adentro desde las 18 y con ánimo > 150, ±HappinessDrain según el
        # calefactor.
        {"key": "heater", "stat": "mood", "value": f"±{rango}",
         "text": [f"Winter nights indoors: with a {calefactor[0]} mood rises every 10 minutes; without one it drops.",
                  f"Noches de invierno adentro: con un {calefactor[1].lower()} el ánimo sube cada 10 minutos; sin él, baja."]},
    ]


def process(animales: list[dict]) -> dict[str, list[list]]:
    """producto -> [máquina, producto que sale, minutos, días, cantidad] de cada máquina que lo recibe (`relations.machines_by_input`,
    la primera regla de `Data/Machines` que lo acepta, como el juego). Los productos sin máquina (la pluma de pato, la
    pata de conejo) no están."""
    por_entrada = relations.machines_by_input()
    ids = sorted({p["id"] for a in animales for p in a["produce"]})
    # La cantidad es `MinStack` de la salida (-1 es una): el huevo de avestruz da 10 mayonesas, el dorado 3.
    return {i: [[m["machine"], m["out"], m["minutes"], m["days"], max(1, m["stack"])] for m in por_entrada[i]]
            for i in ids if por_entrada.get(i)}


def farm() -> dict:
    slugs, nombres = mines_data.sitio()
    an = animals()
    ed = buildings(an)
    casa = house()
    proceso = process(an)
    # Los objetos nombrados (con la forma de `Ref`: slug, slug español, nombre en, es, ancho, alto; las máquinas miden
    # 16×32).
    ids = {p["id"] for a in an for p in a["produce"]} | {a["egg"] for a in an if a["egg"]}
    ids |= {m for b in ed for m, _ in b["materials"]} | {m for u in casa["upgrades"] for m, _ in u["materials"]}
    ids |= {x for filas in proceso.values() for maq, sal, *_ in filas for x in (maq, sal)}
    # `mines_data.sitio` nombra en inglés sólo lo de `Data/Objects`: las máquinas salen de `Data/BigCraftables`.
    nombre = lambda i: [_grande(i[4:])[0], nombres[i][1]] if i.startswith("(BC)") else nombres[i]  # noqa: E731
    refs = {i: [*slugs[i], *nombre(i), 16, 32 if i.startswith("(BC)") else 16] for i in sorted(ids) if i in slugs}
    # El nombre de las herramientas con que se cosecha (`tool` de cada animal), de `Data/Tools`.
    herramientas = {k: _tok(sdv.raw("Data/Tools")[t]["DisplayName"]) for k, t in (("pail", "MilkPail"), ("shears", "Shears"))}
    return {"animals": an, "buildings": ed, "house": casa, "care": care(an), "process": proceso, "tools": herramientas, "refs": refs}


def main() -> None:
    ruta = DATA / "farm.json"
    ruta.write_text(json.dumps(farm(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("farm.json", ruta.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
