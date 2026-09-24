import unittest
from pipeline import wiki


class TestWiki(unittest.TestCase):
    def test_nombres(self):
        self.assertEqual(wiki.norm("Vineberry Cluster"), wiki.norm("vineberry cluster"))
        self.assertEqual(wiki.norm("Mushrooms Galore á la Mistlands"), "mushrooms galore la mistlands")

    def test_biomas_de_un_texto(self):
        self.assertEqual(wiki.biomes_in("[[Black Forest|Black Forests]], [[Swamp]]s y [[Mountains]]"), ["blackforest", "swamp", "mountain"])
        self.assertEqual(wiki.biomes_in("Charred Fortress"), [])

    def test_ficha(self):
        kind, f = wiki.infobox("{{Infobox item\n| id = Vineberry\n| source = [[Ashlands]]\n| weight = 0.1}}\nTexto")
        self.assertEqual(kind, "item")
        self.assertEqual(f["source"], "[[Ashlands]]")
        self.assertEqual(f["weight"], "0.1")

    def test_ficha_con_plantillas_y_enlaces_con_barra(self):
        _, f = wiki.infobox("{{infobox creature\n| location = [[Black Forest|Bosque]]\n| drops = {{x|a|b}}\n|faction=Undead}}")
        self.assertEqual(wiki.biomes_in(f["location"]), ["blackforest"])
        self.assertEqual(f["faction"], "Undead")


if __name__ == "__main__":
    unittest.main()
