// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Locations/BiomeGrid.cs
/**
 * La grilla de 2048 × 2048 puntos de bioma y altura que el juego arma al cargar
 * un mundo (`AltBiomeWorldData.GenerateBiomePoints`): 12 m entre puntos,
 * `mundo = (índice - 1024) · 12 + 6`, igual que el minimapa.
 *
 * Índice plano `k = y · 2048 + x` (x = eje X del mundo, y = eje Z). Se puede
 * calcular por bandas de filas (en varios Web Workers) y juntar después: cada
 * banda usa su propio fork frío del generador, como SeedLab.
 *
 * Dos cortes distintos, los dos reproducidos: la grilla guarda Océano / -1000
 * donde `Vector2.sqrMagnitude > 110250000f`, y GetBiomeHeight devuelve -400
 * donde `DUtils.Length > 10500`. En el anillo fino donde discrepan queda -400.
 */
import type { WorldGenerator } from "../generator";
import { biomeToIndex, BIOME_INDEX } from "../biome";
import { vec2SqrMagnitude } from "../unityMath";

const F = Math.fround;

/** `AltBiomeWorldData.c_textureSize`. */
export const GRID_SIZE = 2048;
export const GRID_POINTS = GRID_SIZE * GRID_SIZE;
/** `WorldGenerator.waterEdgeSqr`: 10500², comparado contra Vector2.sqrMagnitude. */
const WATER_EDGE_SQR = F(110250000);
/** La altura guardada fuera de ese corte. */
export const GRID_OUTSIDE_HEIGHT = -1000;

/**
 * `MapSpaceToWorldSpace(v)`: en double con UN redondeo al final. Con enteros da
 * igual, pero no con el centro de un sector (que no es entero).
 */
export function mapToWorld(v: number): number {
  return F((v - 1024.0) * 12.0 + 6.0);
}

/** `WorldSpaceToMapSpace(x)`: `(int)((x - 6f) / 12f + 1024f)`, cast que trunca (no floor). */
export function worldToMap(x: number): number {
  return F(F(F(x - 6) / 12) + 1024) | 0;
}

export interface BiomeGrid {
  readonly seed: number;
  /** `Heightmap.BiomeIndex` por punto (0-9), no el bit. */
  readonly biomes: Uint8Array;
  /** Metros, nivel del mar en 30. */
  readonly heights: Float32Array;
}

/** Una banda de filas [y0, y1) ya calculada (lo que devuelve un worker). */
export interface BiomeGridBand {
  readonly y0: number;
  readonly y1: number;
  readonly biomes: Uint8Array;
  readonly heights: Float32Array;
}

// Las 2048 coordenadas son las mismas para los dos ejes.
const COORD = new Float32Array(GRID_SIZE);
for (let i = 0; i < GRID_SIZE; i++) COORD[i] = mapToWorld(i);

/**
 * Calcula las filas [y0, y1) con un fork frío de `gen` (cada banda el suyo:
 * la caché de ríos de un manejador no se comparte). `gen` tiene que ser el
 * mundo; si su pregeneración está postergada, la corre.
 */
export function computeGridBand(gen: WorldGenerator, y0: number, y1: number): BiomeGridBand {
  const w = gen.fork();
  const n = (y1 - y0) * GRID_SIZE;
  const biomes = new Uint8Array(n);
  const heights = new Float32Array(n);
  let k = 0;
  for (let y = y0; y < y1; y++) {
    const wz = COORD[y];
    for (let x = 0; x < GRID_SIZE; x++, k++) {
      const wx = COORD[x];
      if (vec2SqrMagnitude(wx, wz) > WATER_EDGE_SQR) {
        biomes[k] = BIOME_INDEX.Ocean;
        heights[k] = GRID_OUTSIDE_HEIGHT;
      } else {
        const b = w.getBiome(wx, wz);
        biomes[k] = biomeToIndex(b);
        heights[k] = w.getBiomeHeight(b, wx, wz);
      }
    }
  }
  return { y0, y1, biomes, heights };
}

/** Junta bandas (en cualquier orden) en la grilla completa. Falla si queda una fila sin calcular. */
export function assembleGrid(seed: number, bands: readonly BiomeGridBand[]): BiomeGrid {
  const biomes = new Uint8Array(GRID_POINTS);
  const heights = new Float32Array(GRID_POINTS);
  const done = new Uint8Array(GRID_SIZE);
  for (const b of bands) {
    biomes.set(b.biomes, b.y0 * GRID_SIZE);
    heights.set(b.heights, b.y0 * GRID_SIZE);
    for (let y = b.y0; y < b.y1; y++) done[y] = 1;
  }
  const missing = done.indexOf(0);
  if (missing >= 0) throw new Error(`Falta la fila ${missing} de la grilla de biomas.`);
  return { seed, biomes, heights };
}

/**
 * Cómo repartir la grilla en `parts` bandas parejas: [y0, y1) de cada una.
 * Las filas cerca de los polos cuestan menos (casi todo fuera del mundo).
 */
export function gridBands(parts: number): [number, number][] {
  const out: [number, number][] = [];
  const per = Math.ceil(GRID_SIZE / Math.max(1, parts));
  for (let y0 = 0; y0 < GRID_SIZE; y0 += per) out.push([y0, Math.min(GRID_SIZE, y0 + per)]);
  return out;
}

/** La grilla entera en este hilo. */
export function buildBiomeGrid(gen: WorldGenerator): BiomeGrid {
  return assembleGrid(gen.seed, [computeGridBand(gen, 0, GRID_SIZE)]);
}
