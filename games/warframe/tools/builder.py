"""Datos del armador de builds (`data/builder/`) y de la calculadora de Rivens (`data/rivens/`).

`build_data(items, mods)` recibe los objetos del Arsenal y los mods de `site_data` (con slug e ícono ya puestos) y
devuelve {ruta relativa a `data/`: contenido}; `site_data.build()` lo llama y `archivos()` lo escribe.

La clase de cada arma (escopeta, arco, francotirador, tipo de cuerpo a cuerpo) no está en el Public Export: sale del
módulo de datos de la wiki oficial (Module:Weapons/data) y queda guardada en `clases.json`, que se actualiza a mano
cuando salen armas nuevas (`site_data.py` avisa cuáles no tienen clase):

    python games/warframe/tools/builder.py --clases
"""
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wf  # noqa: E402

CLASES = Path(__file__).resolve().parent / "clases.json"
URL_WIKI = "https://wiki.warframe.com/api.php?action=parse&page=Module:Weapons/data/{slot}&prop=wikitext&format=json"
SLOTS_WIKI = ("primary", "secondary", "melee", "archwing")

KINDS = ("warframe", "primary", "secondary", "melee")
# Tipo de mod del export -> archivo del armador.
TIPOS_MOD = {"WARFRAME": "warframe", "AURA": "warframe", "PRIMARY": "primary", "SECONDARY": "secondary",
             "MELEE": "melee", "STANCE": "melee"}
# Mods de compañeros (los de garras de Kubrow vienen como MELEE) y de Cónclave: no van en un Warframe ni en sus armas.
FUERA = ("/PvPMods/", "/Sentinel/", "/Pets/")
POLARIDADES = {"AP_ATTACK": "madurai", "AP_DEFENSE": "vazarin", "AP_TACTIC": "naramon", "AP_POWER": "zenurik",
               "AP_WARD": "unairu", "AP_PRECEPT": "penjaga", "AP_UMBRA": "umbra"}

# Texto de una línea de `levelStats` (ya sin las marcas `<DT_…>`) -> stat. Sólo porcentajes: lo plano (+150 Shield
# Capacity, +1.2 Range) y lo que no está acá se muestra como texto y no suma.
PATRONES = {
    "Damage": "damage", "Impact": "impact", "Puncture": "puncture", "Slash": "slash", "Heat": "heat", "Cold": "cold",
    "Electricity": "electricity", "Toxin": "toxin", "Blast": "blast", "Corrosive": "corrosive", "Gas": "gas",
    "Magnetic": "magnetic", "Radiation": "radiation", "Viral": "viral", "Multishot": "multishot",
    "Critical Chance": "critChance", "Critical Damage": "critDamage", "Status Chance": "statusChance",
    "Fire Rate": "fireRate", "Magazine Capacity": "magazine", "Reload Speed": "reload", "Melee Damage": "meleeDamage",
    "Attack Speed": "attackSpeed", "Ability Strength": "strength", "Ability Duration": "duration",
    "Ability Efficiency": "efficiency", "Ability Range": "range", "Health": "health", "Shield Capacity": "shield",
    "Armor": "armor", "Energy Max": "energy",
}
# "+60% Fire Rate (x2 for Bows)": el ×2 de los arcos lo aplica el armador con `bow`; los ataques pesados no se muestran.
_ACLARACION = re.compile(r"\s*\(x\d+(?:\.\d+)? for (?:Bows|Heavy Attacks)\)$")
_LINEA = re.compile(r"^([+-]?\d+(?:\.\d+)?)% ([A-Za-z ]+)$")

