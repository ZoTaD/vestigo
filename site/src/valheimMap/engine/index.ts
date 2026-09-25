// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — ver NOTICE.md
/**
 * El motor del mapa de Valheim: el generador de mundo del juego (1.0, versión
 * de mundo 2) portado bit a bit. El visor usa `createWorld` (el contrato); el
 * resto queda exportado para portar la ubicación de lugares (`SeedLab.Locations`).
 */
import type { CreateWorld, World } from "./contract";
import { F } from "./unityMath";
import { stableSeed } from "./stableHash";
import { WorldGenerator, getForestFactor } from "./generator";

export * from "./contract";
export { stableSeed, stableHashCode, stableHashLanes } from "./stableHash";
export {
  WorldGenerator, BIOME_AREA, WATER_EDGE, WORLD_SIZE, HEIGHT_MULTIPLIER, ASHLANDS_MIN_DISTANCE, ASHLANDS_Y_OFFSET,
  worldAngle, isAshlands, isDeepnorth, createAshlandsGap, createDeepNorthGap, deepNorthWaveFade,
  getAshlandsOceanGradient, getForestFactor, inForest, riverCellKey,
} from "./generator";
export type { Vec2, River, RiverCell, PregenerationData, WorldGeneratorOptions } from "./generator";
export { UnityRandom, RANDOM_SCALE } from "./unityRandom";
export type { RandomState } from "./unityRandom";
export { perlinNoise, perlinNoise1D, noise as perlinNoiseRaw } from "./unityPerlin";
export { F, UMathf, UtilsMath, vec2Magnitude, vec2SqrMagnitude, vec2Distance, vec2Equals, roundHalfEven } from "./unityMath";
export * as DUtils from "./dUtils";
export { getCellular, getSimplexFractal } from "./fastNoise";
export { BIOME_INDEX, BIOME_ALL, BIOME_LAND, biomeToIndex, indexToBiome } from "./biome";
export {
  WATER_LEVEL, MAP_COLORS, DEFAULT_PAINT, gameColor, landColor, waterColor, lerpColor, scaleColor,
  lavaByte, fillColor, shadeFactor, paintPixel, paintGrid,
} from "./render";
export type { PaintOptions } from "./render";

/** Un `World` del contrato que además deja ver su generador (para lugares, ríos, lava…). */
export interface EngineWorld extends World {
  readonly generator: WorldGenerator;
}

/**
 * Crea el mundo de una semilla de texto. La pregeneración (lagos, ríos,
 * arroyos) se posterga hasta la primera altura: pedir sólo biomas es inmediato.
 * Las coordenadas se redondean a float, como las recibe el juego.
 */
export const createWorld: CreateWorld = (seedName: string): EngineWorld => createWorldFromSeed(stableSeed(seedName));

/** Lo mismo desde la semilla numérica (int32). */
export function createWorldFromSeed(seed: number, generator?: WorldGenerator): EngineWorld {
  const gen = generator ?? new WorldGenerator(seed, { deferPregeneration: true });
  // El visor pide bioma y después altura en el mismo punto: GetHeight volvería a
  // calcular el bioma, así que se recuerda el último (GetBiome es pura).
  let lastX = NaN;
  let lastZ = NaN;
  let lastBiome = 0;
  return {
    seed: gen.seed,
    generator: gen,
    biome(x: number, z: number): number {
      const fx = F(x), fz = F(z);
      lastBiome = gen.getBiome(fx, fz);
      lastX = fx;
      lastZ = fz;
      return lastBiome;
    },
    height(x: number, z: number): number {
      const fx = F(x), fz = F(z);
      const b = fx === lastX && fz === lastZ ? lastBiome : gen.getBiome(fx, fz);
      return gen.getBiomeHeight(b, fx, fz);
    },
    forest(x: number, z: number): number {
      return getForestFactor(F(x), 0, F(z));
    },
  };
}
