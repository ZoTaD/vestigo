"""
Correcciones a mano de "de dónde sale", cada una con su fuente en la wiki.

Pedido de ZoTaD (2026-09-24): todo sale de un lugar y de un bioma, y más
adelante va a haber un árbol de recursos con flechas, así que cada objeto tiene
que tener su fuente real. Lo que el extractor no ve (cosas que están en
ubicaciones sin componente que las suelte, o que se consiguen con una mecánica
aparte) va acá, con la página de la wiki que lo dice.

`site.py` lo aplica sobre `data/items.json` antes de calcular biomas.
"""

# Fuentes que faltan. `name` es dónde exactamente, para la ficha.
EXTRA_SOURCES: dict[str, list[dict]] = {
    # --- 2026-09-28, investigado para "todo tiene que estar completo" (ZoTaD).
    # Weird Gloop "Iron Ore": en la 1.0 sólo sale como premio al pescar un
    # arenque gigante (los meteoritos y el hierro de pantano no se generan).
    "IronOre": [{"kind": "gather", "how": "fish", "biomes": ["ocean"],
                 "name": {"en": "Bonus when catching a Giant Herring", "es": "Premio al pescar un arenque gigante"}}],
    # Weird Gloop y Fandom "Asksvin egg"; archivos del juego (Procreation del Asksvin).
    'AsksvinEgg': [{"kind": "gather", "how": "pickable", "biomes": ["ashlands"], "name": {"en": "Laid by a tamed, well-fed Asksvin with another one within 4 m", "es": "Lo pone un cenicerdo domesticado y bien alimentado con otro a menos de 4 m"}}],
    # Weird Gloop "Embers" y "Eternal Pyre"; archivos del juego.
    'FaderEmber': [{"kind": "gather", "how": "pickable", "biomes": [], "name": {"en": "Ember spirits at an Eternal Pyre (built with Fader's charred ribs)", "es": "Espíritus de brasas en una Pira eterna (se construye con las costillas calcinadas de Fader)"}, "tier": "ashlands"}],
    # Weird Gloop "Liquid Frost" y "Frigid Kiln"; archivos del juego.
    'FrozenFuel': [{"kind": "gather", "how": "convert", "biomes": ["deepnorth"], "name": {"en": "Frigid Kiln: 5 Ice become 1 every 30 s", "es": "Horno gélido: 5 de Hielo se vuelven 1 cada 30 s"}}],
    # Weird Gloop "Malicious Blood" y "Jotun Invasion"; archivos del juego.
    'HatefulBlood': [{"kind": "gather", "how": "destructible", "biomes": ["meadows", "blackforest", "swamp", "mountain", "plains"], "name": {"en": "Malicious Ice at the heart of a Jotun Invasion (starts after breaking the one deep in a Mörkhalla)", "es": "Hielo malicioso en el centro de una Invasión jotun (empieza al romper el del fondo de una Mörkhalla)"}, "min": 1, "max": 1, "tier": "deepnorth"}],
    # Weird Gloop "Petrified Tissue" y "Gammeltroll"; archivos del juego.
    'GoldOre': [{"kind": "gather", "how": "mine", "biomes": ["deepnorth"], "name": {"en": "Petrified Gammeltroll and its buried limbs; only an Ember Charge breaks them", "es": "Gammeltrol petrificado y sus restos enterrados; sólo los rompe una Carga de brasas"}, "chance": 0.333}],
    # Archivos del juego (receta de temporada) y Weird Gloop "Midsummer Crown".
    'HelmetMidsummerCrown': [{"kind": "gather", "how": "craft", "biomes": [], "name": {"en": "Workbench, only from June 1 to July 6 (10 Dandelion)", "es": "Banco de trabajo, sólo del 1 de junio al 6 de julio (10 de Diente de león)"}, "tier": "meadows"}],
    # Archivos del juego (receta de temporada) y Weird Gloop "Pointy Hat".
    'HelmetPointyHat': [{"kind": "gather", "how": "craft", "biomes": [], "name": {"en": "Workbench, only from October 1 to November 6", "es": "Banco de trabajo, sólo del 1 de octubre al 6 de noviembre"}, "tier": "blackforest"}],
    # Weird Gloop "Salvaged Lantern": una estructura muy rara que siempre suelta uno.
    'Lantern_DN': [{"kind": "gather", "how": "destructible", "biomes": ["meadows", "blackforest", "swamp", "mountain", "plains", "mistlands", "deepnorth"], "name": {"en": "Breaking a Standing Lantern (a very rare structure)", "es": "Rompiendo un Farol de pie (una estructura muy rara)"}, "min": 1, "max": 1}],
    # Wiki "Vineberry cluster" y "Ashvine": crece en las paredes de las ruinas
    # carbonizadas de la Tierra de Ceniza. Sin esto la parrabaya salía "del
    # Pantano" y era la mejor comida del bioma.
    "Vineberry": [{"kind": "gather", "how": "pickable", "biomes": ["ashlands"],
                   "name": {"en": "Ashvine on charred ruins", "es": "Enredadera de ceniza en ruinas carbonizadas"}}],
    # Wiki "Vineberry seeds": 20 % de 1 a 4 al cosechar la parrabaya.
    "VineberrySeeds": [{"kind": "gather", "how": "pickable", "biomes": ["ashlands"], "chance": 0.2, "min": 1, "max": 4,
                        "name": {"en": "Harvesting Vineberry Clusters", "es": "Al cosechar racimos de parrabaya"}}],
    # Wiki "Asksvin neck": restos de asksvin, cerca de los Pozos pútridos y los nidos de voltura.
    **{pid: [{"kind": "gather", "how": "destructible", "biomes": ["ashlands"],
              "name": {"en": "Asksvin carrion", "es": "Restos de asksvin"}}]
       for pid in ("AsksvinCarrionNeck", "AsksvinCarrionPelvic", "AsksvinCarrionRibcage", "AsksvinCarrionSkull")},
    # Wiki "Bell fragment": el altar de la torre de la fortaleza carbonizada, 2 a 4.
    "BellFragment": [{"kind": "gather", "how": "destructible", "biomes": ["ashlands"], "min": 2, "max": 4,
                      "name": {"en": "Bell altar in a Charred Fortress", "es": "Altar de la campana en una fortaleza carbonizada"}}],
    # Wiki "Scrap bronze": las púas de defensa de las fortalezas carbonizadas.
    "BronzeScrap": [{"kind": "gather", "how": "destructible", "biomes": ["ashlands"],
                     "name": {"en": "Charred Fortress spikes", "es": "Púas de las fortalezas carbonizadas"}}],
    # Wiki "Charred cogwheel": lo suelta el Skugg (balista de hueso de las fortalezas).
    "CharredCogwheel": [{"kind": "gather", "how": "destructible", "biomes": ["ashlands"],
                         "name": {"en": "Skugg (bone ballista)", "es": "Skugg (balista de hueso)"}}],
    # Wiki "Sealbreaker fragment": vitrinas de luz azul de las Minas infestadas.
    "DvergrKeyFragment": [{"kind": "gather", "how": "location", "biomes": ["mistlands"],
                           "name": {"en": "Glass displays in Infested Mines", "es": "Vitrinas de las Minas infestadas"}}],
    # Wiki "Dvergr extractor": cajas de componentes de los asentamientos dvergr.
    "DvergrNeedle": [{"kind": "gather", "how": "chest", "biomes": ["mistlands"],
                      "name": {"en": "Dvergr component crate", "es": "Caja de componentes dvergr"}}],
    # Wiki "Blue jute": cortinas y colgaduras de las construcciones dvergr de mármol negro.
    "JuteBlue": [{"kind": "gather", "how": "destructible", "biomes": ["mistlands"],
                  "name": {"en": "Dvergr curtains and drapes", "es": "Cortinas y colgaduras dvergr"}}],
    # Wiki "Sap": con el extractor de savia sobre las raíces ancestrales.
    "Sap": [{"kind": "gather", "how": "extract", "biomes": ["mistlands"],
             "name": {"en": "Sap Extractor on an Ancient Root", "es": "Extractor de savia en una raíz ancestral"}}],
    # Wiki "Wisp": alrededor de las fuentes de fuegos fatuos, de noche.
    "Wisp": [{"kind": "gather", "how": "pickable", "biomes": ["mistlands"],
              "name": {"en": "Wisp fountains at night", "es": "Fuentes de fuegos fatuos, de noche"}}],
    # Wiki "Fenris claw": pedestales de las Cuevas heladas.
    "WolfClaw": [{"kind": "gather", "how": "location", "biomes": ["mountain"],
                  "name": {"en": "Pedestals in Frost Caves", "es": "Pedestales de las Cuevas heladas"}}],
    # Wiki "Tetra": los lagos del fondo de las Cuevas heladas, con cebo frío.
    "Fish4_cave": [{"kind": "gather", "how": "fish", "biomes": ["mountain"],
                    "name": {"en": "Lakes in Frost Caves", "es": "Lagos de las Cuevas heladas"}}],
}

