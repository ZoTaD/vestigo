"""
Tests de la parte de Parches de `site.py` (2026-10-02): las páginas de versión (`patch_pages`), lo que cambió en cada
ficha (`ficha_changes` + `attach_changes`) y los nombres de los valores (`value_names`).

Todo sintético, sin el juego ni data/: la Crónica, el índice de fotos y los diffs se arman acá con la forma que escriben
`patches.py` y la Task 2. El diff 42.21 → 42.22 es el mismo que prueba test_patches.py (`EXPECTED_KINDS`), así que si
cambia la forma del diff, salta en los dos lados.

Uso (desde la raíz del worktree, con el resto de los tests de Python):
    python -m unittest discover -s games/zomboid/tools/tests -v
o sólo éste: python games/zomboid/tools/tests/test_site_patches.py -v
"""
import copy
import importlib.util
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from test_patches import EXPECTED_KINDS  # noqa: E402

# site.py por su ruta: `import site` daría el módulo de la biblioteca estándar (ver el docstring de site.py).
_spec = importlib.util.spec_from_file_location("zomboid_site", os.path.join(os.path.dirname(__file__), "..", "site.py"))
site = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(site)


def loc(en, es):
    return {"en": en, "es": es}


def chronicle_42_20():
    return {"slug": "42-20", "version": "42.20", "branch": "stable", "date": "2026-07-29",
            "title": loc("Build 42 goes stable", "Build 42 llega a estable"),
            "summary": loc("First stable.", "La primera estable."),
            "highlights": [loc("Map glow-up.", "Mapa renovado.")],
            "hotfixes": [{"version": "42.20.1", "date": "2026-08-05", "summary": loc("Lag fix.", "Menos lag."),
                          "sources": [{"kind": "steam", "url": "https://store.steampowered.com/news/app/108600/view/1",
                                       "gid": "1"}]}],
            "sources": [{"kind": "steam", "url": "https://store.steampowered.com/news/app/108600/view/2", "gid": "2"}],
            "updated": "2026-10-02"}


def chronicle_42_21(hotfix=False):
    e = {"slug": "42-21", "version": "42.21", "branch": "stable", "date": "2026-09-28", "unstableDate": "2026-09-23",
         "title": loc("Fewer duplicated zombies", "Menos zombis duplicados"),
         "summary": loc("Zombies stay.", "Los zombis se quedan."),
         "highlights": [loc("Trees.", "Árboles.")],
         "sources": [{"kind": "steam", "url": "https://store.steampowered.com/news/app/108600/view/3", "gid": "3"},
                     {"kind": "notes", "url": "https://theindiestone.com/forums/topic/101693-4221-unstable-released/"}],
         "updated": "2026-10-02"}
    if hotfix:
        e["hotfixes"] = [{"version": "42.21.1", "date": "2026-10-04", "summary": loc("Crash fix.", "Menos cierres."),
                          "sources": [{"kind": "steam", "url": "https://store.steampowered.com/news/app/108600/view/4",
                                       "gid": "4"}]}]
    return e


def snap(sid, version, build, day):
    return {"id": sid, "version": version, "build": build, "recordedAt": day}


NAMES = {"items": {"Base.Axe": loc("Axe", "Hacha"), "Base.Fork": loc("Fork", "Tenedor"),
                   "Base.Spoon": loc("Spoon", "Cuchara")},
         "recipes": {"MakeStake": loc("Make Stake", "Hacer estaca")},
         "traits": {"strong": loc("Strong", "Fuerte")},
         "skills": {"Axe": loc("Axe", "Hacha")},
         "moodles": {"Hungry": loc("Hungry", "Hambre")},
         "sandbox": {"WaterShutModifier": loc("Water Shutoff", "Corte de agua")}}


def diff_42_22():
    """El diff de test_patches.py (42.21 → 42.22), con la forma entera que escribe `patches.diff`."""
    kinds = copy.deepcopy(EXPECTED_KINDS)
    counts = {k: {"added": len(v["added"]), "removed": len(v["removed"]), "changed": len(v["changed"])}
              for k, v in kinds.items()}
    return {"from": "42.21", "to": "42.22", "kinds": kinds, "counts": counts, "names": copy.deepcopy(NAMES)}


