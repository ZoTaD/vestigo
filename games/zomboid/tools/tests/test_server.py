"""
Tests de `server.py` (2026-10-01): las opciones de sandbox, los presets, el .ini y los cortes de agua y luz.

Los números son los que se relevaron en la 42.21 (build 25485521) y están en "Lo que dice el juego" del plan
(docs/superpowers/plans/2026-10-01-zomboid-servidor.md). Si un parche los mueve, primero se revisa qué cambió en el
juego y recién después se toca el test: un número distinto puede ser un error del lector y no del parche.

Uso (desde la raíz del worktree, con el resto de los tests de Python):
    python -m unittest discover -s games/zomboid/tools/tests -v
o sólo éste: python games/zomboid/tools/tests/test_server.py -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from extract import MEDIA  # noqa: E402
import server  # noqa: E402

_DATA = None


def data():
    """`server.build()` una sola vez: lee el .jar, los .lua y las traducciones, y tarda un par de segundos."""
    global _DATA
    if _DATA is None:
        _DATA = server.build()
    return _DATA


def opt(key):
    return next(o for o in data()["options"] if o["key"] == key)


class LuaTable(unittest.TestCase):
    """El lector de los presets: sólo lo que traen, y nada que se parezca a código."""

    def test_valores_y_tabla_anidada(self):
        text = 'return {\n  A = 1,\n  B = -1, -- nota\n  C = 0.05,\n  D = true,\n  E = "x, \\"y\\"",\n  T = {\n    X = 2,\n  },\n}'
        self.assertEqual(server.lua_table(text, {}),
                         {"A": 1, "B": -1, "C": 0.05, "D": True, "E": 'x, "y"', "T.X": 2})

    def test_tonumber_de_una_constante_conocida(self):
        self.assertEqual(server.lua_table("return {\n  P = tonumber(Z.High),\n}", {"Z.High": "1.2"}), {"P": 1.2})

    def test_codigo_no(self):
        with self.assertRaises(ValueError):
            server.lua_table('return {\n  A = os.execute("x"),\n}', {})

    def test_tonumber_de_una_constante_desconocida_no(self):
        with self.assertRaises(ValueError):
            server.lua_table("return {\n  P = tonumber(Z.High),\n}", {})


@unittest.skipUnless(os.path.isdir(MEDIA), "sin el juego")
class Opciones(unittest.TestCase):
    def test_cantidad_y_tipos(self):
        opts = data()["options"]
        self.assertEqual(len(opts), 269)
        by_type = {}
        for o in opts:
            by_type[o["type"]] = by_type.get(o["type"], 0) + 1
        self.assertEqual(by_type, {"double": 96, "enum": 87, "bool": 45, "int": 39, "string": 2})

    def test_ejemplos(self):
        z = opt("Zombies")
        self.assertEqual((z["type"], len(z["values"]), z["default"]), ("enum", 6, 4))
        w = opt("WaterShutModifier")
        self.assertEqual((w["type"], w["min"], w["max"], w["default"]), ("int", -1, 2147483647, 14))
        self.assertEqual(w["name"]["en"], "Water Shutoff")
        f = opt("FoodLootNew")
        self.assertEqual((f["type"], f["min"], f["max"], f["default"]), ("double", 0, 4, 0.6))
        self.assertEqual(opt("ZombieConfig.PopulationMultiplier")["default"], 0.65)

    def test_enum_fuertes(self):
        i = opt("InjurySeverity")
        self.assertEqual((i["type"], len(i["values"]), i["default"]), ("enum", 3, 2))
        d = opt("DamageToPlayerFromHitByACar")
        self.assertEqual((d["type"], len(d["values"]), d["default"]), ("enum", 5, 1))

    def test_anio_de_arranque(self):
        y = opt("StartYear")
        self.assertEqual(len(y["values"]), 100)
        self.assertEqual(y["values"][0]["en"], "1993")
        self.assertEqual(y["values"][-1]["en"], "2092")

    def test_nombre_y_etiqueta_traducidos(self):
        s = opt("ZombieLore.Speed")
        self.assertEqual(s["name"], {"en": "Speed", "es": "Velocidad"})
        self.assertEqual(s["values"][0], {"en": "Sprinters", "es": "Corredores"})

    def test_ayuda(self):
        # 257 de 269: las de ZombieConfig la leen de `Sandbox_<…>_help` y no de `_tooltip` (DoubleSandboxOption e
        # IntegerSandboxOption.getTooltip miran la tabla).
        self.assertEqual(sum(1 for o in data()["options"] if o.get("tip", {}).get("en")), 257)
        self.assertIn("Insane = 2.5", opt("ZombieConfig.PopulationMultiplier")["tip"]["en"])
        # El `\\n` del JSON pasa a un salto de renglón de verdad.
        self.assertIn("\n", opt("ZombieConfig.PopulationMultiplier")["tip"]["en"])
        self.assertNotIn("\\n", opt("ZombieConfig.PopulationMultiplier")["tip"]["en"])

    def test_todas_con_nombre_en_los_dos_idiomas(self):
        for o in data()["options"]:
            self.assertTrue(o["name"]["en"] and o["name"]["es"], o["key"])


@unittest.skipUnless(os.path.isdir(MEDIA), "sin el juego")
class Hojas(unittest.TestCase):
    HIDDEN = {"StartYear", "AlarmDecayModifier", "InsaneLootFactor", "ExtremeLootFactor", "RareLootFactor",
              "NormalLootFactor", "CommonLootFactor", "AbundantLootFactor", "Farming", "PlantAbundance", "NightLength",
              "AnimalMetaStatsModifier"}

    def test_cantidades_en_orden(self):
        pages = [p["id"] for p in data()["pages"]]
        self.assertEqual(pages, ["TimeOptions", "Zombie", "Loot", "WorldOptions", "NatureOptions", "Meta", "Character",
                                 "Vehicle", "Animal", "Hidden"])
        counts = [sum(1 for o in data()["options"] if o["page"] == p) for p in pages]
        self.assertEqual(counts[:9], [5, 47, 37, 24, 22, 24, 68, 17, 13])
        self.assertEqual({o["key"] for o in data()["options"] if o["page"] == "Hidden"}, self.HIDDEN)

    def test_las_opciones_van_en_el_orden_de_las_hojas(self):
        order = [p["id"] for p in data()["pages"]]
        seen = [order.index(o["page"]) for o in data()["options"]]
        self.assertEqual(seen, sorted(seen))

    def test_subtitulo(self):
        self.assertEqual(opt("ZombieLore.Speed")["title"]["en"], "Zombie Lore")
        self.assertNotIn("title", opt("ZombieLore.Strength"))


@unittest.skipUnless(os.path.isdir(MEDIA), "sin el juego")
class Presets(unittest.TestCase):
    def test_ids_y_diferencias(self):
        ps = data()["presets"]
        self.assertEqual([p["id"] for p in ps], ["apocalypse", "outbreak", "extinction", "rising", "six-months-later"])
        # Cada preset es lo que carga el juego (Apocalipsis ⊕ su archivo) menos lo que coincide con el default de Java:
        # 45 / 88 / 78 / 70 / 61. Seis meses después trae sólo 119 claves; guardar la diferencia del archivo contra Java
        # daba 36 (y perdía 25 valores que en el juego quedan en Apocalipsis). El 37 del plan medía contra Apocalipsis.
        self.assertEqual([len(p["values"]) for p in ps], [45, 88, 78, 70, 61])
        self.assertEqual(ps[4]["file"], "SixMonthsLater.lua")
        self.assertEqual(ps[4]["name"]["en"], "Six Months Later")
        self.assertNotIn("<LINE>", ps[4]["desc"]["en"])

    def test_seis_meses_despues(self):
        v = data()["presets"][4]["values"]
        self.assertEqual(v["ZombieConfig.PopulationMultiplier"], 1.6)
        self.assertEqual(v["TimeSinceApo"], 7)
        self.assertEqual(v["StartMonth"], 12)
        self.assertEqual(v["WaterShutModifier"], -1)

    def test_base_apocalipsis(self):
        """Seis meses después deja en Apocalipsis lo que su archivo no trae, y Apocalipsis no es el default de Java."""
        d = data()
        self.assertEqual(d["baseline"], "apocalypse")
        apo, six = d["presets"][0]["values"], d["presets"][4]["values"]
        self.assertEqual(six["ZombieRespawn"], 4)
        self.assertEqual(six["FoodLootNew"], 0.8)
        # Speed (el archivo la trae con el valor de Java) en Seis meses queda en Java, no en Apocalipsis.
        self.assertIn("ZombieLore.Speed", apo)
        self.assertNotIn("ZombieLore.Speed", six)
        # el "Default" que ve el jugador (StartDay: Java 23, Apocalipsis 9) está en `values` de Apocalipsis
        self.assertEqual(apo["StartDay"], 9)
        self.assertEqual(opt("StartDay")["default"], 23)

    def test_porcentajes_sin_duplicar(self):
        for o in data()["options"] + data()["ini"]:
            for t in (o.get("tip"), o.get("name")):
                if t:
                    self.assertNotIn("%%", t["en"] + t["es"], o["key"])

    def test_brote(self):
        self.assertEqual(data()["presets"][1]["values"]["WaterShut"], 3)

    def test_version(self):
        self.assertEqual(data()["version"], 6)


@unittest.skipUnless(os.path.isdir(MEDIA), "sin el juego")
class Cortes(unittest.TestCase):
    def test_rangos(self):
        s = data()["shutoff"]
        self.assertEqual(s["water"][1], [0, 29])
        self.assertEqual(s["elec"][1], [14, 29])
        self.assertEqual(s["water"][6], [60, 179])
        self.assertEqual(s["water"][0], [-1, -1])
        self.assertEqual(s["water"][8], [2147483647, 2147483647])
        self.assertEqual((len(s["water"]), len(s["elec"]), s["never"]), (9, 9, 2147483647))

    def test_reglas_del_calendario(self):
        self.assertEqual(data()["rules"], {"dayStartHour": 7, "monthDays": 30, "firstYear": 1993})

    def test_horas_y_largo_del_dia(self):
        self.assertEqual(data()["startHours"], [7, 9, 12, 14, 17, 21, 0, 2, 5])
        d = data()["dayLengthMinutes"]
        self.assertEqual((len(d), d[0], d[3], d[26]), (27, 15, 90, 1440))


@unittest.skipUnless(os.path.isdir(MEDIA), "sin el juego")
class Ini(unittest.TestCase):
    def ini(self, key):
        return next(o for o in data()["ini"] if o["key"] == key)

    def test_cantidad(self):
        self.assertEqual(len(data()["ini"]), 144)

    def test_ejemplos(self):
        self.assertEqual((self.ini("PVP")["type"], self.ini("PVP")["default"]), ("bool", True))
        p = self.ini("DefaultPort")
        self.assertEqual((p["type"], p["min"], p["max"], p["default"]), ("int", 0, 65535, 16261))
        m = self.ini("MaxPlayers")
        self.assertEqual((m["min"], m["max"], m["default"]), (1, 254, 32))

    def test_ayuda(self):
        self.assertEqual(sum(1 for o in data()["ini"] if o.get("tip", {}).get("en")), 121)

    def test_hojas(self):
        pages = data()["iniPages"]
        self.assertEqual(len(pages), 19)
        self.assertEqual(pages[-1]["id"], "Hidden")
        used = {o["page"] for o in data()["ini"]}
        self.assertEqual(used, {p["id"] for p in pages})


# ---------------------------------------------------------------------------
# Revisión del 2026-10-01: la limpieza de los textos y las opciones enlazadas
# ---------------------------------------------------------------------------

clean = server._Texts.clean
BS = "\\"


class BarrasInvertidasTest(unittest.TestCase):
    """Las comillas mal escapadas de ES_MX (`\\X\\`) pasan a comillas; las rutas de Mods/Map no se tocan."""

    def test_las_tres_opciones_del_juego(self):
        # Sandbox_ZombieCount_tooltip, Sandbox_PopulationMultiplier_help y Sandbox_MetaKnowledge_tooltip, tal cual vienen.
        self.assertEqual(
            clean(f"Cambiando esto se establece la opción avanzada {BS}Multiplicador de Población{BS}.", "Sandbox_ZombieCount_tooltip"),
            'Cambiando esto se establece la opción avanzada "Multiplicador de Población".')
        self.assertEqual(
            clean(f"Establecido por la opción de población {BS}Cantidad de zombies{BS}.{BS}n4.0 = Zombicidio",
                  "Sandbox_PopulationMultiplier_help"),
            'Establecido por la opción de población "Cantidad de zombies".\n4.0 = Zombicidio')
        self.assertEqual(
            clean(f"esta opción determina{BS}nsi se muestra en su totalidad, como {BS}???{BS}, o se oculta", "Sandbox_MetaKnowledge_tooltip"),
            'esta opción determina\nsi se muestra en su totalidad, como "???", o se oculta')

    def test_las_rutas_quedan_intactas(self):
        mods = f"Puedes encontrarla en {BS}Steam{BS}steamapps{BS}workshop{BS}modID{BS}mods{BS}modName{BS}info.txt"
        maps = f"Escribe el nombre de carpeta del mod, disponible en {BS}Steam{BS}steamapps{BS}workshop{BS}modID{BS}mods{BS}modName{BS}media{BS}maps{BS}"
        self.assertEqual(clean(mods, "UI_ServerOption_Mods_tooltip"), mods)
        self.assertEqual(clean(maps, "UI_ServerOption_Map_tooltip"), maps)


class AyudaDelIniTest(unittest.TestCase):
    def test_el_backslash_n_de_ejemplo_queda_escrito(self):
        # "Typing \n will create a new line": el \n es lo que hay que escribir, no un salto (la Task 1 lo convertía).
        self.assertEqual(
            clean(f"Description displayed in the browser. Typing {BS}n will create a new line", "UI_ServerOption_PublicDescription_tooltip"),
            f"Description displayed in the browser. Typing {BS}n will create a new line")
        self.assertEqual(
            clean(f"Al escribir {BS}n se creará una nueva línea", "UI_ServerOption_PublicDescription_tooltip"),
            f"Al escribir {BS}n se creará una nueva línea")

    def test_el_LINE_y_el_RGB_de_ejemplo_quedan(self):
        self.assertEqual(
            clean(f"También puede utilizar <LINE> para crear una línea. Utilice: {BS}<RGB:1,0,0> ¡Rojo!",
                  "UI_ServerOption_ServerWelcomeMessage_tooltip"),
            "También puede utilizar <LINE> para crear una línea. Utilice: <RGB:1,0,0> ¡Rojo!")

    def test_el_br_sigue_siendo_un_salto(self):
        self.assertEqual(clean("Sin admins.<br>AVISO: más de 32", "UI_ServerOption_MaxPlayers_tooltip"), "Sin admins.\nAVISO: más de 32")


class TextoEnriquecidoTest(unittest.TestCase):
    def test_sin_etiquetas_de_formato(self):
        raw = f"<BHC> [!] It is recommended that you DO NOT change this. [!] <RGB:1,1,1>{BS}n{BS}n Can be used to adjust"
        self.assertEqual(clean(raw, "Sandbox_RollsMultiplier_tooltip"),
                         "[!] It is recommended that you DO NOT change this. [!]\n\nCan be used to adjust")
        self.assertEqual(clean("<BHC> [!] Do not change this.[!]", "Sandbox_SpawnHouseStories_tooltip"), "[!] Do not change this.[!]")


DEFINES = 'ZombiePopulationMultiplierTable = { "2.5", "1.6", "1.2", "0.65", "0.15", "0.0" }\n'
SCREEN = '''
function Page3:onComboBoxSelected(combo, categoryName, optionName)
    if optionName == "Zombies" then
        local Zombies = combo.selected
        local popMult = ZombiePopulationMultiplierTable
        self.controls[categoryName]["ZombieConfig.PopulationMultiplier"]:setText(popMult[Zombies])
    end
\tif optionName == "ZombieRespawn" then
\t\tlocal respawn = combo.selected
\t\tlocal respawnHours = { "16.0", "72.0", "216.0", "0.0" }
\t\tself.controls[categoryName]["ZombieConfig.RespawnHours"]:setText(respawnHours[respawn])
\tend
end

function Page3:onTickBoxSelected(_, value, categoryName, optionName)
\tif optionName == "ZombieMigrate" then
\t\tif value then
\t\t\tself.controls[categoryName]["ZombieConfig.RedistributeHours"]:setText("12.0")
\t\telse
\t\t\tself.controls[categoryName]["ZombieConfig.RedistributeHours"]:setText("0.0")
\t\tend
\tend
end

function Page3:syncStartDay()
end
'''


def _opt(key, type_, **kw):
    return {"key": key, "type": type_, **kw}


OPTS = [
    _opt("Zombies", "enum", values=[{}] * 6),
    _opt("ZombieRespawn", "enum", values=[{}] * 4),
    _opt("ZombieMigrate", "bool"),
    _opt("ZombieConfig.PopulationMultiplier", "double", min=0, max=4),
    _opt("ZombieConfig.RespawnHours", "double", min=0, max=8760),
    _opt("ZombieConfig.RedistributeHours", "double", min=0, max=8760),
]


class EnlazadasTest(unittest.TestCase):
    def test_lee_las_tres_formas(self):
        links = server.linked_options(OPTS, SCREEN, DEFINES)
        self.assertEqual(links, [
            {"from": "Zombies", "to": "ZombieConfig.PopulationMultiplier",
             "values": [[1, 2.5], [2, 1.6], [3, 1.2], [4, 0.65], [5, 0.15], [6, 0]]},
            {"from": "ZombieRespawn", "to": "ZombieConfig.RespawnHours", "values": [[1, 16], [2, 72], [3, 216], [4, 0]]},
            {"from": "ZombieMigrate", "to": "ZombieConfig.RedistributeHours", "values": [[True, 12], [False, 0]]},
        ])

    def test_una_tabla_de_otro_largo_corta(self):
        with self.assertRaises(SystemExit):
            server.linked_options(OPTS, SCREEN, DEFINES.replace(', "0.0" }', " }"))

    def test_un_valor_fuera_de_rango_corta(self):
        with self.assertRaises(SystemExit):
            server.linked_options(OPTS, SCREEN, DEFINES.replace('"2.5"', '"9.5"'))

    def test_un_setText_que_no_entiende_corta(self):
        extra =SCREEN.replace('\tend\nend\n\nfunction Page3:onTickBoxSelected',
                               '\tend\n\tself.controls.X["ZombieConfig.RespawnHours"]:setText(foo())\nend\n\nfunction Page3:onTickBoxSelected')
        self.assertNotEqual(extra, SCREEN)
        with self.assertRaises(SystemExit):
            server.linked_options(OPTS, extra, DEFINES)


class EnlazadasYTextosEnElJuego(unittest.TestCase):

    def test_las_cinco_enlazadas_de_la_42_21(self):
        got = {(k["from"], k["to"]): [v for _, v in k["values"]] for k in data()["links"]}
        self.assertEqual(got, {
            ("Zombies", "ZombieConfig.PopulationMultiplier"): [2.5, 1.6, 1.2, 0.65, 0.15, 0],
            ("ZombieRespawn", "ZombieConfig.RespawnHours"): [16, 72, 216, 0],
            ("ZombieRespawn", "ZombieConfig.RespawnUnseenHours"): [6, 16, 48, 0],
            ("ZombieRespawn", "ZombieConfig.RespawnMultiplier"): [0.5, 0.1, 0.05, 0],
            ("ZombieMigrate", "ZombieConfig.RedistributeHours"): [12, 0],
        })

    def test_textos_limpios(self):
        opts = {o["key"]: o for o in data()["options"]}
        ini = {o["key"]: o for o in data()["ini"]}
        self.assertNotIn(BS, opts["Zombies"]["tip"]["es"])
        self.assertIn('"', opts["Zombies"]["tip"]["es"])
        for o in data()["options"]:
            for lang in ("en", "es"):
                self.assertNotIn("<BHC>", o.get("tip", {}).get(lang, ""), o["key"])
                self.assertNotIn("<RGB", o.get("tip", {}).get(lang, ""), o["key"])
        self.assertIn(f"{BS}Steam{BS}steamapps{BS}", ini["Mods"]["tip"]["es"])
        self.assertIn(f"{BS}n", ini["PublicDescription"]["tip"]["en"])
        self.assertNotIn("\n", ini["PublicDescription"]["tip"]["es"])


if __name__ == "__main__":
    unittest.main()
