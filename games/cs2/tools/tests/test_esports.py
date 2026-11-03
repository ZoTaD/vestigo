"""Pruebas de `esports`. Correr: python -m unittest discover -s games/cs2/tools/tests -p "test_esports.py" """
import sys
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))

from esports import infobox, streams, teams_in, tournaments  # noqa: E402

leer = lambda f: (AQUI / "fixtures" / f).read_text(encoding="utf-8")  # noqa: E731
T, B, M = leer("lp_tournaments.html"), leer("lp_iem_beijing.html"), leer("lp_matches.html")


class TestTorneos(unittest.TestCase):
    def test_lista(self):
        ts = tournaments(T)
        self.assertIn({"slug": "Intel_Extreme_Masters/2026/Beijing", "name": "IEM Beijing 2026", "state": "ongoing"}, ts)
        self.assertIn({"slug": "PGL/2026/Singapore", "name": "PGL Major Singapore 2026", "state": "upcoming"}, ts)
        self.assertEqual(ts[-1]["state"], "concluded")

    def test_ficha(self):
        i = infobox(B)
        self.assertEqual(i["prize"], 1250000)
        self.assertEqual(i["tier"], "S")
        self.assertEqual(i["start"], "2026-11-02")
        self.assertEqual(i["end"], "2026-11-08")
        self.assertEqual(i["teams"], 16)
        self.assertEqual(i["organizer"], "ESL")
        self.assertEqual(i["location"], "Beijing")
        self.assertEqual(i["series"], "IEM ESL Grand Slam")

    def test_ficha_sin_datos(self):
        self.assertEqual(infobox("<div></div>"), {"series": None, "organizer": None, "type": None, "location": None, "venue": None, "prize": None, "start": None, "end": None, "teams": None, "tier": None})

    def test_transmisiones(self):
        s = streams(B)
        self.assertEqual(s[0], "eslcs")
        self.assertEqual(len(s), len(set(s)))


class TestEquipos(unittest.TestCase):
    def test_logo_del_modo_claro(self):
        ts = teams_in(M)
        ganador = next(iter(ts))
        self.assertTrue(all(v["logo"] is None or v["logo"].endswith(".png") for v in ts.values()))
        self.assertTrue(all("darkmode" not in (v["logo"] or "") for v in ts.values()))
        self.assertIsNotNone(ts[ganador]["name"])

    def test_liquid(self):
        html = '<span class="team-template-image-icon team-template-lightmode"><a href="/counterstrike/Team_Liquid" title="Team Liquid"><img alt="" src="/commons/images/thumb/0/01/Team_Liquid_2024_lightmode.png/44px-Team_Liquid_2024_lightmode.png" /></a></span><span class="team-template-image-icon team-template-darkmode"><a href="/counterstrike/Team_Liquid" title="Team Liquid"><img alt="" src="/commons/images/thumb/5/59/Team_Liquid_2024_darkmode.png/44px-Team_Liquid_2024_darkmode.png" /></a></span>'
        self.assertEqual(teams_in(html)["Team_Liquid"], {"name": "Team Liquid", "logo": "Team_Liquid_2024_lightmode.png"})

    def test_sin_logo(self):
        html = '<span class="name"><a href="/counterstrike/Nadie" title="Nadie">Nadie</a></span>'
        self.assertEqual(teams_in(html)["Nadie"], {"name": "Nadie", "logo": None})


if __name__ == "__main__":
    unittest.main()