def diff_42_23():
    """42.22 → 42.23: el hacha vuelve a cambiar (sólo el daño)."""
    kinds = {"items": {"added": [], "removed": [], "changed": {"Base.Axe": [{"f": "stats.maxDamage", "b": 2.2, "a": 2.4}]}}}
    return {"from": "42.22", "to": "42.23", "kinds": kinds,
            "counts": {"items": {"added": 0, "removed": 0, "changed": 1}},
            "names": {"items": {"Base.Axe": loc("Axe", "Hacha")}}}


RESOLVE = {("items", "Base.Axe"): "axe", ("items", "Base.Fork"): "fork", ("recipes", "MakeStake"): "make-stake",
           ("traits", "strong"): "strong", ("skills", "Axe"): "axe", ("moodles", "Hungry"): "hungry"}


def resolve(kind, gid):
    return RESOLVE.get((kind, gid))


LOOKUP = {"Base.Plank": loc("Plank", "Tablón"), "Base.TreeBranch2": loc("Tree Branch", "Rama"),
          "weak": loc("Weak", "Débil")}


def lookup(token):
    return LOOKUP.get(token)


def by_slug(files):
    return {p["slug"]: p for p in files["patches/index.json"]["patches"]}


class SoloCronicaYPrimeraFotoTest(unittest.TestCase):
    """El caso de hoy: la Crónica de la 42.20 (sin foto) y de la 42.21, y la primera foto (42.21), sin diff."""

    def setUp(self):
        self.files = site.patch_pages([chronicle_42_20(), chronicle_42_21()],
                                      [snap("42.21", "42.21", 25485521, "2026-10-01")], {},
                                      {"42.21": {"items": 2, "recipes": 1}}, resolve, lookup, current="42.21")

    def test_indice_de_la_mas_nueva_a_la_mas_vieja(self):
        idx = self.files["patches/index.json"]
        self.assertEqual(idx["current"], "42.21")
        self.assertEqual([p["slug"] for p in idx["patches"]], ["42-21", "42-20"])
        self.assertEqual(sorted(self.files), ["patches/42-20.json", "patches/42-21.json", "patches/index.json"])

    def test_la_42_21_tiene_foto_y_cuantos_hay(self):
        p = self.files["patches/42-21.json"]
        self.assertTrue(p["recorded"])
        self.assertEqual(p["first"], {"items": 2, "recipes": 1})
        self.assertNotIn("diff", p)
        self.assertNotIn("counts", p)
        self.assertEqual((p["date"], p["branch"], p["unstableDate"]), ("2026-09-28", "stable", "2026-09-23"))
        self.assertEqual(p["names"], {})
        # Las fuentes van sin el gid de Steam (sólo lo usa `patches.py check`).
        self.assertEqual(p["sources"][0], {"kind": "steam", "url": "https://store.steampowered.com/news/app/108600/view/3"})

    def test_la_42_20_sale_de_la_cronica(self):
        p = self.files["patches/42-20.json"]
        self.assertFalse(p["recorded"])
        self.assertNotIn("first", p)
        self.assertEqual(p["summary"], loc("First stable.", "La primera estable."))
        self.assertEqual(p["highlights"], [loc("Map glow-up.", "Mapa renovado.")])
        self.assertEqual([s["url"] for s in p["sources"]], ["https://store.steampowered.com/news/app/108600/view/2"])
        self.assertEqual(p["hotfixes"], 1)
        # El hotfix 42.20.1 no tiene foto: va sin slug.
        self.assertEqual(p["hotfixList"], [{"version": "42.20.1", "date": "2026-08-05",
                                            "summary": loc("Lag fix.", "Menos lag."),
                                            "sources": [{"kind": "steam",
                                                         "url": "https://store.steampowered.com/news/app/108600/view/1"}]}])

    def test_el_indice_lleva_solo_la_cabecera(self):
        meta = by_slug(self.files)["42-21"]
        for key in ("highlights", "sources", "hotfixList", "diff", "names"):
            self.assertNotIn(key, meta)
        self.assertEqual(meta["title"], loc("Fewer duplicated zombies", "Menos zombis duplicados"))
        page = self.files["patches/42-21.json"]
        self.assertEqual({k: page[k] for k in meta}, meta)