# Fuentes que el extractor saca mal. La hiedra (VineGreen) usa el mismo
# prefabricado de enredadera que la de ceniza, pero no da parrabaya: wiki
# "Vineberry cluster" (sólo crece de la enredadera de ceniza).
DROP_SOURCES: set[tuple[str, str, str]] = {("Vineberry", "farm", "VineGreen_sapling"),
                                           # Weird Gloop "Iron Ore" (ver arriba): no se generan en el mundo.
                                           ("IronOre", "gather", "Pickable_Meteorite"),
                                           ("IronOre", "gather", "Pickable_BogIronOre")}

# El bioma de fuentes que el juego no ubica, por el prefab de donde salen
# (2026-09-28, Weird Gloop "Winding Tunnels", "Memorial Place" y "Fenris Hair").
FROM_BIOMES: dict[str, list[str]] = {
    "Pickable_FrostCoreHanger": ["deepnorth"],  # al fondo de los Túneles serpenteantes
    "Pickable_GlowWorm": ["deepnorth"],          # Túneles serpenteantes
    "TreasureChest_memorial_buried": ["deepnorth"],  # cofre enterrado de los lugares memoriales
    "Pickable_Hairstrands01": ["mountain"],      # Cuevas heladas
    "Pickable_Hairstrands02": ["mountain"],
}