# Ganancia de salud / escudo / armadura / energía de rango 0 a 30. Regla general del Update 34.0 (+10 salud y +10
# escudo cada 3 rangos, +5 energía cada 3 rangos; la armadura no cambia) y la tabla "Rank Up Exceptions" de
# https://wiki.warframe.com/w/Warframes (sale de Module:Warframes/data), releída el 27/10/2026.
RANGO30_GENERAL = (100, 100, 0, 50)
RANGO30 = {
    **dict.fromkeys(("Baruuk", "Baruuk Prime", "Chroma Prime", "Garuda", "Garuda Prime", "Koumei", "Narin",
                     "Saryn Prime", "Volt Prime", "Wisp", "Wisp Prime", "Yareli", "Yareli Prime"), (100, 100, 0, 100)),
    **dict.fromkeys(("Dante", "Xaku", "Xaku Prime"), (90, 90, 0, 70)),
    **dict.fromkeys(("Grendel", "Grendel Prime", "Inaros", "Inaros Prime"), (200, 0, 0, 50)),
    **dict.fromkeys(("Hildryn", "Hildryn Prime"), (100, 500, 0, 0)),
    "Kullervo": (200, 0, 100, 50),
    **dict.fromkeys(("Lavos", "Lavos Prime"), (200, 100, 100, 0)),
    **dict.fromkeys(("Nezha", "Nezha Prime", "Valkyr", "Valkyr Prime"), (100, 50, 0, 50)),
    **dict.fromkeys(("Nidus", "Nidus Prime"), (100, 0, 100, 50)),
}

# Clases de la wiki que disparan por perdigón (el export da el daño y el estado de cada uno).
ESCOPETAS = ("Shotgun", "Shotgun Sidearm", "Dual Shotguns")
# Cuerpo a cuerpo: etiqueta de postura de la wiki (`CompatibilityTags`) -> `compatName` de las posturas del export.
POSTURAS = {
    "SWORDS_STANCE": "Swords", "DUAL_SWORDS_STANCE": "Dual Swords", "HEAVY_BLADE_STANCE": "Heavy Blade",
    "HAMMERS_STANCE": "Hammers", "POLEARMS_STANCE": "Polearms", "GLAIVES_STANCE": "Glaives",
    "SCYTHES_STANCE": "Scythes", "SCYTHE_STANCE": "Scythes", "HEAVY SCYTHE_STANCE": "Heavy Scythe",
    "MACHETES_STANCE": "Machetes", "SWORDS_AND_SHIELD_STANCE": "Sword And Shield", "DAGGERS_STANCE": "Daggers",
    "DUAL_DAGGERS_STANCE": "Dual Daggers", "STAVES_STANCE": "Staves", "FIST_STANCE": "Fists", "TONFA_STANCE": "Tonfas",
    "WHIPS_STANCE": "Whips", "SPARRING_STANCE": "Sparring", "WARFAN_STANCE": "Warfans", "NIKANAS_STANCE": "Nikanas",
    "LONG_KATANA_STANCE": "Two-Handed Nikana", "DUAL_KATANAS_STANCE": "Dual Nikanas", "CLAWS_STANCE_STANCE": "Claws",
    "BLADE_AND_WHIP_STANCE": "Blade And Whip", "GUNBLADE_STANCE": "Gunblade", "NUNCHAKU_STANCE": "Nunchaku",
    "RAPIER_STANCE": "Rapiers", "BLADESAW_STANCE": "Assault Saw", "BAYONET_STANCE": "Bayonet",
}
# Si la wiki no trae la etiqueta (algún arma suelta), la postura sale de la clase.
POSTURA_DE_CLASE = {
    "Sword": "Swords", "Dual Swords": "Dual Swords", "Heavy Blade": "Heavy Blade", "Hammer": "Hammers",
    "Polearm": "Polearms", "Glaive": "Glaives", "Scythe": "Scythes", "Heavy Scythe": "Heavy Scythe",
    "Machete": "Machetes", "Sword and Shield": "Sword And Shield", "Dagger": "Daggers", "Dual Daggers": "Dual Daggers",
    "Staff": "Staves", "Fist": "Fists", "Tonfa": "Tonfas", "Whip": "Whips", "Sparring": "Sparring",
    "Warfan": "Warfans", "Nikana": "Nikanas", "Two-Handed Nikana": "Two-Handed Nikana", "Dual Nikanas": "Dual Nikanas",
    "Claws": "Claws", "Blade and Whip": "Blade And Whip", "Gunblade": "Gunblade", "Nunchaku": "Nunchaku",
    "Rapier": "Rapiers", "Assault Saw": "Assault Saw", "Bayonet": "Bayonet",
}
# Mods de cuerpo a cuerpo sólo para una clase (además de las posturas).
MELEE_DE_CLASE = {"Glaive": "Thrown Melee", "Dagger": "Daggers", "Dual Daggers": "Dual Daggers",
                  "Polearm": "Polearms", "Whip": "Whips"}

