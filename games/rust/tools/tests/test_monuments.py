"""
Tests de `monuments.py` (2026-10-09). Los de forma leen el `monuments.json` versionado; el que rearma desde la caché
cruda (no versionada) corre sólo con `RUST_CACHE=1`.

    python -m unittest games/rust/tools/tests/test_monuments.py -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import monuments  # noqa: E402

DOC = monuments.DATA / "monuments.json"


class TestPieces(unittest.TestCase):
    def test_de_que_monumento_es_cada_pieza(self):
        known = {"large/airfield_1.prefab", "small/sphere_tank.prefab"}
        self.assertEqual(monuments.monument_of(monuments.MON + "large/airfield_1.prefab", known), "large/airfield_1.prefab")
        self.assertEqual(monuments.monument_of("assets/scenes/prefabs/airfield/maintainables/airfield maintainables.prefab", known), "large/airfield_1.prefab")
        self.assertEqual(monuments.monument_of("assets/prefabs/misc/monument/spheretankfuelswitch.prefab", known), "small/sphere_tank.prefab")
        self.assertIsNone(monuments.monument_of("assets/scenes/prefabs/floating city/casino barge.prefab", known))
        self.assertIsNone(monuments.monument_of(monuments.MON + "cave/cave_small_easy.prefab", known))

    def test_tiers_y_red(self):
        self.assertEqual(monuments.tiers_of(-1), [])
        self.assertEqual(monuments.tiers_of(6), [1, 2])
        self.assertEqual(monuments.power_kind("generator.hidden.controlroomloot.powergrid"), "lootroom")
        self.assertEqual(monuments.power_kind("lootfridge generator.static_hidden"), "fridge")
        self.assertEqual(monuments.power_kind("generator.noreset.static (Stage 4 Powergrid)"), "systems")


@unittest.skipUnless(DOC.exists(), "falta monuments.json")
class TestMonumentsJson(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(DOC, encoding="utf-8") as f:
            cls.doc = json.load(f)
        cls.by = {m["id"]: m for m in cls.doc["monuments"]}

    def test_los_que_ve_el_jugador(self):
        for mid in ("outpost", "bandit-camp", "launch-site", "military-tunnel", "power-plant", "airfield", "harbor", "oil-rig", "large-oil-rig", "apartment-complex"):
            self.assertIn(mid, self.by)
        for mid in ("underground-cave", "water-well", "mountain", "train-tunnel"):
            self.assertNotIn(mid, self.by)
        self.assertEqual(self.by["harbor"]["variants"], 2)
        ids = [m["id"] for m in self.doc["monuments"]]
        es = [m["slugEs"] for m in self.doc["monuments"]]
        self.assertEqual(len(set(ids)), len(ids))
        self.assertEqual(len(set(es)), len(es))

    def test_puzzle_recicladoras_y_zona_segura(self):
        self.assertEqual(self.by["launch-site"]["cards"].get("red"), 4)
        self.assertEqual(self.by["power-plant"]["recyclers"].get("red"), 2)
        self.assertEqual(self.by["outpost"]["recyclers"], {"yellow": 3})
        self.assertTrue(self.by["outpost"]["safeZone"])
        self.assertEqual(self.by["outpost"]["shop"], "outpost")
        self.assertEqual(self.by["launch-site"]["radiation"], "high")

    def test_la_red_de_power_trip(self):
        pg = self.doc["powergrid"]
        self.assertEqual(pg["stages"], [1, 4, 10, 18])
        self.assertEqual(pg["boxes"], [15, 5])
        self.assertEqual(pg["fuse"]["slug"], "heavy-fuse")
        by_stage = {s["stage"]: s["monuments"] for s in pg["byStage"]}
        self.assertIn("ferry-terminal", by_stage[1])
        self.assertIn("launch-site", by_stage[3])
        self.assertIn("airfield", by_stage[4])

    def test_apartamentos_y_fotos(self):
        ap = self.doc["apartments"]
        self.assertEqual([r["size"] for r in ap["rooms"]], [1, 2, 3])
        self.assertEqual(ap["shops"], 14)
        self.assertTrue(all(t["item"]["slug"] for t in ap["tax"]))
        for m in self.doc["monuments"]:
            if m["photo"]:
                self.assertTrue((monuments.PICS / f"{m['photo']}.webp").exists(), m["id"])


@unittest.skipUnless(os.environ.get("RUST_CACHE") == "1", "lee la caché cruda: RUST_CACHE=1")
class TestFromCache(unittest.TestCase):
    def test_el_json_versionado_es_el_de_la_cache(self):
        doc, _ = monuments.build()
        for m in doc["monuments"]:
            m.pop("_photo")
        with open(DOC, encoding="utf-8") as f:
            self.assertEqual(json.load(f), json.loads(json.dumps(doc)))


if __name__ == "__main__":
    unittest.main()
