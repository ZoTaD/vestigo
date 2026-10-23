"""Pruebas de `save_data`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import save_data  # noqa: E402


class TestSaveData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = save_data.save()

    def test_pesos_suman_100_y_en_el_orden_de_la_pantalla(self):
        p = self.d["perfection"]
        self.assertEqual(sum(x["weight"] for x in p), 100)
        self.assertEqual(
            [x["key"] for x in p],
            ["shipped", "obelisks", "clock", "slayer", "friends", "level", "stardrops", "cooking", "crafting", "fish", "walnuts"],
        )
        self.assertTrue(all(len(x["name"]) == 2 and "[" not in x["name"][0] for x in p))
        pesos = {x["key"]: x["weight"] for x in p}
        self.assertEqual((pesos["shipped"], pesos["friends"], pesos["level"], pesos["walnuts"]), (15, 11, 5, 5))

    def test_totales_de_la_perfeccion(self):
        t = {x["key"]: x["total"] for x in self.d["perfection"]}
        self.assertEqual(t["obelisks"], 4)
        self.assertEqual(t["level"], 25)
        self.assertEqual(t["stardrops"], 7)
        self.assertEqual(t["walnuts"], 130)
        self.assertEqual(t["shipped"], len(self.d["shippable"]))
        self.assertEqual(t["fish"], len(self.d["fish"]))
        self.assertEqual(t["cooking"], len(self.d["cooking"]))
        self.assertEqual(t["crafting"], len(self.d["crafting"]))

    def test_enviados(self):
        e = set(self.d["shippable"])
        self.assertIn("24", e)       # Chirivía
        self.assertNotIn("221", e)   # Pastel rosa (cocina)
        self.assertNotIn("128", e)   # los peces no cuentan como enviados
        self.assertIn("433", e)      # grano de café: excepción del juego

    def test_peces(self):
        f = set(self.d["fish"])
        self.assertIn("128", f)
        self.assertNotIn("168", f)   # Basura: fuera de la colección de pesca

    def test_recetas(self):
        self.assertIn("221", [c["out"] for c in self.d["cooking"]])
        claves = [c["key"] for c in self.d["crafting"]]
        self.assertNotIn("Wedding Ring", claves)
        self.assertIn("Wood Fence", claves)

    def test_frutos_estelares(self):
        s = self.d["stardrops"]
        self.assertEqual(len(s), 7)
        self.assertEqual(
            {x["flag"] for x in s},
            {"CF_Fair", "CF_Fish", "CF_Mines", "CF_Sewer", "CF_Spouse", "CF_Statue", "museumComplete"},
        )
        self.assertTrue(all(len(x["name"]) == 2 and "[" not in x["name"][0] and x["name"][1] for x in s))

    def test_obeliscos_y_reloj(self):
        self.assertEqual(
            self.d["obelisks"], ["Water Obelisk", "Earth Obelisk", "Desert Obelisk", "Island Obelisk"]
        )
        self.assertEqual(self.d["clock"], "Gold Clock")

    def test_cazamonstruos(self):
        s = {x["key"]: x for x in self.d["slayer"]}
        self.assertEqual(s["Slimes"]["count"], 1000)
        self.assertEqual(len(s["Slimes"]["targets"]), 4)
        self.assertEqual(s["Slimes"]["name"], ["Slimes", "Babas"])

    def test_amigos(self):
        a = {x["key"]: x["max"] for x in self.d["friends"]}
        self.assertEqual(a["Abigail"], 8)   # soltera: 8 corazones
        self.assertEqual(a["Pierre"], 10)
        self.assertIn("Dwarf", a)           # el juego lo cuenta (PerfectionScore)
        self.assertNotIn("Marlon", a)       # CanSocialize = FALSE
        self.assertNotIn("Bear", a)
        self.assertEqual(self.d["perfection"][4]["total"], len(a))

    def test_reina_de_la_salsa(self):
        q = self.d["queenOfSauce"]
        self.assertEqual(len(q), 32)
        self.assertEqual(q["1"], "Stir Fry")
        cocina = {c["key"] for c in self.d["cooking"]}
        self.assertTrue(set(q.values()) <= cocina)

    def test_nueces(self):
        self.assertEqual(self.d["walnuts"], 130)


if __name__ == "__main__":
    unittest.main()
