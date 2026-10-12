"""Arma los datos de la pestaña Clases (games/terraria/data/classes.json): qué armas, armadura y accesorios conviene
llevar con cada clase en cada tramo del juego.

Uso: python games/terraria/tools/classes_data.py   (después de site_data.py: usa sus slugs)

Esto no sale del juego: es una selección hecha a mano. Ordenar las armas por el daño de su ficha engaña (no cuenta
proyectiles ni efectos), así que se elige. Los objetos van por su nombre en inglés tal cual lo escribe el juego, y
`build_classes` falla si alguno no existe o si hay dos con el mismo nombre: un parche que renombre algo se nota al
regenerar. Los nombres en español los pone el sitio desde la ficha de cada objeto.
"""
from __future__ import annotations

import json
from pathlib import Path

from world_data import item_refs

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
DATA = ROOT / "data"

# Los tramos, en orden: clave y hasta qué jefe llega (ids de enemigo; el sitio toma el nombre del primero).
STAGES = [
    ("start", None),        # recién llegado, antes de cualquier jefe
    ("prehard", 113),       # hasta el Muro de carne
    ("premech", 134),       # empieza el Hardmode, antes de los jefes mecánicos
    ("preplant", 262),      # los tres mecánicos vencidos, antes de Plantera
    ("pregolem", 245),      # después de Plantera, antes del Gólem
    ("prelunar", 396),      # después del Gólem, antes del Señor de la Luna
    ("end", None),          # el final del juego
]

CLASSES = ["melee", "ranged", "magic", "summon"]

