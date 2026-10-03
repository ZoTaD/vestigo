"""
Tests de loot.py y luatable.py (el botín de Project Zomboid).

Los de `luatable` y los de la cuenta no necesitan el juego: arman tablas chicas a mano. Los de "en el juego" leen la
instalación (PZ_DIR) y se saltean si no está; ésos fijan los casos calculados a mano del plan
(docs/superpowers/plans/2026-10-01-zomboid-loot.md, "Casos a mano") y el inventario, con margen donde un parche lo
puede mover.

Correr desde la raíz del worktree:
    python -m unittest discover -s games/zomboid/tools/tests -v
"""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import luatable, loot  # noqa: E402


class LuaTest(unittest.TestCase):
    def test_tablas_locales_y_globales(self):
        env = {}
        loc = luatable.run_lua('''
            ClutterTables = ClutterTables or {}
            ClutterTables.Junk = { rolls = 1, items = { "Pen", 8, "Base.Pencil", 0.5 } }
            local t = { kitchen = { counter = { rolls = 2, items = {}, junk = ClutterTables.Junk } },
                        Bakery = BakeryMisc, n = -3 }
            function ignorada() if x then return 1 end end
            table.insert(Distributions, 1, t)
        ''', env, "prueba.lua")
        self.assertEqual(env["ClutterTables"]["Junk"]["items"], ["Pen", 8.0, "Base.Pencil", 0.5])
        self.assertIs(loc["t"]["kitchen"]["counter"]["junk"], env["ClutterTables"]["Junk"])
        self.assertNotIn("Bakery", loc["t"])  # un nombre que no existe es nil: el campo no se guarda
        self.assertEqual(loc["t"]["n"], -3.0)

    def test_corta_ante_lo_que_no_entiende(self):
        with self.assertRaises(luatable.LuaError) as e:
            luatable.run_lua('x = { a = "b" .. "c" }', {}, "raro.lua")
        self.assertIn("raro.lua:1", str(e.exception))

    def test_lo_demas_del_subconjunto(self):
        env = {"Viejo": {"a": 1.0}}
        loc = luatable.run_lua('''
            --[[ un comentario
                 largo ]]
            local function f(x) for i = 1, 3 do if x then x = x + 1 end end while false do end return x end
            local d = { a = 1; b = 'dos\\n', ["c d"] = true, 4, 5 }   -- con ; y claves entre corchetes
            d.e = { }
            d.a = nil
            Nuevo = Viejo
            Events.OnFoo.Add(f)
        ''', env, "resto.lua")
        self.assertEqual(loc["d"]["__arr"], [4.0, 5.0])
        self.assertEqual(loc["d"]["b"], "dos\n")
        self.assertIs(loc["d"]["c d"], True)
        self.assertEqual(loc["d"]["e"], {})
        self.assertNotIn("a", loc["d"])          # asignar nil borra el campo, como en Lua
        self.assertIs(env["Nuevo"], env["Viejo"])

    def test_anota_lo_que_queda_nil_por_un_nombre(self):
        nils = []
        luatable.run_lua('L = { Bakery = BakeryMisc,\n x = nil, y = Otra or Base, Ok = Hay }\nZ = Nada\n'
                         'local w = Tampoco\nlocal v\nlocal u = nil', {"Hay": {}}, "n.lua", nils)
        self.assertEqual(nils, [("n.lua", 1, "Bakery", "BakeryMisc"), ("n.lua", 2, "y", "Base"), ("n.lua", 3, "Z", "Nada"),
                                ("n.lua", 4, "w", "Tampoco")])

    def test_aritmetica_y_llamadas_en_tablas_cortan(self):
        for src in ('x = { 1 + 2 }', 'x = { f(1) }', 'local y = a and b', 'x = { a = -b }'):
            with self.assertRaises(luatable.LuaError, msg=src):
                luatable.run_lua(src, {}, "raro.lua")


