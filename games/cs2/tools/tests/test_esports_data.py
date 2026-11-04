"""Pruebas de `esports_data`. Correr: python -m unittest discover -s games/cs2/tools/tests -p "test_esports_data.py" """
import io
import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))

import esports_data  # noqa: E402

leer = lambda f: (AQUI / "fixtures" / f).read_text(encoding="utf-8")  # noqa: E731


def ficha(tier: str, start: str, end: str) -> str:
    """Una ficha mínima de torneo con su nivel y sus fechas."""
    celdas = {"Organizer": "X", "Prize Pool": "$100,000 USD", "Start Date": start, "End Date": end, "Teams": "8", "Liquipedia Tier": f"{tier}-Tier"}
    return "".join(f'<div class="infobox-cell-2 infobox-description">{k}:</div><div>{v}</div>' for k, v in celdas.items())


class FakeLp:
    def __init__(self):
        self.parses = []
        self.queries = 0
        self.files = 0

    def parse(self, page):
        self.parses.append(page)
        if page == "Liquipedia:Tournaments":
            return leer("lp_tournaments.html")
        if page == "Liquipedia:Matches":
            return leer("lp_matches.html")
        if page == "Intel_Extreme_Masters/2026/Beijing":
            return leer("lp_iem_beijing.html")
        if page == "PGL/2026/Singapore":
            return ficha("S", "2026-11-26", "2026-12-14")
        if page == "BLAST/Rivals/2026/Fall":
            return ficha("A", "2026-11-12", "2026-11-16")
        return ficha("B", "2026-01-01", "2026-01-05")

    def query(self, **params):
        self.queries += 1
        titles = params["titles"].split("|")
        return {"query": {"pages": {str(i): {"title": t, "imageinfo": [{"url": f"https://liquipedia.net/commons/images/{t[5:]}"}]} for i, t in enumerate(titles)}}}

    def file(self, url):
        self.files += 1
        buf = io.BytesIO()
        Image.new("RGBA", (120, 100), (200, 0, 0, 255)).save(buf, "PNG")
        return buf.getvalue()


class FakeGh:
    def names(self, year):
        return ["standings_global_2026_10_05.md", "standings_global_2026_11_02.md"] if year == 2026 else []

    def text(self, path):
        if path.endswith("standings_global_2026_11_02.md"):
            return leer("vrs_global_2026_11_02.md")
        if path.endswith("standings_global_2026_10_05.md"):
            return leer("vrs_global_2026_10_05.md")
        if "/details/" in path:
            return leer("vrs_detail_mouz.md")
        return ""  # las regiones vacías en la prueba


