"""Arma los datos que lee el sitio (games/warframe/data) con el export oficial y la tabla de drops.

Uso: python games/warframe/tools/site_data.py    (los íconos los baja `images.py`, aparte)

`build()` arma todo en memoria (y con `write=True` lo escribe); es lo que prueban los tests. Nombres, descripciones y
estadísticas salen siempre del export (`_en` y `_es`); si un dato no está en ninguna fuente, la ficha no lo inventa.

Por pestaña (`arsenal`, `relics`, `farming`, `mods`): `list.json` liviana, `f/NN.json` con las fichas repartidas por el
hash del slug y `es/NN.json` con `{slugEs: slug}` repartido por el slug español.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import drops  # noqa: E402
import images  # noqa: E402
import relations  # noqa: E402
import wf  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"
# En cuántos archivos se reparten las fichas de cada pestaña: `pzShardOf(slug, CHUNKS)` de `site/src/zomboid/shard.ts`.
CHUNKS = 32
TABS = ("arsenal", "relics", "farming", "mods")

# Tipos de daño de `damagePerShot` (20 posiciones). Fijado con Braton (0-2), Ignis (3), Glaxion (4) y Mara Detron (8).
DAMAGE_TYPES = [
    "impact", "puncture", "slash", "heat", "cold", "electricity", "toxin", "blast", "radiation", "gas",
    "magnetic", "viral", "corrosive", "void", "tau", "cinematic", "shield_drain", "health_drain", "energy_drain", "true",
]
POLARITIES = {
    "AP_ATTACK": "madurai", "AP_DEFENSE": "vazarin", "AP_TACTIC": "naramon", "AP_POWER": "zenurik",
    "AP_WARD": "unairu", "AP_UMBRA": "umbra", "AP_PRECEPT": "penjaga", "AP_UNIVERSAL": "universal", "AP_ANY": "any",
}
ERAS = ("Lith", "Meso", "Neo", "Axi", "Requiem", "Vanguard")
REFINEMENTS = ("Intact", "Exceptional", "Flawless", "Radiant")
# Ícono de cada reliquia: el de Intacta (bronce) de su era.
RELIC_ICON = {
    "Lith": "/Lotus/Types/Game/Projections/T1VoidProjectionABronze",
    "Meso": "/Lotus/Types/Game/Projections/T2VoidProjectionABronze",
    "Neo": "/Lotus/Types/Game/Projections/T3VoidProjectionABronze",
    "Axi": "/Lotus/Types/Game/Projections/T4VoidProjectionABronze",
    "Requiem": "/Lotus/Types/Game/Projections/T5VoidProjectionImmortalABronze",
    "Vanguard": "/Lotus/Types/Game/Projections/T4VanguardVaultABronze",
}
# Sufijo que desempata dos objetos con el mismo nombre en una pestaña, por tipo.
SUFIJO = {"exalted": "exalted", "archwing": "archwing", "arcane": "arcane", "mod": "mod"}


def fnv1a(s: str) -> int:
    """FNV-1a de 32 bits sobre los bytes UTF-8: `pzHash` de `site/src/zomboid/shard.ts`."""
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def shard(slug: str) -> int:
    """En qué archivo va un slug: `pzShardOf(slug, CHUNKS)` (el archivo se llama con dos dígitos)."""
    return fnv1a(slug) % CHUNKS


# ---- textos ------------------------------------------------------------------------------------------------

def _txt(s) -> str:
    if isinstance(s, list):
        s = "\n".join(s)
    return wf.clean(s or "").strip()


def _par(en: dict | None, es: dict | None, campo: str, nombre: bool = False) -> list[str]:
    """[en, es] de un campo; si el español falta, el inglés."""
    f = relations._nombre if nombre else _txt
    a = f(en.get(campo) or "") if en else ""
    b = f(es.get(campo) or "") if es else ""
    return [a, b or a]


def _unico(base: str, usados: set, *desempates: str) -> str:
    """`base`, o `base-<desempate>` con el primero que no esté usado, o un número al final."""
    if base not in usados:
        return base
    for d in desempates:
        if d and f"{base}-{d}" not in usados:
            return f"{base}-{d}"
    n = 2
    while f"{base}-{n}" in usados:
        n += 1
    return f"{base}-{n}"


def _slugs(filas: list[dict]) -> None:
    """Pone `slug` y `slugEs` únicos a cada fila (`unique`, `kind`, `name` [en, es], y `base_es` opcional).

    El primero con un nombre se queda con el slug pelado: las filas vienen en orden de prioridad (el objeto antes que
    su versión exaltada, el mod antes que el arcano). Si choca se le suma el tipo (`-arcane`, `-mod`, `-exalted`); si
    sigue chocando, el final del `uniqueName`, y por último un número."""
    for campo, idioma in (("slug", 0), ("slugEs", 1)):
        usados: set = set()
        for f in filas:
            base = wf.slugify(f["name"][idioma]) or wf.slugify(f["name"][0]) or wf.slugify(f["unique"])
            if idioma and f.get("base_es"):
                base = f["base_es"]
            cola = wf.slugify(f["unique"].rsplit("/", 1)[-1])
            s = _unico(base, usados, SUFIJO.get(f["kind"], ""), cola, wf.slugify(f["unique"].removeprefix("/Lotus/")))
            f[campo] = s
            usados.add(s)


# ---- íconos ------------------------------------------------------------------------------------------------

class Iconos:
    """Los íconos que usa el sitio: nombre de archivo -> {url, large} o {generic, large}."""

    def __init__(self):
        self.icons: dict[str, dict] = {}
        self.sin_icono: list[tuple[str, str]] = []

    def de(self, unique: str, tipo: str, large: bool = False) -> str:
        nombre = images.icon_name(unique)
        if nombre is None:
            self.sin_icono.append((unique, tipo))
            nombre = images.generic_name(tipo)
            info = self.icons.setdefault(nombre, {"generic": tipo})
        else:
            info = self.icons.setdefault(nombre, {"url": wf.icon_url(unique)})
        info["large"] = info.get("large", False) or large
        return nombre


# ---- Arsenal -----------------------------------------------------------------------------------------------

_KIND_ARMA = {"LongGuns": "primary", "Pistols": "secondary", "Melee": "melee", "SpaceGuns": "archwing",
              "SpaceMelee": "archwing", "SentinelWeapons": "companion", "SpecialItems": "exalted"}
_ORDEN_KIND = ("warframe", "primary", "secondary", "melee", "archwing", "companion", "exalted")


def _arsenal_items() -> list[dict]:
    """Warframes, armas, compañeros y armas exaltadas, en orden de prioridad para los slugs.

    De `ExportWeapons` quedan los que tienen `slot`: sin él son piezas modulares (Zaw, Kitgun, Amp), partes de
    Moa o Hound y variantes de otro modo de juego, que no son objetos del Arsenal. La amp Sirocco queda afuera."""
    out = []
    for x in wf.export("Warframes", "en"):
        kind = "archwing" if x["name"].startswith("<ARCHWING>") else "warframe"
        out.append((kind, "Warframes", x))
    for x in wf.export("Weapons", "en"):
        if x["productCategory"] in _KIND_ARMA and x.get("slot") is not None:
            out.append((_KIND_ARMA[x["productCategory"]], "Weapons", x))
    for x in wf.export("Sentinels", "en"):
        out.append(("companion", "Sentinels", x))
    out.sort(key=lambda t: (_ORDEN_KIND.index(t[0]), relations._nombre(t[2]["name"]).casefold(), t[2]["uniqueName"]))
    vistos, items = set(), []
    for kind, export, x in out:
        u = x["uniqueName"]
        if u in vistos:
            continue
        vistos.add(u)
        es = wf.by_unique(export, "es").get(u)
        items.append({"unique": u, "kind": kind, "en": x, "es": es, "name": _par(x, es, "name", True)})
    return items


def _stats(x: dict) -> dict:
    if "damagePerShot" in x:
        dano = [[DAMAGE_TYPES[i], round(v, 2)] for i, v in enumerate(x["damagePerShot"]) if v]
        s = {"damage": dano, "total": round(x.get("totalDamage", 0), 2),
             "crit": round(x.get("criticalChance", 0) * 100, 1), "critMult": round(x.get("criticalMultiplier", 0), 2),
             "status": round(x.get("procChance", 0) * 100, 1), "fireRate": round(x.get("fireRate", 0), 2)}
        if x.get("magazineSize"):
            s["magazine"] = x["magazineSize"]
        if x.get("reloadTime"):
            s["reload"] = round(x["reloadTime"], 2)
        if x.get("multishot"):
            s["multishot"] = x["multishot"]
        if x.get("trigger"):
            s["trigger"] = x["trigger"]
        return s
    s = {"health": x.get("health"), "shield": x.get("shield"), "armor": x.get("armor"), "energy": x.get("power")}
    if x.get("sprintSpeed") is not None:
        s["sprint"] = x["sprintSpeed"]
    return {k: v for k, v in s.items() if v is not None}


def _habilidades(x: dict, es: dict | None) -> list[dict]:
    en_es = {a["abilityUniqueName"]: a for a in (es or {}).get("abilities", [])}
    out = []
    for a in x.get("abilities", []):
        b = en_es.get(a["abilityUniqueName"])
        out.append({"name": _par(a, b, "abilityName", True), "desc": _par(a, b, "description")})
    return out


# ---- reliquias ---------------------------------------------------------------------------------------------

def _clave_reliquia(nombre: str):
    era = nombre.split()[0]
    partes = re.findall(r"\d+|[^\d\s]+", nombre[len(era):])
    return (ERAS.index(era) if era in ERAS else len(ERAS), [(0, int(p), "") if p.isdigit() else (1, 0, p) for p in partes])


def _nombres_reliquias() -> dict[str, list[str]]:
    """casefold del nombre de la tabla ("lith a1") -> [en, es] sin la palabra Relic / Reliquia."""
    es = {x["uniqueName"]: x["name"] for x in wf.export("RelicArcane", "es") if "relicRewards" in x}
    out: dict = {}
    for x in wf.export("RelicArcane", "en"):
        if "relicRewards" not in x:
            continue
        en = x["name"].removesuffix(" Relic")
        e = es.get(x["uniqueName"], "").removeprefix("Reliquia ").strip() or en
        out.setdefault(en.casefold(), [en, e])
    return out


def _rarity(r) -> str | None:
    return r.title() if r else None


# ---- mods y arcanos ----------------------------------------------------------------------------------------

def _ranks(x: dict, es: dict | None) -> list[list[str]]:
    en_l, es_l = x.get("levelStats", []), (es or {}).get("levelStats", [])
    out = []
    for n, nivel in enumerate(en_l):
        a = _txt(nivel["stats"])
        b = _txt(es_l[n]["stats"]) if n < len(es_l) else ""
        out.append([a, b or a])
    return out


def _mods() -> list[dict]:
    """Mods (los del export con `type`; sin Riven sin abrir ni Unfused Artifact) y arcanos, los mods primero.
    Los dos órdenes (mods antes que arcanos, y por nombre) fijan quién se queda con el slug pelado si chocan."""
    out, vistos = [], set()
    es_up, es_ar = wf.by_unique("Upgrades", "es"), wf.by_unique("RelicArcane", "es")
    for x in wf.export("Upgrades", "en"):
        u = x["uniqueName"]
        if x.get("type") is None or u in vistos or x["name"].endswith("Riven Mod"):
            continue  # los Riven sin abrir son cartas en blanco, no un mod con estadísticas
        vistos.add(u)
        es = es_up.get(u)
        desc = _par({"d": x.get("description")}, {"d": (es or {}).get("description")}, "d") if x.get("description") else None
        out.append({"unique": u, "kind": "mod", "name": _par(x, es, "name", True),
                    "type": "OTHER" if x["type"] == "---" else x["type"], "rarity": _rarity(x.get("rarity")),
                    "polarity": POLARITIES.get(x.get("polarity")), "drain": x.get("baseDrain"),
                    "maxRank": x.get("fusionLimit"), "compat": x.get("compatName"), "ranks": _ranks(x, es),
                    "desc": desc})
    for x in wf.export("RelicArcane", "en"):
        u = x["uniqueName"]
        if "relicRewards" in x or u in vistos:
            continue
        vistos.add(u)
        es = es_ar.get(u)
        ranks = _ranks(x, es)
        out.append({"unique": u, "kind": "arcane", "name": _par(x, es, "name", True), "type": "ARCANE",
                    "rarity": _rarity(x.get("rarity")), "polarity": None, "drain": None,
                    "maxRank": len(ranks) - 1 if ranks else None, "compat": None, "ranks": ranks, "desc": None})
    return out


# ---- referencias -------------------------------------------------------------------------------------------

class _Refs:
    """Resuelve cualquier cosa nombrada a `{tab, slug, slugEs, name, img}` y la ubica por su clave."""

    def __init__(self, items, por_unique, por_reliquia, recursos, por_recurso, mods, iconos):
        self.por_unique, self.por_reliquia, self.por_recurso = por_unique, por_reliquia, por_recurso
        self.iconos = iconos
        self.sin_ref: set = set()
        self.partes: dict[str, dict] = {}  # unique de la parte -> ref (apunta al objeto al que pertenece)
        self.nombres: dict[str, dict] = {}  # nombre de la tabla de drops (casefold) -> ref
        self.parts_de: dict[str, list] = {}
        self.usos: dict[str, set] = {}  # unique del recurso -> uniques del Arsenal que lo piden
        for i in items:
            ps = relations.parts(i["unique"])
            self.parts_de[i["unique"]] = ps
            dueno = self.de_item(i["unique"])
            for p in ps:
                if p["kind"] == "blueprint":
                    self.nombres.setdefault((i["name"][0] + " Blueprint").casefold(), {**dueno, "bp": True})
                    continue
                ref = {"tab": "arsenal", "slug": i["slug"], "slugEs": i["slugEs"], "name": p["name"],
                       "img": iconos.de(p["unique"], "part") if images.icon_name(p["unique"]) else i["img"]}
                self.partes.setdefault(p["unique"], ref)
                for n in (p["name"][0], p["name"][0] + " Blueprint"):
                    self.nombres.setdefault(n.casefold(), ref)
            rec = relations.recipe_for(i["unique"])
            for ing in rec["ingredients"] if rec else []:
                for u in self._hojas(ing["unique"]):
                    self.usos.setdefault(u, set()).add(i["unique"])
        for m in mods:
            self.nombres.setdefault(m["name"][0].casefold(), self.de_mod(m))
        for r in recursos:
            self.nombres.setdefault(r["name"][0].casefold(), self.de_recurso(r["unique"]))

    @staticmethod
    def _hojas(unique: str) -> list[str]:
        """El ingrediente y, si es una parte con receta propia, lo que ésta pide."""
        out = [unique]
        rec = relations.recipe_for(unique) if unique.startswith(relations._RECETAS) else None
        for ing in rec["ingredients"] if rec else []:
            out.append(ing["unique"])
        return out

    def de_item(self, unique: str) -> dict:
        i = self.por_unique[unique]
        return {"tab": "arsenal", "slug": i["slug"], "slugEs": i["slugEs"], "name": i["name"], "img": i["img"]}

    def de_recurso(self, unique: str) -> dict:
        r = self.por_recurso[unique]
        return {"tab": "farming", "slug": r["slug"], "slugEs": r["slugEs"], "name": r["name"], "img": r["img"]}

    @staticmethod
    def de_mod(m: dict) -> dict:
        return {"tab": "mods", "slug": m["slug"], "slugEs": m["slugEs"], "name": m["name"], "img": m["img"]}

    def de_reliquia(self, key: str) -> dict:
        r = self.por_reliquia[key]
        return {"tab": "relics", "slug": r["slug"], "slugEs": r["slugEs"], "name": r["name"], "img": r["img"]}

    def de_unique(self, unique: str):
        """(clave, ref) de un objeto por su `uniqueName`: Arsenal, recurso, parte, o sólo el nombre."""
        clave = unique.removeprefix("/Lotus/")
        if unique in self.por_unique:
            return clave, self.de_item(unique)
        if unique in self.por_recurso:
            return clave, self.de_recurso(unique)
        if unique in self.partes:
            return clave, self.partes[unique]
        nom = relations._nombres(unique)
        if nom is None:
            self.sin_ref.add(unique)
            nom = [unique.rsplit("/", 1)[-1]] * 2
        return clave, {"tab": None, "slug": None, "slugEs": None, "name": nom, "img": None}

    def de_nombre(self, nombre: str):
        """(clave, ref) de un nombre de la tabla de drops; si no es nada del sitio, un ref sin página."""
        ref = self.nombres.get(nombre.casefold())
        clave = "drop:" + wf.slugify(nombre)
        if ref is None:
            self.sin_ref.add(nombre)
            ref = {"tab": None, "slug": None, "slugEs": None, "name": [nombre, nombre], "img": None}
        return clave, ref

    def de_fuentes(self, fuentes: list[dict], refs: dict) -> None:
        for f in fuentes:
            if f["k"] == "relic" and f["relic"] in self.por_reliquia:
                refs[f["relic"]] = self.de_reliquia(f["relic"])


# ---- fichas ------------------------------------------------------------------------------------------------

def _ficha_arsenal(i: dict, R: _Refs) -> dict:
    x, es = i["en"], i["es"]
    refs: dict = {}
    f = {"slug": i["slug"], "slugEs": i["slugEs"], "name": i["name"], "desc": _par(x, es, "description"),
         "kind": i["kind"], "img": i["img"], "mr": x.get("masteryReq", 0), "stats": _stats(x)}
    hab = _habilidades(x, es)
    if hab:
        f["abilities"] = hab
    if x.get("passiveDescription"):
        f["passive"] = _par(x, es, "passiveDescription")
    ps = []
    for p in R.parts_de[i["unique"]]:
        q = {"name": p["name"], "kind": p["kind"], "n": p["n"], "sources": p["sources"]}
        if p["kind"] == "part" and images.icon_name(p["unique"]):
            q["img"] = R.iconos.de(p["unique"], "part")
        ps.append(q)
        R.de_fuentes(p["sources"], refs)
    f["parts"] = ps
    rec = relations.recipe_for(i["unique"])
    if rec:
        ing = []
        for g in rec["ingredients"]:
            clave, ref = R.de_unique(g["unique"])
            refs[clave] = ref
            ing.append({"ref": clave, "n": g["n"]})
        f["recipe"] = {"credits": rec["credits"], "seconds": rec["seconds"], "ingredients": ing}
    else:
        f["recipe"] = None
    f["refs"] = refs
    return f


def _ficha_reliquia(r: dict, R: _Refs) -> dict:
    refs: dict = {}
    base = r["tablas"]["Intact"]
    rewards = []
    for n, (item, rar, _) in enumerate(base):
        chances = []
        for refinamiento in REFINEMENTS:
            t = r["tablas"][refinamiento]
            if len(t) != len(base) or t[n][0] != item:
                raise ValueError(f"{r['key']}: los refinamientos no listan lo mismo ({refinamiento})")
            chances.append(t[n][2])
        clave, ref = R.de_nombre(item)
        refs[clave] = ref
        rewards.append({"ref": clave, "rarity": rar, "chances": chances})
    fuentes = relations.sources_by_name(r["key"] + " Relic") + drops.enemy_relics().get(r["key"], [])
    return {"slug": r["slug"], "slugEs": r["slugEs"], "name": r["name"], "era": r["era"],
            "vaulted": drops.vaulted(r["key"]), "img": r["img"], "rewards": rewards, "sources": fuentes, "refs": refs}


def _ficha_recurso(r: dict, R: _Refs) -> dict:
    refs: dict = {}
    usos = []
    for u in sorted(R.usos.get(r["unique"], ()), key=lambda u: R.por_unique[u]["slug"]):
        clave, ref = R.de_unique(u)
        refs[clave] = ref
        usos.append(clave)
    fuentes = relations.sources_by_name(r["name"][0])
    R.de_fuentes(fuentes, refs)
    return {"slug": r["slug"], "slugEs": r["slugEs"], "name": r["name"], "desc": _par(r["en"], r["es"], "description"),
            "img": r["img"], "planets": relations.resource_planets(r["unique"]), "sources": fuentes,
            "usedIn": usos, "refs": refs}


def _ficha_mod(m: dict, R: _Refs) -> dict:
    refs: dict = {}
    fuentes = relations.sources_by_name(m["name"][0])
    R.de_fuentes(fuentes, refs)
    f = {"slug": m["slug"], "slugEs": m["slugEs"], "name": m["name"], "kind": m["kind"], "type": m["type"],
         "rarity": m["rarity"], "polarity": m["polarity"], "drain": m["drain"], "maxRank": m["maxRank"],
         "compat": m["compat"], "ranks": m["ranks"], "img": m["img"], "sources": fuentes, "refs": refs}
    if m["desc"]:
        f["desc"] = m["desc"]
    return f


# ---- build -------------------------------------------------------------------------------------------------

def build(write: bool = False) -> dict:
    iconos = Iconos()
    notas: dict = {}

    # --- Arsenal: slugs e íconos (la ficha y su imagen grande)
    items = _arsenal_items()
    _slugs(items)
    por_unique = {i["unique"]: i for i in items}
    for i in items:
        i["img"] = iconos.de(i["unique"], i["kind"], large=True)

    # --- Reliquias
    nombres_rel = _nombres_reliquias()
    reliquias, saltadas = [], []
    for key, tablas in drops.relics().items():
        if any(t not in tablas for t in REFINEMENTS):
            saltadas.append(key)  # sólo trae la tabla de Intacta: los otros refinamientos no están en ninguna fuente
            continue
        en, es = nombres_rel.get(key.casefold(), [key, key])
        reliquias.append({"unique": key, "key": key, "kind": "relic", "name": [en, es], "base_es": wf.slugify(es),
                          "era": en.split()[0], "tablas": tablas})
    reliquias.sort(key=lambda r: _clave_reliquia(r["name"][0]))
    _slugs(reliquias)
    notas["reliquias_sin_refinamientos"] = saltadas
    por_reliquia = {r["key"]: r for r in reliquias}
    for r in reliquias:
        r["img"] = iconos.de(RELIC_ICON[r["era"]], "relic")

    # --- Recursos (Dónde farmear)
    recursos = []
    for u in relations.resources():
        nom = relations._nombres(u)
        if nom is None:
            continue
        recursos.append({"unique": u, "kind": "resource", "name": nom,
                         "en": wf.by_unique("Resources", "en")[u], "es": wf.by_unique("Resources", "es").get(u)})
    recursos.sort(key=lambda r: r["name"][0].casefold())
    _slugs(recursos)
    por_recurso = {r["unique"]: r for r in recursos}
    for r in recursos:
        r["img"] = iconos.de(r["unique"], "resource")

    # --- Mods y arcanos
    mods = _mods()
    _slugs(mods)
    for m in mods:
        m["img"] = iconos.de(m["unique"], m["kind"])

    R = _Refs(items, por_unique, por_reliquia, recursos, por_recurso, mods, iconos)

    lists = {
        "arsenal": [{"slug": i["slug"], "slugEs": i["slugEs"], "name": i["name"], "img": i["img"], "kind": i["kind"],
                     "prime": bool(re.search(r"\bPrime\b", i["name"][0])), "mr": i["en"].get("masteryReq", 0)}
                    for i in items],
        "relics": [{"slug": r["slug"], "slugEs": r["slugEs"], "name": r["name"], "img": r["img"], "era": r["era"],
                    "vaulted": drops.vaulted(r["key"])} for r in reliquias],
        "farming": [{"slug": r["slug"], "slugEs": r["slugEs"], "name": r["name"], "img": r["img"],
                     "planets": relations.resource_planets(r["unique"])} for r in recursos],
        "mods": [{"slug": m["slug"], "slugEs": m["slugEs"], "name": m["name"], "img": m["img"], "kind": m["kind"],
                  "type": m["type"], "rarity": m["rarity"], "polarity": m["polarity"], "compat": m["compat"]}
                 for m in mods],
    }
    fichas = {
        "arsenal": {i["slug"]: _ficha_arsenal(i, R) for i in items},
        "relics": {r["slug"]: _ficha_reliquia(r, R) for r in reliquias},
        "farming": {r["slug"]: _ficha_recurso(r, R) for r in recursos},
        "mods": {m["slug"]: _ficha_mod(m, R) for m in mods},
    }
    notas["sin_icono"] = iconos.sin_icono
    notas["sin_ref"] = sorted(R.sin_ref)

    es: dict = {}
    for tab in TABS:
        por: dict = {}
        for r in lists[tab]:
            por.setdefault(shard(r["slugEs"]), {})[r["slugEs"]] = r["slug"]
        es[tab] = por

    idx_path = wf.RAW / "index.json"
    meta = {"generatedAt": date.today().isoformat(),
            "index": json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else {},
            "counts": {t: len(lists[t]) for t in TABS}}
    out = {"lists": lists, "fichas": fichas, "es": es, "meta": meta, "icons": iconos.icons, "notas": notas}
    if write:
        escribir(archivos(out))
    return out


# ---- salida ------------------------------------------------------------------------------------------------

def archivos(out: dict) -> dict:
    """Ruta (relativa a `data/`) -> contenido de todo lo que se escribe."""
    files = {"meta.json": out["meta"]}
    for tab in TABS:
        files[f"{tab}/list.json"] = out["lists"][tab]
        por: dict = {}
        for slug, ficha in out["fichas"][tab].items():
            por.setdefault(shard(slug), {})[slug] = ficha
        for n, contenido in por.items():
            files[f"{tab}/f/{n:02d}.json"] = contenido
        for n, contenido in out["es"][tab].items():
            files[f"{tab}/es/{n:02d}.json"] = contenido
    return files


def escribir(files: dict) -> None:
    for name, content in files.items():
        path = DATA / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for tab in TABS:
        for carpeta in ("f", "es"):
            for viejo in (DATA / tab / carpeta).glob("*.json"):
                if f"{tab}/{carpeta}/{viejo.name}" not in files:
                    viejo.unlink()


def main() -> None:
    out = build(write=True)
    print(out["meta"]["counts"])
    n = out["notas"]
    if n["reliquias_sin_refinamientos"]:
        print("reliquias sin los cuatro refinamientos (afuera):", ", ".join(n["reliquias_sin_refinamientos"]))
    if n["sin_icono"]:
        print("sin ícono en el manifiesto (genérico):", n["sin_icono"])
    if n["sin_ref"]:
        print("nombrados que no son nada del sitio (sin página):", len(n["sin_ref"]))


if __name__ == "__main__":
    main()
