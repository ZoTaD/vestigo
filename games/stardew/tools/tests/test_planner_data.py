import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import planner_data as pd  # noqa: E402


def _mapa(back: list, edificios: list | None = None, props: dict | None = None) -> dict:
    n = len(back)
    return {"props": props or {}, "layers": {"Back": {"w": n, "h": 1, "t": back},
                                             "Buildings": {"w": n, "h": 1, "t": edificios or [None] * n}}}


class ReglasTest(unittest.TestCase):
    def test_tierra_arable_es_de_todo(self):
        b = pd.reglas(_mapa([["s", 1, {"Diggable": "T", "Type": "Dirt"}]]))[0]
        self.assertEqual(b, pd.AZADA | pd.OBJETO | pd.PISO | pd.EDIFICIO | pd.ARBOL)

    def test_agua_no_sirve_para_nada(self):
        self.assertEqual(pd.reglas(_mapa([["s", 1, {"Water": "T", "Diggable": "T"}]]))[0], 0)

    def test_tile_en_buildings_bloquea_salvo_passable_o_shadow(self):
        back = [["s", 1, {"Buildable": "T"}]] * 3
        edif = [["s", 2, {}], ["s", 2, {"Passable": "T"}], ["s", 2, {"Shadow": "T"}]]
        self.assertEqual(pd.reglas(_mapa(back, edif)), [0, pd.OBJETO | pd.PISO | pd.EDIFICIO | pd.ARBOL] + [pd.OBJETO | pd.PISO | pd.EDIFICIO | pd.ARBOL])

    def test_buildable_f_frena_aunque_se_pueda_arar(self):
        b = pd.reglas(_mapa([["s", 1, {"Diggable": "T", "Buildable": "f"}]]))[0]
        self.assertFalse(b & pd.EDIFICIO)
        self.assertTrue(b & pd.AZADA)

    def test_no_furniture_t_deja_caminos_y_total_nada(self):
        t, total = pd.reglas(_mapa([["s", 1, {"NoFurniture": "T"}], ["s", 1, {"NoFurniture": "total"}]]))
        self.assertEqual((t & pd.OBJETO, bool(t & pd.PISO)), (0, True))
        self.assertEqual(total & (pd.OBJETO | pd.PISO), 0)

    def test_arboles_y_aspersores(self):
        sin, puede, aspersor = pd.reglas(_mapa([["s", 1, {"NoSpawn": "Tree"}], ["s", 1, {"NoSpawn": "Tree", "CanPlantTrees": "T"}],
                                                 ["s", 1, {"NoSprinklers": "T"}]]))
        self.assertFalse(sin & pd.ARBOL)
        self.assertTrue(puede & pd.ARBOL)
        self.assertTrue(aspersor & pd.SIN_ASPERSOR)

    def test_edificios_fijos_por_defecto_y_por_propiedad(self):
        fijos = {f["key"]: (f["x"], f["y"]) for f in pd.fijos(_mapa([None]), 6)}
        self.assertEqual(fijos["Farmhouse"], (59, 12))
        self.assertEqual(fijos["Greenhouse"], (14, 14))
        fijos = {f["key"]: (f["x"], f["y"]) for f in pd.fijos(_mapa([None], props={"FarmHouseEntry": "70 20"}), 0)}
        self.assertEqual(fijos["Farmhouse"], (65, 17))


class PlannerJsonTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.datos = pd.build()

    def test_ocho_granjas_con_grilla_completa(self):
        self.assertEqual(len(self.datos["farms"]), 8)
        for g in self.datos["farms"]:
            self.assertEqual(len(g["grid"]), g["w"] * g["h"], g["key"])

    def test_alcances_del_codigo(self):
        it = {i["id"]: i for i in self.datos["items"]}
        self.assertEqual(it["599"]["range"], ["sprinkler", 0])
        self.assertEqual(it["645+915"]["range"], ["sprinkler", 3])
        self.assertEqual(it["(BC)8"]["range"], ["circle", 9])
        self.assertEqual(it["(BC)167"]["range"], ["circle", 17])
        self.assertEqual(it["(BC)10"]["range"], ["diamond", 5])
        self.assertEqual(it["B:Junimo Hut"]["range"], ["junimo", 8])

    def test_todo_material_tiene_nombre(self):
        for i in self.datos["items"]:
            for m, _ in i.get("mats", []):
                self.assertIn(m, self.datos["mats"], i["id"])


if __name__ == "__main__":
    unittest.main()
