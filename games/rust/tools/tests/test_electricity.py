"""
Tests de `electricity.py` (2026-10-09): los componentes de la pestaña Electricidad.

La forma del JSON versionado se prueba siempre. Rehacerlo desde la caché (`games/rust/cache/io/`, ~15 MB, no versionada)
sólo con `RUST_CACHE=1`: no abre bundles, pero la caché no está en todas las copias del repo.

Uso (desde la raíz del worktree):
    python -m unittest games/rust/tools/tests/test_electricity.py -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import electricity  # noqa: E402

DATA = electricity.OUT
CACHE = os.environ.get("RUST_CACHE") == "1" and electricity.PREFABS.exists()


def by_id(doc):
    return {c["id"]: c for c in doc["components"]}


class Forma(unittest.TestCase):
    """El JSON versionado: lo que el sitio lee."""

    @classmethod
    def setUpClass(cls):
        cls.doc = json.loads(DATA.read_text(encoding="utf-8"))
        cls.c = by_id(cls.doc)

    def test_cada_componente_tiene_lo_que_el_motor_necesita(self):
        self.assertGreater(len(self.doc["components"]), 50)
        for c in self.doc["components"]:
            with self.subTest(c["id"]):
                for k in ("id", "cls", "cat", "name", "in", "out", "use", "useSrc", "p"):
                    self.assertIn(k, c)
                self.assertTrue(c["name"]["en"])
                self.assertIn(c["cat"], self.doc["categories"])
                self.assertIsInstance(c["use"], int)
                self.assertIn(c["useSrc"], ("field", "code", "formula", "base", "nocode"))
                for s in c["in"] + c["out"]:
                    self.assertIn(s["t"], (0, 1, 2, 3, 4))
                # Algo eléctrico: si no, no es de esta pestaña.
                self.assertTrue(any(s["t"] == 0 for s in c["in"] + c["out"]))

    def test_ningun_componente_sin_consumo_ni_generacion(self):
        for c in self.doc["components"]:
            with self.subTest(c["id"]):
                if c["cat"] == "source":
                    self.assertGreater(c["gen"], 0)
                else:
                    self.assertGreaterEqual(c["use"], 0)

    def test_numeros_conocidos(self):
        gen = {k: self.c[k]["gen"] for k in ("electric.solarpanel.large", "generator.wind.scrap", "generator.water",
                                              "electric.fuelgenerator.small")}
        self.assertEqual(gen, {"electric.solarpanel.large": 20, "generator.wind.scrap": 150, "generator.water": 30,
                               "electric.fuelgenerator.small": 40})
        bat = {k: (self.c[k]["p"]["maxOutput"], self.c[k]["p"]["maxCapactiySeconds"] / 60)
               for k in ("electric.battery.rechargable.small", "electric.battery.rechargable.medium",
                         "electric.battery.rechargable.large")}
        self.assertEqual(list(bat.values()), [(15, 400), (50, 9000), (100, 24000)])
        use = {k: self.c[k]["use"] for k in ("autoturret", "samsite", "electric.teslacoil", "electric.heater",
                                              "electric.simplelight", "electric.splitter", "electric.hbhfsensor",
                                              "fridge", "electric.switch", "electric.timer")}
        self.assertEqual(use, {"autoturret": 10, "samsite": 25, "electric.teslacoil": 25, "electric.heater": 3,
                               "electric.simplelight": 1, "electric.splitter": 0, "electric.hbhfsensor": 1,
                               "fridge": 5, "electric.switch": 0, "electric.timer": 0})

    def test_enchufes_con_su_nombre_y_su_entrada_principal(self):
        mc = self.c["electrical.memorycell"]
        self.assertEqual([s["n"] for s in mc["in"]], ["Power In", "Set", "Reset", "Toggle"])
        self.assertEqual([s["m"] for s in mc["in"]], [1, 0, 0, 0])
        self.assertEqual([s["n"] for s in mc["out"]], ["Output", "Inverted Output"])
        self.assertEqual([s["n"] for s in self.c["electric.splitter"]["out"]], ["Power Out 1", "Power Out 2", "Power Out 3"])

    def test_rangos_del_juego(self):
        self.assertEqual(self.c["electric.timer"]["range"]["timerLength"], [0.25, 1000000000.0])
        self.assertEqual(self.c["electric.seismicsensor"]["range"]["range"], [1, 30])

    def test_afuera_lo_que_no_tiene_codigo(self):
        for sid in ("electric.digitalclock", "generator.biofuel", "hopper", "command.block", "discoball"):
            self.assertNotIn(sid, self.c)

    def test_receta_para_la_lista_de_materiales(self):
        self.assertEqual(self.c["electric.splitter"]["craft"], [{"id": "metal.fragments", "amount": 100}])
        self.assertIn("metal.fragments", self.doc["names"])


@unittest.skipUnless(CACHE, "lee games/rust/cache/io (RUST_CACHE=1 para correrlo)")
class DesdeLaCache(unittest.TestCase):
    def test_rehacerlo_da_lo_mismo(self):
        doc = electricity.build()
        self.assertEqual(doc, json.loads(DATA.read_text(encoding="utf-8")))


if __name__ == "__main__":
    unittest.main()
