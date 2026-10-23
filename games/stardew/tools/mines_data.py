"""Datos de las Minas y del combate de Stardew Valley para el sitio: armas, botas, anillos, baratijas, monstruos y pisos.

Uso: python games/stardew/tools/mines_data.py

Escribe `games/stardew/data/mines.json`. Lo que está en `Data/*` (armas, botas, monstruos, baratijas, tiendas) se lee de
ahí; lo que el juego tiene en el código (qué monstruo sale en qué piso, los minerales, los premios de los cofres) se copió
como valores a las tablas de abajo, y cada una nombra el método de origen.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crops_data  # noqa: E402
import relations  # noqa: E402
import sdv  # noqa: E402

DATA = crops_data.DATA

# Tipos de arma (`Data/Weapons`): 0 espada de estocada, 1 daga, 2 maza, 3 espada, 4 tirachinas. El nombre que el juego
# pone en la descripción (`MeleeWeapon.getCategoryName`): daga, porra o espada (los dos tipos de espada); la tirachinas
# se llama con el nombre del arma base.
_TIPO_CLAVE = {0: "Tool.cs.14306", 1: "Tool.cs.14304", 2: "Tool.cs.14305", 3: "Tool.cs.14306"}
_TIRACHINAS = "Slingshot_Name"  # Strings/Weapons: el nombre genérico de las tirachinas

# Zonas. clave: (nombre [en, es] -> claves de texto del juego o texto propio, desde, hasta, nota propia).
# `MineShaft.getMineArea`: área 0 y 10 son los pisos 1 a 39 (de 11 a 29 es el área 10), 40 los pisos 40 a 79, 80 los pisos
# 80 a 120 y 121 la Caverna Calavera (del 121 para abajo, sin fondo); 77377 es la cantera. Los pisos de baba y de
# infestación salen de `MineShaft.loadLevel` (4,4 % de los pisos con mapa 6 a 29 de cada tramo).
# Las notas y los nombres de zona son texto propio (el juego no los trae en `Strings`).
_ZONAS = [
    ("mines1", ["The Mines (floors 1-39)", "Las Minas (pisos 1 a 39)"], [1, 39],
     ["Cobre al principio, hierro desde el piso 20.", "Copper at first, iron from floor 20."]),
    ("mines2", ["The Frozen Mines (floors 40-79)", "Las Minas heladas (pisos 40 a 79)"], [40, 79],
     ["Hierro y, desde el piso 60, oro.", "Iron and, from floor 60, gold."]),
    ("mines3", ["The Lava Mines (floors 80-120)", "Las Minas de lava (pisos 80 a 120)"], [80, 120],
     ["Oro, hierro y el cofre de la Llave de la Calavera en el 120.", "Gold, iron and the Skull Key chest on floor 120."]),
    ("skull", ["The Skull Cavern", "La Caverna Calavera"], [121, None],
     ["Sin fondo. Aparece el iridio y el Bicho blindado en los pisos múltiplos de 16.",
      "Bottomless. Iridium shows up, and the Armored Bug on floors that are multiples of 16."]),
    ("slimes", ["Slime floors", "Pisos de baba"], [6, 109],
     ["Un piso al azar (4,4 %) donde hay que matar a todos para bajar; sólo salen babas.",
      "A random floor (4.4%) where you must kill everything to go down; only slimes appear."]),
    ("infested", ["Infested floors", "Pisos de infestación"], [6, 109],
     ["Un piso al azar (4,4 %) donde hay que matar a todos para bajar; salen los monstruos de siempre de ese tramo.",
      "A random floor (4.4%) where you must kill everything to go down; the usual monsters of that stretch appear."]),
    ("dino", ["Dinosaur floors", "Pisos de dinosaurios"], [127, None],
     ["Un piso al azar de la Caverna Calavera con Rex pimienta y huevos.", "A random Skull Cavern floor full of Pepper Rexes."]),
    ("quarry", ["The Quarry Mine", "La mina de la cantera"], None,
     ["Se llega por la cantera, no por el ascensor.", "Reached through the quarry, not by the elevator."]),
    ("dangerous", ["Dangerous mode", "Modo peligroso"], [1, None],
     ["Después del desafío del Sr. Qi: cambian los monstruos de las Minas y la Calavera.",
      "After Mr. Qi's challenge: the monsters of the Mines and the Skull Cavern change."]),
    ("volcano", ["The Volcano Dungeon", "La mazmorra del volcán"], None,
     ["En la Isla Jengibre.", "On Ginger Island."]),
    ("wilderness", ["Wilderness Farm", "La granja del Bosque Salvaje"], None,
     ["Los golems salen de noche en la granja de combate.", "Golems spawn at night on the combat farm."]),
]
# Minerales de cada zona (`MineShaft.getOreIdForLevel` y `checkStoneForItems`): cobre 378, hierro 380, oro 384, iridio
# 386, carbón 382, geodas 535/536/537 y la geoda omni 749 (desde el piso 21).
_MINERALES = {
    "mines1": ["378", "380", "382", "535", "749"],
    "mines2": ["378", "380", "384", "382", "536", "749"],
    "mines3": ["378", "380", "384", "382", "537", "749"],
    "skull": ["378", "380", "384", "386", "382", "749"],
    "quarry": ["380"],
}

# Dónde sale cada monstruo: clave -> [(zona, desde, hasta)]; hasta None es sin fondo y (None, None) un sitio sin pisos.
# De `MineShaft.getMonsterForThisLevel` (cada rama por área), `MineShaft.populateLevel`, `GreenSlime(position, mineLevel)`
# (el nombre sale del piso: baba verde, gelatina helada, lodo), `Bat(position, mineLevel)` (murciélago, de hielo, de
# lava, de iridio), `VolcanoDungeon.populateLevel` y `RockGolem(position, difficultyMod)`. Quedan afuera los que el juego
# no pone en ningún lado: Shadow Guy, Fireball, Crow, Frog, Cat, Dwarvish Sentry, Truffle Crab y Skeleton Warrior.
_DONDE = {
    "Green Slime": [("mines1", 2, 39), ("slimes", 6, 29)],
    "Frost Jelly": [("mines2", 40, 79), ("slimes", 46, 69)],
    "Sludge": [("mines3", 80, 120), ("slimes", 86, 109), ("skull", 121, None), ("quarry", None, None)],
    "Big Slime": [("slimes", 6, 109), ("skull", 121, None)],
    "Bug": [("mines1", 2, 39)],
    "Duggy": [("mines1", 2, 30)],
    "Rock Crab": [("mines1", 2, 30)],
    "Fly": [("mines1", 16, 30), ("dino", 127, None)],
    "Grub": [("mines1", 16, 30)],
    "Bat": [("mines1", 31, 39)],
    "Stone Golem": [("mines1", 31, 39)],
    "Dust Spirit": [("mines2", 40, 79)],
    "Frost Bat": [("mines2", 40, 79)],
    "Ghost": [("mines2", 51, 79)],
    "Skeleton": [("mines2", 70, 79), ("quarry", None, None)],
    "Skeleton Mage": [("quarry", None, None), ("dangerous", 70, 79)],
    "Lava Bat": [("mines3", 80, 120), ("skull", 121, 170)],
    "Metal Head": [("mines3", 80, 120)],
    "Shadow Brute": [("mines3", 80, 120)],
    "Shadow Shaman": [("mines3", 80, 120)],
    "Lava Crab": [("mines3", 80, 120)],
    "Squid Kid": [("mines3", 90, 120)],
    "Iridium Bat": [("skull", 171, None)],
    "Serpent": [("skull", 121, None)],
    "Mummy": [("skull", 121, None)],
    "Carbon Ghost": [("skull", 121, None), ("dangerous", 31, 39)],
    "Iridium Crab": [("skull", 146, None)],
    "Pepper Rex": [("skull", 126, None), ("dino", 127, None)],
    "Royal Serpent": [("dangerous", 121, None)],
    "Putrid Ghost": [("dangerous", 51, 79)],
    "Shadow Sniper": [("dangerous", 80, 120)],
    "Spider": [("dangerous", 50, 79)],
    "Blue Squid": [("dangerous", 16, 30)],
    "Magma Duggy": [("volcano", None, None)],
    "False Magma Cap": [("volcano", None, None)],
    "Magma Sprite": [("volcano", None, None)],
    "Magma Sparker": [("volcano", None, None)],
    "Hot Head": [("volcano", None, None)],
    "Lava Lurk": [("volcano", None, None)],
    "Tiger Slime": [("volcano", None, None)],
    "Spiker": [("volcano", None, None)],
    "Wilderness Golem": [("wilderness", None, None)],
    "Iridium Golem": [("wilderness", None, None)],
}

# Cofres de los pisos de las Minas (`MineShaft.addLevelChests`): piso -> id del premio. El 30 no tiene cofre. El del 120
# da la Llave de la Calavera (`SpecialItem(4)`) y el del 100 el fruto estelar ("434").
_COFRES = {10: "(B)506", 20: "(W)11", 40: "(W)32", 50: "(B)509", 60: "(W)21", 70: "(W)33", 80: "(B)512", 90: "(W)8",
           100: "(O)434", 110: "(B)514", 120: "SkullKey"}
# Con los cofres remezclados (`MineShaft.GetReplacementChestItem`) el premio sale al azar de esta lista.
_COFRES_REMEZCLADOS = {
    10: ["(B)506", "(B)507", "(W)12", "(W)17", "(W)22", "(W)31"],
    20: ["(W)11", "(W)24", "(W)20", "(O)517", "(O)519"],
    50: ["(B)509", "(B)510", "(B)508", "(W)1", "(W)43"],
    60: ["(W)21", "(W)44", "(W)6", "(W)18", "(W)27"],
    80: ["(B)512", "(B)511", "(W)10", "(W)7", "(W)46", "(W)19"],
    90: ["(W)8", "(W)52", "(W)45", "(W)5", "(W)60"],
    110: ["(B)514", "(B)878", "(W)50", "(W)28"],
}
# El ascensor (`MineShaft.setElevatorLit`, `prepareElevator`): se enciende en los pisos múltiplos de 5.
_ASCENSOR = {"every": 5, "last": 120}

# Sprite de cada monstruo: archivo en Characters/Monsters, origen y tamaño del primer cuadro (los tamaños salen de cada
# clase: `Monster.reloadSprite` 16x16, 16x24 la baba, el cangrejo, el gusano y los golems, 16x32 los esqueletos, la
# momia y el bruto, 32x32 la serpiente, el Rex, el francotirador y la araña, 24x24 el calamar azul). Las babas helada y
# de lodo usan la hoja de la baba verde, teñida (`GreenSlime`: `color`).
_VERDE = (60, 230, 25)
_TAMANOS = {
    "Big Slime": (32, 32), "Blue Squid": (24, 24), "Carbon Ghost": (16, 24), "Duggy": (16, 24), "Magma Duggy": (16, 24),
    "False Magma Cap": (16, 24), "Fly": (16, 24), "Ghost": (16, 24), "Green Slime": (16, 24), "Grub": (16, 24),
    "Hot Head": (16, 24), "Iridium Crab": (16, 24), "Iridium Golem": (16, 24), "Lava Crab": (16, 24),
    "Mummy": (16, 32), "Pepper Rex": (32, 32), "Putrid Ghost": (16, 24), "Rock Crab": (16, 24),
    "Royal Serpent": (32, 32), "Serpent": (32, 32), "Shadow Brute": (16, 32), "Shadow Shaman": (16, 24),
    "Shadow Sniper": (32, 32), "Skeleton": (16, 32), "Skeleton Mage": (16, 32), "Spider": (32, 32),
    "Stone Golem": (16, 24), "Tiger Slime": (16, 24), "Wilderness Golem": (16, 24), "Dust Spirit": (16, 16),
}
_TINTES = {"Frost Jelly": (40, 175, 230), "Sludge": (230, 40, 60)}
_TEXTURA_DE = {"Frost Jelly": "Green Slime", "Sludge": "Green Slime"}


def monster_sprite(key: str) -> dict:
    """De dónde sale el sprite de un monstruo: hoja, origen (x, y), tamaño y tinte (o None)."""
    hoja = _TEXTURA_DE.get(key, key)
    w, h = _TAMANOS.get(_TEXTURA_DE.get(key, key), (16, 16))
    return {"sheet": hoja, "x": 0, "y": 8 if key == "Dust Spirit" else 0, "w": w, "h": h, "tint": _TINTES.get(key)}


def _texto(archivo: str, clave: str) -> list[str]:
    en = sdv.raw(archivo)[clave]
    return [en, sdv.raw(archivo + ".es-ES").get(clave) or en]


def _sitio() -> tuple[dict[str, tuple[str, str]], dict[str, list]]:
    """id -> (slug, slug español) y id -> [nombre en, nombre es, ancho, alto] de lo que ya publica el sitio."""
    filas = json.loads((DATA / "site/list.json").read_text(encoding="utf-8"))
    es = json.loads((DATA / "site/names-es.json").read_text(encoding="utf-8"))
    objs = sdv.raw("Data/Objects")
    slugs, nombres = {}, {}
    for f, e in zip(filas, es):
        slugs[f[0]] = (f[1], e[1])
        nombres[f[0]] = [sdv.text(objs[f[0]]["DisplayName"], "en"), e[0]] if f[0] in objs else [f[1], e[0]]
    return slugs, nombres


def _unico(base: str, usados: set[str], desempate: str) -> str:
    slug = base if base not in usados else sdv.slugify(desempate)
    if slug in usados:
        raise ValueError(f"slug repetido: {slug}")
    usados.add(slug)
    return slug


def _tiendas() -> dict[str, dict]:
    """id de arma o bota -> la tienda que la vende (la Guild de Aventureros) con su precio y el piso que pide."""
    nombre = _texto("Strings/StringsFromCSFiles", "MapPage.cs.11099")
    out = {}
    for it in sdv.raw("Data/Shops")["AdventureShop"]["Items"]:
        iid = it.get("ItemId") or ""
        if not iid.startswith(("(W)", "(B)")) or (it.get("Price") or -1) <= 0:
            continue
        cond = it.get("Condition") or ""
        tienda = {"shop": nombre, "price": it["Price"], "floor": None}
        if cond.startswith("MINE_LOWEST_LEVEL_REACHED"):
            tienda["floor"] = int(cond.split()[1])
        elif "galaxySword" in cond:
            tienda["needs"] = "galaxySword"
        out[iid] = tienda
    return out


def weapons() -> list[dict]:
    tiendas = _tiendas()
    nombres: set[str] = set()
    nombres_es: set[str] = set()
    out = []
    for n, w in sdv.raw("Data/Weapons").items():
        en, es = sdv.text(w["DisplayName"], "en"), sdv.text(w["DisplayName"], "es")
        out.append({
            "id": f"(W){n}",
            "slug": _unico(sdv.slugify(en), nombres, f"{en} {n}"),
            "slugEs": _unico(sdv.slugify(es), nombres_es, f"{es} {n}"),
            "name": [en, es],
            "desc": [sdv.text(w["Description"], "en"), sdv.text(w["Description"], "es")],
            "type": w["Type"],
            "typeName": _texto("Strings/StringsFromCSFiles", _TIPO_CLAVE[w["Type"]]) if w["Type"] in _TIPO_CLAVE
            else _texto("Strings/Weapons", _TIRACHINAS),
            "dmg": [w["MinDamage"], w["MaxDamage"]],
            "speed": w["Speed"],
            "crit": [w["CritChance"], w["CritMultiplier"]],
            "knockback": w["Knockback"],
            "precision": w["Precision"],
            "defense": w["Defense"],
            "aoe": w["AreaOfEffect"],
            "floors": None if w["MineBaseLevel"] == -1 else [w["MineBaseLevel"], w["MineMinLevel"]],
            "shop": tiendas.get(f"(W){n}"),
            "sprite": w["SpriteIndex"],
        })
    return out


def boots() -> list[dict]:
    tiendas = _tiendas()
    es = sdv.raw("Data/Boots.es-ES")
    out = []
    for n, v in sdv.raw("Data/Boots").items():
        c = v.split("/")
        ce = (es.get(n) or v).split("/")
        out.append({
            "id": f"(B){n}", "name": [c[6], ce[6]], "desc": [c[1], ce[1]], "price": int(c[2]),
            "defense": int(c[3]), "immunity": int(c[4]), "shop": tiendas.get(f"(B){n}"),
        })
    return out


def rings(slugs: dict) -> list[dict]:
    out = []
    for i, o in relations.objects().items():
        if o.get("Type") != "Ring":
            continue
        s = slugs.get(i, (None, None))
        out.append({
            "id": i, "slug": s[0], "slugEs": s[1],
            "name": [sdv.text(o["DisplayName"], "en"), sdv.text(o["DisplayName"], "es")],
            "desc": [sdv.text(o["Description"], "en"), sdv.text(o["Description"], "es")],
            "price": o.get("Price", 0),
        })
    return out


def trinkets() -> list[dict]:
    out = []
    for k, t in sdv.raw("Data/Trinkets").items():
        en, es = sdv.text(t["DisplayName"], "en"), sdv.text(t["DisplayName"], "es")
        out.append({
            "id": f"(TR){k}", "slug": sdv.slugify(en), "slugEs": sdv.slugify(es), "name": [en, es],
            "desc": [sdv.text(t["Description"], "en"), sdv.text(t["Description"], "es")],
            "drops": bool(t["DropsNaturally"]), "sprite": t["SheetIndex"],
        })
    return out


def monsters() -> list[dict]:
    en, es = sdv.raw("Data/Monsters"), sdv.raw("Data/Monsters.es-ES")
    cazador = {t: k for k, q in sdv.raw("Data/MonsterSlayerQuests").items() for t in q["Targets"]}
    # Las claves que no tienen sitio quedan afuera; el orden es el del archivo.
    claves = [k for k in en if k in _DONDE]
    slugs, slugs_es = set(), set()
    out = []
    for k in claves:
        c = en[k].split("/")
        ce = (es.get(k) or en[k]).split("/")
        nombre = [c[14], ce[14]]
        # El Gólem de iridio se llama igual que el salvaje en los datos del juego: se desempata con la clave.
        slug = _unico(sdv.slugify(nombre[0]), slugs, k)
        slug_es = _unico(sdv.slugify(nombre[1]), slugs_es, k)
        botin = c[6].split()
        loot = [[botin[i], float(botin[i + 1])] for i in range(0, len(botin) - 1, 2) if not botin[i].startswith("-")]
        sp = monster_sprite(k)
        out.append({
            "key": k, "slug": slug, "slugEs": slug_es, "name": nombre,
            "hp": int(c[0]), "dmg": int(c[1]), "def": int(c[7]), "speed": int(c[10]), "xp": int(c[13]),
            "coins": [int(c[2]), int(c[3])], "loot": loot,
            "where": [{"zone": z, "floors": None if d is None else [d, hasta]} for z, d, hasta in _DONDE[k]],
            "dangerous": (sdv.RAW / f"textures/Characters/Monsters/{k}_dangerous.png").exists(),
            "slayer": cazador.get(k),
            "sprite": [sp["w"], sp["h"]],
        })
    return out


def zones(monstruos: list[dict]) -> list[dict]:
    out = []
    for clave, nombre, pisos, nota in _ZONAS:
        z = {
            "key": clave, "name": nombre, "floors": pisos,
            "monsters": [m["key"] for m in monstruos if any(d["zone"] == clave for d in m["where"])],
            "ores": _MINERALES.get(clave, []),
        }
        if nota:
            z["note"] = nota
        out.append(z)
    return out


def _nombre_premio(item: str) -> list[str]:
    if item == "SkullKey":
        return _texto("Strings/StringsFromCSFiles", "SpecialItem.cs.13088")
    n = item[3:]
    if item.startswith("(W)"):
        w = sdv.raw("Data/Weapons")[n]["DisplayName"]
        return [sdv.text(w, "en"), sdv.text(w, "es")]
    if item.startswith("(B)"):
        return [sdv.raw("Data/Boots")[n].split("/")[6], (sdv.raw("Data/Boots.es-ES").get(n) or sdv.raw("Data/Boots")[n]).split("/")[6]]
    o = sdv.raw("Data/Objects")[n]["DisplayName"]
    return [sdv.text(o, "en"), sdv.text(o, "es")]


def chests() -> list[dict]:
    out = []
    for piso, item in _COFRES.items():
        c = {"floor": piso, "item": item, "name": _nombre_premio(item)}
        if piso in _COFRES_REMEZCLADOS:
            c["remixed"] = _COFRES_REMEZCLADOS[piso]
        out.append(c)
    return out


def mines() -> dict:
    slugs, nombres = _sitio()
    mons = monsters()
    ar, bo, an, ba, ch = weapons(), boots(), rings(slugs), trinkets(), chests()
    zo = zones(mons)
    # Los objetos nombrados: botín, minerales y premios (con la forma de `Ref`: slug, slug español, nombre en, es, ancho, alto).
    ids = {i for m in mons for i, _ in m["loot"]} | {i for z in zo for i in z["ores"]}
    ids |= {c["item"][3:] for c in ch if c["item"].startswith("(O)")}
    ids |= {i[3:] for r in ch for i in r.get("remixed", []) if i.startswith("(O)")}
    ids |= {r["id"] for r in an}
    refs = {i: [*slugs[i], *nombres[i], 16, 16] for i in sorted(ids) if i in slugs}
    return {"weapons": ar, "boots": bo, "rings": an, "trinkets": ba, "monsters": mons, "zones": zo, "chests": ch,
            "elevator": _ASCENSOR, "refs": refs}


def main() -> None:
    ruta = DATA / "mines.json"
    ruta.write_text(json.dumps(mines(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("mines.json", ruta.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
