"""
Tests de `extract.py` (2026-10-05): objetos, recetas, textos oficiales en/es y slugs.

Los números son los que se relevaron en el build de Steam 25681799 (docs/superpowers/plans/2026-10-05-rust-base.md,
"Global Constraints"). Si un parche los mueve, primero se revisa qué cambió en el juego y recién después se toca el
test: un número distinto puede ser un error del lector y no del parche.

Uso (desde la raíz del worktree):
    python -m unittest discover -s games/rust/tools/tests -v
"""
import json
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import extract  # noqa: E402

HAVE_GAME = (extract.BUNDLES / "shared" / "items.preload.bundle").exists()
_DATA = None


def data():
    """La extracción entera, una sola vez para todos los tests (lee ~5 GB de bundles, ~15 s)."""
    global _DATA
    if _DATA is None:
        _DATA = extract.collect()
    return _DATA


def item(sid):
    return next(i for i in data()["items"] if i["id"] == sid)


class TestSlugify(unittest.TestCase):
    def test_igual_que_route_ts(self):
        self.assertEqual(extract.slugify("Assault Rifle"), "assault-rifle")
        self.assertEqual(extract.slugify("Fusil de asalto"), "fusil-de-asalto")
        self.assertEqual(extract.slugify("Carga explosiva con temporizador"), "carga-explosiva-con-temporizador")
        self.assertEqual(extract.slugify("Hazmat Suit"), "hazmat-suit")
        self.assertEqual(extract.slugify("Pared Alta de Piedra"), "pared-alta-de-piedra")
        self.assertEqual(extract.slugify("Satchel's Charge."), "satchels-charge")
        self.assertEqual(extract.slugify("  Árbol / Ñandú  "), "arbol-nandu")


class TestStamp(unittest.TestCase):
    def test_la_fecha_no_se_mueve_si_no_cambian_los_datos(self):
        prev = {"hash": "abc", "extractedAt": "2026-10-05T12:00:00Z"}
        self.assertEqual(extract.stamp(prev, "abc", "2026-11-05T19:00:00Z"), "2026-10-05T12:00:00Z")
        self.assertEqual(extract.stamp(prev, "xyz", "2026-11-05T19:00:00Z"), "2026-11-05T19:00:00Z")
        self.assertEqual(extract.stamp(None, "xyz", "2026-11-05T19:00:00Z"), "2026-11-05T19:00:00Z")


def fake(sid, en, es=None, redirect=None):
    return {"id": sid, "name": {"en": en, "es": es}, "redirectOf": redirect}


class TestAssignSlugs(unittest.TestCase):
    """Datos sintéticos, sin el juego."""

    def test_sin_anterior_los_que_chocan_llevan_sufijo_los_dos(self):
        items = [fake("a.one", "Torch"), fake("a.two", "Torch"), fake("rifle", "Rifle")]
        extract.assign_slugs(items)
        self.assertEqual([i["slug"] for i in items], ["torch-aone", "torch-atwo", "rifle"])

    def test_un_objeto_nuevo_no_le_cambia_el_slug_al_existente(self):
        items = [fake("a.one", "Torch"), fake("b.new", "Torch")]
        extract.assign_slugs(items, {"a.one": ("torch", "torch")})
        self.assertEqual(items[0]["slug"], "torch")
        self.assertEqual(items[1]["slug"], "torch-bnew")
        self.assertEqual(items[0]["slugEs"], "torch")
        self.assertEqual(items[1]["slugEs"], "torch-bnew")

    def test_si_cambio_de_nombre_toma_el_slug_nuevo(self):
        items = [fake("a.one", "Flame Torch")]
        extract.assign_slugs(items, {"a.one": ("torch", "antorcha")})
        self.assertEqual(items[0]["slug"], "flame-torch")

    def test_un_sufijo_viejo_se_conserva_mientras_el_nombre_sirva(self):
        items = [fake("a.one", "Torch"), fake("a.two", "Torch")]
        extract.assign_slugs(items, {"a.one": ("torch-a-one", "x"), "a.two": ("torch", "x")})
        self.assertEqual([i["slug"] for i in items], ["torch-a-one", "torch"])

    def test_el_espanol_no_es_el_ingles_de_otro(self):
        items = [fake("a", "Trap", "Rifle"), fake("b", "Rifle", "Otro")]
        extract.assign_slugs(items)
        self.assertEqual(items[0]["slugEs"], "rifle-a")
        self.assertEqual(items[1]["slug"], "rifle")

    def test_los_redirects_no_compiten_ni_llevan_slug(self):
        items = [fake("skin", "Gun", "Trabuco", redirect="gun"), fake("gun", "Gun", "Trabuco")]
        extract.assign_slugs(items)
        self.assertEqual((items[0]["slug"], items[0]["slugEs"]), (None, None))
        self.assertEqual((items[1]["slug"], items[1]["slugEs"]), ("gun", "trabuco"))


