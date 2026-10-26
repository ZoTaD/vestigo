"""Pruebas de `relations`. Correr: python -m unittest discover -s games/stardew/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import relations  # noqa: E402


class TestRelations(unittest.TestCase):
    def test_a_penny_le_encanta_el_melon(self):
        self.assertIn("Penny", relations.tastes_by_item()["254"]["love"])

    def test_ids_de_texto_en_los_gustos(self):
        # SkillBook_4 es un id de texto; BasiliskPaw es un Trinket, no un objeto.
        self.assertEqual(relations.gift_taste("Abigail", "SkillBook_4"), "like")
        self.assertIn("Abigail", relations.tastes_by_item()["Book_Void"]["love"])

    def test_objetos_sin_dibujo_ni_uso_fuera(self):
        # Slime Crate, Camping Stove y Hedge: casilla vacía en springobjects y nada del juego los crea.
        objs = relations.objects()
        for item_id in ("925", "927", "929"):
            self.assertNotIn(item_id, objs)
        self.assertIn("924", objs)  # el cajón de suministros de al lado sí está

    def test_no_sociables_fuera(self):
        keys = {v["key"] for v in relations.villagers()}
        self.assertEqual(len(keys), 34)
        self.assertNotIn("Gunther", keys)
        self.assertNotIn("Marlon", keys)

    def test_aldeano_tiene_ficha_completa(self):
        ab = next(v for v in relations.villagers() if v["key"] == "Abigail")
        self.assertEqual(ab["name"][0], "Abigail")
        self.assertEqual(ab["birthday"], [2, 13])
        self.assertTrue(ab["romance"])

    def test_precedencia_de_gustos(self):
        # Personal por id gana a la categoría personal: Penny ama el melón (-79 es de otros).
        self.assertEqual(relations.gift_taste("Penny", "254"), "love")
        # Sin nada propio ni universal, es neutral.
        self.assertIn(relations.gift_taste("Abigail", "254"), {"dislike"})

    def test_paquetes_del_melon(self):
        rooms = {(b[0], b[1]) for b in relations.bundles_by_item()["254"]}
        self.assertIn(("Pantry", 1), rooms)
        self.assertIn(("Pantry", 3), rooms)

    def test_paquete_con_nombre_y_recompensa(self):
        b = next(b for b in relations.bundles() if b["room"] == "Pantry" and b["index"] == 3)
        self.assertEqual(b["name"][0], "Quality Crops")
        self.assertEqual(b["need"], 3)
        self.assertEqual(b["reward"], ["(BC)15", 1])
        self.assertEqual(b["room_name"][0], "Pantry")
        oro = next(b for b in relations.bundles() if b["room"] == "Vault" and b["index"] == 23)
        self.assertEqual(oro["items"], [["-1", 2500, 2500]])

    def test_recetas_del_melon(self):
        outs = {r["name"][0] for r in relations.recipes() if any(i[0] == "254" for i in r["ings"])}
        self.assertTrue({"Pink Cake", "Fruit Salad"} <= outs)

    def test_maquinas_del_melon(self):
        by = {m["machine"]: m["price"] for m in relations.machines_by_input()["254"]}
        self.assertEqual(by["(BC)12"], 750)
        self.assertEqual(by["(BC)15"], 550)

    def test_semilla_del_melon(self):
        crop = next(s for s in relations.sources_by_item()["254"] if s["k"] == "crop")
        self.assertEqual((crop["seed"], crop["days"], crop["seasons"]), ("479", 12, [1]))

    def _tiendas(self, item: str) -> dict[str, int]:
        return {s["shop"]: s["price"] for s in relations.sources_by_item()[item] if s["k"] == "shop"}

    def test_recargo_de_pierre_en_precio_fijo(self):
        # El retoño de cerezo trae Price 1700 y Pierre (`DefaultMarkup` ×2) lo cobra 3.400; el fertilizante, 50 → 100.
        self.assertEqual(self._tiendas("628")["SeedShop"], 3400)
        self.assertEqual(self._tiendas("368")["SeedShop"], 100)

    def test_semillas_sin_recargo_en_pierre_y_con_el_de_joja(self):
        # Las semillas de Pierre ignoran el recargo (`IgnoreShopPriceModifiers`); Joja sin membresía cobra ×1,25.
        melon = self._tiendas("479")
        self.assertEqual(melon["SeedShop"], 80)
        self.assertEqual(melon["Joja"], 100)

    def test_otra_tienda_no_cambia(self):
        self.assertEqual(self._tiendas("685")["FishShop"], 5)

    # --- auditoría contra la wiki y el código del juego (26/10) ---

    def test_regalos_universales_le_ganan_a_la_categoria_personal(self):
        # A Pierre, Leah y Caroline no les gustan las gemas o la cocina, pero el Fragmento prismático y el Caramelo
        # de roca mágica son universales por id: les encantan. Las excepciones son personales por id.
        self.assertEqual(relations.gift_taste("Pierre", "74"), "love")
        self.assertEqual(relations.gift_taste("Leah", "74"), "love")
        self.assertEqual(relations.gift_taste("Caroline", "279"), "love")
        self.assertEqual(relations.gift_taste("Haley", "74"), "hate")
        self.assertEqual(relations.gift_taste("Penny", "446"), "hate")

    def test_artefactos_y_anillos(self):
        self.assertEqual(relations.gift_taste("Abigail", "103"), "dislike")
        self.assertEqual(relations.gift_taste("Penny", "103"), "like")
        self.assertEqual(relations.gift_taste("Abigail", "527"), "neutral")

    def _maquina(self, entrada: str, maquina: str) -> dict | None:
        return next((m for m in relations.machines_by_input().get(entrada, []) if m["machine"] == maquina), None)

    def test_cristalario_tarda_segun_la_gema(self):
        self.assertEqual(self._maquina("72", "(BC)21")["minutes"], 7200)  # Diamante
        self.assertEqual(self._maquina("80", "(BC)21")["minutes"], 420)  # Cuarzo
        self.assertEqual(self._maquina("60", "(BC)21")["minutes"], 3000)  # Esmeralda

    def test_barril_sin_setas_ni_lo_que_no_se_come(self):
        self.assertIsNone(self._maquina("404", "(BC)12"))  # Champiñón
        self.assertIsNone(self._maquina("18", "(BC)12"))  # Narciso
        self.assertIsNone(self._maquina("18", "(BC)15"))
        self.assertIsNone(self._maquina("92", "(BC)15"))  # Savia
        self.assertIsNotNone(self._maquina("24", "(BC)12"))  # Chirivía: zumo

    def test_mayonesa_de_huevos_grandes(self):
        avestruz = self._maquina("289", "(BC)24")
        self.assertEqual((avestruz["stack"], avestruz["quality"]), (10, 0))
        dorado = self._maquina("928", "(BC)24")
        self.assertEqual((dorado["stack"], dorado["quality"]), (3, 2))

    def test_estacion_de_los_peces_sale_del_lugar(self):
        pesca = {f["where"][0]: f for f in relations.sources_by_item()["131"] if f["k"] == "fish"}
        self.assertEqual(pesca["Beach"]["seasons"], [0, 2, 3])  # Sardina: no en verano
        trucha = next(f for f in relations.sources_by_item()["699"] if f["k"] == "fish")
        self.assertEqual(trucha["seasons"], [2, 3])

    def test_sin_lugares_de_festival(self):
        for fuentes in relations.sources_by_item().values():
            for f in fuentes:
                if f["k"] == "fish":
                    self.assertFalse({"Temp", "fishingGame"} & set(f["where"]))

    def test_anillos_y_calidad(self):
        self.assertEqual(relations.precio_de_venta("527"), 1000)  # Banda de iridio
        self.assertFalse(relations.con_calidad("527"))
        self.assertFalse(relations.con_calidad("334"))  # Lingote de cobre
        self.assertFalse(relations.con_calidad("74"))
        self.assertTrue(relations.con_calidad("24"))
        self.assertTrue(relations.con_calidad("424"))  # Queso: la barrica
        self.assertTrue(relations.con_calidad("SmokedFish"))
        self.assertFalse(relations.con_calidad("340"))  # Miel

    def test_carbon_y_mena_de_oro_en_el_botin(self):
        carbon = {f["who"][0]: f for f in relations.sources_by_item()["382"] if f["k"] == "monster"}
        self.assertEqual(carbon["Sludge"]["n"], 3)
        oro = {f["who"][0] for f in relations.sources_by_item()["384"] if f["k"] == "monster"}
        self.assertIn("Ghost", oro)

    def test_tiendas_desde_cuando_y_precio_al_azar(self):
        tiendas = {f["shop"]: f for f in relations.sources_by_item()["485"] if f["k"] == "shop"}
        self.assertEqual(tiendas["SeedShop"].get("year"), 2)  # Col lombarda: Pierre desde el año 2
        self.assertEqual((tiendas["Traveler"]["price"], tiendas["Traveler"]["max"]), (300, 1000))
        speed = next(f for f in relations.sources_by_item()["465"] if f["k"] == "shop" and f["shop"] == "SeedShop")
        self.assertEqual(speed.get("day"), 15)


if __name__ == "__main__":
    unittest.main()
