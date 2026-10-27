"""Partes, recetas y de dónde sale cada cosa: cruza `ExportRecipes` y los exports de objetos con la tabla de drops."""
import re
from functools import lru_cache

import drops
import wf

# Exports con objetos del Arsenal (los que tienen receta) y recursos.
_ARSENAL = ("Warframes", "Weapons", "Sentinels")
_NOMBRADOS = ("Resources",) + _ARSENAL
_RECETAS = "/Lotus/Types/Recipes/"
_SECCIONES_ENEMIGO = ("blueprintByDrop", "modByDrop", "resourceByDrop")


def _nombre(texto: str) -> str:
    """Nombre limpio: sin marcas `<ARCHWING>` y sin espacios de más."""
    return " ".join(wf.clean(texto).split())


def _clave(nombre: str) -> str:
    """La tabla escribe "Ekwana Ii Jai" donde el export dice "Ekwana II Jai": se compara sin mayúsculas."""
    return nombre.casefold()


@lru_cache(maxsize=None)
def _items(lang: str) -> dict[str, dict]:
    """`uniqueName` -> objeto, para recursos, Warframes, armas y compañeros."""
    out: dict = {}
    for n in _NOMBRADOS:
        for x in wf.export(n, lang):
            out.setdefault(x["uniqueName"], x)
    return out


@lru_cache(maxsize=None)
def _recursos() -> frozenset:
    return frozenset(x["uniqueName"] for x in wf.export("Resources", "en"))


@lru_cache(maxsize=None)
def _recetas() -> dict[str, dict]:
    return wf.by_unique("Recipes", "en")


@lru_cache(maxsize=None)
def _receta_de() -> dict[str, str]:
    """`resultType` -> `uniqueName` de su receta (la primera, si hay varias)."""
    out: dict = {}
    for u, r in _recetas().items():
        out.setdefault(r["resultType"], u)
    return out


def _nombres(unique: str):
    """[en, es] de un objeto, o None si no está en los exports."""
    en = _items("en").get(unique)
    if not en:
        return None
    es = _items("es").get(unique) or en
    return [_nombre(en["name"]), _nombre(es["name"])]


def recipe_for(result_unique: str):
    u = _receta_de().get(result_unique)
    if u is None:
        return None
    r = _recetas()[u]
    return {"unique": u, "credits": r["buildPrice"], "seconds": r["buildTime"],
            "ingredients": [{"unique": i["ItemType"], "n": i["ItemCount"]} for i in r["ingredients"]]}


def _es_parte(unique: str) -> bool:
    """Componente de una receta del Arsenal: cuelga de `/Lotus/Types/Recipes/` (componentes de Warframes y
    compañeros, partes de armas, Prime con o sin receta propia), es una parte Prime por nombre, o es otro objeto
    del Arsenal con receta propia (un arma que pide otra). Los recursos sueltos (Orokin Cell) no lo son."""
    if unique.startswith(_RECETAS):
        return True
    if unique not in _items("en"):
        return unique in _receta_de()
    nom = _nombres(unique)
    return unique not in _recursos() and unique in _receta_de() or "Prime" in nom[0]


# ---- fuentes ----------------------------------------------------------------------------------------------

@lru_cache(maxsize=None)
def _fuentes() -> dict[str, list[dict]]:
    """Nombre de la tabla (casefold) -> fuentes de ese objeto."""
    out: dict = {}

    def sumar(nombre: str, fuente: dict):
        out.setdefault(_clave(nombre), []).append(fuente)

    # Reliquias: la rareza es la de Intacta (en los otros refinamientos cambia, la parte es la misma).
    for relic, refs in drops.relics().items():
        v = drops.vaulted(relic)
        for item, rar, _ in refs["Intact"]:
            sumar(item, {"k": "relic", "relic": relic, "rarity": rar, "vaulted": v})
    for x in drops.missions():
        sumar(x["item"], {"k": "mission", "where": x["where"], "rot": x["rot"], "chance": x["chance"]})
    for x in drops.bounties():
        sumar(x["item"], {"k": "bounty", "where": x["where"], "tier": x["tier"], "stage": x["stage"],
                          "rot": x["rot"], "chance": x["chance"]})
    for sec in _SECCIONES_ENEMIGO:
        for item, filas in drops.by_drop(sec).items():
            for f in filas:
                sumar(item, {"k": "enemy", "who": f["who"], "eff": f["eff"]})
    for tabla in (drops.keys(), drops.transient(), drops.sorties()):
        for x in tabla:
            donde = x["where"] if x["rot"] is None else f"{x['where']} (Rotation {x['rot']})"
            sumar(x["item"], {"k": "other", "where": donde, "chance": x["chance"]})
    return out


def sources_by_name(name_en: str) -> list[dict]:
    """Todas las fuentes de un objeto por su nombre en inglés de la tabla ("Nikana Prime Blueprint")."""
    return list(_fuentes().get(_clave(name_en), []))


def _fuentes_de_parte(nombre: str) -> list[dict]:
    """Fuentes de una parte: con " Blueprint" si la tabla nombra el plano ("Excalibur Chassis Blueprint"),
    si no con el nombre pelado ("Nikana Prime Blade")."""
    return sources_by_name(nombre + " Blueprint") or sources_by_name(nombre)


