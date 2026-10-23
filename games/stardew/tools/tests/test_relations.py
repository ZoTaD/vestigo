"""Pruebas de `relations`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import relations  # noqa: E402


class TestRelations(unittest.TestCase):
    def test_a_penny_le_encanta_el_melon(self):
        self.assertIn("Penny", relations.tastes_by_item()["254"]["love"])

    def test_ids_de_texto_en_los_gustos(self):
        # SkillBook_4 es un id de texto; BasiliskPaw es un Trinket, no un objeto.
        self.assertEqual(relations.gift_taste("Abigail", "SkillBook_4"), "like")
        self.assertIn("Abigail", relations.tastes_by_item()["Book_Void"]["love"])

    def test_no_sociables_fuera(self):
        keys = {v["key"] for v in relations.villagers()}
        self.assertEqual(len(keys), 34)
        self.assertNotIn("Gunther", keys)
        self.assertNotIn("Marlon", keys)

    def test_aldeano_tiene_ficha_completa(self):
        ab = next(v for v in relations.villagers() if v["key"] == "Abigail")
        self.assertEqual(ab["name"][0], "Abigail")
        self.assertEqual(ab["birthday"], [2, 13])
        self.assertTrue(ab["romance"])

    def test_precedencia_de_gustos(self):
        # Personal por id gana a la categoría personal: Penny ama el melón (-79 es de otros).
        self.assertEqual(relations.gift_taste("Penny", "254"), "love")
        # Sin nada propio ni universal, es neutral.
        self.assertIn(relations.gift_taste("Abigail", "254"), {"dislike"})

    def test_paquetes_del_melon(self):
        rooms = {(b[0], b[1]) for b in relations.bundles_by_item()["254"]}
        self.assertIn(("Pantry", 1), rooms)
        self.assertIn(("Pantry", 3), rooms)

    def test_paquete_con_nombre_y_recompensa(self):
        b = next(b for b in relations.bundles() if b["room"] == "Pantry" and b["index"] == 3)
        self.assertEqual(b["name"][0], "Quality Crops")
        self.assertEqual(b["need"], 3)
        self.assertEqual(b["reward"], ["(BC)15", 1])
        self.assertEqual(b["room_name"][0], "Pantry")
        oro = next(b for b in relations.bundles() if b["room"] == "Vault" and b["index"] == 23)
        self.assertEqual(oro["items"], [["-1", 2500, 2500]])

    def test_recetas_del_melon(self):
        outs = {r["name"][0] for r in relations.recipes() if any(i[0] == "254" for i in r["ings"])}
        self.assertTrue({"Pink Cake", "Fruit Salad"} <= outs)

    def test_maquinas_del_melon(self):
        by = {m["machine"]: m["price"] for m in relations.machines_by_input()["254"]}
        self.assertEqual(by["(BC)12"], 750)
        self.assertEqual(by["(BC)15"], 550)

    def test_semilla_del_melon(self):
        crop = next(s for s in relations.sources_by_item()["254"] if s["k"] == "crop")
        self.assertEqual((crop["seed"], crop["days"], crop["seasons"]), ("479", 12, [1]))


if __name__ == "__main__":
    unittest.main()