class HashMapTest(unittest.TestCase):
    """
    El orden de recorrido de java.util.HashMap que usa el sorteo de listas procedurales. Los valores esperados salieron
    de Java real (JDK 17, `new HashMap<>()` + put en ese orden + keySet()) una sola vez, al escribir estos tests; loot.py
    no usa Java nunca. Así un cambio en el emulador se nota sin tener Java a mano.
    """

    def test_string_hash_code(self):
        self.assertEqual(loot.java_string_hash("A"), 65)
        self.assertEqual(loot.java_string_hash("Aa"), 2112)          # "Aa" y "BB" chocan: mismo hashCode
        self.assertEqual(loot.java_string_hash("BB"), 2112)
        self.assertEqual(loot.java_string_hash("KitchenCannedFood"), 1278240863)
        self.assertEqual(loot.java_string_hash("FridgeSnacks"), -1013845910)   # int de 32 bits con desborde
        self.assertEqual(loot.java_string_hash("ñandú"), 225567348)            # sobre unidades UTF-16
        self.assertEqual(loot.java_string_hash(""), 0)

    def test_orden_de_muebles_del_juego(self):
        cases = [
            ("KitchenBottles,KitchenBaking,KitchenBreakfast,KitchenCannedFood,KitchenDishes,KitchenDryFood,KitchenPots,"
             "KitchenRandom",
             "KitchenDishes,KitchenBottles,KitchenBreakfast,KitchenRandom,KitchenBaking,KitchenDryFood,KitchenPots,"
             "KitchenCannedFood"),                                                    # kitchen.counter
            ("FridgeBottles,FridgeSnacks", "FridgeBottles,FridgeSnacks"),             # restaurantdining.fridge
            ("Antiques,ArtSupplies,Hobbies,LivingRoomWardrobe", "LivingRoomWardrobe,Antiques,Hobbies,ArtSupplies"),
            ("KitchenCannedFood,KitchenDryFood", "KitchenDryFood,KitchenCannedFood"),  # kitchen.metal_shelves
            # storageunit.other: 53 listas, la capacidad pasa de 16 a 32, 64 y 128.
            ("Antiques,BurglarTools,CrateCamping,CrateCostume,Hiker,Homesteading,Hunter,MechanicSpecial,SurvivalGear,"
             "Trapper,ArtSupplies,Chemistry,CrateCanning,CrateDishes,CrateInstruments,CrateLinens,CratePetSupplies,"
             "CratePhotos,CrateSports,CrateToys,EngineerTools,FitnessTrainer,Gifts,Hobbies,HolidayStuff,"
             "ImprovisedCrafts,JunkHoard,Photographer,PlumbingSupplies,ScienceMisc,VacationStuff,WallDecor,"
             "CrateElectronics,ClothingStorageWinter,CrateClothesRandom,CrateFootwearRandom,CrateBlacksmithing,"
             "CrateCarpentry,CrateFarming,CrateFishing,CrateMechanics,CrateMetalwork,CrateTailoring,CrateTools,"
             "CrateToolsOld,CrateFabric_Cotton,CrateFabric_DenimBlack,CrateFabric_DenimBlue,CrateFabric_DenimDarkBlue,"
             "CrateRandomJunk,CrateBooks,CrateMagazines,CrateNewspapers",
             "CrateInstruments,BurglarTools,CrateCarpentry,CrateCostume,Homesteading,JunkHoard,PlumbingSupplies,"
             "CrateMetalwork,CrateToys,ClothingStorageWinter,CrateToolsOld,CrateElectronics,Hunter,"
             "CrateFabric_DenimBlack,CrateDishes,ImprovisedCrafts,CrateFabric_DenimBlue,Trapper,Hiker,VacationStuff,"
             "Chemistry,EngineerTools,CrateFootwearRandom,Photographer,CrateLinens,Gifts,CrateMagazines,HolidayStuff,"
             "CrateFarming,MechanicSpecial,CrateBooks,CrateFabric_Cotton,CratePhotos,CrateMechanics,CrateTailoring,"
             "ArtSupplies,CrateBlacksmithing,CrateFishing,CrateNewspapers,CrateFabric_DenimDarkBlue,ScienceMisc,"
             "CrateSports,Antiques,CrateCamping,CratePetSupplies,FitnessTrainer,CrateCanning,Hobbies,CrateRandomJunk,"
             "CrateClothesRandom,WallDecor,CrateTools,SurvivalGear"),
        ]
        for keys, want in cases:
            self.assertEqual(loot.java_hashmap_order(keys.split(",")), want.split(","), msg=keys[:40])

    def test_choques_repetidos_y_resize(self):
        # Mismo bucket: gana el orden de inserción. Un repetido conserva su primer lugar.
        self.assertEqual(loot.java_hashmap_order(["Aa", "BB"]), ["Aa", "BB"])
        self.assertEqual(loot.java_hashmap_order(["BB", "Aa"]), ["BB", "Aa"])
        self.assertEqual(loot.java_hashmap_order(["Pen", "Bowl", "Pen", "Cup"]), ["Pen", "Bowl", "Cup"])
        # 7 nombres con el mismo hashCode mezclados con otros 13 (resize de 16 a 32 por el medio).
        keys = ("BBBBAa,Pen,AaAaAa,Bowl,BBAaBB,Cup,AaBBAa,Spoon,Fork,BBAaAa,Knife,Pot,AaAaBB,Pan,Kettle,Mug,AaBBBB,"
                "Plate,Jar,Lid").split(",")
        want = ("BBBBAa,AaAaAa,BBAaBB,AaBBAa,BBAaAa,AaAaBB,AaBBBB,Fork,Lid,Plate,Knife,Kettle,Pot,Spoon,Pen,Jar,Pan,"
                "Bowl,Mug,Cup").split(",")
        self.assertEqual(loot.java_hashmap_order(keys), want)

    def test_ocho_en_un_bucket_corta(self):
        # Con 8 nodos en un bucket Java está a uno de treeifyBin: el emulador deja de valer y corta.
        same = ["AaAaAa", "AaAaBB", "AaBBAa", "AaBBBB", "BBAaAa", "BBAaBB", "BBBBAa", "BBBBBB"]
        self.assertEqual(len({loot.java_string_hash(s) for s in same}), 1)
        with self.assertRaises(SystemExit):
            loot.java_hashmap_order(same)

    def test_sorteo_primera_mas_uno_ultima_menos_uno(self):
        got = loot.pick_chances({"KitchenCannedFood": 100, "KitchenDryFood": 100})
        self.assertEqual(got, {"KitchenDryFood": 101 / 200, "KitchenCannedFood": 99 / 200})
        self.assertEqual(loot.pick_chances({"Sola": 7}), {"Sola": 1.0})
        self.assertEqual(loot.pick_chances({}), {})


