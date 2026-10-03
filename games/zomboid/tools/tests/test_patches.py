"""
Tests de `patches.py` (2026-10-01): la foto por versión, el diff entre dos fotos, el corte por cambio masivo y cómo se
guardan (`record`). Desde el 2026-10-02 también la Crónica: los títulos de Steam, los borradores, el control de copia y
`check`, con anuncios sintéticos (sin red); el último lee las entradas de verdad si existe `chronicle/`.

Casi todo corre sobre un juego de datos sintético chico (`files_old` / `files_new`), armado con la misma forma que los
JSON de `extract.py`: así el diff esperado se puede escribir a mano y comparar entero. El último test lee los datos de
verdad (`games/zomboid/data`) y se saltea si no están: fija las cantidades de la 42.21 y que la foto comprimida siga
siendo chica. Si un parche mueve esas cantidades, se revisa primero qué cambió y recién después se toca el número.

Uso (desde la raíz del worktree, con el resto de los tests de Python):
    python -m unittest discover -s games/zomboid/tools/tests -v
o sólo éste: python games/zomboid/tools/tests/test_patches.py -v
"""
import copy
import glob
import gzip
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from extract import DATA  # noqa: E402
import patches  # noqa: E402


def files_old():
    return {
        "items/weapon.json": [
            {"id": "Base.Axe", "name": {"en": "Axe", "es": "Hacha"}, "type": "weapon", "displayCategory": "ToolWeapon",
             "icon": "Axe", "weight": 3, "tags": ["base:choptree", "base:axe"],
             "stats": {"minDamage": 0.8, "maxDamage": 2, "categories": ["axe"], "twoHanded": True,
                       "bodyLocationName": {"en": "Hands", "es": "Manos"}}},
            {"id": "Base.Spoon", "name": {"en": "Spoon", "es": "Cuchara"}, "type": "weapon",
             "displayCategory": "Cooking", "icon": "Spoon", "weight": 0.1, "tags": [], "stats": {}},
        ],
        "recipes.json": {"recipes": [
            {"id": "MakeStake", "kind": "craft", "name": {"en": "Make Stake", "es": "Hacer estaca"},
             "category": "Carpentry", "time": 50, "skills": {"Woodwork": 1}, "xp": {"Woodwork": 5},
             "inputs": [{"count": 1, "items": ["Base.TreeBranch2", "Base.Plank"], "mode": "destroy"},
                        {"count": 1, "tags": ["base:sharpknife"], "mode": "keep", "flags": ["MayDegradeLight"]}],
             "outputs": [{"count": 1, "item": "Base.Stake"}]}]},
        "traits.json": [{"id": "strong", "name": {"en": "Strong", "es": "Fuerte"},
                         "desc": {"en": "Extra knockback", "es": "Más empuje"}, "cost": 10, "professionOnly": False,
                         "disabledInMultiplayer": False, "xpBoosts": {"Strength": 4}, "recipes": [],
                         "grantedTraits": [], "exclusive": ["feeble"], "icon": "trait_strong"}],
        "professions.json": [{"id": "burglar", "name": {"en": "Burglar", "es": "Ladrón"}, "desc": None, "cost": -6,
                              "xpBoosts": {"Nimble": 2}, "traits": ["burglar"], "recipes": ["MakeShiv"], "icon": "p"}],
        "skills.json": {"Axe": {"en": "Axe", "es": "Hacha", "cat": {"id": "Combat", "en": "Combat", "es": "Combate"},
                                "xp": [75, 150, 300, 750]}},
        "moodles.json": [{"id": "Hungry", "icon": "Moodle_Icon_Hungry", "levels": [
            {"level": 1, "name": {"en": "Peckish", "es": "Con apetito"}, "desc": {"en": "a", "es": "a"}}]}],
        "server.json": {"options": [
            {"key": "Zombies", "type": "enum", "default": 4, "values": [{"en": str(i), "es": str(i)} for i in range(6)],
             "name": {"en": "Zombie Count", "es": "Cantidad de zombis"}, "page": "Zombie"},
            {"key": "WaterShutModifier", "type": "int", "default": 14, "min": -1, "max": 2147483647,
             "name": {"en": "Water Shutoff", "es": "Corte de agua"}, "page": "WorldOptions"}]},
    }


def files_new():
    f = copy.deepcopy(files_old())
    axe, spoon = f["items/weapon.json"]
    axe["stats"]["maxDamage"] = 2.2
    axe["tags"].append("base:fireaxe")
    axe["stats"]["bodyLocationName"]["es"] = "Mano"          # sólo traducción: no es un cambio
    f["items/weapon.json"] = [axe, {"id": "Base.Fork", "name": {"en": "Fork", "es": "Tenedor"}, "type": "weapon",
                                    "displayCategory": "Cooking", "icon": "Fork", "weight": 0.1, "tags": [], "stats": {}}]
    stake = f["recipes.json"]["recipes"][0]
    stake["time"] = 40
    stake["inputs"][0]["items"] = ["Base.TreeBranch2"]
    f["traits.json"][0]["cost"] = 8
    f["traits.json"][0]["exclusive"].append("weak")
    f["skills.json"]["Axe"]["xp"][3] = 800
    f["moodles.json"][0]["levels"][0]["name"]["en"] = "Slightly Hungry"
    f["server.json"]["options"][1]["default"] = 30
    return f


def many(n, foo):
    """`n` objetos sintéticos con `stats.foo = foo`: el caso del cambio masivo (un extractor que normaliza distinto)."""
    return {"items/misc.json": [{"id": f"Base.X{i}", "name": {"en": f"X{i}", "es": f"X{i}"}, "type": "misc",
                                 "displayCategory": "Junk", "weight": 1, "tags": [], "stats": {"foo": foo}}
                                for i in range(n)]}


