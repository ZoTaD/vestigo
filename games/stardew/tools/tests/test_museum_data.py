"""Pruebas de `museum_data`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import museum_data  # noqa: E402
import sprites  # noqa: E402


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
        # Con el slug en español de su ficha de Minas, para enlazarla desde /es/.
        sombras = next(w for w in self.piezas["74"]["where"] if w["k"] == "monster" and w["slug"] == "shadow-brute")
        self.assertTrue(sombras["slugEs"])
        self.assertNotEqual(sombras["slugEs"], sombras["slug"])

    def test_la_receta_dice_que_es_receta(self):
        # Las dos semillas milenarias piden lo mismo: la de la receta se nombra con el texto del juego.
        semillas, receta = self.premios["ancient_seed"]["reward"], self.premios["ancient_seed_recipe"]["reward"]
        self.assertEqual(semillas["name"], ["Ancient Seeds", "Semillas milenarias"])
        self.assertEqual(receta["name"], ["Ancient Seeds (Recipe)", "Semillas milenarias (Receta)"])

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
        # `where` es una lista de frases [en, es].
        frases = self.libros["Book_QueenOfSauce"]["where"]
        self.assertTrue(all(isinstance(f, list) and len(f) == 2 for f in frases))
        self.assertIn("100", frases[0][0])
        self.assertIn("100", frases[0][1])
        self.assertIn("SkillBook_0", self.libros)
        self.assertNotIn("102", self.libros)
        for b in self.d["books"]:
            self.assertTrue(b["where"], b["id"])
            self.assertTrue(all(all(t.strip() for t in f) and len(f) == 2 for f in b["where"]), b["id"])
            self.assertFalse(any("dentro de:" in f[1] for f in b["where"]), b["id"])
            self.assertTrue(all(b["effect"]), b["id"])

    def test_prismatico_tambien_sale_de_la_caja_misteriosa(self):
        textos = [w["text"] for w in self.piezas["74"]["where"] if w["k"] == "other"]
        self.assertTrue(any("caja misteriosa" in t[1] for t in textos), textos)

    def test_piedras_profundas_piden_el_fondo_de_las_minas(self):
        for i in ("84", "82"):
            textos = [w["text"] for w in self.piezas[i]["where"] if w["k"] == "other" and "pisos" in w["text"][1]]
            self.assertTrue(textos and all("fondo" in t[1] and "bottom" in t[0] for t in textos), i)

    def test_un_golem_por_nombre(self):
        for p in self.d["pieces"]:
            nombres = [w["who"][0] for w in p["where"] if w["k"] == "monster"]
            self.assertEqual(len(nombres), len(set(nombres)), p["id"])

    def test_sprites_de_los_premios_sin_ficha(self):
        # Mueble de 1x2 casillas en `TileSheets/furniture` (32 por fila de 512 px), la Llave oxidada de `Data/Powers`.
        self.assertEqual(sprites.reward_box("(F)1305"), ("TileSheets/furniture", 1305 * 16 % 512, 1305 * 16 // 512 * 16, 16, 32))
        self.assertEqual(sprites.reward_box("(F)1671")[3:], (32, 64))
        self.assertEqual(sprites.reward_box("RustyKey"), ("LooseSprites/Cursors", 144, 320, 16, 16))
        self.assertEqual(sprites.reward_file("(F)1305"), "f-1305.png")
        self.assertEqual(sprites.reward_file("RustyKey"), "rusty-key.png")
        # Cada premio sin ficha tiene un dibujo del tamaño que dice el dato.
        for r in self.d["rewards"]:
            premio = r["reward"]
            if "sprite" in premio and not premio["id"].startswith("(BC)") and not premio["id"][0].isdigit():
                self.assertEqual(list(sprites.reward_box(premio["id"])[3:]), premio["sprite"], premio["id"])

    def test_refs_con_el_tamano_del_dibujo(self):
        self.assertEqual(self.d["refs"]["(BC)21"][2:], ["Crystalarium", "Cristalario", 16, 32])
        self.assertEqual(self.d["refs"]["60"][4:], [16, 16])

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
