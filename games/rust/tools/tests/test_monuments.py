"""
Tests de `monuments.py` (2026-10-09). Los de forma leen el `monuments.json` versionado y los de lo que aparece usan
grupos sintéticos; el que rearma desde la caché cruda (no versionada, con la del servidor) corre sólo con `RUST_CACHE=1`.

    python -m unittest games/rust/tools/tests/test_monuments.py -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import monuments  # noqa: E402

DOC = monuments.DATA / "monuments.json"


def group(prefabs, max_pop, points, tier=-1, go="Crate Spawner", respawn=(1800.0, 2200.0)):
    """Un `SpawnGroup` sintético como los de `cache/server/spawners.json`."""
    return {"ctx": {"go": go}, "points": points, "data": {
        "Tier": tier, "maxPopulation": max_pop, "respawnDelayMin": respawn[0], "respawnDelayMax": respawn[1],
        "prefabs": [{"prefab": {"prefab": p}, "weight": w} for p, w in prefabs]}}


RAD = "assets/bundled/prefabs/radtown/"


class TestSpawns(unittest.TestCase):
    def test_que_es_cada_prefab(self):
        self.assertEqual(monuments.classify(RAD + "crate_elite.prefab"), ("loot", "elite"))
        self.assertEqual(monuments.classify(RAD + "loot_barrel_2.prefab"), ("loot", "barrel"))
        self.assertEqual(monuments.classify("assets/x/scientistnpc_full_lr300.prefab"), ("npc", "scientist_tunnel"))
        self.assertEqual(monuments.classify("assets/x/gen2/scientist2.prefab"), ("npc", "scientist_rig"))
        self.assertEqual(monuments.classify("assets/x/keycard_red_pickup.entity.prefab"), ("pickup", "keycard_red"))
        self.assertIsNone(monuments.classify("assets/x/ore_metal.prefab"))
        self.assertIsNone(monuments.classify(None))

    def test_un_grupo_lleno_no_pasa_de_sus_puntos(self):
        self.assertEqual(monuments.group_full(group([], 9, {"GenericSpawnPoint": 4})), 4)
        self.assertEqual(monuments.group_full(group([], 6, {"RadialSpawnPoint": 2})), 6)
        self.assertEqual(monuments.group_full(group([], 3, {})), 0)

    def test_tier(self):
        self.assertTrue(monuments.tier_applies(-1, 2))
        self.assertTrue(monuments.tier_applies(6, 1))
        self.assertFalse(monuments.tier_applies(6, 0))

    def test_seguro_maximo_y_esperado(self):
        groups = [
            group([(RAD + "loot_barrel_1.prefab", 20), (RAD + "loot_barrel_2.prefab", 20)], 10, {"GenericSpawnPoint": 14}),
            group([(RAD + "crate_normal.prefab", 40), (RAD + "crate_normal_2.prefab", 60)], 5, {"GenericSpawnPoint": 5}),
            group([(RAD + "crate_elite.prefab", 1)], 1, {"GenericSpawnPoint": 1}, go="Elite Crate Spawner Powergrid Loot"),
        ]
        out, by_tier = monuments.spawns_of(groups, [], [1])
        rows = {(r["id"], bool(r.get("power"))): r for r in out["loot"]}
        self.assertEqual(rows[("barrel", False)], {"id": "barrel", "lo": 10, "hi": 10, "avg": 10.0})
        self.assertEqual(rows[("military", False)], {"id": "military", "lo": 0, "hi": 5, "avg": 2.0})
        self.assertEqual(rows[("crate", False)]["avg"], 3.0)
        self.assertTrue(rows[("elite", True)]["power"])
        self.assertEqual(out["respawn"], [30, 37])
        self.assertFalse(by_tier)

    def test_por_tier_y_anidados(self):
        tent = "assets/prefabs/misc/tent.prefab"
        groups = [
            group([(RAD + "crate_normal.prefab", 1)], 2, {"GenericSpawnPoint": 2}, tier=1),
            group([(RAD + "crate_normal.prefab", 1)], 4, {"GenericSpawnPoint": 4}, tier=4),
            group([(tent, 1)], 2, {"SpaceCheckingSpawnPoint": 2}),
        ]
        nested = {tent: ([group([("assets/x/scientistnpc_roamtethered.prefab", 1)], 1, {"GenericSpawnPoint": 1})], [])}
        out, by_tier = monuments.spawns_of(groups, [RAD + "crate_elite.prefab"], [0, 2], nested)
        rows = {r["id"]: r for r in out["loot"]}
        self.assertEqual((rows["military"]["lo"], rows["military"]["hi"], rows["military"]["avg"]), (2, 4, 3.0))
        self.assertEqual((rows["elite"]["lo"], rows["elite"]["hi"]), (1, 1))
        self.assertEqual(out["npc"], [{"id": "scientist", "lo": 2, "hi": 2, "avg": 2.0}])
        self.assertTrue(by_tier)


class TestPieces(unittest.TestCase):
    def test_de_que_monumento_es_cada_pieza(self):
        known = {"large/airfield_1.prefab", "small/sphere_tank.prefab"}
        self.assertEqual(monuments.monument_of(monuments.MON + "large/airfield_1.prefab", known), "large/airfield_1.prefab")
        self.assertEqual(monuments.monument_of("assets/scenes/prefabs/airfield/maintainables/airfield maintainables.prefab", known), "large/airfield_1.prefab")
        self.assertEqual(monuments.monument_of("assets/prefabs/misc/monument/spheretankfuelswitch.prefab", known), "small/sphere_tank.prefab")
        self.assertIsNone(monuments.monument_of("assets/scenes/prefabs/floating city/casino barge.prefab", known))
        self.assertIsNone(monuments.monument_of(monuments.MON + "cave/cave_small_easy.prefab", known))

    def test_tiers_y_red(self):
        self.assertEqual(monuments.tiers_of(-1), [])
        self.assertEqual(monuments.tiers_of(6), [1, 2])
        self.assertEqual(monuments.power_kind("generator.hidden.controlroomloot.powergrid"), "lootroom")
        self.assertEqual(monuments.power_kind("lootfridge generator.static_hidden"), "fridge")
        self.assertEqual(monuments.power_kind("generator.noreset.static (Stage 4 Powergrid)"), "systems")


@unittest.skipUnless(DOC.exists(), "falta monuments.json")
class TestMonumentsJson(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(DOC, encoding="utf-8") as f:
            cls.doc = json.load(f)
        cls.by = {m["id"]: m for m in cls.doc["monuments"]}

    def test_los_que_ve_el_jugador(self):
        for mid in ("outpost", "bandit-camp", "launch-site", "military-tunnel", "power-plant", "airfield", "harbor", "oil-rig", "large-oil-rig", "apartment-complex"):
            self.assertIn(mid, self.by)
        for mid in ("underground-cave", "water-well", "mountain", "train-tunnel"):
            self.assertNotIn(mid, self.by)
        self.assertEqual(self.by["harbor"]["variants"], 2)
        ids = [m["id"] for m in self.doc["monuments"]]
        es = [m["slugEs"] for m in self.doc["monuments"]]
        self.assertEqual(len(set(ids)), len(ids))
        self.assertEqual(len(set(es)), len(es))

    def test_puzzle_recicladoras_y_zona_segura(self):
        self.assertEqual(self.by["launch-site"]["cards"].get("red"), 4)
        self.assertEqual(self.by["power-plant"]["recyclers"].get("red"), 1)
        # Las piezas de la escena de props se cuentan una vez (antes daba 5 verdes en el patio ferroviario).
        self.assertEqual(self.by["train-yard"]["cards"], {"green": 3, "blue": 1})
        self.assertEqual(self.by["airfield"]["fuses"], 4)
        self.assertEqual(self.by["outpost"]["recyclers"], {"yellow": 3})
        self.assertTrue(self.by["outpost"]["safeZone"])
        self.assertEqual(self.by["outpost"]["shop"], "outpost")
        self.assertEqual(self.by["launch-site"]["radiation"], "high")

    def test_la_red_de_power_trip(self):
        pg = self.doc["powergrid"]
        self.assertEqual(pg["stages"], [1, 4, 10, 18])
        self.assertEqual(pg["boxes"], [15, 5])
        self.assertEqual(pg["fuse"]["slug"], "heavy-fuse")
        by_stage = {s["stage"]: s["monuments"] for s in pg["byStage"]}
        self.assertIn("ferry-terminal", by_stage[1])
        self.assertIn("launch-site", by_stage[3])
        self.assertIn("airfield", by_stage[4])

    def test_lo_que_aparece(self):
        by = self.by
        rows = lambda mid, kind: {r["id"]: r for r in by[mid]["spawns"][kind] if not r.get("power")}  # noqa: E731
        self.assertEqual(rows("launch-site", "loot")["elite"]["hi"], 3)
        self.assertEqual(rows("oil-rig", "npc")["scientist_rig"]["hi"], 15)
        self.assertEqual(rows("large-oil-rig", "loot")["locked"]["hi"], 1)
        self.assertEqual(rows("military-tunnel", "npc")["scientist_tunnel"]["hi"], 33)
        self.assertEqual(rows("bandit-camp", "npc")["bandit_guard"]["hi"], 12)
        self.assertIn("keycard_red", {p["item"]["id"] for p in by["power-plant"]["spawns"]["pickup"]})
        self.assertTrue(any(r.get("power") for r in by["power-plant"]["spawns"]["loot"]))
        self.assertTrue(by["oxums-gas-station"]["spawnsByTier"])
        for m in self.doc["monuments"]:
            for kind in ("loot", "npc"):
                for r in m["spawns"][kind]:
                    self.assertIn(r["id"], self.doc["sources"], m["id"])
                    self.assertLessEqual(r["lo"], r["avg"] + 1e-9)
                    self.assertLessEqual(r["avg"], r["hi"] + 1e-9)

    def test_el_botin_de_cada_fuente(self):
        with open(monuments.DATA / "monuments-loot.json", encoding="utf-8") as f:
            loot = json.load(f)
        for key, src in self.doc["sources"].items():
            self.assertEqual(src["loot"], bool(loot["tables"].get(key)), key)
        self.assertFalse(self.doc["sources"]["bandit_guard"]["loot"])
        self.assertTrue(self.doc["sources"]["scientist_rig"]["loot"])
        for rows in loot["tables"].values():
            for sid, chance, lo, hi, bp in rows:
                self.assertIn(sid, loot["items"])
                self.assertTrue(0 < chance <= 1 and lo <= hi)

    def test_costos(self):
        ap = self.doc["apartments"]
        self.assertEqual(ap["shopRent"], {"fee": 100, "perHour": 10, "hours": 12, "protectHours": 6})
        self.assertEqual((ap["freeHours"], ap["masterKey"], ap["taxScale"], ap["evictHours"]), (4, 1000, 0, 24))
        wear = self.doc["powergrid"]["wear"]
        self.assertEqual((wear["seconds"], wear["worst"], wear["pop"], wear["lowPopScale"]), (9600, 3, [10, 100], 0.25))

    def test_apartamentos_y_fotos(self):
        ap = self.doc["apartments"]
        self.assertEqual([r["size"] for r in ap["rooms"]], [1, 2, 3])
        self.assertEqual(ap["shops"], 14)
        self.assertTrue(all(t["item"]["slug"] for t in ap["tax"]))
        for m in self.doc["monuments"]:
            if m["photo"]:
                self.assertTrue((monuments.PICS / f"{m['photo']}.webp").exists(), m["id"])


@unittest.skipUnless(os.environ.get("RUST_CACHE") == "1", "lee la caché cruda: RUST_CACHE=1")
class TestFromCache(unittest.TestCase):
    def test_el_json_versionado_es_el_de_la_cache(self):
        doc, _, loot = monuments.build()
        for m in doc["monuments"]:
            m.pop("_photo")
        with open(DOC, encoding="utf-8") as f:
            self.assertEqual(json.load(f), json.loads(json.dumps(doc)))
        with open(monuments.DATA / "monuments-loot.json", encoding="utf-8") as f:
            self.assertEqual(json.load(f), json.loads(json.dumps(loot)))


if __name__ == "__main__":
    unittest.main()