EXPECTED_KINDS = {
    "items": {"added": ["Base.Fork"], "removed": ["Base.Spoon"],
              "changed": {"Base.Axe": [{"f": "stats.maxDamage", "b": 2, "a": 2.2}, {"f": "tags", "add": ["base:fireaxe"]}]}},
    "recipes": {"added": [], "removed": [], "changed": {"MakeStake": [
        {"f": "inputs", "add": ["1× Base.TreeBranch2"], "rem": ["1× Base.Plank|Base.TreeBranch2"]},
        {"f": "time", "b": 50, "a": 40}]}},
    "traits": {"added": [], "removed": [], "changed": {"strong": [{"f": "cost", "b": 10, "a": 8},
                                                                 {"f": "exclusive", "add": ["weak"]}]}},
    "skills": {"added": [], "removed": [], "changed": {"Axe": [{"f": "xp.3", "b": 750, "a": 800}]}},
    "moodles": {"added": [], "removed": [], "changed": {"Hungry": [{"f": "levels.1.name", "b": "Peckish",
                                                                    "a": "Slightly Hungry"}]}},
    "sandbox": {"added": [], "removed": [], "changed": {"WaterShutModifier": [{"f": "default", "b": 14, "a": 30}]}},
}


def tree(root):
    """Todo lo que hay en `root`: ruta relativa → bytes. Para ver que un corte no dejó nada escrito."""
    out = {}
    for path in glob.glob(os.path.join(root, "**", "*"), recursive=True):
        if os.path.isfile(path):
            with open(path, "rb") as f:
                out[os.path.relpath(path, root)] = f.read()
    return out


class SnapshotTest(unittest.TestCase):
    def setUp(self):
        self.snap = patches.snapshot(files_old(), "42.21", 1, "2026-10-01")

    def test_cabecera(self):
        s = self.snap
        self.assertEqual((s["format"], s["id"], s["version"], s["build"], s["recordedAt"]),
                         (1, "42.21", "42.21", 1, "2026-10-01"))

    def test_objeto(self):
        self.assertEqual(self.snap["kinds"]["items"]["Base.Axe"], {
            "n": {"en": "Axe", "es": "Hacha"},
            "f": {"cat": "ToolWeapon", "name": "Axe", "stats.bodyLocationName": "Hands", "stats.categories": ["axe"],
                  "stats.maxDamage": 2, "stats.minDamage": 0.8, "stats.twoHanded": True,
                  "tags": ["base:axe", "base:choptree"], "type": "weapon", "weight": 3}})

    def test_receta(self):
        f = self.snap["kinds"]["recipes"]["MakeStake"]["f"]
        self.assertEqual(f["inputs"], ["1× Base.Plank|Base.TreeBranch2", "1× tag:base:sharpknife keep"])
        self.assertEqual(f["outputs"], ["1× Base.Stake"])
        self.assertEqual(f["skills.Woodwork"], 1)
        self.assertEqual(f["xp.Woodwork"], 5)

    def test_sandbox(self):
        sb = self.snap["kinds"]["sandbox"]
        self.assertEqual(sb["WaterShutModifier"]["f"], {"default": 14, "max": 2147483647, "min": -1, "type": "int"})
        self.assertEqual(sb["Zombies"]["f"]["n"], 6)
        self.assertEqual(sb["Zombies"]["n"], {"en": "Zombie Count", "es": "Cantidad de zombis"})

    def test_moodle(self):
        m = self.snap["kinds"]["moodles"]["Hungry"]
        self.assertEqual(m["n"], {"en": "Hungry", "es": "Hambre"})
        self.assertEqual(m["f"]["levels.1.name"], "Peckish")

    def test_habilidad(self):
        a = self.snap["kinds"]["skills"]["Axe"]
        self.assertEqual(a["n"], {"en": "Axe", "es": "Hacha"})
        self.assertEqual(a["f"], {"cat": "Combat", "name": "Axe", "xp": [75, 150, 300, 750]})

    def test_sin_server_no_hay_sandbox(self):
        f = files_old()
        del f["server.json"]
        self.assertNotIn("sandbox", patches.snapshot(f, "42.21", 1, "2026-10-01")["kinds"])


