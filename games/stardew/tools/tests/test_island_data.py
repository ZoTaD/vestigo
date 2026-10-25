"""Pruebas de `island_data`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import island_data  # noqa: E402


def _textos(x):
    """Todas las cadenas de un valor anidado."""
    if isinstance(x, str):
        yield x
    elif isinstance(x, dict):
        for v in x.values():
            yield from _textos(v)
    elif isinstance(x, list):
        for v in x:
            yield from _textos(v)


class TestIslandData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = island_data.island()
        cls.nueces = {n["key"]: n for n in cls.d["nuts"]}

    def test_130_nueces(self):
        self.assertEqual(sum(n["n"] for n in self.d["nuts"]), 130)

    def test_claves_distintas(self):
        for fila in ("nuts", "upgrades", "qiOrders"):
            claves = [x["key"] for x in self.d[fila]]
            self.assertEqual(len(claves), len(set(claves)), fila)
        slugs = [n["slug"] for n in self.d["nuts"]]
        self.assertEqual(len(slugs), len(set(slugs)))

    def test_caidas_limitadas(self):
        self.assertEqual(self.nueces["Darts"]["n"], 3)
        self.assertEqual(self.nueces["VolcanoBarrel"]["n"], 5)
        self.assertEqual(self.nueces["VolcanoBarrel"]["kind"], "limited")
        self.assertEqual(self.nueces["VolcanoBarrel"]["slug"], "volcanobarrel")
        self.assertEqual(self.nueces["Bush_IslandNorth_13_33"]["kind"], "bush")
        self.assertEqual(self.nueces["Bush_IslandNorth_13_33"]["slug"], "bush-islandnorth-13-33")
        self.assertEqual(self.nueces["Buried_IslandWest_21_81"]["kind"], "buried")
        self.assertEqual(self.nueces["Mermaid"]["n"], 5)
        self.assertEqual(self.nueces["IslandCenterSkeletonRestored"]["n"], 6)
        # Cómo se lee en la partida: `collectedNutTracker`, `limitedNutDrops` o `GoldenCoconutCracked`.
        self.assertEqual(self.nueces["Darts"]["track"], "limited")
        self.assertEqual(self.nueces["Mermaid"]["track"], "collected")
        self.assertEqual(self.nueces["GoldenCoconut"]["track"], "coconut")
        for n in self.d["nuts"]:
            self.assertIn(n["kind"], {"bush", "buried", "limited", "event", "puzzle"}, n["key"])

    def test_areas(self):
        areas = [a["key"] for a in self.d["areas"]]
        self.assertEqual(areas[:5], ["North", "West", "South", "East", "Volcano"])
        for a in self.d["areas"]:
            self.assertTrue(all(a["name"]), a["key"])
        for n in self.d["nuts"]:
            self.assertIn(n["area"], areas, n["key"])
            self.assertTrue(all(n["text"]) and len(n["text"]) == 2, n["key"])
            self.assertNotEqual(n["text"][0], n["text"][1], n["key"])
        self.assertEqual(self.nueces["Bush_Caldera_28_36"]["area"], "Volcano")
        self.assertEqual(self.nueces["Bush_CaptainRoom_2_4"]["area"], "West")

    def test_mejoras(self):
        up = {u["key"]: u for u in self.d["upgrades"]}
        self.assertGreaterEqual(len(up), 10)
        self.assertEqual(up["VolcanoBridge"]["cost"], 5)
        self.assertEqual(up["VolcanoBridge"]["area"], "Volcano")
        # El puente del volcán pide además haber llegado a la cima (`reachedCaldera`); las demás, nada más.
        self.assertEqual(len(up["VolcanoBridge"]["needsText"]), 2)
        self.assertTrue(all(up["VolcanoBridge"]["needsText"]))
        self.assertEqual([k for k, u in up.items() if u["needsText"]], ["VolcanoBridge"])
        self.assertEqual(up["Resort"]["cost"], 20)
        self.assertEqual(up["Hut"]["cost"], 1)
        for u in self.d["upgrades"]:
            self.assertTrue(all(u["name"]), u["key"])
            self.assertIn(u["area"], [a["key"] for a in self.d["areas"]])
            self.assertTrue(u["slug"])

    def test_walnut_room(self):
        cofre = [w for w in self.d["walnutRoom"] if w["id"] == "(BC)256"]
        self.assertEqual(sorted(w["gems"] for w in cofre), [15, 30])
        for w in self.d["walnutRoom"]:
            self.assertTrue(all(w["name"]), w["id"])
            self.assertTrue(w["slug"])
        slugs = [w["slug"] for w in self.d["walnutRoom"]]
        self.assertEqual(len(slugs), len(set(slugs)))

    def test_pedidos_de_qi(self):
        qi = {q["key"]: q for q in self.d["qiOrders"]}
        self.assertEqual(len(qi), 12)
        self.assertEqual(qi["QiChallenge8"]["days"], 3)
        self.assertEqual(qi["QiChallenge8"]["gems"], 20)
        self.assertEqual(qi["QiChallenge2"]["days"], 28)
        self.assertEqual(qi["QiChallenge2"]["name"][0], "Qi's Crop")
        self.assertIn("4", qi["QiChallenge4"]["goal"][0])
        for q in self.d["qiOrders"]:
            for campo in ("name", "text", "goal"):
                self.assertTrue(all(q[campo]) and len(q[campo]) == 2, (q["key"], campo))
            self.assertTrue(q["slug"])

    def test_sin_huecos_en_los_textos(self):
        for t in _textos({k: self.d[k] for k in ("areas", "nuts", "upgrades", "walnutRoom", "qiOrders")}):
            for c in "[{]}":
                self.assertNotIn(c, t)

    def test_sprites_del_walnut_room_sin_ficha(self):
        # Lo que la tienda de Qi vende sin ficha de Objetos (muebles, el sombrero y la Llave de la ciudad) tiene su dibujo
        # en `rewards/`, del tamaño que dice el dato; los `(BC)` y los objetos ya están en `items/`.
        import sprites
        sin_ficha = {w["id"]: w["sprite"] for w in self.d["walnutRoom"] if "sprite" in w}
        self.assertEqual(set(sin_ficha), {"KeyToTheTown", "(H)82", "(F)2400", "(F)2514"})
        for i, tam in sin_ficha.items():
            self.assertEqual(list(sprites.reward_box(i)[3:]), tam, i)
            self.assertIn(i, sprites.premios_sin_ficha())
        self.assertEqual(sprites.reward_box("KeyToTheTown"), ("Maps/springobjects", 0, 608, 16, 16))
        self.assertEqual(sprites.reward_file("KeyToTheTown"), "key-to-the-town.png")
        self.assertEqual(sprites.reward_file("(H)82"), "h-82.png")
        # Los del museo siguen ahí.
        self.assertIn("RustyKey", sprites.premios_sin_ficha())


if __name__ == "__main__":
    unittest.main()
