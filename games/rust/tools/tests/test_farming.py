"""
Tests de `farming.py` (2026-10-09). Los de forma leen el `farming.json` versionado y corren siempre; los que rearman
los datos desde la caché cruda (`games/rust/cache/`, no versionada) sólo con `RUST_CACHE=1`. Ninguno abre bundles.

    python -m unittest games/rust/tools/tests/test_farming.py -v
    RUST_CACHE=1 python -m unittest games/rust/tools/tests/test_farming.py -v
"""
import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import farming  # noqa: E402

DOC = farming.DATA / "farming.json"


class TestItemsMap(unittest.TestCase):
    def setUp(self):
        items = [{"id": i, "slug": i, "name": {"en": i, "es": None}} for i in
                 ("deermeat.burned", "bearmeat", "fish.anchovy", "chicken.raw", "bread.loaf", "white.berry")]
        cached = [{"sid": "white.berry", "data": {"m_GameObject": {"name": "white_berry.item"}}}]
        self.items = farming.Items(items, cached)

    def test_de_gameobject_a_shortname(self):
        self.assertEqual(self.items.sid_of_go("assets/x/meat.deer.burned.item.prefab"), "deermeat.burned")
        self.assertEqual(self.items.sid_of_go("meat.bear.raw.item"), "bearmeat")
        self.assertEqual(self.items.sid_of_go("anchovy"), "fish.anchovy")
        self.assertEqual(self.items.sid_of_go("chicken_raw.item"), "chicken.raw")
        self.assertEqual(self.items.sid_of_go("bread"), "bread.loaf")
        self.assertEqual(self.items.sid_of_go("white_berry.item"), "white.berry")
        self.assertIsNone(self.items.sid_of_go("nada.item"))

    def test_rango_de_temperatura(self):
        pts = [(-10.0, -1.0), (1.0, 0.0), (30.0, 1.0), (50.0, 0.0), (80.0, -1.0)]
        self.assertEqual(farming.temp_range(pts), {"min": 1.0, "max": 50.0, "best": 30.0})


@unittest.skipUnless(DOC.exists(), "falta farming.json")
class TestFarmingJson(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(DOC, encoding="utf-8") as f:
            cls.doc = json.load(f)

    def test_genes_en_el_orden_del_juego(self):
        g = self.doc["genes"]
        self.assertEqual([x["letter"] for x in g], ["X", "W", "G", "Y", "H"])
        # Los rojos pesan 1 en la cruza y los verdes 0,6 (GrowableGeneProperties `generic.genes`).
        self.assertEqual({x["letter"]: x["cross"] for x in g}, {"X": 1, "W": 1, "G": 0.6, "Y": 0.6, "H": 0.6})
        self.assertEqual([x["positive"] for x in g], [False, False, True, True, True])
        self.assertTrue(all(x["name"]["en"] and x["name"]["es"] for x in g))

    def test_catorce_plantas_con_ocho_etapas(self):
        plants = self.doc["plants"]
        self.assertEqual(len(plants), 14)
        for p in plants:
            self.assertEqual([s["state"] for s in p["stages"]], farming.STATES, p["id"])
            self.assertTrue(p["name"]["es"], p["id"])
            for k in ("harvest", "seed", "clone"):
                ref = p[k]["item"] if k == "harvest" else p[k]
                self.assertTrue(ref and ref["slug"], (p["id"], k))
        hemp = next(p for p in plants if p["id"] == "hemp")
        self.assertEqual(hemp["harvest"]["item"]["id"], "cloth")
        self.assertEqual(hemp["harvest"]["mult"], 10)
        self.assertEqual(hemp["stages"][5]["yield"], 3)

    def test_slugs_unicos(self):
        ids = [p["id"] for p in self.doc["plants"]]
        es = [p["slugEs"] for p in self.doc["plants"]]
        self.assertEqual(len(set(ids)), len(ids))
        self.assertEqual(len(set(es)), len(es))
        self.assertNotIn("genetics", ids)

    def test_el_resto(self):
        d = self.doc
        self.assertEqual(len(d["horses"]), 10)
        self.assertGreater(len(d["compost"]), 50)
        self.assertTrue(all(c["item"]["slug"] for c in d["compost"]))
        self.assertEqual(d["chickens"]["max"], 4)
        self.assertEqual({p["item"]["id"]: p["water"] for p in d["planters"]}["planter.large"], 9000)
        self.assertEqual([l["species"] for l in d["livestock"]], ["cow", "sheep"])

    def test_retratos(self):
        public = farming.PICS
        for h in self.doc["horses"]:
            self.assertTrue((public / f"{h['pic']}.webp").exists(), h["pic"])
        for pic in self.doc["animalPics"].values():
            self.assertTrue((public / f"{pic}.webp").exists(), pic)


@unittest.skipUnless(os.environ.get("RUST_CACHE") == "1", "lee la caché cruda: RUST_CACHE=1")
class TestFromCache(unittest.TestCase):
    def test_el_json_versionado_es_el_de_la_cache(self):
        doc, slugs, _ = farming.build()
        with open(DOC, encoding="utf-8") as f:
            self.assertEqual(json.load(f), json.loads(json.dumps(doc)))
        self.assertEqual(slugs["farming"]["genetics"], "genetica")


if __name__ == "__main__":
    unittest.main()
