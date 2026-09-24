import unittest
from pipeline.tiers import item_tier, mead_effect, food_focus, weapon_class, armor_slot

ITEMS = {
    "Wood": {"sources": [{"kind": "gather", "biomes": ["meadows", "blackforest"]}]},
    "Copper": {"sources": [{"kind": "gather", "biomes": ["blackforest"]}]},
    "Silver": {"sources": [{"kind": "gather", "biomes": ["mountain"]}]},
    # El bronce también sale de vasijas en ruinas de Ashlands: no por eso es de Ashlands.
    "Bronze": {"sources": [{"kind": "convert", "from": "Copper"}, {"kind": "gather", "how": "destructible", "biomes": ["ashlands"]}]},
    "Sword": {"sources": [{"kind": "craft"}]},
    "Loop": {"sources": [{"kind": "craft"}]},
    "Chest": {"sources": [{"kind": "gather", "how": "chest", "biomes": []}]},
}
RECIPES = {
    "Sword": [{"item": "Wood", "amount": 2}, {"item": "Silver", "amount": 10}, {"item": "Bronze", "amount": 5}],
    "Loop": [{"item": "Loop", "amount": 1}],
}
CONV = {"Bronze": ["Copper"]}


class TestTier(unittest.TestCase):
    def test_junta_toma_el_primer_bioma(self):
        self.assertEqual(item_tier("Wood", ITEMS, RECIPES, CONV), "meadows")

    def test_convertido_hereda_su_origen(self):
        self.assertEqual(item_tier("Bronze", ITEMS, RECIPES, CONV), "blackforest")

    def test_fabricado_toma_el_ingrediente_mas_avanzado(self):
        self.assertEqual(item_tier("Sword", ITEMS, RECIPES, CONV), "mountain")

    def test_gana_la_forma_mas_temprana(self):
        self.assertEqual(item_tier("Bronze", ITEMS, RECIPES, CONV), "blackforest")

    def test_ciclo_no_cuelga(self):
        self.assertIsNone(item_tier("Loop", ITEMS, RECIPES, CONV))

    def test_sin_bioma(self):
        self.assertIsNone(item_tier("Chest", ITEMS, RECIPES, CONV))


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