# Clase → tramo → (armas, armadura, accesorios).
LOADOUTS: dict[str, dict[str, tuple[list[str], list[str], list[str]]]] = {
    "melee": {
        "start": (["Ice Blade", "Starfury", "Enchanted Boomerang", "Amazon", "Platinum Broadsword"],
                  ["Platinum Helmet", "Platinum Chainmail", "Platinum Greaves"],
                  ["Hermes Boots", "Cloud in a Bottle", "Band of Regeneration", "Feral Claws", "Shackle"]),
        "prehard": (["Night's Edge", "Volcano", "Sunfury", "Cascade", "Dark Lance", "Flamarang"],
                    ["Molten Helmet", "Molten Breastplate", "Molten Greaves"],
                    ["Lightning Boots", "Obsidian Shield", "Feral Claws", "Shark Tooth Necklace", "Magma Stone"]),
        "premech": (["Amarok", "Shadowflame Knife", "Fetid Baghnakhs", "Dao of Pow", "Bladetongue", "Titanium Sword"],
                    ["Titanium Mask", "Titanium Breastplate", "Titanium Leggings"],
                    ["Warrior Emblem", "Berserker's Glove", "Frostspark Boots", "Angel Wings", "Obsidian Shield"]),
        "preplant": (["True Night's Edge", "True Excalibur", "Death Sickle", "Yelets", "Light Disc"],
                     ["Hallowed Mask", "Hallowed Plate Mail", "Hallowed Greaves"],
                     ["Fire Gauntlet", "Avenger Emblem", "Ankh Shield", "Flame Wings", "Terraspark Boots"]),
        "pregolem": (["Terra Blade", "Seedler", "Paladin's Hammer", "Vampire Knives", "The Horseman's Blade", "Kraken"],
                     ["Turtle Helmet", "Turtle Scale Mail", "Turtle Leggings"],
                     ["Fire Gauntlet", "Avenger Emblem", "Ankh Shield", "Master Ninja Gear", "Spectre Wings"]),
        "prelunar": (["Solar Eruption", "Daybreak", "Influx Waver", "Flairon", "Possessed Hatchet", "Starlight"],
                     ["Beetle Helmet", "Beetle Scale Mail", "Beetle Leggings"],
                     ["Fire Gauntlet", "Destroyer Emblem", "Celestial Shell", "Ankh Shield", "Fishron Wings"]),
        "end": (["Zenith", "Meowmere", "Star Wrath", "Terrarian"],
                ["Solar Flare Helmet", "Solar Flare Breastplate", "Solar Flare Leggings"],
                ["Fire Gauntlet", "Destroyer Emblem", "Celestial Shell", "Celestial Starboard", "Soaring Insignia"]),
    },
    "ranged": {
        "start": (["Platinum Bow", "Musket", "The Undertaker", "Boomstick", "Snowball Cannon"],
                  ["Fossil Helmet", "Fossil Plate", "Fossil Greaves"],
                  ["Hermes Boots", "Cloud in a Bottle", "Band of Regeneration", "Shackle"]),
        "prehard": (["Phoenix Blaster", "Molten Fury", "The Bee's Knees", "Minishark", "Star Cannon", "Quad-Barrel Shotgun"],
                    ["Necro Helmet", "Necro Breastplate", "Necro Greaves"],
                    ["Lightning Boots", "Obsidian Shield", "Stinger Necklace", "Bundle of Balloons"]),
        "premech": (["Daedalus Stormbow", "Onyx Blaster", "Clockwork Assault Rifle", "Uzi", "Shadowflame Bow", "Dart Rifle"],
                    ["Titanium Helmet", "Titanium Breastplate", "Titanium Leggings"],
                    ["Ranger Emblem", "Magic Quiver", "Frostspark Boots", "Angel Wings", "Obsidian Shield"]),
        "preplant": (["Megashark", "Chlorophyte Shotbow", "Hallowed Repeater", "Flamethrower", "Phantom Phoenix"],
                     ["Hallowed Helmet", "Hallowed Plate Mail", "Hallowed Greaves"],
                     ["Avenger Emblem", "Ranger Emblem", "Molten Quiver", "Flame Wings", "Terraspark Boots"]),
        "pregolem": (["Tsunami", "Chain Gun", "Tactical Shotgun", "Sniper Rifle", "Venus Magnum", "Snowman Cannon"],
                     ["Shroomite Headgear", "Shroomite Breastplate", "Shroomite Leggings"],
                     ["Sniper Scope", "Avenger Emblem", "Stalker's Quiver", "Master Ninja Gear", "Spectre Wings"]),
        "prelunar": (["Phantasm", "Vortex Beater", "Eventide", "Xenopopper", "Aerial Bane", "Tsunami"],
                     ["Shroomite Headgear", "Shroomite Breastplate", "Shroomite Leggings"],
                     ["Recon Scope", "Destroyer Emblem", "Stalker's Quiver", "Celestial Shell", "Fishron Wings"]),
        "end": (["S.D.M.G.", "Celebration Mk2", "Phantasm", "Vortex Beater"],
                ["Vortex Helmet", "Vortex Breastplate", "Vortex Leggings"],
                ["Recon Scope", "Destroyer Emblem", "Stalker's Quiver", "Celestial Starboard", "Soaring Insignia"]),
    },
    "magic": {
        "start": (["Diamond Staff", "Ruby Staff", "Thunder Zapper", "Vilethorn", "Crimson Rod", "Wand of Sparking"],
                  ["Jungle Hat", "Jungle Shirt", "Jungle Pants"],
                  ["Band of Starpower", "Mana Flower", "Hermes Boots", "Cloud in a Bottle"]),
        "prehard": (["Water Bolt", "Demon Scythe", "Bee Gun", "Space Gun", "Flamelash", "Aqua Scepter"],
                    ["Jungle Hat", "Jungle Shirt", "Jungle Pants"],
                    ["Mana Flower", "Celestial Cuffs", "Band of Starpower", "Lightning Boots", "Obsidian Shield"]),
        "premech": (["Golden Shower", "Crystal Serpent", "Sky Fracture", "Meteor Staff", "Crystal Storm", "Laser Rifle"],
                    ["Titanium Headgear", "Titanium Breastplate", "Titanium Leggings"],
                    ["Sorcerer Emblem", "Mana Flower", "Celestial Cuffs", "Frostspark Boots", "Angel Wings"]),
        "preplant": (["Rainbow Rod", "Magical Harp", "Unholy Trident", "Venom Staff", "Tome of Infinite Wisdom", "Golden Shower"],
                     ["Hallowed Headgear", "Hallowed Plate Mail", "Hallowed Greaves"],
                     ["Sorcerer Emblem", "Avenger Emblem", "Mana Flower", "Celestial Cuffs", "Flame Wings"]),
        "pregolem": (["Razorblade Typhoon", "Razorpine", "Spectre Staff", "Blizzard Staff", "Rainbow Gun", "Bat Scepter"],
                     ["Spectre Hood", "Spectre Robe", "Spectre Pants"],
                     ["Sorcerer Emblem", "Celestial Emblem", "Mana Flower", "Celestial Cuffs", "Spectre Wings"]),
        "prelunar": (["Nebula Blaze", "Nebula Arcanum", "Nightglow", "Razorblade Typhoon", "Laser Machinegun", "Betsy's Wrath"],
                     ["Spectre Mask", "Spectre Robe", "Spectre Pants"],
                     ["Sorcerer Emblem", "Destroyer Emblem", "Celestial Emblem", "Celestial Shell", "Fishron Wings"]),
        "end": (["Last Prism", "Lunar Flare", "Nebula Blaze", "Nebula Arcanum"],
                ["Nebula Helmet", "Nebula Breastplate", "Nebula Leggings"],
                ["Sorcerer Emblem", "Destroyer Emblem", "Celestial Emblem", "Celestial Starboard", "Soaring Insignia"]),
    },
    "summon": {
        "start": (["Flinx Staff", "Finch Staff", "Vampire Frog Staff", "Abigail's Flower", "Leather Whip", "Snapthorn"],
                  ["Flinx Fur Coat"],
                  ["Feral Claws", "Hermes Boots", "Cloud in a Bottle", "Band of Regeneration"]),
        "prehard": (["Imp Staff", "Hornet Staff", "Spinal Tap", "Snapthorn", "Houndius Shootius", "Ballista Rod"],
                    ["Obsidian Outlaw Hat", "Obsidian Longcoat", "Obsidian Pants"],
                    ["Pygmy Necklace", "Feral Claws", "Lightning Boots", "Obsidian Shield", "Shark Tooth Necklace"]),
        "premech": (["Blade Staff", "Sanguine Staff", "Spider Staff", "Firecracker", "Cool Whip", "Queen Spider Staff"],
                    ["Spider Mask", "Spider Breastplate", "Spider Greaves"],
                    ["Summoner Emblem", "Pygmy Necklace", "Berserker's Glove", "Frostspark Boots", "Angel Wings"]),
        "preplant": (["Optic Staff", "Durendal", "Sanguine Staff", "Blade Staff", "Firecracker"],
                     ["Hallowed Hood", "Hallowed Plate Mail", "Hallowed Greaves"],
                     ["Summoner Emblem", "Avenger Emblem", "Pygmy Necklace", "Fire Gauntlet", "Flame Wings"]),
        "pregolem": (["Desert Tiger Staff", "Raven Staff", "Tempest Staff", "Dark Harvest", "Morning Star", "Staff of the Frost Hydra"],
                     ["Spooky Helmet", "Spooky Breastplate", "Spooky Leggings"],
                     ["Papyrus Scarab", "Pygmy Necklace", "Summoner Emblem", "Avenger Emblem", "Spectre Wings"]),
        "prelunar": (["Stardust Dragon Staff", "Stardust Cell Staff", "Xeno Staff", "Kaleidoscope", "Terraprisma", "Tempest Staff"],
                     ["Spooky Helmet", "Spooky Breastplate", "Spooky Leggings"],
                     ["Papyrus Scarab", "Pygmy Necklace", "Summoner Emblem", "Destroyer Emblem", "Fishron Wings"]),
        "end": (["Terraprisma", "Stardust Dragon Staff", "Kaleidoscope", "Rainbow Crystal Staff", "Lunar Portal Staff"],
                ["Stardust Helmet", "Stardust Plate", "Stardust Leggings"],
                ["Papyrus Scarab", "Pygmy Necklace", "Summoner Emblem", "Destroyer Emblem", "Celestial Starboard"]),
    },
}


