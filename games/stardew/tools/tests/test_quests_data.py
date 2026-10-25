"""Pruebas de `quests_data`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import quests_data  # noqa: E402


def _textos(x):
    """Todas las cadenas de un valor anidado."""
    if isinstance(x, str):
        yield x
    elif isinstance(x, dict):
        for v in x.values():
            yield from _textos(v)
    elif isinstance(x, list):
        for v in x:
            yield from _textos(v)


class TestQuestsData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = quests_data.quests()
        cls.story = {q["key"]: q for q in cls.d["story"]}
        cls.orders = {o["key"]: o for o in cls.d["orders"]}

    def test_66_misiones(self):
        self.assertEqual(len(self.d["story"]), 66)
        self.assertEqual(len(self.story), 66)

    def test_meet_the_wizard(self):
        q = self.story["1"]
        self.assertEqual(q["title"][0], "Meet The Wizard")
        self.assertTrue(q["title"][1])
        self.assertNotEqual(q["title"][0], q["title"][1])
        self.assertEqual(q["type"], "Location")
        self.assertEqual(q["slug"], "1")

    def test_campos_de_las_misiones(self):
        for q in self.d["story"]:
            for campo in ("title", "desc", "goal"):
                self.assertTrue(all(q[campo]) and len(q[campo]) == 2, (q["key"], campo))
                self.assertNotIn("...", q["title"][0], q["key"])
            for n in q["next"]:
                self.assertIn(n, self.story, q["key"])
        self.assertEqual(self.story["6"]["next"], ["7", "8"])
        self.assertEqual(self.story["15"]["next"], ["16"])
        self.assertEqual(self.story["101"]["from"], "Jodi")
        self.assertEqual(self.story["101"]["money"], 350)
        self.assertEqual(self.story["101"]["item"], "190")
        self.assertEqual(self.story["113"]["n"], 10)
        self.assertIsNone(self.story["1"]["from"])
        self.assertIn("28", self.story["9"]["goal"][0])

    def test_21_pedidos_sin_qi(self):
        self.assertEqual(len(self.d["orders"]), 21)
        tableros = [o["board"] for o in self.d["orders"]]
        self.assertEqual(tableros.count("town"), 18)
        self.assertEqual(tableros.count("desert"), 3)
        for o in self.d["orders"]:
            self.assertFalse(o["key"].startswith("Qi"), o["key"])
            self.assertTrue(o["slug"])

    def test_willy(self):
        w = self.orders["Willy"]
        self.assertEqual(w["who"], "Willy")
        self.assertIn({"id": "684", "n": 100}, w["items"])
        self.assertIn({"k": "money", "n": 3000}, w["rewards"])
        self.assertEqual(w["days"], 7)
        self.assertFalse(w["repeat"])
        carta = [r for r in w["rewards"] if r["k"] == "mail"]
        self.assertEqual(len(carta), 1)
        self.assertTrue(all(carta[0]["text"]))

    def test_premios(self):
        robin = self.orders["Robin"]
        self.assertIn({"k": "friendship", "n": 250}, robin["rewards"])
        marlon = self.orders["DesertFestivalMarlon2"]
        self.assertIn({"k": "item", "id": "CalicoEgg", "n": 50}, marlon["rewards"])
        self.assertEqual(marlon["days"], 1)
        # El de Lewis paga 50 veces el precio del cultivo que toque: va de un mínimo a un máximo.
        plata = [r for r in self.orders["Lewis"]["rewards"] if r["k"] == "money"][0]
        self.assertEqual((plata["n"], plata["max"]), (25 * 50, 320 * 50))
        self.assertTrue(self.orders["Lewis"]["repeat"])

    def test_elementos_al_azar(self):
        clint = self.orders["Clint"]
        self.assertIn("Bats", clint["goals"][0][0])
        self.assertIn("Grubs", clint["goals"][0][0])
        self.assertIn(" or ", clint["goals"][0][0])
        self.assertIn(" o ", clint["goals"][0][1])
        tesoro = self.orders["DesertFestivalMarlon3"]["goals"][0][0]
        self.assertIn("12 Omni Geodes", tesoro)
        self.assertIn("15 pieces of Iridium Ore", tesoro)
        self.assertIn("12 omnigeodas", self.orders["DesertFestivalMarlon3"]["goals"][0][1])
        # Mayúscula sólo al principio de la lista y "Potatoes" bien escrito.
        self.assertTrue(self.orders["Lewis"]["text"][0].startswith("Potatoes, Green Beans, bulbs of Garlic"))

    def test_sin_huecos_en_los_textos(self):
        for t in _textos({k: self.d[k] for k in ("story", "orders")}):
            for c in "[{]}":
                self.assertNotIn(c, t)
            self.assertNotIn("  ", t)

    def test_refs(self):
        self.assertIn("684", self.d["refs"])
        self.assertIn("190", self.d["refs"])


if __name__ == "__main__":
    unittest.main()
