"""
Lo que la web necesita para filtrar y que el juego no dice directo.

Funciones puras sobre los registros del extractor (`data/*.json`).
"""
from .biomes import BIOME_ORDER

# Los que se juntan, cazan, cultivan, pescan o compran: su bioma es el de su fuente.
_DIRECT = {"gather", "drop", "farm"}


def item_tier(item_id: str, items: dict, recipes: dict, conversions: dict, depth: int = 0, seen: frozenset = frozenset()) -> str | None:
    """
    El bioma de progresión de un objeto: dónde lo podés conseguir por primera vez.

    - Si se junta, se caza o se cultiva: el primer bioma (en orden de progresión)
      de sus fuentes.
    - Si sale de convertir otro (bronce de cobre): el de su origen.
    - Si se fabrica: el más avanzado de sus ingredientes; una espada de plata es
      de la Montaña aunque lleve madera.
    Si hay varias formas, gana la más temprana: el bronce también aparece en
    vasijas de Ashlands, y medido el 2026-09-24 eso mandaba el Hacha de bronce
    a Ashlands.
    Sin nada que lo ubique (sólo en cofres de ubicaciones, por ejemplo): None.
    """
    if depth > 6 or item_id in seen:
        return None
    seen = seen | {item_id}
    it = items.get(item_id)
    if not it:
        return None
    # Cada forma de conseguirlo da un bioma; gana la más temprana.
    options = [b for s in it["sources"] if s["kind"] in _DIRECT for b in s.get("biomes") or []]
    for parent in conversions.get(item_id, []):
        t = item_tier(parent, items, recipes, conversions, depth + 1, seen)
        if t:
            options.append(t)
    ingredients = [t for t in (item_tier(r["item"], items, recipes, conversions, depth + 1, seen) for r in recipes.get(item_id, [])) if t]
    if ingredients:
        # Una receta es tan avanzada como su ingrediente más avanzado.
        options.append(max(ingredients, key=BIOME_ORDER.index))
    return min(options, key=BIOME_ORDER.index) if options else None


def mead_effect(prefab: str) -> str:
    p = prefab.lower()
    if "resist" in p:
        return "resist"
    for k in ("health", "stamina", "eitr"):
        if k in p:
            return k
    return "other"


def food_focus(food: dict) -> str:
    """El stat que manda si le saca 30% al segundo; si no, equilibrada."""
    vals = sorted((("health", food["hp"]), ("stamina", food["st"]), ("eitr", food["eitr"])), key=lambda x: -x[1])
    return vals[0][0] if vals[0][1] >= vals[1][1] * 1.3 else "balanced"


# `Skills.SkillType` del juego.
WEAPON_CLASS = {1: "sword", 2: "knife", 3: "club", 4: "polearm", 5: "spear", 7: "axe", 8: "bow",
                9: "elemental", 10: "blood", 11: "fists", 12: "pickaxe", 14: "crossbow"}
# `ItemDrop.ItemData.ItemType` del juego.
ARMOR_SLOT = {5: "shield", 6: "helmet", 7: "chest", 11: "legs", 17: "cape", 18: "utility", 24: "trinket"}


def weapon_class(skill: int) -> str:
    return WEAPON_CLASS.get(skill, "other")


def armor_slot(item_type: int) -> str:
    return ARMOR_SLOT.get(item_type, "other")
