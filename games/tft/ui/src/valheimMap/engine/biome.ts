// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.WorldGen/Biome.cs
/**
 * Conversiones entre el bit de bioma (`Heightmap.Biome`, ver `BIOME` en
 * contract.ts) y el índice que guarda el juego (`Heightmap.BiomeIndex`, un
 * byte 0-9). Las grillas de bioma usan el índice para caber en un Uint8Array.
 */
import { BIOME } from "./contract";

/** Todos los biomas (`Biome.All`) y los de tierra (`Biome.Land`), como máscara. */
export const BIOME_ALL = 895;
export const BIOME_LAND = 639;

/** `Heightmap.BiomeIndex`: None 0, Meadows 1 … Mistlands 9. */
export const BIOME_INDEX = {
  None: 0, Meadows: 1, Swamp: 2, Mountain: 3, BlackForest: 4, Plains: 5,
  AshLands: 6, DeepNorth: 7, Ocean: 8, Mistlands: 9,
} as const;

// Del índice al bit; una tabla para no ramificar por punto.
const INDEX_TO_BIOME = new Uint16Array([
  BIOME.None, BIOME.Meadows, BIOME.Swamp, BIOME.Mountain, BIOME.BlackForest, BIOME.Plains,
  BIOME.AshLands, BIOME.DeepNorth, BIOME.Ocean, BIOME.Mistlands,
]);

/** El bit de bioma a su índice del juego; -1 si no es un bioma simple (el juego tira excepción). */
export function biomeToIndex(b: number): number {
  switch (b) {
    case BIOME.None: return 0;
    case BIOME.Meadows: return 1;
    case BIOME.Swamp: return 2;
    case BIOME.Mountain: return 3;
    case BIOME.BlackForest: return 4;
    case BIOME.Plains: return 5;
    case BIOME.AshLands: return 6;
    case BIOME.DeepNorth: return 7;
    case BIOME.Ocean: return 8;
    case BIOME.Mistlands: return 9;
    default: return -1;
  }
}

/** El índice del juego (0-9) a su bit de bioma. */
export function indexToBiome(i: number): number {
  return i >= 0 && i < 10 ? INDEX_TO_BIOME[i] : BIOME.None;
}