class TestEsportsData(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.lp, self.gh = FakeLp(), FakeGh()

    def tearDown(self):
        self.tmp.cleanup()

    def run_once(self):
        esports_data.run(self.lp, self.gh, self.root, today="2026-11-03", year=2026)
        out = self.root / "data" / "esports"
        return {f: json.loads((out / f"{f}.json").read_text(encoding="utf-8")) for f in ("tournaments", "vrs", "teams")}

    def test_filtra_por_nivel_y_ordena(self):
        d = self.run_once()
        names = [t["name"] for t in d["tournaments"]]
        self.assertEqual(names[0], "IEM Beijing 2026")
        self.assertEqual(d["tournaments"][0]["streams"][0], "eslcs")
        self.assertIn("BLAST Rivals Fall 2026", names)
        self.assertLess(names.index("BLAST Rivals Fall 2026"), names.index("PGL Major Singapore 2026"))
        self.assertNotIn("Stake Ranked Episode 6", names)  # nivel B en la prueba

    def test_no_repide_lo_cacheado(self):
        self.run_once()
        self.lp.parses.clear()
        self.run_once()
        self.assertEqual(sorted(self.lp.parses), ["Liquipedia:Matches", "Liquipedia:Tournaments"])

    def test_vrs(self):
        v = self.run_once()["vrs"]
        self.assertEqual(v["date"], "2026-11-02")
        self.assertEqual(v["before"], "2026-10-05")
        mouz = v["global"][0]
        self.assertEqual(mouz["prev"], 4)
        self.assertEqual(mouz["why"]["start"], 2000.0)
        self.assertEqual(len(mouz["why"]["matches"]), 5)

    def test_logos_y_equipo_sin_logo(self):
        d = self.run_once()
        self.assertEqual(d["teams"]["Team_Liquid"], {"name": "Team Liquid", "logo": "team-liquid"})
        self.assertTrue((self.root / "public" / "cs2" / "t" / "team-liquid.webp").exists())
        with Image.open(self.root / "public" / "cs2" / "t" / "team-liquid.webp") as img:
            self.assertEqual(img.height, 64)
        sin = [k for k, v in d["teams"].items() if v["logo"] is None]
        self.assertEqual(sorted(p.stem for p in (self.root / "public" / "cs2" / "t").glob("*.webp")), sorted(v["logo"] for v in d["teams"].values() if v["logo"]))

    def test_un_logo_roto_no_frena_la_corrida(self):
        orig = self.lp.file
        self.lp.file = lambda url: b"no es una imagen" if "Team_Liquid" in url else orig(url)
        d = self.run_once()
        self.assertIsNone(d["teams"]["Team_Liquid"]["logo"])
        self.assertTrue(any(v["logo"] for v in d["teams"].values()))

    def test_una_ficha_que_falla_no_pierde_las_otras(self):
        orig = self.lp.parse

        def parse(page):
            if page == "PGL/2026/Singapore":
                raise OSError("502 de Liquipedia")
            return orig(page)

        self.lp.parse = parse
        d = self.run_once()
        names = [t["name"] for t in d["tournaments"]]
        self.assertIn("IEM Beijing 2026", names)
        self.assertNotIn("PGL Major Singapore 2026", names)
        cache = json.loads((self.root / "raw" / "esports" / "tournaments.json").read_text(encoding="utf-8"))
        self.assertIn("Intel_Extreme_Masters/2026/Beijing", cache)

    def test_si_falla_el_ranking_igual_escribe_los_torneos(self):
        def names(year):
            raise urllib.error.HTTPError("https://api.github.com", 403, "rate limit", {}, None)

        self.gh.names = names
        with self.assertRaises(urllib.error.HTTPError):
            self.run_once()
        self.assertTrue((self.root / "data" / "esports" / "tournaments.json").exists())

    def test_github_404_es_un_anio_sin_carpeta(self):
        gh = esports_data.GitHub()
        gh._get = lambda url: (_ for _ in ()).throw(urllib.error.HTTPError(url, 404, "no", {}, None))
        self.assertEqual(gh.names(2027), [])
        gh._get = lambda url: (_ for _ in ()).throw(urllib.error.HTTPError(url, 403, "rate", {}, None))
        with self.assertRaises(urllib.error.HTTPError):
            gh.names(2026)

    def test_resuelve_nombres_por_redireccion(self):
        """Un nombre del ranking que no aparece en los torneos se busca en Liquipedia: vale la redirección ("1win" →
        "1w Team") sólo si la página es de un equipo. Lo resuelto queda guardado y no se vuelve a preguntar."""
        calls = []

        class Lp:
            def query(self, **params):
                calls.append(params["titles"])
                return {"query": {
                    "redirects": [{"from": "1win", "to": "1w Team"}],
                    "pages": {
                        "1": {"title": "1w Team", "categories": [{"title": "Category:Teams"}]},
                        "2": {"title": "Rooster", "categories": []},
                        "-1": {"title": "Sashi", "missing": ""},
                    },
                }}

        with tempfile.TemporaryDirectory() as d:
            cache = Path(d) / "names.json"
            got = esports_data.resolve_names(Lp(), ["1win", "Rooster", "Sashi"], cache, "2026-11-04")
            self.assertEqual(got, {"1win": "1w_Team"})
            esports_data.resolve_names(Lp(), ["1win", "Rooster", "Sashi"], cache, "2026-11-05")
            self.assertEqual(len(calls), 1)  # todo cacheado: lo que no es equipo se vuelve a mirar en una semana
            esports_data.resolve_names(Lp(), ["1win", "Rooster", "Sashi"], cache, "2026-11-12")
            self.assertEqual(calls[-1], "Rooster|Sashi")

    def test_cruza_el_vrs_con_liquipedia(self):
        self.assertEqual(esports_data.norm("Team Vitality"), esports_data.norm("Vitality"))
        self.assertEqual(esports_data.norm("BetBoom Team"), esports_data.norm("BETBOOM"))
        self.assertEqual(esports_data.norm("G2 Esports"), esports_data.norm("G2"))
        self.assertEqual(esports_data.norm("FaZe Clan"), esports_data.norm("FaZe"))
        self.assertEqual(esports_data.norm("DENDELE CS"), esports_data.norm("DENDELE"))


if __name__ == "__main__":
    unittest.main()
