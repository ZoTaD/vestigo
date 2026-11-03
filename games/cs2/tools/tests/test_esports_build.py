"""Pruebas del armado de la 6b (`esports_teams.build`). Correr:
python -m unittest discover -s games/cs2/tools/tests -p "test_esports_build.py" """
import json
import sys
import tempfile
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))

import esports_teams  # noqa: E402

leer = lambda f: (AQUI / "fixtures" / f).read_text(encoding="utf-8")  # noqa: E731

VRS = {
    "date": "2026-11-02", "before": "2026-10-05",
    "global": [
        {"rank": 1, "pts": 1960, "team": "MOUZ", "roster": ["PR", "Spinx", "torzsi", "xelex", "xertioN"], "lp": "MOUZ", "why": {}},
        {"rank": 12, "pts": 1598, "team": "1win", "roster": ["a", "b", "c", "d", "e"], "lp": None, "why": {}},
    ],
    "europe": [], "americas": [], "asia": [],
}
TEAMS = {"MOUZ": {"name": "MOUZ", "logo": "mouz"}}


class FakeLp:
    def __init__(self):
        self.parses = []

    def parse(self, page):
        self.parses.append(page)
        if page == "MOUZ":
            return leer("lp_team_mouz.html")
        if page == "MOUZ/Results":
            return leer("lp_team_results.html")
        if page == "PGL/2026/Masters":
            return leer("lp_bracket.html")
        if page == "XertioN":
            return leer("lp_player.html")
        return "<div></div>"


class FakeGh:
    def names(self, year):
        return {2026: ["standings_global_2026_10_05.md", "standings_global_2026_11_02.md"]}.get(year, [])

    def text(self, path):
        return leer("vrs_global_2026_11_02.md") if path.endswith("2026_11_02.md") else leer("vrs_global_2026_10_05.md")


class TestBuild(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "esports"
        self.raw = Path(self.tmp.name) / "raw"
        self.lp, self.gh = FakeLp(), FakeGh()

    def tearDown(self):
        self.tmp.cleanup()

    def build(self, budget, today="2026-11-03"):
        esports_teams.build(self.lp, self.gh, self.out, self.raw, today, VRS, TEAMS, [], budget=budget)

    def read(self, f):
        return json.loads((self.out / f).read_text(encoding="utf-8"))

    def test_respeta_el_tope(self):
        self.build(budget=2)
        self.assertEqual(self.lp.parses, ["MOUZ", "MOUZ/Results"])

    def test_todo_con_tope_alto(self):
        self.build(budget=999)
        t = self.read("teams/mouz.json")
        self.assertEqual(t["vrs"]["rank"], 1)
        self.assertEqual([p["id"] for p in t["roster"] if p["role"] == "player"][0], "torzsi")
        self.assertEqual(t["results"][0]["tour"], "PGL Masters Bucharest 2026")
        self.assertEqual(t["vrs"]["history"], [{"date": "2026-10-05", "rank": 4, "pts": 1863}, {"date": "2026-11-02", "rank": 1, "pts": 1960}])
        self.assertTrue(any(m["map"] == "Nuke" for m in t["maps"]))
        self.assertEqual(t["matches"][0]["tour"], "PGL Masters Bucharest 2026")
        self.assertIn("XertioN", self.lp.parses)
        p = self.read("players/xertion.json")
        self.assertEqual((p["name"], p["team_slug"]), ("Dorian Berman", "mouz"))
        tour = self.read("tours/pgl-2026-masters.json")
        self.assertEqual(len(tour["matches"]), 3)
        idx = self.read("index.json")
        self.assertEqual([t["slug"] for t in idx["teams"]], ["mouz", "1win"])
        self.assertIn("il", idx["flags"])

    def test_no_relee_lo_vigente_y_relee_lo_vencido(self):
        self.build(budget=999)
        self.lp.parses.clear()
        self.build(budget=999, today="2026-11-05")
        self.assertEqual(self.lp.parses, [])  # nada venció (equipo 7 días, jugador 30, torneo terminado nunca)
        self.build(budget=999, today="2026-11-11")
        self.assertEqual(self.lp.parses[:2], ["MOUZ", "MOUZ/Results"])
        self.assertNotIn("PGL/2026/Masters", self.lp.parses)

    def test_equipo_sin_liquipedia(self):
        self.build(budget=999)
        t = self.read("teams/1win.json")
        self.assertIsNone(t["lp"])
        self.assertEqual((t["name"], t["vrs"]["rank"]), ("1win", 12))
        self.assertEqual((t["roster"], t["maps"], t["matches"]), ([], [], []))


class TestBanderas(unittest.TestCase):
    def test_baja_solo_las_que_faltan(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            (out / "hu.svg").write_text("<svg/>", encoding="utf-8")
            pedidas = []

            def get(url):
                pedidas.append(url)
                return b"<svg>il</svg>"

            esports_teams.fetch_flags(["hu", "il"], out, get)
            self.assertEqual(pedidas, ["https://cdn.jsdelivr.net/npm/flag-icons@7.6.0/flags/4x3/il.svg"])
            self.assertEqual((out / "il.svg").read_text(encoding="utf-8"), "<svg>il</svg>")

    def test_codigo_raro_no_se_pide(self):
        with tempfile.TemporaryDirectory() as tmp:
            pedidas = []
            esports_teams.fetch_flags(["../x", "zzz"], Path(tmp), lambda u: pedidas.append(u) or b"")
            self.assertEqual(pedidas, [])


if __name__ == "__main__":
    unittest.main()
