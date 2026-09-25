import json, os, unittest
from pipeline.loc import Loc
from pipeline.map_data import (
    LIST_ORDER, LOCATION_FIELDS, OUT, asset_id, display_entry, door_caption, duplicate_hashes, location_def,
    log_list_order, manual_entry, parse_softref_manifest, placement_order, sort_lists, stable_hash, stamp_line,
)

MANIFEST = """﻿SoftRef manifest - Text
version: 2
assets:
- asset ID: cdf1e36a5d4c0994c8f7d8590c999b7b
  bundle: b53e4ad5
  path in bundle: Assets/world/Locations/DeepNorth/NorthVillage.prefab
- asset ID: 00000000000000000000000000000abc
  bundle: b53e4ad5
  path in bundle: Assets/world/Textures/algo.png
"""

# Un ZoneLocation como lo da UnityPy: bools en 0/1 y floats ya en double.
RAW = {"m_name": "TarPit1", "m_enable": 1, "m_prefabName": "TarPit1",
       "m_prefab": {"m_assetID": {"v3": 0xcdf1e36a, "v2": 0x5d4c0994, "v1": 0xc8f7d859, "v0": 0x0c999b7b}},
       "m_biome": 64, "m_biomeArea": 7, "m_quantity": 20, "m_prioritized": 0, "m_centerFirst": 0, "m_unique": 0,
       "m_group": "", "m_minDistanceFromSimilar": 256.0, "m_groupMax": "", "m_maxDistanceFromSimilar": 0.0,
       "m_exteriorRadius": 20.0, "m_maxTerrainDelta": 1.100000023841858, "m_minAltitude": -1.0, "m_foldout": 0}

LOC = Loc({"enemy_eikthyr": {"en": "Eikthyr", "es": "Eikthyr"}, "npc_haldor": {"en": "Haldor", "es": "Haldor"},
           "location_forestcrypt": {"en": "Burial Chambers", "es": "Cámaras funerarias"},
           "piece_lorestone": {"en": "Runestone", "es": "Piedra rúnica"},
           "enemy_seekerqueen": {"en": "The Queen", "es": "La Reina"},
           "location_dvergrboss": {"en": "Infested Citadel", "es": "Ciudadela infestada"}})
BOSSES = {"Eikthyr": {"id": "Eikthyr", "slug": "eikthyr", "tab": "bosses", "name": {"en": "Eikthyr", "es": "Eikthyr"}},
          "SeekerQueen": {"id": "SeekerQueen", "slug": "the-queen", "tab": "bosses", "name": {"en": "The Queen", "es": "La Reina"}}}
PLACES = {"burialchambers": {"tab": "places", "slug": "burial-chambers"},
          "infestedcitadel": {"tab": "places", "slug": "infested-citadel"},
          "tarpit": {"tab": "places", "slug": "tar-pit"}}
PINS = {9: "mapicon_boss_colored", 14: "mapicon_hildir1"}


def entry(name, prio=False, enable=True, qty=1, valid=True):
    return {"index": 0, "prefabName": name, "nameHash": stable_hash(name), "prioritized": prio, "enable": enable,
            "quantity": qty, "assetId": {"isValid": valid}}


class TestHash(unittest.TestCase):
    def test_vectores_de_seedlab(self):
        # Los de SeedLab (docs/specs/04 y 05), medidos contra el juego.
        self.assertEqual(stable_hash("StartTemple"), -1544986047)
        self.assertEqual(stable_hash("MWd8eV6svz"), -1772362158)
        self.assertEqual(stable_hash("hnBd9gJf2G"), 319486907)
        self.assertEqual(stable_hash(""), 371857150)
        self.assertEqual(stable_hash("IaPcIa3t"), 0)


class TestAssetId(unittest.TestCase):
    def test_hex_en_orden_v3_a_v0(self):
        a = asset_id(RAW["m_prefab"]["m_assetID"])
        self.assertEqual(a["hex"], "cdf1e36a5d4c0994c8f7d8590c999b7b")
        self.assertTrue(a["isValid"])

    def test_vacio_no_es_valido(self):
        self.assertFalse(asset_id(None)["isValid"])
        self.assertEqual(asset_id({})["hex"], "0" * 32)

    def test_negativo_como_uint(self):
        self.assertEqual(asset_id({"v3": -1, "v2": 0, "v1": 0, "v0": 0})["v3"], 0xFFFFFFFF)


class TestManifest(unittest.TestCase):
    def test_solo_prefabs(self):
        self.assertEqual(parse_softref_manifest(MANIFEST), {"cdf1e36a5d4c0994c8f7d8590c999b7b": "NorthVillage"})


