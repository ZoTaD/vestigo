import unittest
from pipeline.sources import build_sources, build_used_in

RECIPES = [{"item": "CarrotSoup", "amount": 1, "station": "piece_cauldron", "level": 1,
            "requirements": [{"item": "Carrot", "amount": 1, "perLevel": 0}, {"item": "Mushroom", "amount": 3, "perLevel": 0}]}]
CONV = [{"station": "piece_fermenter", "from": "MeadBaseHealthMinor", "to": "MeadHealthMinor", "time": 2400.0, "yield": 6}]
CREATURES = {"Boar": {"drops": [{"item": "RawMeat", "min": 1, "max": 2, "chance": 1.0, "perLevel": True}], "biomes": ["meadows"]}}
GATHER = [{"id": "Pickable_Mushroom", "kind": "pickable", "biomes": ["meadows", "blackforest"],
           "drops": {"items": [{"item": "Mushroom", "min": 1, "max": 1, "weight": 1.0}]}}]
TRADERS = {"Haldor": {"items": [{"item": "Carrot", "stack": 1, "price": 50, "requiredKey": None}]}}
PIECES = {"piece_cauldron": {"requirements": [{"item": "Mushroom", "amount": 2}]}}

class TestSources(unittest.TestCase):
    def test_cada_tipo(self):
        s = build_sources(RECIPES, CONV, CREATURES, GATHER, TRADERS)
        self.assertEqual(s["CarrotSoup"], [{"kind": "craft", "station": "piece_cauldron", "level": 1, "amount": 1}])
        self.assertEqual(s["MeadHealthMinor"], [{"kind": "convert", "station": "piece_fermenter", "from": "MeadBaseHealthMinor", "time": 2400.0, "yield": 6}])
        self.assertEqual(s["RawMeat"], [{"kind": "drop", "from": "Boar", "min": 1, "max": 2, "chance": 1.0, "biomes": ["meadows"]}])
        self.assertEqual(s["Mushroom"], [{"kind": "gather", "from": "Pickable_Mushroom", "how": "pickable", "biomes": ["meadows", "blackforest"]}])
        self.assertEqual(s["Carrot"], [{"kind": "trader", "from": "Haldor", "price": 50, "stack": 1, "requiredKey": None}])

    def test_se_usa_en(self):
        u = build_used_in(RECIPES, CONV, PIECES)
        self.assertEqual(u["Mushroom"], [{"kind": "recipe", "item": "CarrotSoup", "amount": 3},
                                         {"kind": "piece", "item": "piece_cauldron", "amount": 2}])
        self.assertEqual(u["MeadBaseHealthMinor"], [{"kind": "convert", "item": "MeadHealthMinor", "station": "piece_fermenter"}])

if __name__ == "__main__":
    unittest.main()