class CuentaTest(unittest.TestCase):
    def test_entrada_y_junk(self):
        self.assertAlmostEqual(loot.entry_chance(4, False), 0.04)
        self.assertAlmostEqual(loot.entry_chance(0.05, True), 0.0007)
        self.assertEqual(loot.entry_chance(100, False), 1.0)

    def test_entrada_redondea_como_el_juego(self):
        # El juego sortea un entero de 0 a 9.999 y lo compara con la chance (un float de 32 bits): con chance 0,1
        # alcanza el 0, así que sale 1 de cada 10.000 y no 1 de cada 100.000. Y 0,3 × 100 en float es 30,000002,
        # que deja pasar también el 30.
        self.assertAlmostEqual(loot.entry_chance(0.001, False), 0.0001, places=9)
        self.assertAlmostEqual(loot.entry_chance(0.005, False), 0.0001, places=9)
        self.assertAlmostEqual(loot.entry_chance(0.3, False), 0.0031, places=9)
        self.assertEqual(loot.entry_chance(0, False), 0.0)

    def test_tabla_con_tiradas_y_repetidos(self):
        t = {"rolls": 4, "items": ["Money", 100, "Bowl", 10, "Bowl", 10], "junk": {"rolls": 1, "items": ["Pen", 1]}}
        p = loot.table_chances(t)
        self.assertEqual(p["Base.Money"], 1.0)
        self.assertAlmostEqual(p["Base.Bowl"], 1 - 0.9 ** 8)       # dos entradas, cuatro tiradas
        self.assertAlmostEqual(p["Base.Pen"], 0.014)               # junk: × 1,4

    def test_only_one_corta_en_el_primero(self):
        # Con onlyOne el juego deja de tirar apenas sale algo: lo que está después en la lista sólo sale si todo lo
        # anterior falló, en esta tirada y en las anteriores.
        t = {"rolls": 2, "onlyOne": True, "items": ["Pen", 50, "Bowl", 50]}
        p = loot.table_chances(t)
        self.assertAlmostEqual(p["Base.Pen"], 0.5 + 0.25 * 0.5)
        self.assertAlmostEqual(p["Base.Bowl"], 0.5 * 0.5 + 0.25 * 0.5 * 0.5)

    def test_pares_raros_como_el_juego(self):
        # El juego arma los pares de a dos y saltea el que no es (texto, número): un número suelto al final no corre
        # nada (ClothingStorageAllJackets termina en `10,7`).
        p = loot.table_chances({"rolls": 1, "items": ["Pen", 1, 7, "Bowl", "Cup", 2, 5]})
        self.assertEqual(sorted(p), ["Base.Cup", "Base.Pen"])
        with self.assertRaises(ValueError):
            loot.table_chances({"rolls": 1, "items": "Pen"})

    def test_nombre_que_no_existe_no_ocupa_lugar(self):
        # El juego descarta al cargar los nombres que no existen: con onlyOne no cortan la tirada.
        t = {"rolls": 1, "onlyOne": True, "items": ["NoExiste", 50, "Pen", 50]}
        self.assertAlmostEqual(loot.table_chances(t, known={"Base.Pen"})["Base.Pen"], 0.5)
        self.assertNotIn("Base.NoExiste", loot.table_chances(t, known={"Base.Pen"}))

    def test_procedural_sortea_como_el_juego_y_respeta_min_1(self):
        # El juego sortea r ∈ [0, 539] y recorre el HashMap: "A" (hash 65, bucket 1) va antes que "B" (66, bucket 2),
        # así que A gana con r ∈ [0, 100]: 101 casos de 540, no 100.
        proc = {"A": {"rolls": 2, "items": ["TinnedBeans", 4]}, "B": {"rolls": 1, "items": ["Bowl", 10]}}
        c = {"procedural": True, "procList": [{"name": "A", "min": 0, "max": 1, "weightChance": 100},
                                               {"name": "B", "min": 0, "max": 1, "weightChance": 440}]}
        got = {g: p for g, p, f in loot.container_chances(c, proc)}
        self.assertAlmostEqual(got["Base.TinnedBeans"], 101 / 540 * (1 - 0.96 ** 2))
        self.assertAlmostEqual(got["Base.Bowl"], 439 / 540 * 0.1)
        c["procList"][1]["min"] = 1   # el primer mueble del cuarto elige B sí o sí
        got = {g: p for g, p, f in loot.container_chances(c, proc)}
        self.assertNotIn("Base.TinnedBeans", got)
        self.assertAlmostEqual(got["Base.Bowl"], 0.1)

    def test_listas_forzadas_van_aparte(self):
        proc = {"Rica": {"rolls": 1, "items": ["Caviar", 10]}, "Comun": {"rolls": 1, "items": ["Bowl", 10]}}
        c = {"procedural": True, "procList": [{"name": "Rica", "min": 0, "max": 99, "forceForZones": "Rich"},
                                               {"name": "Comun", "min": 0, "max": 99, "weightChance": 100}]}
        got = {g: (p, f) for g, p, f in loot.container_chances(c, proc)}
        self.assertAlmostEqual(got["Base.Caviar"][0], 0.1)
        self.assertEqual(got["Base.Caviar"][1], "z:Rich")
        self.assertAlmostEqual(got["Base.Bowl"][0], 0.1)
        self.assertIsNone(got["Base.Bowl"][1])

    def test_procedural_sin_peso_vale_1_y_lista_que_falta_no_trae_nada(self):
        # A (sin peso: vale 1) va primero en el HashMap y gana con r ∈ [0, 1]; NoExiste (peso 3) con r ∈ {2, 3}: ocupa
        # su parte del sorteo y no trae nada.
        proc = {"A": {"rolls": 1, "items": ["Bowl", 100]}}
        c = {"procedural": True, "procList": [{"name": "A", "min": 0, "max": 99},
                                               {"name": "NoExiste", "min": 0, "max": 99, "weightChance": 3}]}
        self.assertEqual(loot.java_hashmap_order(["A", "NoExiste"]), ["A", "NoExiste"])
        got = {g: p for g, p, f in loot.container_chances(c, proc)}
        self.assertAlmostEqual(got["Base.Bowl"], 0.5)

    def test_lista_que_el_sorteo_nunca_elige_no_trae_nada(self):
        # Dos listas de peso 1: r ∈ {0, 1} y la primera ya tiene acumulado 1 ≥ r, así que la segunda no sale nunca
        # (es lo que le pasa a FridgeSnacks en restaurantdining.fridge).
        self.assertEqual(loot.pick_chances({"FridgeBottles": 1, "FridgeSnacks": 1}), {"FridgeBottles": 1.0, "FridgeSnacks": 0.0})
        proc = {"FridgeBottles": {"rolls": 1, "items": ["Pop", 50]}, "FridgeSnacks": {"rolls": 1, "items": ["Burger", 50]}}
        c = {"procedural": True, "procList": [{"name": "FridgeBottles", "min": 0, "max": 99},
                                               {"name": "FridgeSnacks", "min": 0, "max": 99}]}
        got = {g: p for g, p, f in loot.container_chances(c, proc)}
        self.assertEqual(got, {"Base.Pop": 0.5})

    def test_afuera_de_un_cuarto_no_hay_prioridad_ni_tope(self):
        proc = {"A": {"rolls": 1, "items": ["Pen", 100]}, "B": {"rolls": 1, "items": ["Bowl", 100]}}
        c = {"procedural": True, "procList": [{"name": "A", "min": 1, "max": 99, "weightChance": 10},
                                               {"name": "B", "min": 0, "max": 0, "weightChance": 10}]}
        self.assertEqual({g: p for g, p, f in loot.container_chances(c, proc)}, {"Base.Pen": 1.0})
        got = {g: p for g, p, f in loot.container_chances(c, proc, in_room=False)}
        self.assertAlmostEqual(got["Base.Pen"], 11 / 20)
        self.assertAlmostEqual(got["Base.Bowl"], 9 / 20)

    def test_dos_condiciones_de_forzado_cortan(self):
        c = {"procedural": True, "procList": [{"name": "A", "forceForZones": "Rich", "forceForRooms": "kitchen"}]}
        with self.assertRaises(SystemExit):
            loot.container_chances(c, {})

    @staticmethod
    def fake_loot(rooms, general, no_fill=()):
        """Un Loot armado a mano (sin leer el juego) para probar las reglas de la clase."""
        L = object.__new__(loot.Loot)
        L.rooms, L.general, L.no_fill_rooms, L.procedural, L.known = rooms, general, sorted(no_fill), {}, None
        return L

    def test_all_propia_de_una_tienda_no_llena_bolsos(self):
        # fillContainerInternal pc 637–640 guarda "all" en una variable que no llega al llenado: pc 753–763 llama a
        # fillContainerTypeInternal con el nombre real del cuarto, y ése es el que mira NoContainerFillRooms (pc 0–14).
        # O sea que la `all` común de una tienda trae los bolsos vacíos, como cualquier tabla común de ahí.
        comun = {"rolls": 1, "items": ["Bag_Schoolbag", 10]}
        proc = {"procedural": True, "procList": []}
        L = self.fake_loot({"tienda": {"all": comun}, "kiosco": {"all": proc}}, {}, no_fill=["tienda", "kiosco"])
        self.assertFalse(L.fills_bags("tienda", "counter"))
        self.assertTrue(L.fills_bags("kiosco", "counter"))   # procedural: rollProceduralItemInternal pasa `true` fijo

    def test_chances_sabe_si_el_mueble_esta_en_un_cuarto(self):
        # Afuera de un cuarto no hay prioridad de min == 1 ni tope de max; en un cuarto sin tabla propia sí (in_room es
        # "hay cuarto", tenga tabla o no). Loot.chances lo ata a la habitación para que nadie lo pase a mano.
        L = self.fake_loot({}, {"bin": {"procedural": True, "procList": [
            {"name": "A", "min": 1, "max": 99, "weightChance": 10}, {"name": "B", "min": 0, "max": 0, "weightChance": 10}]}})
        L.procedural = {"A": {"rolls": 1, "items": ["Pen", 100]}, "B": {"rolls": 1, "items": ["Bowl", 100]}}
        afuera = {g: p for g, p, f in L.chances(None, "bin")}
        adentro = {g: p for g, p, f in L.chances("cuartosintabla", "bin")}
        self.assertAlmostEqual(afuera["Base.Pen"], 11 / 20)
        self.assertAlmostEqual(afuera["Base.Bowl"], 9 / 20)
        self.assertEqual(adentro, {"Base.Pen": 1.0})

    def test_nombres_con_empty(self):
        self.assertEqual(loot.resolve_item("PopEmpty", {"Base.Pop"}), "Base.Pop")
        self.assertEqual(loot.resolve_item("Base.Pen", {"Base.Pen"}), "Base.Pen")
        self.assertIsNone(loot.resolve_item("BookKnapping1", {"Base.Pen"}))
        self.assertEqual(loot.game_id("Pen"), "Base.Pen")
        self.assertEqual(loot.game_id("Radio.WalkieTalkie1"), "Radio.WalkieTalkie1")


