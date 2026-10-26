"""Pesca, recetas y máquinas de Stardew Valley para el sitio.

Uso: python games/stardew/tools/more_data.py

Escribe `games/stardew/data/fish.json` y `recipes.json`. Los slugs son los de la lista del sitio
(`crops_data._sitio`); los nombres de lugar salen de `site_data.Nombres` y el resto de los textos del juego.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crops_data  # noqa: E402
import relations  # noqa: E402
import sdv  # noqa: E402

DATA = crops_data.DATA
MINUTOS_POR_DIA = crops_data.MINUTOS_POR_DIA
# Habilidades: nombre en los datos -> clave de texto en Strings/StringsFromCSFiles.
_HABILIDADES = {
    "Farming": "SkillsPage.cs.11604", "Mining": "SkillsPage.cs.11605", "Foraging": "SkillsPage.cs.11606",
    "Fishing": "SkillsPage.cs.11607", "Combat": "SkillsPage.cs.11608", "Luck": "SkillsPage.cs.11609",
}
# Categorías de ingrediente con nombre propio en `CraftingRecipe.cs.568-574` ("Egg (Any)", …).
_INGREDIENTES = {
    "-81": "CraftingRecipe.cs.568", "-2": "CraftingRecipe.cs.569", "-75": "CraftingRecipe.cs.570",
    "-4": "CraftingRecipe.cs.571", "-5": "CraftingRecipe.cs.572", "-6": "CraftingRecipe.cs.573",
    "-777": "CraftingRecipe.cs.574",
}
# El submarino y la playa del Mercado nocturno sólo existen del 15 al 17 de invierno.
_SOLO_INVIERNO = {"Submarine", "BeachNightMarket"}
# Peces de las Minas: el juego los reparte por piso en el código (`MineShaft.getFish`), no en Data/Locations.
_PECES_DE_LAS_MINAS = {"158", "161"}
# Peces que además de su lugar en Data/Locations se pescan en las Minas: la Anguila de lava (piso 100).
_TAMBIEN_EN_LAS_MINAS = {"162"}
# Zonas de la Isla Jengibre: el juego las nombra igual; la zona es texto nuestro [en, es].
_ZONAS_ISLA = {
    "IslandNorth": ["north", "norte"], "IslandSouth": ["south", "sur"],
    "IslandSouthEast": ["southeast", "sureste"], "IslandWest": ["west", "oeste"],
}
# Granjas con nombre propio en Strings/UI (`<Nombre>_<descripción>`).
_GRANJAS = {"Farm_Forest": "Character_FarmForaging", "Farm_Beach": "Character_FarmBeach"}


def _texto(archivo: str, clave: str) -> list[str]:
    en = sdv.raw(archivo)[clave]
    return [en, sdv.raw(archivo + ".es-ES").get(clave) or en]


def _nombre_categoria(cat: str) -> list[str]:
    if cat in _INGREDIENTES:
        return _texto("Strings/StringsFromCSFiles", _INGREDIENTES[cat])
    return list(sdv.CATEGORIES[int(cat)])


def _horas(texto: str) -> list[list[int]]:
    n = [int(x) for x in texto.split()]
    return [[n[i], n[i + 1]] for i in range(0, len(n) - 1, 2)]


def _estaciones(texto: str) -> list[int]:
    return [relations.SEASONS.index(s) for s in texto.split() if s in relations.SEASONS]


_QI = "PLAYER_SPECIAL_ORDER_RULE_ACTIVE Current LEGENDARY_FAMILY"


def _clima_de_condicion(cond: str) -> str:
    """El clima que pide la condición de una entrada (`WEATHER Here Rain Storm GreenRain`); "both" si no pide."""
    for parte in cond.split(","):
        p = parte.split()
        if len(p) >= 3 and p[0] == "WEATHER":
            lluvia = any(x in ("Rain", "Storm", "GreenRain") for x in p[2:])
            sol = "Sun" in p[2:]
            return "rainy" if lluvia and not sol else "sunny" if sol and not lluvia else "both"
    return "both"


def _lugares_por_pez() -> tuple[dict[str, dict[str, dict]], set[str], set[str]]:
    """pez -> lugar -> {estaciones, reglas propias, nivel}, los legendarios y los del Sr. Qi.

    La estación es la de la entrada (`Season` o la `LOCATION_SEASON` de su condición; todo el año si no pide): en 1.6
    la de `Data/Fish` no cuenta. Una entrada con `IgnoreFishDataRequirements` tampoco usa las horas, el clima ni el
    nivel de `Data/Fish`: vale el clima de su `Condition`, a cualquier hora (`own`), y su propio `MinFishingLevel`. Las
    entradas de festival (`IS_PASSIVE_FESTIVAL_OPEN`: Derby de truchas, SquidFest) repiten la normal y no cuentan.
    """
    fish = sdv.raw("Data/Fish")
    lugares: dict[str, dict[str, dict]] = {}
    legendarios: set[str] = set()
    qi_si: set[str] = set()
    qi_no: set[str] = set()
    for lugar, loc in sdv.raw("Data/Locations").items():
        for e in loc.get("Fish") or []:
            iid = relations._sin_prefijo(e.get("ItemId") or "")
            if iid not in fish or lugar in relations.LUGARES_FUERA:
                continue
            cond = e.get("Condition") or ""
            if "IS_PASSIVE_FESTIVAL_OPEN" in cond:
                continue
            if e.get("IsBossFish") or "LEGENDARY_FAMILY" in cond:
                legendarios.add(iid)
            (qi_si if _QI in cond and "!" + _QI not in cond else qi_no).add(iid)
            ign = bool(e.get("IgnoreFishDataRequirements"))
            estaciones = relations.estaciones_de_entrada(e)
            if lugar in _SOLO_INVIERNO:
                estaciones = {3}
            elif estaciones is None:
                estaciones = {0, 1, 2, 3}
            # El nivel: el de la entrada y, si no ignora los requisitos del pez, también el de `Data/Fish`.
            nivel = max(e.get("MinFishingLevel") or 0, 0 if ign else int(fish[iid].split("/")[12]))
            r = lugares.setdefault(iid, {}).setdefault(
                lugar, {"seasons": set(), "own": None, "normal": False, "level": nivel})
            r["seasons"] |= estaciones
            r["level"] = min(r["level"], nivel)
            if ign:
                clima = _clima_de_condicion(cond)
                r["own"] = clima if r["own"] in (None, clima) else "both"
            else:
                r["normal"] = True
    for por_lugar in lugares.values():
        for r in por_lugar.values():
            # Con una entrada común en el mismo lugar, rigen las del pez.
            r["own"] = None if r["normal"] or r["own"] is None else {"weather": r["own"]}
    return lugares, legendarios, qi_si - qi_no


def fish() -> dict:
    from site_data import Nombres  # import tardío: site_data importa crops_data

    slugs, _ = crops_data._sitio()
    nom = crops_data._nombres_objetos()
    nombres = Nombres()
    lugares, legendarios, qi = _lugares_por_pez()
    peces, usados = [], {}

    def nombre_lugar(clave: str) -> list[str]:
        if clave in _GRANJAS:
            en, es = _texto("Strings/UI", _GRANJAS[clave])
            return [en.split("_")[0], es.split("_")[0]]
        if clave == "CrabPot:freshwater":  # el juego no nombra el agua dulce: río y lago
            base = _texto("Strings/Objects", "CrabPot_Name")
            rio = _texto("Strings/StringsFromCSFiles", "TV_Fishing_Channel_River")
            lago = _texto("Strings/StringsFromCSFiles", "TV_Fishing_Channel_Lake")
            return [f"{base[i]} ({rio[i].lower()} / {lago[i].lower()})" for i in (0, 1)]
        if clave in _ZONAS_ISLA:
            isla = nombres.lugar(clave)
            return [f"{isla[i]} ({_ZONAS_ISLA[clave][i]})" for i in (0, 1)]
        return nombres.lugar(clave)

    def lugar(clave: str, estaciones, own=None) -> dict:
        usados.setdefault(clave, nombre_lugar(clave))
        out = {"key": clave, "name": usados[clave],
               "seasons": None if estaciones is None else sorted(estaciones)}
        if own:
            out["own"] = own
        return out

    for iid, linea in sdv.raw("Data/Fish").items():
        if iid not in slugs or iid not in nom:
            continue
        c = linea.split("/")
        base = {"id": iid, "slug": slugs[iid][0], "slugEs": slugs[iid][1], "name": nom[iid]}
        if c[1] == "trap":  # trampa de cangrejos: el agua es el campo 4
            peces.append({
                **base, "difficulty": 0, "behavior": "trap", "times": [], "seasons": [0, 1, 2, 3],
                "weather": "both", "minLevel": 0, "legendary": False, "crabPot": True,
                "places": [lugar("CrabPot:" + c[4], None)],
            })
            continue
        donde = lugares.get(iid, {})
        # Las del valle (la isla es verano todo el año y haría "todo el año" al Pez globo); si sólo vive en la isla,
        # las de la isla. Sin lugar en Data/Locations (los de las Minas), las de Data/Fish.
        valle = [r["seasons"] for k, r in donde.items() if not (k.startswith("Island") or k == "Caldera")]
        estaciones = set().union(*(valle or [r["seasons"] for r in donde.values()])) if donde else set(_estaciones(c[6]))
        peces.append({
            **base, "difficulty": int(c[1]), "behavior": c[2], "times": _horas(c[5]),
            "seasons": sorted(estaciones), "weather": c[7],
            "minLevel": min((r["level"] for r in donde.values()), default=int(c[12])),
            "legendary": iid in legendarios, "crabPot": False,
            **({"qiOrder": True} if iid in qi else {}),
            "places": [lugar(k, r["seasons"], r["own"]) for k, r in donde.items()]
            or ([lugar("UndergroundMine", None)] if iid in _PECES_DE_LAS_MINAS else []),
        })
        if iid in _TAMBIEN_EN_LAS_MINAS:
            peces[-1]["places"].append(lugar("UndergroundMine", None))
    if nombres.sin_texto:
        print("lugares sin texto del juego:", sorted(nombres.sin_texto))
    return {"fish": peces, "places": [{"key": k, "name": n} for k, n in sorted(usados.items())]}


def _desbloqueo(clave: str, tipo: str, campo: str, tv: set[str], tienda: list | None) -> dict:
    """`default`, `s Farming 3`, `f Gus 5`, `l 4`; la TV por la lista del canal de cocina y la tienda que vende la receta.

    La TV manda sobre una habilidad que no sube (Suerte: el Almuerzo de la suerte) y se suma a la amistad (la Bisque
    de langosta, también de Willy). `l 100` es "nunca por nivel": se compra (Ginger Ale en el Enano del volcán, el
    Triple Shot Espresso en el Saloon…).
    """
    p = campo.split()
    if p == ["default"] or p == ["l", "0"]:  # `l 0`: recetas de fabricación que se saben desde el principio
        return {"type": "default"}
    en_tv = tipo == "cook" and clave in tv
    if p[0] == "s" and len(p) == 3 and not (en_tv and p[1] == "Luck"):
        return {"type": "skill", "skill": p[1], "level": int(p[2]), **({"tv": True} if en_tv else {})}
    if p[0] == "f" and len(p) == 3:
        return {"type": "friend", "npc": p[1], "hearts": int(p[2]), **({"tv": True} if en_tv else {})}
    if en_tv:
        return {"type": "tv"}
    if tienda:
        return {"type": "shop", "shop": tienda[0], **({"price": tienda[1]} if tienda[1] > 0 else {})}
    if p[0] == "l" and len(p) == 2 and p[1] != "100":
        return {"type": "other", "level": int(p[1])}
    return {"type": "other"}


def recipes() -> dict:
    from site_data import Nombres

    slugs, _ = crops_data._sitio()
    nom = crops_data._nombres_objetos()
    nombres = Nombres()
    tv = {v.split("/")[0] for v in sdv.raw("Data/TV/CookingChannel").values()}
    campos_desbloqueo = {
        ("craft", k): v.split("/")[4] for k, v in sdv.raw("Data/CraftingRecipes").items()
    } | {("cook", k): v.split("/")[3] for k, v in sdv.raw("Data/CookingRecipes").items()}
    grandes = sdv.raw("Data/BigCraftables")

    def nombre_id(i: str) -> list[str]:
        if i.startswith("(BC)"):
            return crops_data._nombre(grandes[i[4:]]["DisplayName"])
        return nom.get(i) or [i, i]

    # Las tiendas que venden recetas (`IsRecipe`): el ítem es lo que sale de la receta. La primera que la vende.
    tiendas: dict[str, list] = {}
    for clave, t in sdv.raw("Data/Shops").items():
        for it in t["Items"]:
            if it.get("IsRecipe"):
                tiendas.setdefault(relations._sin_prefijo(it["ItemId"]), [clave, it.get("Price", -1)])
    lista, usados_items, usados_cats, skills, npcs, shops = [], set(), set(), set(), set(), set()
    for r in relations.recipes():
        unlock = _desbloqueo(r["key"], r["kind"], campos_desbloqueo[(r["kind"], r["key"])], tv, tiendas.get(r["out"]))
        if unlock["type"] == "shop":
            shops.add(unlock["shop"])
        if unlock["type"] == "skill":
            skills.add(unlock["skill"])
        elif unlock["type"] == "friend":
            npcs.add(unlock["npc"])
        for i, _ in r["ings"]:
            (usados_cats if i.startswith("-") else usados_items).add(i)
        usados_items.add(r["out"])
        lista.append({"kind": r["kind"], "out": r["out"], "qty": r["qty"], "name": r["name"],
                      "ings": r["ings"], "unlock": unlock})
    por_salida = {r["out"]: n for n, r in enumerate(lista) if r["kind"] == "craft"}

    reglas_por_maquina: dict[str, list[dict]] = {}
    for entrada, reglas in relations.machines_by_input().items():
        for m in reglas:
            if "flavor" in m:
                salida = nombres.producto(m["out"], m["flavor"], nom)
            else:
                salida = nombre_id(m["out"])
            regla = {
                "in": entrada, "inName": nom[entrada], "out": m["out"], "outName": salida,
                "minutes": m["minutes"] + m["days"] * MINUTOS_POR_DIA, "price": m["price"],
            }
            if "flavor" in m:
                regla["flavor"] = m["flavor"]
            if m["count"] != 1:
                regla["count"] = m["count"]
            if m["stack"] > 1:
                regla["stack"] = m["stack"]
            if m["quality"]:
                regla["quality"] = m["quality"]
            reglas_por_maquina.setdefault(m["machine"], []).append(regla)
            usados_items.update((entrada, m["out"]))
    maquinas = []
    for mid, reglas in reglas_por_maquina.items():
        if mid not in slugs:
            continue
        m = {"id": mid, "slug": slugs[mid][0], "slugEs": slugs[mid][1], "name": nombre_id(mid), "rules": reglas}
        if mid in por_salida:
            m["recipe"] = por_salida[mid]
        maquinas.append(m)
        usados_items.add(mid)

    refs = {
        # slug, slug en español y nombre [en, es]: la pestaña nombra los ingredientes sin bajar la lista de objetos.
        "items": {i: [slugs[i][0], slugs[i][1], *nombre_id(i)] for i in sorted(usados_items) if i in slugs},
        "cats": {c: _nombre_categoria(c) for c in sorted(usados_cats) if c in _INGREDIENTES or int(c) in sdv.CATEGORIES},
        "skills": {s: _texto("Strings/StringsFromCSFiles", _HABILIDADES[s]) for s in sorted(skills)},
        "npcs": {n: _texto("Strings/NPCNames", n) for n in sorted(npcs)},
        "shops": {t: nombres.tienda(t) for t in sorted(shops)},
        # El programa de cocina de la TV ("The Queen Of Sauce"), que enseña las recetas de tipo `tv`.
        "tv": _texto("Strings/StringsFromCSFiles", "TV.cs.13114"),
    }
    return {"recipes": lista, "machines": maquinas, "refs": refs}


def main() -> None:
    for nombre, datos in (("fish.json", fish()), ("recipes.json", recipes())):
        ruta = DATA / nombre
        ruta.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(nombre, ruta.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
