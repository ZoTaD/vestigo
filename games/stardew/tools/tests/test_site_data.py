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
