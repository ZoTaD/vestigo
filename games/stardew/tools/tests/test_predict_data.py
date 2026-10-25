"""Pruebas de `predict_data`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import predict_data  # noqa: E402
import sdv  # noqa: E402


class TestPredictData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = predict_data.predict()

    def test_objetos_en_orden_de_insercion(self):
        # `RANDOM_ITEMS` baraja con un `random.Next()` por objeto de `Data/Objects`: tienen que estar todos, en orden.
        ids = [o[0] for o in self.d["objects"]]
        self.assertEqual(ids, list(sdv.raw("Data/Objects")))
        o = {r[0]: r for r in self.d["objects"]}
        # [id, categoría, tipo, precio, banderas]: la pufferfish es pescado (-4), cuesta 200 y se puede vender al azar.
        self.assertEqual(o["128"], ["128", -4, "Fish", 200, 0])
        # Las banderas: 1 = `ExcludeFromRandomSale`.
        excluidos = {i for i, v in sdv.raw("Data/Objects").items() if v["ExcludeFromRandomSale"]}
        self.assertTrue(excluidos)
        self.assertEqual({r[0] for r in self.d["objects"] if r[4] & 1}, excluidos)

    def test_muebles_en_orden_y_con_precio(self):
        ids = [f[0] for f in self.d["furniture"]]
        self.assertEqual(ids, list(sdv.raw("Data/Furniture")))
        f = {r[0]: r for r in self.d["furniture"]}
        self.assertEqual(f["0"], ["0", 350, 0])  # Silla de roble
        self.assertEqual(f["JojaCatalogue"][1], 25000)
        self.assertEqual(f["JojaCatalogue"][2] & 1, 1)  # el campo 10 del mueble: excluido de la venta al azar

    def test_nombres_de_lo_que_no_tiene_ficha(self):
        n = self.d["names"]
        self.assertEqual(n["(F)0"], ["Oak Chair", "Silla de roble"])
        self.assertEqual(n["(H)RedFez"][0], "Red Fez")
        self.assertTrue(n["(H)RedFez"][1])
        for clave in ["(H)75", "(H)MysteryHat", "(S)MysteryShirt", "(WP)MoreWalls:11", "(BC)272", "(BC)136", "(W)60",
                      "(F)AbigailPortrait", "(F)RetroCatalogue"]:
            self.assertIn(clave, n)
            self.assertTrue(n[clave][0] and n[clave][1], clave)
        # Todos los muebles que el carro puede sacar tienen nombre en los dos idiomas.
        for i, precio, banderas in self.d["furniture"]:
            if predict_data.mueble_elegible(i, precio, banderas):
                self.assertTrue(all(n[f"(F){i}"]), i)

    def test_geodas(self):
        g = self.d["geodes"]
        self.assertEqual(set(g), {"535", "536", "537", "749", "275", "791"})
        omni = g["749"]
        self.assertTrue(omni["defaultItems"])
        premio = next(x for x in omni["drops"] if x["id"] == "PrismaticShard")
        self.assertEqual(premio["chance"], 0.008)
        self.assertEqual(premio["itemId"], "(O)74")
        self.assertEqual(premio["condition"], "PLAYER_STAT Current GeodesCracked 16")
        self.assertEqual(len(next(x for x in omni["drops"] if x["id"] == "Default")["randomItemId"]), 44)
        coco = g["791"]
        self.assertFalse(coco["defaultItems"])
        self.assertEqual(coco["drops"][0]["precedence"], -1000)
        self.assertEqual(coco["drops"][0]["setFlagOnPickup"], "goldenCoconutHat")
        self.assertEqual(coco["drops"][1]["stackModifiers"][0]["condition"], "ITEM_ID Target (O)833")
        self.assertNotIn("randomItemId", coco["drops"][0])  # lo que no está, no se guarda

    def test_carro(self):
        t = self.d["traveler"]
        self.assertEqual(len(t), len(sdv.raw("Data/Shops")["Traveler"]["Items"]))
        self.assertEqual(t[0]["id"], "RandomObjects")
        self.assertEqual(t[0]["itemId"], "RANDOM_ITEMS (O) 2 789 @requirePrice @isRandomSale")
        self.assertEqual(t[0]["maxItems"], 10)
        self.assertTrue(t[0]["avoidRepeat"])
        self.assertTrue(t[0]["useObjectDataPrice"])
        self.assertEqual(t[0]["priceModifierMode"], 2)
        self.assertEqual(t[0]["priceModifiers"][1]["random"], [3, 4, 5])
        self.assertEqual(t[0]["availableStockModifiers"][0]["condition"], "RANDOM 0.1")
        self.assertIn("ITEM_HAS_EXPLICIT_OBJECT_CATEGORY", t[0]["perItemCondition"])
        self.assertEqual(t[1]["id"], "(O)485")
        self.assertEqual(t[2]["id"], "RandomFurniture")
        self.assertEqual(t[2]["price"], -1)
        self.assertEqual(t[-1]["isRecipe"], True)
        # Lo que vale lo de siempre no se guarda.
        self.assertNotIn("tradeItemId", t[0])
        self.assertNotIn("quality", t[0])

    def test_cultivos_baratos_y_semillas_del_mapache(self):
        c = self.d["lowGradeCrops"]
        self.assertEqual(c["spring"], ["472", "473", "474", "475"])
        self.assertEqual(c["summer"], ["487", "483", "482", "484"])  # el orden de `Next(4)` del juego
        self.assertEqual(c["fall"], ["487", "488", "489", "490"])
        r = self.d["raccoonSeeds"]
        self.assertEqual(r["seeds"], ["CarrotSeeds", "SummerSquashSeeds", "BroccoliSeeds", "PowdermelonSeeds"])
        self.assertEqual(r["lastDay"], [23, 20, 20, 20])

    def test_festivales(self):
        f = self.d["festivals"]
        self.assertEqual(f["days"], {"spring": [13, 24], "summer": [11, 28], "fall": [16, 27], "winter": [8, 25]})
        self.assertEqual(f["names"]["fall27"], ["Spirit's Eve", "Víspera de los espíritus"])
        p = {x["id"]: x for x in f["passive"]}
        self.assertEqual(p["NightMarket"]["season"], 3)
        self.assertEqual((p["NightMarket"]["startDay"], p["NightMarket"]["endDay"]), (15, 17))
        self.assertEqual(p["NightMarket"]["mapReplacements"], ["Beach"])
        self.assertEqual(p["DesertFestival"]["condition"], "LOCATION_ACCESSIBLE Desert")
        self.assertEqual(p["TroutDerby"]["startDay"], 20)
        self.assertNotIn("mapReplacements", p["TroutDerby"])
        # `getWeatherModificationsForDate` pone Sol si alguna ubicación reemplazada es del valle: la playa sí, el
        # desierto no (el oráculo `weather` lo confirma contra los mapas reales).
        self.assertIs(p["NightMarket"]["inValley"], True)
        self.assertNotIn("inValley", p["DesertFestival"])
        self.assertNotIn("inValley", p["TroutDerby"])

    def test_clima(self):
        w = self.d["weather"]
        self.assertEqual(w[0], {"id": "GreenRain", "condition": "IS_GREEN_RAIN_DAY", "weather": "GreenRain"})
        self.assertEqual(w[-1], {"id": "Default", "weather": "Sun"})
        self.assertIn("SummerStorm", [x["id"] for x in w])

    def test_tamano(self):
        tam = len(json.dumps(self.d, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        self.assertLess(tam, 150_000)


if __name__ == "__main__":
    unittest.main()