class DiffTest(unittest.TestCase):
    def setUp(self):
        self.old = patches.snapshot(files_old(), "42.21", 1, "2026-10-01")
        self.new = patches.snapshot(files_new(), "42.22", 2, "2026-10-15")
        self.new["id"] = "42.22"
        self.d = patches.diff(self.old, self.new)

    def test_exacto(self):
        self.assertEqual(self.d["kinds"], EXPECTED_KINDS)

    def test_resto(self):
        self.assertNotIn("professions", self.d["kinds"])
        self.assertEqual(self.d["counts"]["items"], {"added": 1, "removed": 1, "changed": 1})
        self.assertEqual(self.d["names"]["items"]["Base.Spoon"], {"en": "Spoon", "es": "Cuchara"})
        self.assertEqual(self.d["names"]["items"]["Base.Fork"], {"en": "Fork", "es": "Tenedor"})
        self.assertEqual((self.d["from"], self.d["to"]), ("42.21", "42.22"))

    def test_tipo_cuenta(self):
        a, b = files_old(), files_old()
        a["items/weapon.json"][0]["stats"]["twoHanded"] = True
        b["items/weapon.json"][0]["stats"]["twoHanded"] = 1
        d = patches.diff(patches.snapshot(a, "1", 1, "x"), patches.snapshot(b, "2", 2, "x"))
        self.assertEqual(d["kinds"]["items"]["changed"]["Base.Axe"], [{"f": "stats.twoHanded", "b": True, "a": 1}])

    def test_sandbox_solo_en_la_nueva(self):
        a = files_old()
        del a["server.json"]
        d = patches.diff(patches.snapshot(a, "1", 1, "x"), patches.snapshot(files_new(), "2", 2, "x"))
        self.assertNotIn("sandbox", d["kinds"])
        self.assertIn("items", d["kinds"])

    def test_campo_nuevo_y_quitado(self):
        a, b = files_old(), files_old()
        del a["items/weapon.json"][0]["stats"]["minDamage"]
        b["items/weapon.json"][0]["stats"]["twoHanded"] = None
        del b["items/weapon.json"][0]["stats"]["categories"]
        d = patches.diff(patches.snapshot(a, "1", 1, "x"), patches.snapshot(b, "2", 2, "x"))
        self.assertEqual(d["kinds"]["items"]["changed"]["Base.Axe"], [
            {"f": "stats.categories", "b": ["axe"]},
            {"f": "stats.minDamage", "a": 0.8},
            {"f": "stats.twoHanded", "b": True, "a": None}])

    def test_lista_de_otro_largo(self):
        a, b = files_old(), files_old()
        b["skills.json"]["Axe"]["xp"].append(1500)
        d = patches.diff(patches.snapshot(a, "1", 1, "x"), patches.snapshot(b, "2", 2, "x"))
        self.assertEqual(d["kinds"]["skills"]["changed"]["Axe"],
                         [{"f": "xp", "b": [75, 150, 300, 750], "a": [75, 150, 300, 750, 1500]}])

    def test_sin_cambios(self):
        d = patches.diff(self.old, patches.snapshot(files_old(), "42.22", 2, "x"))
        self.assertEqual((d["kinds"], d["counts"], d["names"]), ({}, {}, {}))

    def test_slug(self):
        self.assertEqual(patches.slug("42.21"), "42-21")
        self.assertEqual(patches.slug("42.21.1"), "42-21-1")
        self.assertEqual(patches.slug("42.22-b3"), "42-22-b3")


class SuspiciousTest(unittest.TestCase):
    def test_masivo(self):
        old = patches.snapshot(many(300, 1), "1", 1, "x")
        d = patches.diff(old, patches.snapshot(many(300, 2), "2", 2, "x"))
        avisos = patches.suspicious(d, old)
        self.assertEqual(len(avisos), 1)
        self.assertIn("stats.foo", avisos[0])
        self.assertIn("300", avisos[0])

    def test_pocos(self):
        old = patches.snapshot(many(10, 1), "1", 1, "x")
        d = patches.diff(old, patches.snapshot(many(10, 2), "2", 2, "x"))
        self.assertEqual(patches.suspicious(d, old), [])

    def test_menos_de_la_mitad(self):
        # 300 cambian, pero de 1.000 que tienen el campo: un parche que retoca muchos no es un extractor roto.
        a = many(1000, 1)
        b = copy.deepcopy(a)
        for it in b["items/misc.json"][:300]:
            it["stats"]["foo"] = 2
        old = patches.snapshot(a, "1", 1, "x")
        self.assertEqual(patches.suspicious(patches.diff(old, patches.snapshot(b, "2", 2, "x")), old), [])

    def test_quitados_en_masa(self):
        old = patches.snapshot(many(300, 1), "1", 1, "x")
        d = patches.diff(old, patches.snapshot({"items/misc.json": []}, "2", 2, "x"))
        avisos = patches.suspicious(d, old)
        self.assertEqual(len(avisos), 1)
        self.assertIn("300", avisos[0])


class RecordTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_la_secuencia(self):
        r = self.root
        self.assertEqual(patches.record(files_old(), "42.21", 1, "2026-10-01", root=r), ("nueva", "42.21"))
        self.assertTrue(os.path.exists(os.path.join(r, "snapshots", "42.21.json.gz")))
        self.assertFalse(os.path.exists(os.path.join(r, "diffs")))

        self.assertEqual(patches.record(files_old(), "42.21", 1, "2026-10-02", root=r), ("igual", "42.21"))

        self.assertEqual(patches.record(files_new(), "42.22", 2, "2026-10-15", root=r), ("nueva", "42.22"))
        with open(os.path.join(r, "diffs", "42-22.json"), encoding="utf-8") as f:
            d = json.load(f)
        self.assertEqual(d["kinds"], EXPECTED_KINDS)
        self.assertEqual((d["from"], d["to"]), ("42.21", "42.22"))

        third = files_new()
        third["traits.json"][0]["cost"] = 6
        self.assertEqual(patches.record(third, "42.22", 3, "2026-10-16", root=r), ("nueva", "42.22-b3"))
        self.assertTrue(os.path.exists(os.path.join(r, "diffs", "42-22-b3.json")))

        fourth = copy.deepcopy(third)
        fourth["traits.json"][0]["cost"] = 5
        err = io.StringIO()
        with redirect_stderr(err):
            self.assertEqual(patches.record(fourth, "42.22", 3, "2026-10-17", root=r), ("rehecha", "42.22-b3"))
        self.assertIn("42.22-b3", err.getvalue())
        idx = patches.snapshots_index(r)
        self.assertEqual([e["id"] for e in idx], ["42.21", "42.22", "42.22-b3"])
        self.assertEqual(idx[0], {"id": "42.21", "version": "42.21", "build": 1, "recordedAt": "2026-10-01"})
        # La rehecha conserva la fecha en que se grabó la versión: lo que cambió fue el extractor, no el juego.
        self.assertEqual(idx[2]["recordedAt"], "2026-10-16")
        self.assertEqual(patches.read_snapshot(r, "42.22-b3")["kinds"]["traits"]["strong"]["f"]["cost"], 5)
        # Y no toca el diff: sigue siendo el que se grabó con la 42.22-b3 (8 → 6), un mismo extractor de los dos lados.
        # Ver RehechaTest.
        with open(os.path.join(r, "diffs", "42-22-b3.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["kinds"]["traits"]["changed"]["strong"], [{"f": "cost", "b": 8, "a": 6}])

    def test_gzip_determinista(self):
        a, b = os.path.join(self.root, "a"), os.path.join(self.root, "b")
        patches.record(files_old(), "42.21", 1, "2026-10-01", root=a)
        patches.record(files_old(), "42.21", 1, "2026-10-01", root=b)
        with open(os.path.join(a, "snapshots", "42.21.json.gz"), "rb") as fa, \
                open(os.path.join(b, "snapshots", "42.21.json.gz"), "rb") as fb:
            self.assertEqual(fa.read(), fb.read())
        with gzip.open(os.path.join(a, "snapshots", "42.21.json.gz"), "rt", encoding="utf-8") as f:
            self.assertEqual(json.load(f)["id"], "42.21")

    def test_el_corte(self):
        r = self.root
        patches.record(many(300, 1), "42.21", 1, "2026-10-01", root=r)
        before = tree(r)
        with self.assertRaises(SystemExit) as cm:
            patches.record(many(300, 2), "42.22", 2, "2026-10-15", root=r)
        self.assertIn("stats.foo", str(cm.exception.code))
        self.assertIn("PZ_ACEPTO_CAMBIOS_MASIVOS=1", str(cm.exception.code))
        self.assertEqual(tree(r), before)
        self.assertEqual(patches.record(many(300, 2), "42.22", 2, "2026-10-15", root=r, accept=True),
                         ("nueva", "42.22"))

    def test_rebuild(self):
        r = self.root
        patches.record(files_old(), "42.21", 1, "2026-10-01", root=r)
        patches.record(files_new(), "42.22", 2, "2026-10-15", root=r)
        path = os.path.join(r, "diffs", "42-22.json")
        with open(path, encoding="utf-8") as f:
            want = f.read()
        os.remove(path)
        patches.rebuild(r)
        with open(path, encoding="utf-8") as f:
            self.assertEqual(f.read(), want)


class RehechaTest(unittest.TestCase):
    """
    Un cambio del extractor con 2 fotos guardadas: se reemplaza sólo la última foto y el diff guardado queda como estaba
    (lo armó un mismo extractor de los dos lados). Rehacerlo contra la anterior, grabada con el extractor viejo,
    publicaría como "cambios del parche" todo lo que arregló el extractor.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = r = self.tmp.name
        patches.record(files_old(), "42.21", 1, "2026-10-01", root=r)
        patches.record(files_new(), "42.22", 2, "2026-10-15", root=r)
        self.diff_file = os.path.join(r, "diffs", "42-22.json")
        self.before = tree(r)

    def tearDown(self):
        self.tmp.cleanup()

    def test_solo_la_foto(self):
        r = self.root
        fixed = files_new()
        fixed["traits.json"][0]["desc"]["en"] = "Extra knockback."  # el extractor ahora deja el punto final
        err = io.StringIO()
        with redirect_stderr(err):
            self.assertEqual(patches.record(fixed, "42.22", 2, "2026-10-20", root=r), ("rehecha", "42.22"))
        self.assertIn("los diffs guardados quedan como estaban", err.getvalue())
        after = tree(r)
        changed = sorted(k for k in after if after[k] != self.before.get(k))
        self.assertEqual(changed, [os.path.join("snapshots", "42.22.json.gz")])
        snap = patches.read_snapshot(r, "42.22")
        self.assertEqual(snap["kinds"]["traits"]["strong"]["f"]["desc"], "Extra knockback.")
        self.assertEqual((snap["id"], snap["build"], snap["recordedAt"]), ("42.22", 2, "2026-10-15"))
        self.assertEqual(patches.report("rehecha", "42.22", root=r), "Parches: foto rehecha 42.22")
        # La corrida siguiente, con el mismo extractor, ya da igual.
        self.assertEqual(patches.record(fixed, "42.22", 2, "2026-10-21", root=r), ("igual", "42.22"))

    def test_masivo_no_corta(self):
        # Sin diff que publicar no hay corte: 300 objetos que cambian en la rehecha son el extractor, no un parche.
        r = os.path.join(self.root, "masivo")
        patches.record(many(300, 1), "42.21", 1, "2026-10-01", root=r)
        b = many(300, 1)
        b["items/misc.json"][0]["weight"] = 2
        patches.record(b, "42.22", 2, "2026-10-15", root=r)
        with open(os.path.join(r, "diffs", "42-22.json"), "rb") as f:
            want = f.read()
        c = many(300, 2)
        c["items/misc.json"][0]["weight"] = 2
        with redirect_stderr(io.StringIO()):
            self.assertEqual(patches.record(c, "42.22", 2, "2026-10-20", root=r), ("rehecha", "42.22"))
        with open(os.path.join(r, "diffs", "42-22.json"), "rb") as f:
            self.assertEqual(f.read(), want)

    def test_el_proximo_parche_de_igual_a_igual(self):
        # Después de la rehecha, el diff del parche siguiente sólo trae lo del parche: el arreglo del extractor ya está
        # en las dos fotos.
        r = self.root
        fixed = files_new()
        fixed["traits.json"][0]["desc"]["en"] = "Extra knockback."
        with redirect_stderr(io.StringIO()):
            patches.record(fixed, "42.22", 2, "2026-10-20", root=r)
        nxt = copy.deepcopy(fixed)
        nxt["traits.json"][0]["cost"] = 7
        self.assertEqual(patches.record(nxt, "42.23", 4, "2026-11-01", root=r), ("nueva", "42.23"))
        with open(os.path.join(r, "diffs", "42-23.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["kinds"], {"traits": {"added": [], "removed": [], "changed": {
                "strong": [{"f": "cost", "b": 8, "a": 7}]}}})


class HotfixTest(unittest.TestCase):
    """Un build nuevo con los mismos datos queda anotado: un cambio posterior del extractor no se publica como parche."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_hotfix_sin_datos_y_despues_el_extractor(self):
        r = self.root
        self.assertEqual(patches.record(files_old(), "42.21", 1, "2026-10-01", root=r), ("nueva", "42.21"))
        self.assertEqual(patches.record(files_old(), "42.21", 2, "2026-10-03", root=r), ("igual", "42.21"))
        self.assertEqual(patches.snapshots_index(r), [{"id": "42.21", "version": "42.21", "build": 1,
                                                       "recordedAt": "2026-10-01",
                                                       "seen": [{"version": "42.21", "build": 2}]}])
        # Otra corrida con el mismo build no lo anota dos veces.
        patches.record(files_old(), "42.21", 2, "2026-10-04", root=r)
        self.assertEqual(len(patches.snapshots_index(r)[0]["seen"]), 1)
        fixed = files_old()
        fixed["traits.json"][0]["desc"]["en"] = "Extra knockback."
        with redirect_stderr(io.StringIO()):
            self.assertEqual(patches.record(fixed, "42.21", 2, "2026-10-05", root=r), ("rehecha", "42.21"))
        self.assertFalse(os.path.exists(os.path.join(r, "diffs")))
        snap = patches.read_snapshot(r, "42.21")
        # La foto sigue diciendo el build con que se grabó, igual que su entrada del índice.
        self.assertEqual((snap["build"], snap["recordedAt"]), (1, "2026-10-01"))

    def test_parche_solo_de_java(self):
        # Sube el número sin tocar datos: tampoco es una foto nueva, y el cambio del extractor que venga después rehace
        # la última foto en vez de publicarse como "42.22".
        r = self.root
        patches.record(files_old(), "42.21", 1, "2026-10-01", root=r)
        self.assertEqual(patches.record(files_old(), "42.22", 2, "2026-10-15", root=r), ("igual", "42.21"))
        fixed = files_old()
        fixed["traits.json"][0]["desc"]["en"] = "Extra knockback."
        with redirect_stderr(io.StringIO()):
            self.assertEqual(patches.record(fixed, "42.22", 2, "2026-10-16", root=r), ("rehecha", "42.21"))
        self.assertEqual([e["id"] for e in patches.snapshots_index(r)], ["42.21"])

    def test_volver_a_un_build_viejo(self):
        r = self.root
        patches.record(files_old(), "42.21", 1, "2026-10-01", root=r)
        patches.record(files_new(), "42.22", 2, "2026-10-15", root=r)
        before = tree(r)
        other = files_old()
        other["traits.json"][0]["cost"] = 3
        with self.assertRaises(SystemExit) as cm:
            patches.record(other, "42.21", 1, "2026-10-16", root=r)
        self.assertIn("build viejo", str(cm.exception.code))
        self.assertEqual(tree(r), before)

    def test_volver_a_un_build_visto(self):
        r = self.root
        patches.record(files_old(), "42.21", 1, "2026-10-01", root=r)
        patches.record(files_old(), "42.21", 5, "2026-10-02", root=r)
        patches.record(files_new(), "42.22", 2, "2026-10-15", root=r)
        other = files_old()
        other["traits.json"][0]["cost"] = 3
        with self.assertRaises(SystemExit) as cm:
            patches.record(other, "42.21", 5, "2026-10-16", root=r)
        self.assertIn("42.21", str(cm.exception.code))

    def test_sin_build_va_la_fecha(self):
        # Fuera de Steam no hay build: un parche que no cambia el número lleva la fecha en el id.
        r = self.root
        patches.record(files_old(), "42.21", 1, "2026-10-01", root=r)
        self.assertEqual(patches.record(files_new(), "42.21", None, "2026-10-05", root=r),
                         ("nueva", "42.21-2026-10-05"))
        self.assertTrue(os.path.exists(os.path.join(r, "diffs", "42-21-2026-10-05.json")))


class GuardsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def manifest(self, user="", mounted=""):
        """Un appmanifest_108600.acf sintético, con la forma del de verdad y las líneas de BetaKey que se pidan."""
        path = os.path.join(self.root, "appmanifest_108600.acf")
        with open(path, "w", encoding="utf-8") as f:
            f.write('"AppState"\n{\n\t"appid"\t\t"108600"\n\t"buildid"\t\t"25485521"\n'
                    f'\t"UserConfig"\n\t{{\n\t\t"language"\t\t"english"\n{user}\t}}\n'
                    f'\t"MountedConfig"\n\t{{\n\t\t"language"\t\t"english"\n{mounted}\t}}\n}}\n')
        return path

    def test_rama(self):
        beta = '\t\t"BetaKey"\t\t"unstable"\n'
        self.assertEqual(patches.steam_branch(self.manifest()), "")
        self.assertEqual(patches.steam_branch(self.manifest(beta, beta)), "unstable")
        # Elegida en Steam pero todavía sin bajar: igual corta, porque la próxima actualización la trae.
        self.assertEqual(patches.steam_branch(self.manifest(user=beta)), "unstable")
        public = '\t\t"BetaKey"\t\t"public"\n'
        self.assertEqual(patches.steam_branch(self.manifest(public, public)), "")
        self.assertEqual(patches.steam_branch(self.manifest('\t\t"BetaKey"\t\t""\n')), "")
        self.assertIsNone(patches.steam_branch(os.path.join(self.root, "no-esta.acf")))

    def test_corte_por_beta(self):
        with self.assertRaises(SystemExit) as cm:
            patches.branch_guard("unstable")
        self.assertIn("unstable", str(cm.exception.code))
        self.assertIn("PZ_ACEPTO_RAMA_BETA=1", str(cm.exception.code))
        for ok in ("", None):
            patches.branch_guard(ok)
        patches.branch_guard("unstable", accept=True)

    def test_otro_formato(self):
        r = self.root
        patches.record(files_old(), "42.21", 1, "2026-10-01", root=r)
        snap = patches.read_snapshot(r, "42.21")
        snap["format"] = patches.FORMAT + 1
        with open(os.path.join(r, "snapshots", "42.21.json.gz"), "wb") as f:
            f.write(patches.gz_bytes(snap))
        before = tree(r)
        with self.assertRaises(SystemExit) as cm:
            patches.record(files_new(), "42.22", 2, "2026-10-15", root=r)
        self.assertIn("formato", str(cm.exception.code))
        self.assertEqual(tree(r), before)

    def test_falta_la_foto(self):
        r = self.root
        patches.record(files_old(), "42.21", 1, "2026-10-01", root=r)
        os.remove(os.path.join(r, "snapshots", "42.21.json.gz"))
        with self.assertRaises(SystemExit) as cm:
            patches.record(files_new(), "42.22", 2, "2026-10-15", root=r)
        self.assertIn("42.21", str(cm.exception.code))


class MoreDiffTest(unittest.TestCase):
    def test_entero_contra_float(self):
        # Fijado: 2 → 2.0 cuenta como cambio. Hoy no pasa porque extract.py normaliza los números (`num`,
        # `_tidy_float`); si un día aparece en un diff, el arreglo va en el extractor, no acá.
        a, b = files_old(), files_old()
        b["items/weapon.json"][0]["stats"]["maxDamage"] = 2.0
        d = patches.diff(patches.snapshot(a, "1", 1, "x"), patches.snapshot(b, "2", 2, "x"))
        self.assertEqual(d["kinds"]["items"]["changed"]["Base.Axe"], [{"f": "stats.maxDamage", "b": 2, "a": 2.0}])

    def test_lista_con_diccionarios(self):
        # `stats.fluid.fluids` queda como su JSON canónico (claves ordenadas) y se compara entero.
        a, b = files_old(), files_old()
        a["items/weapon.json"][0]["stats"]["fluid"] = {"fluids": [{"id": "Water", "amount": 1}]}
        b["items/weapon.json"][0]["stats"]["fluid"] = {"fluids": [{"id": "Water", "amount": 2}]}
        old, new = patches.snapshot(a, "1", 1, "x"), patches.snapshot(b, "2", 2, "x")
        self.assertEqual(old["kinds"]["items"]["Base.Axe"]["f"]["stats.fluid.fluids"], '[{"amount":1,"id":"Water"}]')
        self.assertEqual(patches.diff(old, new)["kinds"]["items"]["changed"]["Base.Axe"],
                         [{"f": "stats.fluid.fluids", "b": '[{"amount":1,"id":"Water"}]',
                           "a": '[{"amount":2,"id":"Water"}]'}])

    def test_altas_en_masa(self):
        old = patches.snapshot(many(10, 1), "1", 1, "x")
        avisos = patches.suspicious(patches.diff(old, patches.snapshot(many(310, 1), "2", 2, "x")), old)
        self.assertEqual(len(avisos), 1)
        self.assertIn("Llegan 300", avisos[0])

    def test_campo_nuevo_masivo(self):
        old = patches.snapshot(many(300, 1), "1", 1, "x")
        b = many(300, 1)
        for it in b["items/misc.json"]:
            it["stats"]["bar"] = 1
        avisos = patches.suspicious(patches.diff(old, patches.snapshot(b, "2", 2, "x")), old)
        self.assertEqual(avisos, ["Campo nuevo stats.bar en 300 objetos"])


REAL_FILES = ("recipes.json", "traits.json", "professions.json", "skills.json", "moodles.json", "server.json")


def load_real():
    """Los mismos nombres de archivo que arma `extract.py` en `files`, leídos de `games/zomboid/data`."""
    files = {}
    for name in REAL_FILES:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            files[name] = json.load(f)
    for path in glob.glob(os.path.join(DATA, "items", "*.json")):
        with open(path, encoding="utf-8") as f:
            files["items/" + os.path.basename(path)] = json.load(f)
    return files


# Se saltea si falta cualquiera de los archivos que lee `load_real` (antes miraba sólo items.json, y sin server.json
# daba error en vez de saltearse).
@unittest.skipUnless(all(os.path.exists(os.path.join(DATA, n)) for n in REAL_FILES)
                     and glob.glob(os.path.join(DATA, "items", "*.json")), "sin datos")
class RealDataTest(unittest.TestCase):
    def test_cantidades_y_peso(self):
        snap = patches.snapshot(load_real(), "42.21", 25485521, "2026-10-01")
        k = snap["kinds"]
        self.assertEqual({t: len(k[t]) for t in ("items", "recipes", "traits", "professions", "skills", "moodles")},
                         {"items": 4878, "recipes": 1170, "traits": 97, "professions": 25, "skills": 35, "moodles": 26})
        self.assertGreaterEqual(len(k["sandbox"]), 250)
        size = len(patches.gz_bytes(snap))
        self.assertLess(size, 400 * 1024, f"la foto pesa {size / 1024:.0f} KB con gzip")


# ---- La Crónica: los anuncios de Steam, los borradores y el control (sin red: anuncios sintéticos) ----

NOTES = "https://theindiestone.com/forums/topic/101693-4221-unstable-released/"


def news_item(gid, title, date, contents="Notes."):
    return {"gid": gid, "title": title, "date": date, "contents": contents}


def news_items():
    return [
        news_item("21s", "Build 42.21 Stable Released", 1790597228,
                  f"Read more [url={NOTES}]here[/url]. Bugs: [url=https://theindiestone.com/forums/index.php?/topic/"
                  "43261-read-here-first/]guide[/url]"),
        news_item("21u", "Re-population of the Dead: Build 42.21 Unstable Released", 1790179696,
                  f"Full notes [url={NOTES}]here[/url]"),
        news_item("201", "42.20.1 STABLE Hotfix Released", 1785924450),
        news_item("200", "Build 42.20.0 Stable Released", 1785324125),
        news_item("19u", "Build 42.19.0 Unstable Released", 1780272000),
        news_item("blog", "SPRING IS HERE", 1778198400),
    ]


class TitleVersionsTest(unittest.TestCase):
    def test_titulos_reales(self):
        tv = patches.title_versions
        self.assertEqual(tv("Build 42.21 Stable Released"), [("42.21", "stable")])
        self.assertEqual(tv("Re-population of the Dead: Build 42.21 Unstable Released"), [("42.21", "unstable")])
        self.assertEqual(tv("42.20.4 STABLE & 42.19.2 UNSTABLE & 41.78.21 LEGACY Hotfixes Released"),
                         [("42.20.4", "stable"), ("42.19.2", "unstable")])
        self.assertEqual(tv("Stable(41.78.19) + UNSTABLE(42.16.3) Hotfixes Released"), [("42.16.3", "unstable")])
        self.assertEqual(tv("Build 42.20.0 Stable Released"), [("42.20", "stable")])
        self.assertEqual(tv("42.14.1 BETA HOTFIX Released"), [("42.14.1", "unstable")])
        self.assertEqual(tv("SPRING IS HERE"), [])
        self.assertEqual(tv("Unstable 42 MP Released"), [])
        # Sin rama en el título (un blog que nombra la versión): afuera.
        self.assertEqual(tv("42.20: The Big Glow Up"), [])

    def test_parent_y_notes(self):
        self.assertEqual(patches.parent("42.20.4"), "42.20")
        self.assertEqual(patches.parent("42.21"), "42.21")
        self.assertEqual(patches.notes_url(f"… [url={NOTES}]here[/url]"), NOTES)
        self.assertIsNone(patches.notes_url("[url=https://theindiestone.com/forums/forum/85-bug-reports/]bugs[/url]"))
        self.assertEqual(patches.steam_url("123"), "https://store.steampowered.com/news/app/108600/view/123")


class NewsStubsTest(unittest.TestCase):
    def test_borradores(self):
        stubs = patches.news_stubs(news_items(), set())
        self.assertEqual(set(stubs), {"42-21", "42-20"})
        s = stubs["42-21"]
        self.assertEqual((s["slug"], s["version"], s["date"], s["branch"], s["unstableDate"]),
                         ("42-21", "42.21", "2026-09-28", "stable", "2026-09-23"))
        self.assertEqual([x["gid"] for x in s["sources"] if x["kind"] == "steam"], ["21u", "21s"])
        self.assertIn({"kind": "notes", "url": NOTES}, s["sources"])
        self.assertEqual(s["summary"], {"en": "", "es": ""})
        self.assertEqual(s["title"], {"en": "", "es": ""})
        self.assertEqual(s["highlights"], [])
        self.assertNotIn("hotfixes", s)
        t = stubs["42-20"]
        self.assertEqual((t["date"], t["branch"]), ("2026-07-29", "stable"))
        self.assertNotIn("unstableDate", t)
        self.assertEqual(t["hotfixes"], [{
            "version": "42.20.1", "date": "2026-08-05", "summary": {"en": "", "es": ""},
            "sources": [{"kind": "steam", "url": patches.steam_url("201"), "gid": "201"}]}])

    def test_have(self):
        self.assertEqual(set(patches.news_stubs(news_items(), {"42-21"})), {"42-20"})

    def test_solo_unstable(self):
        stubs = patches.news_stubs([news_item("22u", "Build 42.22 Unstable Released", 1790597228)], set())
        self.assertEqual((stubs["42-22"]["branch"], stubs["42-22"]["date"], stubs["42-22"]["unstableDate"]),
                         ("unstable", "2026-09-28", "2026-09-28"))


class CopiedRunsTest(unittest.TestCase):
    def test_tiras(self):
        self.assertEqual(
            patches.copied_runs("we fixed the zombie duplication bug in multiplayer games today",
                                "TIS: we fixed the zombie duplication bug in multiplayer games and more"),
            ["we fixed the zombie duplication bug in multiplayer",
             "fixed the zombie duplication bug in multiplayer games"])

    def test_propio(self):
        self.assertEqual(patches.copied_runs("Fewer duplicated zombies when playing online with friends",
                                             "TIS: we fixed the zombie duplication bug in multiplayer games"), [])


def valid_entry():
    return {
        "slug": "42-21", "version": "42.21", "branch": "stable", "date": "2026-09-28", "unstableDate": "2026-09-23",
        "title": {"en": "The dead come back", "es": "Vuelven los muertos"},
        "summary": {"en": "Zombies respawn in cleared areas again after a few days.",
                    "es": "Los zombis vuelven a las zonas limpias a los pocos días."},
        "highlights": [{"en": "Respawn tuning", "es": "Reaparición ajustada"}],
        "hotfixes": [{"version": "42.21.1", "date": "2026-10-01", "summary": {"en": "Crash fix.", "es": "Un cierre."},
                      "sources": [{"kind": "steam", "url": patches.steam_url("h1"), "gid": "h1"}]}],
        "sources": [{"kind": "steam", "url": patches.steam_url("g1"), "gid": "g1"}, {"kind": "notes", "url": NOTES}],
        "updated": "2026-10-01",
    }


class CheckTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, "chronicle"))

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, name, data):
        with open(os.path.join(self.root, "chronicle", name), "w", encoding="utf-8") as f:
            json.dump(data, f)

    def test_valida(self):
        self.put("42-21.json", valid_entry())
        self.assertEqual(patches.check(self.root), ([], []))

    def test_sin_carpeta(self):
        self.assertEqual(patches.check(os.path.join(self.root, "no-esta")), ([], []))

    def test_idioma_vacio(self):
        e = valid_entry()
        e["summary"]["es"] = ""
        self.put("42-21.json", e)
        problems, _ = patches.check(self.root)
        self.assertEqual(len(problems), 1)
        self.assertIn("summary.es", problems[0])

    def test_vacios_en_listas(self):
        e = valid_entry()
        e["highlights"][0]["en"] = " "
        e["hotfixes"][0]["summary"]["es"] = ""
        self.put("42-21.json", e)
        problems, _ = patches.check(self.root)
        self.assertEqual(len(problems), 2)
        self.assertIn("highlights[0].en", problems[0])
        self.assertIn("hotfixes[0].summary.es", problems[1])

    def test_fuente_ajena(self):
        e = valid_entry()
        e["sources"].append({"kind": "notes", "url": "http://example.com"})
        self.put("42-21.json", e)
        problems, _ = patches.check(self.root)
        self.assertEqual(len(problems), 1)
        self.assertIn("http://example.com", problems[0])

    def test_sin_fuentes(self):
        e = valid_entry()
        e["sources"] = []
        self.put("42-21.json", e)
        self.assertEqual(len(patches.check(self.root)[0]), 1)

    def test_resto(self):
        e = valid_entry()
        e["slug"] = "42-20"
        e["date"] = "28/09/2026"
        e["branch"] = "beta"
        e["hotfixes"][0]["version"] = "42.20.1"
        e["hotfixes"][0]["date"] = "2026-13-01"
        e["updated"] = ""
        e["highlights"] = [{"en": "a", "es": "b"}] * 9
        self.put("42-21.json", e)
        problems, _ = patches.check(self.root)
        text = "\n".join(problems)
        for frag in ("slug", "date", "branch", "hotfixes[0].version", "hotfixes[0].date", "updated", "highlights"):
            self.assertIn(frag, text)
        self.assertEqual(len(problems), 7, text)

    def test_json_roto(self):
        with open(os.path.join(self.root, "chronicle", "42-21.json"), "w", encoding="utf-8") as f:
            f.write("{")
        self.assertEqual(len(patches.check(self.root)[0]), 1)

    def test_pendientes(self):
        self.put("42-21.json", valid_entry())
        self.put("x.todo.json", {"slug": "x"})
        self.assertEqual(patches.check(self.root), ([], ["x.todo.json"]))

    def test_copiado(self):
        self.put("42-21.json", valid_entry())
        os.makedirs(os.path.join(self.root, ".cache"))
        with open(os.path.join(self.root, ".cache", "g1.txt"), "w", encoding="utf-8") as f:
            # Las 8 palabras del resumen, con BBCode en el medio: las marcas no cortan la tira.
            f.write("[list][*]Good news: [b]zombies respawn[/b] in cleared areas again after a[/list] while.")
        problems, _ = patches.check(self.root)
        self.assertEqual(len(problems), 1)
        self.assertIn("copiado", problems[0])
        self.assertIn("zombies respawn in cleared areas again after a", problems[0])

    def test_hotfix_que_no_es_objeto(self):
        e = valid_entry()
        e["hotfixes"].append("42.21.2")
        self.put("42-21.json", e)
        problems, _ = patches.check(self.root)
        self.assertEqual(problems, ["42-21.json: hotfixes[1] no es un objeto"])

    def test_sin_cache_se_avisa(self):
        # Sin `.cache/<gid>.txt` el control de copia no corre: `uncached` lo dice (check lo imprime como aviso).
        self.put("42-21.json", valid_entry())
        self.assertEqual(patches.uncached(self.root), ["g1", "h1"])
        os.makedirs(os.path.join(self.root, ".cache"))
        for gid in ("g1", "h1"):
            with open(os.path.join(self.root, ".cache", f"{gid}.txt"), "w", encoding="utf-8") as f:
                f.write("otra cosa")
        self.assertEqual(patches.uncached(self.root), [])


