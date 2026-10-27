"""Pruebas de `wf` y `fetch`. Correr: python -m unittest discover -s games/warframe/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import fetch  # noqa: E402
import wf  # noqa: E402


class TestWf(unittest.TestCase):
    def test_excalibur_en_los_dos_idiomas(self):
        en = wf.by_unique("Warframes", "en")["/Lotus/Powersuits/Excalibur/Excalibur"]
        es = wf.by_unique("Warframes", "es")["/Lotus/Powersuits/Excalibur/Excalibur"]
        self.assertEqual((en["health"], en["shield"], en["armor"], en["power"]), (270, 270, 240, 100))
        self.assertEqual([a["abilityName"] for a in es["abilities"]][3], "Espada exaltada")

    def test_clean(self):
        self.assertEqual(wf.clean("efecto <DT_SLASH_COLOR>cortante."), "efecto cortante.")
        self.assertEqual(wf.clean("<LOWER_IS_BETTER>a\r\nb |DAMAGE|"), "a\nb X")

    def test_slugify(self):
        self.assertEqual(wf.slugify("Gólem's Rage. Prime"), "golems-rage-prime")

    def test_icono(self):
        self.assertTrue(wf.icon_url("/Lotus/Powersuits/Excalibur/Excalibur").startswith("https://content.warframe.com/PublicExport/Lotus/Interface/Icons/"))
        self.assertIsNone(wf.icon_url("/Lotus/no/existe"))

    def test_unlzma(self):
        raw = (wf.RAW / "index_en.txt.lzma").read_bytes()
        self.assertIn(b"ExportWarframes_en.json!", fetch.unlzma(raw))

    def test_unlzma_basura_levanta_error(self):
        with self.assertRaises(ValueError):
            fetch.unlzma(bytes([255]) * 40)
        with self.assertRaises(ValueError):
            fetch.unlzma(b"")

    def test_validar(self):
        with self.assertRaises(ValueError):
            fetch.validar("X.json", b"")
        with self.assertRaises(ValueError):
            fetch.validar("X.json", b"{no")
        with self.assertRaises(ValueError):
            fetch.validar("drops.html", b"<html>")
        fetch.validar("X.json", b'{"a": 1}')


if __name__ == "__main__":
    unittest.main()
