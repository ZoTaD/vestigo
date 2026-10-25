"""Pruebas de `site_data` y `sprites`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import site_data  # noqa: E402
from sprites import fuente_juego, sprite_file  # noqa: E402

ROOT = Path(__file__).resolve().parents[4]
SPRITES = ROOT / "site/public/stardew/items"


class TestSiteData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = site_data.build(write=False)

    def test_cada_fila_tiene_ficha_y_sprite(self):
        for row in self.out["list"]:
            self.assertIn(row[1], self.out["fichas"])
            self.assertTrue((SPRITES / sprite_file(row[0])).exists(), row[0])

    def test_64_pedazos_y_el_mismo_hash_que_el_sitio(self):
        self.assertEqual(site_data.CHUNKS, 64)
        self.assertEqual(site_data.shard("melon"), 28)  # pzShardOf("melon", 64) del sitio (FNV-1a de 32 bits)

    def test_melon_en_espanol(self):
        f = self.out["fichas"]["melon"]
        self.assertEqual(f["slugEs"], "melon")
        self.assertEqual(f["name"], ["Melon", "Melón"])
        self.assertEqual(f["prices"]["base"], [250, 312, 375, 500])

    def test_slugs_unicos(self):
        slugs = [r[1] for r in self.out["list"]]
        self.assertEqual(len(slugs), len(set(slugs)))

    def test_34_aldeanos_con_retrato(self):
        self.assertEqual(len(self.out["villagers"]), 34)

    def test_sprite_file(self):
        self.assertEqual(sprite_file("(BC)12"), "bc-12.png")
        self.assertEqual(sprite_file("254"), "254.png")

    def test_objetos_de_texto_y_grandes(self):
        slugs = {r[0]: r[1] for r in self.out["list"]}
        self.assertIn("Book_Void", slugs)
        self.assertIn("(BC)12", slugs)
        row = next(r for r in self.out["list"] if r[0] == "(BC)12")
        self.assertEqual((row[4], row[5]), (16, 32))

    def test_ficha_refs_incluye_objetos_y_aldeanos(self):
        f = self.out["fichas"]["melon"]
        self.assertEqual(f["refs"]["254"][:4], ["melon", "melon", "Melon", "Melón"])
        for npc in f["tastes"].get("love", []) + f["tastes"].get("like", []):
            self.assertIn(npc, f["refs"])

    def test_pedazos_y_es_consistentes(self):
        files = self.out["files"]
        n = site_data.shard("melon")
        self.assertIn("melon", files[f"site/items/{n:02d}.json"])
        self.assertEqual(files[f"site/es/{site_data.shard('melon'):02d}.json"]["melon"], "melon")
        self.assertEqual(len(self.out["names_en"]), len(self.out["list"]))

    def test_home_y_meta(self):
        self.assertEqual(len(self.out["home"]["featured"]), 12)
        self.assertEqual(len(self.out["home"]["seasons"]), 4)
        self.assertEqual(self.out["meta"]["version"], "1.6.15")

    def test_plantillas_fuera_y_productos_con_nombre_armado(self):
        ids = {r[0] for r in self.out["list"]}
        for t in ("DriedFruit", "DriedMushrooms", "SmokedFish", "SpecificBait"):
            self.assertNotIn(t, ids)
        for f in self.out["fichas"].values():
            self.assertNotIn("{0}", f["name"][0] + f["name"][1] + f["desc"][0] + f["desc"][1])
        nombres = {(e["machine"], e["out"]): e["outName"] for e in self.out["fichas"]["melon"]["machines"]["in"]}
        self.assertEqual(nombres[("(BC)12", "348")], ["Melon Wine", "Vino de Melón"])
        self.assertEqual(nombres[("(BC)Dehydrator", "DriedFruit")][0], "Dried Melon")
        self.assertNotIn("DriedFruit", self.out["fichas"]["melon"]["refs"])

    def test_destacados_fijos(self):
        self.assertEqual(self.out["home"]["featured"],
                         ["24", "254", "276", "128", "163", "72", "74", "340", "424", "432", "395", "(BC)12"])

    def test_monstruos_con_el_mismo_nombre_en_espanol(self):
        vistos = {}
        for f in self.out["fichas"].values():
            for s in f["sources"]:
                if s["k"] == "monster":
                    vistos.setdefault(s["who"][0], set()).add(s["who"][1])
        self.assertEqual(vistos["Wilderness Golem"], {"Gólem salvaje"})
        self.assertTrue(all(len(v) == 1 for v in vistos.values()))

    def test_el_botin_de_un_monstruo_enlaza_a_su_ficha(self):
        # La Baba verde suelta Baba (766): la fuente lleva el slug de su ficha en Minas y combate.
        baba = [s for s in self.out["fichas"]["slime"]["sources"] if s["k"] == "monster" and s["who"][0] == "Green Slime"]
        self.assertEqual((baba[0]["slug"], baba[0]["slugEs"]), ("green-slime", "baba-verde"))
        # Un monstruo que el juego no pone en ningún lado (Shadow Guy) no tiene ficha: va sin slug.
        sin = [s for f in self.out["fichas"].values() for s in f["sources"] if s["k"] == "monster" and "slug" not in s]
        self.assertTrue(all(s["who"][0] not in ("Green Slime", "Bat") for s in sin))

    def test_botin_probabilidad_de_al_menos_uno(self):
        # `Monster.parseMonsterInfo`: cada par id/probabilidad es una tirada aparte. La Baba verde tira la Baba (766) dos
        # veces, 75 % y 5 %: cae al menos una con 1 − 0,25 × 0,95 = 76,25 %, y pueden caer hasta 2.
        baba = [s for s in self.out["fichas"]["slime"]["sources"] if s["k"] == "monster" and s["who"][0] == "Green Slime"][0]
        self.assertAlmostEqual(baba["rate"], 0.7625)
        self.assertEqual(baba["n"], 2)
        # El Cangrejo de iridio tira el mineral de iridio tres veces al 50 %: 87,5 %, hasta 3.
        iridio = [s for s in self.out["fichas"]["iridium-ore"]["sources"] if s["k"] == "monster" and s["who"][0] == "Iridium Crab"][0]
        self.assertAlmostEqual(iridio["rate"], 0.875)
        self.assertEqual(iridio["n"], 3)
        # Con una sola tirada no va `n`.
        savia = [s for s in self.out["fichas"]["sap"]["sources"] if s["k"] == "monster" and s["who"][0] == "Green Slime"][0]
        self.assertNotIn("n", savia)

    def test_salas_en_el_orden_del_juego(self):
        self.assertEqual([s["room"] for s in self.out["bundles"]],
                         ["Pantry", "Crafts Room", "Fish Tank", "Boiler Room", "Bulletin Board", "Vault", "Abandoned Joja Mart"])

    def test_estaciones_de_los_paquetes(self):
        # Las estaciones de cada objeto de la sala: sólo las de lo que se consigue por temporada.
        pantry = self.out["bundles"][0]
        self.assertEqual(pantry["seasons"]["24"], [0])  # chirivía: primavera
        self.assertEqual(pantry["seasons"]["256"], [1])  # tomate: verano
        self.assertNotIn("186", pantry["seasons"])  # leche XXL: no se sabe, queda visible
        for sala in self.out["bundles"]:
            for estaciones in sala["seasons"].values():
                self.assertTrue(0 < len(estaciones) < 4)

    def test_lo_de_una_tienda_de_festival_sigue_siendo_de_temporada(self):
        # Narciso y diente de león: recolección de primavera que también vende Pierre en la Danza de las Flores
        # (24 de primavera); la tienda del festival no los vuelve "de todo el año".
        artesania = self.out["bundles"][1]
        self.assertEqual(artesania["seasons"]["18"], [0])
        self.assertEqual(artesania["seasons"]["22"], [0])
        self.assertEqual(site_data.estaciones_de([{"k": "shop", "shop": "Festival_FlowerDance_Pierre"}]), [0])
        self.assertEqual(site_data.estaciones_de([{"k": "shop", "shop": "Festival_NightMarket_MagicBoat_Day1"}]), [3])
        self.assertEqual(site_data.estaciones_de([{"k": "shop", "shop": "DesertFestival_Pierre"}]), [0])
        self.assertIsNone(site_data.estaciones_de([{"k": "shop", "shop": "SeedShop"}]))

    # --- cruces con Granja, Museo, Isla y Misiones (etapa 4) -----------------------------------------------------
    def ficha(self, item_id: str) -> dict:
        return next(f for f in self.out["fichas"].values() if f["id"] == item_id)

    def test_lo_produce_un_animal(self):
        huevo = self.ficha("176")
        animales = [s for s in huevo["sources"] if s["k"] == "animal"]
        self.assertIn({"k": "animal", "who": ["White Chicken", "Gallina blanca"], "key": "white-chicken"}, animales)
        # La gallina azul también pone el huevo blanco: una fila por animal, sin repetir.
        self.assertEqual(len([s for s in animales if s["key"] == "blue-chicken"]), 1)
        # El huevo XXL es el producto de lujo (con más amistad).
        grande = [s for s in self.ficha("174")["sources"] if s["k"] == "animal" and s["key"] == "white-chicken"]
        self.assertEqual(grande, [{"k": "animal", "who": ["White Chicken", "Gallina blanca"], "key": "white-chicken", "deluxe": True}])
        self.assertTrue(self.ficha("176")["refs"])

    def test_para_construir(self):
        madera = self.ficha("388")
        self.assertIn(["coop", ["Coop", "Corral"], 300], madera["uses"]["builds"])
        self.assertIn(["shipping-bin", ["Shipping Bin", "Cubo de entrega"], 150], madera["uses"]["builds"])
        self.assertEqual(self.ficha("176")["uses"]["builds"], [])

    def test_se_dona_al_museo(self):
        self.assertTrue(self.ficha("96")["uses"]["donate"])  # Rollo enano I
        self.assertTrue(self.ficha("60")["uses"]["donate"])  # Esmeralda
        self.assertFalse(self.ficha("388")["uses"]["donate"])

    def test_premio_del_museo(self):
        guia = [s for s in self.ficha("326")["sources"] if s["k"] == "museum"]
        self.assertEqual(len(guia), 1)
        self.assertEqual(guia[0]["reward"], "dwarf")
        self.assertEqual(guia[0]["text"][1][:9], "4 objetos")
        # Las semillas de coliflor salen de a 9; la receta de las semillas milenarias no es el objeto.
        coliflor = [s for s in self.ficha("474")["sources"] if s["k"] == "museum"]
        self.assertEqual((coliflor[0]["reward"], coliflor[0]["n"]), ("museum5", 9))
        milenarias = [s["reward"] for s in self.ficha("499")["sources"] if s["k"] == "museum"]
        self.assertEqual(milenarias, ["ancient-seed"])

    def test_donarlo_da_un_premio_aunque_no_tenga_ficha(self):
        # La Estatua de gallina (113) da el mueble (F)1305, que no tiene ficha: va con su nombre y sin ref.
        estatua = self.ficha("113")
        self.assertIn(["chicken", "(F)1305", 1, ["Chicken Statue", "Estatua de gallina"]], estatua["uses"]["prizes"])
        self.assertNotIn("(F)1305", estatua["refs"])
        # Los cuatro rollos dan la guía, que sí tiene ficha: va a refs.
        rollo = self.ficha("96")
        self.assertIn(["dwarf", "326", 1, ["Dwarvish Translation Guide", "Guía de traducción enana"]], rollo["uses"]["prizes"])
        self.assertIn("326", rollo["refs"])

    def test_lo_piden(self):
        carne = self.ficha("684")
        self.assertEqual(carne["uses"]["orders"][0][0], "willy")
        self.assertEqual(carne["uses"]["orders"][0][2], "quests")
        self.assertIn(["willy", ["Juicy Bugs Wanted!", "¡Se buscan insectos jugosos!"], "quests"], carne["uses"]["orders"])
        # Una misión de la historia que pide el objeto (la 6: chirivía) también cuenta.
        self.assertIn("6", [o[0] for o in self.ficha("24")["uses"]["orders"]])

    def test_premio_de_un_pedido(self):
        calico = [s for s in self.ficha("CalicoEgg")["sources"] if s["k"] == "order"]
        self.assertIn("desertfestivalmarlon1", [s["key"] for s in calico])
        self.assertTrue(all(s["tab"] == "quests" for s in calico))
        # Los regalos por carta también (Emily manda la máquina de coser); las recetas no son el objeto.
        maquina = [s["key"] for s in self.ficha("(BC)247")["sources"] if s["k"] == "order"]
        self.assertEqual(maquina, ["emily"])
        self.assertEqual([s for s in self.ficha("877")["sources"] if s["k"] == "order"], [])
        # Las gemas de Qi salen de los pedidos de Qi, en la pestaña de la isla.
        gemas = [s for s in self.ficha("858")["sources"] if s["k"] == "order"]
        self.assertTrue(gemas)
        self.assertTrue(all(s["tab"] == "island" and s["n"] > 0 for s in gemas))

    def test_walnut_room_con_su_moneda(self):
        flauta = [s for s in self.ficha("911")["sources"] if s["k"] == "shop" and s.get("cur")]
        self.assertEqual(flauta, [{"k": "shop", "shop": ["Qi's Walnut Room", flauta[0]["shop"][1]], "price": 50, "cur": "858"}])
        self.assertIn("858", self.ficha("911")["refs"])
        gema = [s for s in self.ficha("858")["sources"] if s["k"] == "shop"]
        self.assertEqual([(s["price"], s["cur"]) for s in gema], [(1, "73")])
        self.assertIn("73", self.ficha("858")["refs"])
        # El Fertilizante de lujo sólo se vende como receta: no es una fuente del objeto.
        self.assertEqual([s for s in self.ficha("919")["sources"] if s.get("cur")], [])
        # El cofre junimo se vende a 30 la primera vez y a 15 después: dos filas.
        self.assertEqual(sorted(s["price"] for s in self.ficha("(BC)256")["sources"] if s.get("cur")), [15, 30])
        fila = next(r for r in self.out["list"] if r[0] == "911")
        self.assertTrue(fila[6] & site_data.SHOP)



class TestFuente(unittest.TestCase):
    def test_la_fuente_sale_igual_en_dos_corridas(self):
        # Sin la hora del reloj adentro: dos corridas seguidas dan el mismo archivo, byte a byte.
        import tempfile
        import time

        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "a.woff2", Path(tmp) / "b.woff2"
            fuente_juego(a)
            time.sleep(1.1)  # la fecha de `head` va en segundos
            fuente_juego(b)
            self.assertEqual(a.read_bytes(), b.read_bytes())


if __name__ == "__main__":
    unittest.main()
