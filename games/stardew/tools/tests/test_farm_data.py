"""Pruebas de `farm_data`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import farm_data  # noqa: E402


class TestFarmData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = farm_data.farm()
        cls.animales = {a["key"]: a for a in cls.d["animals"]}
        cls.edificios = {b["key"]: b for b in cls.d["buildings"]}

    def productos(self, clave: str, deluxe: bool) -> set[str]:
        return {p["id"] for p in self.animales[clave]["produce"] if p["deluxe"] == deluxe}

    def test_gallina_blanca(self):
        a = self.animales["White Chicken"]
        self.assertEqual(a["house"], "Coop")
        self.assertEqual(a["price"], 400)
        self.assertIsNone(a["from"])
        self.assertEqual(self.productos("White Chicken", False), {"176"})
        self.assertEqual(self.productos("White Chicken", True), {"174"})
        self.assertEqual(a["slug"], "white-chicken")
        self.assertEqual(a["sprite"], [16, 16])
        self.assertIsNone(a["tool"])

    def test_vaca_oveja_y_cerdo(self):
        self.assertIn("184", self.productos("White Cow", False))
        self.assertEqual(self.animales["White Cow"]["tool"], "pail")
        self.assertEqual(self.animales["White Cow"]["sprite"], [32, 32])
        self.assertEqual(self.animales["Sheep"]["tool"], "shears")
        self.assertEqual(self.animales["Pig"]["tool"], "dig")
        self.assertIn("430", self.productos("Pig", False))

    def test_los_que_no_vende_marnie(self):
        for clave in ("Void Chicken", "Golden Chicken", "Dinosaur", "Ostrich"):
            a = self.animales[clave]
            self.assertIsNone(a["price"], clave)
            self.assertEqual(len(a["from"]), 2, clave)
            self.assertTrue(all(t.strip() for t in a["from"]), clave)

    def test_variantes_que_salen_en_la_tienda(self):
        # La gallina marrón y la vaca marrón salen al comprar la blanca: valen lo mismo.
        self.assertEqual(self.animales["Brown Chicken"]["price"], 400)
        self.assertEqual(self.animales["Brown Cow"]["price"], 750)
        # La azul también, pero después del evento de Shane: lo dice `from`.
        self.assertEqual(self.animales["Blue Chicken"]["price"], 400)
        self.assertTrue(all(self.animales["Blue Chicken"]["from"]))

    def test_precios_nunca_cero(self):
        for a in self.d["animals"]:
            self.assertTrue(a["price"] is None or a["price"] > 0, a["key"])

    def test_gallinero_grande(self):
        b = self.edificios["Big Coop"]
        self.assertEqual(b["upgradeOf"], "Coop")
        self.assertEqual(b["cost"], 10000)
        self.assertIn(["388", 400], b["materials"])
        self.assertIn(["390", 150], b["materials"])
        self.assertEqual(b["builder"], "Robin")
        self.assertEqual(b["slug"], "big-coop")
        self.assertIn("Duck", b["animals"])

    def test_obelisco_de_la_isla_y_sin_casa_ni_invernadero(self):
        self.assertEqual(self.edificios["Island Obelisk"]["builder"], "Wizard")
        self.assertNotIn("Farmhouse", self.edificios)
        self.assertNotIn("Greenhouse", self.edificios)

    def test_animales_de_cada_edificio_existen(self):
        for b in self.d["buildings"]:
            for clave in b["animals"]:
                self.assertIn(clave, self.animales, b["key"])
        self.assertEqual(self.edificios["Silo"]["animals"], [])

    def test_casa(self):
        mejoras = self.d["house"]["upgrades"]
        self.assertEqual(len(mejoras), 3)
        self.assertEqual([m["cost"] for m in mejoras], [10000, 65000, 100000])
        self.assertEqual(mejoras[0]["materials"], [["388", 450]])
        self.assertEqual(mejoras[1]["materials"], [["709", 100]])
        reformas = {r["key"]: r for r in self.d["house"]["renovations"]}
        self.assertNotIn("remove_crib", reformas)
        self.assertNotIn("close_bedroom", reformas)
        self.assertEqual(reformas["add_dining_room"]["price"], 150000)
        self.assertEqual(reformas["open_bedroom"]["name"][0], "Open Bedroom")

    def test_cuidados(self):
        claves = {c["key"] for c in self.d["care"]}
        self.assertTrue({"pet", "notPet", "hungry", "outsideNight", "heater"} <= claves)
        for c in self.d["care"]:
            self.assertEqual(len(c["text"]), 2)

    def test_sin_llaves_ni_tokens_en_los_textos(self):
        hueco = re.compile(r"[{}\[\]]|LocalizedText")

        def textos(x):
            if isinstance(x, str):
                yield x
            elif isinstance(x, list):
                for y in x:
                    yield from textos(y)
            elif isinstance(x, dict):
                for y in x.values():
                    yield from textos(y)

        for parte in ("animals", "buildings", "house", "care"):
            for t in textos(self.d[parte]):
                self.assertIsNone(hueco.search(t), t)

    def test_refs(self):
        refs = self.d["refs"]
        for i in ("176", "174", "184", "430", "305", "388", "390", "709"):
            self.assertIn(i, refs)
            self.assertEqual(len(refs[i]), 6)

    def test_todo_objeto_nombrado_esta_en_refs(self):
        refs = self.d["refs"]
        for a in self.d["animals"]:
            ids = [p["id"] for p in a["produce"]] + ([a["egg"]] if a["egg"] else [])
            for i in ids:
                self.assertIn(i, refs, f"{a['key']}: {i}")
        for b in self.d["buildings"]:
            for i, _ in b["materials"]:
                self.assertIn(i, refs, f"{b['key']}: {i}")

    def test_cuidados_usan_el_menos_tipografico_y_el_establo(self):
        for c in self.d["care"]:
            self.assertFalse(c["value"].startswith("-"), c["key"])
        prof = next(c for c in self.d["care"] if c["key"] == "profession")
        self.assertNotIn("granero", prof["text"][1].lower())
        self.assertIn("establo", prof["text"][1])


if __name__ == "__main__":
    unittest.main()
