"""Mi partida (2026-10-30): las tareas de cada bioma salen de lo publicado (`progress.json`)."""
import json, os, unittest

SITE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "site")


def load(name):
    with open(os.path.join(SITE, name), encoding="utf-8") as f:
        return json.load(f)


class TestProgress(unittest.TestCase):
    def test_cada_bioma_tiene_sus_tareas_y_su_jefe(self):
        biomes = load("progress.json")
        self.assertEqual([b["biome"] for b in biomes][:3], ["meadows", "blackforest", "swamp"])
        for b in biomes:
            self.assertTrue(5 <= len(b["tasks"]) <= 12, b["biome"])
            self.assertEqual(b["tasks"][-1]["kind"], "boss", b["biome"])
            self.assertEqual(len({t["id"] for t in b["tasks"]}), len(b["tasks"]))

    def test_lo_que_se_tilda_solo_tiene_su_clave(self):
        for b in load("progress.json"):
            for t in b["tasks"]:
                if t["kind"] != "boss":
                    self.assertTrue(t["key"], t["id"])
                self.assertTrue(t["ref"]["slug"] and t["ref"]["tab"])


if __name__ == "__main__":
    unittest.main()