@unittest.skipUnless(HAVE_GAME, "Rust no está instalado (RUST_DIR)")
class TestItems(unittest.TestCase):
    def test_el_build_de_steam(self):
        self.assertIsInstance(data()["build"], int)
        self.assertGreater(data()["build"], 25_000_000)

    def test_sin_ocultos_y_cantidad_razonable(self):
        items = data()["items"]
        # 1.307 definiciones menos 169 ocultas = 1.138; alguna sin nombre inglés puede quedar afuera.
        self.assertGreater(len(items), 1100)
        self.assertLessEqual(len(items), 1138)

    def test_el_ak(self):
        ak = item("rifle.ak")
        self.assertEqual(ak["name"], {"en": "Assault Rifle", "es": "Fusil de asalto"})
        self.assertEqual(ak["slug"], "assault-rifle")
        self.assertEqual(ak["slugEs"], "fusil-de-asalto")
        self.assertEqual(ak["category"], "weapon")
        self.assertEqual(ak["rarity"], "veryrare")
        self.assertEqual(ak["condition"], {"max": 150, "repairable": True})
        c = ak["craft"]
        self.assertEqual(
            c["ingredients"],
            [{"id": "metal.refined", "amount": 50}, {"id": "wood", "amount": 200}, {"id": "riflebody", "amount": 1}, {"id": "metalspring", "amount": 4}],
        )
        self.assertEqual((c["workbench"], c["time"], c["amount"]), (3, 45, 1))

    def test_el_c4(self):
        c4 = item("explosive.timed")
        self.assertEqual(c4["name"]["es"], "Carga explosiva con temporizador")
        self.assertEqual(c4["stack"], 10)
        self.assertEqual(
            c4["craft"]["ingredients"],
            [{"id": "explosives", "amount": 20}, {"id": "cloth", "amount": 5}, {"id": "techparts", "amount": 2}],
        )
        self.assertEqual(c4["craft"]["workbench"], 3)

    def test_puerta_blindada_en_espanol(self):
        self.assertEqual(item("door.hinged.toptier")["name"]["es"], "Puerta blindada")

    def test_tildes_bien_leidas(self):
        self.assertIn("automático", item("rifle.ak")["desc"]["es"])

    def test_las_categorias_coinciden_con_los_json_del_juego(self):
        # `Bundles/items/<shortname>.json` trae la categoría por nombre: el número del enum tiene que dar lo mismo.
        checked = 0
        for it in data()["items"]:
            f = extract.BUNDLES / "items" / f"{it['id']}.json"
            if not f.exists():
                continue
            self.assertEqual(json.loads(f.read_text(encoding="utf-8"))["Category"].lower(), it["category"], it["id"])
            checked += 1
        self.assertGreater(checked, 1000)

    def test_slugs_unicos_y_sin_cruces_entre_idiomas(self):
        items = data()["items"]
        items = [i for i in items if not i["redirectOf"]]
        en = [i["slug"] for i in items]
        es = [i["slugEs"] for i in items]
        self.assertEqual(len(en), len(set(en)))
        self.assertEqual(len(es), len(set(es)))
        # Un slug español nunca es el inglés de OTRO objeto: la dirección se traduce en los dos idiomas.
        by_en = {i["slug"]: i["id"] for i in items}
        for i in items:
            self.assertEqual(by_en.get(i["slugEs"], i["id"]), i["id"], i["id"])
        for s in en + es:
            self.assertEqual(s, extract.slugify(s), s)

    def test_las_skins_no_le_roban_el_slug_a_nadie(self):
        self.assertEqual(item("guntrap")["slugEs"], "trabuco")
        redirects = [i for i in data()["items"] if i["redirectOf"]]
        self.assertGreater(len(redirects), 50)
        for i in redirects:
            self.assertIsNone(i["slug"], i["id"])
            self.assertIsNone(i["slugEs"], i["id"])

    def test_sin_objetos_de_desarrollo(self):
        ids = {i["id"] for i in data()["items"]}
        self.assertFalse(ids & extract.EXCLUDED)
        for i in data()["items"]:
            self.assertIsNone(re.search(r"WIP", i["name"]["en"]), i["id"])
            self.assertFalse(i["name"]["en"].startswith("Test "), i["id"])

    def test_la_rocola_no_es_la_boom_box(self):
        # El token `jukebox` está en el engine.json como `Jukebox`: se busca sin distinguir mayúsculas.
        self.assertEqual(item("jukebox")["name"], {"en": "Jukebox", "es": "Rocola"})
        self.assertNotEqual(item("jukebox")["slug"], item("boombox")["slug"])

    def test_ingredientes_que_existen(self):
        ids = {i["id"] for i in data()["items"]}
        for it in data()["items"]:
            for ing in (it["craft"] or {}).get("ingredients", []):
                self.assertIn(ing["id"], ids, f"{it['id']} pide {ing['id']}")

    def test_los_objetos_de_la_portada_existen_y_no_son_redirects(self):
        by_id = {i["id"]: i for i in data()["items"]}
        for sid in extract.HOME_ITEMS:
            self.assertIn(sid, by_id)
            self.assertIsNone(by_id[sid]["redirectOf"], sid)


if __name__ == "__main__":
    unittest.main()
