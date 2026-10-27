"""Pruebas de `baro`. Correr: python -m unittest discover -s games/warframe/tools/tests -p "test_baro.py" """
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import baro  # noqa: E402

REFS = {"prisma grakata": {"tab": "arsenal", "slug": "prisma-grakata", "slugEs": "prisma-grakata", "img": "x"}}


def api(items, nombre_idioma):
    return {
        "activation": "2026-10-30T13:00:00.000Z",
        "expiry": "2026-11-01T13:00:00.000Z",
        "location": "Larunda Relay (Mercury)" if nombre_idioma == "en" else "Relé Larunda (Mercurio)",
        "inventory": items,
    }


EN = api([
    {"uniqueName": "/Lotus/StoreItems/A", "item": "Prisma Grakata", "ducats": 350, "credits": 110000},
    {"uniqueName": "/Lotus/StoreItems/B", "item": "Some Cosmetic", "ducats": 100, "credits": 50000},
], "en")
ES = api([
    {"uniqueName": "/Lotus/StoreItems/A", "item": "Grakata Prisma", "ducats": 350, "credits": 110000},
], "es")
DENTRO = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)


class TestBaro(unittest.TestCase):
    def test_visita_activa(self):
        v = baro.parse_visit(EN, ES, REFS, DENTRO)
        self.assertEqual(v["start"], "2026-10-30T13:00:00.000Z")
        self.assertEqual(v["location"], ["Larunda Relay (Mercury)", "Relé Larunda (Mercurio)"])
        a, b = v["items"]
        self.assertEqual(a["name"], ["Prisma Grakata", "Grakata Prisma"])
        self.assertEqual(a["ref"]["slug"], "prisma-grakata")
        self.assertEqual((a["ducats"], a["credits"]), (350, 110000))
        self.assertIsNone(b["ref"])
        self.assertEqual(b["name"], ["Some Cosmetic", "Some Cosmetic"])  # sin traducción: el inglés

    def test_fuera_de_fecha(self):
        antes = datetime(2026, 10, 30, 12, tzinfo=timezone.utc)
        despues = datetime(2026, 11, 1, 14, tzinfo=timezone.utc)
        self.assertIsNone(baro.parse_visit(EN, ES, REFS, antes))
        self.assertIsNone(baro.parse_visit(EN, ES, REFS, despues))

    def test_inventario_vacio(self):
        self.assertIsNone(baro.parse_visit(api([], "en"), api([], "es"), REFS, DENTRO))

    def test_merge_no_duplica(self):
        v = baro.parse_visit(EN, ES, REFS, DENTRO)
        h, nuevo = baro.merge({"visits": []}, v)
        self.assertTrue(nuevo)
        h, nuevo = baro.merge(h, v)
        self.assertFalse(nuevo)
        self.assertEqual(len(h["visits"]), 1)

    def test_merge_mas_nueva_primero(self):
        vieja = {"start": "2026-10-16T13:00:00.000Z", "end": "x", "location": ["a", "b"], "items": []}
        v = baro.parse_visit(EN, ES, REFS, DENTRO)
        h, _ = baro.merge({"visits": [vieja]}, v)
        self.assertEqual(h["visits"][0]["start"], v["start"])


if __name__ == "__main__":
    unittest.main()
