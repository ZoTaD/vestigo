"""Pruebas de `sdv`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import sdv  # noqa: E402


class TestSdv(unittest.TestCase):
    def test_text_resuelve_tokens_en_los_dos_idiomas(self):
        o = sdv.raw("Data/Objects")["254"]
        self.assertEqual(sdv.text(o["DisplayName"], "en"), "Melon")
        self.assertEqual(sdv.text(o["DisplayName"], "es"), "Melón")

    def test_text_sin_token_devuelve_la_cadena(self):
        self.assertEqual(sdv.text("Hola", "es"), "Hola")
        self.assertEqual(sdv.text(None, "es"), "")

    def test_precios_del_melon(self):
        p = sdv.sell_prices(250, -79)
        self.assertEqual(p["base"], [250, 312, 375, 500])
        self.assertEqual(p["pro"]["tiller"][0], 275)

    def test_categoria_fruta_en_espanol_sale_del_juego(self):
        self.assertEqual(sdv.CATEGORIES[-79][0], "Fruit")
        self.assertNotEqual(sdv.CATEGORIES[-79][1], "")

    def test_energia(self):
        self.assertEqual(sdv.energy(45), (113, 50))
        self.assertIsNone(sdv.energy(-300))

    def test_slug(self):
        self.assertEqual(sdv.slugify("Melón de verano"), "melon-de-verano")

    def test_herrero_solo_lingotes_y_ganadero_por_nombre(self):
        self.assertIn("blacksmith", sdv.sell_prices(60, -15, "334", "Copper Bar")["pro"])
        self.assertNotIn("blacksmith", sdv.sell_prices(5, -15, "378", "Copper Ore")["pro"])
        self.assertNotIn("blacksmith", sdv.sell_prices(15, -15, "382", "Coal")["pro"])
        self.assertIn("rancher", sdv.sell_prices(190, -26, "306", "Mayonnaise")["pro"])

    def test_sin_calidad_un_solo_precio(self):
        self.assertEqual(sdv.sell_prices(60, -15, "334", "Copper Bar", calidad=False)["base"], [60])


if __name__ == "__main__":
    unittest.main()