# Rivens: el Riven sin abrir de cada tipo trae en `upgradeEntries` los stats posibles y su `value`.
TIPOS_RIVEN = {
    "rifle": "/Lotus/Upgrades/Mods/Randomized/LotusRifleRandomModRare",
    "shotgun": "/Lotus/Upgrades/Mods/Randomized/LotusShotgunRandomModRare",
    "pistol": "/Lotus/Upgrades/Mods/Randomized/LotusPistolRandomModRare",
    "melee": "/Lotus/Upgrades/Mods/Randomized/PlayerMeleeWeaponRandomModRare",
    "archgun": "/Lotus/Upgrades/Mods/Randomized/LotusArchgunRandomModRare",
    "kitgun": "/Lotus/Upgrades/Mods/Randomized/LotusModularPistolRandomModRare",
    "zaw": "/Lotus/Upgrades/Mods/Randomized/LotusModularMeleeRandomModRare",
}
# El Hotfix 44.1.3 (22/10/2026) sacó la disposición: todo arma que acepta Riven tiene `omegaAttenuation` 1,2 en el
# export; las que no (melés de Archwing, Ironbride, piezas de kitgun) traen 0,5 o 1.
D_RIVEN = 1.2


def _num(v: float):
    """Redondeado a 6 decimales (el export trae 7.9200001) y entero si lo es."""
    v = round(float(v), 6)
    return int(v) if v.is_integer() else v


def _limpio(s: str) -> str:
    return wf.clean(s or "").strip()


# ---- clases de armas (wiki) --------------------------------------------------------------------------------

_ENTRADA = re.compile(r'\n\t(?:\["[^"]*"\]|[A-Za-z_]\w*) = \{')


def _campo(bloque: str, campo: str):
    m = re.search(rf'\n\t\t{campo} = "([^"]*)"', bloque)
    return m.group(1) if m else None


def parse_wiki(lua: str) -> list[list]:
    """[uniqueName, nombre, clase, familia, etiquetas] de cada arma de una página de Module:Weapons/data. Se lee como
    texto (no se ejecuta): cada arma es un bloque `\\tNombre = {` con los campos a dos tabulaciones."""
    out = []
    for bloque in _ENTRADA.split(lua)[1:]:
        clase, nombre = _campo(bloque, "Class"), _campo(bloque, "Name")
        if not clase or not nombre:
            continue
        m = re.search(r"\n\t\tCompatibilityTags = \{([^}]*)\}", bloque)
        tags = re.findall(r'"([^"]+)"', m.group(1)) if m else []
        out.append([_campo(bloque, "InternalName") or "", nombre, clase, _campo(bloque, "Family") or "", tags])
    return out


def bajar_clases() -> None:
    armas = []
    for slot in SLOTS_WIKI:
        req = urllib.request.Request(URL_WIKI.format(slot=slot), headers={"User-Agent": "vestigo-fetch"})
        with urllib.request.urlopen(req, timeout=120) as r:
            lua = json.loads(r.read().decode("utf-8"))["parse"]["wikitext"]["*"]
        armas += parse_wiki(lua)
    if len(armas) < 500:
        raise ValueError(f"la wiki devolvió sólo {len(armas)} armas")
    armas.sort(key=lambda a: (a[1].casefold(), a[0]))
    cabeza = {"fuente": "https://wiki.warframe.com/w/Module:Weapons/data", "fecha": date.today().isoformat()}
    filas = ",\n".join(json.dumps(a, ensure_ascii=False) for a in armas)  # un arma por renglón: diffs legibles
    CLASES.write_text(json.dumps(cabeza, ensure_ascii=False)[:-1] + ', "armas": [\n' + filas + "\n]}\n",
                      encoding="utf-8")
    print(len(armas), "armas en", CLASES.name)