class NewsCommandTest(unittest.TestCase):
    """`news --offline` con la caché sintética: escribe los borradores y avisa lo que le falta a una entrada."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, ".cache"))
        with open(os.path.join(self.root, ".cache", "news.json"), "w", encoding="utf-8") as f:
            json.dump(news_items(), f)

    def tearDown(self):
        self.tmp.cleanup()

    def test_borradores_y_faltantes(self):
        out = io.StringIO()
        with redirect_stdout(out):
            patches.news(self.root, offline=True)
        folder = os.path.join(self.root, "chronicle")
        self.assertEqual(sorted(os.listdir(folder)), ["42-20.todo.json", "42-21.todo.json"])
        with open(os.path.join(self.root, ".cache", "21s.txt"), encoding="utf-8") as f:
            self.assertIn(NOTES, f.read())
        # La 42.21 ya escrita con sólo la fuente estable: avisa la unstable y las notas, y no vuelve a escribir su
        # borrador.
        os.remove(os.path.join(folder, "42-21.todo.json"))
        e = valid_entry()
        e["sources"] = [{"kind": "steam", "url": patches.steam_url("21s"), "gid": "21s"}]
        e["hotfixes"] = []
        with open(os.path.join(folder, "42-21.json"), "w", encoding="utf-8") as f:
            json.dump(e, f)
        out = io.StringIO()
        with redirect_stdout(out):
            patches.news(self.root, offline=True)
        self.assertIn(patches.steam_url("21u"), out.getvalue())
        self.assertIn(NOTES, out.getvalue())
        self.assertFalse(os.path.exists(os.path.join(folder, "42-21.todo.json")))

    def test_sin_cache(self):
        os.remove(os.path.join(self.root, ".cache", "news.json"))
        with self.assertRaises(SystemExit):
            patches.news(self.root, offline=True)


CHRONICLE = os.path.join(patches.PATCHES, "chronicle")


@unittest.skipUnless(os.path.isdir(CHRONICLE), "sin chronicle/")
class RealChronicleTest(unittest.TestCase):
    def test_sin_problemas(self):
        problems, _ = patches.check()
        self.assertEqual(problems, [])


if __name__ == "__main__":
    unittest.main()
