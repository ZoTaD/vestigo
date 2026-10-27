"""Pruebas de `drops`. Correr: python -m unittest discover -s games/warframe/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import drops  # noqa: E402


class TestDrops(unittest.TestCase):
    def test_reliquia_por_refinamiento(self):
        r = drops.relics()["Axi A1"]
        self.assertEqual(len(r["Intact"]), 6)
        self.assertIn(("Nikana Prime Blueprint", "Rare", 2.0), r["Intact"])
        self.assertIn(("Nikana Prime Blueprint", "Uncommon", 10.0), r["Radiant"])

    def test_mision_con_rotacion(self):
        m = [x for x in drops.missions() if x["where"] == "Mercury/Apollodorus (Survival)" and x["item"] == "Serration"]
        self.assertEqual((m[0]["rot"], m[0]["chance"]), ("B", 7.69))

    def test_vault(self):
        # Valores de la tabla del 27/10: Lith A1 ya está en el Vault, Lith A13 sigue cayendo.
        self.assertFalse(drops.vaulted("Lith A13"))
        self.assertTrue(drops.vaulted("Lith H2"))

    def test_botin_solo_no_es_vault(self):
        solo_botin = {r for r, s in drops.relic_sources().items() if s and all(x.get("tier") for x in s)}
        for r in solo_botin:
            self.assertFalse(drops.vaulted(r))

    def test_enemigo_con_efectiva(self):
        raptor = next(x for x in drops.by_drop("resourceByDrop")["Neural Sensors"] if x["who"] == "Raptor")
        self.assertEqual((raptor["drop"], raptor["chance"], raptor["eff"]), (100.0, 50.0, 50.0))

    def test_botines_con_etapa_y_rotacion(self):
        b = [x for x in drops.bounties() if x["where"] == "Cetus" and x["item"] == "Point Blank"]
        self.assertTrue(b and b[0]["tier"] and b[0]["rot"] and b[0]["stage"])
        z = [x for x in drops.bounties() if x["where"] == "Zariman"]
        self.assertTrue(z and z[0]["stage"] == "Final stage" and z[0]["rot"] is None)

    def test_secciones_no_vacias(self):
        for f in (drops.keys, drops.transient, drops.sorties):
            self.assertTrue(f())
        self.assertTrue(drops.by_drop("modByDrop") and drops.by_drop("blueprintByDrop"))