class Clases:
    """Clase, familia y etiquetas de un arma: por `uniqueName` y, si la wiki lo tiene con otro, por nombre."""

    def __init__(self):
        armas = json.loads(CLASES.read_text(encoding="utf-8"))["armas"] if CLASES.exists() else []
        self.por_unique, self.por_nombre = {}, {}
        for a in armas:
            self.por_unique.setdefault(a[0], a)
            self.por_nombre.setdefault(a[1], a)

    def de(self, unique: str, nombre: str):
        """(clase, familia, etiquetas) o None."""
        a = self.por_unique.get(unique) or self.por_nombre.get(nombre)
        return (a[2], a[3], a[4]) if a else None


# ---- mods ----------------------------------------------------------------------------------------------------

def leer_linea(texto: str):
    """(stat, valor en puntos) de una línea de `levelStats`, o None si no es un porcentaje solo y sin condición."""
    t = _limpio(texto)
    if "\n" in t:
        return None  # "On Kill:\n…" y demás efectos de dos renglones
    m = _LINEA.match(_ACLARACION.sub("", t))
    if not m or m.group(2) not in PATRONES:
        return None
    return PATRONES[m.group(2)], _num(m.group(1))


def _efectos(niveles: list[dict], maximo: int) -> list:
    """[[stat, [valor en cada rango 0..max]], …]; un stat queda sólo si aparece en todos los rangos."""
    if maximo is None or len(niveles) != maximo + 1:
        return []
    por: dict = {}
    for n, nivel in enumerate(niveles):
        for s in nivel["stats"]:
            r = leer_linea(s)
            if r:
                vals = por.setdefault(r[0], [0] * len(niveles))
                vals[n] = _num(vals[n] + r[1])
    return [[k, v] for k, v in por.items() if all(v)]


def _textos(x: dict, es: dict | None) -> list[list[str]]:
    en_l = x.get("levelStats") or []
    es_l = (es or {}).get("levelStats") or []
    if not en_l:
        return []
    a = en_l[-1]["stats"]
    b = es_l[-1]["stats"] if len(es_l) == len(en_l) else []
    return [[_limpio(s), _limpio(b[n]) if n < len(b) else _limpio(s)] for n, s in enumerate(a)]


def _mod(m: dict, x: dict, es: dict | None) -> dict:
    slot = {"AURA": "aura", "STANCE": "stance"}.get(x["type"], "normal")
    out = {"slug": m["slug"], "name": m["name"], "pol": POLARIDADES.get(x.get("polarity")),
           "rarity": m["rarity"], "drain": x.get("baseDrain", 0), "max": x.get("fusionLimit", 0), "slot": slot,
           "exilus": bool(x.get("isUtility")), "compat": x.get("compatName") or "",
           "fx": _efectos(x.get("levelStats") or [], x.get("fusionLimit")), "text": _textos(x, es)}
    if m.get("img"):
        out["icon"] = m["img"]
    return out


# ---- objetos -------------------------------------------------------------------------------------------------

def _compat_arma(kind: str, nombre: str, clase) -> list[str]:
    out = {"primary": ["PRIMARY"], "secondary": ["Pistol"], "melee": ["Melee"]}[kind]
    out.append(nombre)
    if clase is None:
        return out
    c, familia, tags = clase
    if familia:
        out.append(familia)
    if kind == "primary":
        if c == "Shotgun":
            out.append("Shotgun")
        else:  # rifles, francotiradores, arcos, lanzadores, arpones y ballestas usan los mods de rifle
            out.append("Rifle")
            if "ASSAULT_AMMO" in tags:
                out.append("Assault Rifle")
            if c == "Sniper Rifle":
                out.append("Sniper")
            if c == "Bow":
                out.append("Bow")
            if "AOE" not in tags:
                out.append("Rifle (No Aoe)")
    elif kind == "secondary":
        if "AOE" not in tags:
            out.append("Pistol (No Aoe)")
        if c in ("Thrown", "Tome"):
            out.append(c)
    else:
        if c in MELEE_DE_CLASE:
            out.append(MELEE_DE_CLASE[c])
        posturas = [POSTURAS[t] for t in tags if t in POSTURAS] or [POSTURA_DE_CLASE.get(c)]
        out += [p for p in posturas if p]
    return list(dict.fromkeys(out))


