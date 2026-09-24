"""
Los biomas del juego, que en los datos son una máscara de bits (`Heightmap.Biome`).

Leído del juego el 2026-09-24: los aparecedores de criaturas y la vegetación
guardan `m_biome` como suma de estos bits. El Norte profundo (64) es el de la
1.0. El orden de la lista es el de la progresión del juego, no el de los bits.
"""
BIOMES: list[tuple[int, str, str]] = [
    (1, "meadows", "biome_meadows"),
    (8, "blackforest", "biome_blackforest"),
    (2, "swamp", "biome_swamp"),
    (4, "mountain", "biome_mountain"),
    (16, "plains", "biome_plains"),
    (256, "ocean", "biome_ocean"),
    (512, "mistlands", "biome_mistlands"),
    (32, "ashlands", "biome_ashlands"),
    (64, "deepnorth", "biome_deepnorth"),
]

BIOME_ORDER = [bid for _, bid, _ in BIOMES]


def biomes_of(mask: int) -> list[str]:
    """En el orden de progresión del juego (el de `BIOMES`), no en el de los bits."""
    return [bid for bit, bid, _ in BIOMES if mask & bit]


def is_everywhere(mask: int) -> bool:
    """
    Siete biomas o más: un evento o una aparición especial, no un hábitat.

    Medido: Carbonizados, Elaking y Jotun traen máscaras de 7 a 9 bits y
    aparecían "viviendo" en las Praderas.
    """
    return sum(1 for bit, _, _ in BIOMES if mask & bit) >= 7