def parts(unique: str) -> list[dict]:
    """Plano principal y partes de un Warframe, arma o compañero, cada una con sus fuentes.

    El plano principal lleva `kind: "blueprint"` y el `name` [en, es] del objeto tal cual (el export no nombra
    los planos: el sitio arma "X Blueprint" / "Plano de X" con su texto de interfaz). Las partes llevan
    `kind: "part"`. Una parte con receta propia que pide otras partes (los aspectos Día/Noche de Equinox)
    también las lista."""
    rec = recipe_for(unique)
    nom = _nombres(unique)
    if rec is None or nom is None:
        return []
    out = [{"unique": rec["unique"], "kind": "blueprint", "name": nom, "n": 1,
            "sources": sources_by_name(nom[0] + " Blueprint")}]
    vistos = {rec["unique"]}

    def sumar(receta):
        for i in receta["ingredients"]:
            u = i["unique"]
            if u in vistos or not _es_parte(u):
                continue
            n = _nombres(u)
            if n is None:
                continue
            vistos.add(u)
            out.append({"unique": u, "kind": "part", "name": n, "n": i["n"], "sources": _fuentes_de_parte(n[0])})
            if u.startswith(_RECETAS) and recipe_for(u):
                sumar(recipe_for(u))

    sumar(rec)
    return out


# ---- recursos y planetas ----------------------------------------------------------------------------------

@lru_cache(maxsize=None)
def _sistemas() -> dict[str, list[tuple[int, str]]]:
    """Por idioma, (systemIndex, systemName) de cada sistema, sin los compuestos ("Dark Refractory, Deimos")."""
    out = {}
    for lang in ("en", "es"):
        vistos: dict = {}
        for r in wf.export("Regions", lang):
            if "," not in r["systemName"]:
                vistos.setdefault(r["systemIndex"], r["systemName"])
        out[lang] = sorted(vistos.items())
    return out


_LOCATION = re.compile(r"^\s*(?:Location|Ubicaci.n)\s*:\s*(.+?)\s*$", re.M)


def _indices(lang: str, unique: str) -> list[int]:
    x = wf.by_unique("Resources", lang).get(unique)
    if not x:
        return []
    m = _LOCATION.search(x.get("description", "").replace("\r", ""))
    if not m:
        return []
    texto, hallados = m.group(1), []
    for idx, nombre in _sistemas()[lang]:
        p = re.search(r"(?<!\w)" + re.escape(nombre) + r"(?!\w)", texto)
        if p:
            hallados.append((p.start(), idx))
    return [i for _, i in sorted(hallados)]


def resource_planets(unique: str) -> list[list[str]]:
    """Planetas de la línea "Location:" / "Ubicación:" de un recurso: [[en, es], ...]."""
    nombres = {lang: dict(_sistemas()[lang]) for lang in ("en", "es")}
    orden: list[int] = []
    for lang in ("en", "es"):
        for i in _indices(lang, unique):
            if i not in orden:
                orden.append(i)
    return [[nombres["en"][i], nombres["es"][i]] for i in orden if i in nombres["en"] and i in nombres["es"]]


def resources() -> list[str]:
    """Recursos que piden las recetas del Arsenal (y las de sus partes) o que sueltan enemigos (`resourceByDrop`)."""
    out: set = set()

    def sumar(receta):
        for i in receta["ingredients"] if receta else []:
            u = i["unique"]
            if u in _recursos() and not _es_parte(u):
                out.add(u)

    for n in _ARSENAL:
        for x in wf.export(n, "en"):
            r = recipe_for(x["uniqueName"])
            if r is None:
                continue
            sumar(r)
            for i in r["ingredients"]:
                if _es_parte(i["unique"]):
                    sumar(recipe_for(i["unique"]))
    por_nombre: dict = {}
    for x in wf.export("Resources", "en"):
        por_nombre.setdefault(_clave(_nombre(x["name"])), []).append(x["uniqueName"])
    for nombre in drops.by_drop("resourceByDrop"):
        out.update(por_nombre.get(_clave(nombre), []))
    return sorted(out)


# ---- lo que no cruza --------------------------------------------------------------------------------------

@lru_cache(maxsize=None)
def _nombres_en_el_arsenal() -> frozenset:
    """Nombres con que `parts()` busca en la tabla de drops, en todo el Arsenal (con y sin " Blueprint")."""
    s = set()
    for n in _ARSENAL:
        for x in wf.export(n, "en"):
            for p in parts(x["uniqueName"]):
                s.add(_clave(p["name"][0]))
                s.add(_clave(p["name"][0] + " Blueprint"))
    return frozenset(s)


def _nombres_tabla() -> set[str]:
    """Todos los nombres de objetos de la tabla de drops, tal cual los escribe."""
    s: set = set()
    for lista in (drops.missions(), drops.bounties(), drops.keys(), drops.transient(), drops.sorties()):
        s.update(x["item"] for x in lista)
    for refs in drops.relics().values():
        s.update(it for it, _, _ in refs["Intact"])
    for sec in _SECCIONES_ENEMIGO:
        s.update(drops.by_drop(sec))
    return s


def unresolved_drop_names() -> list[str]:
    """Partes Prime y planos de la tabla de drops que ninguna parte del Arsenal usa (`parts()` no los busca)."""
    usados = _nombres_en_el_arsenal()
    return sorted(n for n in _nombres_tabla()
                  if (n.endswith(" Blueprint") or "Prime" in n) and _clave(n) not in usados)