class DiffSinCronicaTest(unittest.TestCase):
    def setUp(self):
        self.files = site.patch_pages(
            [chronicle_42_21()],
            [snap("42.21", "42.21", 1, "2026-10-01"), snap("42.22", "42.22", 2, "2026-10-20")],
            {"42-22": diff_42_22()}, {"42.21": {"items": 2}}, resolve, lookup, current="42.22")
        self.page = self.files["patches/42-22.json"]

    def test_version_y_fecha_de_la_foto(self):
        self.assertEqual(self.page["version"], "42.22")
        self.assertEqual(self.page["date"], "2026-10-20")
        self.assertTrue(self.page["recorded"])
        self.assertNotIn("title", self.page)
        self.assertNotIn("first", self.page)
        self.assertEqual([p["slug"] for p in self.files["patches/index.json"]["patches"]], ["42-22", "42-21"])

    def test_diff(self):
        d = self.page["diff"]
        self.assertEqual((d["from"], d["fromSlug"]), ("42.21", "42-21"))
        items = d["kinds"]["items"]
        self.assertEqual(items["added"], [{"id": "Base.Fork", "n": {"en": "Fork", "es": "Tenedor"}, "slug": "fork"}])
        self.assertEqual(items["removed"], [{"id": "Base.Spoon", "n": {"en": "Spoon", "es": "Cuchara"}}])
        self.assertNotIn("slug", items["removed"][0])
        ch = items["changed"][0]
        self.assertEqual((ch["id"], ch["slug"]), ("Base.Axe", "axe"))
        self.assertEqual(ch["fields"], [{"f": "stats.maxDamage", "b": 2, "a": 2.2}, {"f": "tags", "add": ["base:fireaxe"]}])
        # La opción de sandbox no tiene ficha: nunca lleva slug.
        self.assertNotIn("slug", d["kinds"]["sandbox"]["changed"][0])
        self.assertEqual(self.page["counts"]["items"], {"added": 1, "removed": 1, "changed": 1})

    def test_names_de_los_valores(self):
        self.assertEqual(self.page["names"], {"Base.Plank": loc("Plank", "Tablón"),
                                              "Base.TreeBranch2": loc("Tree Branch", "Rama"),
                                              "weak": loc("Weak", "Débil")})

    def test_la_42_21_es_la_primera(self):
        p = self.files["patches/42-21.json"]
        self.assertEqual(p["first"], {"items": 2})
        self.assertNotIn("diff", p)


def diff_42_24():
    """42.23 → 42.24: sólo una habilidad y un moodle (ni objetos ni recetas)."""
    kinds = {"skills": {"added": [], "removed": [], "changed": {"Axe": [{"f": "xp.0", "b": 75, "a": 80}]}},
             "moodles": {"added": [], "removed": [], "changed": {"Hungry": [{"f": "levels.1.desc", "b": "a", "a": "b"}]}}}
    return {"from": "42.23", "to": "42.24", "kinds": kinds,
            "counts": {"skills": {"added": 0, "removed": 0, "changed": 1},
                       "moodles": {"added": 0, "removed": 0, "changed": 1}},
            "names": {"skills": {"Axe": loc("Axe", "Hacha")}, "moodles": {"Hungry": loc("Hungry", "Hambre")}}}


def newest_first():
    return [({"slug": "42-23", "version": "42.23", "date": "2026-11-10"}, diff_42_23()),
            ({"slug": "42-22", "version": "42.22", "date": "2026-10-20"}, diff_42_22())]