def build_classes(items: list[dict], npcs: dict, slugs: dict[int, list], loadouts: dict | None = None) -> dict:
    """`items`: el volcado; `npcs`: los nombres de enemigos por idioma; `slugs`: una referencia por objeto con ficha."""
    loadouts = loadouts or LOADOUTS
    by_name: dict[str, list[int]] = {}
    for it in items:
        if it["id"] in slugs:
            by_name.setdefault(it["name"], []).append(it["id"])
    refs: dict[str, list] = {}

    def ids(names: list[str]) -> list[int]:
        out = []
        for name in names:
            found = by_name.get(name, [])
            if len(found) != 1:
                raise ValueError(f"{name!r}: {'no existe' if not found else 'hay más de uno'} (classes_data.py)")
            refs[str(found[0])] = slugs[found[0]]
            out.append(found[0])
        return out

    classes = []
    for cls in CLASSES:
        stages = []
        for key, _ in STAGES:
            weapons, armor, accessories = loadouts[cls][key]
            stages.append({"weapons": ids(weapons), "armor": ids(armor), "accessories": ids(accessories)})
        classes.append({"key": cls, "stages": stages})
    return {
        "stages": [{"key": key, "boss": [npcs["en-US"][str(npc)], npcs["es-ES"][str(npc)]] if npc else None} for key, npc in STAGES],
        "classes": classes,
        "refs": refs,
    }


def main() -> None:
    read = lambda name: json.loads((CACHE / name).read_text(encoding="utf-8-sig"))  # noqa: E731
    out = build_classes(read("items.json"), read("npcs.json"), item_refs())
    (DATA / "classes.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(out["classes"]), "clases,", len(out["stages"]), "tramos,", len(out["refs"]), "objetos")


if __name__ == "__main__":
    main()
