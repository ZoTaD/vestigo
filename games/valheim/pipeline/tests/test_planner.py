import unittest

from pipeline import planner


def refs(*keys):
    return {k: {"slug": k.lower(), "tab": "materials", "name": {"en": k, "es": k}, "icon": k.lower()} for k in keys}


class PlannerTest(unittest.TestCase):
    def setUp(self):
        ids = ("Sword", "Iron", "IronScrap", "IronOre", "Coal", "Wood", "Bronze", "Copper", "Tin", "Upgrader2Weapon")
        self.items = {k: {"weight": 1.0, "maxQuality": 1, "sources": []} for k in ids}
        self.items["Sword"]["maxQuality"] = 4
        self.items["IronScrap"]["sources"] = [{"kind": "gather", "how": "mine", "biomes": ["swamp"], "from": "mudpile"}]
        self.recipes = [
            {"item": "Sword", "station": "piece_forge", "level": 2, "amount": 1, "anyOne": False,
             "requirements": [{"item": "Iron", "amount": 20, "perLevel": 10}, {"item": "Upgrader2Weapon", "amount": 1, "perLevel": 0}]},
            {"item": "Bronze", "station": "piece_forge", "level": 1, "amount": 5, "anyOne": False,
             "requirements": [{"item": "Copper", "amount": 10, "perLevel": 1}, {"item": "Tin", "amount": 5, "perLevel": 1}]},
            {"item": "Bronze", "station": "piece_forge", "level": 1, "amount": 1, "anyOne": False,
             "requirements": [{"item": "Copper", "amount": 2, "perLevel": 1}, {"item": "Tin", "amount": 1, "perLevel": 1}]},
        ]
        self.conversions = [
            {"station": "piece_smelter", "from": "IronOre", "to": "Iron", "time": 30.0, "yield": 1, "fuel": {"item": "Coal", "perProduct": 2}},
            {"station": "piece_smelter", "from": "IronScrap", "to": "Iron", "time": 30.0, "yield": 1, "fuel": {"item": "Coal", "perProduct": 2}},
            {"station": "piece_charcoalkiln", "from": "Wood", "to": "Coal", "time": 15.0, "yield": 1},
        ]
        self.pieces = {"forge": {"station": None, "requirements": [{"item": "Copper", "amount": 6}]}}
        self.bosses = [{"id": "Eikthyr", "biome": "meadows",
                        "summon": {"item": "Wood", "amount": 2, "altar": {"en": "Mystical Altar", "es": "Altar místico"}}}]
        self.ref = refs(*ids) | refs("piece:forge") | {"boss:Eikthyr": {"slug": "eikthyr", "tab": "bosses", "name": {"en": "Eikthyr", "es": "Eikthyr"}, "icon": None}}

    def build(self, listed):
        station = lambda t: {"slug": t, "tab": "building", "name": {"en": t, "es": t}, "icon": None}
        return planner.build(self.items, self.recipes, self.pieces, self.conversions, self.bosses, self.ref,
                             lambda k: "swamp", station, lambda s: dict(s), listed)

    def test_los_idolos_no_entran(self):
        p = self.build({"Sword": "weapons"})
        self.assertEqual(p["recipes"]["Sword"]["req"], [["Iron", 20, 10]])
        self.assertNotIn("Upgrader2Weapon", p["items"])

    def test_la_receta_mas_chica(self):
        p = self.build({"Bronze": "materials"})
        self.assertEqual(p["recipes"]["Bronze"]["n"], 1)
        self.assertEqual(p["recipes"]["Bronze"]["req"], [["Copper", 2, 1], ["Tin", 1, 1]])

    def test_conversiones_con_combustible_y_alcance(self):
        p = self.build({"Sword": "weapons"})
        self.assertIn({"st": "piece_smelter", "from": "IronScrap", "time": 30.0, "n": 1, "fuel": ["Coal", 2]}, p["convert"]["Iron"])
        self.assertEqual(set(p["items"]), {"Sword", "Iron", "IronOre", "IronScrap", "Coal", "Wood", "boss:Eikthyr"})
        self.assertEqual(p["items"]["Sword"]["cat"], "weapons")
        self.assertEqual(p["items"]["Sword"]["maxQ"], 4)
        self.assertNotIn("cat", p["items"]["Iron"])
        self.assertEqual(p["prefer"], {"Iron": "from:IronScrap", "Coal": "from:Wood"})

    def test_fuentes_resumidas(self):
        p = self.build({"Sword": "weapons"})
        self.assertEqual(p["sources"]["IronScrap"], [{"how": "mine", "biomes": ["swamp"], "name": None}])

    def test_piezas_y_jefes(self):
        p = self.build({"piece:forge": "building"})
        self.assertEqual(p["recipes"]["piece:forge"]["req"], [["Copper", 6, 0]])
        self.assertEqual(p["recipes"]["boss:Eikthyr"], {"st": "altar:Eikthyr", "lv": 1, "n": 1, "req": [["Wood", 2, 0]]})
        self.assertEqual(p["items"]["boss:Eikthyr"]["cat"], "bosses")
        self.assertEqual(p["stations"]["altar:Eikthyr"]["name"]["es"], "Altar místico")

    def test_lo_fundido_termina_en_su_estacion(self):
        self.recipes.append({"item": "Nord", "station": "piece_blackforge", "level": 4, "amount": 1, "anyOne": False,
                             "requirements": [{"item": "Iron", "amount": 20, "perLevel": 10}]})
        self.recipes.append({"item": "NordCast", "station": "piece_blackforge", "level": 4, "amount": 1, "anyOne": False,
                             "requirements": [{"item": "Iron", "amount": 20, "perLevel": 15}]})
        self.conversions.append({"station": "piece_frostfoundry", "from": "NordCast", "to": "Nord", "time": 50.0, "yield": 1})
        self.items |= {"Nord": {"weight": 1.0, "maxQuality": 4, "sources": []}, "NordCast": {"weight": 1.0, "maxQuality": 1, "sources": []}}
        self.ref |= refs("Nord", "NordCast")
        p = self.build({"Nord": "weapons"})
        self.assertEqual(p["recipes"]["Nord"]["post"], "piece_frostfoundry")
        self.assertNotIn("Nord", p["convert"])
        self.assertIn("piece_frostfoundry", p["stations"])


if __name__ == "__main__":
    unittest.main()
