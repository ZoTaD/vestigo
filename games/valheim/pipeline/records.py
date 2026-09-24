"""
De un typetree del juego a un registro limpio.

Funciones puras: reciben el diccionario que devuelve `read_typetree()` y un
`name_of(pptr)` que resuelve referencias (ver `unity.py`), así se prueban sin
el juego. Los nombres de campo son los de las clases de `assembly_valheim.dll`
(Unity 6000.0.75f1, 1.0), leídos el 2026-09-24.
"""
from .loc import Loc

# `ItemDrop.ItemData.ItemType`, del juego.
WEAPON = {3, 4, 14, 20, 22}          # una mano, arco, dos manos, atgeir, dos manos izquierda
ARMOR = {5, 6, 7, 11, 17, 18, 24}    # escudo, casco, pecho, piernas, hombros, utilidad, abalorio
TOOL = {15, 19}                      # antorcha, herramienta
AMMO = {9, 23}


def kind_of(item_type: int, food: float) -> str:
    if item_type == 2:
        # Consumible con comida = comida; sin comida = hidromiel o poción.
        return "food" if food > 0 else "mead"
    if item_type in WEAPON:
        return "weapon"
    if item_type in ARMOR:
        return "armor"
    if item_type in TOOL:
        return "tool"
    if item_type in AMMO:
        return "ammo"
    if item_type == 13:
        return "trophy"
    if item_type in (1, 21):         # material, pescado
        return "material"
    return "misc"


def _dmg(d: dict) -> dict | None:
    out = {k[2:]: round(v, 2) for k, v in d.items() if k != "m_nonPlayer" and v}
    return out or None


def item_record(prefab: str, shared: dict, loc: Loc, icon: str | None) -> dict | None:
    name = loc.t(shared.get("m_name"))
    if not name:
        return None
    food = shared.get("m_food", 0.0)
    kind = kind_of(shared["m_itemType"], food)
    return {
        "id": prefab,
        "name": name,
        "desc": loc.t(shared.get("m_description")),
        "kind": kind,
        "itemType": shared["m_itemType"],
        "icon": icon,
        "weight": round(shared.get("m_weight", 0.0), 2),
        "stack": shared.get("m_maxStackSize", 1),
        "value": shared.get("m_value", 0),
        "maxQuality": shared.get("m_maxQuality", 1),
        "food": {"hp": food, "st": shared["m_foodStamina"], "eitr": shared["m_foodEitr"],
                 "min": round(shared["m_foodBurnTime"] / 60), "regen": shared["m_foodRegen"]} if food > 0 else None,
        "damage": _dmg(shared.get("m_damages", {})) if kind in ("weapon", "ammo", "tool") else None,
        "damagePerLevel": _dmg(shared.get("m_damagesPerLevel", {})) if kind in ("weapon", "ammo", "tool") else None,
        "armor": shared.get("m_armor") or None,
        "armorPerLevel": shared.get("m_armorPerLevel") or None,
        "blockPower": shared.get("m_blockPower") or None,
        "setName": shared.get("m_setName") or None,
        "skill": shared.get("m_skillType", 0),
    }


def requirements(resources: list[dict], name_of) -> list[dict]:
    out = []
    for r in resources:
        item = name_of(r["m_resItem"])
        if item:
            out.append({"item": item, "amount": r["m_amount"], "perLevel": r.get("m_amountPerLevel", 0)})
    return out


def recipe_record(tree: dict, name_of, station_of) -> dict | None:
    if not tree.get("m_enabled"):
        return None
    item = name_of(tree["m_item"])
    if not item:
        return None
    return {
        "item": item,
        "amount": tree["m_amount"],
        "station": station_of(tree["m_craftingStation"]) if tree["m_craftingStation"].get("m_PathID") else None,
        "level": tree["m_minStationLevel"],
        "requirements": requirements(tree["m_resources"], name_of),
        # El pescado crudo se hace con uno cualquiera de los peces, no con los
        # doce (2026-09-24: por eso el pescado cocido salía del Norte profundo).
        "anyOne": bool(tree.get("m_requireOnlyOneIngredient")),
    }


def drop_table(table: dict, name_of) -> dict:
    return {
        "min": table["m_dropMin"], "max": table["m_dropMax"],
        "chance": round(table["m_dropChance"], 3), "oneOfEach": bool(table["m_oneOfEach"]),
        "items": [{"item": name_of(d["m_item"]), "min": d["m_stackMin"], "max": d["m_stackMax"], "weight": d["m_weight"]}
                  for d in table["m_drops"] if name_of(d["m_item"])],
    }


def character_drops(tree: dict, name_of) -> list[dict]:
    return [{"item": name_of(d["m_prefab"]), "min": d["m_amountMin"], "max": d["m_amountMax"],
             "chance": round(d["m_chance"], 3), "perLevel": bool(d["m_levelMultiplier"])}
            for d in tree["m_drops"] if name_of(d["m_prefab"])]


def trader_items(tree: dict, name_of) -> list[dict]:
    return [{"item": name_of(i["m_prefab"]), "stack": i["m_stack"], "price": i["m_price"],
             "requiredKey": i["m_requiredGlobalKey"] or None}
            for i in tree["m_items"] if name_of(i["m_prefab"])]


# `HitData.DamageModifier` del juego: 0 normal, 1 resistente, 2 débil, 3 inmune,
# 4 ignorar, 5 muy resistente, 6 muy débil, 7 levemente resistente, 8
# levemente débil.
WEAK, RESIST, IMMUNE = {2, 6, 8}, {1, 5, 7}, {3}


