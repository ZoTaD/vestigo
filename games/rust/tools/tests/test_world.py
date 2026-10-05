"""
Tests de `world.py` (2026-10-05): el botín de cada caja y las tiendas de cada monumento.

La parte sin el juego prueba la cuenta de probabilidades con árboles sintéticos. La parte con el juego lee
`assetscenes.bundle`, `content.bundle` e `items.preload.bundle` (~1 min) una sola vez para todos los tests.

Uso (desde la raíz del worktree):
    python -m unittest discover -s games/rust/tools/tests -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import extract  # noqa: E402
import world  # noqa: E402

HAVE_GAME = (extract.BUNDLES / "shared" / "assetscenes.bundle").exists()
_DATA = None


def data():
    global _DATA
    if _DATA is None:
        _DATA = world.collect()
    return _DATA


def leaf(*sids, bp=False, amount=1.0, max_amount=-1.0):
    return {"subSpawn": [], "items": [{"sid": s, "amount": amount, "isBP": int(bp), "maxAmount": max_amount} for s in sids]}


def node(*children):
    """children: (peso, subárbol)."""
    return {"subSpawn": [{"weight": w, "category": c, "extraSpawns": 0} for w, c in children], "items": []}


def node_extra(*children):
    """children: (peso, subárbol, extraSpawns)."""
    return {"subSpawn": [{"weight": w, "category": c, "extraSpawns": e} for w, c, e in children], "items": []}


class TestRollChances(unittest.TestCase):
    """`roll_chances` con árboles armados a mano: `resolve` es la identidad y los ítems traen `sid` ya resuelto."""

    def test_una_hoja_da_todos_sus_items(self):
        self.assertEqual(world.roll_chances(leaf("a", "b"), lambda x: x), {("a", False): 1.0, ("b", False): 1.0})

    def test_una_rama_elige_una_por_peso(self):
        tree = node((1, leaf("a")), (3, leaf("b")))
        got = world.roll_chances(tree, lambda x: x)
        self.assertAlmostEqual(got[("a", False)], 0.25)
        self.assertAlmostEqual(got[("b", False)], 0.75)

    def test_las_probabilidades_se_multiplican_por_nivel(self):
        tree = node((1, node((1, leaf("a")), (1, leaf("b")))), (1, leaf("c")))
        got = world.roll_chances(tree, lambda x: x)
        self.assertAlmostEqual(got[("a", False)], 0.25)
        self.assertAlmostEqual(got[("c", False)], 0.5)

    def test_una_categoria_vacia_cuenta_en_el_peso_y_no_da_nada(self):
        tree = node((1, leaf("a")), (1, None))
        self.assertAlmostEqual(world.roll_chances(tree, lambda x: x)[("a", False)], 0.5)

    def test_un_plano_va_aparte(self):
        self.assertEqual(world.roll_chances(leaf("a", bp=True), lambda x: x), {("a", True): 1.0})

    def test_extra_spawns_tira_la_subcategoria_otra_vez(self):
        # La rama elegida se tira 1 + extraSpawns veces: 1 − (1 − 0,5)² = 0,75; y la rama sale la mitad de las veces.
        inner = node((1, leaf("a")), (1, leaf("b")))
        tree = node_extra((1, inner, 1), (1, leaf("c"), 0))
        got = world.roll_chances(tree, lambda x: x)
        self.assertAlmostEqual(got[("a", False)], 0.5 * 0.75)
        self.assertAlmostEqual(got[("c", False)], 0.5)


class TestContainerChances(unittest.TestCase):
    def test_tiradas_de_la_definicion(self):
        tt = {"lootDefinition": node((1, leaf("a")), (1, leaf("b"))), "maxDefinitionsToSpawn": 2, "LootSpawnSlots": [], "scrapAmount": 0}
        got = world.container_chances(tt, lambda x: x)
        # 1 − (1 − 0,5)² = 0,75
        self.assertAlmostEqual(got[("a", False)][0], 0.75)

    def test_las_ranuras_mandan_sobre_la_definicion(self):
        tt = {
            "lootDefinition": leaf("x"), "maxDefinitionsToSpawn": 1, "scrapAmount": 0,
            "LootSpawnSlots": [{"definition": leaf("a"), "numberToSpawn": 2, "probability": 0.5}],
        }
        got = world.container_chances(tt, lambda x: x)
        self.assertNotIn(("x", False), got)
        self.assertAlmostEqual(got[("a", False)][0], 0.75)

    def test_la_chatarra_fija(self):
        tt = {"lootDefinition": None, "maxDefinitionsToSpawn": 0, "LootSpawnSlots": [], "scrapAmount": 25}
        self.assertEqual(world.container_chances(tt, lambda x: x)[("scrap", False)], (1.0, 25, 25))

    def test_cantidades(self):
        # El brief esperaba 2–5, pero el juego hace `(int)Random.Range(amount, maxAmount)` con floats
        # (`ItemAmountRanged.GetAmount` y `LootSpawn.SpawnIntoContainer`, decompilado en
        # github.com/MillionthOdin16/RustChangelog): trunca, y el 5 no sale nunca. Corregido con el visto bueno de ZoTaD.
        tt = {"lootDefinition": leaf("a", amount=2, max_amount=5), "maxDefinitionsToSpawn": 1, "LootSpawnSlots": [], "scrapAmount": 0}
        self.assertEqual(world.container_chances(tt, lambda x: x)[("a", False)], (1.0, 2, 4))

    def test_cantidades_con_maximo_pegado_al_minimo(self):
        # maxAmount apenas por encima de amount: el rango truncado queda en el mínimo, nunca por debajo.
        tt = {"lootDefinition": leaf("a", amount=2, max_amount=2.5), "maxDefinitionsToSpawn": 1, "LootSpawnSlots": [], "scrapAmount": 0}
        self.assertEqual(world.container_chances(tt, lambda x: x)[("a", False)], (1.0, 2, 2))

    def test_cantidades_con_extra_spawns(self):
        # Tres tiradas de 2–4 (ver `test_cantidades`): hasta 12.
        tree = node_extra((1, leaf("a", amount=2, max_amount=5), 2))
        tt = {"lootDefinition": tree, "maxDefinitionsToSpawn": 1, "LootSpawnSlots": [], "scrapAmount": 0}
        self.assertEqual(world.container_chances(tt, lambda x: x)[("a", False)], (1.0, 2, 12))

    def test_la_chatarra_fija_se_suma_a_la_del_arbol(self):
        # `GenerateScrap` mete `scrapAmount` además de lo que dio el botín, no en su lugar.
        seguro = {"lootDefinition": leaf("scrap", amount=5), "maxDefinitionsToSpawn": 1, "LootSpawnSlots": [], "scrapAmount": 25}
        self.assertEqual(world.container_chances(seguro, lambda x: x)[("scrap", False)], (1.0, 30, 30))
        a_veces = {"lootDefinition": node((1, leaf("scrap", amount=5)), (1, leaf("b"))), "maxDefinitionsToSpawn": 1,
                   "LootSpawnSlots": [], "scrapAmount": 25}
        self.assertEqual(world.container_chances(a_veces, lambda x: x)[("scrap", False)], (1.0, 25, 30))


@unittest.skipUnless(HAVE_GAME, "sin el juego instalado")
class TestWorldInGame(unittest.TestCase):
    def test_las_cajas_conocidas_estan_con_nombre_en_los_dos_idiomas(self):
        boxes = data()["loot"]["containers"]
        for key in ("elite", "military", "crate", "basic", "tools", "barrel", "locked", "heli", "bradley", "supply"):
            self.assertIn(key, boxes)
            self.assertTrue(boxes[key]["en"] and boxes[key]["es"], key)

    def test_la_ak_sale_de_la_caja_de_elite_y_no_de_un_barril(self):
        ak = {e["c"]: e for e in data()["loot"]["items"]["rifle.ak"] if not e["bp"]}
        self.assertIn("elite", ak)
        self.assertGreater(ak["elite"]["chance"], 0)
        self.assertLess(ak["elite"]["chance"], 1)
        self.assertNotIn("barrel", ak)

    def test_la_chatarra_fija_de_la_caja_de_elite(self):
        scrap = {e["c"]: e for e in data()["loot"]["items"]["scrap"]}
        self.assertEqual((scrap["elite"]["chance"], scrap["elite"]["min"]), (1.0, 25))

    def test_probabilidades_validas_y_ordenadas(self):
        for sid, rows in data()["loot"]["items"].items():
            chances = [r["chance"] for r in rows]
            self.assertEqual(chances, sorted(chances, reverse=True), sid)
            for r in rows:
                self.assertTrue(0 < r["chance"] <= 1, (sid, r))
                self.assertTrue(1 <= r["min"] <= r["max"], (sid, r))

    def test_cada_clave_junta_prefabs_con_la_misma_tabla(self):
        for key, prefabs in data()["tables"].items():
            self.assertEqual(len(set(prefabs.values())), 1, (key, sorted(prefabs)))

    def test_las_variantes_de_la_caja_bloqueada_son_la_misma_caja(self):
        locked = data()["tables"]["locked"]
        for base in ("codelockedhackablecrate", "codelockedhackablecrate_oilrig", "codelockedhackablecrate_ghostship"):
            self.assertIn(base, locked)

    def test_cajas_nuevas_con_nombre(self):
        boxes = data()["loot"]["containers"]
        for key in ("jungle", "shore", "cannons", "medical_lab", "military_wagon"):
            self.assertTrue(boxes[key]["en"] and boxes[key]["es"], key)

    def test_tiendas_de_outpost_y_bandit_camp(self):
        shops = data()["shops"]
        self.assertEqual(shops["shops"]["outpost"]["es"], "Puesto Avanzado")
        self.assertEqual(shops["shops"]["bandit"]["en"], "Bandit Camp")
        where = {o["shop"] for o in shops["orders"]}
        self.assertTrue({"outpost", "bandit", "fishing"} <= where)

    def test_cada_orden_apunta_a_objetos_conocidos(self):
        # Contra el items.json ya extraído (Task 1), que no lleva los ocultos. Si falla por un objeto oculto, esa orden
        # no se puede mostrar (no tiene ficha): se filtra en `collect_shops`, no se toca el test.
        ids = {i["id"] for i in json.loads((extract.DATA / "items.json").read_text(encoding="utf-8"))["items"]}
        for o in data()["shops"]["orders"]:
            self.assertIn(o["item"], ids, o)
            self.assertIn(o["currency"], ids, o)
            self.assertGreater(o["price"], 0, o)


if __name__ == "__main__":
    unittest.main()
