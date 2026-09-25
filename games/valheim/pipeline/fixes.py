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
DROP_SOURCES: set[tuple[str, str, str]] = {("Vineberry", "farm", "VineGreen_sapling")}


def apply(items: dict) -> None:
    for pid, it in items.items():
        it["sources"] = [s for s in it["sources"] if (pid, s["kind"], s.get("from")) not in DROP_SOURCES]
    for pid, extra in EXTRA_SOURCES.items():
        if pid in items:
            items[pid]["sources"] += [dict(s, wiki=True) for s in extra]


# El camino por defecto del Planificador (2026-09-25) donde el primero no es el
# de siempre. Wiki "Iron": sale de la chatarra de las criptas hundidas y de los
# montículos de barro del Pantano (el mineral de hierro, sólo de meteoritos y
# del hierro de pantano). Wiki "Coal": con madera en el horno de carbón.
PLANNER_PREFER: dict[str, str] = {"Iron": "from:IronScrap", "Coal": "from:Wood"}