class TestListas(unittest.TestCase):
    LOG = ("Added 1 locations, 1 vegetations, 0 environments\n" * 6 +
           "Added 3 locations, 0 vegetations\nAdded 2 locations, 0 vegetations\nAdded 27 locations, 25 vegetations\n"
           "Added 4 locations, 0 vegetations\nAdded 25 locations, 33 vegetations\nAdded 25 locations, 35 vegetations\n")

    def test_log_ultima_carga(self):
        self.assertEqual(log_list_order(self.LOG), [(3, 0), (2, 0), (27, 25), (4, 0), (25, 33), (25, 35)])

    def test_orden_de_registro_y_sortorder_estable(self):
        lists = [{"name": n, "sortOrder": 3} for n in reversed(LIST_ORDER)]
        lists[0]["sortOrder"] = 1   # DeepNorth con menor sortOrder pasa adelante
        self.assertEqual([l["name"] for l in sort_lists(lists)], [LIST_ORDER[-1]] + LIST_ORDER[:-1])

    def test_lista_desconocida_corta(self):
        with self.assertRaises(SystemExit):
            sort_lists([{"name": "_LocationList_Nueva", "sortOrder": 3}])


class TestLocationDef(unittest.TestCase):
    def test_el_manifiesto_pisa_el_nombre_guardado(self):
        d = location_def(RAW, 5, {"kind": "LocationList"}, "NorthVillage", None)
        self.assertEqual((d["prefabName"], d["softRefName"], d["serializedPrefabName"]), ("NorthVillage", "NorthVillage", "TarPit1"))
        self.assertEqual(d["nameHash"], stable_hash("NorthVillage"))
        self.assertEqual(d["name"], "TarPit1")   # m_name se queda: lo compara el bloqueo de variantes

    def test_tipos_y_campos_completos(self):
        d = location_def(RAW, 0, {}, None, "Death Plains")
        self.assertIs(d["enable"], True)
        self.assertIs(d["prioritized"], False)
        self.assertEqual(d["maxTerrainDelta"], 1.100000023841858)   # el float32 exacto, sin redondear
        self.assertEqual(d["interiorRadius"], 0.0)                   # faltante = valor nulo, no se omite
        self.assertEqual(d["prefabName"], "TarPit1")                 # sin manifiesto queda el guardado
        self.assertIsNone(d["softRefName"])
        self.assertEqual(d["altBiomeParent"], "Death Plains")
        for _, dst, _ in LOCATION_FIELDS:
            self.assertIn(dst, d)


class TestOrden(unittest.TestCase):
    def test_prioritarios_primero_estable_y_filtrado(self):
        defs = [entry("a"), entry("b", prio=True), entry("c", enable=False, prio=True), entry("d", qty=0),
                entry("e"), entry("f", prio=True)]
        for i, d in enumerate(defs):
            d["index"] = i
        self.assertEqual(placement_order(defs), [1, 5, 0, 4])

    def test_hash_repetido_sin_contar_los_que_no_procesa(self):
        defs = [entry("a"), entry("a", enable=False, valid=False), entry("b"), entry("a", enable=False)]
        self.assertEqual(duplicate_hashes(defs), ["a"])


