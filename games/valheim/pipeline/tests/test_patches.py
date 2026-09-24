import unittest
from pipeline.patches import Names, auto_es, classify, headline, keep, parse, version_of


class TestPatches(unittest.TestCase):
    def test_version_y_que_anuncios_quedan(self):
        self.assertEqual(version_of("Patch 0.221.4 – Call To Arms"), "0.221.4")
        self.assertEqual(version_of("Hotfix 1.0.10 & 1.0.12"), "1.0.12")
        self.assertEqual(version_of("Update: Hearth & Home arrives!"), "0.202.14")
        self.assertFalse(keep("Patch 0.221.13 (Public Test)"))
        self.assertFalse(keep("Word From the Devs: Winter Adventures"))
        self.assertTrue(keep("Valheim 1.0 Has Arrived!"))

    def test_titular(self):
        self.assertEqual(headline("Patch 0.221.4 – Call To Arms", "0.221.4"), "Call To Arms")
        self.assertEqual(headline("Update: Hearth & Home arrives!", "0.202.14"), "Hearth & Home")
        self.assertIsNone(headline("Patch 0.217.30", "0.217.30"))

    def test_parse_intro_secciones_y_viñetas(self):
        body = ("Hola vikingos.\n[previewyoutube=x;full][/previewyoutube]\n[h2]Patch Notes:[/h2]\n"
                "[b]Bugs & Issues:[/b]\n[p]* * Fixed a crash\n* Tweaked Seal colliders\n"
                "Discord: https://discord.gg/valheim")
        p = parse(body)
        self.assertEqual(p["intro"], ["Hola vikingos."])
        self.assertEqual([s["title"] for s in p["sections"]], ["Bugs & Issues"])
        self.assertEqual([l["text"] for l in p["sections"][0]["lines"]], ["Fixed a crash", "Tweaked Seal colliders"])

    def test_clasifica(self):
        self.assertEqual(classify("Fixed a crash", "Misc"), "fix")
        self.assertEqual(classify("Weapon: Nord Sword", "Craftable Items"), "new")
        self.assertEqual(classify("Reduced Bjorn health", "Fixes & Improvements"), "mid")
        self.assertEqual(classify("Punching no longer removes snow", "Bugs & Issues"), "fix")

    def test_nombres_largos_sin_mayusculas_cortos_con(self):
        n = Names([("Crystal Battleaxe", "weapons/crystal-battleaxe"), ("Crystal", "materials/crystal"), ("Stone", "materials/stone")])
        self.assertEqual(n.find("New weapons: Crystal battleaxe"), ["weapons/crystal-battleaxe"])
        self.assertEqual(n.find("a mighty stone throne"), [])
        self.assertEqual(n.find("Crystal walls"), ["materials/crystal"])

    def test_traduccion_automatica(self):
        en2es = {"Nord Sword": "Espada nord"}
        self.assertEqual(auto_es("Weapon: Nord Sword", en2es), "Arma: Espada nord")
        self.assertIsNone(auto_es("Weapon: Unknown Thing", en2es))


if __name__ == "__main__":
    unittest.main()
