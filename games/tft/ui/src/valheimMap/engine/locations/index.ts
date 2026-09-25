// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Locations/WorldLocations.cs (ver ../NOTICE.md)
/**
 * La ubicación de lugares de un mundo: grilla de biomas 2048² → sectores →
 * variantes de bioma → colocación de los 183 tipos, como el juego al crear el
 * mundo. Todo puro y sin DOM: corre en un Web Worker.
 *
 * Costo: la grilla (4,2 M puntos de bioma + altura) y la colocación. La grilla
 * se puede repartir por bandas entre workers (`computeGridBand` +
 * `assembleGrid` + `placeLocationsFromGrid`); el resto va en un solo hilo
 * (el relleno de sectores y la colocación son secuenciales por naturaleza).
 */
import type { PlacedLocation } from "../contract";
import { WorldGenerator } from "../generator";
import { stableSeed } from "../stableHash";
import { assignAltBiomes, type AltBiomeAssignment } from "./altBiomes";
import { buildBiomeField, type BiomeField } from "./biomeField";
import { assembleGrid, computeGridBand, gridBands, type BiomeGrid, type BiomeGridBand } from "./biomeGrid";
import { runPlacement, type PlacementResult } from "./placement";
import { altBiomesFromJson, locationTableFromJson, type AltBiomeEntry, type LocationTable } from "./table";

export { computeGridBand, assembleGrid, gridBands, buildBiomeGrid, mapToWorld, worldToMap, GRID_SIZE } from "./biomeGrid";
export type { BiomeGrid, BiomeGridBand } from "./biomeGrid";
export { buildBiomeField, getBiomeSector, randomBiomeFromBiomes, BIOME_KEY_ORDER } from "./biomeField";
export type { BiomeField, BiomeSector, BiomeTypeInfo } from "./biomeField";
export { assignAltBiomes, sectorHasAltBiome, sectorBlocksLocation } from "./altBiomes";
export type { AltBiomeAssignment } from "./altBiomes";
export { runPlacement, REJECT } from "./placement";
export type { PlacementResult, LocationInstance, LocationTypeResult, PlacementOptions } from "./placement";
export { locationTableFromJson, altBiomesFromJson } from "./table";
export type { LocationTable, LocationEntry, AltBiomeEntry, LocationDef, AltBiomeDef } from "./table";
export * as ZoneMath from "./zoneMath";

/** El JSON tal cual de `games/valheim/data/map/{locations,altbiomes,meta}.json`. */
export interface LocationTables { locations: unknown; altbiomes: unknown; meta: unknown }

/** Las tablas ya leídas (se leen una vez por objeto JSON y se reusan). */
export interface ParsedTables {
  readonly table: LocationTable;
  readonly altBiomes: AltBiomeEntry[];
  /** `World.m_worldGenVersion` de los datos (2 en 1.0). */
  readonly worldGenVersion: number;
}

const parsedCache = new WeakMap<object, ParsedTables>();

/** Lee y valida las tablas (con caché por objeto `locations`). */
export function parseTables(tables: LocationTables): ParsedTables {
  const key = tables.locations as object;
  const hit = parsedCache.get(key);
  if (hit) return hit;
  const meta = tables.meta as { worldGenVersion?: number } | null;
  const parsed: ParsedTables = {
    table: locationTableFromJson(tables.locations),
    altBiomes: altBiomesFromJson(tables.altbiomes),
    worldGenVersion: meta?.worldGenVersion ?? 2,
  };
  parsedCache.set(key, parsed);
  return parsed;
}

/** Todo lo que cuesta armar por semilla, reutilizable para varias corridas. */
export interface WorldLocationsState {
  readonly field: BiomeField;
  readonly alts: AltBiomeAssignment;
}

/** Sectores + variantes de bioma a partir de la grilla. */
export function prepareWorldLocations(grid: BiomeGrid, altBiomes: AltBiomeEntry[]): WorldLocationsState {
  const field = buildBiomeField(grid);
  return { field, alts: assignAltBiomes(field, altBiomes, grid.seed) };
}

/**
 * Pasa el resultado detallado a lo que muestra el visor. `candidate`: los
 * tipos únicos (Haldor, Hildir, la bruja…) con más de una posición posible:
 * el juego se queda con una sola, la primera cuya zona genera un jugador.
 */
export function toPlacedLocations(result: PlacementResult): PlacedLocation[] {
  const multi = new Set(result.uniqueCandidates.filter((u) => u.candidates.length > 1).map((u) => u.entry));
  return result.instances.map((i) => {
    const p: PlacedLocation = { prefab: i.prefab, x: i.x, y: i.y, z: i.z };
    if (multi.has(i.entry)) p.candidate = true;
    return p;
  });
}

/**
 * La colocación completa con una grilla ya calculada (p. ej. juntada desde
 * bandas de varios workers con `assembleGrid`). `world` es el generador de la
 * semilla; se usa un fork con la caché de ríos como la dejó la pregeneración,
 * el estado con que SeedLab reprodujo al juego.
 */
export function placeDetailedFromGrid(
  world: WorldGenerator, grid: BiomeGrid, tables: LocationTables,
  onProgress?: (done: number, total: number) => void,
): PlacementResult {
  const parsed = parseTables(tables);
  const state = prepareWorldLocations(grid, parsed.altBiomes);
  return runPlacement(world.fork("pregeneration"), state.field, state.alts, parsed.table, { onProgress });
}

export function placeLocationsFromGrid(
  world: WorldGenerator, grid: BiomeGrid, tables: LocationTables,
  onProgress?: (done: number, total: number) => void,
): PlacedLocation[] {
  return toPlacedLocations(placeDetailedFromGrid(world, grid, tables, onProgress));
}

/** Cuántas bandas usa la grilla en un solo hilo (sólo para ir avisando el progreso). */
const SERIAL_BANDS = 16;

/**
 * Todo en este hilo: la grilla (por bandas, para avisar el progreso) y la
 * colocación. El progreso cuenta 16 bandas + un paso por tipo de lugar.
 */
export function placeDetailed(
  world: WorldGenerator, tables: LocationTables,
  onProgress?: (done: number, total: number) => void,
): PlacementResult {
  const parsed = parseTables(tables);
  const types = parsed.table.ordered.length;
  const total = SERIAL_BANDS + types;
  const bands: BiomeGridBand[] = [];
  for (const [y0, y1] of gridBands(SERIAL_BANDS)) {
    bands.push(computeGridBand(world, y0, y1));
    onProgress?.(bands.length, total);
  }
  const grid = assembleGrid(world.seed, bands);
  return placeDetailedFromGrid(world, grid, tables, (done) => onProgress?.(SERIAL_BANDS + done, total));
}

/** `placeLocations(world, tables, onProgress)`: los lugares de un mundo, en un solo hilo. */
export function placeLocations(
  world: WorldGenerator, tables: LocationTables,
  onProgress?: (done: number, total: number) => void,
): PlacedLocation[] {
  return toPlacedLocations(placeDetailed(world, tables, onProgress));
}

/** La firma que usa el visor: de la semilla de texto a los lugares, en un solo hilo. */
export function placeForSeed(
  seedName: string, tables: LocationTables,
  onProgress?: (done: number, total: number) => void,
): PlacedLocation[] {
  const version = parseTables(tables).worldGenVersion;
  return placeLocations(new WorldGenerator(stableSeed(seedName), { version }), tables, onProgress);
}
