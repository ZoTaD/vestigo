"""Pruebas de `relations`. Correr: python -m unittest discover -s games/warframe/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import drops  # noqa: E402
import exceptions  # noqa: E402
import relations  # noqa: E402


class TestRelations(unittest.TestCase):
    def test_partes_de_excalibur_en_war(self):
        ps = {p["name"][0]: p for p in relations.parts("/Lotus/Powersuits/Excalibur/Excalibur")}
        chasis = next(s for s in ps["Excalibur Chassis"]["sources"] if s["k"] == "mission")
        self.assertEqual((chasis["where"], chasis["chance"]), ("Mars/War (Assassination)", 38.72))

    def test_parte_prime_desde_reliquias(self):
        nik = relations.sources_by_name("Nikana Prime Blueprint")
        self.assertIn({"k": "relic", "relic": "Axi A1", "rarity": "Rare", "vaulted": drops.vaulted("Axi A1")}, nik)

    def test_planetas_del_recurso(self):
        self.assertEqual(relations.resource_planets("/Lotus/Types/Items/MiscItems/NeuralSensor"), [["Jupiter", "Júpiter"]])

    def test_todo_lo_de_la_tabla_cruza_o_tiene_motivo(self):
        sueltos = relations.unresolved_drop_names()
        self.assertEqual(sorted(set(sueltos) - set(exceptions.UNRESOLVED)), [])

    def test_las_excepciones_siguen_sin_cruzar(self):
        # Una excepción que ya cruza es un motivo viejo: hay que sacarla.
        self.assertEqual(sorted(set(exceptions.UNRESOLVED) - set(relations.unresolved_drop_names())), [])

    def test_partes_de_equinox_con_dia_y_noche(self):
        ps = {p["name"][0]: p for p in relations.parts("/Lotus/Powersuits/YinYang/YinYang")}
        for aspecto in ("Day", "Night"):
            for pieza in ("Chassis", "Neuroptics", "Systems"):
                self.assertTrue(ps[f"Equinox {aspecto} {pieza}"]["sources"], f"{aspecto} {pieza}")

    def test_plano_principal_sin_texto_armado(self):
        p = relations.parts("/Lotus/Powersuits/Excalibur/Excalibur")[0]
        self.assertEqual((p["kind"], p["name"][0]), ("blueprint", "Excalibur"))
        self.assertEqual({q["kind"] for q in relations.parts("/Lotus/Powersuits/Excalibur/Excalibur")[1:]}, {"part"})

    def test_receta(self):
        r = relations.recipe_for("/Lotus/Powersuits/Excalibur/Excalibur")
        self.assertEqual((r["credits"], r["seconds"]), (25000, 86400))
        self.assertIn({"unique": "/Lotus/Types/Recipes/WarframeRecipes/ExcaliburChassisComponent", "n": 1}, r["ingredients"])
        self.assertIsNone(relations.recipe_for("/no/existe"))

    def test_recursos_incluyen_los_de_las_recetas(self):
        rs = relations.resources()
        self.assertIn("/Lotus/Types/Items/MiscItems/NeuralSensor", rs)
        self.assertNotIn("/Lotus/Types/Recipes/WarframeRecipes/ExcaliburChassisComponent", rs)

    def test_parte_prime_sin_receta_propia(self):
        ps = {p["name"][0]: p for p in relations.parts("/Lotus/Weapons/Tenno/Melee/Swords/PrimeKatana/PrimeNikana")}
        self.assertIn("Nikana Prime Blade", ps)
        self.assertEqual(ps["Nikana Prime"]["kind"], "blueprint")
        self.assertTrue(any(s["k"] == "relic" for s in ps["Nikana Prime"]["sources"]))
        self.assertTrue(any(s["k"] == "relic" for s in ps["Nikana Prime Blade"]["sources"]))
        self.assertNotIn("Orokin Cell", ps)


if __name__ == "__main__":
    unittest.main()
