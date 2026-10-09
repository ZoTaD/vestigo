"""
Tests de `extract_server.py` (2026-10-09). Leen el servidor dedicado instalado (`RUST_SERVER_DIR`, por defecto
`C:\\RustServer`), así que corren sólo con `RUST_SERVER=1`; abren los bundles del servidor (~4 GB de RAM): uno por vez.

    RUST_SERVER=1 python -m unittest games/rust/tools/tests/test_extract_server.py -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

ON = os.environ.get("RUST_SERVER") == "1"


@unittest.skipUnless(ON, "lee el servidor dedicado: RUST_SERVER=1")
class TestServerCode(unittest.TestCase):
    def test_los_valores_por_defecto_del_codigo(self):
        import extract_server
        code = extract_server.read_code()
        self.assertEqual(code["RentableShop"]["ScrapPerHourRent"], 10)
        self.assertEqual(code["RentableShop"]["InitialScrapFee"], 100)
        self.assertEqual(code["RentableShop"]["InitialRentHoursRequired"], 12)
        self.assertEqual(code["ConVar.ApartmentCommands"]["masterkeyprice"], 1000)
        self.assertEqual(code["ConVar.ApartmentCommands"]["rentscaling"], 0)
        self.assertEqual(code["Powergrid"]["fuseLifespanSeconds"], 9600)
        self.assertEqual((code["Powergrid"]["powerlineBasePowerOutput"], code["Powergrid"]["powerlineMaxPowerOutput"]), (5, 50))


@unittest.skipUnless(ON, "lee el servidor dedicado: RUST_SERVER=1")
class TestServerSpawns(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import extract_server
        from cache_dump import Dumper
        cls.d = Dumper()
        cls.groups = []
        for o, tt, cls_name in cls.d.instances(extract_server.GROUPS, lambda o: o.assets_file.name.startswith("BuildPlayer-AssetScene-monument")):
            cls.groups.append((cls_name, cls.d.context(o, tt), cls.d.plain(o, tt)))

    @classmethod
    def tearDownClass(cls):
        del cls.d

    def test_las_cajas_de_elite_de_la_zona_de_lanzamiento(self):
        launch = [(c, ctx, data) for c, ctx, data in self.groups if ctx.get("root", "").endswith("xlarge/launch_site_1.prefab")]
        elite = [data for _, ctx, data in launch if ctx["go"] == "Crate Spawner_Elite"]
        self.assertEqual(len(elite), 1)
        self.assertEqual(elite[0]["maxPopulation"], 3)
        self.assertTrue(elite[0]["prefabs"][0]["prefab"]["prefab"].endswith("radtown/crate_elite.prefab"))

    def test_los_cientificos_de_las_plataformas_son_los_nuevos(self):
        rig = [data for c, ctx, data in self.groups if c == "NPCSpawner" and ctx.get("root", "").endswith("offshore/oilrig_2.prefab")]
        self.assertTrue(rig)
        for data in rig:
            self.assertTrue(data["prefabs"][0]["prefab"]["prefab"].endswith("gen2/scientist2.prefab"))


if __name__ == "__main__":
    unittest.main()