def _tipo_riven(i: dict, clase) -> str | None:
    x = i["en"]
    if round(x.get("omegaAttenuation", 0), 6) != D_RIVEN:
        return None
    if i["kind"] == "primary":
        return None if clase is None else "shotgun" if clase[0] == "Shotgun" else "rifle"
    if i["kind"] == "archwing" and x.get("productCategory") == "SpaceGuns":
        return "archgun"
    return {"secondary": "pistol", "melee": "melee"}.get(i["kind"])


def _arma(x: dict, clase, riven) -> dict:
    c = clase[0] if clase else None
    w = {"dmg": [_num(v) for v in x["damagePerShot"]], "cc": _num(x.get("criticalChance", 0)),
         "cd": _num(x.get("criticalMultiplier", 0)), "sc": _num(x.get("procChance", 0)),
         "rate": _num(x.get("fireRate", 0))}
    if x.get("magazineSize"):
        w["mag"] = x["magazineSize"]
    if x.get("reloadTime"):
        w["reload"] = _num(x["reloadTime"])
    w.update({"ms": _num(x.get("multishot") or 1), "bow": c == "Bow", "shotgun": c in ESCOPETAS})
    if riven:
        w["riven"] = riven
    return w


def _warframe(x: dict) -> dict:
    """Salud, escudo, armadura y energía a rango 30: el export trae las de rango 0."""
    h, s, a, e = RANGO30.get(x["name"], RANGO30_GENERAL)
    return {"health": x["health"] + h, "shield": x["shield"] + s, "armor": x["armor"] + a, "energy": x["power"] + e}


def sin_clase(items: list[dict]) -> list[str]:
    """Armas del armador o con Riven que no están en `clases.json` (salieron después de la última lectura)."""
    cl = Clases()
    return [i["name"][0] for i in items if i["kind"] in ("primary", "secondary", "melee")
            and cl.de(i["unique"], i["name"][0]) is None]


# ---- salida --------------------------------------------------------------------------------------------------

def _rivens(armas: list[dict]) -> dict:
    en, es = wf.by_unique("Upgrades", "en"), wf.by_unique("Upgrades", "es")
    traducir = _traductor_stats()
    tipos = []
    for key, u in TIPOS_RIVEN.items():
        x, y = en[u], es.get(u) or {}
        nombre_es = (y.get("name") or "").removeprefix("Mod agrietado de ").strip()
        nombre_es = nombre_es[:1].upper() + nombre_es[1:] if nombre_es else x["name"]
        stats = []
        for e in x["upgradeEntries"]:
            loc = e["upgradeValues"][0]["locTag"]
            stats.append({"tag": e["tag"], "name": [_nombre_stat(loc), traducir(loc)],
                          "value": round(e["upgradeValues"][0]["value"], 9)})
        tipos.append({"key": key, "name": [x["name"].removesuffix(" Riven Mod"), nombre_es], "stats": stats})
    return {"types": tipos, "weapons": armas}


_NUMERO = re.compile(r"^[+-]?x?\d+(?:\.\d+)?\s*(?:%|s\b)?\s*")
_TIPO_DANO = re.compile(r"<(DT_\w+)>([^\s<,.:;)/]+)")


def _nombre_stat(loc: str) -> str:
    """"|val|% <DT_FIRE_COLOR>Heat" -> "Heat"; "|val|s Combo Duration" -> "Combo Duration"."""
    t = re.sub(r"<[^<>\n]*>", "", loc or "")
    return re.sub(r"^\|\w+\|\s*(%|s\b)?\s*", "", t).strip()


def _mayuscula(s: str) -> str:
    s = s.removeprefix("de ").strip()
    return s[:1].upper() + s[1:]


def _votos(votos: dict) -> dict:
    return {k: max(vs, key=lambda v: (vs[v], v)) for k, vs in votos.items()}


