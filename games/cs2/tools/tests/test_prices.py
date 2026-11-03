"""Pruebas de `prices`. Correr: python -m unittest discover -s games/cs2/tools/tests -p "test_prices.py" """
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import prices  # noqa: E402

N = None


def caja(*grupos, rare=(), kind="case"):
    return {"kind": kind, "groups": [{"rarity": r, "skins": list(s)} for r, s in grupos], "rare": list(rare)}


class TestCalculo(unittest.TestCase):
    def test_wear_avg_rango_parcial(self):
        # 0,00–0,08: 0,07 del rango es FN y 0,01 es MW.
        self.assertAlmostEqual(prices.wear_avg(0, 0.08, [10, 20, N, N, N]), (0.07 * 10 + 0.01 * 20) / 0.08)

    def test_wear_avg_saca_los_que_no_tienen_precio(self):
        self.assertAlmostEqual(prices.wear_avg(0, 0.15, [N, 20, N, N, N]), 20)
        self.assertIsNone(prices.wear_avg(0, 1, [N, N, N, N, N]))

    def test_wear_avg_vainilla(self):
        self.assertEqual(prices.wear_avg(None, None, [300]), 300)

    def test_skin_value_con_stattrak(self):
        sk = {"min": 0, "max": 0.07, "st": True}
        self.assertAlmostEqual(prices.skin_value(sk, {"n": [10, N, N, N, N], "st": [30, N, N, N, N]}), 0.9 * 10 + 0.1 * 30)
        # Sin precio de StatTrak cuenta sólo el normal.
        self.assertAlmostEqual(prices.skin_value(sk, {"n": [10, N, N, N, N]}), 10)

    def test_ev_a_mano(self):
        c = caja(("covert", ["a"]), ("classified", ["b"]), ("restricted", ["c"]), ("milspec", ["d"]), rare=["k"])
        r = prices.case_ev(c, {"a": 8, "b": 4, "c": 2, "d": 1, "k": 100})
        self.assertAlmostEqual(r["ev"], 0.7992 + 0.3196 + 0.128 + 0.0512 + 0.26)
        self.assertAlmostEqual(r["groups"]["covert"], 0.0512)

    def test_fases_de_doppler_pesan_como_un_acabado(self):
        # Tres fases del mismo cuchillo y otro cuchillo: cada acabado pesa igual, las fases se promedian adentro.
        c = caja(("covert", ["a"]), rare=["d1", "d2", "d3", "k"])
        nombres = {"d1": "Doppler", "d2": "Doppler", "d3": "Doppler", "k": "Fade"}
        r = prices.case_ev(c, {"a": 0, "d1": 300, "d2": 300, "d3": 300, "k": 100}, nombres)
        self.assertAlmostEqual(r["groups"]["special"], 0.0026 * (300 + 100) / 2)

    def test_grupo_sin_precios(self):
        c = caja(("covert", ["a"]), ("milspec", ["d"]))
        self.assertIsNone(prices.case_ev(c, {"d": 1}))

    def test_terminal_sin_ev(self):
        c = caja(("covert", ["a"]), kind="terminal")
        self.assertIsNone(prices.case_ev(c, {"a": 1}))

    def test_quantity_baja_usa_sugerido(self):
        self.assertEqual(prices.ev_cell({"min_price": 1, "suggested_price": 5, "quantity": 2}), 5)
        self.assertEqual(prices.ev_cell({"min_price": 1, "suggested_price": 5, "quantity": 3}), 1)
        self.assertEqual(prices.cell({"min_price": None, "suggested_price": 5, "quantity": 0}), (5, True))

    def test_caja_sin_precio_sin_ret(self):
        self.assertIsNone(prices.ret(1.5, None))
        self.assertAlmostEqual(prices.ret(1.5, 0.51), 0.5)


class TestReal(unittest.TestCase):
    """Sobre lo crudo real (`fetch.py`) y el catálogo (`site_data.py`)."""

    @classmethod
    def setUpClass(cls):
        cls.skins, cls.cases = prices.build()

    def test_action_baja_el_catalogo_crudo_todos_los_dias(self):
        # prices.py lee raw/skins*.json, que no está en git: la Action tiene que bajarlo en cada corrida, no sólo los lunes.
        wf = (Path(__file__).resolve().parents[4] / ".github" / "workflows" / "publish-cs2.yml").read_text(encoding="utf-8")
        precios = wf[wf.index("- name: prices"):]
        self.assertIn("fetch.py --catalog", precios.split("- name: guard")[0])

    def test_kilowatt(self):
        k = self.cases["kilowatt-case"]
        self.assertTrue(0.1 < k["ret"] < 0.6, k)

    def test_fases_con_precio_propio(self):
        self.assertNotEqual(self.skins["bayonet-doppler-ruby"]["n"], self.skins["bayonet-doppler-phase-1"]["n"])

    def test_terminal_sin_ev(self):
        self.assertNotIn("ev", self.cases["sealed-dead-hand-terminal"])

    def test_solo_souvenir_tiene_normal_vacio(self):
        p = self.skins["mp5-sd-lab-rats"]
        self.assertEqual(p["n"], [None] * 5)
        self.assertIn("sv", p)

    def test_inheritance(self):
        p = self.skins["ak-47-inheritance"]
        self.assertEqual(len(p["n"]), 5)
        self.assertIn("st", p)
        self.assertIn("sv", p)


if __name__ == "__main__":
    unittest.main()
