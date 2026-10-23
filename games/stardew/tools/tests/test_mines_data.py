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

    def test_metas_del_gremio(self):
        q = self.d["slayer"]["Slimes"]
        self.assertEqual((q["count"], q["reward"]), (1000, "(O)520"))
        self.assertEqual(q["name"], ["Slimes", "Babas"])
        self.assertIn("520", self.d["refs"])
        self.assertEqual(self.d["slayer"]["Skeletons"]["rewardName"][0], "Skeleton Mask")
        self.assertTrue(self.d["slayer"]["FlameSpirits"]["phone"])

    def test_espada_galactica_del_desierto(self):
        fuentes = self.armas["(W)4"]["sources"]
        desierto = next(f for f in fuentes if f["k"] == "desert")
        self.assertEqual(desierto["place"], ["Calico Desert", "Desierto de Calico"])
        self.assertEqual(desierto["item"], ["Prismatic Shard", "Esquirla prismática"])

    def test_armas_enanas_y_de_diente_de_dragon_en_los_cofres_del_volcan(self):
        for n in ("54", "55", "56"):
            self.assertIn({"k": "volcano", "rare": False}, self.armas[f"(W){n}"]["sources"])
        for n in ("57", "58", "59"):
            self.assertIn({"k": "volcano", "rare": True}, self.armas[f"(W){n}"]["sources"])

    def test_armas_infinitas_en_la_forja(self):
        forja = next(f for f in self.armas["(W)62"]["sources"] if f["k"] == "forge")
        self.assertEqual(forja["from"], "(W)4")
        self.assertEqual(forja["fromName"], ["Galaxy Sword", "Espada galaxia"])
        self.assertEqual(forja["count"], 3)
        self.assertEqual(forja["item"][0], "Galaxy Soul")
        self.assertEqual(next(f for f in self.armas["(W)63"]["sources"] if f["k"] == "forge")["from"], "(W)29")
        self.assertEqual(next(f for f in self.armas["(W)64"]["sources"] if f["k"] == "forge")["from"], "(W)23")

    def test_otras_fuentes_del_codigo_y_los_datos(self):
        tipos = lambda n: [f["k"] for f in self.armas[f"(W){n}"]["sources"]]  # noqa: E731
        self.assertIn("drop", tipos("2"))  # espada oscura: la calavera embrujada
        self.assertEqual(next(f for f in self.armas["(W)3"]["sources"] if f["k"] == "special")["floors"], [80, 119])
        self.assertIn("slayer", tipos("13"))
        self.assertEqual(next(f for f in self.armas["(W)13"]["sources"] if f["k"] == "slayer")["goal"], "Insects")
        self.assertIn("fishing", tipos("14"))
        self.assertIn("fishing", tipos("51"))
        self.assertIn({"k": "remixed", "floor": 10}, self.armas["(W)22"]["sources"])
        abby = next(f for f in self.armas["(W)40"]["sources"] if f["k"] == "festival")
        self.assertEqual((abby["npc"], abby["price"]), (["Abigail", "Abigail"], 70))
        self.assertEqual(abby["name"], ["Desert Festival", "Festival del Desierto"])
        self.assertEqual(abby["currency"][0], "Calico Egg")
        self.assertIn("start", tipos("47"))
        self.assertIn("quarry", tipos("53"))
        self.assertEqual(next(f for f in self.armas["(W)66"]["sources"] if f["k"] == "mastery")["name"],
                         ["Farming Mastery", "Maestría de Granja"])
        self.assertIn({"k": "special", "dangerous": True}, self.armas["(W)61"]["sources"])
        # Los tramos seguidos de los barriles y monstruos que brillan se juntan: la espada templaria, del 80 al fondo.
        self.assertIn({"k": "special", "floors": [80, None]}, self.armas["(W)18"]["sources"])

    def test_casi_todas_las_armas_tienen_de_donde_salir(self):
        # Las que siguen sin fuente: sólo la tirachinas galaxia, que el juego no da en ningún lado.
        cofres = {c["item"] for c in self.d["chests"]}
        sin = [w["id"] for w in self.d["weapons"]
               if not (w["shop"] or w["floors"] or w["sources"] or w["id"] in cofres)]
        self.assertEqual(sin, ["(W)34"])

    def test_notas_de_zona_en_ingles_y_espanol(self):
        self.assertEqual(self.zonas["mines1"]["note"][0], "Copper at first, iron from floor 20.")

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
