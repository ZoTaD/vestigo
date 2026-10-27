"""Pruebas de `site_data` e `images`. Correr: python -m unittest discover -s games/warframe/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import images  # noqa: E402
import site_data  # noqa: E402


class TestSiteData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = site_data.build(write=False)

    def test_requiem_no_es_vault(self):
        reqs = [r for r in self.out["lists"]["relics"] if r["era"] == "Requiem"]
        self.assertTrue(reqs)
        self.assertFalse(any(r["vaulted"] for r in reqs))
        for r in reqs:
            self.assertFalse(self.out["fichas"]["relics"][r["slug"]]["vaulted"])

    def test_compat_de_mods_en_dos_idiomas(self):
        c = [m["compat"] for m in self.out["lists"]["mods"] if m["compat"]]
        self.assertTrue(c)
        self.assertTrue(all(isinstance(x, list) and len(x) == 2 for x in c))
        self.assertIn(["Whips", "Látigos"], c)

    def test_slugs_unicos_por_pestana(self):
        for tab, rows in self.out["lists"].items():
            for k in ("slug", "slugEs"):
                vals = [r[k] for r in rows]
                self.assertEqual(len(vals), len(set(vals)), (tab, k))

    def test_mismo_hash_que_el_sitio(self):
        self.assertEqual(site_data.shard("melon"), 28 % 32)

    def test_excalibur(self):
        f = self.out["fichas"]["arsenal"]["excalibur"]
        self.assertEqual(f["stats"]["armor"], 240)
        self.assertEqual(f["slugEs"], "excalibur")

    def test_dano_por_tipo(self):
        braton = self.out["fichas"]["arsenal"]["braton"]["stats"]["damage"]
        self.assertEqual(sorted(t for t, _ in braton), ["impact", "puncture", "slash"])

    def test_tipos_de_dano_fijados_con_tres_armas(self):
        # Posición 8 de Mara Detron (radiación), 3 de Ignis (calor) y 4 de Glaxion (frío): fijan DAMAGE_TYPES.
        self.assertEqual(len(site_data.DAMAGE_TYPES), 20)
        for slug, tipo in (("mara-detron", "radiation"), ("ignis", "heat"), ("glaxion", "cold")):
            tipos = [t for t, _ in self.out["fichas"]["arsenal"][slug]["stats"]["damage"]]
            self.assertIn(tipo, tipos, slug)

    def test_sin_fuente_no_inventa(self):
        sin = [p for f in self.out["fichas"]["arsenal"].values() for p in f["parts"] if not p["sources"]]
        self.assertTrue(sin)  # existen (planos de tienda) y quedan con sources == []

    def test_partes_conservan_el_tipo(self):
        ps = self.out["fichas"]["arsenal"]["excalibur"]["parts"]
        self.assertEqual(ps[0]["kind"], "blueprint")
        self.assertIn("part", {p["kind"] for p in ps})

    def test_cada_fila_tiene_ficha_e_icono(self):
        for tab, rows in self.out["lists"].items():
            for r in rows:
                self.assertIn(r["slug"], self.out["fichas"][tab])
                self.assertTrue((images.SMALL / f"{r['img']}.webp").exists(), r["img"])

    def test_el_arsenal_tiene_icono_grande(self):
        for r in self.out["lists"]["arsenal"]:
            self.assertTrue((images.LARGE / f"{r['img']}.webp").exists(), r["img"])

    def test_reliquia_con_cuatro_refinamientos(self):
        f = self.out["fichas"]["relics"]["lith-a1"]
        self.assertEqual(f["era"], "Lith")
        for r in f["rewards"]:
            self.assertEqual(len(r["chances"]), 4)
            self.assertIn(r["ref"], f["refs"])
        self.assertEqual(self.out["lists"]["relics"][0]["era"], "Lith")

    def test_mod_y_arcano_con_el_mismo_nombre_no_chocan(self):
        for tab in ("mods", "arsenal"):
            for r in self.out["lists"][tab]:
                self.assertTrue(r["slug"] and r["slugEs"])

    def test_recurso_con_planetas_y_usos(self):
        f = self.out["fichas"]["farming"]["neural-sensors"]
        self.assertEqual(f["planets"], [["Jupiter", "Júpiter"]])
        self.assertTrue(f["usedIn"])
        for ref in f["usedIn"]:
            self.assertIn(ref, f["refs"])

    def test_es_reparte_por_slug_espanol(self):
        es = self.out["es"]["arsenal"]
        self.assertEqual(es[site_data.shard("excalibur")]["excalibur"], "excalibur")

    def test_toda_fuente_de_reliquia_resuelve_en_refs(self):
        for tab, fichas in self.out["fichas"].items():
            for slug, f in fichas.items():
                srcs = list(f.get("sources", []))
                for p in f.get("parts", []):
                    srcs += p["sources"]
                for fu in srcs:
                    if fu["k"] == "relic":
                        self.assertIn(fu["relic"], f["refs"], (tab, slug, fu["relic"]))

    def test_desempate_de_slugs_por_tipo(self):
        for a, b, suf in (("mod", "arcane", "arcane"), ("warframe", "exalted", "exalted")):
            filas = [{"unique": f"/Lotus/A/{k}", "kind": k, "name": ["Same Name", "Mismo Nombre"]} for k in (a, b)]
            site_data._slugs(filas)
            self.assertEqual([f["slug"] for f in filas], ["same-name", f"same-name-{suf}"])
            self.assertEqual([f["slugEs"] for f in filas], ["mismo-nombre", f"mismo-nombre-{suf}"])


if __name__ == "__main__":
    unittest.main()