@unittest.skipUnless(os.path.isdir(loot.PZ_DIR), "sin el juego")
class JuegoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.L = loot.Loot()
        except SystemExit as e:  # que el corte de loot.py se vea como una falla y no termine la corrida
            raise AssertionError(str(e)) from None

    def p(self, room, cont, gid):
        return {g: p for g, p, f in self.L.chances(room, cont) if f is None}.get(gid)

    def test_casos_a_mano(self):
        # KitchenCannedFood queda última en el HashMap de kitchen.counter (99 de 540 casos) y de metal_shelves (99 de
        # 200): el sorteo del juego le saca 1 de peso.
        self.assertAlmostEqual(self.p("kitchen", "counter", "Base.TinnedBeans"), 99 / 540 * (1 - 0.96 ** 2), places=7)
        self.assertAlmostEqual(self.p("kitchen", "counter", "Base.TinnedBeans"), 0.0143733, places=7)
        self.assertAlmostEqual(self.p("kitchen", "metal_shelves", "Base.TinnedBeans"), 0.038808, places=7)
        self.assertAlmostEqual(self.p("kitchen", "overhead", "Base.Bowl"), 0.3439, places=6)
        self.assertAlmostEqual(self.p(None, "bin", "Base.Bag_TrashBag"), 0.5904, places=6)
        self.assertAlmostEqual(self.p(None, "bin", "Base.BaseballBat_Broken"), 0.0007, places=6)
        self.assertEqual(self.p(None, "cashregister", "Base.Money"), 1.0)
        self.assertAlmostEqual(loot.table_chances(self.L.zombie["m"])["Base.Pen"], 0.01, places=6)
        self.assertAlmostEqual(loot.table_chances(self.L.zombie["f"])["Base.Pen"], 0.01, places=6)
        self.assertAlmostEqual(loot.table_chances(self.L.outfits["Police"])["Base.Badge"], 0.5, places=6)
        self.assertAlmostEqual(loot.table_chances(self.L.vehicles["Police"]["TruckBed"])["Base.Bullhorn"], 0.3439, places=6)
        self.assertAlmostEqual(loot.table_chances(self.L.vehicles["Police"]["GloveBox"])["Base.Bullhorn"], 0.1, places=6)

    def test_listas_que_el_juego_nunca_elige(self):
        # restaurantdining.fridge: FridgeBottles y FridgeSnacks pesan 1 y FridgeBottles va primero: lo que sólo trae
        # FridgeSnacks no puede salir en esa heladera.
        L = self.L
        only_snacks = set(loot.table_chances(L.procedural["FridgeSnacks"])) - set(loot.table_chances(L.procedural["FridgeBottles"]))
        self.assertGreater(len(only_snacks), 10)
        got = {g: p for g, p, f in loot.container_chances(L.table_for("restaurantdining", "fridge"), L.procedural)}
        self.assertEqual(only_snacks & set(got), set())
        self.assertTrue(all(p > 0 for p in got.values()))
        own = loot._pairs_of([(k, v) for k, v in L.rooms.items() if k not in L.aliases])
        never = loot.never_chosen(own)
        self.assertEqual(len(never), 13)
        self.assertIn(("restaurantdining", "fridge", "FridgeSnacks"), never)
        self.assertIn(("livingroom", "wardrobe", "ArtSupplies"), never)

    def test_bolsos_en_tiendas(self):
        # En los NoContainerFillRooms los bolsos de un mueble común vienen vacíos, pero los de uno procedural no.
        L = self.L
        self.assertIn("armysurplus", L.no_fill_rooms)
        self.assertFalse(L.fills_bags("armysurplus", "tent"))      # tabla común
        self.assertTrue(L.fills_bags("armysurplus", "counter"))    # procedural
        self.assertTrue(L.fills_bags("kitchen", "counter"))
        self.assertTrue(L.fills_bags(None, "crate"))

    def test_reglas_de_la_tabla(self):
        L = self.L
        self.assertIs(L.table_for("garage", "counter"), L.rooms["mechanic"]["counter"])   # alias
        self.assertIs(L.table_for("kitchen", "crate"), L.rooms["kitchen"]["other"])       # sin crate: other
        self.assertIs(L.table_for("kitchen", "bin"), L.general["bin"])                    # bin no es genérico
        self.assertIs(L.table_for("bedroom4", "counter"), L.general["counter"])           # cuarto sin tabla
        self.assertIs(L.table_for("Bathroom", "counter"), L.general["counter"])           # mayúsculas: otro cuarto
        # Un cuarto que sólo trae `all` (sodatruck, empty…) tira ésa en cualquier mueble, y nunca la general.
        self.assertIs(L.table_for("sodatruck", "counter"), L.rooms["sodatruck"]["all"])
        self.assertIs(L.table_for("empty", "fridge"), L.rooms["empty"]["all"])

    def test_inventario(self):
        L = self.L
        self.assertGreaterEqual(len(L.rooms), 360)
        self.assertEqual(len(L.stashes), 15)
        self.assertGreaterEqual(len(L.procedural), 1400)
        self.assertEqual(sorted(L.missing_lists), ["Bakery", "WardrobeManClassy", "WardrobeWoman", "WardrobeWomanClassy"])
        self.assertEqual(len(L.vehicles), 82)
        self.assertEqual(len(L.outfits), 125)
        self.assertGreaterEqual(len(L.bags), 250)
        self.assertEqual(L.aliases["garage"], "mechanic")
        self.assertEqual(len(L.aliases), 41)
        self.assertEqual(len(L.no_fill_rooms), 16)
        self.assertEqual(len(L.dangling_lists), 15)   # nombradas en un procList y que no existen (cortan si aparece otra)

    def test_no_generic_igual_al_bytecode(self):
        # La lista de muebles que nunca caen en `other` está escrita en Java (ItemPickerJava.initNoGenericLootContainers,
        # un Set.add(ContainerType.X) por mueble). Se lee del .jar y se pasa cada X por ContainerType.<clinit>
        # (`registerBase("nombre")` → `putstatic X`): si un parche agrega o saca uno, esto falla y hay que tocar NO_GENERIC.
        import extract
        cp, code = extract._jar_class("zombie/inventory/ItemPickerJava.class")
        fields = []
        for ins in extract._instructions(code[("initNoGenericLootContainers", "()V")]):
            m = extract._member(cp, ins, 0xb2)
            if m and m[0] == "zombie/scripting/objects/ContainerType":
                fields.append(m[1])
        cp2, code2 = extract._jar_class("zombie/scripting/objects/ContainerType.class")
        names, last = {}, None
        for ins in extract._instructions(code2[("<clinit>", "()V")]):
            v = extract._ldc(cp2, ins)
            if isinstance(v, str):
                last = v
            m = extract._member(cp2, ins, 0xb3)
            if m and m[0] == "zombie/scripting/objects/ContainerType" and last is not None:
                names[m[1]] = last
                last = None
        self.assertEqual(len(fields), 41)
        self.assertEqual(frozenset(names[f] for f in fields), loot.NO_GENERIC)


