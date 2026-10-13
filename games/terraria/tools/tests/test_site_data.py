"""Pruebas de `site_data.build` con una caché de juguete. Correr: python -m unittest discover -s games/terraria/tools/tests"""
import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from site_data import CHUNKS, build, chunk_of, clean_tip, kind_of, slugify  # noqa: E402


def item(i, name, internal=None, **extra):
    return {"id": i, "internal": internal or name.replace(" ", ""), "name": name, "tip": "", "frames": 1, "deprecated": False,
            "headSlot": -1, "bodySlot": -1, "legSlot": -1, "createTile": -1, "createWall": -1, **extra}


def cache():
    items = [
        item(1, "Wood", createTile=30),
        item(2, "Ebonwood", createTile=30, placeStyle=1),
        item(3, "Work Bench", createTile=18),
        item(4, "Wood Platform", createTile=19),
        item(5, "Music Box", internal="MusicBoxA", accessory=True),
        item(6, "Music Box", internal="MusicBoxB", accessory=True),
        item(7, "Terra Blade", damage=85, melee=True, rare=8),
        item(8, "Old Thing", deprecated=True),
        item(9, ""),
        item(10, "Altar Sword", damage=10, melee=True),
    ]
    items[7]["deprecated"] = True
    names = {str(it["id"]): [it["name"], ""] for it in items}
    es = {**names, "1": ["Madera", ""], "7": ["Espada Terra", ""], "5": ["Caja de música", ""], "6": ["Caja de música", ""]}
    group = {"0": {"name": "Any Wood", "items": [2, 1], "order": [1, 2]}}
    return {
        "items": items,
        "recipes": [
            {"i": 0, "createItem": {"type": 3, "stack": 1}, "requiredItem": [{"type": 1, "stack": 10}], "requiredTile": -1, "acceptedGroups": [0, -1]},
            {"i": 1, "createItem": {"type": 4, "stack": 2}, "requiredItem": [{"type": 1, "stack": 1}], "requiredTile": -1, "acceptedGroups": [-1]},
            {"i": 2, "createItem": {"type": 1, "stack": 1}, "requiredItem": [{"type": 4, "stack": 2}], "requiredTile": -1, "acceptedGroups": [-1]},
            {"i": 3, "createItem": {"type": 7, "stack": 1}, "requiredItem": [{"type": 1, "stack": 5}], "requiredTile": 18, "acceptedGroups": [-1], "needWater": True},
            {"i": 4, "createItem": {"type": 8, "stack": 1}, "requiredItem": [{"type": 1, "stack": 5}], "requiredTile": 18, "acceptedGroups": [-1]},
            {"i": 5, "createItem": {"type": 10, "stack": 1}, "requiredItem": [{"type": 1, "stack": 5}], "requiredTile": 26, "acceptedGroups": [-1]},
        ],
        "texts_en": {"items": names, "groups": group, "tiles": {}},
        "texts_es": {"items": es, "groups": {"0": {**group["0"], "name": "Cualquier madera"}}, "tiles": {}},
        "drops": [
            {"npc": 5, "item": 7, "min": 1, "max": 1, "rate": 0.25, "if": [["NotExpert", ""]]},
            {"npc": -5, "item": 7, "min": 1, "max": 1, "rate": 0.1, "if": [["NotExpert", ""]]},
            {"npc": 5, "item": 7, "min": 1, "max": 1, "rate": 0.5, "if": [["IsExpert", "x"]]},
        ],
        "npcs": {"en-US": {"5": "Mothron", "-5": "Mothron"}, "es-ES": {"5": "Polillón", "-5": "Polillón"}},
        "sprites": {"1": [24, 22], "7": [46, 54]},
        "loc_en": {"ItemTooltip": {}},
        "loc_es": {"ItemTooltip": {}},
    }