class FichaChangesTest(unittest.TestCase):
    def test_de_la_mas_nueva_a_la_mas_vieja(self):
        ch = site.ficha_changes(newest_first(), resolve, lookup)
        axe = ch[("items", "axe")]
        self.assertEqual([c["patch"] for c in axe], ["42-23", "42-22"])
        self.assertEqual(axe[0], {"patch": "42-23", "version": "42.23", "date": "2026-11-10", "kind": "changed",
                                  "gameId": "Base.Axe", "fields": [{"f": "stats.maxDamage", "b": 2.2, "a": 2.4}]})

    def test_a_lo_sumo_n_comparaciones(self):
        ch = site.ficha_changes(newest_first(), resolve, lookup, n=1)
        self.assertEqual([c["patch"] for c in ch[("items", "axe")]], ["42-23"])
        self.assertNotIn(("items", "fork"), ch)

    def test_agregado_y_quitado(self):
        ch = site.ficha_changes(newest_first(), resolve, lookup)
        self.assertEqual([c["kind"] for c in ch[("items", "fork")]], ["added"])
        self.assertNotIn("fields", ch[("items", "fork")][0])
        self.assertFalse(any(c.get("gameId") == "Base.Spoon" for v in ch.values() for c in v))

    def test_otros_tipos_y_sus_nombres(self):
        ch = site.ficha_changes(newest_first(), resolve, lookup)
        stake = ch[("recipes", "make-stake")][0]
        self.assertNotIn("gameId", stake)  # sólo los objetos lo llevan
        self.assertEqual(stake["names"], {"Base.Plank": loc("Plank", "Tablón"),
                                          "Base.TreeBranch2": loc("Tree Branch", "Rama")})
        self.assertEqual(ch[("traits", "strong")][0]["names"], {"weak": loc("Weak", "Débil")})
        # Habilidades y moodles van a su ficha por `id` (sin gameId); la opción de sandbox no tiene ficha.
        self.assertEqual(ch[("skills", "axe")], [{"patch": "42-22", "version": "42.22", "date": "2026-10-20",
                                                  "kind": "changed", "fields": [{"f": "xp.3", "b": 750, "a": 800}]}])
        self.assertEqual(ch[("moodles", "hungry")][0]["fields"],
                         [{"f": "levels.1.name", "b": "Peckish", "a": "Slightly Hungry"}])
        self.assertEqual(sorted(ch), [("items", "axe"), ("items", "fork"), ("moodles", "hungry"),
                                      ("recipes", "make-stake"), ("skills", "axe"), ("traits", "strong")])

    def test_la_ventana_es_de_comparaciones_y_no_por_ficha(self):
        # Tres comparaciones; el tenedor sólo aparece en la más vieja (42-22). Con n=2 la ventana son la 42-24 y la
        # 42-23: el tenedor queda afuera aunque sea su único cambio (una ventana por ficha lo mostraría), y el hacha
        # trae sólo la 42-23.
        diffs = [({"slug": "42-24", "version": "42.24", "date": "2026-12-01"}, diff_42_24())] + newest_first()
        ch = site.ficha_changes(diffs, resolve, lookup, n=2)
        self.assertNotIn(("items", "fork"), ch)
        self.assertNotIn(("recipes", "make-stake"), ch)
        self.assertEqual([c["patch"] for c in ch[("items", "axe")]], ["42-23"])
        self.assertEqual([c["patch"] for c in ch[("skills", "axe")]], ["42-24"])
        self.assertEqual([c["patch"] for c in ch[("moodles", "hungry")]], ["42-24"])
        # Con las tres, cada ficha junta las suyas de la más nueva a la más vieja.
        ch = site.ficha_changes(diffs, resolve, lookup, n=3)
        self.assertEqual([c["patch"] for c in ch[("skills", "axe")]], ["42-24", "42-22"])
        self.assertEqual([c["patch"] for c in ch[("items", "fork")]], ["42-22"])


class AttachChangesTest(unittest.TestCase):
    def test_en_su_ficha_y_gameid_solo_con_variantes(self):
        axe = {"id": "axe", "variants": [{"gameId": "Base.Axe"}]}
        crowbar = {"id": "crowbar", "variants": [{"gameId": "Base.Crowbar"}, {"gameId": "Base.CrowbarForged"}]}
        files = {"traits.json": [{"id": "strong"}, {"id": "weak"}],
                 "skills.json": [], "professions.json": [], "moodles.json": []}
        for f in (axe, crowbar):
            files.setdefault(f"items/{site.shard(f['id'])}.json", {})[f["id"]] = f
        changes = {("items", "axe"): [{"patch": "42-22", "kind": "changed", "gameId": "Base.Axe", "fields": []}],
                   ("items", "crowbar"): [{"patch": "42-22", "kind": "added", "gameId": "Base.CrowbarForged"}],
                   ("traits", "strong"): [{"patch": "42-22", "kind": "changed", "fields": []}]}
        n = site.attach_changes(files, changes)
        self.assertEqual(n, 3)
        self.assertEqual(axe["changes"], [{"patch": "42-22", "kind": "changed", "fields": []}])
        self.assertEqual(crowbar["changes"][0]["gameId"], "Base.CrowbarForged")
        self.assertIn("changes", files["traits.json"][0])
        self.assertNotIn("changes", files["traits.json"][1])


