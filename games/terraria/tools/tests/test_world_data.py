"""Pruebas de `world_data` y `extras_data` con datos de juguete. Correr: python -m unittest discover -s games/terraria/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from extras_data import build_fishing, build_patches, parse_changelog  # noqa: E402
from world_data import classify, crowd_consts, resolver  # noqa: E402

CONSTS = {"loveValue": 0.88, "likeValue": 0.94, "dislikeValue": 1.06, "hateValue": 1.12}


class Felicidad(unittest.TestCase):
    def test_el_cociente_de_precio_dice_el_gusto(self):
        # Lo que devuelve la tienda del juego, ya redondeado a dos decimales.
        self.assertEqual(classify(0.84 / 0.95, CONSTS), "love")
        self.assertEqual(classify(0.89 / 0.95, CONSTS), "like")
        self.assertEqual(classify(1.01 / 0.95, CONSTS), "dislike")
        self.assertEqual(classify(1.06 / 0.95, CONSTS), "hate")
        self.assertIsNone(classify(0.95 / 0.95, CONSTS))

    def test_un_cociente_raro_es_un_error(self):
        with self.assertRaises(ValueError):
            classify(1.3, CONSTS)

    def test_hacinamiento_medido(self):
        crowd = [0.95, 0.95, 0.95, 1, 1.05, 1.1, 1.16]
        self.assertEqual(crowd_consts(crowd), {"solitude": 0.95, "solitudeUpTo": 2, "crowdFrom": 3, "crowdStep": 1.05})


class Marcas(unittest.TestCase):
    def setUp(self):
        self.fmt = resolver({
            "items": [{"internal": "TempleKey", "id": 7}],
            "texts_en": {"items": {"7": ["Temple Key", ""]}},
            "texts_es": {"items": {"7": ["Llave del templo", ""]}},
            "npcs": {"en-US": {"22": "Guide"}, "es-ES": {"22": "Guía"}},
            "loc_en": {"Bestiary_Biomes": {"TheUnderworld": "The Underworld"}, "Bestiary_Events": {"Blizzard": "Blizzard"}},
            "loc_es": {"Bestiary_Biomes": {"TheUnderworld": "El Inframundo"}, "Bestiary_Events": {"Blizzard": "Ventisca"}},
        })

    def test_nombres_oficiales_en_cada_idioma(self):
        self.assertEqual(self.fmt("{i:TempleKey} from the {n:22}.", "en"), "Temple Key from the Guide.")
        self.assertEqual(self.fmt("{i:TempleKey} del {n:22}.", "es"), "Llave del templo del Guía.")

    def test_el_articulo_del_bioma_va_en_minuscula_y_se_contrae(self):
        self.assertEqual(self.fmt("Throw it into lava in {b:TheUnderworld}.", "en"), "Throw it into lava in the Underworld.")
        self.assertEqual(self.fmt("Tiralo a la lava de {b:TheUnderworld}.", "es"), "Tiralo a la lava del Inframundo.")

    def test_una_marca_desconocida_es_un_error(self):
        with self.assertRaises(KeyError):
            self.fmt("{i:NoExiste}", "en")


CHANGELOG = """Version 1.2 Changes -----------------

I. Content

- Added a sword.
  - It is sharp.
- Added a shield.

II. Bug Fixes:

- Fixed a crash.

Version 1.1 Changes-----------------
A note about this version.
    - Old style, all indented.
        - With a child.
"""


class Parches(unittest.TestCase):
    def test_versiones_secciones_y_niveles(self):
        v = parse_changelog(CHANGELOG)
        self.assertEqual([x["v"] for x in v], ["1.2", "1.1"])
        self.assertEqual([s["t"] for s in v[0]["sections"]], ["Content", "Bug Fixes"])
        self.assertEqual(v[0]["sections"][0]["lines"], [[0, "Added a sword."], [1, "It is sharp."], [0, "Added a shield."]])

    def test_parche_viejo_sangrado_y_parrafo_suelto(self):
        old = parse_changelog(CHANGELOG)[1]
        self.assertEqual(old["sections"], [{"t": "A note about this version.", "lines": [[0, "Old style, all indented."], [1, "With a child."]]}])

    def test_archivos_por_version(self):
        out = build_patches(CHANGELOG)
        self.assertEqual(out["patches/index.json"], [
            {"v": "1.2", "slug": "1-2", "n": 4, "titles": ["Content", "Bug Fixes"]},
            {"v": "1.1", "slug": "1-1", "n": 2, "titles": ["A note about this version."]},
        ])
        self.assertEqual(out["patches/1-2.json"]["v"], "1.2")

    def test_un_texto_sin_versiones_no_da_nada(self):
        self.assertEqual(parse_changelog("nada\n- suelto\n"), [])


class Pesca(unittest.TestCase):
    def test_canas_cebos_cajas_y_misiones(self):
        base = {"headSlot": -1, "createTile": -1}
        items = [
            {**base, "id": 1, "internal": "WoodFishingPole", "fishingPole": 5},
            {**base, "id": 2, "internal": "GoldenFishingRod", "fishingPole": 50},
            {**base, "id": 3, "internal": "Worm", "bait": 25},
            {**base, "id": 4, "internal": "MasterBait", "bait": 50},
            {**base, "id": 5, "internal": "WoodenCrate", "createTile": 376},
            {**base, "id": 6, "internal": "WoodenCrateHard", "createTile": 376},
            {**base, "id": 7, "internal": "CratePotion"},
            {**base, "id": 8, "internal": "Batfish"},
            {**base, "id": 9, "internal": "SinFicha", "bait": 99},
        ]
        slugs = {i: [f"s{i}"] for i in range(1, 9)}
        f = build_fishing(items, [8, 99], slugs)
        self.assertEqual(f["poles"], [[1, 5], [2, 50]])
        self.assertEqual(f["baits"], [[4, 50], [3, 25]])
        self.assertEqual((f["crates"], f["cratesHard"]), ([[5]], [[6]]))
        self.assertEqual(f["quest"], [[8]])
        self.assertEqual(set(f["refs"]), {"1", "2", "3", "4", "5", "6", "8"})


if __name__ == "__main__":
    unittest.main()
