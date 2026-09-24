import unittest
from pipeline.loc import Loc
from pipeline.records import kind_of, item_record, requirements, recipe_record, drop_table, character_drops, trader_items

LOC = Loc({"item_carrotsoup": {"en": "Carrot Soup", "es": "Sopa de zanahoria"},
           "item_carrotsoup_description": {"en": "Warm soup.", "es": "Sopa caliente."}})
NAMES = {1: "Carrot", 2: "Mushroom", 3: "CarrotSoup", 9: "Coins"}
name_of = lambda p: NAMES.get(p["m_PathID"]) if p and p.get("m_PathID") else None
Z = {"m_damage": 0.0, "m_blunt": 0.0, "m_slash": 0.0, "m_pierce": 0.0, "m_chop": 0.0, "m_pickaxe": 0.0,
     "m_fire": 0.0, "m_frost": 0.0, "m_lightning": 0.0, "m_poison": 0.0, "m_spirit": 0.0, "m_nonPlayer": 0.0}

def shared(**kw):
    base = {"m_name": "$item_carrotsoup", "m_description": "$item_carrotsoup_description", "m_itemType": 2,
            "m_maxStackSize": 10, "m_weight": 1.0, "m_value": 0, "m_maxQuality": 1, "m_food": 15.0,
            "m_foodStamina": 45.0, "m_foodEitr": 0.0, "m_foodBurnTime": 1500.0, "m_foodRegen": 2.0,
            "m_armor": 0.0, "m_armorPerLevel": 0.0, "m_blockPower": 0.0, "m_setName": "",
            "m_damages": dict(Z), "m_damagesPerLevel": dict(Z)}
    base.update(kw); return base

class TestKind(unittest.TestCase):
    def test_tipos(self):
        self.assertEqual(kind_of(2, 15.0), "food")
        self.assertEqual(kind_of(2, 0.0), "mead")
        self.assertEqual(kind_of(14, 0), "weapon")
        self.assertEqual(kind_of(7, 0), "armor")
        self.assertEqual(kind_of(19, 0), "tool")
        self.assertEqual(kind_of(9, 0), "ammo")
        self.assertEqual(kind_of(1, 0), "material")
        self.assertEqual(kind_of(13, 0), "trophy")

class TestItem(unittest.TestCase):
    def test_comida(self):
        r = item_record("CarrotSoup", shared(), LOC, "carrotsoup")
        self.assertEqual(r["name"], {"en": "Carrot Soup", "es": "Sopa de zanahoria"})
        self.assertEqual(r["kind"], "food")
        self.assertEqual(r["food"], {"hp": 15.0, "st": 45.0, "eitr": 0.0, "min": 25, "regen": 2.0})
        self.assertIsNone(r["damage"])

    def test_arma_sin_ceros(self):
        d = dict(Z, m_slash=35.0, m_chop=10.0)
        r = item_record("CarrotSoup", shared(m_itemType=3, m_food=0.0, m_damages=d), LOC, None)
        self.assertEqual(r["damage"], {"slash": 35.0, "chop": 10.0})
        self.assertIsNone(r["food"])

    def test_sin_traduccion_no_entra(self):
        self.assertIsNone(item_record("X", shared(m_name="$item_nada"), LOC, None))

class TestRecipe(unittest.TestCase):
    def test_receta(self):
        tree = {"m_item": {"m_FileID": 0, "m_PathID": 3}, "m_amount": 1, "m_enabled": 1,
                "m_craftingStation": {"m_FileID": 0, "m_PathID": 77}, "m_minStationLevel": 2,
                "m_resources": [{"m_resItem": {"m_FileID": 0, "m_PathID": 1}, "m_amount": 1, "m_amountPerLevel": 0},
                                {"m_resItem": {"m_FileID": 0, "m_PathID": 2}, "m_amount": 3, "m_amountPerLevel": 1}]}
        r = recipe_record(tree, name_of, lambda p: "piece_cauldron" if p["m_PathID"] == 77 else None)
        self.assertEqual(r, {"item": "CarrotSoup", "amount": 1, "station": "piece_cauldron", "level": 2,
                             "requirements": [{"item": "Carrot", "amount": 1, "perLevel": 0},
                                              {"item": "Mushroom", "amount": 3, "perLevel": 1}]})

    def test_deshabilitada(self):
        self.assertIsNone(recipe_record({"m_enabled": 0, "m_item": {"m_PathID": 3}}, name_of, lambda p: None))

class TestDrops(unittest.TestCase):
    def test_tabla(self):
        t = {"m_drops": [{"m_item": {"m_FileID": 2, "m_PathID": 1}, "m_stackMin": 1, "m_stackMax": 2, "m_weight": 1.0}],
             "m_dropMin": 3, "m_dropMax": 4, "m_dropChance": 1.0, "m_oneOfEach": 0}
        self.assertEqual(drop_table(t, name_of), {"min": 3, "max": 4, "chance": 1.0, "oneOfEach": False,
                                                  "items": [{"item": "Carrot", "min": 1, "max": 2, "weight": 1.0}]})

    def test_criatura(self):
        t = {"m_drops": [{"m_prefab": {"m_FileID": 0, "m_PathID": 9}, "m_amountMin": 1, "m_amountMax": 3,
                          "m_chance": 0.05000000074505806, "m_levelMultiplier": 1}]}
        self.assertEqual(character_drops(t, name_of), [{"item": "Coins", "min": 1, "max": 3, "chance": 0.05, "perLevel": True}])

    def test_comerciante(self):
        t = {"m_items": [{"m_prefab": {"m_FileID": 2, "m_PathID": 1}, "m_stack": 1, "m_price": 100, "m_requiredGlobalKey": ""},
                         {"m_prefab": {"m_FileID": 2, "m_PathID": 2}, "m_stack": 5, "m_price": 620, "m_requiredGlobalKey": "defeated_bonemass"}]}
        self.assertEqual(trader_items(t, name_of), [{"item": "Carrot", "stack": 1, "price": 100, "requiredKey": None},
                                                    {"item": "Mushroom", "stack": 5, "price": 620, "requiredKey": "defeated_bonemass"}])

if __name__ == "__main__":
    unittest.main()