class ValueNamesTest(unittest.TestCase):
    def test_renglones_de_receta_y_listas(self):
        fields = (EXPECTED_KINDS["recipes"]["changed"]["MakeStake"]
                  + EXPECTED_KINDS["traits"]["changed"]["strong"])
        self.assertEqual(site.value_names(fields, lookup), {"Base.Plank": loc("Plank", "Tablón"),
                                                           "Base.TreeBranch2": loc("Tree Branch", "Rama"),
                                                           "weak": loc("Weak", "Débil")})

    def test_keep_y_numeros(self):
        fields = [{"f": "inputs", "add": ["2.5× Base.Plank keep"]}, {"f": "time", "b": 50, "a": 40}]
        self.assertEqual(site.value_names(fields, lookup), {"Base.Plank": loc("Plank", "Tablón")})


class HotfixTest(unittest.TestCase):
    def setUp(self):
        self.files = site.patch_pages(
            [chronicle_42_21(hotfix=True)],
            [snap("42.21", "42.21", 1, "2026-10-01"), snap("42.21.1", "42.21.1", 2, "2026-10-05")],
            {}, {"42.21": {"items": 2}}, resolve, lookup, current="42.21.1")

    def test_la_pagina_del_hotfix(self):
        p = self.files["patches/42-21-1.json"]
        self.assertEqual(p["hotfixOf"], "42-21")
        self.assertEqual(p["version"], "42.21.1")
        self.assertEqual(p["date"], "2026-10-04")
        self.assertEqual(p["summary"], loc("Crash fix.", "Menos cierres."))
        self.assertEqual([s["url"] for s in p["sources"]], ["https://store.steampowered.com/news/app/108600/view/4"])
        self.assertEqual(p["hotfixes"], 0)

    def test_el_padre_la_enlaza(self):
        p = self.files["patches/42-21.json"]
        self.assertEqual(p["hotfixList"][0]["slug"], "42-21-1")
        self.assertEqual([x["slug"] for x in self.files["patches/index.json"]["patches"]], ["42-21-1", "42-21"])


class SinCambiosDeDatosTest(unittest.TestCase):
    """
    La 42.22 sale sin cambios de datos: patches.py no graba foto y la anota en el `seen` de la 42.21. Su página tiene
    que decir que la comparamos (`recorded`), sin `diff` ni `first`: "no cambió ningún dato". `recorded: false` queda
    para lo anterior a la primera foto (la 42.20).
    """

    def setUp(self):
        c22 = {**chronicle_42_21(), "slug": "42-22", "version": "42.22", "date": "2026-10-20"}
        c22.pop("unstableDate")
        first = {**snap("42.21", "42.21", 1, "2026-10-01"), "seen": [{"version": "42.22", "build": 9}]}
        self.files = site.patch_pages([chronicle_42_20(), chronicle_42_21(), c22], [first], {},
                                      {"42.21": {"items": 2}}, resolve, lookup, current="42.22")

    def test_comparada_sin_cambios(self):
        p = self.files["patches/42-22.json"]
        self.assertTrue(p["recorded"])
        for key in ("diff", "first", "counts"):
            self.assertNotIn(key, p)
        self.assertEqual(p["names"], {})

    def test_las_otras_no_cambian(self):
        self.assertEqual(self.files["patches/42-21.json"]["first"], {"items": 2})
        self.assertTrue(self.files["patches/42-21.json"]["recorded"])
        self.assertFalse(self.files["patches/42-20.json"]["recorded"])
        self.assertEqual([p["slug"] for p in self.files["patches/index.json"]["patches"]], ["42-22", "42-21", "42-20"])


class SinCronicaConBuildTest(unittest.TestCase):
    def test_version_con_build(self):
        files = site.patch_pages([], [snap("42.21", "42.21", 1, "2026-10-01"), snap("42.21-b7", "42.21", 7, "2026-10-01")],
                                 {}, {}, resolve, lookup)
        self.assertEqual(files["patches/42-21-b7.json"]["version"], "42.21 (build 7)")
        # Sin `current`, la versión de la última foto. Misma fecha: va primero la de número más alto.
        self.assertEqual(files["patches/index.json"]["current"], "42.21")
        self.assertEqual([p["slug"] for p in files["patches/index.json"]["patches"]], ["42-21-b7", "42-21"])


if __name__ == "__main__":
    unittest.main()
