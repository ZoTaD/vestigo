import unittest
from pipeline.tiers import Tiers, mead_effect, food_focus, weapon_class, armor_slot

ITEMS = {
    "Wood": {"sources": [{"kind": "gather", "biomes": ["meadows", "blackforest"]}]},
    "Copper": {"sources": [{"kind": "gather", "biomes": ["blackforest"]}]},
    "Silver": {"sources": [{"kind": "gather", "biomes": ["mountain"]}]},
    # El bronce también sale de vasijas en ruinas de Ashlands: no por eso es de Ashlands.
    "Bronze": {"sources": [{"kind": "convert", "from": "Copper"}, {"kind": "gather", "how": "destructible", "biomes": ["ashlands"]}]},
    "Sword": {"sources": [{"kind": "craft"}]},
    "Loop": {"sources": [{"kind": "craft"}]},
    "Chest": {"sources": [{"kind": "gather", "how": "chest", "biomes": []}]},
    # La cebolla se planta en las Praderas, pero la semilla sale de la Montaña.
    "OnionSeeds": {"sources": [{"kind": "gather", "how": "chest", "biomes": ["mountain"]}, {"kind": "farm", "from": "sapling_seedonion", "biomes": ["meadows"]}]},
    "Onion": {"sources": [{"kind": "farm", "from": "sapling_onion", "biomes": ["meadows", "blackforest"]}]},
    "Dandelion": {"sources": [{"kind": "gather", "biomes": ["meadows"]}]},
    "OnionSoup": {"sources": [{"kind": "craft"}]},
    "Tea": {"sources": [{"kind": "craft"}]},
}
RECIPES = {
    "Sword": {"station": None, "level": 1, "requirements": [{"item": "Wood"}, {"item": "Silver"}, {"item": "Bronze"}]},
    "Loop": {"station": None, "level": 1, "requirements": [{"item": "Loop"}]},
    "OnionSoup": {"station": "piece_cauldron", "level": 2, "requirements": [{"item": "Onion"}]},
    # Sólo diente de león, pero en el caldero nivel 3: la mesa de carnicero es de la Montaña.
    "Tea": {"station": "piece_cauldron", "level": 3, "requirements": [{"item": "Dandelion"}]},
}
PIECES = {
    "sapling_onion": {"requirements": [{"item": "OnionSeeds"}], "station": None},
    "sapling_seedonion": {"requirements": [{"item": "Onion"}], "station": None},
    "cauldron": {"requirements": [{"item": "Copper"}], "station": None},
    "ext1": {"requirements": [{"item": "Dandelion"}], "station": None},
    "ext2": {"requirements": [{"item": "Silver"}], "station": None},
}
CONV = {"Bronze": ["Copper"]}


def tier(iid):
    return Tiers(ITEMS, RECIPES, CONV, PIECES, {"piece_cauldron": "cauldron"}, {"cauldron": ["ext1", "ext2"]}).item(iid)


class TestTier(unittest.TestCase):
    def test_junta_toma_el_primer_bioma(self):
        self.assertEqual(tier("Wood"), "meadows")

    def test_convertido_hereda_su_origen(self):
        self.assertEqual(tier("Bronze"), "blackforest")

    def test_fabricado_toma_el_ingrediente_mas_avanzado(self):
        self.assertEqual(tier("Sword"), "mountain")

    def test_ciclo_no_cuelga(self):
        self.assertIsNone(tier("Loop"))

    def test_sin_bioma(self):
        self.assertIsNone(tier("Chest"))

    def test_cultivo_toma_el_bioma_de_la_semilla(self):
        self.assertEqual(tier("Onion"), "mountain")

    def test_la_receta_cuenta_el_nivel_de_estacion(self):
        self.assertEqual(tier("OnionSoup"), "mountain")
        self.assertEqual(tier("Tea"), "mountain")


class TestCategorias(unittest.TestCase):
    def test_hidromiel(self):
        self.assertEqual(mead_effect("MeadHealthMinor"), "health")
        self.assertEqual(mead_effect("MeadStaminaLingering"), "stamina")
        self.assertEqual(mead_effect("MeadEitrMinor"), "eitr")
        self.assertEqual(mead_effect("MeadFrostResist"), "resist")
        self.assertEqual(mead_effect("MeadTasty"), "other")

    def test_enfoque(self):
        self.assertEqual(food_focus({"hp": 80, "st": 26, "eitr": 0}), "health")
        self.assertEqual(food_focus({"hp": 20, "st": 60, "eitr": 0}), "stamina")
        self.assertEqual(food_focus({"hp": 30, "st": 30, "eitr": 90}), "eitr")
        self.assertEqual(food_focus({"hp": 50, "st": 45, "eitr": 0}), "balanced")

    def test_arma_y_armadura(self):
        self.assertEqual(weapon_class(1), "sword")
        self.assertEqual(weapon_class(14), "crossbow")
        self.assertEqual(weapon_class(99), "other")
        self.assertEqual(armor_slot(6), "helmet")
        self.assertEqual(armor_slot(17), "cape")


if __name__ == "__main__":
    unittest.main()