# El bioma de la progresión de lo que sueltan criaturas sin hábitat: el pollo
# nace de huevos que vende Haldor tras Yagluth (Llanuras); el pegote de escarcha
# sale de la Bombabosa: Escarcha, que pide un trofeo de draco (Montaña).
FROM_TIER: dict[str, str] = {"Chicken": "plains", "Hen": "plains", "BlobFrost": "mountain"}


def apply(items: dict) -> None:
    for pid, it in items.items():
        it["sources"] = [s for s in it["sources"] if (pid, s["kind"], s.get("from")) not in DROP_SOURCES
                         and not (s["kind"] == "drop" and s.get("from") in HIDE_CREATURES)]
        for s in it["sources"]:
            if not s.get("biomes") and s.get("from") in FROM_BIOMES:
                s["biomes"] = list(FROM_BIOMES[s["from"]])
            if not s.get("biomes") and s.get("from") in FROM_TIER:
                s["tier"] = FROM_TIER[s["from"]]
    for pid, extra in EXTRA_SOURCES.items():
        if pid in items:
            items[pid]["sources"] += [dict(s, wiki=True) for s in extra]


# El camino por defecto del Planificador (2026-09-25) donde el primero no es el
# de siempre. Wiki "Iron": sale de la chatarra de las criptas hundidas y de los
# montículos de barro del Pantano (el mineral de hierro, sólo de meteoritos y
# del hierro de pantano). Wiki "Coal": con madera en el horno de carbón.
PLANNER_PREFER: dict[str, str] = {"Iron": "from:IronScrap", "Coal": "from:Wood"}

# Variantes que el juego llama igual que la base pero que ZoTaD quiere ver
# aparte (2026-09-25: "faltan los draugr arqueros"). Wiki "Draugr": el 25 % sale
# con arco; mismo hábitat que el Draugr.
CREATURE_NAMES: dict[str, dict] = {"Draugr_Ranged": {"en": "Draugr Archer", "es": "Draugr arquero"}}


# Criaturas que están en los datos pero no aparecen en una partida normal
# (2026-09-28, revisado en los archivos del juego y en la wiki de weirdgloop):
# "El Vacío" (Ghost_old) sólo sale de la ubicación TheDarkestHole, desactivada;
# el Frysling no lo coloca ninguna ubicación, mazmorra ni lista de apariciones;
# el Riktig fuling (Goblin_Gem) tiene su evento desactivado y sólo sale por
# consola; el Thungr suelto (GoblinBrute_Hildir) quedó de sobra: la Torre
# sellada usa "Zil y Thungr". El otro "El Vacío" (Ghost_Void) no lo genera
# ningún spawner (el de TheDarkestHole genera a Ghost_old) y su cuchillo, el
# Voidcaller, tiene la receta desactivada (wiki de weirdgloop, "Voidcaller").
# Mostrarlos sin bioma confundía.
HIDE_CREATURES: set[str] = {"Ghost_old", "Ghost_Void", "Frysling", "Goblin_Gem", "GoblinBrute_Hildir"}


# Objetos que están en los datos pero no se consiguen en una partida normal
# (2026-09-28, revisado en los archivos del juego y en la wiki de weirdgloop):
# el metal antiguo y el mineral de metal brillante son restos de antes de la
# Tierra de Ceniza sin uso ni fuente; la escama de faucesoseas, el escudo de
# caballero y el farol con capucha de mano no los da nada; el pico de piedra y
# el escudo de hierro tienen la receta desactivada; la arbalesta es la de los
# dvergr (la del jugador es otra); las llaves de Hildir no abren nada y su cofre
# nunca aparece; el Voidcaller sólo lo soltaba El Vacío, que no aparece; la
# seta azul no está implementada (Weird Gloop "Blue mushroom").
HIDE_ITEMS: set[str] = {'Flametal', 'FlametalOre', 'BonemawSerpentScale', 'PickaxeStone', 'ShieldIronSquare', 'ShieldKnight', 'DvergerArbalest', 'Lantern_hooded', 'HildirKey_forestcrypt', 'HildirKey_mountaincave', 'HildirKey_plainsfortress', 'KnifeVoid', 'MushroomBlue'}
