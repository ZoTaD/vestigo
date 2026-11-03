"""Pruebas de `liquipedia`. Correr: python -m unittest discover -s games/cs2/tools/tests -p "test_liquipedia.py" """
import gzip
import io
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from liquipedia import Liquipedia, UA  # noqa: E402


class Resp(io.BytesIO):
    def __init__(self, body: bytes, gz: bool = False):
        super().__init__(gzip.compress(body) if gz else body)
        self.headers = {"Content-Encoding": "gzip"} if gz else {}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class Reloj:
    """Un reloj y un sleep falsos: dormir adelanta el reloj."""

    def __init__(self):
        self.t = 1000.0
        self.sleeps = []

    def now(self):
        return self.t

    def sleep(self, s):
        self.sleeps.append(round(s))
        self.t += s


class TestLiquipedia(unittest.TestCase):
    def setUp(self):
        self.reloj = Reloj()
        self.pedidos = []

        def opener(req, timeout=None):
            self.pedidos.append(req)
            if "action=parse" in req.full_url:
                return Resp(json.dumps({"parse": {"text": {"*": "<p>x</p>"}}}).encode(), gz=True)
            return Resp(json.dumps({"query": {}}).encode())

        self.lp = Liquipedia(clock=self.reloj.now, sleep=self.reloj.sleep, opener=opener)

    def test_espera_30_s_entre_parse_y_2_entre_los_demas(self):
        self.lp.parse("A")
        self.lp.parse("B")
        self.lp.query(action="query")
        self.lp.query(action="query")
        self.assertEqual(self.reloj.sleeps, [30, 2])

    def test_cabeceras(self):
        self.lp.query(action="query")
        req = self.pedidos[0]
        self.assertEqual(req.get_header("User-agent"), UA)
        self.assertEqual(UA, "VestigoBot/1.0 (https://vestigo.gg)")
        self.assertEqual(req.get_header("Accept-encoding"), "gzip")
        self.assertIn("format=json", req.full_url)

    def test_parse_devuelve_el_html(self):
        self.assertEqual(self.lp.parse("Liquipedia:Matches"), "<p>x</p>")


if __name__ == "__main__":
    unittest.main()
