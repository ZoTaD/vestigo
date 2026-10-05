"""
Tests de `skins.py` (2026-10-05): las skins del juego con nombre oficial e ícono.

`collect(write_icons=False)` lee items.preload y content.bundle (~1 min) pero no los bundles de texturas; los íconos se
prueban contra lo que ya escribió `skins.py`.

Uso (desde la raíz del worktree):
    python -m unittest discover -s games/rust/tools/tests -v
"""
import gc
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
import extract  # noqa: E402
from _game import solo_con_juego  # noqa: E402
import skins  # noqa: E402

_DATA = None


def data():
    global _DATA
    if _DATA is None:
        _DATA = skins.collect(write_icons=False)
    return _DATA


@solo_con_juego
class TestSkinsInGame(unittest.TestCase):
    def test_las_del_ak(self):
        ak = {s["id"]: s for s in data()["items"]["rifle.ak"]}
        self.assertEqual(len(ak), 12)
        self.assertEqual(ak[10135]["name"], {"en": "Digital Camo AK47", "es": "AK47 con camuflaje digital"})
        self.assertTrue(ak[10135]["workshop"])
        self.assertEqual(ak[10135]["icon"], "skins/10135")
        # La AK de hielo es un objeto propio (redirect): usa su ícono.
        self.assertEqual(ak[13070]["icon"], "items/rifle.ak.ice")
        self.assertFalse(ak[13070]["workshop"])

    def test_cantidad_y_forma(self):
        total = sum(len(v) for v in data()["items"].values())
        # Las 312 de los objetos visibles, contando las cuatro cuyo asset termina en `.skin` o `.sitem`.
        self.assertEqual(total, 312)
        planters = {s["id"] for s in data()["items"]["planter.large"]} | {s["id"] for s in data()["items"]["planter.triangle"]}
        self.assertTrue({10297, 10298} <= planters)
        lunar = {s["id"] for s in data()["items"]["wall.frame.lunar2025_a"]}
        self.assertTrue({10281, 10282} <= lunar)
        for sid, rows in data()["items"].items():
            names = [r["name"]["en"].lower() for r in rows]
            self.assertEqual(names, sorted(names), sid)
            for r in rows:
                self.assertTrue(r["name"]["en"], (sid, r["id"]))
                # Sin ícono propio ni redirect, queda el del objeto: ninguna se muestra vacía.
                self.assertTrue(r["icon"], (sid, r["id"]))
        crystal = {s["id"]: s for s in data()["items"]["rifle.ak"]}[10561]
        self.assertEqual(crystal["icon"], "items/rifle.ak")


SKINS_JSON = extract.DATA / "skins.json"


@unittest.skipUnless(SKINS_JSON.exists(), "sin skins.json (correr skins.py)")
class TestSkinIcons(unittest.TestCase):
    def test_cada_icono_existe(self):
        doc = json.loads(SKINS_JSON.read_text(encoding="utf-8"))
        public = extract.ROOT / "site" / "public" / "rust"
        for sid, rows in doc["items"].items():
            for r in rows:
                if r["icon"]:
                    self.assertTrue((public / f"{r['icon']}.webp").exists(), (sid, r["icon"]))


def tearDownModule():
    """Suelta lo que se cargó del juego (varios GB) apenas termina el módulo."""
    global _DATA
    _DATA = None
    gc.collect()


if __name__ == "__main__":
    unittest.main()
