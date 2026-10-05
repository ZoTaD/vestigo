"""
Tests de `site_data.py` (2026-10-05): lo que baja el sitio para la pestaña Objetos. No necesitan el juego: usan datos
sintéticos y, si existen, los JSON ya extraídos.

Uso (desde la raíz del worktree):
    python -m unittest discover -s games/rust/tools/tests -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import site_data as rust_site  # noqa: E402  (no se llama `site.py`: Python ya importó su `site` al arrancar)


def it(sid, en, es=None, cat="weapon", craft=None, recycle=None, redirect=None):
    return {
        "id": sid, "itemid": 1, "slug": None if redirect else en.lower().replace(" ", "-"),
        "slugEs": None if redirect else (es or en).lower().replace(" ", "-"),
        "name": {"en": en, "es": es}, "desc": {"en": "d", "es": None}, "category": cat, "rarity": "rare", "stack": 1,
        "condition": None, "redirectOf": redirect, "craft": craft, "recycle": recycle, "icon": True,
    }


DOC = {
    "recyclers": [{"key": "red", "eff": 0.75}, {"key": "green_power", "eff": 0.6}, {"key": "green", "eff": 0.5}, {"key": "yellow", "eff": 0.4}],
    "items": [
        it("rifle.ak", "Assault Rifle", "Fusil de asalto", craft={
            "ingredients": [{"id": "wood", "amount": 200}], "amount": 1, "time": 45, "workbench": 3,
            "researchable": True, "researchScrap": 500, "default": False,
        }, recycle={"scrap": 0, "out": [{"id": "wood", "amount": 200}]}),
        it("wood", "Wood", "Madera", cat="resources"),
        it("scrap", "Scrap", "Chatarra", cat="resources"),
        it("rifle.ak.ice", "Ice AK", None, redirect="rifle.ak"),
    ],
}
LOOT = {
    "containers": {"elite": {"en": "Elite Crate", "es": "Caja de élite"}},
    "items": {"rifle.ak": [{"c": "elite", "chance": 0.1, "min": 1, "max": 1, "bp": False}]},
}
SHOPS = {
    "shops": {"outpost": {"en": "Outpost", "es": "Puesto Avanzado"}},
    "orders": [{"shop": "outpost", "item": "wood", "amount": 1000, "bp": False, "currency": "scrap", "price": 50}],
}


class TestShard(unittest.TestCase):
    def test_igual_que_pzShardOf(self):
        # Los mismos valores que da `pzShardOf(slug, 32)` de site/src/zomboid/shard.ts (lo prueba también rustItemsData.test.ts).
        self.assertEqual(rust_site.fnv1a32(""), 0x811C9DC5)
        self.assertEqual(rust_site.fnv1a32("a"), 0xE40C292C)
        self.assertEqual(rust_site.shard("a"), f"{0xE40C292C % 32:02d}")


class TestBuild(unittest.TestCase):
    def setUp(self):
        self.out = rust_site.build(DOC, LOOT, SHOPS)
        self.fichas = self.out["fichas"]

    def test_la_lista_sin_redirects_y_ordenada(self):
        rows = self.out["list"]["rows"]
        self.assertEqual([r["id"] for r in rows], ["rifle.ak", "scrap", "wood"])
        self.assertEqual(rows[0], {"id": "rifle.ak", "slug": "assault-rifle", "slugEs": "fusil-de-asalto", "en": "Assault Rifle", "es": "Fusil de asalto", "cat": "weapon"})
        self.assertEqual(self.out["list"]["cats"], ["weapon", "resources"])

    def test_la_receta_con_referencias_y_se_usa_en(self):
        ak = self.fichas["assault-rifle"]
        self.assertEqual(ak["craft"]["ingredients"], [{"id": "wood", "slug": "wood", "name": {"en": "Wood", "es": "Madera"}, "amount": 200}])
        self.assertEqual(ak["craft"]["researchScrap"], 500)
        self.assertEqual([r["id"] for r in self.fichas["wood"]["usedIn"]], ["rifle.ak"])

    def test_reciclaje_con_las_eficiencias(self):
        rec = self.fichas["assault-rifle"]["recycle"]
        self.assertEqual([e["key"] for e in rec["eff"]], ["red", "green_power", "green", "yellow"])
        self.assertEqual(rec["out"][0]["slug"], "wood")

    def test_despawn_reparacion_y_efectos(self):
        doc = json.loads(json.dumps(DOC))
        ak = doc["items"][0]
        ak.update({"despawn": 3600, "repair": {"cost": [{"id": "wood", "amount": 40}], "bp": True, "loss": 0.2},
                   "use": {"effects": [{"stat": "health", "amount": 15, "time": 0}], "mods": [], "spoil": {"hours": 24, "into": "wood"}}})
        f = rust_site.build(doc, LOOT, SHOPS)["fichas"]["assault-rifle"]
        self.assertEqual(f["despawn"], 3600)
        self.assertEqual(f["repair"]["cost"], [{"id": "wood", "slug": "wood", "name": {"en": "Wood", "es": "Madera"}, "amount": 40}])
        self.assertEqual((f["repair"]["bp"], f["repair"]["loss"]), (True, 0.2))
        self.assertEqual(f["use"]["spoil"], {"hours": 24, "into": {"id": "wood", "slug": "wood", "name": {"en": "Wood", "es": "Madera"}}})
        self.assertIsNone(self.fichas["wood"]["repair"])

    def test_use_of_con_modificadores_y_sin_objeto_al_pudrirse(self):
        i = {"use": {"effects": [], "mods": [{"stat": "woodYield", "value": 0.5, "duration": 1800}], "spoil": {"hours": 24, "into": None}}}
        u = rust_site.use_of(i, lambda sid: {"id": sid})
        self.assertEqual(u["mods"], [{"stat": "woodYield", "value": 0.5, "duration": 1800}])
        self.assertEqual(u["spoil"], {"hours": 24, "into": None})
        self.assertIsNone(rust_site.use_of({"use": None}, lambda sid: {"id": sid}))

    def test_se_obtiene_reciclando(self):
        wood = self.fichas["wood"]["recycledFrom"]
        self.assertEqual(wood["rows"], [{"id": "rifle.ak", "slug": "assault-rifle", "name": {"en": "Assault Rifle", "es": "Fusil de asalto"}, "amount": 200, "scrap": False}])
        self.assertEqual([e["key"] for e in wood["eff"]], ["red", "green_power", "green", "yellow"])
        self.assertIsNone(self.fichas["assault-rifle"]["recycledFrom"])

    def test_botin_y_tiendas_con_nombres(self):
        self.assertEqual(self.fichas["assault-rifle"]["loot"], [{"c": "elite", "name": {"en": "Elite Crate", "es": "Caja de élite"}, "chance": 0.1, "min": 1, "max": 1, "bp": False}])
        shop = self.fichas["wood"]["shops"][0]
        self.assertEqual(shop["shop"], {"en": "Outpost", "es": "Puesto Avanzado"})
        self.assertEqual((shop["currency"]["id"], shop["price"], shop["amount"]), ("scrap", 50, 1000))

    def test_los_slugs_en_espanol_solo_los_que_cambian(self):
        self.assertEqual(self.out["slugsEs"], {"items": {"assault-rifle": "fusil-de-asalto", "wood": "madera", "scrap": "chatarra"}})

    def test_secciones_vacias(self):
        scrap = self.fichas["scrap"]
        self.assertEqual((scrap["craft"], scrap["recycle"], scrap["loot"], scrap["shops"], scrap["usedIn"]), (None, None, [], [], []))


REAL = os.path.join(os.path.dirname(__file__), "..", "..", "data")


@unittest.skipUnless(os.path.exists(os.path.join(REAL, "loot.json")), "sin loot.json (correr world.py)")
class TestBuildReal(unittest.TestCase):
    def test_cada_objeto_visible_tiene_ficha_y_cada_ficha_su_archivo(self):
        load = lambda n: json.load(open(os.path.join(REAL, n), encoding="utf-8"))  # noqa: E731
        out = rust_site.build(load("items.json"), load("loot.json"), load("shops.json"))
        visible = [i for i in load("items.json")["items"] if i["slug"]]
        self.assertEqual(len(out["fichas"]), len(visible))
        self.assertEqual(len(out["list"]["rows"]), len(visible))
        for slug, f in out["fichas"].items():
            self.assertIsInstance(f["despawn"], (int, float), slug)
        ak = out["fichas"]["assault-rifle"]
        self.assertTrue(ak["loot"])
        self.assertEqual(ak["craft"]["researchScrap"], 120)
        mf = out["fichas"]["metal-fragments"]["recycledFrom"]["rows"]
        self.assertGreater(len(mf), 300)
        # Orden a la escala de la verde: la chatarra fija vale el doble que su cantidad cruda.
        sc = out["fichas"]["scrap"]["recycledFrom"]["rows"]
        verde = [r["amount"] * 2 if r["scrap"] else r["amount"] for r in sc]
        self.assertEqual(verde, sorted(verde, reverse=True))
        self.assertEqual(mf[0]["id"], "workbench3")  # 1.000 fragmentos por unidad, el que más da
