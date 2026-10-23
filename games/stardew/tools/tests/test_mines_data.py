"""Pruebas de `mines_data`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import mines_data  # noqa: E402
import sdv  # noqa: E402


class TestMinesData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = mines_data.mines()
        cls.armas = {w["id"]: w for w in cls.d["weapons"]}
        cls.botas = {b["id"]: b for b in cls.d["boots"]}
        cls.mons = {m["key"]: m for m in cls.d["monsters"]}
        cls.zonas = {z["key"]: z for z in cls.d["zones"]}

    def test_espada_oxidada(self):
        w = self.armas["(W)0"]
        self.assertEqual(w["dmg"], [2, 5])
        self.assertEqual(w["type"], 3)
        self.assertIsNone(w["floors"])
        self.assertEqual(w["name"], ["Rusty Sword", "Espada oxidada"])

    def test_sable_de_plata_desde_el_piso_45(self):
        w = self.armas["(W)1"]
        self.assertEqual(w["floors"], [50, 45])
        self.assertEqual(w["shop"]["price"], 750)
        self.assertEqual(w["shop"]["floor"], 20)

    def test_botas(self):
        b = self.botas["(B)505"]
        self.assertEqual((b["defense"], b["immunity"]), (0, 1))
        self.assertEqual(b["name"][1], "Botas de goma")
        self.assertEqual(self.botas["(B)507"]["shop"]["price"], 700)
        self.assertEqual(len(self.d["boots"]), 18)

    def test_anillos_y_baratijas(self):
        self.assertEqual(len(self.d["rings"]), 31)
        self.assertTrue(all(r["slug"] for r in self.d["rings"]))
        self.assertEqual(len(self.d["trinkets"]), 8)
        self.assertTrue(all(t["id"].startswith("(TR)") for t in self.d["trinkets"]))

    def test_baba_verde(self):
        m = self.mons["Green Slime"]
        self.assertIn(["766", 0.75], m["loot"])
        self.assertEqual((m["hp"], m["dmg"], m["xp"]), (24, 5, 3))
        self.assertEqual(m["name"], ["Green Slime", "Baba verde"])
        self.assertEqual(m["slayer"], "Slimes")
        self.assertIn("766", self.d["refs"])

    def test_baba_verde_llega_hasta_el_piso_30_en_las_minas(self):
        # `MineShaft.getMonsterForThisLevel`, área 0: del piso 31 para arriba sólo salen Bat y RockGolem.
        donde = {w["zone"]: w["floors"] for w in self.mons["Green Slime"]["where"]}
        self.assertEqual(donde["mines1"], [2, 30])

    def test_bruto_de_las_sombras_segun_el_codigo(self):
        # `MineShaft.getMonsterForThisLevel`: sale en el área 80 (pisos 80 a 120); la rama de la Calavera no lo trae.
        zonas = {w["zone"]: w["floors"] for w in self.mons["Shadow Brute"]["where"]}
        self.assertEqual(zonas, {"mines3": [80, 120]})
        self.assertNotIn("Shadow Brute", self.zonas["skull"]["monsters"])

    def test_monstruos_de_la_calavera(self):
        for k in ("Serpent", "Mummy", "Iridium Crab", "Pepper Rex"):
            self.assertIn(k, self.zonas["skull"]["monsters"])
        self.assertEqual(self.zonas["skull"]["floors"], [121, None])

    def test_cofres(self):
        c = {x["floor"]: x for x in self.d["chests"]}
        self.assertEqual(c[10]["item"], "(B)506")
        self.assertEqual(c[100]["item"], "(O)434")
        self.assertEqual(c[120]["item"], "SkullKey")  # `MineShaft.addLevelChests`: SpecialItem(4), la llave de la Calavera
        self.assertEqual(c[120]["name"][1], "Llave calavera")
        self.assertNotIn(30, c)
        self.assertEqual(self.d["elevator"]["every"], 5)

    def test_zonas_coherentes(self):
        for z in self.d["zones"]:
            for k in z["monsters"]:
                self.assertIn(k, self.mons)
        for m in self.d["monsters"]:
            self.assertTrue(m["where"], m["key"])
            for w in m["where"]:
                self.assertIn(w["zone"], self.zonas)

    def test_slugs_unicos_y_sin_los_que_no_salen(self):
        for campo in ("slug", "slugEs"):
            s = [m[campo] for m in self.d["monsters"]]
            self.assertEqual(len(s), len(set(s)))
        self.assertEqual(self.mons["Iridium Golem"]["slug"], "iridium-golem")
        for k in ("Fireball", "Crow", "Frog", "Cat", "Shadow Guy"):
            self.assertNotIn(k, self.mons)

    def test_sprites_de_monstruos_existen(self):
        for k, m in self.mons.items():
            src = mines_data.monster_sprite(k)
            self.assertTrue((sdv.RAW / f"textures/Characters/Monsters/{src['sheet']}.png").exists(), k)
            self.assertEqual(m["sprite"], [src["w"], src["h"]])

    def test_refs_con_la_forma_de_ref(self):
        for i, r in self.d["refs"].items():
            self.assertEqual(len(r), 6, i)
            self.assertEqual((r[4], r[5]), (16, 16))
        for m in self.d["monsters"]:
            for i, _ in m["loot"]:
                self.assertIn(i, self.d["refs"])


if __name__ == "__main__":
    unittest.main()
