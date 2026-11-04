"""Pruebas de `vrs`. Correr: python -m unittest discover -s games/cs2/tools/tests -p "test_vrs.py" """
import sys
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))

from vrs import detail, latest_dates, moves, standings  # noqa: E402

leer = lambda f: (AQUI / "fixtures" / f).read_text(encoding="utf-8")  # noqa: E731
G, O, D = leer("vrs_global_2026_11_02.md"), leer("vrs_global_2026_10_05.md"), leer("vrs_detail_mouz.md")


class TestVrs(unittest.TestCase):
    def test_tabla(self):
        rows = standings(G)
        self.assertEqual(rows[0]["team"], "MOUZ")
        self.assertEqual(rows[0]["rank"], 1)
        self.assertEqual(rows[0]["pts"], 1960)
        self.assertEqual(rows[0]["roster"], ["PR", "Spinx", "torzsi", "xelex", "xertioN"])
        self.assertEqual(rows[0]["detail"], "details/2026_11_02/0001--mouz--pr-spinx-torzsi-xelex-xertion.md")

    def test_movimiento(self):
        rows = moves(standings(G), standings(O))
        self.assertEqual(rows[0]["prev"], 4)

    def test_nuevo_en_el_ranking(self):
        rows = moves(standings(G), [])
        self.assertIsNone(rows[0]["prev"])

    def test_detalle(self):
        d = detail(D)
        self.assertEqual(d["start"], 2000.0)
        self.assertAlmostEqual(d["h2h"], -39.7)
        self.assertEqual(d["factors"], {"bounty_offered": 1.0, "bounty_collected": 0.949, "network": 0.467, "lan": 1.0})
        self.assertEqual(d["matches"][0], {"date": "2026-10-31", "opp": "Vitality", "won": True})
        self.assertEqual(d["matches"][1], {"date": "2026-10-30", "opp": "FURIA", "won": False})

    def test_fechas(self):
        self.assertEqual(latest_dates(["standings_global_2026_10_05.md", "standings_global_2026_11_02.md", "standings_europe_2026_11_02.md"]), ("2026_11_02", "2026_10_05"))


if __name__ == "__main__":
    unittest.main()
