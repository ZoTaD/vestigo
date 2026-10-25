"""Datos del predictor de Stardew Valley (1.6.15): lo que el sitio necesita para repetir los sorteos del juego.

Uso: python games/stardew/tools/predict_data.py

Escribe `games/stardew/data/predict.json`. Todo sale de `Data/*` y `Strings/*` (con su `.es-ES`); lo que el juego tiene
escrito en el código (la caja misteriosa, qué cultivo barato sale en cada estación) no se copia acá más que en sus
tablas chicas: la lógica de cada sorteo vive en `site/src/stardew/predict/`.

Qué conserva cada parte y por qué (los métodos del juego que la leen):
- `objects` y `furniture`: `ItemQueryResolver.DefaultResolvers.RANDOM_ITEMS` baraja `GetAllData()` con un
  `random.Next()` por cada entrada, así que hay que guardarlas TODAS y en orden, aunque no puedan salir en el carro.
- `geodes`: `Utility.getTreasureFromGeode` lee `GeodeDrops` y `GeodeDropsDefaultItems` del objeto.
- `traveler`: `ShopBuilder.GetShopStock` sobre `Data/Shops` "Traveler".
- `lowGradeCrops`, `raccoonSeeds`: `Crop.getRandomLowGradeCropForThisSeason`, `Utility.getRaccoonSeedForCurrentTimeOfYear`.
- `festivals`: `Utility.isFestivalDay` (`Data/Festivals/FestivalDates`) y `Data/PassiveFestivals`.
- `weather`: `WeatherConditions` del contexto `Default` de `Data/LocationContexts`.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crops_data  # noqa: E402
import sdv  # noqa: E402

DATA = crops_data.DATA

# Los ids de geoda que el predictor sortea (Geoda, helada, de magma, omni, cofre de artefactos y coco dorado).
_GEODAS = ["535", "536", "537", "749", "275", "791"]
# Estaciones en el orden del `enum Season` del juego (índice 0 a 3).
_ESTACIONES = ["spring", "summer", "fall", "winter"]
# `RANDOM_ITEMS (F) 0 1612`: el rango de ids del carro para los muebles (`Data/Shops` "Traveler", entrada RandomFurniture).
_RANGO_MUEBLES = (0, 1612)

# Valores por omisión de un `ShopItemData` / `GenericSpawnItemData` / `QuantityModifier` del juego. Si una entrada
# trae otra cosa en un campo que el predictor no lee, se corta con un error: el juego cambió y hay que mirar el código.
_IGNORADOS_ITEM = {
    "ObjectInternalName": None, "ObjectDisplayName": None, "ObjectColor": None, "ToolUpgradeLevel": -1,
    "QualityModifiers": None, "QualityModifierMode": 0, "ModData": None, "CustomFields": None,
}
_IGNORADOS_TIENDA = {"ActionsOnPurchase": None, "TradeItemId": None, "TradeItemAmount": 1, "Quality": -1}
_IGNORADOS_GEODA = {"MaxItems": None, "PerItemCondition": None, "Quality": -1, "IsRecipe": False, "StackModifierMode": 0}


def _verificar(d: dict, esperado: dict, que: str) -> None:
    for campo, valor in esperado.items():
        if d.get(campo) != valor:
            raise ValueError(f"{que}: {campo} = {d.get(campo)!r}, el predictor supone {valor!r}")


def _modificadores(lista: list | None) -> list | None:
    """`QuantityModifier` -> {condition?, mod, amount, random?} (`mod`: 0 suma, 1 resta, 2 multiplica, 3 divide, 4 fija)."""
    if not lista:
        return None
    sal = []
    for m in lista:
        x = {}
        if m["Condition"]:
            x["condition"] = m["Condition"]
        x["mod"] = m["Modification"]
        x["amount"] = m["Amount"]
        if m["RandomAmount"]:
            x["random"] = m["RandomAmount"]
        sal.append(x)
    return sal


# --- Objetos y muebles ----------------------------------------------------------------------------------------------

def objects() -> list:
    """`[id, categoría, tipo, precio, banderas]` de cada entrada de `Data/Objects`, en el orden del archivo.

    Banderas: 1 = `ExcludeFromRandomSale`. La categoría y el tipo son los de `ITEM_HAS_EXPLICIT_OBJECT_CATEGORY`
    (categoría < 0), `ITEM_CATEGORY` y `ITEM_OBJECT_TYPE`; el precio, el de `salePrice` / `Object.Price` (`@requirePrice`).
    """
    return [[i, o["Category"], o["Type"], o["Price"], 1 if o["ExcludeFromRandomSale"] else 0]
            for i, o in sdv.raw("Data/Objects").items()]


def _booleano(s: str | None) -> bool:
    return (s or "").strip().lower() == "true"


def furniture() -> list:
    """`[id, precio, banderas]` de cada mueble de `Data/Furniture`, en el orden del archivo.

    Campos del mueble (separados por `/`): 5 es el precio (`Furniture.salePrice`) y 10 si queda afuera de la venta al
    azar (`FurnitureDataDefinition.GetData`). Banderas: 1 = `ExcludeFromRandomSale`.
    """
    sal = []
    for i, linea in sdv.raw("Data/Furniture").items():
        c = linea.split("/")
        sal.append([i, int(c[5]), 1 if _booleano(c[10] if len(c) > 10 else None) else 0])
    return sal


def mueble_elegible(id_: str, precio: int, banderas: int) -> bool:
    """Si `RANDOM_ITEMS (F) 0 1612 @requirePrice @isRandomSale` puede devolver este mueble."""
    return id_.isdigit() and _RANGO_MUEBLES[0] <= int(id_) <= _RANGO_MUEBLES[1] and precio > 0 and not banderas & 1


# --- Nombres de lo que no tiene ficha -------------------------------------------------------------------------------

def _par(en: str, es: str) -> list[str]:
    return [en, es or en]


def _nombre_token(token: str) -> list[str]:
    return _par(sdv.text(token, "en"), sdv.text(token, "es"))


def _nombre_gorro(id_: str) -> list[str]:
    """Un sombrero: el nombre a mostrar es el campo 5 de `Data/hats` (el español, en `hats.es-ES`)."""
    en = sdv.raw("Data/hats")[id_].split("/")
    try:
        es = sdv.raw("Data/hats.es-ES")[id_].split("/")
    except (FileNotFoundError, KeyError):
        es = en
    return _par(en[5], es[5])


def _nombre(clave: str) -> list[str]:
    """El nombre en inglés y español de un id calificado que no es un objeto `(O)`."""
    tipo, id_ = re.match(r"\((\w+)\)(.*)", clave).groups()
    if tipo == "F":
        return _nombre_token(sdv.raw("Data/Furniture")[id_].split("/")[7])
    if tipo == "H":
        return _nombre_gorro(id_)
    if tipo == "S":
        return _nombre_token(sdv.raw("Data/Shirts")[id_]["DisplayName"])
    if tipo == "W":
        return _nombre_token(sdv.raw("Data/Weapons")[id_]["DisplayName"])
    if tipo == "BC":
        return _nombre_token(sdv.raw("Data/BigCraftables")[id_]["DisplayName"])
    if tipo == "WP":  # `WallpaperDataDefinition.GetData`: todos los papeles se llaman igual
        return _nombre_token(r"[LocalizedText Strings\StringsFromCSFiles:Wallpaper.cs.13204]")
    raise ValueError(f"No sé nombrar {clave}")


# Lo que el código del juego devuelve sin ser un objeto `(O)` (`Utility.getTreasureFromGeode`).
_FIJOS = ["(H)MysteryHat", "(S)MysteryShirt", "(WP)MoreWalls:11", "(BC)272", "(W)60"]


def _con_calificador(id_: str | None) -> list[str]:
    """Sólo los ids calificados que no son objetos (una consulta como `RANDOM_ITEMS ...` no es un id)."""
    return [id_] if id_ and re.match(r"\(\w+\)", id_) and not id_.startswith("(O)") else []


def names(muebles: list, geodas: dict, carro: list) -> dict:
    """Nombre `[en, es]` de cada mueble que el carro puede sacar y de todo lo que no sea `(O)` que el predictor nombra.

    Los objetos `(O)` ya tienen nombre y ficha en el sitio (`names-*.json`).
    """
    claves = [f"(F){i}" for i, precio, ban in muebles if mueble_elegible(i, precio, ban)]
    for g in geodas.values():
        for d in g["drops"]:
            claves += _con_calificador(d.get("itemId"))
            for r in d.get("randomItemId", []):
                claves += _con_calificador(r)
    for e in carro:
        claves += _con_calificador(e.get("itemId"))
        for r in e.get("randomItemId", []):
            claves += _con_calificador(r)
    claves += _FIJOS
    return {c: _nombre(c) for c in dict.fromkeys(claves)}


# --- Geodas -----------------------------------------------------------------------------------------------------------

def geodes() -> dict:
    """Por geoda: `defaultItems` (`GeodeDropsDefaultItems`) y `drops` (`GeodeDrops`).

    Cada premio: id, chance, precedence y, si los tiene, condition, itemId, randomItemId, minStack, maxStack,
    stackModifiers y setFlagOnPickup (`Utility.getTreasureFromGeode` + `ItemQueryResolver.TryResolve`).
    """
    objs = sdv.raw("Data/Objects")
    sal = {}
    for g in _GEODAS:
        o = objs[g]
        drops = []
        for d in o["GeodeDrops"]:
            _verificar(d, _IGNORADOS_ITEM | _IGNORADOS_GEODA, f"geoda {g}/{d['Id']}")
            x = {"id": d["Id"], "chance": d["Chance"], "precedence": d["Precedence"]}
            for clave, campo in [("condition", "Condition"), ("itemId", "ItemId"), ("randomItemId", "RandomItemId"),
                                 ("setFlagOnPickup", "SetFlagOnPickup")]:
                if d[campo]:
                    x[clave] = d[campo]
            for clave, campo in [("minStack", "MinStack"), ("maxStack", "MaxStack")]:
                if d[campo] != -1:
                    x[clave] = d[campo]
            mods = _modificadores(d["StackModifiers"])
            if mods:
                x["stackModifiers"] = mods
            drops.append(x)
        sal[g] = {"defaultItems": o["GeodeDropsDefaultItems"], "drops": drops}
    return sal


# --- Carro ambulante --------------------------------------------------------------------------------------------------

def traveler() -> list:
    """Las entradas de `Data/Shops` "Traveler", con los campos que lee `ShopBuilder.GetShopStock`.

    Sólo se guarda lo que no vale el valor por omisión (ver `PredictData` en `query.ts`); `id` y `price` van siempre.
    """
    tienda = sdv.raw("Data/Shops")["Traveler"]
    _verificar(tienda, {"PriceModifiers": None, "PriceModifierMode": 0, "ApplyProfitMargins": False,
                        "SalableItemTags": None}, "tienda Traveler")
    sal = []
    for e in tienda["Items"]:
        _verificar(e, _IGNORADOS_ITEM | _IGNORADOS_TIENDA, f"carro/{e['Id']}")
        x = {"id": e["Id"], "price": e["Price"]}
        for clave, campo, omision in [
            ("condition", "Condition", None), ("itemId", "ItemId", None), ("randomItemId", "RandomItemId", None),
            ("maxItems", "MaxItems", None), ("minStack", "MinStack", -1), ("maxStack", "MaxStack", -1),
            ("applyProfitMargins", "ApplyProfitMargins", None), ("availableStock", "AvailableStock", 1),
            ("availableStockLimit", "AvailableStockLimit", 0), ("avoidRepeat", "AvoidRepeat", False),
            ("useObjectDataPrice", "UseObjectDataPrice", False),
            ("ignoreShopPriceModifiers", "IgnoreShopPriceModifiers", False),
            ("priceModifierMode", "PriceModifierMode", 0), ("availableStockModifierMode", "AvailableStockModifierMode", 0),
            ("isRecipe", "IsRecipe", False), ("perItemCondition", "PerItemCondition", None),
            ("stackModifierMode", "StackModifierMode", 0),
        ]:
            if e[campo] != omision:
                x[clave] = e[campo]
        for clave, campo in [("priceModifiers", "PriceModifiers"), ("availableStockModifiers", "AvailableStockModifiers"),
                             ("stackModifiers", "StackModifiers")]:
            mods = _modificadores(e[campo])
            if mods:
                x[clave] = mods
        sal.append(x)
    return sal


# --- Cultivos baratos y semillas del mapache --------------------------------------------------------------------------

def low_grade_crops() -> dict:
    """Los cultivos de `Crop.getRandomLowGradeCropForThisSeason`, en el orden de su `Next(n)`.

    Primavera: `Next(472, 476)`; verano: `Next(4)` con 0 => 487, 1 => 483, 2 => 482, 3 => 484; otoño: `Next(487, 491)`.
    En invierno el juego elige antes una de las otras tres estaciones con `Game1.random.Choose`.
    """
    return {"spring": [str(i) for i in range(472, 476)], "summer": ["487", "483", "482", "484"],
            "fall": [str(i) for i in range(487, 491)]}


def raccoon_seeds() -> dict:
    """`Utility.getRaccoonSeedForCurrentTimeOfYear`: la semilla de cada estación (`seeds`, por índice de `Season`) y el
    último día de la estación en que sigue siendo la suya (`lastDay`; pasado ese día, la de la estación siguiente)."""
    return {"seeds": ["CarrotSeeds", "SummerSquashSeeds", "BroccoliSeeds", "PowdermelonSeeds"],
            "lastDay": [23, 20, 20, 20]}


# --- Festivales y clima -----------------------------------------------------------------------------------------------

def festivals() -> dict:
    """`days` (`Utility.isFestivalDay`: días de festival por estación), `names` (festival -> [en, es]) y `passive`
    (`Data/PassiveFestivals`: season 0 a 3, startDay, endDay, startTime, condition?, name?, mapReplacements?)."""
    fechas = sdv.raw("Data/Festivals/FestivalDates")
    fechas_es = sdv.raw("Data/Festivals/FestivalDates.es-ES")
    dias = {e: [] for e in _ESTACIONES}
    for clave in fechas:
        est, dia = re.fullmatch(r"([a-z]+)(\d+)", clave).groups()
        dias[est].append(int(dia))
    pasivos = []
    for id_, p in sdv.raw("Data/PassiveFestivals").items():
        x = {"id": id_, "season": p["Season"], "startDay": p["StartDay"], "endDay": p["EndDay"], "startTime": p["StartTime"]}
        if p["Condition"]:
            x["condition"] = p["Condition"]
        if p["DisplayName"]:
            x["name"] = _nombre_token(p["DisplayName"])
        if p["MapReplacements"]:
            x["mapReplacements"] = list(p["MapReplacements"])
        pasivos.append(x)
    return {"days": {e: sorted(d) for e, d in dias.items()},
            "names": {c: _par(n, fechas_es.get(c, n)) for c, n in fechas.items()}, "passive": pasivos}


def weather() -> list:
    """`WeatherConditions` del contexto `Default` de `Data/LocationContexts`, en orden: `LocationWeather` toma la primera
    cuyo `condition` se cumple."""
    return [{"id": w["Id"], **({"condition": w["Condition"]} if w["Condition"] else {}), "weather": w["Weather"]}
            for w in sdv.raw("Data/LocationContexts")["Default"]["WeatherConditions"]]


def predict() -> dict:
    muebles, geodas, carro = furniture(), geodes(), traveler()
    return {"objects": objects(), "furniture": muebles, "names": names(muebles, geodas, carro), "geodes": geodas,
            "traveler": carro, "lowGradeCrops": low_grade_crops(), "raccoonSeeds": raccoon_seeds(),
            "festivals": festivals(), "weather": weather()}


def main() -> None:
    ruta = DATA / "predict.json"
    ruta.write_text(json.dumps(predict(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("predict.json", ruta.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
