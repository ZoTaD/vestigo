"""
Tests de `patches.py` (2026-10-09): el parseo del BBCode de los anuncios de Steam, el filtro, los nombres de objetos y el
español a mano. No piden nada a la red: datos sintéticos y, si existen, los JSON ya escritos.

    python -m unittest games/rust/tools/tests/test_patches.py -v
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import patches  # noqa: E402

BODY = (
    '[p][/p][previewyoutube="abc;full"][/previewyoutube][h1]LIVESTOCK[/h1][p]This patch we are introducing cows.[/p]'
    '[p][img src="https://files.facepunch.com/x/cow%20(1).jpg" style="a: b;"][/img][/p]'
    '[h3][b]What do they give?[/b][/h3][p]Cows produce [b]milk[/b] and a [url="https://x.y"]Heavy Fuse[/url].[/p]'
    '[list][*][p]Airfield[/p][/*][*][p]Junkyard[/p][/*][/list]'
    '[code]SetFlag(Flags.Reserved1, true);[/code]'
    '[h1]EMPTY[/h1][h1]NEXT[/h1][p]Line one\n\nLine two[/p]'
    '[p]Full Devblog & Changelist: [url="https://rust.facepunch.com/news/livestock"]https://rust.facepunch.com/news/livestock[/url][/p]'
)


class TestParse(unittest.TestCase):
    def test_secciones_renglones_y_codigo(self):
        p = patches.parse(BODY)
        self.assertEqual(p["intro"], [])
        titles = [(s["title"], s["level"]) for s in p["sections"]]
        self.assertEqual(titles, [("LIVESTOCK", 1), ("What do they give?", 3), ("NEXT", 1)])
        give = p["sections"][1]["lines"]
        self.assertEqual(give[0], {"t": "p", "text": "Cows produce milk and a Heavy Fuse."})
        self.assertEqual([b["text"] for b in give if b["t"] == "li"], ["Airfield", "Junkyard"])
        self.assertEqual(give[-1], {"t": "code", "text": "SetFlag(Flags.Reserved1, true);"})
        # Un párrafo con renglones vacíos adentro se parte; la línea del devblog no entra.
        self.assertEqual([b["text"] for b in p["sections"][2]["lines"]], ["Line one", "Line two"])

    def test_portada_y_devblog(self):
        self.assertEqual(patches.first_image(BODY), "https://files.facepunch.com/x/cow%20(1).jpg")
        self.assertEqual(patches.blog_url(BODY), "https://rust.facepunch.com/news/livestock")
        self.assertIsNone(patches.blog_url("[p]nada[/p]"))

    def test_filtro_y_nombre(self):
        self.assertTrue(patches.keep("LIVESTOCK", "2026-10-01"))
        self.assertFalse(patches.keep("COMMUNITY UPDATE 268", "2026-01-22"))
        self.assertFalse(patches.keep("Vote for Rust! The Steam Awards are now live!", "2025-11-24"))
        self.assertFalse(patches.keep("WARHAMMER 40,000 X RUST DLC PACK", "2025-10-23"))
        self.assertFalse(patches.keep("COUPLING THE RAILS", "2023-11-02"))
        self.assertEqual(patches.nice_name("UPGRADE HARD, RAID HARDER"), "Upgrade Hard, Raid Harder")
        self.assertEqual(patches.nice_name("THE WORLD UPDATE 2.0"), "The World Update 2.0")
        self.assertEqual(patches.nice_name("The Crafting Update"), "The Crafting Update")

    def test_nombres_de_objetos(self):
        n = patches.Names([("Heavy Fuse", "heavy-fuse"), ("Milk", "milk"), ("Ladder", "ladder"), ("Wooden Ladder", "wooden-ladder")])
        self.assertEqual(n.find("Insert a heavy fuse, then a Wooden Ladder."), [{"n": "Wooden Ladder", "s": "wooden-ladder"}, {"n": "heavy fuse", "s": "heavy-fuse"}])
        # Una sola palabra: con mayúscula y de 5 letras o más.
        self.assertEqual(n.find("milk and ladder"), [])
        self.assertEqual(n.find("a Ladder"), [{"n": "Ladder", "s": "ladder"}])

    def test_monumentos(self):
        names = patches.names_of([{"slug": "outpost-sign", "name": {"en": "Outpost", "es": None}}], [{"id": "outpost", "name": {"en": "Outpost", "es": "Puesto Avanzado"}}])
        self.assertEqual(names["en"].find("Go to the Outpost."), [{"n": "Outpost", "s": "m:outpost"}])
        self.assertEqual(names["es"].find("Andá al Puesto Avanzado."), [{"n": "Puesto Avanzado", "s": "m:outpost"}])

    def test_espanol_entero_o_nada(self):
        ed = {"intro": [], "sections": [{"title": "A", "level": 1, "lines": [{"t": "p", "text": "b"}, {"t": "code", "text": "x()"}]}]}
        names = patches.Names([])
        es, missing = patches.translate(ed, {"A": "Á"}, names)
        self.assertIsNone(es)
        self.assertEqual(missing, ["b"])
        es, missing = patches.translate(ed, {"A": "Á", "b": "be"}, names)
        self.assertEqual(es["sections"][0]["lines"], [{"t": "p", "text": "be"}, {"t": "code", "text": "x()"}])

    def test_slugs_repetidos_llevan_el_ano(self):
        posts = [
            {"title": "SEASON'S BEATINGS", "date": 1734300000, "gid": "1", "contents": "[h1]A[/h1][p]x[/p]"},
            {"title": "SEASONS BEATINGS", "date": 1766000000, "gid": "2", "contents": "[h1]A[/h1][p]x[/p]"},
        ]
        eds = patches.build(posts, [])
        self.assertEqual([e["slug"] for e in eds], ["seasons-beatings", "seasons-beatings-2024"])


@unittest.skipUnless((patches.OUT / "index.json").exists(), "falta patches/index.json")
class TestPatchesJson(unittest.TestCase):
    def test_indice_y_ediciones(self):
        with open(patches.OUT / "index.json", encoding="utf-8") as f:
            idx = json.load(f)["editions"]
        self.assertGreater(len(idx), 10)
        self.assertEqual([e["date"] for e in idx], sorted((e["date"] for e in idx), reverse=True))
        slugs = [e["slug"] for e in idx]
        self.assertEqual(len(set(slugs)), len(slugs))
        for e in idx:
            self.assertTrue((patches.OUT / f"{e['slug']}.json").exists(), e["slug"])
            if e.get("cover"):
                self.assertTrue((patches.COVERS / f"{e['cover']}.webp").exists(), e["slug"])
        # La más nueva va traducida a mano.
        self.assertTrue(idx[0]["es"], idx[0]["slug"])


if __name__ == "__main__":
    unittest.main()
