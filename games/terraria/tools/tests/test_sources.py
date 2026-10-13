"""Pruebas de `sources.build_sources` y `classes_data.build_classes` con cachés de juguete.
Correr: python -m unittest discover -s games/terraria/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from classes_data import CLASSES, LOADOUTS, STAGES, build_classes  # noqa: E402
from site_data import build  # noqa: E402
from sources import SHOPS, SIGNATURE, build_sources  # noqa: E402
from test_site_data import cache as site_cache  # noqa: E402


def item(i, internal, name=None, **extra):
    return {"id": i, "internal": internal, "name": name or internal, "value": 100, **extra}


ITEMS = [
    item(1, "MiningHelmet"), item(2, "Glowstick"), item(3, "Sunflower"), item(4, "DrumStick"), item(5, "LeafWings"),
    item(6, "TeleportationPylonSnow"), item(7, "DefenderMedal"), item(8, "Ale"), item(9, "SquireGreatHelm"),
    item(10, "BossBag"), item(11, "DemoniteOre"), item(12, "CrimtaneOre"), item(13, "SiltBlock"), item(14, "Extractinator"),
    item(15, "ChlorophyteExtractinator"), item(16, "Amber"), item(17, "Bass"), item(18, "Obsidifish"), item(19, "Muramasa"),
    item(20, "TimeHairDye"), item(21, "Code1"), item(24, "HairDyeRemover"),
    item(25, "TeleportationPylonUnderground"), item(26, "TeleportationPylonPurity"), item(27, "TeleportationPylonVictory"),
    item(28, "FuzzyCarrot"), item(29, "FinWings"), item(30, "GoldenFishingRod"), item(31, "Apple"), item(32, "GoldenKey"), item(71, "CopperCoin"), item(22, "Lens"), item(23, "BlackLens"),
]


def cache(**extra):
    npc = {"17": "Merchant", "550": "Tavernkeep", "353": "Stylist", "368": "Traveling Merchant", "228": "Witch Doctor",
           "13": "Eater of Worlds", "266": "Brain of Cthulhu", "35": "Skeletron", "262": "Plantera", "4": "Eye of Cthulhu", "369": "Angler"}
    loc = {
        "Bestiary_Biomes": {"Jungle": "The Jungle", "TheCorruption": "The Corruption", "Crimson": "The Crimson", "Snow": "Snow", "Surface": "Surface", "TheDungeon": "The Dungeon"},
        "Bestiary_Events": {"BloodMoon": "Blood Moon"},
        "Bestiary_Invasions": {},
        "GameUI": {"FullMoon": "Full Moon", "ThirdQuarter": "Third Quarter", "NewMoon": "New Moon", "FirstQuarter": "First Quarter",
                   "WaningGibbous": "Waning Gibbous", "WaningCrescent": "Waning Crescent", "WaxingCrescent": "Waxing Crescent", "WaxingGibbous": "Waxing Gibbous"},
        "LegacyChestType": {"1": "Gold Chest", "2": "Locked Gold Chest"},
        "LegacyChestType2": {"4": "{$ItemName.GoldChest}"},
        "ItemName": {"GoldChest": "Gold Chest"},
    }
    names = {str(it["id"]): [it["name"], ""] for it in ITEMS}
    return {"items": ITEMS, "npcs": {"en-US": npc, "es-ES": npc}, "loc_en": loc, "loc_es": loc,
            "texts_en": {"items": names}, "texts_es": {"items": names}, **extra}


def shops():
    states = {
        "base": {"1": [1, 3], "18": [20], "21": [8]},
        "night": {"1": [1, 2, 3], "18": [], "21": [8]},
        "Main.bloodMoon": {"1": [1], "18": [20], "21": [8]},
        "NPC.downedBoss2": {"1": [1, 3, 4], "18": [20], "21": [8]},
        "NPC.downedBoss3": {"1": [1, 3, 4], "18": [20], "21": [8]},
        "Main.remixWorld": {"1": [3], "18": [20], "21": [8]},
        "Main.hardMode": {"1": [1, 3], "18": [20], "21": [8]},
        "npc:228": {"1": [1, 3], "18": [20], "21": [8]},
    }
    for k in range(1, 8):
        states[f"moon:{k}"] = {"1": [1, 3], "18": [20] if k % 2 == 0 else [], "21": [8]}
    states["pylon:"] = {"1": [1, 3, 25]}
    states["pylon:Player.ZoneSnow"] = {"1": [1, 3, 6]}
    for name in ("pylon:", "pylon:Player.ZoneSnow"):
        states[name].update({"18": [20], "21": [8]})
    # Lo que la Estilista vende siempre (su firma).
    for st in states.values():
        st["18"] = st["18"] + [24]
    return {
        "states": states,
        "pairs": [[21, 9, "NPC.downedMechBossAny", "Main.hardMode"], [1, 6, "npc:228", "npc:17"]],
        "minus": [[1, 4, "NPC.downedBoss2", "night"]],
        "reduced": [[16, 5, ["NPC.downedPlantBoss", "Main.hardMode", "night", "Player.ZoneJungle"], [0, 1, 2, 3, 4, 5, 6, 7]]],
        "bestiary": [],
        "prices": {"1": {"1": [40000, -1], "2": [10, -1]}, "21": {"8": [100, -1], "9": [15, -1]}},
        "travel": {"visits": 1000, "states": {"base": {"22": 250}, "NPC.downedBoss1": {"22": 240, "21": 100}, "all": {"22": 260, "21": 90}}, "reduced": {}},
    }


class Shops(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = build_sources(cache(shops={**shops()}))

    def only(self, item, kind="shop"):
        rows = [r for r in self.src.get(item, []) if r["k"] == kind]
        assert len(rows) == 1, rows
        return rows[0]

    def test_lo_que_se_vende_siempre_no_lleva_condicion(self):
        assert self.only(1) == {"k": "shop", "n": 17, "p": 40000}

    def test_una_condicion_que_lo_trae(self):
        assert self.only(2)["if"][0] == "At night"

    def test_una_condicion_que_lo_saca(self):
        assert self.only(3)["if"][0] == "Not during a Blood Moon"

    def test_las_semillas_especiales_no_cuentan(self):
        assert "if" not in self.only(1)

    def test_dos_formas_de_conseguirlo_y_lo_que_la_hora_le_saca(self):
        assert self.only(4)["if"][0] == "After Eater of Worlds or Brain of Cthulhu, during the day; or after Skeletron"

    def test_dos_condiciones_juntas_y_precio_en_medallas(self):
        row = self.only(9)
        assert row["if"][0] == "After any mechanical boss, in Hardmode"
        assert (row["n"], row["p"], row["c"]) == (550, 15, 7)
        assert "c" not in self.only(8)

    def test_tres_o_mas_condiciones(self):
        assert self.only(5) == {"k": "shop", "n": 228, "p": 100, "if": ["After Plantera, in Hardmode, at night, in the Jungle", "Después de Plantera, en Hardmode, de noche, en the Jungle"]}

    def test_fases_de_la_luna_y_de_dia(self):
        assert self.only(20)["if"][0] == "During the day, moon: Full Moon, Third Quarter, New Moon, First Quarter"

    def test_los_pilones_dicen_su_bioma(self):
        # El de nieve aparece con dos NPC en la nieve; el de la superficie va a mano; el universal queda sin fuente.
        assert self.src[6] == [{"k": "pylon", "if": ["Living in Snow, with another NPC nearby", "Que viva en Snow, con otro NPC cerca"]}]
        assert self.src[25][0]["if"][0] == "Living underground, with another NPC nearby"
        assert self.src[26][0]["if"][0] == "Living on Surface, away from other biomes, with another NPC nearby"
        assert 27 not in self.src

    def test_mercader_ambulante(self):
        assert self.only(22, "travel") == {"k": "travel", "n": 368, "p": 100, "r": 0.25}
        assert self.only(21, "travel") == {"k": "travel", "n": 368, "p": 100, "r": 0.1, "if": ["After Eye of Cthulhu", "Después de Eye of Cthulhu"]}

    def test_una_tienda_que_cambio_de_numero_hace_fallar(self):
        moved = shops()
        for st in moved["states"].values():
            st["1"] = [3]
        with self.assertRaises(ValueError):
            build_sources(cache(shops=moved))

    def test_cada_tienda_con_firma_tiene_npc(self):
        assert set(SIGNATURE) <= set(SHOPS)


class Others(unittest.TestCase):
    def test_bolsas_segun_el_mundo_sin_monedas(self):
        boxes = {
            "10": {"kind": "bag", "opens": 1000, "fails": 0, "items": {"11": [1000, 30, 80], "71": [1000, 1, 9], "23": [250, 1, 1]}},
            "10:crimson": {"kind": "bag", "opens": 1000, "fails": 0, "items": {"12": [1000, 30, 80], "23": [260, 1, 1]}},
            "extractMode": {"13": 0}, "shimmer": {"22": 23},
            "x0_219": {"kind": "extract", "opens": 1000, "fails": 0, "items": {"16": [20, 1, 1]}},
        }
        src = build_sources(cache(containers=boxes))
        assert src[11] == [{"k": "bag", "i": 10, "q": [30, 80], "r": 1.0, "if": ["In worlds with the Corruption", "En mundos con the Corruption"]}]
        assert src[12][0]["if"][0] == "In worlds with the Crimson"
        assert 71 not in src
        assert src[16] == [{"k": "extract", "i": 13, "t": 14, "r": 0.02}]
        assert src[23] == [{"k": "bag", "i": 10, "q": [1, 1], "r": 0.25}, {"k": "shimmer", "i": 22}]

    def test_premios_del_pescador(self):
        box = lambda items: {"kind": "angler", "opens": 1000, "fails": 0, "items": items}  # noqa: E731
        boxes = {
            "angler1": box({"71": [1000, 1, 5]}), "angler5": box({"28": [1000, 1, 1]}), "angler11:hm": box({"29": [20, 1, 1]}),
            "angler30": box({"30": [1000, 1, 1]}), "angler150": box({"30": [30, 1, 1]}), "angler150:hm": box({"29": [100, 1, 1], "30": [30, 1, 1]}),
        }
        src = build_sources(cache(containers=boxes))
        assert src[28] == [{"k": "angler", "n": 369, "if": ["Guaranteed on quest number 5", "Seguro en tu misión número 5"]}]
        assert src[29] == [{"k": "angler", "n": 369, "r": 0.1, "if": ["From 11 quests completed, in Hardmode, odds grow with every quest", "Desde 11 misiones hechas, en Hardmode, mejora con cada misión"]}]
        assert src[30][0]["if"][0] == "Guaranteed on quest number 30, from 150 quests completed" and src[30][0]["r"] == 0.03
        assert 71 not in src

    def test_vasijas_y_arboles(self):
        found = {
            "pot:0": {"tries": 500, "items": {"32": [5, 1, 1], "71": [400, 1, 9]}}, "pot:3": {"tries": 500, "items": {"32": [5, 1, 1]}},
            "pot:10": {"tries": 100, "items": {"32": [10, 1, 1]}}, "pot:11": {"tries": 100, "items": {"32": [10, 1, 2]}},
            "tree:5:Forest": {"tries": 1000, "items": {"31": [10, 1, 1]}}, "tree:596:Forest": {"tries": 1000, "items": {"31": [10, 1, 1]}},
            "tree:583:None": {"tries": 50, "items": {}}, "tree:5:Snow": {"tries": 100, "items": {"31": [2, 1, 1]}},
        }
        src = build_sources(cache(breakables=found))
        # Las vasijas del mismo lugar se juntan; lo que casi no salió (2 veces en la nieve) no se anota; sin monedas.
        assert src[32] == [{"k": "pot", "q": [1, 2], "r": 0.1, "if": ["In the Dungeon", "En the Dungeon"]}, {"k": "pot", "q": [1, 1], "r": 0.01}]
        assert src[31] == [{"k": "tree", "q": [1, 1], "r": 0.01}] and 71 not in src
        with self.assertRaises(KeyError):
            build_sources(cache(breakables={"tree:5:Alien": {"tries": 10, "items": {}}}))

    def test_pesca(self):
        rules = [
            {"items": [], "num": 1, "den": 1, "rarity": "Any", "if": ["InLava"]},
            {"items": [18], "num": 1, "den": 1, "rarity": "Rare", "if": ["InLava", "CanFishInLava"]},
            {"items": [17], "num": 1, "den": 1, "rarity": "Any", "if": []},
            {"items": [17], "num": 1, "den": 1, "rarity": "Any", "if": ["Remix"]},
            {"items": [18], "num": 1, "den": 2, "rarity": "VeryRare", "if": ["InLava"]},
            {"items": [22], "num": 1, "den": 1, "rarity": "Uncommon", "if": ["QuestFishCondition:22", "Jungle"]},
        ]
        src = build_sources(cache(fishrules=rules))
        assert src[18] == [{"k": "fish", "tier": "rare", "if": ["In lava", "En lava"]}]
        assert src[17] == [{"k": "fish"}]
        assert src[22][0]["if"][0] == "While the Angler asks for it, in the Jungle"

    def test_una_condicion_de_pesca_desconocida_hace_fallar(self):
        with self.assertRaises(KeyError):
            build_sources(cache(fishrules=[{"items": [17], "num": 1, "den": 1, "rarity": "Any", "if": ["OnTheMoon"]}]))

    def test_cofres(self):
        chest = lambda style, items, tile=21: {"world": "w", "tile": tile, "style": style, "locked": style == 2, "layer": 2, "items": items}  # noqa: E731
        found = [chest(2, [[19, 1], [71, 5]]), chest(2, [[2, 3], [2, 4]]), chest(2, []), chest(2, []), chest(1, [[19, 1]]), chest(0, [[2, 1]], tile=88)]
        src = build_sources(cache(chests=found, chestnames={"467:4": 16}))
        # Un cofre de cuatro lo trae; el tipo visto una sola vez y los aparadores (88) no cuentan.
        assert src[19] == [{"k": "chest", "l": ["Locked Gold Chest"] * 2, "q": [1, 1], "r": 0.25}]
        assert src[2] == [{"k": "chest", "l": ["Locked Gold Chest"] * 2, "q": [7, 7], "r": 0.25}]

    def test_cofre_trampa_toma_el_nombre_de_su_objeto(self):
        chest = {"world": "w", "tile": 467, "style": 4, "locked": False, "layer": 2, "items": [[2, 1]]}
        src = build_sources(cache(chests=[chest, chest], chestnames={"467:4": 16}))
        assert src[2][0]["l"] == ["Amber", "Amber"]


class InFicha(unittest.TestCase):
    def test_la_ficha_lleva_sus_fuentes_y_lo_que_nombran(self):
        sources = {7: [{"k": "shop", "n": 5, "p": 10}, {"k": "bag", "i": 1, "r": 0.5}, {"k": "bag", "i": 999, "r": 0.5}]}
        out = build(site_cache(), today="2026-10-12", sources=sources)
        ficha = next(f for chunk in (v for k, v in out.items() if k.startswith("site/items/")) for f in chunk.values() if f["id"] == 7)
        # La fuente que nombra un objeto sin ficha (999) se cae; el NPC y el objeto que quedan van a `npcs` y `refs`.
        assert ficha["sources"] == sources[7][:2]
        assert "1" in ficha["refs"] and ficha["npcs"]["5"] == ["Mothron", "Polillón"]
        row = next(r for r in out["site/list.json"] if r[0] == 7)
        assert row[7] & 8
        assert out["meta.json"]["counts"]["sources"] == 3


class Classes(unittest.TestCase):
    def test_cada_clase_tiene_todos_los_tramos(self):
        for cls in CLASSES:
            assert list(LOADOUTS[cls]) == [key for key, _ in STAGES]
            for weapons, armor, accessories in LOADOUTS[cls].values():
                assert 3 <= len(weapons) <= 6 and 1 <= len(armor) <= 3 and 3 <= len(accessories) <= 5

    def test_arma_las_referencias_y_falla_con_un_nombre_que_no_existe(self):
        items = [{"id": 1, "name": "Zenith"}, {"id": 2, "name": "Solar Flare Helmet"}, {"id": 3, "name": "Fire Gauntlet"}, {"id": 4, "name": "Twin"}, {"id": 5, "name": "Twin"}]
        npcs = {"en-US": {str(n): f"en{n}" for _, n in STAGES if n}, "es-ES": {str(n): f"es{n}" for _, n in STAGES if n}}
        slugs = {i: [f"s{i}", f"s{i}", "", "", 0, 0, 0] for i in range(1, 6)}
        one = {cls: {key: (["Zenith"], ["Solar Flare Helmet"], ["Fire Gauntlet"]) for key, _ in STAGES} for cls in CLASSES}
        out = build_classes(items, npcs, slugs, one)
        assert out["classes"][0]["stages"][0] == {"weapons": [1], "armor": [2], "accessories": [3]}
        assert out["stages"][1] == {"key": "prehard", "boss": ["en113", "es113"]} and set(out["refs"]) == {"1", "2", "3"}
        for bad in ("Nope", "Twin"):
            broken = {**one, "melee": {**one["melee"], "end": ([bad], ["Solar Flare Helmet"], ["Fire Gauntlet"])}}
            with self.assertRaises(ValueError):
                build_classes(items, npcs, slugs, broken)


if __name__ == "__main__":
    unittest.main()
