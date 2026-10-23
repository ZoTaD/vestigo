"""Datos del lector de partida de Stardew Valley para el sitio: la perfección y lo que cuenta cada parte.

Uso: python games/stardew/tools/save_data.py

Escribe `games/stardew/data/save.json`. Lo que está en `Data/*` se lee de ahí; las reglas que el juego tiene en el
código se copiaron como valores a las tablas de abajo (cada una nombra el método de origen).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import relations  # noqa: E402
import sdv  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"

# Partes de la perfección, en el orden de la pantalla del juego: (clave, clave de texto en Strings/UI, peso).
# Pesos de `Utility.percentGameComplete`; suman 100. Los totales salen de cada función de abajo.
_PARTES = [
    ("shipped", "PT_Shipped", 15), ("obelisks", "PT_Obelisks", 4), ("clock", "PT_GoldClock", 10),
    ("slayer", "PT_MonsterSlayer", 10), ("friends", "PT_GreatFriends", 11), ("level", "PT_FarmerLevel", 5),
    ("stardrops", "PT_Stardrops", 10), ("cooking", "PT_Cooking", 10), ("crafting", "PT_Crafting", 10),
    ("fish", "PT_Fish", 10), ("walnuts", "PT_GoldenWalnut", 5),
]
# `Utility.percentGameComplete`: Math.Min(farmer.Level, 25f) / 25f y `GoldenWalnutsFound` sobre 130.
_NIVEL_MAXIMO = 25
_NUECES = 130
# `Utility.GetObeliskTypesBuilt` (los cuatro obeliscos) y `percentGameComplete` ("Gold Clock").
_OBELISCOS = ["Water Obelisk", "Earth Obelisk", "Desert Obelisk", "Island Obelisk"]
_RELOJ = "Gold Clock"
# `Object.isPotentialBasicShipped` (lo usa `Utility.getFarmerItemsShippedPercent`): el grano de café (433) siempre cuenta; no cuentan los tipos de la primera
# lista ni las categorías de la segunda; y se respeta `ExcludeFromShippingCollection`.
_ENVIO_SIEMPRE = {"433"}
_ENVIO_TIPOS_FUERA = {"Arch", "Fish", "Minerals", "Cooking"}
_ENVIO_CATEGORIAS_FUERA = {-999, -103, -102, -96, -74, -29, -24, -22, -21, -20, -19, -14, -12, -8, -7, -2, 0}
# `Utility.getCraftedRecipesPercent`: el anillo de bodas no cuenta.
_FABRICACION_FUERA = {"Wedding Ring"}
# `Utility.getMaxedFriendshipPercent`: 250 puntos por corazón; 8 corazones si se puede casar, si no 10.
_CORAZONES_ROMANCE = 8
_CORAZONES = 10
# `Utility.foundAllStardrops` / `numStardropsFound`: la marca de correo de cada fruto estelar y, con textos del
# juego, dónde se consigue. Cada nombre es una lista de partes: ("t", archivo, clave) son textos del juego,
# ("l", en, es) el conector propio. "CF_Mines" también vale si se abrió el cofre del piso 100.
_FRUTOS = [
    ("CF_Fair", [("fest", "fall16")]),
    ("CF_Fish", [("logro", "26")]),
    ("CF_Mines", [("t", "Strings/StringsFromCSFiles", "MapPage.cs.11098"), ("l", ", piso 100", ", level 100")]),
    ("CF_Sewer", [("t", "Strings/NPCNames", "Krobus")]),
    ("CF_Spouse", [("l", "Pareja", "Spouse")]),
    ("CF_Statue", [("estatua", "Woods_Statue")]),
    ("museumComplete", [("t", "Strings/StringsFromCSFiles", "Utility.cs.5823")]),
]


def _texto(archivo: str, clave: str) -> list[str]:
    en = sdv.raw(archivo)[clave]
    return [en, sdv.raw(archivo + ".es-ES").get(clave) or en]


def _objetos() -> dict[str, dict]:
    return sdv.raw("Data/Objects")


def shippable() -> list[str]:
    """Ids que cuentan en "Productos y recolección enviados" (`Object.isPotentialBasicShipped`)."""
    out = []
    for i, o in _objetos().items():
        if i in _ENVIO_SIEMPRE:
            out.append(i)
        elif o.get("Type") in _ENVIO_TIPOS_FUERA or o.get("Category") in _ENVIO_CATEGORIAS_FUERA:
            continue
        elif not o.get("ExcludeFromShippingCollection"):
            out.append(i)
    return out


def fish() -> list[str]:
    """Peces de "Peces pescados" (`Utility.getFishCaughtPercent`): tipo Fish y no excluidos de la colección."""
    return [i for i, o in _objetos().items() if o.get("Type") == "Fish" and not o.get("ExcludeFromFishingCollection")]


def _recetas(kind: str) -> list[dict]:
    return [
        {"key": r["key"], "out": r["out"]}
        for r in relations.recipes()
        if r["kind"] == kind and r["key"] not in _FABRICACION_FUERA
    ]


def _nombre_fruto(partes: list[tuple]) -> list[str]:
    en, es = "", ""
    for p in partes:
        if p[0] == "t":
            t = _texto(p[1], p[2])
        elif p[0] == "l":
            t = [p[2], p[1]]
        elif p[0] == "fest":
            t = _texto("Data/Festivals/FestivalDates", p[1])
        elif p[0] == "logro":
            t = [sdv.raw("Data/Achievements")[p[1]].split("^")[0], sdv.raw("Data/Achievements.es-ES")[p[1]].split("^")[0]]
        else:  # la estatua del Viejo maestro Cannoli: "--Nombre--\nfrase"
            t = [x.split("--")[1] for x in _texto("Strings/Locations", p[1])]
        en += t[0]
        es += t[1]
    return [en, es]


def stardrops() -> list[dict]:
    return [{"flag": flag, "name": _nombre_fruto(partes)} for flag, partes in _FRUTOS]


def slayer() -> list[dict]:
    return [
        {
            "key": k, "name": [sdv.text(q["DisplayName"], "en"), sdv.text(q["DisplayName"], "es")],
            "targets": list(q["Targets"]), "count": q["Count"],
        }
        for k, q in sdv.raw("Data/MonsterSlayerQuests").items()
    ]


def friends() -> list[dict]:
    """Aldeanos de "Grandes amigos" (`Utility.getMaxedFriendshipPercent`): con PerfectionScore y que se puedan tratar."""
    out = []
    for k, c in sdv.raw("Data/Characters").items():
        if not c.get("PerfectionScore") or str(c.get("CanSocialize") or "").strip().upper() == "FALSE":
            continue
        out.append({"key": k, "max": _CORAZONES_ROMANCE if c.get("CanBeRomanced") else _CORAZONES})
    return out


def queen_of_sauce() -> dict[str, str]:
    """Semana -> receta que enseña la Reina de la Salsa (`Data/TV/CookingChannel`; la clave es la de la receta)."""
    return {sem: v.split("/")[0] for sem, v in sdv.raw("Data/TV/CookingChannel").items()}


def save() -> dict:
    envio, peces, cocina, fabrica, amigos, cazador = shippable(), fish(), _recetas("cook"), _recetas("craft"), friends(), slayer()
    totales = {
        "shipped": len(envio), "obelisks": len(_OBELISCOS), "clock": 1, "slayer": len(cazador),
        "friends": len(amigos), "level": _NIVEL_MAXIMO, "stardrops": len(_FRUTOS), "cooking": len(cocina),
        "crafting": len(fabrica), "fish": len(peces), "walnuts": _NUECES,
    }
    return {
        "perfection": [
            {"key": k, "name": _texto("Strings/UI", t), "weight": w, "total": totales[k]} for k, t, w in _PARTES
        ],
        "shippable": envio,
        "fish": peces,
        "cooking": cocina,
        "crafting": fabrica,
        "stardrops": stardrops(),
        "obelisks": list(_OBELISCOS),
        "clock": _RELOJ,
        "slayer": cazador,
        "friends": amigos,
        "walnuts": _NUECES,
        "queenOfSauce": queen_of_sauce(),
    }


def main() -> None:
    ruta = DATA / "save.json"
    ruta.write_text(json.dumps(save(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("save.json", ruta.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
