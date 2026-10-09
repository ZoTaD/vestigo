"""
Tests de `puzzles.py` (2026-10-09): la forma de `puzzles.json`, que cada objeto exista en `items.json` y que lo escrito
a mano (lectores por color, cajas de fusible) coincida con lo que dice el cliente en `monuments.json`.

    python -m unittest games/rust/tools/tests/test_puzzles.py -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import puzzles  # noqa: E402

DATA = puzzles.DATA
CONF = {"high", "medium", "low"}


def load(name):
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


class TestPuzzles(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.items = {i["id"]: i for i in load("items.json")["items"]}
        cls.mons = {m["id"]: m for m in load("monuments.json")["monuments"]}
        cls.doc = puzzles.build(list(cls.items.values()))
        cls.json = load("puzzles.json")

    def test_el_json_versionado_esta_al_dia(self):
        self.assertEqual(self.json, self.doc, "correr python games/rust/tools/puzzles.py")

    def test_forma(self):
        self.assertEqual(self.doc["verified"], puzzles.VERIFIED)
        for mid, p in self.doc["monuments"].items():
            with self.subTest(mid):
                self.assertIn(mid, self.mons, "el id tiene que ser el de monuments.json")
                self.assertIn(p["conf"], CONF)
                self.assertGreater(len(p["steps"]), 0)
                self.assertIn(p["resetMin"], (30, 65))
                for s in p["steps"]:
                    self.assertIn(s["conf"], CONF)
                    for lang in ("en", "es"):
                        self.assertTrue(s[lang].strip())
                        self.assertNotIn("  ", s[lang])
                    self.assertNotEqual(s["en"], s["es"])
                if p["reward"]:
                    self.assertTrue(p["reward"]["en"] and p["reward"]["es"])
                for c in p["changes"]:
                    self.assertRegex(c["date"], r"^20\d\d-\d\d-\d\d$")
                    self.assertTrue(c["en"] and c["es"])

    def test_cada_objeto_existe_en_items(self):
        for mid, p in self.doc["monuments"].items():
            refs = list(p["needs"]) + [r for s in p["steps"] for r in s["items"]] + (p["reward"]["items"] if p["reward"] else [])
            for r in refs:
                with self.subTest(mid=mid, item=r["item"]["id"]):
                    it = self.items.get(r["item"]["id"])
                    self.assertIsNotNone(it)
                    self.assertEqual(r["item"]["slug"], it["slug"])
                    self.assertGreaterEqual(r["n"], 1)

    def test_lectores_y_fusibles_como_el_cliente(self):
        """Lo que se escribió a mano (cuántos lectores de cada color, cuántas cajas de fusible) es lo que tiene el
        cliente para ese monumento. Si el juego cambia un monumento, este test avisa que hay que revisar los pasos."""
        for mid, p in self.doc["monuments"].items():
            with self.subTest(mid):
                m = self.mons[mid]
                self.assertEqual(p["cards"], m["cards"], f"lectores de {mid}")
                self.assertEqual(p["fuseBoxes"], m["fuses"], f"cajas de fusible de {mid}")

    def test_todos_los_monumentos_con_lectores_tienen_recorrido(self):
        con = {mid for mid, m in self.mons.items() if m["cards"]}
        self.assertEqual(con - set(self.doc["monuments"]), set())

    def test_lo_que_se_pide_alcanza(self):
        """Cada tarjeta que pide un paso está en lo que hay que llevar, salvo las que se consiguen adentro o son
        opcionales (las puertas verdes extra de la planta potabilizadora y del patio ferroviario)."""
        optional = {("water-treatment-plant", "keycard_green"), ("train-yard", "keycard_green")}
        for mid, p in self.doc["monuments"].items():
            if not p["needs"]:
                continue
            need = {r["item"]["id"] for r in p["needs"]}
            for s in p["steps"]:
                for r in s["items"]:
                    iid = r["item"]["id"]
                    if iid.startswith("keycard_") and (mid, iid) not in optional:
                        with self.subTest(mid=mid, card=iid):
                            self.assertIn(iid, need)

    def test_la_cadena_de_tarjetas(self):
        m = self.doc["monuments"]
        reward = lambda mid: {r["item"]["id"] for r in m[mid]["reward"]["items"]}
        for mid in ("satellite-dish", "sewer-branch", "harbor", "the-dome", "radtown", "ferry-terminal"):
            self.assertIn("keycard_blue", reward(mid))
        for mid in ("water-treatment-plant", "train-yard", "airfield", "power-plant"):
            self.assertIn("keycard_red", reward(mid))
        self.assertEqual({r["item"]["id"]: r["n"] for r in m["airfield"]["needs"]}["fuse"], 2)
        self.assertEqual({r["item"]["id"]: r["n"] for r in m["launch-site"]["needs"]}["fuse"], 2)


if __name__ == "__main__":
    unittest.main()
