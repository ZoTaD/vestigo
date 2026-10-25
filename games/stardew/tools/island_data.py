"""Datos de la Isla Jengibre de Stardew Valley para el sitio: las 130 nueces doradas, las mejoras del loro, el Walnut
Room de Qi y sus pedidos especiales.

Uso: python games/stardew/tools/island_data.py

Escribe `games/stardew/data/island.json`. Las nueces y las mejoras del loro no están en `Data/`: viven en el código del
juego y se copiaron como valores a las tablas de abajo, cada una con el método de origen. La tienda sale de
`Data/Shops` (`QiGemShop`) y los pedidos, de `Data/SpecialOrders` (`OrderType` "Qi") con los textos de
`Strings/SpecialOrderStrings`. Las frases de cada nuez son propias, cortas, en los dos idiomas.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crops_data  # noqa: E402
import mines_data  # noqa: E402
import sdv  # noqa: E402

DATA = crops_data.DATA

TOTAL_NUECES = 130  # `IslandHut.TOTAL_WALNUTS`, el tope de `Utility.percentGameComplete`

# Zonas, en el orden en que `IslandHut.ShowNutHint` recorre la isla. Qué lugar del juego cae en cada una sale de las
# `MapAreas` de la Isla en `Data/WorldMap`; el volcán (la mazmorra y la caldera) se separa del norte, y la Sucursal
# (`IslandFieldOffice`, que el mapa no nombra) va al norte. "Anywhere" junta las nueces que salen en toda la isla.
_ZONAS = ["North", "West", "South", "East", "Volcano", "SouthEast", "Anywhere"]
_ZONA_DEL_MAPA = {"North": "North", "West": "West", "South": "South", "East": "East", "SouthEast": "SouthEast"}
_LUGAR_FUERA_DEL_MAPA = {"Caldera": "Volcano", "VolcanoDungeon": "Volcano", "IslandFieldOffice": "North"}
# Nombres propios de las zonas (el juego no las nombra); el volcán, de `Strings/WorldMap`.
_NOMBRE_ZONA = {
    "North": ["Island North", "Norte de la isla"],
    "West": ["Island West", "Oeste de la isla"],
    "South": ["Island South", "Sur de la isla"],
    "East": ["Island East", "Este de la isla"],
    "SouthEast": ["Island Southeast", "Sudeste de la isla"],
    "Anywhere": ["Anywhere on the island", "En toda la isla"],
}

# Cómo se lee cada nuez en la partida: `collectedNutTracker` (`FarmerTeam.MarkCollectedNut`), `limitedNutDrops`
# (`FarmerTeam.RequestLimitedNutDrops`, con su tope) o, el coco dorado, `NetWorldState.GoldenCoconutCracked`
# (`GeodeMenu.receiveLeftClick`).
C, L, COCO = "collected", "limited", "coconut"


def _arbusto(zona_en: str, zona_es: str):
    """Frase de un arbusto escondido; la casilla sale de la clave (`Bush.shake`: "Bush_<lugar>_<x>_<y>")."""
    return lambda x, y: [f"Hidden bush in the {zona_en} (tile {x}, {y}).", f"Arbusto escondido en el {zona_es} (casilla {x}, {y})."]


def _enterrada(zona_en: str, zona_es: str):
    """Frase de una nuez enterrada (`IslandLocation.checkForBuriedItem`: "Buried_<lugar>_<x>_<y>")."""
    return lambda x, y: [f"Buried in the {zona_en} (tile {x}, {y}); dig where the ground wiggles.",
                         f"Enterrada en el {zona_es} (casilla {x}, {y}); cavá donde se mueve la tierra."]


_NORTE_A, _OESTE_A = _arbusto("north", "norte"), _arbusto("west", "oeste")
_NORTE_E, _OESTE_E = _enterrada("north", "norte"), _enterrada("west", "oeste")

# Las nueces, en el orden de `IslandHut.ShowNutHint` (que es también la lista de `ParrotUpgradePerch.ActivateGoldenParrot`
# más el coco dorado y Birdie): (clave, lugar del juego, cuántas da, tipo, cómo se lee, frase [en, es]). Lo que da cada
# una sale de las sumas de `ShowNutHint` (`MissingTheseNuts` / `MissingLimitedNutDrops` y los `running_total += …`): el
# esqueleto grande 6 (`IslandFieldOffice.OnPieceDonated`), la serpiente 3, la cueva de los cristales 3, la sirena 5, el
# altar del plátano 3, cada pedido de la rana 5, el altar escondido 5 y Birdie 5 (`Event` "birdiereward"). La frase es
# `None` en arbustos y enterradas, que la arman `_arbusto` y `_enterrada`; las chances salen de cada método:
# `GameLocation.breakStone` (mejillón, 10 %), `HoeDirt.performUseAction` (cosecha, 5 %), `IslandLocation.getFish`
# (pesca, 15 %), `VolcanoDungeon.breakStone` (3 %).
_NUECES = [
    ("Bush_IslandNorth_13_33", "IslandNorth", 1, "bush", C,
     ["Bush by the lava river (tile 13, 33).", "Arbusto junto al río de lava (casilla 13, 33)."]),
    ("Bush_IslandNorth_5_30", "IslandNorth", 1, "bush", C,
     ["Bush by the lava river, further west (tile 5, 30).", "Arbusto junto al río de lava, más al oeste (casilla 5, 30)."]),
    ("Buried_IslandNorth_19_39", "IslandNorth", 1, "buried", C,
     ["Buried at the Dig Site, next to the bones (tile 19, 39).",
      "Enterrada en el Lugar de Excavación, junto a los huesos (casilla 19, 39)."]),
    ("Bush_IslandNorth_4_42", "IslandNorth", 1, "bush", C, None),
    ("Bush_IslandNorth_45_38", "IslandNorth", 1, "bush", C, None),
    ("Bush_IslandNorth_47_40", "IslandNorth", 1, "bush", C, None),
    ("IslandLeftPlantRestored", "IslandFieldOffice", 1, "puzzle", C,
     ["Field Office: answer Professor Snail's purple flower survey.",
      "Sucursal: respondé la encuesta de las flores violetas del Profesor Caracol."]),
    ("IslandRightPlantRestored", "IslandFieldOffice", 1, "puzzle", C,
     ["Field Office: answer Professor Snail's purple starfish survey.",
      "Sucursal: respondé la encuesta de las estrellas de mar violetas del Profesor Caracol."]),
    ("IslandBatRestored", "IslandFieldOffice", 1, "puzzle", C,
     ["Field Office: donate the Mummified Bat.", "Sucursal: doná el murciélago momificado."]),
    ("IslandFrogRestored", "IslandFieldOffice", 1, "puzzle", C,
     ["Field Office: donate the Mummified Frog.", "Sucursal: doná la rana momificada."]),
    ("IslandCenterSkeletonRestored", "IslandFieldOffice", 6, "puzzle", C,
     ["Field Office: complete the large animal (skull, spine, ribs, tail and two legs).",
      "Sucursal: completá el animal grande (cráneo, columna, costillas, cola y dos patas)."]),
    ("IslandSnakeRestored", "IslandFieldOffice", 3, "puzzle", C,
     ["Field Office: complete the snake (skull and two vertebrae).",
      "Sucursal: completá la serpiente (cráneo y dos vértebras)."]),
    ("Buried_IslandNorth_19_13", "IslandNorth", 1, "buried", C, None),
    ("Buried_IslandNorth_57_79", "IslandNorth", 1, "buried", C, None),
    ("Buried_IslandNorth_54_21", "IslandNorth", 1, "buried", C, None),
    ("Buried_IslandNorth_42_77", "IslandNorth", 1, "buried", C, None),
    ("Buried_IslandNorth_62_54", "IslandNorth", 1, "buried", C, None),
    ("Buried_IslandNorth_26_81", "IslandNorth", 1, "buried", C, None),
    ("Bush_IslandNorth_20_26", "IslandNorth", 1, "bush", C, None),
    ("Bush_IslandNorth_9_84", "IslandNorth", 1, "bush", C, None),
    ("Bush_IslandNorth_56_27", "IslandNorth", 1, "bush", C, None),
    ("Bush_IslandSouth_31_5", "IslandSouth", 1, "bush", C,
     ["Bush at the north edge of the south (tile 31, 5).", "Arbusto en el borde norte del sur (casilla 31, 5)."]),
    ("TreeNut", "IslandHut", 1, "puzzle", C,
     ["Hit the tree inside the Jungle Hut with an axe or pickaxe.",
      "Golpeá con el hacha o el pico el árbol de adentro de la Cabaña de Jungla."]),
    ("IslandWestCavePuzzle", "IslandWestCave1", 3, "puzzle", C,
     ["Repeat the crystals' song in the cave in the west.", "Repetí la melodía de los cristales en la cueva del oeste."]),
    ("SandDuggy", "IslandWest", 1, "puzzle", C,
     ["Whack the critter that pops out of the sand holes.", "Golpeá al bicho que asoma por los pozos de arena."]),
    ("TigerSlimeNut", "IslandWest", 1, "limited", L,
     ["Slay every slime in the Tiger Slime Grove.", "Matá todas las babas de la Arboleda de Babas Tigre."]),
    ("Buried_IslandWest_21_81", "IslandWest", 1, "buried", C, None),
    ("Buried_IslandWest_62_76", "IslandWest", 1, "buried", C, None),
    ("Buried_IslandWest_39_24", "IslandWest", 1, "buried", C, None),
    ("Buried_IslandWest_88_14", "IslandWest", 1, "buried", C, None),
    ("Buried_IslandWest_43_74", "IslandWest", 1, "buried", C, None),
    ("Buried_IslandWest_30_75", "IslandWest", 1, "buried", C, None),
    ("MusselStone", None, 5, "limited", L,
     ["Break mussel stones on the shore (10% each).", "Rompé piedras de mejillones en la costa (10 % cada una)."]),
    ("IslandFarming", None, 5, "limited", L,
     ["Harvest crops grown on the island (5% each).", "Cosechá cultivos plantados en la isla (5 % cada uno)."]),
    ("Bush_IslandWest_104_3", "IslandWest", 1, "bush", C, None),
    ("Bush_IslandWest_31_24", "IslandWest", 1, "bush", C, None),
    ("Bush_IslandWest_38_56", "IslandWest", 1, "bush", C, None),
    ("Bush_IslandWest_75_29", "IslandWest", 1, "bush", C, None),
    ("Bush_IslandWest_64_30", "IslandWest", 1, "bush", C, None),
    ("Bush_IslandWest_54_18", "IslandWest", 1, "bush", C, None),
    ("Bush_IslandWest_25_30", "IslandWest", 1, "bush", C, None),
    ("Bush_IslandWest_15_3", "IslandWest", 1, "bush", C, None),
    ("IslandFishing", None, 5, "limited", L,
     ["Fish anywhere on the island (15% per catch).", "Pescá en cualquier lugar de la isla (15 % por pesca)."]),
    ("VolcanoNormalChest", "VolcanoDungeon", 1, "limited", L,
     ["Open a common treasure chest in the volcano.", "Abrí un cofre común en el volcán."]),
    ("VolcanoRareChest", "VolcanoDungeon", 1, "limited", L,
     ["Open a rare treasure chest in the volcano.", "Abrí un cofre raro en el volcán."]),
    ("VolcanoBarrel", "VolcanoDungeon", 5, "limited", L,
     ["Break barrels and crates in the volcano.", "Rompé barriles y cajones en el volcán."]),
    ("VolcanoMining", "VolcanoDungeon", 5, "limited", L,
     ["Mine rocks in the volcano (3% each).", "Picá piedras en el volcán (3 % cada una)."]),
    ("VolcanoMonsterDrop", "VolcanoDungeon", 5, "limited", L,
     ["Slay monsters in the volcano.", "Matá monstruos en el volcán."]),
    ("Island_N_BuriedTreasureNut", "IslandNorth", 1, "buried", L,
     ["Dig where a journal scrap's treasure map points, in the north.",
      "Cavá donde marca el mapa del tesoro de una hoja del diario, en el norte."]),
    ("Island_W_BuriedTreasureNut", "IslandWest", 1, "buried", L,
     ["Dig where a journal scrap's treasure map points, in the west.",
      "Cavá donde marca el mapa del tesoro de una hoja del diario, en el oeste."]),
    ("Island_W_BuriedTreasureNut2", "IslandWest", 1, "buried", L,
     ["Dig where another journal treasure map points, in the west.",
      "Cavá donde marca otro mapa del tesoro del diario, en el oeste."]),
    ("Mermaid", "IslandSouthEast", 5, "puzzle", C,
     ["Play the mermaid's song on the flute blocks; she shows up when it rains.",
      "Tocá la canción de la sirena con los bloques de flauta; ella aparece cuando llueve."]),
    ("TreeNutShot", "IslandNorth", 1, "puzzle", C,
     ["Knock the nut off the tall tree with the slingshot (tile 58, 11).",
      "Bajá de un tiro de gomera la nuez del árbol alto (casilla 58, 11)."]),
    ("Buried_IslandSouthEastCave_36_26", "IslandSouthEastCave", 1, "buried", C,
     ["Buried inside the Pirate Cove (tile 36, 26).", "Enterrada adentro de la Cala Pirata (casilla 36, 26)."]),
    ("Buried_IslandSouthEast_25_17", "IslandSouthEast", 1, "buried", C,
     ["Buried in the southeast, outside the Pirate Cove (tile 25, 17).",
      "Enterrada en el sudeste, afuera de la Cala Pirata (casilla 25, 17)."]),
    ("StardropPool", "IslandSouthEast", 1, "event", C,
     ["Fish in the star-shaped pool.", "Pescá en la laguna con forma de estrella."]),
    ("Bush_Caldera_28_36", "Caldera", 1, "bush", C,
     ["Bush at the top of the volcano (tile 28, 36).", "Arbusto en la cima del volcán (casilla 28, 36)."]),
    ("Bush_Caldera_9_34", "Caldera", 1, "bush", C,
     ["Bush at the top of the volcano, to the west (tile 9, 34).", "Arbusto en la cima del volcán, al oeste (casilla 9, 34)."]),
    ("Bush_CaptainRoom_2_4", "CaptainRoom", 1, "bush", C,
     ["Bush inside the Shipwreck.", "Arbusto adentro del Naufragio."]),
    ("BananaShrine", "IslandEast", 3, "puzzle", C, "banana"),
    ("Bush_IslandEast_17_37", "IslandEast", 1, "bush", C,
     ["Hidden bush in the jungle (tile 17, 37).", "Arbusto escondido en la jungla (casilla 17, 37)."]),
    ("Darts", "IslandSouthEastCave", 3, "limited", L,
     ["Beat the pirate at darts in the Pirate Cove: one per win, up to 3.",
      "Ganale al pirata a los dardos en la Cala Pirata: una por partida, hasta 3."]),
    ("IslandGourmand1", "IslandFarmCave", 5, "event", C, ("gourmand", "254")),
    ("IslandGourmand2", "IslandFarmCave", 5, "event", C, ("gourmand", "262")),
    ("IslandGourmand3", "IslandFarmCave", 5, "event", C, ("gourmand", "248")),
    ("IslandShrinePuzzle", "IslandShrine", 5, "puzzle", C,
     ["Place the four gems on the pedestals of the hidden shrine in the jungle.",
      "Poné las cuatro gemas en los pedestales del altar escondido de la jungla."]),
    ("Bush_IslandShrine_23_34", "IslandShrine", 1, "bush", C,
     ["Bush by the hidden shrine (tile 23, 34).", "Arbusto junto al altar escondido (casilla 23, 34)."]),
    ("GoldenCoconut", None, 1, "event", COCO, "coconut"),
    ("Birdie", "IslandWest", 5, "event", L,
     ["Finish Birdie's quest at her shack in the west.", "Terminá la misión de Birdie en su choza del oeste."]),
]
# Mejoras del loro (`ParrotUpgradePerch`, en `IslandHut`, `IslandNorth`, `IslandSouth`, `IslandWest` y
# `VolcanoDungeon.GenerateContents`): (clave = `upgradeName`, lugar, nueces, carta que deja = la que se lee en la
# partida, mejoras que pide antes (`requiredMail`)). Queda afuera el loro dorado (`GoldenParrot`, 1.6), que cobra oro.
_MEJORAS = [
    ("Hut", "IslandHut", 1, "Island_FirstParrot", []),
    ("Turtle", "IslandSouth", 10, "Island_Turtle", ["Hut"]),
    ("House", "IslandWest", 20, "Island_UpgradeHouse", []),
    ("House_Mailbox", "IslandWest", 5, "Island_UpgradeHouse_Mailbox", ["House"]),
    ("Obelisk", "IslandWest", 20, "Island_W_Obelisk", ["House_Mailbox"]),
    ("ParrotPlatforms", "IslandWest", 10, "Island_UpgradeParrotPlatform", []),
    ("Bridge", "IslandNorth", 10, "Island_UpgradeBridge", ["Turtle"]),
    ("Trader", "IslandNorth", 10, "Island_UpgradeTrader", ["House"]),
    ("Resort", "IslandSouth", 20, "Island_Resort", ["House"]),
    ("VolcanoBridge", "VolcanoDungeon", 5, "Island_VolcanoBridge", ["Turtle"]),
    ("VolcanoShortcutOut", "VolcanoDungeon", 5, "Island_VolcanoShortcutOut", ["Turtle"]),
]
# Lo que una mejora pide además de las otras (`ParrotUpgradePerch.requiredMail`): el puente del volcán, haber llegado a
# la cima (`reachedCaldera`, `VolcanoDungeon.GenerateContents`). Se lee `volcan` de `Strings/WorldMap`.
_PIDE_ADEMAS = {"VolcanoBridge": ("GingerIsland_North_Volcano", "Also reach the top of the {0}.",
                                   "Además, llegar a la cima del {0}.")}

# El loro de la cabaña dice "¿Dar?" (`UpgradePerch_Hut`): el nombre es propio.
_NOMBRE_MEJORA = {"Hut": ["Feed the first parrot", "Darle una nuez al primer loro"]}

# Condiciones de las filas de `QiGemShop`, en palabras.
_CONDICION_TIENDA = {
    "!PLAYER_HAS_MAIL Current gotFirstJunimoChest": ["The first one", "El primero"],
    "!PLAYER_HAS_MAIL Current gotMissingStocklist": ["Only once", "Una sola vez"],
    "!PLAYER_HAS_TOWN_KEY Current": ["Only once", "Una sola vez"],
    "PLAYER_HAS_MAIL Current Farm_Eternal": ["After reaching perfection", "Después de llegar a la perfección"],
}
_GEMA_QI, _NUEZ = "858", "73"

# `QuestDuration` de `Data/SpecialOrders` (`SpecialOrder.SetDuration`) en días, como mucho (la semana y el mes cierran
# con el calendario). El orden del enum se confirma con los datos: el de Lewis dura "hasta fin de temporada" (1), los
# del Festival del Desierto un día (5) y "Familia expandida" dice "tres días" (4).
_DIAS = {0: 7, 1: 28, 2: 14, 3: 2, 4: 3, 5: 1}

# Tamaño del dibujo de un mueble cuando `Data/Furniture` no lo trae (`Furniture.getDefaultSourceRectForType`).
_MUEBLE_POR_TIPO = {"chair": (1, 2), "painting": (2, 2), "decor": (1, 2)}


def _par(archivo: str, clave: str) -> list[str]:
    """[en, es] de una clave de `Strings/*`; en español cae al inglés si falta."""
    en = sdv.raw(archivo)[clave]
    return [en.strip(), (sdv.raw(archivo + ".es-ES").get(clave) or en).strip()]


def _tok(token: str) -> list[str]:
    return [sdv.text(token, "en").strip(), sdv.text(token, "es").strip()]


def _obj(n: str) -> list[str]:
    return mines_data.objeto(n)


def slug(clave: str) -> str:
    """El ancla de una fila: la clave del juego en minúsculas, con espacios y "_" cambiados por "-"."""
    return clave.lower().replace(" ", "-").replace("_", "-")


def _zonas_por_lugar() -> dict[str, str]:
    out = dict(_LUGAR_FUERA_DEL_MAPA)
    for a in sdv.raw("Data/WorldMap")["GingerIsland"]["MapAreas"]:
        for p in a.get("WorldPositions") or []:
            out.setdefault(p["LocationName"], _ZONA_DEL_MAPA[a["Id"]])
    return out


def areas() -> list[dict]:
    nombres = dict(_NOMBRE_ZONA, Volcano=_par("Strings/WorldMap", "GingerIsland_North_Volcano"))
    return [{"key": z, "name": nombres[z]} for z in _ZONAS]


def _frase(clave: str, f) -> list[str]:
    if isinstance(f, list):
        return f
    if f is None:
        tipo, lugar, x, y = clave.split("_")
        zona = {"IslandNorth": "N", "IslandWest": "W"}[lugar]
        armar = {("Bush", "N"): _NORTE_A, ("Bush", "W"): _OESTE_A, ("Buried", "N"): _NORTE_E, ("Buried", "W"): _OESTE_E}
        return armar[(tipo, zona)](x, y)
    if f == "banana":
        o = _obj("91")
        return [f"Place a {o[0].lower()} on the jungle shrine.", f"Dejá un {o[1].lower()} en el altar de la jungla."]
    if f == "coconut":
        o = _obj("791")
        return [f"Have Clint crack your first {o[0]}.", f"Pedile a Clint que abra tu primer {o[1].lower()}."]
    if isinstance(f, tuple) and f[0] == "gourmand":
        o = _obj(f[1])
        rana = _par("Strings/WorldMap", "GingerIsland_West_GourmandCave")
        return [f"Grow {o[0]} on the island farm for the {rana[0]}.", f"Cultivá {o[1].lower()} en la granja isleña para la {rana[1]}."]
    raise ValueError(f"nuez sin frase: {clave}")


def nuts() -> list[dict]:
    zonas = _zonas_por_lugar()
    out = []
    for clave, lugar, n, tipo, como, f in _NUECES:
        fila = {"key": clave, "slug": slug(clave), "area": zonas[lugar] if lugar else "Anywhere", "n": n, "kind": tipo,
                "track": como, "text": _frase(clave, f)}
        m = re.fullmatch(r"(?:Bush|Buried)_\w+?_(\d+)_(\d+)", clave)
        if m:
            fila["tile"] = [int(m.group(1)), int(m.group(2))]
        if f is None:
            # Frase genérica (`_arbusto` / `_enterrada`): el sitio las junta como casilleros con su casilla.
            fila["generic"] = True
        out.append(fila)
    return out


def _nombre_mejora(clave: str) -> list[str]:
    if clave in _NOMBRE_MEJORA:
        return _NOMBRE_MEJORA[clave]
    par = _par("Strings/UI", f"UpgradePerch_{clave}")  # "*Awk*... {0} walnuts! *Awk*... Build resort!"
    nombre = [t.split("*Awk*...")[-1].strip().strip("¡!¿?").strip() for t in par]
    return [t[:1].upper() + t[1:] for t in nombre]


def upgrades() -> list[dict]:
    zonas = _zonas_por_lugar()
    out = []
    for k, lugar, costo, carta, pide in _MEJORAS:
        texto = None
        if k in _PIDE_ADEMAS:
            clave, en, es = _PIDE_ADEMAS[k]
            lugar_ = _par("Strings/WorldMap", clave)
            texto = [en.format(lugar_[0]), es.format(lugar_[1])]
        out.append({"key": k, "slug": slug(k), "name": _nombre_mejora(k), "cost": costo, "area": zonas[lugar],
                    "mail": carta, "needs": pide, "needsText": texto})
    return out


def cosa(iid: str, slugs: dict) -> dict:
    """Nombre y, si no tiene ficha en el sitio, tamaño del dibujo de un objeto de la tienda."""
    if iid == "SHOP_TOWN_KEY":
        return {"id": "KeyToTheTown", "name": _tok(sdv.raw("Data/Powers")["KeyToTheTown"]["DisplayName"]), "sprite": [16, 16]}
    if iid.startswith("(O)"):
        out = {"id": iid[3:], "name": _obj(iid[3:])}
        if iid[3:] not in slugs:
            out["sprite"] = [16, 16]
        return out
    if iid.startswith("(BC)"):
        out = {"id": iid, "name": _tok(sdv.raw("Data/BigCraftables")[iid[4:]]["DisplayName"])}
        if iid not in slugs:
            out["sprite"] = [16, 32]
        return out
    if iid.startswith("(F)"):
        campos = sdv.raw("Data/Furniture")[iid[3:]].split("/")
        tam = campos[2].split()
        w, h = (int(tam[0]), int(tam[1])) if len(tam) == 2 else _MUEBLE_POR_TIPO[campos[1]]
        return {"id": iid, "name": _tok(campos[7]), "sprite": [w * 16, h * 16]}
    if iid.startswith("(H)"):
        en, es = sdv.raw("Data/hats")[iid[3:]].split("/"), sdv.raw("Data/hats.es-ES")[iid[3:]].split("/")
        return {"id": iid, "name": [en[5], es[5]], "sprite": [20, 20]}
    raise ValueError(f"objeto de tienda desconocido: {iid}")


def walnut_room() -> list[dict]:
    slugs, _ = mines_data.sitio()
    out = []
    for it in sdv.raw("Data/Shops")["QiGemShop"]["Items"]:
        fila = cosa(it["ItemId"], slugs)
        fila["slug"] = slug(it["Id"].replace("(", "").replace(")", ""))
        fila["recipe"] = bool(it.get("IsRecipe"))
        pide, cuantos = it["TradeItemId"], it["TradeItemAmount"]
        cond = it.get("Condition")
        if pide == f"(O){_GEMA_QI}":
            fila["gems"] = cuantos
            fila["note"] = _CONDICION_TIENDA[cond] if cond else None
        elif pide == f"(O){_NUEZ}":
            # La gema Qi a cambio de una nuez, cuando ya están todas las mejoras del loro (la condición pide sus cartas).
            if not all(f"PLAYER_HAS_MAIL Current {carta}" in cond for _, _, _, carta, _ in _MEJORAS):
                raise ValueError(f"condición inesperada: {cond}")
            fila["gems"] = None
            fila["walnuts"] = cuantos
            fila["note"] = ["After every parrot upgrade", "Con todas las mejoras del loro"]
        else:
            raise ValueError(f"precio inesperado: {it['Id']}")
        out.append(fila)
    return out


_CORCHETE = re.compile(r"\[([A-Za-z0-9_]+)\]")
_LLAVE = re.compile(r"\{(\w+):(\w+)\}")


def _orden_texto(texto: str, lang: str, elementos: dict) -> str:
    """Resuelve "[Clave]" de `Strings/SpecialOrderStrings` y "{Elemento:Campo}" de los `RandomizedElements`."""
    archivo = "Strings/SpecialOrderStrings" + (".es-ES" if lang == "es" else "")
    base = sdv.raw("Strings/SpecialOrderStrings")

    def corchete(m: re.Match) -> str:
        return (sdv.raw(archivo).get(m.group(1)) or base[m.group(1)]).strip()

    for _ in range(3):  # los valores de un elemento pueden traer otra "[Clave]"
        texto = _LLAVE.sub(lambda m: elementos[m.group(1)][m.group(2)], _CORCHETE.sub(corchete, texto))
    return texto.strip()


def _elementos(orden: dict) -> dict[str, dict[str, str]]:
    """Los `RandomizedElements` de un pedido de Qi; todos tienen un único valor posible."""
    out = {}
    for e in orden.get("RandomizedElements") or []:
        if len(e["Values"]) != 1:
            raise ValueError(f"elemento con más de un valor: {e['Name']}")
        partes = e["Values"][0]["Value"].split("|")
        out[e["Name"]] = dict(zip(partes[::2], partes[1::2]))
    return out


def qi_orders() -> list[dict]:
    out = []
    for k, o in sdv.raw("Data/SpecialOrders").items():
        if o.get("OrderType") != "Qi":
            continue
        el = _elementos(o)
        par = lambda t: [_orden_texto(t, "en", el), _orden_texto(t, "es", el)]  # noqa: E731
        metas = [par(x["Text"]) for x in o["Objectives"]]
        meta = [" ".join(m[i] if m[i].endswith(".") else m[i] + "." for m in metas) for i in (0, 1)]
        gemas = [int(r["Data"]["Amount"]) for r in o["Rewards"] if r["Type"] == "Gems"]
        out.append({"key": k, "slug": slug(k), "name": par(o["Name"]), "text": par(o["Text"]), "goal": meta,
                    "gems": sum(gemas), "days": _DIAS[o["Duration"]],
                    # `SpecialOrder.CheckTag`: "NOT_IMPLEMENTED" nunca se cumple, así que el pedido no sale en el juego.
                    "inGame": "NOT_IMPLEMENTED" not in (o.get("RequiredTags") or "")})
    return out


def island() -> dict:
    slugs, nombres = mines_data.sitio()
    nu, wr = nuts(), walnut_room()
    ids = {_NUEZ, _GEMA_QI, "791", "91", "254", "262", "248"} | {w["id"] for w in wr}
    refs = {i: [*slugs[i], *nombres[i], 16, 16] for i in sorted(ids) if i in slugs}
    # Los objetos grandes: `mines_data.sitio` no trae su nombre (sólo el de los `Data/Objects`) y su dibujo mide 16 × 32.
    for w in wr:
        if w["id"].startswith("(BC)") and w["id"] in refs:
            refs[w["id"]] = [*slugs[w["id"]], *w["name"], 16, 32]
    return {"total": TOTAL_NUECES, "areas": areas(), "nuts": nu, "upgrades": upgrades(), "walnutRoom": wr,
            "qiOrders": qi_orders(), "refs": refs}


def main() -> None:
    d = island()
    if sum(n["n"] for n in d["nuts"]) != TOTAL_NUECES:
        raise SystemExit("las nueces no suman 130")
    ruta = DATA / "island.json"
    ruta.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("island.json", ruta.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
