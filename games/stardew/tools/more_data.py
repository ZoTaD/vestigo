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
# Lugares de Data/Locations que no son sitios del mapa: la pesca de los festivales.
_LUGARES_FUERA = {"Temp", "fishingGame"}
# Peces de las Minas: el juego los reparte por piso en el código (`MineShaft.getFish`), no en Data/Locations.
_PECES_DE_LAS_MINAS = {"158", "161"}
# Granjas con nombre propio en Strings/UI (`<Nombre>_<descripción>`).
_GRANJAS = {"Farm_Forest": "Character_FarmForaging", "Farm_Beach": "Character_FarmBeach"}


def _texto(archivo: str, clave: str) -> list[str]:
    en = sdv.raw(archivo)[clave]
    return [en, sdv.raw(archivo + ".es-ES").get(clave) or en]


def _horas(texto: str) -> list[list[int]]:
    n = [int(x) for x in texto.split()]
    return [[n[i], n[i + 1]] for i in range(0, len(n) - 1, 2)]


def _estaciones(texto: str) -> list[int]:
    return [relations.SEASONS.index(s) for s in texto.split() if s in relations.SEASONS]


def _lugares_por_pez() -> tuple[dict[str, dict[str, set | None]], set[str]]:
    """pez -> lugar -> estaciones (None si alguna entrada vale todo el año), y los legendarios."""
    fish = sdv.raw("Data/Fish")
    lugares: dict[str, dict[str, set | None]] = {}
    legendarios: set[str] = set()
    for lugar, loc in sdv.raw("Data/Locations").items():
        for e in loc.get("Fish") or []:
            iid = relations._sin_prefijo(e.get("ItemId") or "")
            if iid not in fish or lugar in _LUGARES_FUERA:
                continue
            if e.get("IsBossFish") or "LEGENDARY_FAMILY" in (e.get("Condition") or ""):
                legendarios.add(iid)
            por_lugar = lugares.setdefault(iid, {})
            if e.get("Season") is None:
                por_lugar[lugar] = None
            elif por_lugar.get(lugar, set()) is not None:
                por_lugar.setdefault(lugar, set()).add(e["Season"])
    return lugares, legendarios


def fish() -> dict:
    from site_data import Nombres  # import tardío: site_data importa crops_data

    slugs, _ = crops_data._sitio()
    nom = crops_data._nombres_objetos()
    nombres = Nombres()
    lugares, legendarios = _lugares_por_pez()
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
        return nombres.lugar(clave)

    def lugar(clave: str, estaciones) -> dict:
        usados.setdefault(clave, nombre_lugar(clave))
        return {"key": clave, "name": usados[clave],
                "seasons": None if estaciones is None else sorted(estaciones)}

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
        peces.append({
            **base, "difficulty": int(c[1]), "behavior": c[2], "times": _horas(c[5]),
            "seasons": _estaciones(c[6]), "weather": c[7], "minLevel": int(c[12]),
            "legendary": iid in legendarios, "crabPot": False,
            "places": [lugar(k, s) for k, s in lugares.get(iid, {}).items()]
            or ([lugar("UndergroundMine", None)] if iid in _PECES_DE_LAS_MINAS else []),
        })
    if nombres.sin_texto:
        print("lugares sin texto del juego:", sorted(nombres.sin_texto))
    return {"fish": peces, "places": [{"key": k, "name": n} for k, n in sorted(usados.items())]}


def _desbloqueo(clave: str, tipo: str, campo: str, tv: set[str]) -> dict:
    """`default`, `s Farming 3`, `f Gus 5`, `l 4`; la TV por la lista del canal de cocina."""
    p = campo.split()
    if p == ["default"]:
        return {"type": "default"}
    if p[0] == "s" and len(p) == 3:
        return {"type": "skill", "skill": p[1], "level": int(p[2])}
    if p[0] == "f" and len(p) == 3:
        return {"type": "friend", "npc": p[1], "hearts": int(p[2])}
    if tipo == "cook" and clave in tv:
        return {"type": "tv"}
    if p[0] == "l" and len(p) == 2:
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

    lista, usados_items, usados_cats, skills, npcs = [], set(), set(), set(), set()
    for r in relations.recipes():
        unlock = _desbloqueo(r["key"], r["kind"], campos_desbloqueo[(r["kind"], r["key"])], tv)
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
        "items": {i: [slugs[i][0], slugs[i][1]] for i in sorted(usados_items) if i in slugs},
        "cats": {c: list(sdv.CATEGORIES[int(c)]) for c in sorted(usados_cats) if int(c) in sdv.CATEGORIES},
        "skills": {s: _texto("Strings/StringsFromCSFiles", _HABILIDADES[s]) for s in sorted(skills)},
        "npcs": {n: _texto("Strings/NPCNames", n) for n in sorted(npcs)},
    }
    return {"recipes": lista, "machines": maquinas, "refs": refs}


def main() -> None:
    for nombre, datos in (("fish.json", fish()), ("recipes.json", recipes())):
        ruta = DATA / nombre
        ruta.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(nombre, ruta.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
