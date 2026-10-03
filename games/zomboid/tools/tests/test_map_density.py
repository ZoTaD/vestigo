"""
Tests de la densidad de zombis del mapa (map.py, 2026-10-01).

El de orden no necesita el juego: arma dos celdas a mano. Los de "en el juego" leen la instalación (PZ_DIR) y lo que
map.py commitea en games/zomboid/data/map/web; se saltean si el juego no está.

Correr desde la raíz del worktree:
    python -m unittest discover -s games/zomboid/tools/tests -v
"""
import json, os, sys, unittest, zlib
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import map as pzmap  # noqa: E402

LOT = os.path.join(pzmap.WORLD, "41_37.lotheader")


class OrdenTest(unittest.TestCase):
    def test_columna_por_columna(self):
        # El juego lee el byte lx*32 + ly: el chunk (12, 16) de la celda va en el 400, y el (16, 12) en el 524.
        b = bytearray(1024)
        b[12 * 32 + 16] = 3
        b[16 * 32 + 12] = 1
        w, h, g = pzmap.density_grid({(1, 0): bytes(b), (0, 1): bytes(1024)})
        self.assertEqual((w, h), (64, 64))
        self.assertEqual(g[16 * w + 32 + 12], 3)
        self.assertEqual(g[12 * w + 32 + 16], 1)
        self.assertEqual(sum(1 for v in g if v), 2)

    def test_celdas_que_faltan_quedan_en_cero(self):
        w, h, g = pzmap.density_grid({(2, 1): bytes([5]) * 1024})
        self.assertEqual((w, h), (96, 64))
        self.assertEqual(g[0], 0)
        self.assertEqual(g[32 * w + 64], 5)


@unittest.skipUnless(os.path.exists(LOT), "sin el juego instalado (PZ_DIR)")
class EnElJuegoTest(unittest.TestCase):
    def test_un_chunk_conocido_de_muldraugh(self):
        # 42.21: el chunk (12, 16) de la celda 41_37, casillas (10592, 9600) a (10599, 9607), vale 3; el traspuesto, 1.
        d = pzmap.read_density(LOT)
        self.assertEqual(len(d), 1024)
        self.assertEqual(d[12 * 32 + 16], 3)
        self.assertEqual(d[16 * 32 + 12], 1)

    def test_lo_commiteado(self):
        with open(os.path.join(pzmap.WEB, "common.json"), encoding="utf-8") as f:
            common = json.load(f)
        head = common["zombies"]
        self.assertEqual((head["w"], head["h"], head["cell"]), (2496, 2016, 8))  # 19968 × 16128 casillas
        self.assertGreaterEqual(head["max"], 1)
        with open(os.path.join(pzmap.WEB, "zombies.bin"), "rb") as f:
            raw = f.read()
        self.assertLess(len(raw), 150_000)
        g = zlib.decompress(raw, -15)
        self.assertEqual(len(g), head["w"] * head["h"])
        self.assertEqual(g[1200 * head["w"] + 1324], 3)
        self.assertEqual(g[1196 * head["w"] + 1328], 1)
        self.assertEqual(max(g), head["max"])
        # Entre 2 % y 6 % de los chunks tienen algo (3,6 % en la 42.21): un parche que lo vacíe o lo llene salta acá.
        self.assertTrue(0.02 < sum(1 for v in g if v) / len(g) < 0.06)


if __name__ == "__main__":
    unittest.main()
