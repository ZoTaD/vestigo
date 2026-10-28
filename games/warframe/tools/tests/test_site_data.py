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

    def test_mods_sin_nombres_repetidos(self):
        """Las variantes Beginner/Intermediate/Expert/Nemesis/Tau no se equipan: queda la de la wiki."""
        nombres = [m["name"][0] for m in self.out["lists"]["mods"]]
        self.assertEqual(len(nombres), len(set(nombres)))
        por_slug = {m["slug"]: m for m in self.out["lists"]["mods"]}
        self.assertEqual(por_slug["flawed-ammo-drum"]["name"], ["Flawed Ammo Drum", "Tambor de munición (defectuoso)"])
        self.assertEqual(por_slug["ammo-drum"]["name"][0], "Ammo Drum")
        self.assertEqual(por_slug["maglev"]["name"][0], "Maglev")  # en el export sólo está la Beginner

    def test_mods_movidos_van_a_una_ficha(self):
        mv = self.out["modsMoved"]
        self.assertEqual(mv["en"]["ammo-drum-weaponammomaxmodexpert"], "ammo-drum")
        self.assertEqual(mv["en"]["ammo-drum-mod"], "flawed-ammo-drum")
        self.assertEqual(mv["es"]["tambor-de-municion-mod"], "tambor-de-municion-defectuoso")
        self.assertEqual(mv["en"]["arcane-steadfast-nocostcastchanceability3listener"], "arcane-steadfast")
        for idioma, campo in (("en", "slug"), ("es", "slugEs")):
            vivos = {m[campo] for m in self.out["lists"]["mods"]}
            self.assertTrue(set(mv[idioma].values()) <= vivos, idioma)
            self.assertFalse(set(mv[idioma]) & vivos, idioma)

    def test_el_armador_sigue_sin_flawed(self):
        nombres = {m["name"][0] for f, c in self.out["builder"].items() if f.startswith("builder/mods-") for m in c["mods"]}
        self.assertIn("Ammo Drum", nombres)
        self.assertIn("Maglev", nombres)
        self.assertFalse([n for n in nombres if n.startswith("Flawed ")])

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
                if tab in site_data.TABS:
                    self.assertIn(r["slug"], self.out["fichas"][tab])
                else:  # Maestría y Prime Vault enlazan a la ficha del Arsenal
                    self.assertIn(r["slug"], self.out["fichas"]["arsenal"])
                if tab != "star-chart":  # los nodos no tienen ícono: el sitio dibuja los planetas
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

    def test_mapa_269_nodos_con_tipo_y_faccion(self):
        L = self.out["lists"]["star-chart"]
        self.assertEqual(len(L), 269)
        self.assertTrue(all(n["type"] in site_data.MISSION_TYPES.values() for n in L))
        self.assertTrue(all(n["faction"] in site_data.FACTIONS.values() for n in L))
        self.assertEqual(len({n["slug"] for n in L}), 269)
        self.assertEqual(len({n["slugEs"] for n in L}), 269)

    def test_nodo_hydron(self):
        f = self.out["fichas"]["star-chart"]["hydron"]
        self.assertEqual((f["planet"][0], f["type"], f["faction"]), ("Sedna", "Defense", "Grineer"))
        self.assertEqual([r["rot"] for r in f["rewards"]], ["A", "B", "C"])
        self.assertTrue(all(it["ref"] in f["refs"] for r in f["rewards"] for it in r["items"]))

    def test_nodo_sin_tabla(self):  # Mercury/M Prime es Exterminio: sin recompensas propias
        f = self.out["fichas"]["star-chart"]["m-prime"]
        self.assertEqual(f["rewards"], [])

    def test_fuentes_de_mision_enlazan_al_nodo(self):
        fi = next(fi for fi in self.out["fichas"]["relics"].values() if any(s.get("node") for s in fi["sources"]))
        for s in fi["sources"]:
            if s.get("node"):
                self.assertEqual(fi["refs"][s["node"]]["tab"], "star-chart")

    def test_maestria(self):
        M = {m["slug"]: m for m in self.out["lists"]["mastery"]}
        self.assertEqual((M["excalibur"]["rank"], M["excalibur"]["xp"]), (30, 6000))
        self.assertEqual((M["braton"]["rank"], M["braton"]["xp"]), (30, 3000))
        self.assertEqual((M["kuva-brakk"]["rank"], M["kuva-brakk"]["xp"]), (40, 4000))
        self.assertEqual((M["voidrig"]["kind"], M["voidrig"]["xp"]), ("necramech", 8000))
        self.assertFalse(any(m["kind"] == "exalted" for m in M.values()))

    def test_prime_vault(self):
        V = {v["slug"]: v["status"] for v in self.out["lists"]["prime-vault"]}
        self.assertEqual(V["excalibur-prime"], "norelics")
        self.assertTrue(set(V.values()) >= {"available", "vaulted"})
        self.assertFalse(any(v["kind"] == "exalted" for v in self.out["lists"]["prime-vault"]))
        self.assertNotIn("exalted-prime-blade", V)

    def test_historial_vault(self):
        prev = [{"slug": "a", "status": "available"}, {"slug": "b", "status": "vaulted"}]
        new = [{"slug": "a", "status": "vaulted"}, {"slug": "b", "status": "vaulted"},
               {"slug": "c", "status": "available"}]
        h = site_data.vault_history(prev, new, [{"date": "2026-10-01", "slug": "z", "from": None, "to": "vaulted"}],
                                    "2026-10-27")
        self.assertEqual(h[:2], [{"date": "2026-10-27", "slug": "a", "from": "available", "to": "vaulted"},
                                 {"date": "2026-10-27", "slug": "c", "from": None, "to": "available"}])
        self.assertEqual(h[2]["slug"], "z")
        self.assertEqual(site_data.vault_history(None, new, [], "2026-10-27"), [])  # primera corrida: sin eventos

    def test_desempate_de_slugs_por_tipo(self):
        for a, b, suf in (("mod", "arcane", "arcane"), ("warframe", "exalted", "exalted")):
            filas = [{"unique": f"/Lotus/A/{k}", "kind": k, "name": ["Same Name", "Mismo Nombre"]} for k in (a, b)]
            site_data._slugs(filas)
            self.assertEqual([f["slug"] for f in filas], ["same-name", f"same-name-{suf}"])
            self.assertEqual([f["slugEs"] for f in filas], ["mismo-nombre", f"mismo-nombre-{suf}"])


if __name__ == "__main__":
    unittest.main()