def damage_mods(dm: dict) -> dict:
    """Qué le pega de más y qué de menos a una criatura. Talar y minar no cuentan."""
    out = {"weak": [], "resist": [], "immune": []}
    for k, v in dm.items():
        name = k[2:]
        if name in ("chop", "pickaxe", "nonPlayer"):
            continue
        if v in WEAK:
            out["weak"].append(name)
        elif v in RESIST:
            out["resist"].append(name)
        elif v in IMMUNE:
            out["immune"].append(name)
    return out


# `HitData.DamageType` del juego: una máscara de bits.
DAMAGE_BITS = [(1, "blunt"), (2, "slash"), (4, "pierce"), (8, "chop"), (16, "pickaxe"), (32, "fire"),
               (64, "frost"), (128, "lightning"), (256, "poison"), (512, "spirit")]
# Los mismos códigos de `HitData.DamageModifier`, con nombre.
MODIFIER = {1: "resistant", 2: "weak", 3: "immune", 5: "veryResistant", 6: "veryWeak", 7: "slightlyResistant", 8: "slightlyWeak"}


def mod_list(mods: list[dict]) -> list[dict]:
    """`[{m_type, m_modifier}]` (armaduras y efectos) → `[{type, mod}]`, un tipo de daño por fila."""
    out = []
    for m in mods or []:
        mod = MODIFIER.get(m.get("m_modifier"))
        if not mod:
            continue
        for bit, name in DAMAGE_BITS:
            if m.get("m_type", 0) & bit and name not in ("chop", "pickaxe"):
                out.append({"type": name, "mod": mod})
    return out


# Lo que un efecto de estado (`SE_Stats`) cambia, con su valor neutro. Lo que
# queda en su valor neutro no se muestra. Leído del juego el 2026-09-24.
SE_FIELDS = {
    "m_healthUpFront": 0, "m_staminaUpFront": 0, "m_eitrUpFront": 0, "m_healthOverTime": 0, "m_staminaOverTime": 0,
    "m_eitrOverTime": 0, "m_healthRegenMultiplier": 1, "m_staminaRegenMultiplier": 1, "m_eitrRegenMultiplier": 1,
    "m_addMaxCarryWeight": 0, "m_speedModifier": 0, "m_swimSpeedModifier": 0, "m_runStaminaDrainModifier": 0,
    "m_jumpStaminaUseModifier": 0, "m_attackStaminaUseModifier": 0, "m_blockStaminaUseModifier": 0,
    "m_dodgeStaminaUseModifier": 0, "m_swimStaminaUseModifier": 0, "m_sneakStaminaUseModifier": 0,
    "m_runStaminaUseModifier": 0, "m_homeItemStaminaUseModifier": 0, "m_noiseModifier": 0, "m_stealthModifier": 0,
    "m_fallDamageModifier": 0, "m_maxMaxFallSpeed": 0, "m_addArmor": 0, "m_staggerModifier": 0,
    "m_timedBlockBonus": 0, "m_adrenalineModifier": 0, "m_windRunStaminaModifier": 0,
}


def status_effect(tree: dict, loc: Loc) -> dict | None:
    """
    Un efecto de estado (bono de set, efecto al equipar, hidromiel): su nombre,
    el texto del juego y lo que cambia en números. Sin nombre ni texto, nada.
    """
    name, tip = loc.t(tree.get("m_name")), loc.t((tree.get("m_tooltip") or "").strip())
    if not name and not tip:
        return None
    stats = {k[2:]: round(v, 3) for k, v in tree.items() if k in SE_FIELDS and isinstance(v, (int, float)) and abs(v - SE_FIELDS[k]) > 1e-6}
    for key in ("m_skillLevel", "m_skillLevel2"):
        lvl, mod = tree.get(key), tree.get(key.replace("Level", "LevelModifier"))
        if lvl and mod:
            stats.setdefault("skills", []).append({"skill": lvl, "value": round(mod, 2)})
    pct = {k[2:]: round(v, 3) for k, v in (tree.get("m_percentigeDamageModifiers") or {}).items() if v and k != "m_nonPlayer"}
    if pct:
        stats["damagePct"] = pct
    if tree.get("m_damageModifier", 1) not in (0, 1):
        stats["damageModifier"] = round(tree["m_damageModifier"], 3)
    mods = mod_list(tree.get("m_mods"))
    if mods:
        stats["resist"] = mods
    if tree.get("m_ttl"):
        stats["ttl"] = tree["m_ttl"]
    return {"name": name, "tooltip": tip, "stats": stats}


def spawn_record(s: dict, biomes: list[str]) -> dict:
    """Una regla de aparición del mundo (`SpawnSystem`): dónde, cuándo y cuántos."""
    out = {"biomes": biomes, "day": bool(s.get("m_spawnAtDay", 1)), "night": bool(s.get("m_spawnAtNight", 1)),
           "group": [s.get("m_groupSizeMin", 1), s.get("m_groupSizeMax", 1)], "max": s.get("m_maxSpawned")}
    if s.get("m_requiredGlobalKey"):
        out["key"] = s["m_requiredGlobalKey"]
    if s.get("m_requiredEnvironments"):
        out["envs"] = list(s["m_requiredEnvironments"])
    if not s.get("m_outsideForest", 1):
        out["forest"] = "in"
    elif not s.get("m_inForest", 1):
        out["forest"] = "out"
    if s.get("m_minOceanDepth") or s.get("m_maxOceanDepth"):
        out["ocean"] = True
    if s.get("m_minAltitude", 0) > 10:
        out["minAltitude"] = s["m_minAltitude"]
    return out
