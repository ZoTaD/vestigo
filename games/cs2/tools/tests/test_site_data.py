"""Pruebas de `site_data` sobre lo crudo real. Correr: python -m unittest discover -s games/cs2/tools/tests -p "test_site_data.py" """
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import site_data  # noqa: E402


class TestSiteData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = site_data.build()

    def ficha(self, tab, slug):
        return next(f for f in self.d[tab]["fichas"] if f["slug"] == slug)

    def test_kilowatt(self):
        k = self.ficha("cases", "kilowatt-case")
        self.assertEqual(k["kind"], "case")
        self.assertEqual([(g["rarity"], len(g["skins"])) for g in k["groups"]], [("covert", 2), ("classified", 3), ("restricted", 5), ("milspec", 7)])
        self.assertTrue(k["rare"])

    def test_inheritance(self):
        s = self.ficha("skins", "ak-47-inheritance")
        self.assertEqual((s["min"], s["max"], s["st"], s["sv"]), (0, 0.797346, True, True))
        self.assertEqual(s["cases"], ["kilowatt-case"])
        self.assertEqual(s["collections"], ["the-kilowatt-collection"])
        self.assertEqual(s["cat"], "rifles")

    def test_fases_de_doppler(self):
        fases = [f for f in self.d["skins"]["fichas"] if f["slug"].startswith("bayonet-doppler-")]
        self.assertGreaterEqual(len(fases), 4)
        ruby = self.ficha("skins", "bayonet-doppler-ruby")
        self.assertEqual(ruby["phase"], "Ruby")
        self.assertIn("bayonet-doppler-phase-1", ruby["variants"])

    def test_tipos_de_contenedor(self):
        kinds = {f["slug"]: f["kind"] for f in self.d["cases"]["fichas"]}
        self.assertEqual(kinds["sealed-dead-hand-terminal"], "terminal")
        self.assertEqual(kinds["dreamhack-2013-souvenir-package"], "souvenir")
        self.assertEqual(kinds["anubis-collection-package"], "package")
        self.assertNotIn("jackass-sticker-capsule", kinds)

    def test_coleccion_sin_cajas(self):
        self.assertEqual(self.ficha("collections", "the-arabesque-collection")["cases"], [])

    def test_coleccion_de_cada_skin(self):
        fila = next(r for r in self.d["skins"]["list"] if r["slug"] == "ak-47-inheritance")
        self.assertEqual(fila["col"], "the-kilowatt-collection")

    def test_tradeup(self):
        tu = self.d["tradeup"]
        k = tu["the-kilowatt-collection"]
        self.assertEqual(len(k["tiers"]["covert"]), 2)
        self.assertTrue(k["rare"])
        self.assertEqual(tu["the-arabesque-collection"]["rare"], [])

    def test_slugs_unicos(self):
        todos = []
        for tab in ("skins", "cases", "collections"):
            slugs = [f["slug"] for f in self.d[tab]["fichas"]]
            self.assertEqual(len(slugs), len(set(slugs)), tab)
            todos += slugs
        # Las imágenes van por slug en una sola carpeta: tampoco pueden chocar entre pestañas.
        self.assertEqual(len(todos), len(set(todos)))


if __name__ == "__main__":
    unittest.main()
