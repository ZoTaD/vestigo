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
