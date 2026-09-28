"""
Lo publicado tiene que estar completo (pedido de ZoTaD, 2026-09-28: "todo
tiene que estar completo y que se pueda leer bien").

Lee `data/site/`, o sea lo que sale de `pipeline.site`: si un parche trae un
objeto, una pieza o una criatura nueva que el juego no explica, este test lo
nombra y hay que completarlo en `fixes.py`, `purposes.py` o `texts.py` con su
fuente (o esconderlo si no se consigue en una partida normal).
"""
import json
import os
import unittest

SITE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "site")
ITEM_TABS = ("materials", "foods", "tools", "weapons", "armor", "meads")


def load(tab):
    with open(os.path.join(SITE, f"{tab}.json"), encoding="utf8") as f:
        return json.load(f)


def names(rows):
    return sorted(r["name"]["en"] for r in rows)


class TestCompleto(unittest.TestCase):
    def test_todo_objeto_dice_de_donde_sale(self):
        for tab in ITEM_TABS:
            with self.subTest(tab=tab):
                self.assertEqual(names(r for r in load(tab) if not r["sources"] and not r["recipe"]), [])

    def test_todo_objeto_tiene_bioma_de_progresion(self):
        for tab in ITEM_TABS:
            with self.subTest(tab=tab):
                self.assertEqual(names(r for r in load(tab) if not r["tier"]), [])

    def test_todo_objeto_y_pieza_tiene_descripcion(self):
        for tab in ITEM_TABS + ("building",):
            with self.subTest(tab=tab):
                self.assertEqual(names(r for r in load(tab) if not (r.get("desc") or {}).get("es")), [])

    def test_todo_material_dice_para_que_sirve(self):
        sin_uso = [r for r in load("materials") if not r["usedIn"] and not r.get("summons") and not r.get("purposes")]
        self.assertEqual(names(sin_uso), [])

    def test_toda_criatura_dice_donde_aparece_y_que_suelta(self):
        rows = load("creatures")
        self.assertEqual(names(r for r in rows if not r["biomes"] and not r.get("where")), [])
        self.assertEqual(names(r for r in rows if not r["drops"] and not r.get("dropsNothing")), [])

    def test_armas_con_gema_y_abalorios_muestran_su_efecto(self):
        # 2026-09-28, ZoTaD: "todo tiene que tener los efectos puestos". La
        # piedra de sangre pega más con menos vida, la iolita tira rayos y el
        # jade deja un efecto al golpear; los abalorios actúan con la adrenalina.
        # Los bastones no llevan gema: la sangre de su nombre es la magia.
        gem = {"Blood": "missingHp", "Lightning": "onHit", "Nature": "attack"}
        faltan = []
        for r in load("weapons"):
            if r["id"].startswith("Staff"):
                continue
            for part, key in gem.items():
                if part in r["id"] and key not in (r.get("effects") or {}):
                    faltan.append(f"{r['name']['en']}: {key}")
        faltan += [r["name"]["en"] for r in load("armor") if r["id"].startswith("Trinket") and "adrenaline" not in (r.get("effects") or {})]
        self.assertEqual(sorted(faltan), [])

    def test_ningun_lugar_vacio(self):
        vacios = [r for r in load("places") if not (r["inhabitants"] or r["resources"] or r["loot"] or r.get("summary"))]
        self.assertEqual(names(vacios), [])


if __name__ == "__main__":
    unittest.main()
