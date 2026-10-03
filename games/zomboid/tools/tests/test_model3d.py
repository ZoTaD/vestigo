"""
Tests del modelo 3D de Project Zomboid (2026-10-01): inventario medido, atuendos y salida.
Los que leen el juego se saltean si no está (PZ_DIR). Correr desde la raíz del worktree:
    python -m unittest discover -s games/zomboid/tools/tests -v
"""
import glob, json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from extract import MEDIA  # noqa: E402
import model3d  # noqa: E402

DATA = os.path.join(os.path.dirname(__file__), "..", "..", "data")

HAY_JUEGO = os.path.isdir(os.path.join(MEDIA, "models_X"))


@unittest.skipUnless(HAY_JUEGO, "sin el juego instalado")
class InventarioTest(unittest.TestCase):
    def test_los_x_de_personajes_son_texto(self):
        # Si un parche los pasa a binario (`xof 0303bin`), el lector de texto no sirve: que se sepa acá.
        for sub in ("Skinned", "Static"):
            files = glob.glob(os.path.join(MEDIA, "models_X", sub, "**", "*.x"), recursive=True)
            self.assertGreater(len(files), 400)
            for f in files:
                with open(f, "rb") as h:
                    self.assertEqual(h.read(12), b"xof 0303txt ", f)

    def test_idle_del_jugador(self):
        # El idle que usa el juego es el que nombra AnimSets/player/idle/Idle.xml.
        with open(os.path.join(MEDIA, "AnimSets", "player", "idle", "Idle.xml"), encoding="utf-8-sig") as h:
            self.assertIn("<m_AnimName>Bob_Idle</m_AnimName>", h.read())
        self.assertTrue(os.path.isfile(os.path.join(MEDIA, "anims_X", "Bob", "Bob_Idle.x")))



@unittest.skipUnless(HAY_JUEGO, "sin el juego instalado")
class AtuendoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.defs = model3d.definitions()

    def _items(self, prof, sex):
        return {p["loc"]: p["item"] for p in model3d.outfit(prof, sex, self.defs)}

    def test_bombero_hombre(self):
        o = self._items("fireofficer", "m")
        # default sin chance (Belt, Socks) + todos los lugares del bombero con su primer ítem.
        self.assertEqual(o["Pants"], "Base.Trousers_Fireman")
        self.assertEqual(o["Tshirt"], "Base.Tshirt_Profession_FiremanBlue")
        self.assertEqual(o["Shoes"], "Base.Shoes_Black")
        self.assertEqual(o["Hat"], "Base.Hat_BaseballCap_FireDept")  # chance 10, pero es de la profesión
        self.assertEqual(o["Belt"], "Base.Belt2")
        self.assertNotIn("Skirt", o)  # el default de mujer la tiene con chance 50; acá ni eso
        kinds = {p["loc"]: p["kind"] for p in model3d.outfit("fireofficer", "m", self.defs)}
        self.assertEqual((kinds["Pants"], kinds["Hat"], kinds["Tshirt"]), ("skinned", "static", "texture"))

    def test_sin_definicion_es_el_default(self):
        for prof in ("unemployed", "rancher", "smither", "tailor"):
            self.assertEqual(self._items(prof, "m"), self._items("unemployed", "m"))

    def test_hombre_sin_male_usa_female(self):
        # El bombero sólo define Female: el hombre se viste con eso (como randomGenericOutfit).
        self.assertEqual(self._items("fireofficer", "m")["Pants"], self._items("fireofficer", "f")["Pants"])

    def test_nombre_en_lua(self):
        self.assertEqual(model3d.lua_prof("fitnessinstructor"), "fitnessInstructor")
        self.assertEqual(self._items("fitnessinstructor", "m")["Pants"], "Base.Shorts_LongSport")

    def test_rutas_de_modelo(self):
        for ref in ("skinned\\clothes\\bob_trousers", "x:skinned\\clothes\\bob_trousers",
                    "media\\models_X\\Skinned\\Clothes\\Bob_HighVisVest.X"):
            p = model3d.model_path(ref)
            self.assertTrue(p and os.path.isfile(p), ref)

    def test_todas_las_profesiones_y_piezas(self):
        with open(os.path.join(DATA, "professions.json"), encoding="utf-8") as h:
            profs = [p["id"] for p in json.load(h)]
        self.assertEqual(len(profs), 25)
        piezas = {s: set() for s in model3d.SEXES}
        for prof in profs:
            for s in model3d.SEXES:
                for p in model3d.outfit(prof, s, self.defs):
                    if p["kind"] != "texture":
                        self.assertTrue(model3d.model_path(p["model"]), (prof, s, p["model"]))
                        piezas[s].add(model3d.model_path(p["model"]).lower())
        # Por archivo .x y no por nombre (dos nombres pueden ser el mismo .x): 20 por sexo en la 42.21, sin los pelos.
        # Margen por si un parche suma alguna.
        for s in model3d.SEXES:
            self.assertTrue(18 <= len(piezas[s]) <= 30, (s, len(piezas[s])))

    def test_el_chaleco_esconde_la_corbata(self):
        # BodyLocations.lua: setHideModel(TORSO_EXTRA, NECK). El ingeniero lleva la corbata (sale en `wear`), pero
        # bajo el chaleco no se dibuja su modelo; el médico, sin chaleco, sí.
        ing = {p["loc"]: p for p in model3d.outfit("engineer", "m", self.defs)}
        doc = {p["loc"]: p for p in model3d.outfit("doctor", "m", self.defs)}
        self.assertEqual(ing["Neck"]["item"], "Base.Tie_Full")
        self.assertIsNone(ing["Neck"]["model"])
        self.assertEqual(doc["Neck"]["kind"], "skinned")

    def test_pelo_bajo_el_sombrero(self):
        # Con gorra, el pelo aplastado (`Hat`); el barbijo del médico va en Hat pero no aplasta nada (`nobeard`).
        self.assertEqual(model3d.hair("m", model3d.outfit("fireofficer", "m", self.defs))["style"], "Hat")
        self.assertEqual(model3d.hair("f", model3d.outfit("fireofficer", "f", self.defs))["style"], "Hat")
        self.assertEqual(model3d.hair("m", model3d.outfit("unemployed", "m", self.defs))["style"], "Short")
        self.assertEqual(model3d.hair("f", model3d.outfit("unemployed", "f", self.defs))["style"], "Bob")
        self.assertEqual(model3d.hair("m", model3d.outfit("doctor", "m", self.defs))["style"], "Short")

    def test_afiche_no_vacio(self):
        img = model3d.poster("unemployed", "m", self.defs)
        self.assertEqual(img.shape, (480, 360, 4))
        opaco = img[..., 3] > 127
        self.assertGreaterEqual(opaco.mean(), 0.15)
        ys, xs = opaco.nonzero()
        self.assertGreater(ys.max() - ys.min(), xs.max() - xs.min())


