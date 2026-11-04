"""
Pruebas de los datos de CoH3 sobre lo crudo real (`games/coh3/raw/`, lo baja fetch.py) y lo generado en `data/`.
Correr (pytest o unittest, sin dependencias):

    python -I -X utf8 -m unittest discover -s games/coh3/tools/tests -p "test_*.py"
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import coh3  # noqa: E402
import site_data  # noqa: E402

TAG = coh3.tags_raw()[0]


class TestShard(unittest.TestCase):
    def test_igual_que_pzShardOf(self):
        # Valores de `pzShardOf(slug, 32)` de site/src/zomboid/shard.ts (FNV-1a 32 bits).
        self.assertEqual(coh3.fnv1a(""), 0x811C9DC5)
        self.assertEqual(coh3.fnv1a("a"), 0xE40C292C)
        self.assertEqual(coh3.shard("a"), 0xE40C292C % 32)
        self.assertTrue(all(0 <= coh3.shard(s) < 32 for s in ("riflemen_us", "panzer_iv_ger", "ñandú")))


class TestExplorador(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = site_data.build_explorer(TAG)
        cls.u = {u["slug"]: u for u in cls.d["units"]}
        cls.w = {w["slug"]: w for w in cls.d["weapons"]}
        cls.b = {b["slug"]: b for b in cls.d["battlegroups"]}

    def test_panzer_iv(self):
        p = self.u["panzer_iv_ger"]
        self.assertEqual((p["hp"], p["armor"]), (720, [170, 105, 70]))
        self.assertEqual(p["faction"], "german")
        self.assertEqual(p["name"]["en"], "Panzer IV Medium Tank")
        self.assertEqual(p["name"]["es"], "Tanque medio Panzer IV")
        self.assertEqual((p["cost"]["mp"], p["cost"]["fu"]), (360, 100))

    def test_tiger(self):
        t = self.u["tiger_ger"]
        self.assertEqual((t["hp"], t["armor"]), (1200, [380, 210, 80]))

    def test_stug(self):
        s = self.u["stug_iii_ger"]
        self.assertEqual((s["hp"], s["armor"]), (600, [250, 150, 90]))

    def test_cañon_at_57(self):
        w = self.w["57mm_at_gun_us"]
        self.assertEqual(w["pen"], [300, 150, 120])
        self.assertEqual(w["dist"], [15, 35, 60])
        self.assertIn("at_gun_57mm_us", w["usedBy"])
        at = self.u["at_gun_57mm_us"]
        self.assertIn("57mm_at_gun_us", [x["slug"] for x in at["weapons"]])

    def test_fusileros(self):
        r = self.u["riflemen_us"]
        # 6 soldados de 45: 270 de mano de obra; población 2 del pelotón + 6.
        self.assertEqual((r["cost"]["mp"], r["cost"]["pop"], r["models"]), (270, 8, 6))
        self.assertEqual(r["armor"], [1, 1, 1])
        self.assertIsNone(r["bg"])
        self.assertIn("barracks_us", r["builtIn"])
        self.assertTrue(r["vet"] and all(v["xp"] > 0 for v in r["vet"]))

    def test_facciones_y_battlegroups(self):
        for f in coh3.FACTIONS:
            self.assertGreater(sum(u["faction"] == f for u in self.d["units"]), 25, f)
            self.assertGreaterEqual(sum(b["faction"] == f for b in self.d["battlegroups"]), 7, f)
        self.assertEqual(self.u["panther_ger"]["bg"], "mechanized")
        self.assertEqual(self.u["paratrooper_us"]["bg"], "airborne")
        mech = self.b["mechanized"]
        self.assertEqual(mech["name"]["en"], "Mechanized Battlegroup")
        self.assertEqual(len(mech["branches"]), 2)
        self.assertTrue(any("panther_ger" in u.get("unlocks", []) for br in mech["branches"] for u in br["upgrades"]))

    def test_sin_campaña(self):
        # Los británicos de campaña (raza `british`) no entran si hay uno de multijugador con el mismo nombre.
        self.assertNotIn("churchill_black_prince_uk", self.u)
        self.assertNotIn("tommy_uk", self.u)
        self.assertTrue(all("hoff" not in s for s in self.u))

    def test_extra_units(self):
        # Los que nada enlaza en coh3-data, sumados desde extra_units.json.
        p = self.u["panzer_iv_ak"]
        self.assertEqual((p["faction"], p["hp"], p["armor"]), ("dak", 720, [170, 105, 70]))
        self.assertEqual((p["cost"]["mp"], p["cost"]["fu"]), (380, 90))
        g = self.u["goliath_ak"]
        self.assertEqual((g["faction"], g["name"]["en"]), ("dak", "Goliath Demolition Vehicle"))
        a = self.u["at_gun_17pdr_mobile_africa_uk"]
        self.assertEqual((a["faction"], a["name"]["en"], a["hp"]), ("british", "17-pounder Anti-tank Gun Team", 600))
        self.assertTrue(a["weapons"])
        self.assertEqual(self.u["hmg_50cal_us"]["faction"], "american")
        self.assertEqual(self.u["panzer_iii_75mm_ak"]["name"]["en"], "Panzer III N Medium Tank")
        # El battlegroup sale de la mejora con el mismo nombre o ícono.
        self.assertEqual(self.u["truck_2_5_cargo_ger"]["bg"], "breakthrough")
        self.assertEqual(self.u["partisan_tunnel_main_us"]["bg"], "partisans")
        self.assertTrue(any("truck_2_5_cargo_ger" in u.get("unlocks", [])
                            for br in self.b["breakthrough"]["branches"] for u in br["upgrades"]))

    def test_textos_en_dos_idiomas(self):
        for u in self.d["units"]:
            self.assertTrue(u["name"]["en"] and u["name"]["es"], u["slug"])

    def test_slugs_unicos(self):
        self.assertEqual(len(self.u), len(self.d["units"]))
        self.assertEqual(len(self.w), len(self.d["weapons"]))


class TestSalida(unittest.TestCase):
    """Lo escrito en `data/` (correr antes site_data.py)."""

    def test_fichas_en_su_shard(self):
        for tab in ("units", "weapons", "battlegroups"):
            lista = json.loads((coh3.DATA / tab / "list.json").read_text(encoding="utf-8"))
            for fila in lista:
                parte = json.loads((coh3.DATA / tab / "f" / f"{coh3.shard(fila['slug']):02d}.json").read_text(encoding="utf-8"))
                self.assertIn(fila["slug"], parte)

    def test_tamaños(self):
        for f in coh3.DATA.rglob("*.json"):
            self.assertLess(f.stat().st_size, 400_000, f)

    def test_meta(self):
        m = json.loads((coh3.DATA / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(m["tag"], TAG)
        lista = json.loads((coh3.DATA / "units" / "list.json").read_text(encoding="utf-8"))
        self.assertEqual(m["counts"]["units"], len(lista))
        self.assertGreater(m["counts"]["maps"], 30)

    def test_parches(self):
        idx = json.loads((coh3.DATA / "patches" / "index.json").read_text(encoding="utf-8"))
        for p in idx:
            d = json.loads((coh3.DATA / "patches" / f"{p['tag']}.json").read_text(encoding="utf-8"))
            for c in d["units"] + d["weapons"]:
                self.assertIn(c["status"], ("new", "changed"))
                for ch in c["changes"]:
                    self.assertNotEqual(ch["before"], ch["after"])

    def test_sin_explicar_de_donde_salen(self):
        for f in coh3.DATA.rglob("*.json"):
            t = f.read_text(encoding="utf-8").lower()
            self.assertNotIn("archivos del juego", t)
            self.assertNotIn("game files", t)


class TestFormato(unittest.TestCase):
    def test_formatter(self):
        loc = site_data.Loc(TAG)
        fmt = {"template_reference": {"value": "ui_text_formatter"}, "formatter": {"locstring": {"value": "11265170"}},
               "formatter_arguments": [{"locstring_value": {"locstring": {"value": "11265779"}}},
                                       {"int_value": 20.0}]}
        self.assertEqual(loc.fmt(fmt), {"en": "Medium Tank / 20", "es": "Tanque medio / 20"})


if __name__ == "__main__":
    unittest.main()
