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
_W = None


def W():
    """Un solo `World` para todos los tests (abrir los tres bundles tarda ~20 s)."""
    global _W
    if _W is None:
        _W = world.World()
    return _W


def data():
    global _DATA
    if _DATA is None:
        _DATA = world.collect(W())
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

    def test_el_maximo_suma_las_tiradas(self):
        # Dos tiradas de 2–4: hasta 8 en la misma caja.
        tt = {"lootDefinition": leaf("a", amount=2, max_amount=5), "maxDefinitionsToSpawn": 2, "LootSpawnSlots": [], "scrapAmount": 0}
        self.assertEqual(world.container_chances(tt, lambda x: x)[("a", False)], (1.0, 2, 8))

    def test_una_rama_de_peso_cero_no_suma_cantidad(self):
        # `ScientistLoot` tiene ramas de peso 0 (hacia `ToolsBasic` y `GunParts`): nunca salen, así que su cantidad no
        # puede sumarse al máximo de la caja aunque el mismo objeto venga por otra rama.
        tree = node((1, leaf("a", amount=1, max_amount=3)), (0, leaf("a", amount=5, max_amount=11)))
        tt = {"lootDefinition": tree, "maxDefinitionsToSpawn": 2, "LootSpawnSlots": [], "scrapAmount": 0}
        self.assertEqual(world.container_chances(tt, lambda x: x)[("a", False)], (1.0, 1, 4))

    def test_un_arbol_sin_peso_no_da_cantidad(self):
        self.assertEqual(world.amounts(node((0, leaf("a"))), lambda x: x), {})

    def test_npc_la_cantidad_sale_de_la_ranura_mas_probable(self):
        # Un NPC: la cantidad es la de la ranura que más probabilidad le aporta al objeto (la primera: 1 − 0,7² = 0,51
        # contra 0,4), con sus dos tiradas sumadas (2 × 2–4 = 2–8). La ranura de ×10–20 no entra en el rango aunque sea
        # mayor. La probabilidad sí combina las dos. Una caja suma todo: 2–(8 + 19).
        tt = {"lootDefinition": None, "maxDefinitionsToSpawn": 0, "scrapAmount": 0, "LootSpawnSlots": [
            {"definition": leaf("a", amount=2, max_amount=5), "numberToSpawn": 2, "probability": 0.3},
            {"definition": leaf("a", amount=10, max_amount=20), "numberToSpawn": 1, "probability": 0.4},
        ]}
        npc = world.container_chances(tt, lambda x: x, sum_slots=False)[("a", False)]
        self.assertAlmostEqual(npc[0], 1 - 0.7 ** 2 * 0.6)
        self.assertEqual(npc[1:], (2, 8))
        self.assertEqual(world.container_chances(tt, lambda x: x)[("a", False)][1:], (2, 27))

    def test_una_ranura_imposible_no_cuenta(self):
        tt = {"lootDefinition": None, "maxDefinitionsToSpawn": 0, "scrapAmount": 0, "LootSpawnSlots": [
            {"definition": leaf("a"), "numberToSpawn": 1, "probability": 0.0},
            {"definition": leaf("a"), "numberToSpawn": 1, "probability": 0.5},
        ]}
        self.assertEqual(world.container_chances(tt, lambda x: x)[("a", False)], (0.5, 1, 1))


class TestNpcChances(unittest.TestCase):
    """Un NPC elige un equipo al azar (todos igual de probables): la chance es el promedio entre equipos."""

    def test_promedio_entre_equipos(self):
        a = {("x", False): (1.0, 1, 1)}
        b = {("x", False): (0.5, 1, 2), ("y", False): (0.2, 3, 3)}
        got = world.npc_chances([a, b])
        self.assertAlmostEqual(got[("x", False)][0], 0.75)
        self.assertEqual(got[("x", False)][1:], (1, 2))
        self.assertAlmostEqual(got[("y", False)][0], 0.1)
        self.assertEqual(got[("y", False)][1:], (3, 3))


class _FakeFile:
    def __init__(self):
        self.name, self.externals, self.objects = "fake", [], {}


class _FakeObj:
    def __init__(self, af, pid, tt):
        self.assets_file, self.path_id, self._tt = af, pid, tt
        af.objects[pid] = self

    def read_typetree(self):
        return self._tt