OUT = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "site", "public", "zomboid", "3d")


@unittest.skipUnless(os.path.isfile(os.path.join(DATA, "outfits.json")), "falta correr model3d.py")
class SalidaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(DATA, "outfits.json"), encoding="utf-8") as h:
            cls.o = json.load(h)

    def test_cincuenta_atuendos_con_archivos(self):
        self.assertEqual(len(self.o["outfits"]), 25)
        for prof, por_sexo in self.o["outfits"].items():
            for s in ("m", "f"):
                a = por_sexo[s]
                # El pelo puede faltar (un gorro `nohair` lo saca: hoy ninguna profesión), como dice outfit.ts del sitio.
                hair = [a["hair"]["glb"], a["hair"]["tex"]] if "hair" in a else []
                for rel in [a["skin"], a["poster"], *hair] + [p["glb"] for p in a["pieces"]] + [p["tex"] for p in a["pieces"]]:
                    self.assertTrue(os.path.isfile(os.path.join(OUT, rel)), (prof, s, rel))
                self.assertTrue(a["wear"], (prof, s))

    def test_presupuestos(self):
        tam = lambda rel: os.path.getsize(os.path.join(OUT, rel))  # noqa: E731
        for s in ("m", "f"):
            self.assertLessEqual(tam(self.o["body"][s]), 90_000)
        for por_sexo in self.o["outfits"].values():
            for s in ("m", "f"):
                a = por_sexo[s]
                self.assertLessEqual(tam(a["poster"]), 25_000)
                total = tam(self.o["body"][s]) + tam(a["skin"])
                if "hair" in a:
                    total += tam(a["hair"]["glb"]) + tam(a["hair"]["tex"])
                for p in a["pieces"]:
                    self.assertLessEqual(tam(p["glb"]), 25_000)
                    self.assertLessEqual(tam(p["tex"]), 30_000)
                    total += tam(p["glb"]) + tam(p["tex"])
                self.assertLessEqual(total, 180_000)

    def test_los_que_comparten_todo(self):
        a = self.o["outfits"]
        self.assertEqual(a["rancher"]["m"]["skin"], a["unemployed"]["m"]["skin"])
        self.assertNotEqual(a["fireofficer"]["m"]["skin"], a["unemployed"]["m"]["skin"])

    def test_sin_archivos_de_mas(self):
        # Lo que ya no sale se borra: en la carpeta está justo lo que nombra outfits.json.
        usados = set(self.o["body"].values())
        for por_sexo in self.o["outfits"].values():
            for a in por_sexo.values():
                usados |= {a["skin"], a["poster"]} | {p[k] for p in a["pieces"] for k in ("glb", "tex")}
                if "hair" in a:
                    usados |= {a["hair"]["glb"], a["hair"]["tex"]}
        hay = {os.path.relpath(f, OUT).replace(os.sep, "/")
               for f in glob.glob(os.path.join(OUT, "**", "*"), recursive=True) if os.path.isfile(f)}
        self.assertEqual(hay, usados)

    def test_wear_de_arriba_abajo_con_nombre(self):
        fuego = [w["ref"] for w in self.o["outfits"]["fireofficer"]["m"]["wear"]]
        self.assertEqual(fuego[0], "Base.Hat_BaseballCap_FireDept")  # la gorra primero
        self.assertEqual(fuego[-1], "Base.Shoes_Black")                # y los zapatos al final
        for por_sexo in self.o["outfits"].values():
            for a in por_sexo.values():
                for w in a["wear"]:
                    self.assertTrue(w["en"] and w["es"], w)
        self.assertTrue(any("slug" in w for w in self.o["outfits"]["fireofficer"]["m"]["wear"]))


if __name__ == "__main__":
    unittest.main()