class TestNombres(unittest.TestCase):
    def test_puerta(self):
        self.assertEqual(door_caption(["$location_forestcrypt", "", "$location_forestcrypt"]), "$location_forestcrypt")
        self.assertIsNone(door_caption(["$a", "$b"]))
        self.assertIsNone(door_caption([""]))

    def test_manual(self):
        self.assertEqual(manual_entry("SwampHut2_1")[2], "poi")
        self.assertEqual(manual_entry("StoneTowerRuins08_sunk")[0], "Sunken Tower")
        self.assertEqual(manual_entry("StoneTowerRuins05_leet")[0], "Mountain Tower")
        self.assertIsNone(manual_entry("Vendor_BlackForest"))

    def test_jefe_con_ficha(self):
        e = display_entry("Eikthyrnir", {"boss": "Eikthyr", "pin": {"name": "$enemy_eikthyr", "type": 9}}, LOC, BOSSES, PLACES, PINS)
        self.assertEqual((e["category"], e["nameSource"], e["icon"]), ("boss", "boss", "mapicon_boss_colored"))
        self.assertEqual(e["page"], {"tab": "bosses", "slug": "eikthyr"})

    def test_reina_jefe_y_lugar(self):
        f = {"boss": "SeekerQueen", "door": "$location_dvergrboss", "hasInterior": True}
        e = display_entry("Mistlands_DvergrBossEntrance1", f, LOC, BOSSES, PLACES, PINS)
        self.assertEqual(e["category"], "boss")
        self.assertEqual(e["pages"], [{"tab": "bosses", "slug": "the-queen"}, {"tab": "places", "slug": "infested-citadel"}])

    def test_comerciante_con_icono_fijo(self):
        e = display_entry("Vendor_BlackForest", {"trader": "$npc_haldor", "locationIcon": "mapicon_trader", "candidates": True},
                          LOC, BOSSES, PLACES, PINS)
        self.assertEqual((e["category"], e["name"]["en"], e["icon"], e["iconSource"]), ("trader", "Haldor", "mapicon_trader", "locationIcon"))
        self.assertTrue(e["candidates"])
        self.assertIsNone(e["page"])

    def test_mazmorra_por_la_puerta(self):
        e = display_entry("Crypt3", {"door": "$location_forestcrypt", "hasInterior": True}, LOC, BOSSES, PLACES, PINS)
        self.assertEqual((e["category"], e["name"]["es"], e["page"]["slug"]), ("dungeon", "Cámaras funerarias", "burial-chambers"))

    def test_piedra_runica_y_manual(self):
        e = display_entry("Runestone_Meadows", {"runestone": True}, LOC, BOSSES, PLACES, PINS)
        self.assertEqual((e["category"], e["name"]["es"]), ("runestone", "Piedra rúnica"))
        e = display_entry("TarPit1_1", {}, LOC, BOSSES, PLACES, PINS)
        self.assertEqual((e["category"], e["nameSource"], e["page"]["slug"]), ("resource", "manual", "tar-pit"))

    def test_inicio(self):
        e = display_entry("StartTemple", {"centerFirst": True, "runestone": True}, LOC, BOSSES, PLACES, PINS)
        self.assertEqual(e["category"], "start")

    def test_stamp(self):
        s = stamp_line({"gameVersion": "1.0.15", "networkVersion": 40, "assemblyValheimSha256": "ab"}, "6000.0.75f1",
                       "2026-09-24T21:00:00Z")
        self.assertTrue(s.startswith("DATA-STAMP game-version=1.0.15 network=40 unity=6000.0.75f1"))
        self.assertIn("dumped=2026-09-24", s)


@unittest.skipUnless(os.path.exists(os.path.join(OUT, "locations.json")), "sin data/map (correr pipeline.map_data)")
class TestSalida(unittest.TestCase):
    """Coherencia de lo que escribió la última corrida."""

    @classmethod
    def setUpClass(cls):
        def load(n):
            with open(os.path.join(OUT, n), encoding="utf-8") as f:
                return json.load(f)
        cls.locs, cls.alts, cls.meta, cls.disp = (load(n) for n in ("locations.json", "altbiomes.json", "meta.json", "display.json"))

    def test_indices_y_orden(self):
        rows = self.locs["locations"]
        self.assertEqual([r["index"] for r in rows], list(range(len(rows))))
        placed = sorted((r for r in rows if r["orderedIndex"] >= 0), key=lambda r: r["orderedIndex"])
        self.assertEqual([r["orderedIndex"] for r in placed], list(range(self.locs["enabledCount"])))
        self.assertEqual([r["prefabName"] for r in placed], self.locs["orderedPrefabNames"])
        for r in rows:
            self.assertEqual(r["orderedIndex"] >= 0, r["enable"] and r["quantity"] != 0)
            self.assertEqual(r["nameHash"], stable_hash(r["prefabName"]))

    def test_colocados_tienen_asset_id_y_nombre(self):
        for r in self.locs["locations"]:
            if r["orderedIndex"] >= 0:
                self.assertTrue(r["assetId"]["isValid"], r["prefabName"])
                self.assertEqual(r["softRefName"], r["prefabName"])
                self.assertIn(r["prefabName"], self.disp["locations"])

    def test_variantes(self):
        self.assertEqual(self.alts["count"], len(self.alts["altBiomes"]))
        by_parent = {}
        for r in self.locs["locations"]:
            if r["altBiomeParent"]:
                by_parent.setdefault(r["altBiomeParent"], []).append(r["index"])
        for a in self.alts["altBiomes"]:
            self.assertEqual([x["index"] for x in a["addLocations"]], by_parent.get(a["name"], []))
            self.assertEqual(a["nameHash"], stable_hash(a["name"]))

    def test_conteos_de_meta(self):
        c = self.meta["counts"]
        self.assertEqual(c["locations"], self.locs["count"])
        self.assertEqual(c["placed"], self.locs["enabledCount"])
        self.assertEqual(c["requested"], sum(r["quantity"] for r in self.locs["locations"] if r["orderedIndex"] >= 0))


if __name__ == "__main__":
    unittest.main()
