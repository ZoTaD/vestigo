import unittest
from pipeline.loc import parse_localization, Loc
from pipeline.biomes import biomes_of, is_everywhere

CSV = '\ufeff,English,Swedish,French,Italian,German,Spanish\n' \
      'item_gold,Bloodgold,Blodguld,Or de sang,Oro di sangue,Blutgold,Oro sanguino\n' \
      'item_solo_en,Only English,,,,,\n' \
      '"item_coma","Mead, strong",,,,,"Hidromiel, fuerte"\n'


class TestLoc(unittest.TestCase):
    def test_lee_ingles_y_espanol(self):
        d = parse_localization(CSV)
        self.assertEqual(d["item_gold"], {"en": "Bloodgold", "es": "Oro sanguino"})
        self.assertEqual(d["item_coma"], {"en": "Mead, strong", "es": "Hidromiel, fuerte"})

    def test_sin_espanol_cae_al_ingles(self):
        loc = Loc(parse_localization(CSV))
        self.assertEqual(loc.t("$item_solo_en"), {"en": "Only English", "es": "Only English"})

    def test_token_desconocido_es_none(self):
        self.assertIsNone(Loc({}).t("$nada"))
        self.assertIsNone(Loc({}).t(None))


class TestBiomes(unittest.TestCase):
    def test_bits(self):
        self.assertEqual(biomes_of(1 | 8), ["meadows", "blackforest"])
        self.assertEqual(biomes_of(64), ["deepnorth"])
        self.assertEqual(biomes_of(0), [])

    def test_en_todos_lados(self):
        # Carbonizados, Elaking y Jotun aparecen con casi todos los bits: son
        # eventos, no el bioma donde viven.
        self.assertTrue(is_everywhere(1 | 2 | 4 | 8 | 16 | 32 | 64 | 256 | 512))
        self.assertTrue(is_everywhere(1 | 2 | 4 | 8 | 16 | 256 | 512))
        self.assertFalse(is_everywhere(1 | 8))


if __name__ == "__main__":
    unittest.main()
