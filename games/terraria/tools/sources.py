"""De dónde sale cada objeto además del botín de enemigos: tiendas, cofres, bolsas de jefe, cajas, pesca, extractor y
Shimmer. Lo usa `site_data.py` para sumar `sources` a cada ficha.

Todo sale de la caché que deja `dump.ps1` (y `worlds.ps1` para los cofres). Lo único que se escribe a mano acá es cómo
se dice cada condición ("de noche", "después de Plantera"), con las mismas marcas que `world_data.py`: los nombres
propios los pone el juego. `build_sources` es pura y es lo que prueban los tests.

Cada fuente es un diccionario corto:
  k    tipo: shop, travel, pylon, chest, bag, crate, open, fish, extract, shimmer
  n    NPC que lo vende (id)                    i    objeto del que sale (la bolsa, la caja, lo que se transmuta)
  t    estación (el extractor)                  l    nombre del cofre [en, es]
  p    precio en monedas de cobre               c    objeto que hace de moneda, si no son monedas
  q    cantidad [mín, máx]                      r    probabilidad (0–1)
  tier rareza de la captura (pesca)             if   condición [en, es]
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from world_data import resolver

# Qué NPC atiende cada tienda de `Chest.SetupShop`. La 19 es el Mercader ambulante (va aparte) y la 25 es la segunda
# tienda del Pintor (cuadros). `SIGNATURE` es un objeto que cada una vende siempre: si un parche corre los números,
# `build_sources` falla en vez de atribuir una tienda al NPC equivocado.
SHOPS = {1: 17, 2: 19, 3: 20, 4: 38, 5: 54, 6: 107, 7: 108, 8: 124, 9: 142, 10: 160, 11: 178, 12: 207, 13: 208, 14: 209,
         15: 227, 16: 228, 17: 229, 18: 353, 20: 453, 21: 550, 22: 588, 23: 633, 24: 663, 25: 227}
SIGNATURE = {1: "MiningHelmet", 2: "MusketBall", 3: "Acorn", 4: "Grenade", 5: "BlackThread", 6: "RocketBoots", 7: "CrystalBall",
             8: "Wire", 10: "MushroomCap", 11: "Cog", 12: "DyeVat", 13: "ConfettiGun", 14: "RocketI", 15: "Paintbrush",
             16: "Blowgun", 17: "Cannon", 18: "HairDyeRemover", 20: "Rope", 21: "Ale", 22: "GolfTee", 23: "DogEars", 24: "RoyalTiara"}
TRAVELER = 368
TAVERNKEEP_SHOP = 21

# Cómo se dice cada condición. Las que no figuran y no están en `IGNORED` hacen fallar el armado: mejor enterarse.
AFTER = ("after {}", "después de {}")
COND = {
    "NPC.downedBoss1": ("after {n:4}", "después de {n:4}"),
    "NPC.downedBoss2": ("after {n:13} or {n:266}", "después de {n:13} o {n:266}"),
    "NPC.downedBoss3": ("after {n:35}", "después de {n:35}"),
    "NPC.downedQueenBee": ("after {n:222}", "después de {n:222}"),
    "NPC.downedSlimeKing": ("after {n:50}", "después de {n:50}"),
    "NPC.downedDeerclops": ("after {n:668}", "después de {n:668}"),
    "NPC.downedQueenSlime": ("after {n:657}", "después de {n:657}"),
    "NPC.downedMechBossAny": ("after any mechanical boss", "después de cualquier jefe mecánico"),
    "NPC.downedMechBoss1": ("after {n:134}", "después de {n:134}"),
    "NPC.downedMechBoss2": ("after {n:125} and {n:126}", "después de {n:125} y {n:126}"),
    "NPC.downedMechBoss3": ("after {n:127}", "después de {n:127}"),
    "NPC.downedPlantBoss": ("after {n:262}", "después de {n:262}"),
    "NPC.downedGolemBoss": ("after {n:245}", "después de {n:245}"),
    "NPC.downedFishron": ("after {n:370}", "después de {n:370}"),
    "NPC.downedEmpressOfLight": ("after {n:636}", "después de {n:636}"),
    "NPC.downedAncientCultist": ("after {n:439}", "después de {n:439}"),
    "NPC.downedMoonlord": ("after {n:396}", "después de {n:396}"),
    "NPC.downedTowerSolar": ("after the {b:SolarPillar}", "después de {b:SolarPillar}"),
    "NPC.downedTowerVortex": ("after the {b:VortexPillar}", "después de {b:VortexPillar}"),
    "NPC.downedTowerNebula": ("after the {b:NebulaPillar}", "después de {b:NebulaPillar}"),
    "NPC.downedTowerStardust": ("after the {b:StardustPillar}", "después de {b:StardustPillar}"),
    "NPC.downedGoblins": ("after a {v:Goblins}", "después de una {v:Goblins}"),
    "NPC.downedPirates": ("after a {v:Pirates}", "después de una {v:Pirates}"),
    "NPC.downedMartians": ("after {v:Martian}", "después de {v:Martian}"),
    "NPC.downedFrost": ("after the {v:FrostLegion}", "después de {v:FrostLegion}"),
    "NPC.downedClown": ("after killing a {n:109}", "después de matar a un {n:109}"),
    "DD2.DownedInvasionT1": ("after beating {v:OldOnesArmy}", "después de vencer a {v:OldOnesArmy}"),
    "DD2.DownedInvasionT2": ("after beating {v:OldOnesArmy} tier 2", "después de vencer a {v:OldOnesArmy} de nivel 2"),
    "DD2.DownedInvasionT3": ("after beating {v:OldOnesArmy} tier 3", "después de vencer a {v:OldOnesArmy} de nivel 3"),
    "Main.hardMode": ("in Hardmode", "en Hardmode"),
    "Main.bloodMoon": ("during a {e:BloodMoon}", "durante una {e:BloodMoon}"),
    "Main.eclipse": ("during an {e:Eclipse}", "durante un {e:Eclipse}"),
    "Main.halloween": ("during {e:Halloween}", "durante {e:Halloween}"),
    "Main.xMas": ("during {e:Christmas}", "durante {e:Christmas}"),
    "Main.raining": ("during {e:Rain}", "durante {e:Rain}"),
    "Main.slimeRain": ("during a {e:SlimeRain}", "durante una {e:SlimeRain}"),
    "Main.pumpkinMoon": ("during a {v:PumpkinMoon}", "durante una {v:PumpkinMoon}"),
    "Main.snowMoon": ("during a {v:FrostMoon}", "durante una {v:FrostMoon}"),
    "Party.ManualParty": ("during a {e:Party}", "durante una {e:Party}"),
    "Party.GenuineParty": ("during a {e:Party}", "durante una {e:Party}"),
    "night": ("at night", "de noche"),
    "WorldGen.crimson": ("in worlds with {b:Crimson}", "en mundos con {b:Crimson}"),
    "golf": ("with a high golf score", "con un buen puntaje de golf"),
    "Player.ZoneJungle": ("in {b:Jungle}", "en {b:Jungle}"),
    "Player.ZoneSnow": ("in {b:Snow}", "en {b:Snow}"),
    "Player.ZoneHallow": ("in {b:TheHallow}", "en {b:TheHallow}"),
    "Player.ZoneCorrupt": ("in {b:TheCorruption}", "en {b:TheCorruption}"),
    "Player.ZoneCrimson": ("in {b:Crimson}", "en {b:Crimson}"),
    "Player.ZoneDesert": ("in {b:Desert}", "en {b:Desert}"),
    "Player.ZoneBeach": ("in {b:Ocean}", "en {b:Ocean}"),
    "Player.ZoneGlowshroom": ("in {b:SurfaceMushroom}", "en {b:SurfaceMushroom}"),
    "Player.ZoneGraveyard": ("in a {b:Graveyard}", "en un {b:Graveyard}"),
    "Player.ZoneSkyHeight": ("in {b:Sky}", "en {b:Sky}"),
    "Player.ZoneUnderworldHeight": ("in {b:TheUnderworld}", "en {b:TheUnderworld}"),
    "Player.ZoneDungeon": ("in {b:TheDungeon}", "en {b:TheDungeon}"),
    "Player.ZoneRockLayerHeight": ("in {b:Caverns}", "en {b:Caverns}"),
    "Player.ZoneDirtLayerHeight": ("in {b:Underground}", "en {b:Underground}"),
    "Player.ZoneOverworldHeight": ("on {b:Surface}", "en {b:Surface}"),
    "Player.ZoneMeteor": ("near a {b:Meteor}", "cerca de un {b:Meteor}"),
    "Player.ZoneUndergroundDesert": ("in {b:UndergroundDesert}", "en {b:UndergroundDesert}"),
    "Player.ZoneLihzhardTemple": ("in {b:TheTemple}", "en {b:TheTemple}"),
}
# Lo contrario, para lo que una condición saca de la tienda.
NOT = {
    "night": ("during the day", "de día"),
    "WorldGen.crimson": ("in worlds with {b:TheCorruption}", "en mundos con {b:TheCorruption}"),
    "Main.bloodMoon": ("not during a {e:BloodMoon}", "salvo durante una {e:BloodMoon}"),
    "Main.eclipse": ("not during an {e:Eclipse}", "salvo durante un {e:Eclipse}"),
    "Main.hardMode": ("before Hardmode", "antes del Hardmode"),
    "Player.ZoneHallow": ("outside {b:TheHallow}", "fuera de {b:TheHallow}"),
    "Player.ZoneGraveyard": ("outside a {b:Graveyard}", "fuera de un {b:Graveyard}"),
}
MOON = ["FullMoon", "WaningGibbous", "ThirdQuarter", "WaningCrescent", "NewMoon", "WaxingCrescent", "FirstQuarter", "WaxingGibbous"]
ANY_BOSS = ("after any boss", "después de cualquier jefe")

# La pesca: cómo se dice cada condición de una regla (None = no se dice) y cada rareza de captura.
FISH = {
    "HardMode": COND["Main.hardMode"], "EarlyMode": NOT["Main.hardMode"],
    "InLava": ("in lava", "en lava"), "CanFishInLava": None, "InHoney": ("in honey", "en miel"),
    "Junk": ("in a pool that is too small, or with little fishing power", "en un charco muy chico, o con poco poder de pesca"),
    "Crate": None, "AnyEnemies": None,
    "Dungeon": COND["Player.ZoneDungeon"], "Beach": COND["Player.ZoneBeach"], "Ocean": COND["Player.ZoneBeach"],
    "OriginalOcean": COND["Player.ZoneBeach"], "Hallow": COND["Player.ZoneHallow"],
    "GlowingMushrooms": COND["Player.ZoneGlowshroom"], "TrueDesert": COND["Player.ZoneDesert"], "Desert": COND["Player.ZoneDesert"],
    "RolledHallowDesert": ("in {b:HallowDesert}", "en {b:HallowDesert}"),
    "TrueSnow": COND["Player.ZoneSnow"], "Snow": COND["Player.ZoneSnow"], "Corruption": COND["Player.ZoneCorrupt"],
    "Crimson": COND["Player.ZoneCrimson"], "Jungle": COND["Player.ZoneJungle"],
    "Height0": COND["Player.ZoneSkyHeight"], "Height1": COND["Player.ZoneOverworldHeight"],
    "Height2": COND["Player.ZoneDirtLayerHeight"], "Height3": COND["Player.ZoneRockLayerHeight"],
    "UnderRockLayer": COND["Player.ZoneRockLayerHeight"],
    "Height1And2": ("on {b:Surface} or in {b:Underground}", "en {b:Surface} o en {b:Underground}"),
    "HeightAbove1": ("in {b:Underground} or deeper", "en {b:Underground} o más abajo"),
    "HeightAboveAnd1": ("on {b:Surface} or deeper", "en {b:Surface} o más abajo"),
    "HeightAbove2": ("in {b:Caverns} or deeper", "en {b:Caverns} o más abajo"),
    "HeightUnder2": ("on {b:Surface} or higher", "en {b:Surface} o más arriba"),
    "Water1000": ("in a lake of over 1,000 tiles", "en un lago de más de 1.000 bloques"),
    "BloodMoon": COND["Main.bloodMoon"],
    "DidNotUseCombatBook": ("until you use one", "hasta que uses uno"),
}
FISH_QUEST = ("while the {n:369} asks for it", "mientras el {n:369} lo pida")
TIERS = {"Common": "common", "Uncommon": "uncommon", "UncommonOrCommon": "uncommon", "Rare": "rare", "VeryRare": "veryrare", "Legendary": "legendary"}

TIER_ORDER = ["", "common", "uncommon", "rare", "veryrare", "legendary"]

COINS = {71, 72, 73, 74}
EXTRACTORS = {219: "Extractinator", 642: "ChlorophyteExtractinator"}
ORDER = ["shop", "travel", "pylon", "chest", "bag", "crate", "open", "fish", "extract", "shimmer"]


def load(cache_dir: Path) -> dict:
    """La caché que pide `build_sources`, leída de `games/terraria/cache`. Lo que no esté (por ejemplo los cofres, si no
    se corrió `worlds.ps1`) simplemente no aporta fuentes."""
    read = lambda name: json.loads((cache_dir / name).read_text(encoding="utf-8-sig"))  # noqa: E731
    cache = {"items": read("items.json"), "npcs": read("npcs.json"), "texts_en": read("texts.en-US.json"), "texts_es": read("texts.es-ES.json")}
    for key in ("shops", "containers", "fishrules", "chests", "chestnames"):
        if (cache_dir / f"{key}.json").exists():
            cache[key] = read(f"{key}.json")
    # Todos los textos del juego (biomas, eventos, cofres), con sus comas de más.
    for lang, key in (("en-US", "loc_en"), ("es-ES", "loc_es")):
        cache[key] = {}
        for f in sorted(cache_dir.glob(f"loc.{lang}*.json")):
            cache[key].update(json.loads(re.sub(r",(\s*[}\]])", r"\1", f.read_text(encoding="utf-8-sig"))))
    return cache


def ignored(name: str) -> bool:
    """Condiciones que no cuentan: las semillas especiales de mundo y las que ninguna tienda mira."""
    return name.endswith("World")


def build_sources(cache: dict) -> dict[int, list[dict]]:
    """`cache`: items, npcs, loc_en, loc_es, texts_en, texts_es y, los que haya, shops, containers, fishrules, chests
    (con chestnames).
    Devuelve id de objeto → sus fuentes, ya ordenadas."""
    fmt = resolver(cache)
    internal = {it["internal"]: it["id"] for it in cache["items"]}
    by_id = {it["id"]: it for it in cache["items"]}
    out: dict[int, list[dict]] = defaultdict(list)

    def say(pair) -> list[str]:
        # Los nombres del Bestiario traen su artículo en mayúscula ("La jungla"): en medio de la frase va en minúscula.
        lower = lambda text: re.sub(r"(?<=[a-záéíóú,:] )(The|La|El|Lo|Los|Las) ", lambda m: m.group(0).lower(), text)  # noqa: E731
        return [lower(fmt(pair[0], "en")), lower(fmt(pair[1], "es")).replace(" de el ", " del ").replace(" de lo ", " de lo ")]

    def phrase(table: dict, name: str) -> tuple[str, str]:
        if name.startswith("npc:"):
            return ("with the {n:%s} in town" % name[4:], "con {n:%s} en el pueblo" % name[4:])
        if name not in table:
            raise KeyError(f"falta cómo decir la condición {name!r} (COND / NOT en sources.py)")
        return table[name]

    def moon(phases) -> tuple[str, str]:
        names = ", ".join("{m:%s}" % MOON[p] for p in sorted(phases))
        return ("moon: " + names, "luna: " + names)

    def join(parts: list[tuple[str, str]], word: tuple[str, str]) -> tuple[str, str]:
        seen: list[tuple[str, str]] = []
        for p in parts:
            if p not in seen:
                seen.append(p)
        return (word[0].join(p[0] for p in seen), word[1].join(p[1] for p in seen))

    AND, OR = (", ", ", "), ("; or ", "; o ")

    def note(row: dict, cond: tuple[str, str] | None) -> dict:
        if cond and cond[0]:
            row["if"] = say(cond)
        return row

    shops = cache.get("shops")
    if shops:
        _shops(shops, cache, internal, by_id, out, phrase, moon, join, note, AND, OR)
    if cache.get("containers"):
        _containers(cache["containers"], internal, out, note)
    if cache.get("fishrules"):
        _fishing(cache["fishrules"], out, join, note, AND)
    if cache.get("chests"):
        _chests(cache["chests"], cache, out)

    rank = {k: i for i, k in enumerate(ORDER)}
    return {i: sorted(rows, key=lambda r: (rank[r["k"]], -r.get("r", 1), r.get("n", 0), r.get("i", 0))) for i, rows in out.items()}


def _shops(shops, cache, internal, by_id, out, phrase, moon, join, note, AND, OR) -> None:
    states = shops["states"]
    pylons = {i for name, i in internal.items() if name.startswith("TeleportationPylon")}
    victory = internal.get("TeleportationPylonVictory")
    singles = [n for n in states if n != "base" and not n.startswith(("all:", "moon:")) and not ignored(n)]
    pairs: dict[tuple[int, int], list[tuple[str, str]]] = defaultdict(list)
    for shop, item, x, y in shops.get("pairs", []):
        if not ignored(x) and not ignored(y) and not (x.startswith("npc:") and y.startswith("npc:")):
            pairs[(shop, item)].append((x, y))
    minus: dict[tuple[int, int, str], set[str]] = defaultdict(set)
    for shop, item, x, y in shops.get("minus", []):
        minus[(shop, item, x)].add(y)
    reduced = {(shop, item): (need, phases) for shop, item, need, phases in shops.get("reduced", [])}
    bestiary: dict[int, float] = {}
    for pct, items in shops.get("bestiary", []):
        for i in items:
            bestiary.setdefault(i, pct)

    def restricted(base_phrase, shop, item, name):
        """Una condición que trae el objeto, más lo que la hora, la luna o un evento le sacan."""
        parts = [base_phrase]
        gone = minus.get((shop, item, name), set())
        phases = {0, 1, 2, 3, 4, 5, 6, 7} - {int(g[5:]) for g in gone if g.startswith("moon:")}
        # La fase 0 es la del mundo recién creado: si con ella ya no estaba, no habría aparecido sola.
        if len(phases) < 8:
            parts.append(moon(phases))
        parts += [phrase(NOT, g) for g in sorted(gone) if not g.startswith("moon:")]
        return join(parts, AND)

    for shop, npc in SHOPS.items():
        key = str(shop)
        base = set(states["base"].get(key, []))
        if shop in SIGNATURE:
            everywhere = set().union(*(set(st.get(key, [])) for st in states.values()))
            if everywhere and internal.get(SIGNATURE[shop]) not in everywhere:
                raise ValueError(f"la tienda {shop} no vende {SIGNATURE[shop]}: ¿cambió el orden de las tiendas?")
        seen = set(base)
        for name in singles:
            seen |= set(states[name].get(key, []))
        for k in range(1, 8):
            seen |= set(states[f"moon:{k}"].get(key, []))
        seen |= {item for (s, item) in pairs if s == shop} | {item for (s, item) in reduced if s == shop}
        for item in sorted(seen):
            if item in pylons and item != victory:
                continue
            phases = {k for k in range(8) if item in (base if k == 0 else set(states[f"moon:{k}"].get(key, [])))}
            cond: tuple[str, str] | None = None
            if item in base:
                parts = [phrase(NOT, n) for n in singles if not n.startswith(("npc:", "Player.Zone")) and item not in states[n].get(key, [])]
                if len(phases) < 8:
                    parts.append(moon(phases))
                cond = join(parts, AND) if parts else None
            else:
                alts = [n for n in singles if item in states[n].get(key, [])]
                # Cada forma de que aparezca: una condición sola, o dos juntas (si una es la luna, se juntan las fases).
                ways = [restricted(phrase(COND, n), shop, item, n) for n in alts]
                by_other: dict[str, set[int]] = defaultdict(set)
                for x, y in pairs.get((shop, item), []):
                    if y.startswith("moon:") or x.startswith("moon:"):
                        other, m = (x, y) if y.startswith("moon:") else (y, x)
                        by_other[other].add(int(m[5:]))
                    else:
                        ways.append(join([phrase(COND, x), phrase(COND, y)], AND))
                ways += [join([phrase(COND, o), moon(ph)], AND) for o, ph in by_other.items()]
                if {"NPC.downedBoss1", "NPC.downedBoss2", "NPC.downedBoss3"} <= set(alts):
                    cond = ANY_BOSS
                elif ways:
                    cond = join(ways, OR)
                elif phases:
                    cond = moon(phases)
                elif (shop, item) in reduced:
                    need, ph = reduced[(shop, item)]
                    parts = [phrase(COND, n) for n in need]
                    if len(ph) < 8:
                        parts.append(moon(ph))
                    cond = join(parts, AND)
                else:
                    continue
            if shop == 23 and item in bestiary and bestiary[item] > 0 and item not in base:
                pct = int(bestiary[item] * 100)
                cond = ("with the Bestiary %d%% complete" % pct, "con el Bestiario al %d%%" % pct)
            price, _ = shops["prices"].get(key, {}).get(str(item), [by_id[item].get("value", 0), -1])
            row = {"k": "shop", "n": npc, "p": price}
            # El Tabernero cobra su equipo en medallas: son los precios chicos de su tienda.
            if shop == TAVERNKEEP_SHOP and price < 100:
                row["c"] = internal["DefenderMedal"]
            out[item].append(note(row, cond))
        if shop == 23:
            for item, pct in bestiary.items():
                if item not in seen and item not in pylons:
                    p = int(pct * 100)
                    price, _ = shops["prices"].get(key, {}).get(str(item), [by_id[item].get("value", 0), -1])
                    out[item].append(note({"k": "shop", "n": npc, "p": price}, ("with the Bestiary %d%% complete" % p, "con el Bestiario al %d%%" % p)))

    for item in sorted(pylons - {victory}):
        out[item].append({"k": "pylon"})

    travel = shops.get("travel")
    if travel:
        visits = travel["visits"]
        tstates = travel["states"]
        base = tstates["base"]
        best: dict[int, int] = {}
        why: dict[int, list[str]] = defaultdict(list)
        for name, seen in tstates.items():
            if ignored(name):
                continue
            for i, count in seen.items():
                i = int(i)
                # Cuántas visitas lo traen: las del mundo recién creado si ya está ahí; si no, las del estado que lo trae.
                if str(i) in base:
                    best[i] = base[str(i)]
                elif name != "all":
                    best[i] = max(best.get(i, 0), count)
                    why[i].append(name)
                else:
                    best.setdefault(i, count)
        for i, count in sorted(best.items()):
            cond = None
            if str(i) not in base:
                alts = why.get(i, [])
                if {"NPC.downedBoss1", "NPC.downedBoss2", "NPC.downedBoss3"} <= set(alts):
                    cond = ANY_BOSS
                elif alts:
                    cond = join([phrase(COND, n) for n in alts], OR)
                elif str(i) in travel.get("reduced", {}):
                    cond = join([phrase(COND, n) for n in travel["reduced"][str(i)]], AND)
            out[i].append(note({"k": "travel", "n": TRAVELER, "p": by_id[i].get("value", 0), "r": round(count / visits, 3)}, cond))


def _containers(containers, internal, out, note) -> None:
    corruption = ("in worlds with {b:TheCorruption}", "en mundos con {b:TheCorruption}")
    crimson = COND["WorldGen.crimson"]
    modes: dict[int, list[int]] = defaultdict(list)
    for item, mode in containers.get("extractMode", {}).items():
        modes[mode].append(int(item))
    for key, box in containers.items():
        if key in ("extractMode", "shimmer") or key.endswith(":crimson"):
            continue
        other = containers.get(key + ":crimson", box)["items"]
        every = {**other, **box["items"]}
        for item, (count, low, high) in every.items():
            item = int(item)
            if item in COINS:
                continue
            rate = round(count / box["opens"], 4)
            if rate <= 0:
                continue
            if box["kind"] == "extract":
                mode, block = key[1:].split("_")
                for source in sorted(modes[int(mode)]):
                    if source != item:
                        out[item].append({"k": "extract", "i": source, "t": internal[EXTRACTORS[int(block)]], "r": rate})
                continue
            cond = None if str(item) in other and str(item) in box["items"] else corruption if str(item) in box["items"] else crimson
            out[item].append(note({"k": box["kind"], "i": int(key), "q": [low, high], "r": rate}, cond))
    for source, result in containers.get("shimmer", {}).items():
        out[result].append({"k": "shimmer", "i": int(source)})


def _fishing(rules, out, join, note, AND) -> None:
    for rule in rules:
        conds = rule["if"]
        if not rule["items"] or "Remix" in conds or "RemixOcean" in conds:
            continue
        parts = []
        for c in conds:
            if c.startswith("QuestFishCondition"):
                parts.append(FISH_QUEST)
            elif c not in FISH:
                raise KeyError(f"falta cómo decir la condición de pesca {c!r} (FISH en sources.py)")
            elif FISH[c]:
                parts.append(FISH[c])
        for item in sorted(set(rule["items"])):
            row = {"k": "fish"}
            if rule["rarity"] in TIERS:
                row["tier"] = TIERS[rule["rarity"]]
            row = note(row, join(parts, AND) if parts else None)
            # El mismo lugar con dos rarezas (una caja que sale con tirada rara o poco común): queda la más fácil.
            same = next((r for r in out[item] if r["k"] == "fish" and r.get("if") == row.get("if")), None)
            if same is None:
                out[item].append(row)
            elif TIER_ORDER.index(row.get("tier", "")) < TIER_ORDER.index(same.get("tier", "")):
                same.pop("tier", None)
                same.update(row)


def _chests(chests, cache, out) -> None:
    dropped = cache.get("chestnames", {})

    def name(tile: int, style: int, lang: str) -> str:
        loc = cache[f"loc_{lang}"]
        raw = loc["LegacyChestType2" if tile == 467 else "LegacyChestType"].get(str(style), "")
        # Los de la segunda tanda se llaman como su objeto, y el texto del juego apunta a otro para el cofre trampa
        # (dice "cofre de oro"): manda el objeto que deja al romperlo, salvo que el texto agregue algo ("Locked …").
        item = dropped.get(f"{tile}:{style}")
        if tile == 467 and item and raw.startswith("{$") and raw.endswith("}"):
            return cache[f"texts_{lang}"]["items"][str(item)][0]
        return re.sub(r"\{\$ItemName\.(\w+)\}", lambda m: loc["ItemName"].get(m.group(1), ""), raw).strip()

    groups: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for chest in chests:
        if chest["tile"] in (21, 467):
            groups[(chest["tile"], chest["style"])].append(chest)
    for (tile, style), found in sorted(groups.items()):
        label = [name(tile, style, "en"), name(tile, style, "es")]
        # Un tipo de cofre visto una sola vez no alcanza para hablar de probabilidades.
        if not label[0] or len(found) < 2:
            continue
        inside: dict[int, list[int]] = defaultdict(list)
        for chest in found:
            got: dict[int, int] = defaultdict(int)
            for item, stack in chest["items"]:
                got[item] += stack
            for item, stack in got.items():
                inside[item].append(stack)
        for item, stacks in inside.items():
            if item not in COINS:
                out[item].append({"k": "chest", "l": label, "q": [min(stacks), max(stacks)], "r": round(len(stacks) / len(found), 3)})
