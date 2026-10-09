"""
Lo que la pestaña Granjas necesita y el cliente no trae como dato: está en el código del juego (C# compilado a IL2CPP).
Sale del decompilado público github.com/MillionthOdin16/RustChangelog (rama `release`, commit 8d288b3, 2024-08-03).
Cada número dice de qué archivo sale. Si un parche cambia la genética, se revisa acá a mano.
"""

# `GrowableGenetics.GeneType` (GrowableGenetics.cs): el orden del enum, que es el de `GrowableGeneProperties.Weights`
# en el cliente. Las letras salen de `GrowableGene.GetDisplayCharacter` y los buenos de `GrowableGene.IsPositive`.
GENE_ORDER = ["X", "W", "G", "Y", "H"]
GENE_POSITIVE = {"X": False, "W": False, "G": True, "Y": True, "H": True}

# GrowableGenetics.cs: 6 casilleros y el radio de la cruza (1,5 m, `Vis.Entities` desde la planta central).
GENE_SLOTS = 6
CROSSBREED_RADIUS = 1.5

# GrowableEntity.cs (constantes de la clase).
GROWTH_PER_G = 0.25        # growthGeneSpeedMultiplier: la etapa avanza 1 + 0,25 × G más rápido
YIELD_PER_Y = 0.25         # yieldGeneBonusMultiplier: el rendimiento de la etapa de fruto × (1 + 0,25 × Y)
WATER_PER_W = 0.1          # waterGeneRequirementMultiplier: el agua que toma × (1 + 0,1 × W)
HARDINESS_GROUND = 0.2     # hardinessGeneModifierBonus: + 0,2 de calidad de suelo por H (sólo fuera de jardinera)
HARDINESS_TEMP = 0.05      # hardinessGeneTemperatureModifierBonus: + 0,05 de calidad de temperatura por H
PLANTER_GROUND = 0.6       # planterGroundModifierBase: el suelo de una jardinera
FERTILIZER_GROUND = 0.4    # fertilizerGroundModifierBonus: + 0,4 con abono
CLONES_PER_2Y = 1          # TakeClones: BaseCloneCount + Y / 2 (división entera)
MARKET_PER_GENE = 10       # CalculateMarketValue: + 10 por gen bueno, − 10 por gen malo

# ConVar/Server.cs (valores por defecto del servidor).
PLANT_TICK = 60            # server.planttick: segundos entre actualizaciones; `lifeLength` va en minutos de juego
CEILING_LIGHT_RANGE = 3    # server.ceilingLightGrowableRange (m)
HEAT_RANGE = 4             # server.artificialTemperatureGrowableRange (m)
OPTIMAL_SATURATION = 0.6   # server.optimalPlanterQualitySaturation: la jardinera rinde al máximo al 60 % de agua
COMPOST_INTERVAL = 300     # server.composterUpdateInterval: cada 5 min el compostador gasta 1 objeto por ranura

# Objetos del juego cuyo GameObject no se llama como su shortname (y no están en `farming/items.json` ni en
# `io/items.json` de la caché): el compostador y las plantas los nombran por GameObject.
GO_TO_SHORTNAME = {
    "cloth": "cloth",
    "SinglePlantPot": "plantpot.single",
    "bread": "bread.loaf",
    "briochebread": "bread.brioche.loaf",
    "briocheBread": "bread.brioche.loaf",
    "picklejar": "jar.pickle",
    "smalltrout": "fish.troutsmall",
    "black raspberries": "black.raspberries",
    "meat.fish.spoiled": "fish.spoiled",
    "meat.pork.raw": "meat.boar",
    "meat.pork.spoiled": "porkmeat.spoiled",
    "fish_raw": "fish.raw",
    "fish_cooked": "fish.cooked",
    "minnows": "fish.minnows",
    "spoiled_produce": "spoiled.produce",
    "apple_spoiled": "apple.spoiled",
    "bone_fragments": "bone.fragments",
}
