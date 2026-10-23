"""Pruebas de `more_data`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import more_data  # noqa: E402


class TestMoreData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pesca = more_data.fish()
        cls.peces = {p["id"]: p for p in cls.pesca["fish"]}
        cls.rec = more_data.recipes()

    def test_pez_globo(self):
        p = self.peces["128"]
        self.assertEqual(p["times"], [[1200, 1600]])
        self.assertEqual(p["seasons"], [1])
        self.assertEqual(p["weather"], "sunny")
        self.assertEqual(p["slug"], "pufferfish")
        playa = next(x for x in p["places"] if x["key"] == "Beach")
        self.assertEqual(playa["seasons"], [1])
        self.assertTrue(all(len(x["name"]) == 2 and "[" not in x["name"][0] for x in p["places"]))
        self.assertFalse(p["legendary"])
        self.assertFalse(p["crabPot"])

    def test_perca_cuatro_estaciones_en_la_montana(self):
        p = self.peces["136"]
        self.assertEqual(p["seasons"], [0, 1, 2, 3])
        self.assertIn("Mountain", [x["key"] for x in p["places"]])

    def test_rey_rata_no_es_pez(self):
        nombres = {p["name"][0] for p in self.pesca["fish"]}
        self.assertNotIn("Rat King", nombres)
        self.assertIn("Pufferfish", nombres)

    def test_hora_pasada_la_medianoche(self):
        self.assertEqual(self.peces["800"]["times"], [[600, 2600]])

    def test_trampa_de_cangrejo(self):
        c = self.peces["717"]
        self.assertTrue(c["crabPot"])
        self.assertEqual([x["key"] for x in c["places"]], ["CrabPot:ocean"])
        self.assertEqual(c["times"], [])

    def test_pez_solo_de_la_isla_conserva_su_lugar(self):
        for p in self.pesca["fish"]:
            self.assertTrue(p["places"], p["id"])

    def test_legendarios(self):
        leg = {p["id"] for p in self.pesca["fish"] if p["legendary"]}
        self.assertGreaterEqual(len(leg), 5)
        self.assertLessEqual({"159", "160", "163", "775", "682"}, leg)
        self.assertNotIn("128", leg)

    def test_lugares_con_nombre(self):
        claves = {x["key"] for x in self.pesca["places"]}
        usados = {x["key"] for p in self.pesca["fish"] for x in p["places"]}
        self.assertEqual(claves, usados)

    def test_mayonesa_no_es_receta_y_mayonesera_si(self):
        self.assertNotIn("306", [r["out"] for r in self.rec["recipes"]])
        m = next(m for m in self.rec["machines"] if m["id"] == "(BC)24")
        self.assertTrue(any(r["in"] == "176" and r["out"] == "306" for r in m["rules"]))
        self.assertEqual(m["slug"], "mayonnaise-machine")
        self.assertEqual(self.rec["recipes"][m["recipe"]]["out"], "(BC)24")

    def test_pastel_rosa(self):
        r = next(r for r in self.rec["recipes"] if r["out"] == "221")
        self.assertEqual(r["kind"], "cook")
        self.assertIn(["254", 1], r["ings"])
        self.assertEqual(r["unlock"]["type"], "tv")

    def test_desbloqueos(self):
        por_nombre = {r["name"][0]: r for r in self.rec["recipes"]}
        self.assertEqual(por_nombre["Fried Egg"]["unlock"], {"type": "default"})
        sk = por_nombre["Stone Fence"]["unlock"]
        self.assertEqual((sk["type"], sk["skill"], sk["level"]), ("skill", "Farming", 2))
        amigo = por_nombre["Salad"]["unlock"]
        self.assertEqual((amigo["type"], amigo["npc"], amigo["hearts"]), ("friend", "Emily", 3))
        self.assertEqual(por_nombre["Cask"]["unlock"]["type"], "other")

    def test_l_n_en_cocina_es_tv_y_l_0_en_fabricacion_es_default(self):
        omelet = next(r for r in self.rec["recipes"] if r["kind"] == "cook" and r["name"][0] == "Omelet")
        self.assertEqual(omelet["unlock"]["type"], "tv")
        piso = next(r for r in self.rec["recipes"] if r["name"][0] == "Wood Floor")
        self.assertEqual(piso["unlock"], {"type": "default"})

    def test_isla_jengibre_por_zona(self):
        nombres = {x["key"]: x["name"] for x in self.pesca["places"]}
        self.assertEqual(nombres["IslandSouth"], ["Ginger Island (south)", "Isla Jengibre (sur)"])
        self.assertEqual(nombres["IslandWest"][1], "Isla Jengibre (oeste)")
        self.assertEqual(nombres["IslandSouthEast"][1], "Isla Jengibre (sureste)")

    def test_ningun_nombre_de_lugar_se_repite(self):
        for i in (0, 1):
            nombres = [x["name"][i] for x in self.pesca["places"]]
            self.assertEqual(len(nombres), len(set(nombres)))
        claves = [x["key"] for x in self.pesca["places"]]
        self.assertEqual(len(claves), len(set(claves)))
        self.assertGreater(len(claves), 10)

    def test_categorias_de_ingrediente_con_nombre(self):
        cats = self.rec["refs"]["cats"]
        negativos = {i for r in self.rec["recipes"] for i, _ in r["ings"] if i.startswith("-")}
        self.assertTrue(negativos)
        for c in negativos:
            self.assertEqual(len(cats[c]), 2, c)
            self.assertTrue(all(n and "[" not in n for n in cats[c]), c)
        self.assertNotEqual(cats["-5"], cats["-6"])
        self.assertEqual(cats["-5"][0], "Egg (Any)")
        self.assertEqual(cats["-777"][0], "Wild Seeds (Any)")

    def test_refs(self):
        self.assertEqual(self.rec["refs"]["items"]["254"][0], "melon")
        self.assertEqual(self.rec["refs"]["skills"]["Farming"], ["Farming", "Agricultura"])
        self.assertEqual(self.rec["refs"]["npcs"]["Emily"][0], "Emily")


if __name__ == "__main__":
    unittest.main()