class NombresTest(unittest.TestCase):
    def test_falta_un_nombre_va_en_palabras_y_avisa(self):
        import io, contextlib, loot_names
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertEqual(loot_names.name({}, "StepVan_MarineBites"), ("Step Van Marine Bites",) * 2)
            self.assertEqual(loot_names.name({}, "otroMueble", "Other thing"), ("Other thing",) * 2)
        self.assertIn("StepVan_MarineBites", err.getvalue())
        self.assertEqual(loot_names.name(loot_names.CONTAINERS, "fridge"), ("Fridge", "Heladera"))

    def test_reglas_de_atuendos_y_vehiculos(self):
        import loot_names as n
        self.assertEqual(n.OUTFITS["Survivalist03_Mid"], n.OUTFITS["Survivalist_Mid"])
        self.assertEqual(n.OUTFITS["Bandit_Early"], ("Bandit (early)", "Bandido (al principio)"))
        self.assertEqual(n.OUTFITS["Jackie_Jaye"], ("Jackie Jaye", "Jackie Jaye"))
        self.assertEqual(n.VEHICLES["StepVan_MarineBites"], ("Step van (Marine Bites)", "Furgón (Marine Bites)"))
        self.assertEqual(n.VEHICLES["MetalWelder"], ("Welder's vehicle", "Vehículo de obrero metalúrgico"))


