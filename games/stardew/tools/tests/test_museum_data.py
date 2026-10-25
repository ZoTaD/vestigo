"""Pruebas de `museum_data`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import museum_data  # noqa: E402


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


class TestMuseumData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = museum_data.museum()
        cls.piezas = {p["id"]: p for p in cls.d["pieces"]}
        cls.premios = {r["key"]: r for r in cls.d["rewards"]}
        cls.libros = {b["id"]: b for b in cls.d["books"]}

    def tipos(self, pieza: str) -> set[str]:
        return {w["k"] for w in self.piezas[pieza]["where"]}

    def test_95_piezas(self):
        self.assertEqual(len(self.d["pieces"]), 95)
        kinds = [p["kind"] for p in self.d["pieces"]]
        self.assertEqual(kinds.count("arch"), 42)
        self.assertEqual(kinds.count("mineral"), 53)

    def test_todas_tienen_de_donde_salen(self):
        for p in self.d["pieces"]:
            self.assertTrue(p["where"], p["id"])
            self.assertTrue(p["slug"], p["id"])

    def test_pergamino_enano_se_excava(self):
        excavar = [w for w in self.piezas["96"]["where"] if w["k"] == "dig"]
        self.assertTrue(excavar and excavar[0]["places"])
        self.assertEqual(self.piezas["96"]["slug"], "dwarf-scroll-i")
        self.assertIn("monster", self.tipos("96"))

    def test_esmeralda_de_geoda_o_mina(self):
        w = self.piezas["60"]["where"]
        de_mina = any(x["k"] == "other" and "Mines" in x["text"][0] and "Minas" in x["text"][1] for x in w)
        self.assertTrue(de_mina or "geode" in self.tipos("60"))
        self.assertIn("fish", self.tipos("60"))

    def test_geodas(self):
        # La geoda común da el cristal de tierra por la tabla del código; la omni, el fragmento prismático por datos.
        geodas = {g for w in self.piezas["86"]["where"] if w["k"] == "geode" for g in w["geodes"]}
        self.assertIn("535", geodas)
        geodas = {g for w in self.piezas["74"]["where"] if w["k"] == "geode" for g in w["geodes"]}
        self.assertIn("749", geodas)

    def test_monstruos_con_slug(self):
        mons = [w for w in self.piezas["107"]["where"] if w["k"] == "monster"]
        self.assertTrue(any(m.get("slug") == "pepper-rex" for m in mons))

    def test_premios(self):
        self.assertEqual(len(self.d["rewards"]), 31)
        enano = self.premios["dwarf"]
        self.assertEqual(enano["need"]["ids"], ["96", "97", "98", "99"])
        self.assertEqual(enano["reward"]["id"], "326")
        self.assertEqual(enano["slug"], "dwarf")
        self.assertTrue(self.premios["ancient_seed_recipe"]["reward"]["recipe"])
        self.assertEqual(self.premios["arch15"]["need"]["tags"], [["arch", 15]])
        self.assertEqual(self.premios["museumComplete"]["need"]["tags"], [["any", 95]])
        # Los que no son objetos con ficha llevan el tamaño de su dibujo.
        self.assertEqual(self.premios["chicken"]["reward"]["id"], "(F)1305")
        self.assertTrue(self.premios["chicken"]["reward"]["sprite"])
        for r in self.d["rewards"]:
            self.assertTrue(all(r["reward"]["name"]), r["key"])
            self.assertTrue(all(r["text"]), r["key"])

    def test_libros(self):
        b = self.libros["Book_Trash"]
        self.assertTrue(all(b["effect"]) and len(b["effect"]) == 2)
        self.assertNotEqual(b["effect"][0], b["effect"][1])
        self.assertIsInstance(b["price"], int)
        self.assertEqual(b["slug"], "the-alleyway-buffet")
        self.assertIn("100", self.libros["Book_QueenOfSauce"]["where"][0])
        self.assertIn("100", self.libros["Book_QueenOfSauce"]["where"][1])
        self.assertIn("SkillBook_0", self.libros)
        self.assertNotIn("102", self.libros)
        for b in self.d["books"]:
            self.assertTrue(all(b["where"]), b["id"])
            self.assertTrue(all(b["effect"]), b["id"])

    def test_libros_perdidos(self):
        self.assertEqual(self.d["lostBooks"], 21)
        self.assertEqual(self.d["lostBook"], "102")
        self.assertIn("102", self.d["refs"])

    def test_sin_huecos_en_los_textos(self):
        for t in _textos({k: self.d[k] for k in ("pieces", "rewards", "books")}):
            self.assertNotIn("[", t)
            self.assertNotIn("{", t)


if __name__ == "__main__":
    unittest.main()
