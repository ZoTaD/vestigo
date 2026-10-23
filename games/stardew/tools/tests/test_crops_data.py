"""Pruebas de `crops_data`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import crops_data  # noqa: E402
import site_data  # noqa: E402


class TestCropsData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.crops = {c["seed"]: c for c in crops_data.crops()["crops"]}
        cls.arboles = {t["sapling"]: t for t in crops_data.crops()["fruitTrees"]}
        cls.cal = crops_data.calendar()

    def test_melon(self):
        c = self.crops["479"]
        self.assertEqual(c["phases"], [1, 2, 3, 3, 3])
        self.assertEqual(c["regrow"], -1)
        self.assertEqual(c["seasons"], [1])
        self.assertEqual(c["seedPrice"], 80)
        self.assertEqual(c["seedShop"][0], "Pierre")
        self.assertEqual(c["slug"], "melon")
        precios = {p["machine"]: p["price"] for p in c["products"]}
        self.assertEqual(precios["(BC)12"], 750)
        self.assertEqual(precios["(BC)15"], 550)
        seco = next(p for p in c["products"] if p["machine"] == "(BC)Dehydrator")
        self.assertEqual(seco["per"], 5)

    def test_arandano_rebrota(self):
        self.assertEqual(self.crops["481"]["regrow"], 4)
        self.assertEqual(self.crops["481"]["stack"], [3, 3])

    def test_maiz_dos_estaciones(self):
        self.assertEqual(self.crops["487"]["seasons"], [1, 2])

    def test_fruta_antigua_y_cafe_estan(self):
        self.assertIn("499", self.crops)
        self.assertIn("433", self.crops)

    def test_tope_de_calidad(self):
        # Fibra (885) y Fruta Qi (890) salen siempre en calidad normal; el resto no tiene tope.
        self.assertEqual(self.crops["885"]["maxQuality"], 0)
        self.assertEqual(self.crops["890"]["maxQuality"], 0)
        self.assertIsNone(self.crops["479"]["maxQuality"])

    def test_cafe_en_barril(self):
        # 5 granos de café dan un Café (150) en el barril; el Café no es artesanal.
        barril = next(p for p in self.crops["433"]["products"] if p["machine"] == "(BC)12")
        self.assertEqual(barril["per"], 5)
        self.assertEqual(barril["price"], 150)
        self.assertFalse(barril["artisan"])
        self.assertEqual(barril["name"][0], "Coffee")

    def test_productos_fijos(self):
        # Trigo → Cerveza, Lúpulo → Pale Ale, Uva → Pasas (5 por 1): artesanales y sin sabor.
        def prod(semilla, maquina):
            return next(p for p in self.crops[semilla]["products"] if p["machine"] == maquina)
        self.assertEqual(prod("483", "(BC)12")["price"], 200)
        self.assertEqual(prod("302", "(BC)12")["price"], 300)
        pasas = prod("301", "(BC)Dehydrator")
        self.assertEqual((pasas["price"], pasas["per"]), (600, 5))
        self.assertTrue(pasas["artisan"])
        self.assertTrue(all(p["artisan"] for p in self.crops["479"]["products"]))

    def test_semilla_sin_tienda(self):
        self.assertIsNone(self.crops["499"]["seedPrice"])
        self.assertIsNone(self.crops["499"]["seedShop"])

    def test_todos_con_slug_del_sitio(self):
        slugs = {r[1] for r in site_data.build()["list"]}
        for c in self.crops.values():
            self.assertIn(c["slug"], slugs)

    def test_arbol_cerezo(self):
        t = self.arboles["628"]
        self.assertEqual(t["seasons"], [0])
        self.assertEqual(t["saplingPrice"], 1700)
        self.assertTrue(t["products"])

    def test_mercado_nocturno_en_el_calendario(self):
        for d in ("15", "16", "17"):
            fs = self.cal["seasons"][3]["days"][d]["festivals"]
            mn = next(f for f in fs if f["id"] == "NightMarket")
            self.assertTrue(mn["passive"])
            self.assertEqual((mn["from"], mn["to"]), (15, 17))
        self.assertNotIn("18", self.cal["seasons"][3]["days"])

    def test_pesca_del_calamar_en_invierno(self):
        sq = self.cal["seasons"][3]["days"]["12"]["festivals"]
        f = next(f for f in sq if f["id"] == "SquidFest")
        self.assertTrue(f["passive"])
        self.assertEqual((f["from"], f["to"]), (12, 13))
        self.assertEqual(f["name"], ["SquidFest", "Fiesta del Calamar"])
        verano = self.cal["seasons"][1]["days"]["20"]["festivals"]
        self.assertTrue(any(f["id"] == "TroutDerby" for f in verano))

    def test_festival_activo_y_cumple(self):
        dia = self.cal["seasons"][0]["days"]["13"]
        self.assertFalse(dia["festivals"][0]["passive"])
        self.assertIn("Kent", self.cal["seasons"][0]["days"]["4"]["birthdays"])

    def test_portada_trae_el_festival_del_desierto(self):
        fest = site_data.build()["home"]["seasons"][0]["festivals"]
        self.assertIn([15, 17, ["Desert Festival", "Festival del Desierto"]], fest)
        self.assertIn([13, 13, ["Egg Festival", "Festival del huevo"]], fest)


if __name__ == "__main__":
    unittest.main()
