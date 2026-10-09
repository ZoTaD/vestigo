"""
Granjas, genética y animales de corral a la caché (`games/rust/cache/farming/`), 2026-10-08. Ver `cache_dump.py`.

Escribe `farming/<Clase>.json` con el typetree entero de cada instancia de `CLASSES`:
  - plantas: `PlantProperties` (genes por defecto, etapas con su duración, felicidad por hora del día y temperatura,
    agua, luz/suelo/temperatura óptimos, cosecha, semilla y clon), `GrowableGeneProperties` (los pesos de la cruza),
    `GrowableEntity` (el prefab de cada planta, con su `PlantProperties`), macetas y jardineras (`PlanterBox`), compost
    (`Composter`, `ItemModCompostable`), aspersor, calefactor y lámparas que afectan a las plantas;
  - animales: gallinero (`ChickenCoop`, `Chicken`, `FarmableAnimal`), colmena (`Beehive`, `NaturalBeehive`), ganado
    nuevo (`Cow`, `Sheep`, `LivestockSpecies`, tablas de venta, lana, patrones), caballos (`HorseBreed`, `RidableHorse`,
    `HorseModifiers`), comedero (`HitchTrough`) y generador de biocombustible;
  - `farming/items.json`: los objetos de granja (semillas, clones, abono, huevos, lana, miel, comederos...) con su
    nombre en/es y el typetree.

Uso, desde la raíz del repo (~2 min, ~12 GB de RAM; uno por vez):
    python games/rust/tools/extract_farming.py
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cache_dump import Dumper, rss_gb, write_json  # noqa: E402
from extract import read_content, text_of  # noqa: E402

CLASSES = {
    "PlantProperties", "GrowableGeneProperties", "GrowableEntity", "PlanterBox", "PlanterBoxStatic", "PlantSkin",
    "SocketMod_PlantCheck", "Composter", "ItemModCompostable", "Sprinkler", "ElectricalHeater", "CeilingLight",
    "WaterCatcherCollectRate", "UIGene", "UIGenesDisplay", "SeedInformationPanel",
    "ChickenCoop", "Chicken", "FarmableAnimal", "ChickenCoopStatusNeedWidget", "FeedEntry", "Beehive", "NaturalBeehive",
    "ItemModBeehiveNucleus", "BeeSwarmMaster", "BeeSwarmAI", "BiofuelGenerator",
    "Cow", "Sheep", "CowFSM", "LivestockSpecies", "LivestockSaleTable", "LivestockSpecialTable", "LivestockPattern",
    "LivestockPatternRange", "LivestockWoolRange", "LivestockWoolTint", "LivestockFleece", "LivestockVendor",
    "LivestockTrigger", "LivestockMountable", "LivestockCorpse", "LivestockSexParts", "LivestockTrophyAppearance",
    "LivestockGeneWidget", "LivestockGenesDisplay", "LivestockAnimalStatusWidget", "LivestockLineageWidget",
    "HorseBreed", "RidableHorse", "HorseModifiers", "HorseSpawner", "HitchTrough", "AnimalFence", "AnimalFenceGate",
    "NPCFarmAccess", "MissionObjective_Harvest",
}
ITEM_RE = re.compile(r"seed|clone|fertilizer|dung|egg|milk|wool|honey|bee|hemp|berry|corn|potato|pumpkin|wheat|rose|"
                     r"sunflower|orchid|planter|composter|coop|trough|chicken|sheep|cow|horse|fodder|hay|feed|"
                     r"sprinkler|livestock|saddle|plantfiber|mushroom|cactus", re.I)


def main():
    texts, _ = read_content()
    d = Dumper()
    print(f"[farming] bundles abiertos, RAM {rss_gb()} GB", flush=True)
    dumped = d.dump(CLASSES)
    for cls, entries in sorted(dumped.items()):
        write_json(f"farming/{cls}.json", entries)
    items = []
    for o, tt, _ in d.w.behaviours({"ItemDefinition"}):
        if o.assets_file.name.startswith("BuildPlayer") or not ITEM_RE.search(tt["shortname"]):
            continue  # las copias de la escena son iguales a las de items.preload
        tok, dtok = tt["displayName"]["token"], tt["displayDescription"]["token"]
        items.append({"sid": tt["shortname"], "hidden": bool(tt["hidden"]), "category": tt["category"],
                      "name": {"en": text_of(texts, "en", tok) or tt["displayName"]["english"], "es": text_of(texts, "es", tok)},
                      "desc": {"en": text_of(texts, "en", dtok) or tt["displayDescription"]["english"],
                               "es": text_of(texts, "es", dtok)},
                      "data": d.plain(o, tt)})
    items.sort(key=lambda i: i["sid"])
    write_json("farming/items.json", items)
    d.w.report_unresolved()
    print(f"[farming] listo: {sum(len(v) for v in dumped.values())} instancias de {len(dumped)} clases, "
          f"{len(items)} objetos; RAM {rss_gb()} GB", flush=True)


if __name__ == "__main__":
    main()
