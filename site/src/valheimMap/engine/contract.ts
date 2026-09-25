/**
 * El contrato del motor del mapa de Valheim (2026-09-24).
 *
 * El motor reproduce el generador de mundo del juego (1.0) a partir de la
 * semilla, portado de Valheim-SeedLab (MIT, © 2026 DoomMachine; ver NOTICE.md).
 * El visor (`../`) sólo depende de estas firmas: así se pueden trabajar por
 * separado y el motor corre igual en el hilo principal y en un Web Worker.
 *
 * Coordenadas del juego: x hacia el este, z hacia el norte, en metros; el
 * centro del mundo es (0, 0) y el radio jugable 10.000 m (borde 10.500 m).
 */

/** Los biomas como los guarda el juego (`Heightmap.Biome`), una máscara de bits. */
export const BIOME = {
  None: 0, Meadows: 1, Swamp: 2, Mountain: 4, BlackForest: 8, Plains: 16,
  AshLands: 32, DeepNorth: 64, Ocean: 256, Mistlands: 512,
} as const;

export interface World {
  /** El número que el juego saca de la semilla de texto (`GetStableHashCode`). */
  readonly seed: number;
  /** El bioma en (x, z), como `WorldGenerator.GetBiome(x, z)`. */
  biome(x: number, z: number): number;
  /** La altura final en (x, z), como `WorldGenerator.GetHeight` (incluye ríos). */
  height(x: number, z: number): number;
  /** El factor de bosque en (x, z) (`GetForestFactor`), 0 a ~1.5: menor = más bosque. */
  forest(x: number, z: number): number;
}

/** Crea el mundo de una semilla de texto ("hnBd9gJf2G"), lista para consultar. */
export type CreateWorld = (seedName: string) => World;

/** Un lugar ubicado por el juego. `candidate`: uno de los posibles (Haldor, Hildir, la bruja). */
export interface PlacedLocation {
  prefab: string;
  x: number;
  y: number;
  z: number;
  candidate?: boolean;
}
