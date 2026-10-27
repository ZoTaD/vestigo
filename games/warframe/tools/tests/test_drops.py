"""Pruebas de `drops`. Correr: python -m unittest discover -s games/warframe/tools/tests"""
import sys
import unittest
from unittest import mock
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
        botin = [{"where": "Cetus", "tier": "T", "stage": None, "rot": None, "item": "Lith Z99 Relic", "chance": 5.0}]
        vacio = lambda: []  # noqa: E731
        drops.relic_sources.cache_clear()
        try:
            with mock.patch.object(drops, "missions", vacio), mock.patch.object(drops, "keys", vacio),                     mock.patch.object(drops, "transient", vacio), mock.patch.object(drops, "bounties", lambda: botin),                     mock.patch.object(drops, "enemy_relics", lambda: {}):
                self.assertFalse(drops.vaulted("Lith Z99"))
                self.assertTrue(drops.vaulted("Lith Z98"))
        finally:
            drops.relic_sources.cache_clear()

    def test_reliquia_de_enemigo_no_es_vault(self):
        drops.relic_sources.cache_clear()
        enemigo = {"Lith A13": [{"k": "enemy", "who": "Hemocyte", "drop": 20.0, "chance": 12.91, "eff": 2.582}]}
        vacio = lambda: []  # noqa: E731
        try:
            with mock.patch.object(drops, "missions", vacio), mock.patch.object(drops, "keys", vacio),                     mock.patch.object(drops, "transient", vacio), mock.patch.object(drops, "bounties", vacio),                     mock.patch.object(drops, "enemy_relics", lambda: enemigo):
                self.assertFalse(drops.vaulted("Lith A13"))
        finally:
            drops.relic_sources.cache_clear()
        e = drops.enemy_relics()["Lith A13"][0]
        self.assertEqual((e["k"], e["who"], e["drop"], e["chance"]), ("enemy", "Hemocyte", 20.0, 12.91))
        self.assertIn(e, drops.relic_sources()["Lith A13"])

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