class TestSpawnTreeCiclo(unittest.TestCase):
    """`World.spawn_tree` sobre objetos de mentira, sin abrir el juego."""

    def test_una_rama_que_se_elige_a_si_misma_es_volver_a_tirar(self):
        # Como `Collection.Ballistic`: si sale la rama que apunta a la misma tabla, el juego vuelve a tirar. Equivale a
        # sacarla del sorteo: a y b quedan mitad y mitad (no 1/4 cada uno, que sería contar la rama como vacía).
        af = _FakeFile()

        def ref(pid):
            return {"m_FileID": 0, "m_PathID": pid}

        for pid, sid in ((10, "a"), (11, "b")):
            _FakeObj(af, pid, {"shortname": sid})
        for pid, item in ((2, 10), (3, 11)):
            _FakeObj(af, pid, {"m_Name": f"hoja{pid}", "subSpawn": [],
                               "items": [{"itemDef": ref(item), "amount": 1, "isBP": 0, "maxAmount": -1}]})
        _FakeObj(af, 1, {"m_Name": "ciclo", "items": [], "subSpawn": [
            {"weight": 1, "category": ref(2), "extraSpawns": 0},
            {"weight": 1, "category": ref(3), "extraSpawns": 0},
            {"weight": 2, "category": ref(1), "extraSpawns": 0},
        ]})
        w = world.World.__new__(world.World)
        w.files, w.trees, w.spawns, w.unresolved = {"fake": af}, {}, {}, {}
        tree = w.spawn_tree(af.objects[1], ref(1))
        got = world.roll_chances(tree, lambda x: x)
        self.assertAlmostEqual(got[("a", False)], 0.5)
        self.assertAlmostEqual(got[("b", False)], 0.5)


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

    def test_totales_contando_todas_las_tiradas(self):
        # Contra rusthelp.com (2026-10-05): AK ×1–2 en la bloqueada, ×1–3 en la de élite, ×1 en la del helicóptero.
        def rows(sid):
            return {r["c"]: r for r in data()["loot"]["items"][sid] if not r["bp"]}

        ak = rows("rifle.ak")
        self.assertAlmostEqual(ak["locked"]["chance"], 0.2845, places=3)
        self.assertEqual((ak["locked"]["min"], ak["locked"]["max"]), (1, 2))
        self.assertEqual((ak["elite"]["min"], ak["elite"]["max"]), (1, 3))
        self.assertEqual((ak["heli"]["min"], ak["heli"]["max"]), (1, 1))
        c4 = rows("explosive.timed")
        self.assertAlmostEqual(c4["supply"]["chance"], 0.2653, places=3)
        self.assertEqual(c4["supply"]["max"], 2)
        self.assertAlmostEqual(c4["bradley"]["chance"], 0.36, places=3)
        self.assertEqual((rows("gears")["locked"]["min"], rows("gears")["locked"]["max"]), (5, 10))

    def test_la_entrega_de_papa_noel(self):
        src = data()["loot"]["containers"]["santa"]
        self.assertEqual((src["es"], src["kind"], src["event"]), ("Entrega aérea de Papá Noel", "box", "xmas"))
        c4 = {r["c"]: r for r in data()["loot"]["items"]["explosive.timed"] if not r["bp"]}
        self.assertAlmostEqual(c4["santa"]["chance"], 0.1429, places=3)
        self.assertEqual((c4["santa"]["min"], c4["santa"]["max"]), (1, 1))

    def test_que_cajas_gastan_lo_que_sale(self):
        boxes = data()["loot"]["containers"]
        self.assertEqual(boxes["elite"]["worn"], "all")
        self.assertEqual(boxes["military"]["worn"], "all")
        self.assertEqual(boxes["locked"]["worn"], "none")
        self.assertEqual(boxes["heli"]["worn"], "none")
        self.assertEqual(boxes["barrel"]["worn"], "some")  # los del costado del camino sí, los de autospawn no

    def test_ningun_lootspawn_entra_en_ciclo(self):
        # `Collection.Ballistic` se elige a sí misma en una rama: antes era una recursión infinita.
        w = W()
        for o, tt, _ in w.behaviours({"LootSpawn"}):
            tree = w.spawn_tree(o, {"m_FileID": 0, "m_PathID": o.path_id})
            self.assertIsNotNone(tree, tt["m_Name"])
            for p in world.roll_chances(tree, lambda x: x).values():
                self.assertTrue(0 <= p <= 1 + 1e-9, tt["m_Name"])

    def test_cientificos_pesados(self):
        # Contra rusthelp.com (2026-10-05): AK 1,8 % y munición de 40 mm 20,86 % ×4–21 en los de la plataforma y del
        # Bradley. La cantidad de un NPC es la de la ranura que más le aporta al objeto (con sus tiradas repetidas
        # sumadas): el AK sale de `Collection.Weapons` (1,56 %, ×1) o de `RadTownElite` (0,24 %, ×1), así que ×1.
        # rusthelp da ×1–2 porque para el AK suma las dos ranuras, pero no lo hace con la 5,56 (no suma el kit de la
        # minigun): se sigue una sola regla para todos los objetos.
        ak = {r["c"]: r for r in data()["loot"]["items"]["rifle.ak"] if not r["bp"]}
        for key in ("heavy", "heavy_bradley"):
            self.assertAlmostEqual(ak[key]["chance"], 0.018, places=3)
            self.assertEqual((ak[key]["min"], ak[key]["max"]), (1, 1))
        # 5,56: la ranura de munición, tirada tres veces (rusthelp: ×12–36); no la suma de todos los kits (×136).
        rifle = {r["c"]: r for r in data()["loot"]["items"]["ammo.rifle"] if not r["bp"]}
        for key in ("heavy", "heavy_bradley"):
            self.assertEqual((rifle[key]["min"], rifle[key]["max"]), (12, 36), key)
        # La minigun sólo la trae el pesado de la plataforma, y sólo con ese equipo (uno de cuatro): 0,2 / 4.
        minigun = {r["c"]: r for r in data()["loot"]["items"]["minigun"] if not r["bp"]}
        self.assertAlmostEqual(minigun["heavy"]["chance"], 0.05, places=4)
        self.assertNotIn("heavy_bradley", minigun)
        mgl = {r["c"]: r for r in data()["loot"]["items"]["ammo.grenadelauncher.buckshot"]}
        self.assertAlmostEqual(mgl["heavy"]["chance"], 0.2085, places=3)
        self.assertEqual((mgl["heavy"]["min"], mgl["heavy"]["max"]), (4, 21))

    def test_cientificos_y_moradores(self):
        gears = {r["c"]: r for r in data()["loot"]["items"]["gears"] if not r["bp"]}
        self.assertAlmostEqual(gears["scientist"]["chance"], 0.0473, places=3)
        self.assertAlmostEqual(gears["tunnel_dweller"]["chance"], 0.0743, places=3)
        self.assertAlmostEqual(gears["scarecrow"]["chance"], 0.0875, places=3)
        srcs = data()["loot"]["containers"]
        self.assertEqual((srcs["heavy"]["kind"], srcs["heavy"]["worn"]), ("npc", "none"))
        self.assertEqual(srcs["tunnel_dweller"]["es"], "Morador subterráneo")
        self.assertEqual(srcs["scarecrow"]["event"], "halloween")
        self.assertEqual(srcs["gingerbread"]["event"], "xmas")
        for key in set(world.NPCS.values()):
            self.assertTrue(srcs[key]["en"] and srcs[key]["es"], key)

    def test_los_npc_de_una_clave_tienen_la_misma_tabla(self):
        for key in set(world.NPCS.values()):
            self.assertEqual(len(set(data()["tables"][key].values())), 1, key)

    def test_recolectables(self):
        # rusthelp.com (2026-10-05): "Metal (collectable) ×50", "Halloween Metal (collectable) ×75".
        def row(sid, key):
            return next(r for r in data()["loot"]["items"][sid] if r["c"] == key)

        self.assertEqual((row("metal.ore", "collect_metalore")["chance"], row("metal.ore", "collect_metalore")["min"]), (1, 50))
        self.assertEqual(row("metal.ore", "collect_halloween_metalore")["min"], 75)
        self.assertEqual(row("cloth", "collect_hemp")["min"], 10)
        srcs = data()["loot"]["containers"]
        self.assertEqual((srcs["collect_hemp"]["kind"], srcs["collect_hemp"]["event"]), ("collect", None))
        self.assertEqual(srcs["collect_halloween_metalore"]["event"], "halloween")

    def test_lo_que_se_abre(self):
        # rusthelp.com: regalo pequeño 12,99 % de fragmentos ×25–49; bolsa chica de Halloween 11,11 %; regalo grande
        # 13,33 % de escopeta de corredera.
        def row(sid, key):
            return next(r for r in data()["loot"]["items"][sid] if r["c"] == key)

        small = row("metal.fragments", "open_xmas.present.small")
        self.assertAlmostEqual(small["chance"], 0.1299, places=3)
        self.assertEqual((small["min"], small["max"]), (25, 49))
        self.assertAlmostEqual(row("metal.fragments", "open_halloween.lootbag.small")["chance"], 0.1111, places=3)
        self.assertAlmostEqual(row("shotgun.pump", "open_xmas.present.large")["chance"], 0.1333, places=3)
        src = data()["loot"]["containers"]["open_xmas.present.small"]
        self.assertEqual((src["kind"], src["item"], src["event"]), ("item", "xmas.present.small", "xmas"))
        self.assertEqual(data()["loot"]["containers"]["open_easter.goldegg"]["event"], "easter")

    def test_mesa_de_mezcla(self):
        recipes = {r["out"]: r for r in data()["mixing"]["recipes"]}
        self.assertEqual(len(data()["mixing"]["recipes"]), 39)
        ammo = recipes["ammo.rifle"]
        self.assertEqual((ammo["amount"], ammo["bp"]), (3, True))
        self.assertEqual(ammo["in"], [{"id": "gunpowder", "amount": 5}, {"id": "metal.fragments", "amount": 10}])
        self.assertEqual(recipes["gunpowder"]["in"], [{"id": "sulfur", "amount": 20}, {"id": "charcoal", "amount": 20}])
        self.assertEqual(recipes["healingtea"]["in"], [{"id": "red.berry", "amount": 4}])


if __name__ == "__main__":
    unittest.main()
