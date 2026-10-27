"""Pruebas de `builder` (datos del armador y de Rivens). Correr: python -m unittest discover -s games/warframe/tools/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import builder  # noqa: E402
import site_data  # noqa: E402


class TestBuilder(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        out = site_data.build(write=False)
        cls.files = out["builder"]
        cls.items = {i["slug"]: i for i in cls.files["builder/items.json"]["items"]}
        cls.mods = {k: cls.files[f"builder/mods-{k}.json"]["mods"] for k in builder.KINDS}
        cls.rivens = cls.files["rivens/list.json"]
        cls.arsenal = {r["slug"]: r for r in out["lists"]["arsenal"]}
        mods = site_data._mods()
        site_data._slugs(mods)
        cls.slug_de = {m["unique"]: m["slug"] for m in mods}
        cls.lista_mods = {m["slug"]: m for m in out["lists"]["mods"]}

    def _mod(self, kind: str, slug: str) -> dict:
        return next(m for m in self.mods[kind] if m["slug"] == slug)

    def _slug_mod(self, unique: str) -> str:
        return self.slug_de[unique]

    def test_parse_serration(self):
        m = self._mod("primary", self._slug_mod("/Lotus/Upgrades/Mods/Rifle/WeaponDamageAmountMod"))
        self.assertEqual(m["fx"], [["damage", [15 * (n + 1) for n in range(11)]]])
        self.assertEqual(m["max"], 10)
        self.assertEqual(m["pol"], "madurai")
        self.assertEqual(m["drain"], 4)
        self.assertEqual(m["slot"], "normal")

    def test_parse_condicional(self):
        # Galvanized Chamber: el multidisparo base suma, el "On Kill" no.
        m = self._mod("primary", self._slug_mod("/Lotus/Upgrades/Mods/Rifle/WeaponFireIterationsSPMod"))
        self.assertEqual([k for k, _ in m["fx"]], ["multishot"])
        self.assertEqual(m["fx"][0][1][-1], 80)
        for linea in ("On Kill:\n+30% Multishot for 20s. Stacks up to 5x.", "+30% Damage on Kill",
                      "+30% Damage after a Slide", "+30% Critical Chance while Aiming",
                      "Squad receives +60% Melee Damage", "+60% Fire Rate when Aiming"):
            self.assertIsNone(builder.leer_linea(linea), linea)
        # Ninguna línea con una condición suma en ningún mod.
        for ms in self.mods.values():
            for m in ms:
                for en, _ in m["text"]:
                    if any(p in en for p in ("On Kill", "on Kill", "after", "while", "when", "On ")):
                        self.assertIsNone(builder.leer_linea(en), (m["slug"], en))

    def test_patrones(self):
        casos = {
            "+165% Damage": ("damage", 165), "+90% <DT_FIRE_COLOR>Heat": ("heat", 90),
            "+90% <DT_FREEZE_COLOR>Cold": ("cold", 90), "+90% <DT_ELECTRICITY_COLOR>Electricity": ("electricity", 90),
            "+90% <DT_POISON_COLOR>Toxin": ("toxin", 90), "+60% <DT_EXPLOSION_COLOR>Blast": ("blast", 60),
            "+60% <DT_CORROSIVE_COLOR>Corrosive": ("corrosive", 60), "+60% <DT_GAS_COLOR>Gas": ("gas", 60),
            "+60% <DT_MAGNETIC_COLOR>Magnetic": ("magnetic", 60), "+60% <DT_RADIATION_COLOR>Radiation": ("radiation", 60),
            "+60% <DT_VIRAL_COLOR>Viral": ("viral", 60), "+120% <DT_IMPACT_COLOR>Impact": ("impact", 120),
            "+120% <DT_PUNCTURE_COLOR>Puncture": ("puncture", 120), "+120% <DT_SLASH_COLOR>Slash": ("slash", 120),
            "+90% Multishot": ("multishot", 90), "+150% Critical Chance": ("critChance", 150),
            "+200% Critical Chance (x2 for Heavy Attacks)": ("critChance", 200),
            "+120% Critical Damage": ("critDamage", 120), "+90% Status Chance": ("statusChance", 90),
            "+60% Fire Rate (x2 for Bows)": ("fireRate", 60), "+72% Fire Rate": ("fireRate", 72),
            "+30% Magazine Capacity": ("magazine", 30), "+30% Reload Speed": ("reload", 30),
            "-30% Reload Speed": ("reload", -30), "+120% Melee Damage": ("meleeDamage", 120),
            "+35% Attack Speed": ("attackSpeed", 35), "+30% Ability Strength": ("strength", 30),
            "+28% Ability Duration": ("duration", 28), "-55% Ability Efficiency": ("efficiency", -55),
            "+45% Ability Range": ("range", 45), "+100% Health": ("health", 100),
            "+100% Shield Capacity": ("shield", 100), "+100% Armor": ("armor", 100), "+100% Energy Max": ("energy", 100),
        }
        for texto, esperado in casos.items():
            self.assertEqual(builder.leer_linea(texto), esperado, texto)
        for texto in ("+150 Shield Capacity", "+1.2 Range", "+15% <DT_POISON_COLOR>Toxin Resistance",
                      "+30% of Damage converted into <DT_SLASH_COLOR>Slash", "x1.3 Damage to Grineer",
                      "+60% Weapon Recoil", "+10% Health and +10% Armor"):
            self.assertIsNone(builder.leer_linea(texto), texto)

    def test_elementos_y_fisicos(self):
        hell = self._mod("primary", self._slug_mod("/Lotus/Upgrades/Mods/Rifle/WeaponFireDamageMod"))
        self.assertEqual(hell["fx"][0][0], "heat")
        clip = self._mod("primary", self._slug_mod("/Lotus/Upgrades/Mods/Rifle/WeaponToxinDamageMod"))
        self.assertEqual(clip["fx"][0][0], "toxin")
        corte = [m for ms in self.mods.values() for m in ms if m["fx"] and m["fx"][0][0] == "slash"]
        self.assertTrue(corte)

    def test_aura_y_postura(self):
        sc = self._mod("warframe", self._slug_mod("/Lotus/Upgrades/Mods/Aura/PlayerMeleeAuraMod"))
        self.assertEqual((sc["slot"], sc["drain"], sc["max"]), ("aura", -4, 5))
        self.assertEqual(sc["fx"], [])  # "Squad receives…" no es del Warframe
        posturas = [m for m in self.mods["melee"] if m["slot"] == "stance"]
        self.assertTrue(posturas)
        self.assertTrue(all(m["drain"] < 0 for m in posturas))

    def test_exilus(self):
        ex = [m for ms in self.mods.values() for m in ms if m["exilus"]]
        self.assertGreater(len(ex), 50)

    def test_sin_mods_de_companeros_ni_conclave(self):
        for ms in self.mods.values():
            for m in ms:
                self.assertNotIn(m["compat"], ("Kubrow Claws", "Kavat Claws", "Helminth Claws"))
        fuera = {s for u, s in self.slug_de.items() if any(p in u for p in ("/PvPMods/", "/Sentinel/", "/Pets/"))}
        self.assertTrue(fuera)
        self.assertFalse(fuera & {m["slug"] for ms in self.mods.values() for m in ms})

    def test_items(self):
        b = self.items["braton"]
        self.assertEqual(b["kind"], "primary")
        for a, e in zip(b["w"]["dmg"][:3], [7.92, 7.92, 8.16]):
            self.assertAlmostEqual(a, e, places=4)
        self.assertEqual(len(b["w"]["dmg"]), 20)
        self.assertEqual(b["w"]["cc"], 0.12)
        self.assertEqual(b["w"]["mag"], 45)
        self.assertEqual(b["w"]["riven"], "rifle")
        self.assertFalse(b["w"]["bow"])
        self.assertFalse(b["w"]["shotgun"])
        self.assertIn("Rifle", b["compat"])
        self.assertIn("Braton", b["compat"])
        self.assertEqual(b["cap"], 30)
        hek = self.items["hek"]
        self.assertTrue(hek["w"]["shotgun"])
        self.assertEqual(hek["w"]["ms"], 7)
        self.assertEqual(hek["w"]["riven"], "shotgun")
        self.assertIn("Shotgun", hek["compat"])
        self.assertNotIn("Rifle", hek["compat"])
        paris = self.items["paris"]
        self.assertTrue(paris["w"]["bow"])
        self.assertIn("Bow", paris["compat"])
        self.assertIn("Rifle", paris["compat"])
        self.assertFalse(self.items["lanka"]["w"]["bow"])
        self.assertIn("Sniper", self.items["lanka"]["compat"])
        self.assertTrue(self.items["bronco"]["w"]["shotgun"])
        self.assertEqual(self.items["bronco"]["w"]["riven"], "pistol")
        self.assertEqual(self.items["kuva-hek"]["cap"], 40)
        self.assertIn("Hek", self.items["kuva-hek"]["compat"])
        sk = self.items["skana"]
        self.assertEqual(sk["kind"], "melee")
        self.assertIn("Swords", sk["compat"])
        self.assertEqual(sk["w"]["riven"], "melee")
        self.assertEqual(self.items["excalibur"]["f"], {"health": 370, "shield": 370, "armor": 240, "energy": 150})
        self.assertIn("Excalibur", self.items["excalibur-prime"]["compat"])
        self.assertIn("AURA", self.items["excalibur"]["compat"])
        self.assertEqual(self.items["inaros"]["f"]["health"], 2310)
        self.assertEqual(self.items["inaros"]["f"]["shield"], 0)
        self.assertEqual(self.items["wisp"]["f"]["energy"], 300)
        self.assertEqual(self.items["wisp"]["f"]["shield"], 280)
        self.assertEqual(self.items["rhino"]["f"]["shield"], 555)
        self.assertFalse(any(i["kind"] == "warframe" and "w" in i for i in self.items.values()))

    def test_solo_lo_que_se_arma(self):
        kinds = {i["kind"] for i in self.items.values()}
        self.assertEqual(kinds, set(builder.KINDS))
        self.assertNotIn("voidrig", self.items)  # Necramech
        for i in self.items.values():  # slug e ícono del Arsenal
            self.assertEqual(i["icon"], self.arsenal[i["slug"]]["img"])

    def test_rivens(self):
        tipos = {t["key"]: t for t in self.rivens["types"]}
        self.assertEqual(set(tipos), {"rifle", "shotgun", "pistol", "melee", "archgun", "kitgun", "zaw"})
        crit = next(s for s in tipos["rifle"]["stats"] if s["tag"] == "WeaponCritChanceMod")
        self.assertAlmostEqual(crit["value"], 0.016666, places=5)
        self.assertEqual(crit["name"][0], "Critical Chance")
        self.assertTrue(all(s["name"][1] for t in tipos.values() for s in t["stats"]))
        armas = {w["slug"]: w for w in self.rivens["weapons"]}
        self.assertEqual(armas["braton"]["type"], "rifle")
        self.assertEqual(armas["braton"]["d"], 1.2)
        self.assertEqual(armas["hek"]["type"], "shotgun")
        self.assertTrue(all(w["d"] == 1.2 for w in armas.values()))
        self.assertTrue(all(w["type"] in tipos for w in armas.values()))
        self.assertTrue(any(w["type"] == "archgun" for w in armas.values()))
        self.assertGreater(len(armas), 500)

    def test_rivens_unidad(self):
        """La unidad sale del `locTag`: casi todo en %, la duración del combo en s y el resto sin unidad."""
        melee = {s["tag"]: s for t in self.rivens["types"] if t["key"] == "melee" for s in t["stats"]}
        self.assertEqual(melee["WeaponCritChanceMod"]["unit"], "%")
        self.assertEqual(melee["ComboDurationMod"]["unit"], "s")
        for tag in ("WeaponMeleeRangeIncMod", "WeaponMeleeComboInitialBonusMod", "WeaponMeleeParryAngleMod",
                    "WeaponMeleeFactionDamageGrineer"):
            self.assertEqual(melee[tag]["unit"], "", tag)
        self.assertEqual(builder._unidad_stat("|STAT1|% Critical Chance for Slide Attack"), "%")
        self.assertEqual(builder._unidad_stat("|val| Punch Through"), "")
        self.assertTrue(all(s["unit"] in ("%", "s", "") for t in self.rivens["types"] for s in t["stats"]))

    def test_rivens_piso_de_armas(self):
        """Si el filtro de disposición deja casi sin armas (DE la volvió a poner), se corta en vez de publicar vacío."""
        with self.assertRaisesRegex(ValueError, "armas con Riven"):
            builder._rivens(self.rivens["weapons"][:10])

    def test_rivens_en_espanol(self):
        rifle = {s["tag"]: s["name"] for s in self.rivens["types"][0]["stats"]}
        self.assertEqual(rifle["WeaponCritChanceMod"], ["Critical Chance", "Probabilidad crítica"])
        self.assertEqual(rifle["WeaponFireDamageMod"], ["Heat", "Calor"])
        self.assertEqual(rifle["WeaponCorrosiveDamageMod"][1], "Corrosivo")

    def test_parse_wiki(self):
        lua = ('return {\n\tBraton = {\n\t\tAttacks = {\n\t\t\t{\n\t\t\t\tClass = "x"\n\t\t\t}\n\t\t},\n'
               '\t\tClass = "Rifle",\n\t\tCompatibilityTags = { "ASSAULT_AMMO" },\n\t\tFamily = "Braton",\n'
               '\t\tInternalName = "/Lotus/Weapons/Tenno/Rifle/Rifle",\n\t\tName = "Braton"\n\t},\n'
               '\t["Dual Toxocyst"] = {\n\t\tClass = "Dual Pistols",\n\t\tName = "Dual Toxocyst"\n\t}\n}')
        self.assertEqual(builder.parse_wiki(lua), [
            ["/Lotus/Weapons/Tenno/Rifle/Rifle", "Braton", "Rifle", "Braton", ["ASSAULT_AMMO"]],
            ["", "Dual Toxocyst", "Dual Pistols", "", []]])

    def test_compat(self):
        for i in self.items.values():
            ms = self.mods[i["kind"]]
            n = sum(1 for m in ms if m["compat"] in i["compat"])
            self.assertGreaterEqual(n, 100 if i["kind"] == "warframe" else 20, i["slug"])
        # Cada mod entra en algún objeto de su archivo.
        for kind, ms in self.mods.items():
            compats = {c for i in self.items.values() if i["kind"] == kind for c in i["compat"]}
            for m in ms:
                self.assertIn(m["compat"], compats, m["slug"])

    def test_slugs_de_la_pestana_mods(self):
        slugs = [m["slug"] for ms in self.mods.values() for m in ms]
        self.assertEqual(len(slugs), len(set(slugs)))
        for ms in self.mods.values():
            for m in ms:  # el slug y el ícono son los de la ficha de Mods
                self.assertEqual(m.get("icon"), self.lista_mods[m["slug"]]["img"])


if __name__ == "__main__":
    unittest.main()