def _traductor_stats():
    """`locTag` de un stat de Riven -> nombre en español. El export `_es` deja esos `locTag` en inglés, así que sale
    de las líneas de los mods comunes: el tipo de daño por su marca (`<DT_GAS_COLOR>gas`) y el resto por el texto
    ("+15% Critical Chance" ↔ "+150% de probabilidad crítica"). Con más de una traducción, la más usada; si no hay
    ninguna, queda el inglés."""
    es = wf.by_unique("Upgrades", "es")
    por_tipo: dict = {}
    por_texto: dict = {}
    for x in wf.export("Upgrades", "en"):
        y = es.get(x["uniqueName"]) or {}
        for a, b in zip(x.get("levelStats") or [], y.get("levelStats") or []):
            for s, t in zip(a["stats"], b["stats"]):
                for m in _TIPO_DANO.finditer(t):
                    por_tipo.setdefault(m.group(1), {}).setdefault(m.group(2), 0)
                    por_tipo[m.group(1)][m.group(2)] += 1
                s, t = _limpio(s), _limpio(t)
                if "\n" in s or not _NUMERO.match(s) or not _NUMERO.match(t):
                    continue
                k, v = _NUMERO.sub("", s), _NUMERO.sub("", t)
                if k and v and k != v:
                    por_texto.setdefault(k, {}).setdefault(v, 0)
                    por_texto[k][v] += 1
    tipos, textos = _votos(por_tipo), _votos(por_texto)

    def traducir(loc: str) -> str:
        nombre = _nombre_stat(loc)
        m = _TIPO_DANO.search(loc)
        if m and nombre == m.group(2) and m.group(1) in tipos:
            return _mayuscula(tipos[m.group(1)])
        return _mayuscula(textos[nombre]) if nombre in textos else nombre
    return traducir


def build_data(items: list[dict], mods: list[dict]) -> dict[str, object]:
    """Los archivos del armador y de Rivens. `items` y `mods` son los de `site_data` (con `slug` e `img`)."""
    cl = Clases()
    objetos, armas_riven = [], []
    for i in items:
        x = i["en"]
        clase = cl.de(i["unique"], i["name"][0]) if i["kind"] in ("primary", "secondary", "melee") else None
        riven = _tipo_riven(i, clase)
        if riven:
            armas_riven.append({"slug": i["slug"], "name": i["name"], "type": riven,
                                "d": _num(x["omegaAttenuation"]), "icon": i["img"]})
        if i["kind"] not in KINDS or (i["kind"] == "warframe" and x.get("productCategory") != "Suits"):
            continue
        o = {"slug": i["slug"], "name": i["name"], "kind": i["kind"], "icon": i["img"],
             "cap": x.get("maxLevelCap") or 30}
        if i["kind"] == "warframe":
            base = re.sub(r" (Prime|Umbra)$", "", x["name"])
            o["compat"] = list(dict.fromkeys(["WARFRAME", "AURA", x["name"], base]))
            o["f"] = _warframe(x)
        else:
            o["compat"] = _compat_arma(i["kind"], x["name"], clase)
            o["w"] = _arma(x, clase, riven)
        objetos.append(o)

    compat_de = {k: {c for o in objetos if o["kind"] == k for c in o["compat"]} for k in KINDS}
    en, es = wf.by_unique("Upgrades", "en"), wf.by_unique("Upgrades", "es")
    por_kind: dict = {k: [] for k in KINDS}
    for m in mods:
        x = en.get(m["unique"])
        if not x or m["kind"] != "mod" or any(p in m["unique"] for p in FUERA):
            continue
        kind = TIPOS_MOD.get(x.get("type"))
        if kind is None or x.get("compatName") not in compat_de[kind]:
            continue  # sin objeto que lo acepte (garras de compañeros, "Unique")
        por_kind[kind].append(_mod(m, x, es.get(m["unique"])))
    files: dict = {"builder/items.json": {"items": objetos}}
    for k in KINDS:
        ms = sorted(por_kind[k], key=lambda m: (m["name"][0].casefold(), m["slug"]))
        files[f"builder/mods-{k}.json"] = {"mods": ms}
    files["rivens/list.json"] = _rivens(armas_riven)
    return files


if __name__ == "__main__":
    if "--clases" in sys.argv:
        bajar_clases()
    else:
        print(__doc__)
