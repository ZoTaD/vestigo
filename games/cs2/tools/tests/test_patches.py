"""Pruebas de `patches`. Correr: python -m unittest discover -s games/cs2/tools/tests -p "test_patches.py" """
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import patches  # noqa: E402

# El formato de hoy (22/9/2026): encabezado en un párrafo, el mapa como párrafo suelto y sus cambios en una lista.
NUEVO = (
    "[p]\\[ GAMEPLAY ][/p][list][*][p]Chickens now take damage from the Zeus x27.[/p][/*]"
    "[*][p]Added new crosshair styles[/p][list][*][p]Fixed the default crosshair.[/p][/*][/list][/*][/list]"
    "[p]\\[ MAPS ][/p][p]Ancient[/p][list][*][p]Fixed holes in world in Long A Main Hall.[/p][/*][/list]"
    "[p]Mirage[/p][list][*][p]Reinforced scaffolding by balcony in A site.[/p][/*][/list][p][/p]"
)
# El de 2023: encabezado en negrita y viñetas sin cerrar.
VIEJO = (
    "[b][ MAPS ][/b]\n[list]\n[*]Mirage has replaced Dust II on official servers.\n[/list]\n\n"
    "[b][ WORKSHOP TOOLS ][/b]\n[list]\n[*]Introducing [url=https://x.y]Workshop Tools[/url].\n"
    "[list][*]Note: maps can't be uploaded yet.[/list]\n[/list]"
)


class TestNotas(unittest.TestCase):
    def test_formato_nuevo(self):
        secs = patches.parse_notes(NUEVO)
        self.assertEqual([s["title"] for s in secs], ["GAMEPLAY", "MAPS"])
        g = secs[0]["lines"]
        self.assertEqual(g[0], {"text": "Chickens now take damage from the Zeus x27.", "dir": "mid", "refs": [{"kind": "weapon", "name": "Zeus x27"}]})
        self.assertEqual(g[1]["dir"], "new")
        self.assertEqual(g[2], {"text": "Fixed the default crosshair.", "dir": "fix", "sub": True})

    def test_mapa_como_subtitulo(self):
        m = patches.parse_notes(NUEVO)[1]["lines"]
        self.assertEqual(m[0], {"text": "Ancient", "head": True, "refs": [{"kind": "map", "name": "Ancient"}]})
        self.assertEqual(m[1]["dir"], "fix")
        self.assertEqual(m[1]["map"], "Ancient")
        self.assertEqual(m[3]["map"], "Mirage")
        self.assertEqual(len(m), 4)

    def test_formato_viejo(self):
        secs = patches.parse_notes(VIEJO)
        self.assertEqual([s["title"] for s in secs], ["MAPS", "WORKSHOP TOOLS"])
        self.assertEqual(secs[0]["lines"][0]["refs"], [{"kind": "map", "name": "Mirage"}, {"kind": "map", "name": "Dust II"}])
        w = secs[1]["lines"]
        self.assertEqual(w[0]["text"], "Introducing Workshop Tools.")
        self.assertEqual(w[0]["dir"], "new")
        self.assertTrue(w[1]["sub"])

    def test_encabezado_en_minuscula(self):
        secs = patches.parse_notes("[p][ Premier ][/p][list][*]Season three starts.[/*][/list][p]\\[ X-Ray Scanner ][/p][list][*]Removed it.[/*][/list]")
        self.assertEqual([s["title"] for s in secs], ["Premier", "X-Ray Scanner"])

    def test_vinetas_con_guion(self):
        secs = patches.parse_notes("[PARIS 2023 CS:GO MAJOR]\n- Fixed common asserts.\n– With a pass you get:\n[img]{STEAM_CLAN_IMAGE}/1/a.png[/img]")
        self.assertEqual(secs[0]["title"], "PARIS 2023 CS:GO MAJOR")
        self.assertEqual([ln["text"] for ln in secs[0]["lines"]], ["Fixed common asserts.", "With a pass you get:"])
        self.assertEqual(secs[0]["lines"][0]["dir"], "fix")

    def test_nombre_generico_no_enlaza(self):
        named = {"Limited Edition Item": ("coll", "limited-edition-item", None)}
        self.assertEqual(patches.find_refs("This is a Limited Edition Item.", named), [])

    def test_arreglo_en_el_medio(self):
        self.assertEqual(patches.direction("Shader fix for AO on railings"), "fix")
        self.assertEqual(patches.direction("Fixed a bug"), "fix")
        self.assertEqual(patches.direction("Added a ping icon"), "new")
        self.assertEqual(patches.direction("Reduced the time for AUG reload"), "mid")

    def test_caja_enlazada(self):
        refs = patches.find_refs("Added the Fever Case to the active capsule rotation", {"Fever Case": ("case", "fever-case", "fever-case")})
        self.assertEqual(refs, [{"kind": "case", "name": "Fever Case", "slug": "fever-case", "img": "fever-case"}])

    def test_cuenta(self):
        secs = patches.parse_notes(NUEVO)
        self.assertEqual(patches.counts(secs), {"new": 1, "mid": 2, "fix": 2})


class TestLanzamiento(unittest.TestCase):
    def test_bloques(self):
        raw = (
            '[video webm="a.webm" poster="{STEAM_CLAN_IMAGE}/1/p.png"][/video]\nPut your foot on the gas.\n\n'
            "[img]{STEAM_CLAN_IMAGE}/1/x.png[/img]\n[h3]Pick, Pick[/h3]\nTeams pick [b]two[/b] maps.\n"
            "[list][*]One[*]Two[/list]"
        )
        b = patches.parse_content(raw)
        self.assertEqual(b[0], {"img": "https://clan.fastly.steamstatic.com/images/1/p.png"})
        self.assertEqual(b[1], {"p": "Put your foot on the gas."})
        self.assertEqual(b[2], {"img": "https://clan.fastly.steamstatic.com/images/1/x.png"})
        self.assertEqual(b[3], {"h": "Pick, Pick"})
        self.assertEqual(b[4], {"p": "Teams pick two maps."})
        self.assertEqual(b[5:], [{"li": "One"}, {"li": "Two"}])


class TestEdiciones(unittest.TestCase):
    def test_slugs(self):
        items = [
            {"gid": "3", "title": "Counter-Strike 2 Update", "date": 1790000000, "contents": NUEVO, "url": "u3"},
            {"gid": "2", "title": "Counter-Strike 2 Update", "date": 1790000000 - 3600, "contents": NUEVO, "url": "u2"},
            {"gid": "1", "title": "Rush Hour", "date": 1789000000, "contents": "Hi.", "url": "u1"},
        ]
        eds = patches.editions(items, {})
        self.assertEqual([e["slug"] for e in eds], ["2026-09-21-2", "2026-09-21", "rush-hour"])
        self.assertEqual(eds[2]["kind"], "content")
        self.assertEqual(eds[0]["kind"], "patch")

    def test_fuera_lo_de_csgo(self):
        items = [{"gid": "1", "title": "Counter-Strike 2 Update", "date": 1600000000, "contents": NUEVO, "url": "u"}]
        self.assertEqual(patches.editions(items, {}), [])


if __name__ == "__main__":
    unittest.main()