class ShardTest(unittest.TestCase):
    def test_shard_con_n(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("zomboid_site", os.path.join(os.path.dirname(__file__), "..", "site.py"))
        site = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(site)
        self.assertEqual(site.fnv1a32(""), 0x811C9DC5)
        self.assertEqual(site.fnv1a32("a"), 0xE40C292C)          # el valor de referencia de FNV-1a
        self.assertEqual(site.shard("crowbar"), site.shard("crowbar", 100))
        self.assertEqual(site.shard("kitchen", 32), f"{site.fnv1a32('kitchen') % 32:02d}")


@unittest.skipUnless(os.path.isdir(loot.PZ_DIR) and os.path.isfile(os.path.join(loot.DATA, "map", "buildings.json")),
                     "sin el juego o sin los datos de extract.py y map.py")
class SitioTest(unittest.TestCase):
    """Los archivos de data/loot que arma build(), con el juego de verdad (se arman una vez para toda la clase)."""

    @classmethod
    def setUpClass(cls):
        try:
            cls.L = loot.Loot(known=loot._known_ids())
            cls.files = loot.build(cls.L)
        except SystemExit as e:
            raise AssertionError(str(e)) from None
        cls.site = loot.site_module()

    def item(self, slug):
        return self.files[f"items/{self.site.shard(slug)}.json"].get(slug)

    def test_claves(self):
        want = {f"items/{i:02d}.json" for i in range(100)} | {f"rooms/{i:02d}.json" for i in range(32)}
        self.assertEqual(set(self.files), want | {"common.json", "meta.json"})

    def test_frijoles_en_la_cocina(self):
        rows = self.item("canned-beans")["rooms"]
        # 99/200 × (1 − 0,96²) = 0,038808, redondeado a 5 decimales.
        hit = [r for r in rows if r[:2] == ["kitchen", "metal_shelves"]]
        self.assertEqual(len(hit), 1)
        self.assertAlmostEqual(hit[0][2], 0.03881, places=5)
        self.assertEqual(len(hit[0]), 3)   # sin fuerza
        self.assertLessEqual(len(rows), 10)
        self.assertGreaterEqual(self.item("canned-beans")["nRooms"], len(rows))
        self.assertEqual(rows, sorted(rows, key=lambda r: (-r[2], r[0])))

    def test_zombis(self):
        badge = self.item("badge")["zombie"]
        self.assertIn(["Police", 0.5], badge["outfits"])
        pen = self.item("pen-black")["zombie"]
        self.assertEqual(pen["m"], 0.01)
        self.assertEqual(pen["f"], 0.01)

    def test_megafono_y_tope_de_atuendos(self):
        mega = self.item("megaphone")
        self.assertEqual(mega["vehicles"][0], ["PoliceSWAT", "TruckBed", 0.5904])
        self.assertLessEqual(len(mega["vehicles"]), 5)
        outfits = self.item("badge")["zombie"]["outfits"]
        self.assertEqual(outfits[:6], [["Agent", 1], ["AirportSecurityTarmac", 1], ["BountyHunter", 1], ["Detective", 1],
                                       ["Ranger", 1], ["Police", 0.5]])
        self.assertLessEqual(len(outfits), 8)

    def test_habitaciones(self):
        garage = self.files[f"rooms/{self.site.shard('garage', 32)}.json"]
        self.assertEqual(garage["rooms"]["garage"]["t"], "mechanic")
        for i in range(32):
            self.assertNotIn("bedroom4", self.files[f"rooms/{i:02d}.json"]["rooms"])
        al = self.files[f"rooms/{self.site.shard('_all', 32)}.json"]["rooms"]
        self.assertIn("_all", al)
        kitchen = self.files[f"rooms/{self.site.shard('kitchen', 32)}.json"]
        top = kitchen["rooms"]["kitchen"]["top"]
        self.assertLessEqual(len(top), 30)
        self.assertIn(["bowl", "overhead", 0.3439], top)
        self.assertIn("bowl", kitchen["items"])
        self.assertEqual(kitchen["conts"]["overhead"], ["Overhead cupboard", "Alacena"])

    def test_nombres_completos(self):
        common = self.files["common.json"]
        need = {k: set() for k in ("containers", "parts", "vehicles", "outfits", "stashes", "zones")}

        def force(row):
            if len(row) > 3 and row[3].startswith("z:"):
                need["zones"].add(row[3][2:])
        for name, f in self.files.items():
            if name.startswith("items/"):
                for it in f.values():
                    for r in it["rooms"] + it.get("stash", []):
                        need["containers"].add(r[1])
                        force(r)
                    for r in it.get("stash", []):
                        need["stashes"].add(r[0])
                    for g, part, _ in it.get("vehicles", []):
                        need["vehicles"].add(g)
                        need["parts"].add(part)
                    for o, _ in it.get("zombie", {}).get("outfits", []):
                        need["outfits"].add(o)
            elif name.startswith("rooms/"):
                for r in f["rooms"].values():
                    for row in r["top"]:
                        force(row)
                        self.assertTrue(all(f["conts"][row[1]]), row)
        missing = {k: sorted(x for x in v if not (x in common[k] and common[k][x]["en"] and common[k][x]["es"]))
                   for k, v in need.items()}
        self.assertEqual({k: v for k, v in missing.items() if v}, {})

    def test_lugares_en_el_mapa(self):
        import json
        spots = self.files["common.json"]["spots"]
        self.assertGreater(spots["kitchen"]["n"], 1000)
        with open(os.path.join(loot.DATA, "map", "buildings.json"), encoding="utf-8") as f:
            ids = {b["id"] for b in json.load(f)["buildings"]}
        self.assertIn(spots["kitchen"]["at"][0], ids)
        self.assertIn("garage", self.files["common.json"]["aliases"]["mechanic"])
        # "también: ..." sólo con habitaciones que existen en el mapa: House kitchen y compañía no están en ningún edificio.
        with open(os.path.join(loot.DATA, "map", "buildings.json"), encoding="utf-8") as f:
            on_map = set(json.load(f)["rooms"])
        for table, names in self.files["common.json"]["aliases"].items():
            self.assertTrue(set(names) <= on_map, (table, sorted(set(names) - on_map)))
        self.assertNotIn("house_kitchen", self.files["common.json"]["aliases"].get("kitchen", []))

    def test_solo_habitaciones_que_estan_en_el_mapa(self):
        # Una tabla cuyo cuarto no existe en Knox County (ni con su nombre ni con un alias) nunca llena nada en vanilla:
        # no va en "Dónde aparece". Los frijoles la traían segunda ("Hoarderkitchen · 7,8 %").
        import json
        with open(os.path.join(loot.DATA, "map", "buildings.json"), encoding="utf-8") as f:
            on_map = set(json.load(f)["rooms"])
        common = self.files["common.json"]
        # Una tabla está en el mapa si algún cuarto del mapa la tira: con su nombre o con un alias (la misma tabla del
        # Lua, por identidad), sin pasar por `map_rooms`.
        rooms = self.L.rooms
        ok = {t for t in rooms if any(raw in rooms and rooms[raw] is rooms[t] for raw in on_map)}
        self.assertEqual(set(common["spots"]), ok & set(common["spots"]))
        self.assertNotIn("hoarderkitchen", ok)
        self.assertTrue(all(s["n"] > 0 and "at" in s for s in common["spots"].values()))
        for name, f in self.files.items():
            if name.startswith("items/"):
                for slug, it in f.items():
                    for r in it["rooms"]:
                        self.assertTrue(r[0] == "_all" or r[0] in ok, (slug, r[0]))
        beans = [r[0] for r in self.item("canned-beans")["rooms"]]
        self.assertNotIn("hoarderkitchen", beans)
        # La tabla `barbecuestore` no es un cuarto del mapa, pero su alias `barbequestore` sí: queda.
        self.assertIn("barbecuestore", common["spots"])
        # Lo que no depende de un cuarto sigue igual: el zombi policía trae la insignia.
        self.assertIn(["Police", 0.5], self.item("badge")["zombie"]["outfits"])

    def test_meta(self):
        meta = self.files["meta.json"]
        self.assertEqual(meta["ref"], loot.REF)
        self.assertIn("Antlers", meta["unknown"])   # el nombre de la tabla, como lo escribe el juego
        self.assertEqual(len(meta["dataHash"]), 64)


if __name__ == "__main__":
    unittest.main()
