"""Pruebas de `cs2`. Correr: python -m unittest discover -s games/cs2/tools/tests -p "test_cs2.py" """
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cs2  # noqa: E402


class TestCs2(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(cs2.slugify("★ Bayonet | Doppler"), "bayonet-doppler")
        self.assertEqual(cs2.slugify("AK-47 | Inheritance"), "ak-47-inheritance")
        self.assertEqual(cs2.slugify("StatTrak™ M4A1-S | Black Lotus"), "stattrak-m4a1-s-black-lotus")

    def test_shard_igual_que_ts(self):
        # `pzShardOf("kilowatt-case", 32)` de site/src/zomboid/shard.ts, sacado con node el 3/11.
        self.assertEqual(cs2.shard("kilowatt-case"), 7)

    def test_desgastes(self):
        self.assertEqual([w[0] for w in cs2.WEARS][2], "Field-Tested")
        self.assertEqual(cs2.WEARS[-1][2], 1)


if __name__ == "__main__":
    unittest.main()
