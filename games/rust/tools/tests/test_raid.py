"""
Tests de `raid.py` (2026-10-05): daño por unidad, golpes, costos y una muestra de valores conocidos de la comunidad.

La parte sin el juego prueba las cuentas con números a mano y con `items.json`. La parte con el juego lee los bundles
una vez y compara ~25 combinaciones objetivo × explosivo con lo que sabe cualquier jugador de Rust. Va detrás de
`solo_con_juego` (RUST_GAME=1): cargar los bundles ocupa varios GB.

Uso (desde la raíz del worktree):
    python -m unittest discover -s games/rust/tools/tests -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
import extract  # noqa: E402
from _game import solo_con_juego  # noqa: E402
import raid  # noqa: E402

_DATA = None


def data():
    """Una sola lectura del juego para todos los tests."""
    global _DATA
    if _DATA is None:
        _DATA = raid.collect()
    return _DATA


def items():
    return {i["id"]: i for i in json.loads((extract.DATA / "items.json").read_text(encoding="utf-8"))["items"]}


class TestDamage(unittest.TestCase):
    def test_suma_por_tipo_con_la_proteccion(self):
        prot = [0.0] * 28
        prot[16], prot[11] = 0.5, 0.98
        self.assertAlmostEqual(raid.damage_per_unit([(16, 275.0), (11, 75.0)], prot), 139.0)

    def test_proteccion_negativa_multiplica(self):
        prot = [0.0] * 28
        prot[16] = -1.0
        self.assertAlmostEqual(raid.damage_per_unit([(16, 550.0)], prot), 1100.0)

    def test_golpes(self):
        self.assertEqual(raid.hits(500, 275), 2)
        self.assertEqual(raid.hits(500, 250), 2)
        self.assertEqual(raid.hits(250, 247.5), 2)
        self.assertIsNone(raid.hits(500, 0))


class TestCraftCost(unittest.TestCase):
    def test_azufre_y_polvora_de_cada_explosivo(self):
        it = items()
        want = {
            "explosive.timed": (2200, 1000), "ammo.rocket.basic": (1400, 650), "ammo.rocket.hv": (200, 100),
            "grenade.beancan": (120, 60), "explosive.satchel": (480, 240), "ammo.rifle.explosive": (25, 10),
        }
        for sid, (sulfur, gunpowder) in want.items():
            c = raid.craft_cost(sid, it)
            self.assertAlmostEqual(c["raw"]["sulfur"], sulfur, msg=sid)
            self.assertAlmostEqual(c["gunpowder"], gunpowder, msg=sid)

    def test_lo_que_no_se_craftea_no_tiene_costo(self):
        self.assertIsNone(raid.craft_cost("ammo.grenadelauncher.he", items()))


# (objetivo, explosivo) → golpes exactos, sin contar fallas. Ver "Global Constraints" del plan.
KNOWN = {
    ("building.wood", "explosive.timed"): 1, ("building.wood", "ammo.rocket.basic"): 2, ("building.wood", "explosive.satchel"): 3,
    ("building.stone", "explosive.timed"): 2, ("building.stone", "ammo.rocket.basic"): 4, ("building.stone", "explosive.satchel"): 10,
    ("building.stone", "grenade.beancan"): 46,
    ("building.metal", "explosive.timed"): 4, ("building.metal", "ammo.rocket.basic"): 8, ("building.metal", "explosive.satchel"): 23,
    ("building.toptier", "explosive.timed"): 8, ("building.toptier", "ammo.rocket.basic"): 15, ("building.toptier", "explosive.satchel"): 46,
    ("door.hinged.metal", "explosive.timed"): 1, ("door.hinged.metal", "ammo.rocket.basic"): 2, ("door.hinged.metal", "explosive.satchel"): 4,
    ("wall.frame.garagedoor", "explosive.timed"): 2, ("wall.frame.garagedoor", "ammo.rocket.basic"): 3, ("wall.frame.garagedoor", "explosive.satchel"): 9,
    ("door.hinged.wood", "explosive.satchel"): 2,
}
# La bala explosiva, con ±2 (los decimales de la parte de bala).
KNOWN_AMMO = {"building.stone": 185, "building.wood": 49, "building.metal": 400, "door.hinged.metal": 63, "wall.frame.garagedoor": 150}


@solo_con_juego
class TestRaidInGame(unittest.TestCase):
    def target(self, tid):
        return next(t for t in data()["targets"] if t["id"] == tid)

    def test_valores_conocidos_de_la_comunidad(self):
        for (tid, eid), want in KNOWN.items():
            t = self.target(tid)
            self.assertEqual(raid.hits(t["hp"], t["dmg"][eid]), want, (tid, eid, t["hp"], t["dmg"][eid]))

    def test_bala_explosiva(self):
        for tid, want in KNOWN_AMMO.items():
            t = self.target(tid)
            got = raid.hits(t["hp"], t["dmg"]["ammo.rifle.explosive"])
            self.assertLessEqual(abs(got - want), 2, (tid, got, want))

    def test_vida_de_los_grados_y_puertas(self):
        want = {"building.twigs": 10, "building.wood": 250, "building.stone": 500, "building.metal": 1000, "building.toptier": 2000,
                "door.hinged.metal": 250, "door.hinged.toptier": 1000, "wall.frame.garagedoor": 600, "cupboard.tool": 100}
        for tid, hp in want.items():
            self.assertEqual(self.target(tid)["hp"], hp, tid)

    def test_cada_explosivo_con_nombre_y_falla(self):
        ex = {e["id"]: e for e in data()["explosives"]}
        self.assertEqual(ex["explosive.satchel"]["dud"], 0.2)
        self.assertEqual(ex["grenade.beancan"]["dud"], 0.15)
        self.assertEqual(ex["explosive.timed"]["dud"], 0)
        self.assertEqual(ex["explosive.timed"]["name"]["es"], "Carga explosiva con temporizador")
        self.assertIsNone(ex["ammo.grenadelauncher.he"]["cost"])

    def test_todos_los_objetivos_tienen_nombre_y_algo_que_los_rompe(self):
        for t in data()["targets"]:
            self.assertTrue(t["name"]["en"] and t["name"]["es"], t["id"])
            self.assertTrue(t["dmg"], t["id"])


if __name__ == "__main__":
    unittest.main()
