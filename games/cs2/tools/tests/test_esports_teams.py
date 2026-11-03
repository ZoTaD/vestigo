"""Pruebas de la etapa 6b (lectores de `esports` y `esports_teams`). Correr:
python -m unittest discover -s games/cs2/tools/tests -p "test_esports_teams.py" """
import sys
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))

from esports import bracket_matches, player_page, team_page, team_results  # noqa: E402
from esports_teams import map_stats, team_matches  # noqa: E402

leer = lambda f: (AQUI / "fixtures" / f).read_text(encoding="utf-8")  # noqa: E731


class TestFichas(unittest.TestCase):
    def test_equipo(self):
        t = team_page(leer("lp_team_mouz.html"))
        self.assertEqual(t["region"], "Europe")
        self.assertEqual(t["location"], "Germany")  # sin la región pegada
        self.assertEqual(t["igl"], "xertioN")
        self.assertEqual(t["winnings"], 8887874)
        self.assertEqual(t["created"], "2002")
        players = [p for p in t["roster"] if p["role"] == "player"]
        coaches = [p for p in t["roster"] if p["role"] == "coach"]
        self.assertEqual([p["id"] for p in players], ["torzsi", "xertioN", "Spinx", "xelex", "PR"])
        self.assertEqual([p["id"] for p in coaches], ["sycrone"])
        x = players[1]
        self.assertEqual(x, {"lp": "XertioN", "id": "xertioN", "name": "Dorian Berman", "flag": "il", "since": "2022-08-26", "captain": True, "role": "player"})
        self.assertEqual([p["flag"] for p in players], ["hu", "il", "il", "hu", "cz"])

    def test_resultados(self):
        rs = team_results(leer("lp_team_results.html"))
        self.assertEqual(rs[0], {"date": "2026-10-31", "place": "3rd", "tier": "S", "tour": "PGL Masters Bucharest 2026", "tour_lp": "PGL/2026/Masters", "prize": 137500})
        self.assertTrue(all(r["tier"] in ("S", "A") for r in rs))
        self.assertTrue(any(r["place"] == "1st" for r in rs))
        self.assertIn("5th - 6th", [r["place"] for r in rs])  # el espacio de Liquipedia (&#160;) como espacio común

    def test_jugador(self):
        p = player_page(leer("lp_player.html"))
        self.assertEqual(p["name"], "Dorian Berman")
        self.assertEqual(p["flag"], "il")
        self.assertEqual(p["born"], "2004-07-22")
        self.assertEqual(p["team_lp"], "MOUZ")
        self.assertEqual(p["roles"], ["In-game leader", "Entry"])
        self.assertEqual(p["winnings"], 772773)


class TestLlaves(unittest.TestCase):
    def setUp(self):
        self.ms = bracket_matches(leer("lp_bracket.html"))

    def test_partidos(self):
        self.assertEqual(len(self.ms), 3)
        m = self.ms[0]
        self.assertEqual((m["a"], m["b"], m["a_lp"], m["b_lp"]), ("Team Spirit", "MOUZ", "Team_Spirit", "MOUZ"))
        self.assertEqual([(x["map"], x["a"], x["b"]) for x in m["maps"]], [("Nuke", 13, 2), ("Dust II", 8, 13), ("Mirage", 14, 16)])
        self.assertEqual(m["maps"][2]["hb"], [["t", 7], ["ct", 5], ["ct", 3], ["t", 1]])
        self.assertGreater(m["t"], 1_700_000_000)

    def test_mapa_sin_jugar_no_cuenta(self):
        self.assertEqual([x["map"] for x in self.ms[1]["maps"]], ["Nuke", "Inferno"])

    def test_abandono(self):
        ff = self.ms[2]["maps"][0]
        self.assertEqual(ff, {"map": "Mirage", "a": None, "b": None, "ha": [], "hb": [], "ff": "a"})
        self.assertEqual(self.ms[2]["maps"][1]["a"], 13)



class TestMapas(unittest.TestCase):
    def setUp(self):
        self.ms = bracket_matches(leer("lp_bracket.html"))

    def test_mapas_de_mouz(self):
        s = {x["map"]: x for x in map_stats(self.ms, "MOUZ", "2000-01-01")}
        self.assertEqual(list(s)[0], "Nuke")  # el más jugado primero
        self.assertEqual(s["Nuke"], {"map": "Nuke", "played": 2, "won": 1, "ct_w": 6, "ct_p": 11, "t_w": 9, "t_p": 24})
        self.assertEqual(s["Mirage"], {"map": "Mirage", "played": 1, "won": 1, "ct_w": 8, "ct_p": 15, "t_w": 8, "t_p": 15})
        self.assertEqual(s["Cache"]["ct_w"], 10)
        self.assertEqual(sum(x["played"] for x in s.values()), 6)  # el abandono no cuenta

    def test_desde(self):
        self.assertEqual(map_stats(self.ms, "MOUZ", "2099-01-01"), [])

    def test_sin_partidos(self):
        self.assertEqual(map_stats(self.ms, "Nadie", "2000-01-01"), [])
        self.assertEqual(team_matches(self.ms, "Nadie"), [])

    def test_partidos_desde_el_equipo(self):
        tm = team_matches(self.ms, "MOUZ")
        spirit = next(m for m in tm if m["opp_lp"] == "Team_Spirit")
        self.assertEqual(spirit["opp"], "Team Spirit")
        self.assertTrue(spirit["won"])
        self.assertEqual([(x["map"], x["us"], x["them"]) for x in spirit["maps"]], [("Nuke", 2, 13), ("Dust II", 13, 8), ("Mirage", 16, 14)])
        aurora = next(m for m in tm if m["opp_lp"] == "Aurora_Gaming")
        self.assertTrue(aurora["won"])
        self.assertEqual(aurora["maps"][0], {"map": "Mirage", "us": None, "them": None, "ff": True})
        self.assertEqual([m["t"] for m in tm], sorted((m["t"] for m in tm), reverse=True))


if __name__ == "__main__":
    unittest.main()
