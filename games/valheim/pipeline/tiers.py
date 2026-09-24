"""
Lo que la web necesita para filtrar y que el juego no dice directo.

Funciones puras sobre los registros del extractor (`data/*.json`).
"""
from .biomes import BIOME_ORDER

# Dónde está cada comerciante, y a qué bioma lleva cada llave de jefe: lo que
# vende la Bruja del pantano "después de Moder" es de la Montaña, no del Pantano.
TRADER_BIOME = {"Haldor": "blackforest", "Hildir": "meadows", "BogWitch": "swamp"}
KEY_BIOME = {"defeated_eikthyr": "meadows", "defeated_gdking": "blackforest", "defeated_bonemass": "swamp",
             "defeated_dragon": "mountain", "defeated_goblinking": "plains", "defeated_serpent": "ocean",
             "defeated_queen": "mistlands", "defeated_fader": "ashlands", "defeated_writhan": "swamp",
             # La ropa de Hildir: se desbloquea devolviéndole cada cofre (cripta
             # del Bosque negro, cueva de la Montaña, fortaleza de las Llanuras).
             "Hildir1": "blackforest", "Hildir2": "mountain", "Hildir3": "plains"}


class Tiers:
    """
    El bioma de progresión de cada objeto y pieza: dónde se puede conseguir o
    hacer por primera vez siguiendo la cadena real del juego (rehecho el
    2026-09-24: la sopa de cebolla y la parrabaya salían "de las Praderas").

    - Juntar, minar, talar, pescar, criaturas del bioma y cofres de la zona: el
      primer bioma (en orden de progresión) de esas fuentes.
    - Cultivar **no** ubica por dónde se puede plantar (la cebolla se planta en
      las Praderas): ubica por lo que hay que plantar. La cebolla pide semillas
      de cebolla, que salen de los cofres de la Montaña → Montaña.
    - Convertir (bronce de cobre): el bioma del origen.
    - Fabricar: el ingrediente más avanzado **y** la estación con el nivel que
      pide la receta (la sopa de cebolla pide el caldero nivel 2, con el
      especiero); gana el más avanzado de todo eso.
    - Si hay varias formas, gana la más temprana (el bronce también sale de
      vasijas de la Tierra de Ceniza).
    Sin nada que lo ubique: None, mejor que un bioma inventado.
    """

    DIRECT = {"gather", "drop"}

    def __init__(self, items: dict, recipes: dict, conversions: dict, pieces: dict, station_piece: dict, upgrades: dict):
        self.items, self.recipes, self.conversions, self.pieces = items, recipes, conversions, pieces
        self.station_piece, self.upgrades = station_piece, upgrades
        self._memo: dict[str, str | None] = {}

    @staticmethod
    def _max(ts):
        """
        El más avanzado de lo que se sabe. Un requisito sin bioma no anula la
        receta: en la 1.0 las recetas traen los ídolos de la Forja del Potencial
        (Upgrader*), que no son objetos de la enciclopedia, y con la regla
        estricta 144 armas quedaban sin bioma (2026-09-24).
        """
        ts = [t for t in ts if t]
        return max(ts, key=BIOME_ORDER.index) if ts else None

    def item(self, iid: str, seen: frozenset = frozenset()) -> str | None:
        if iid in self._memo:
            return self._memo[iid]
        if iid in seen or len(seen) > 12:
            return None
        seen = seen | {iid}
        it = self.items.get(iid)
        if not it:
            return None
        options = [b for s in it["sources"] if s["kind"] in self.DIRECT for b in s.get("biomes") or []]
        for s in it["sources"]:
            if s["kind"] == "farm":
                t = self.piece(s.get("from"), seen)
                if t:
                    options.append(t)
        for parent in self.conversions.get(iid, []):
            t = self.item(parent, seen)
            if t:
                options.append(t)
        r = self.recipes.get(iid)
        if r:
            # La estación suma sólo si algún ingrediente se sabe de dónde sale.
            ings = [self.item(q["item"], seen) for q in r["requirements"]]
            if any(ings):
                options.append(self._max(ings + [self.station(r.get("station"), r.get("level", 1), seen)]))
        for s in it["sources"]:
            if s["kind"] == "trader":
                options.append(self._max([TRADER_BIOME.get(s.get("from")), KEY_BIOME.get(s.get("requiredKey") or "")]))
        out = min(options, key=BIOME_ORDER.index) if options else None
        if len(seen) == 1:
            self._memo[iid] = out
        return out

    def piece(self, pid: str | None, seen: frozenset = frozenset()) -> str | None:
        """Lo que pide construir la pieza (o plantar el brote) y su estación."""
        p = self.pieces.get(pid) if pid else None
        if not p:
            return None
        reqs = [self.item(q["item"], seen) for q in p["requirements"]]
        return self._max(reqs + ([self.station(p["station"], 1, seen)] if p.get("station") else []))

    def station(self, tok: str | None, level: int, seen: frozenset = frozenset()) -> str | None:
        """La estación y las mejoras que hacen falta para llegar a `level`."""
        pid = self.station_piece.get(tok) if tok else None
        # Sin estación (a mano) o una estación sin pieza: no suma nada. Un ciclo
        # (la estación pide algo que se hace en ella) tampoco.
        if not pid or pid in seen:
            return "meadows"
        seen = seen | {pid}
        own = self.piece(pid, seen)
        ups = [self.piece(u, seen) for u in self.upgrades.get(pid, [])[: max(0, (level or 1) - 1)]]
        return self._max([own] + ups)


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