class SiteData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = build(cache(), today="2026-10-12")

    def test_filtra_los_sin_nombre_y_los_obsoletos(self):
        out = self.out
        assert [r[0] for r in out["site/list.json"]] == [1, 2, 3, 4, 5, 6, 7, 10]
        # La receta de un objeto obsoleto no entra.
        assert all(r[0] != 8 for r in out["site/recipes.json"]["recipes"])


    def test_slugs_unicos_el_segundo_lleva_el_id(self):
        out = self.out
        slugs = [r[1] for r in out["site/list.json"]]
        assert len(set(slugs)) == len(slugs)
        assert "music-box" in slugs and "music-box-6" in slugs
        es = [n[1] for n in out["site/names-es.json"]]
        assert len(set(es)) == len(es)
        assert "caja-de-musica" in es and "caja-de-musica-6" in es
        assert out[f"site/es/{chunk_of('espada-terra')}.json"]["espada-terra"] == "terra-blade"
        # Se llama igual en los dos idiomas: no hace falta anotarlo.
        assert all("work-bench" not in out[f"site/es/{n:02d}.json"] for n in range(CHUNKS))


    def test_el_slug_espanol_de_uno_no_es_el_ingles_de_otro(self):
        c = cache()
        c["texts_es"]["items"]["10"] = ["Wood", ""]  # la espada del altar se llama "Wood" en español
        out = build(c, today="2026-10-12")
        es = {r[0]: n[1] for r, n in zip(out["site/list.json"], out["site/names-es.json"])}
        assert es[10] == "wood-10" and es[1] == "madera"

    def test_la_fila_dice_que_tiene_la_ficha(self):
        by_id = {r[0]: r[7] for r in self.out["site/list.json"]}
        assert by_id[7] == 1 | 4  # se fabrica y la sueltan
        assert by_id[1] == 1 | 2  # se fabrica y se usa
        assert by_id[5] == 0

    def test_los_slugs_publicados_no_cambian(self):
        prev = {"6": ["music-box", "caja-de-musica"], "7": ["old-terra-blade", "espada-vieja"]}
        again = build(cache(), prev, today="2026-10-12")
        by_id = {r[0]: r[1] for r in again["site/list.json"]}
        assert by_id[6] == "music-box" and by_id[5] == "music-box-5"
        assert by_id[7] == "old-terra-blade"


    def test_cada_objeto_esta_en_su_pedazo(self):
        out = self.out
        for row in out["site/list.json"]:
            chunk = out[f"site/items/{chunk_of(row[1])}.json"]
            assert chunk[row[1]]["id"] == row[0]
        assert sum(len(out[f"site/items/{n:02d}.json"]) for n in range(CHUNKS)) == len(out["site/list.json"])


    def test_recetas_grupos_y_condiciones(self):
        out = self.out
        data = out["site/recipes.json"]
        bench = next(r for r in data["recipes"] if r[0] == 3)
        assert bench[4] == [[-1, 10]]  # el grupo 0 va como -1
        assert data["groups"]["0"] == {"en": "Any Wood", "es": "Cualquier madera", "items": [1, 2]}
        terra = next(r for r in data["recipes"] if r[0] == 7)
        assert terra[2] == 18 and terra[3] == 1  # banco de trabajo, con agua
        assert data["tiles"]["18"] == {"en": "Work Bench", "es": "Work Bench", "item": 3}
        assert data["tiles"]["26"]["en"] == "Demon Altar" and data["tiles"]["26"]["item"] == 0
        ids = {r[0] for r in out["site/list.json"]}
        for r in data["recipes"]:
            assert r[0] in ids and all(k < 0 or k in ids for k, _ in r[4])


    def test_usos_incluyen_los_que_entran_por_grupo(self):
        out = self.out
        ebon = out[f"site/items/{chunk_of('ebonwood')}.json"]["ebonwood"]
        assert [3, 10] in ebon["uses"]
        wood = out[f"site/items/{chunk_of('wood')}.json"]["wood"]
        assert {u[0] for u in wood["uses"]} == {3, 4, 7, 10}
        # Todo lo que la ficha nombra viene en sus referencias.
        assert {"3", "4", "7", "10"} <= set(wood["refs"])
        assert wood["refs"]["7"] == ["terra-blade", "espada-terra", "Terra Blade", "Espada Terra", 8, 46, 54]
        # La ficha trae sus estaciones y sus grupos: no baja `recipes.json` para dibujarse.
        terra = out[f"site/items/{chunk_of('terra-blade')}.json"]["terra-blade"]
        assert terra["stations"] == {"18": [3, "Work Bench", "Work Bench"]} and "3" in terra["refs"]
        altar = out[f"site/items/{chunk_of('altar-sword')}.json"]["altar-sword"]
        assert altar["stations"] == {"26": [0, "Demon Altar", "Altar demoníaco"]}
        bench = out[f"site/items/{chunk_of('work-bench')}.json"]["work-bench"]
        assert bench["groups"] == {"0": ["Any Wood", "Cualquier madera", 1]} and "1" in bench["refs"]


    def test_botin_una_fila_por_enemigo_y_modo(self):
        out = self.out
        terra = out[f"site/items/{chunk_of('terra-blade')}.json"]["terra-blade"]
        assert terra["drops"] == [[5, 1, 1, 0.5, "e"], [5, 1, 1, 0.25, "n"]]
        assert terra["npcs"]["5"] == ["Mothron", "Polillón"]


    def test_objeto_sin_sprite_va_con_tamano_cero(self):
        out = self.out
        row = next(r for r in out["site/list.json"] if r[0] == 3)
        assert row[4:6] == [0, 0]


    def test_estacion_desconocida_es_un_error(self):
        c = cache()
        c["recipes"].append({"i": 9, "createItem": {"type": 3, "stack": 1}, "requiredItem": [{"type": 1, "stack": 1}], "requiredTile": 999, "acceptedGroups": [-1]})
        with self.assertRaisesRegex(ValueError, "999"):
            build(c)


    def test_meta(self):
        out = self.out
        assert out["meta.json"] == {"version": "1.4.5.8", "generatedAt": "2026-10-12", "counts": {"items": 8, "recipes": 5, "craftable": 5, "drops": 2, "sources": 0}}


    def test_tipos(self):
        assert kind_of(item(1, "x", damage=10, melee=True)) == "melee"
        assert kind_of(item(1, "x", damage=5, melee=True, pick=40)) == "tool"
        assert kind_of(item(1, "x", headSlot=3, defense=2)) == "armor"
        assert kind_of(item(1, "x", headSlot=3, vanity=True)) == "vanity"
        assert kind_of(item(1, "x", accessory=True)) == "accessory"
        assert kind_of(item(1, "x", createTile=4)) == "block"
        assert kind_of(item(1, "x", consumable=True, healLife=50)) == "consumable"
        assert kind_of(item(1, "x", material=True)) == "material"
        assert kind_of(item(1, "x")) == "misc"


    def test_textos(self):
        assert slugify("Night's Edge") == "nights-edge"
        assert slugify("S.D.M.G.") == "sdmg"
        assert slugify("Poción de curación") == "pocion-de-curacion"
        assert clean_tip("[c/FF0000:Rojo] vivo\n\n[i:29] vida") == "Rojo vivo\nvida"


if __name__ == "__main__":
    unittest.main()
