"""Arma los datos de las pestañas Jefes y NPC (games/terraria/data/bosses.json y npcs.json) a partir de la caché.

Uso: python games/terraria/tools/world_data.py   (después de site_data.py: usa sus slugs)

Lo que sale del juego: estadísticas y botín de cada jefe, a quién y qué bioma prefiere cada NPC y los multiplicadores
de la tienda. Lo que se escribe a mano acá, porque en el juego es código y no datos: el orden de los jefes, con qué se
invoca cada uno y qué destraba. `build_bosses` y `build_npcs` son puras y son lo que prueban los tests.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
DATA = ROOT / "data"

# Los jefes, en el orden en que se suelen pelear. Cada uno: clave (su slug), ids de enemigo (el primero da el nombre;
# todos suman botín y vida; uno que aparece varias veces va como `(id, cantidad)`), cara del mapa si el juego no la da, objeto que lo invoca (nombre interno) o
# None, si es de Hardmode, y dos textos cortos en inglés y español: cómo aparece y qué destraba.
#
# Los nombres propios no se escriben a mano (la traducción oficial no es la que uno supone): van como marcas que se
# resuelven con los textos del juego. {i:X} objeto por nombre interno, {n:N} enemigo o NPC por id, {b:X} bioma del
# Bestiario, {e:X} evento del Bestiario. El objeto que invoca no se nombra en el texto: la página lo muestra al lado.
BOSSES = [
    ("king-slime", [50], None, "SlimeCrown", False,
     ("Use it anywhere, or wait for a {e:SlimeRain}.", "Usalo en cualquier lado, o esperá una {e:SlimeRain}."),
     ("Optional. An easy first boss.", "Opcional. Un primer jefe fácil.")),
    ("eye-of-cthulhu", [4], None, "SuspiciousLookingEye", False,
     ("Use it at night. It can also show up on its own.", "Usalo de noche. También puede aparecer solo."),
     ("{i:DemoniteOre} or {i:CrimtaneOre} for your first evil-biome gear.", "{i:DemoniteOre} o {i:CrimtaneOre} para tu primer equipo del bioma maligno.")),
    ("eater-of-worlds", [13, (14, 65), 15], None, "WormFood", False,
     ("Only in worlds with {b:TheCorruption}: use it there, or break three shadow orbs.", "Sólo en mundos con {b:TheCorruption}: usalo ahí, o rompé tres orbes del bioma."),
     ("{i:ShadowScale}, and meteorites can start falling.", "{i:ShadowScale}, y empiezan a caer meteoritos.")),
    ("brain-of-cthulhu", [266], None, "BloodySpine", False,
     ("Only in worlds with {b:Crimson}: use it there, or break three crimson hearts.", "Sólo en mundos con {b:Crimson}: usalo ahí, o rompé tres corazones del bioma."),
     ("{i:TissueSample}, and meteorites can start falling.", "{i:TissueSample}, y empiezan a caer meteoritos.")),
    ("queen-bee", [222], None, "Abeemination", False,
     ("Break the larva inside a hive in {b:UndergroundJungle}, or use it there.", "Rompé la larva de una colmena en {b:UndergroundJungle}, o usalo ahí."),
     ("Optional. The {n:228} moves in.", "Opcional. Llega el {n:228}.")),
    ("skeletron", [35, (36, 2)], None, "ClothierVoodooDoll", False,
     ("Talk to the {n:37} at the entrance of {b:TheDungeon} at night.", "Hablá con el {n:37} en la entrada de {b:TheDungeon} de noche."),
     ("Opens {b:TheDungeon}, and the {n:54} moves in.", "Abre {b:TheDungeon}, y llega el {n:54}.")),
    ("deerclops", [668], None, "DeerThing", False,
     ("Use it in {b:Snow}, or it shows up at midnight during a {e:Blizzard}.", "Usalo en {b:Snow}, o aparece a medianoche durante una {e:Blizzard}."),
     ("Optional.", "Opcional.")),
    ("wall-of-flesh", [113], None, "GuideVoodooDoll", False,
     ("Throw it into lava in {b:TheUnderworld}, with the {n:22} alive.", "Tiralo a la lava de {b:TheUnderworld}, con el {n:22} vivo."),
     ("Starts Hardmode: new ores and enemies, {b:TheHallow}, and the {i:Pwnhammer}.", "Empieza el Hardmode: minerales y enemigos nuevos, {b:TheHallow}, y el {i:Pwnhammer}.")),
    ("queen-slime", [657], None, "QueenSlimeCrystal", True,
     ("Use it in {b:TheHallow}.", "Usalo en {b:TheHallow}."),
     ("Optional.", "Opcional.")),
    ("the-twins", [125, 126], None, "MechanicalEye", True,
     ("Use it at night.", "Usalo de noche."),
     ("{i:SoulofSight}. One of the three mechanical bosses {n:262} needs.", "{i:SoulofSight}. Uno de los tres jefes mecánicos que hacen falta para {n:262}.")),
    ("the-destroyer", [134], None, "MechanicalWorm", True,
     ("Use it at night.", "Usalo de noche."),
     ("{i:SoulofMight}. One of the three mechanical bosses {n:262} needs.", "{i:SoulofMight}. Uno de los tres jefes mecánicos que hacen falta para {n:262}.")),
    ("skeletron-prime", [127, 128, 129, 130, 131], None, "MechanicalSkull", True,
     ("Use it at night.", "Usalo de noche."),
     ("{i:SoulofFright}. One of the three mechanical bosses {n:262} needs.", "{i:SoulofFright}. Uno de los tres jefes mecánicos que hacen falta para {n:262}.")),
    ("plantera", [262], None, None, True,
     ("Break one of its pink bulbs in {b:UndergroundJungle}. They grow after the three mechanical bosses.", "Rompé uno de sus bulbos rosas en {b:UndergroundJungle}. Crecen después de los tres jefes mecánicos."),
     ("The {i:TempleKey}, and {b:TheDungeon} gets its Hardmode enemies.", "{i:TempleKey}, y {b:TheDungeon} recibe sus enemigos de Hardmode.")),
    ("golem", [245, 246, (247, 2)], 5, "LihzahrdPowerCell", True,
     ("Use it on the altar inside {b:TheTemple}.", "Usalo en el altar de {b:TheTemple}."),
     ("{i:BeetleHusk}, and the cultists appear at {b:TheDungeon}.", "{i:BeetleHusk}, y aparecen los sectarios en {b:TheDungeon}.")),
    ("duke-fishron", [370], None, "TruffleWorm", True,
     ("Fish in {b:Ocean} with it as bait.", "Pescá en {b:Ocean} con él de cebo."),
     ("Optional.", "Opcional.")),
    ("empress-of-light", [636], None, "EmpressButterfly", True,
     ("Kill it in {b:TheHallow} at night, after {n:262}.", "Matala en {b:TheHallow} de noche, después de {n:262}."),
     ("Optional. Beaten by day she drops {i:EmpressBlade}.", "Opcional. Vencida de día suelta {i:EmpressBlade}.")),
    ("lunatic-cultist", [439], None, None, True,
     ("Kill the four cultists at the entrance of {b:TheDungeon}, after {n:245}.", "Matá a los cuatro sectarios de la entrada de {b:TheDungeon}, después de {n:245}."),
     ("Starts the four pillars: {b:SolarPillar}, {b:VortexPillar}, {b:NebulaPillar} and {b:StardustPillar}.", "Empiezan las cuatro columnas: {b:SolarPillar}, {b:VortexPillar}, {b:NebulaPillar} y {b:StardustPillar}.")),
    ("moon-lord", [398, 396, (397, 2)], 8, "CelestialSigil", True,
     ("Destroy the four pillars, or use it afterwards.", "Destruí las cuatro columnas, o usalo después."),
     ("{i:LunarOre} and the endgame weapons. The final boss.", "{i:LunarOre} y las armas del final del juego. El jefe final.")),
]

# Los biomas de la tienda (su nombre sale de los textos del juego, `TownNPCMoodBiomes`) y el pilón que se vende en cada uno.
PYLONS = {
    "Forest": "TeleportationPylonPurity",
    "NormalUnderground": "TeleportationPylonUnderground",
    "Snow": "TeleportationPylonSnow",
    "Desert": "TeleportationPylonDesert",
    "Jungle": "TeleportationPylonJungle",
    "Ocean": "TeleportationPylonOcean",
    "Hallow": "TeleportationPylonHallow",
    "Mushroom": "TeleportationPylonMushroom",
    "Dungeon": None,
    "Corruption": None,
    "Crimson": None,
}

# El nombre de un jefe que no es el de su primer enemigo: (inglés, español), con las mismas marcas.
BOSS_NAMES = {"the-twins": ("{n:125} & {n:126}", "{n:125} y {n:126}"), "moon-lord": ("{n:396}", "{n:396}")}

LEVELS = {"Love": "love", "Like": "like", "Dislike": "dislike", "Hate": "hate"}


def resolver(cache: dict):
    """Devuelve `fmt(texto, idioma)`, que cambia las marcas {i:…}, {n:…}, {b:…} y {e:…} por los nombres oficiales."""
    item_id = {it["internal"]: str(it["id"]) for it in cache["items"]}
    code = {"en": "en-US", "es": "es-ES"}

    def one(kind: str, key: str, lang: str) -> str:
        if kind == "i":
            return cache[f"texts_{lang}"]["items"][item_id[key]][0]
        if kind == "n":
            return cache["npcs"][code[lang]][key]
        table = {"b": "Bestiary_Biomes", "e": "Bestiary_Events"}[kind]
        return cache[f"loc_{lang}"][table][key]

    def fmt(text: str, lang: str) -> str:
        out = re.sub(r"\{([inbe]):(\w+)\}", lambda m: one(m.group(1), m.group(2), lang), text)
        # Los nombres del Bestiario traen su artículo ("La Mazmorra"): en medio de la frase va en minúscula.
        out = re.sub(r"(?<=[a-záéíóú,:] )(The|La|El|Lo|Los|Las) (?=[A-ZÁÉÍÓÚ])", lambda m: m.group(1).lower() + " ", out)
        if lang == "es":
            out = out.replace(" de el ", " del ").replace(" a el ", " al ")
        return out[0].upper() + out[1:]

    return fmt


def classify(ratio: float, consts: dict) -> str | None:
    """El gusto que corresponde a cuánto cambió el precio al sumar un vecino (la tienda redondea a dos decimales)."""
    for level, key in (("love", "loveValue"), ("like", "likeValue"), ("dislike", "dislikeValue"), ("hate", "hateValue")):
        if abs(ratio - consts[key]) < 0.015:
            return level
    if abs(ratio - 1) < 0.015:
        return None
    raise ValueError(f"cociente de precio que no corresponde a ningún gusto: {ratio}")


def crowd_consts(crowd: list[float]) -> dict:
    """De los precios medidos con 0, 1, 2… vecinos indiferentes: el descuento por vivir con pocos, hasta cuántos vecinos
    dura, y el recargo por cada vecino de más."""
    solitude = round(crowd[0], 2)
    free = next(i for i, v in enumerate(crowd) if round(v, 2) == 1)
    return {"solitude": solitude, "solitudeUpTo": free - 1, "crowdFrom": free, "crowdStep": round(crowd[free + 1] / crowd[free], 2)}


def build_bosses(cache: dict, slugs: dict[int, list]) -> dict:
    """`slugs`: id de objeto → [slug, slugEs, nombre en, nombre es, rareza, ancho, alto] de los que tienen ficha."""
    stats = {s["id"]: s for s in cache["npcstats"]}
    names = cache["npcs"]
    by_internal = {it["internal"]: it["id"] for it in cache["items"]}
    out = []
    refs: dict[str, list] = {}
    fmt = resolver(cache)

    def ref(item: int) -> bool:
        if item not in slugs:
            return False
        refs[str(item)] = slugs[item]
        return True

    for key, parts, head, summon, hardmode, how, unlocks in BOSSES:
        counts = dict(p if isinstance(p, tuple) else (p, 1) for p in parts)
        ids = list(counts)
        main = stats[ids[0]]
        summon_id = by_internal[summon] if summon else 0
        if summon_id and not ref(summon_id):
            raise ValueError(f"el invocador de {key} ({summon}) no tiene ficha")
        drops: dict[tuple, list] = {}
        for d in cache["drops"]:
            if d["npc"] not in ids or not ref(d["item"]):
                continue
            conds = {c[0] for c in d["if"]}
            if "NeverTrue" in conds:
                continue
            mode = "m" if "IsMasterMode" in conds else "e" if "IsExpert" in conds else "n" if conds & {"NotExpert", "LegacyHack_IsBossAndNotExpert"} else ""
            row = [d["item"], d["min"], d["max"], round(d["rate"], 5), mode]
            k = (d["item"], mode)
            if k not in drops or drops[k][3] < row[3]:
                drops[k] = row
        name = BOSS_NAMES.get(key) or ("{n:%d}" % ids[0], "{n:%d}" % ids[0])
        out.append({
            "key": key,
            "npc": ids[0],
            "name": [fmt(name[0], "en"), fmt(name[1], "es")],
            "head": head if head is not None else main["bossHead"],
            "hardmode": hardmode,
            "parts": [[names["en-US"][str(i)], names["es-ES"].get(str(i)) or names["en-US"][str(i)], stats[i]["lifeMax"], stats[i]["damage"], stats[i]["defense"], counts[i]] for i in ids],
            "life": sum(stats[i]["lifeMax"] * counts[i] for i in ids),
            "summon": summon_id,
            "how": [fmt(how[0], "en"), fmt(how[1], "es")],
            "unlocks": [fmt(unlocks[0], "en"), fmt(unlocks[1], "es")],
            "drops": sorted(drops.values(), key=lambda r: ("nem".index(r[4]) if r[4] else -1, -r[3], r[0])),
        })
        if out[-1]["head"] < 0:
            raise ValueError(f"{key} no tiene cara de mapa: ponerla a mano en BOSSES")
    return {"bosses": out, "refs": refs}


def build_npcs(cache: dict, slugs: dict[int, list]) -> dict:
    consts = cache["happiness"]["consts"]
    stats = {s["id"]: s for s in cache["npcstats"]}
    names = cache["npcs"]
    by_internal = {it["internal"]: it["id"] for it in cache["items"]}
    npcs = []
    for sid, traits in cache["happiness"]["npcs"].items():
        i = int(sid)
        biomes = {key: LEVELS[level] for kind, key, level in traits if kind == "biome"}
        for key in biomes:
            if key not in PYLONS:
                raise ValueError(f"bioma que no está en PYLONS: {key}")
        near = cache["neighbors"][sid]
        likes = {}
        for other, price in near["with"].items():
            level = classify(price / near["alone"], consts)
            if level:
                likes[other] = level
        npcs.append({"id": i, "name": [names["en-US"][sid], names["es-ES"].get(sid) or names["en-US"][sid]], "head": stats[i]["head"], "biomes": biomes, "likes": likes})
    npcs.sort(key=lambda n: n["name"][0])
    biomes = {}
    refs = {}
    mood = {lang: cache[f"loc_{lang}"]["TownNPCMoodBiomes"] for lang in ("en", "es")}
    for key, pylon in PYLONS.items():
        item = by_internal.get(pylon, 0) if pylon else 0
        if item and item in slugs:
            refs[str(item)] = slugs[item]
        else:
            item = 0
        biomes[key] = {"name": [mood[lang][key][0].upper() + mood[lang][key][1:] for lang in ("en", "es")], "pylon": item}
    return {
        "consts": {
            "love": consts["loveValue"], "like": consts["likeValue"], "dislike": consts["dislikeValue"], "hate": consts["hateValue"],
            "min": consts["LowestPossiblePriceMultiplier"], "max": consts["HighestPossiblePriceMultiplier"],
            **crowd_consts(cache["neighbors"]["crowd"]),
        },
        "biomes": biomes,
        "npcs": npcs,
        "refs": refs,
    }


def item_refs() -> dict[int, list]:
    """De los datos que ya escribió site_data.py: una referencia por objeto con ficha."""
    site = DATA / "site"
    rows = json.loads((site / "list.json").read_text(encoding="utf-8"))
    en = json.loads((site / "names-en.json").read_text(encoding="utf-8"))
    es = json.loads((site / "names-es.json").read_text(encoding="utf-8"))
    return {r[0]: [r[1], es[i][1], en[i], es[i][0], r[3], r[4], r[5]] for i, r in enumerate(rows)}


def read_loose(pattern: str) -> dict:
    """Los JSON de textos del juego (con sus comas de más), todos los de un idioma juntos."""
    out: dict = {}
    for f in sorted(CACHE.glob(pattern)):
        out.update(json.loads(re.sub(r",(\s*[}\]])", r"\1", f.read_text(encoding="utf-8-sig"))))
    return out


def main() -> None:
    read = lambda name: json.loads((CACHE / name).read_text(encoding="utf-8-sig"))  # noqa: E731
    files = (("items", "items.json"), ("npcstats", "npcstats.json"), ("npcs", "npcs.json"), ("drops", "drops.json"), ("happiness", "happiness.json"),
             ("neighbors", "neighbors.json"), ("texts_en", "texts.en-US.json"), ("texts_es", "texts.es-ES.json"))
    cache = {k: read(f) for k, f in files}
    cache["loc_en"] = read_loose("loc.en-US*.json")
    cache["loc_es"] = read_loose("loc.es-ES*.json")
    slugs = item_refs()
    out = {"bosses.json": build_bosses(cache, slugs), "npcs.json": build_npcs(cache, slugs)}
    for name, content in out.items():
        (DATA / name).write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(out["bosses.json"]["bosses"]), "jefes,", len(out["npcs.json"]["npcs"]), "NPC")


if __name__ == "__main__":
    main()
