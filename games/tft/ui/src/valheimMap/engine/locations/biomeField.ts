// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Locations/BiomeField.cs
/**
 * `AltBiomeWorldData` después de `GenerateSectors`: la grilla partida en
 * sectores (manchas conexas de un bioma), las listas de puntos por bioma y los
 * sorteos de punto al azar que usa la ubicación de lugares.
 *
 * La rareza que decide cada sorteo: sólo `tryFill` agrega puntos a las listas,
 * y el punto semilla de cada mancha lo empuja el barrido de afuera, así que
 * FALTA un punto por mancha de cada bioma no global. SeedLab midió que
 * "arreglarlo" baja la reproducción de 12.228/12.228 lugares a 2.788. No lo toques.
 * Ceniza, Norte profundo y Océano no se rellenan: un sector global cada uno.
 */
import { BIOME } from "../contract";
import { BIOME_ALL, BIOME_LAND, BIOME_INDEX, indexToBiome } from "../biome";
import { vec2Distance } from "../unityMath";
import type { UnityRandom } from "../unityRandom";
import { GRID_SIZE, GRID_POINTS, mapToWorld, worldToMap, type BiomeGrid } from "./biomeGrid";
import { zoneOf } from "./zoneMath";

const F = Math.fround;

/** Lista de enteros que crece sola (sin un objeto por punto). */
export class IntList {
  data: Int32Array;
  length = 0;
  constructor(capacity = 16) {
    this.data = new Int32Array(capacity);
  }
  push(v: number): void {
    if (this.length === this.data.length) {
      const d = new Int32Array(this.data.length * 2);
      d.set(this.data);
      this.data = d;
    }
    this.data[this.length++] = v;
  }
  get(i: number): number {
    return this.data[i];
  }
}

/** Un `BiomeSector`. Se identifica por su índice en `BiomeField.sectors` (nunca cambia). */
export interface BiomeSector {
  readonly index: number;
  readonly biome: number;
  edgeCount: number;
  /** Suma float de las coordenadas de borde y, al final, el centro en el mundo. */
  centerX: number;
  centerY: number;
  /** Los Vector2 arrancan en (0, 0), no en ±infinito: la caja siempre contiene el origen (del juego). */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minZoneX: number;
  heightMin: number;
  heightMax: number;
  heightAvg: number;
  distanceFromCenter: number;
  /** Índices de sectores vecinos: a lo sumo UNO por punto de borde (el `||` corta). */
  readonly neighbors: number[];
}

/** `BiomeTypeInfo`: sectores y puntos de un bioma. Los puntos van empaquetados `y · 2048 + x`. */
export interface BiomeTypeInfo {
  readonly biome: number;
  /** Índices en `BiomeField.sectors`, en orden de creación (la asignación de variantes baraja una copia). */
  readonly sectors: number[];
  readonly allPoints: IntList;
  readonly allPointsAboveSeaLevel: IntList;
}

/**
 * Las claves de `AltBiomeWorldData.Biomes` en el orden de `Enum.GetValues`
 * (ascendente), que es el que recorre `GenerateAltBiomes`. Doce: `None`,
 * `Land` y `All` existen con listas vacías, y `None` importa porque
 * `HasFlag(None)` es true para toda máscara.
 */
export const BIOME_KEY_ORDER = [
  BIOME.None, BIOME.Meadows, BIOME.Swamp, BIOME.Mountain, BIOME.BlackForest, BIOME.Plains,
  BIOME.AshLands, BIOME.DeepNorth, BIOME.Ocean, BIOME.Mistlands, BIOME_LAND, BIOME_ALL,
];

export interface BiomeField {
  readonly grid: BiomeGrid;
  /** Sector de cada punto de la grilla. */
  readonly pointSectors: Int32Array;
  readonly sectors: BiomeSector[];
  /** Las doce claves, en `BIOME_KEY_ORDER`. */
  readonly byKey: BiomeTypeInfo[];
  /** Del bit de bioma a su info. */
  readonly lookup: Map<number, BiomeTypeInfo>;
}

/** `GenerateSectors`, pasos A-F (la asignación de variantes va aparte: ver altBiomes.ts). */
export function buildBiomeField(grid: BiomeGrid): BiomeField {
  const size = GRID_SIZE;
  const pb = grid.biomes;
  const ph = grid.heights;

  const byKey: BiomeTypeInfo[] = BIOME_KEY_ORDER.map((biome) => ({
    biome, sectors: [], allPoints: new IntList(1024), allPointsAboveSeaLevel: new IntList(1024),
  }));
  // Del índice del juego (0-9) a su info; Land y All no tienen índice.
  const byIndex: BiomeTypeInfo[] = [];
  for (let i = 0; i < 10; i++) byIndex[i] = byKey[i];

  const sectors: BiomeSector[] = [];
  const pointSectors = new Int32Array(GRID_POINTS);
  const visited = new Uint8Array(GRID_POINTS);

  const newSector = (biomeIndex: number): BiomeSector => {
    const s: BiomeSector = {
      index: sectors.length, biome: indexToBiome(biomeIndex), edgeCount: 0,
      centerX: 0, centerY: 0, minX: 0, minY: 0, maxX: 0, maxY: 0, minZoneX: 0,
      heightMin: F(99999), heightMax: F(-99999), heightAvg: 0, distanceFromCenter: 0, neighbors: [],
    };
    sectors.push(s);
    byIndex[biomeIndex].sectors.push(s.index);
    return s;
  };

  // ---- Paso A: los tres sectores globales, en este orden (0, 1, 2).
  const globalFor = new Int32Array(10).fill(-1);
  globalFor[BIOME_INDEX.AshLands] = newSector(BIOME_INDEX.AshLands).index;
  globalFor[BIOME_INDEX.DeepNorth] = newSector(BIOME_INDEX.DeepNorth).index;
  globalFor[BIOME_INDEX.Ocean] = newSector(BIOME_INDEX.Ocean).index;

  // ---- Paso B: barrido por filas; Ceniza / Norte profundo / Océano van a su sector global.
  for (let k = 0; k < GRID_POINTS; k++) {
    const g = globalFor[pb[k]];
    if (g < 0) continue;
    pointSectors[k] = g;
    visited[k] = 1;
    const info = byIndex[pb[k]];
    info.allPoints.push(k);
    if (ph[k] >= 30) info.allPointsAboveSeaLevel.push(k);
  }

  // ---- Paso C: relleno DFS 4-conexo del resto. Empuja +x, -x, +y, -y; saca LIFO.
  // El punto semilla NUNCA entra en las listas (ver arriba).
  let stack = new Int32Array(1024);
  let sp = 0;
  for (let k0 = 0; k0 < GRID_POINTS; k0++) {
    if (visited[k0]) continue;
    visited[k0] = 1;
    const s = newSector(pb[k0]);
    const si = s.index;
    pointSectors[k0] = si;
    const info = byIndex[pb[k0]];
    const all = info.allPoints;
    const above = info.allPointsAboveSeaLevel;
    stack[sp++] = k0;
    while (sp > 0) {
      const p = stack[--sp];
      const pBiome = pb[p];
      const px = p & (size - 1);
      const py = p >> 11;
      for (let dir = 0; dir < 4; dir++) {
        let n: number;
        if (dir === 0) {
          if (px + 1 >= size) continue;
          n = p + 1;
        } else if (dir === 1) {
          if (px - 1 < 0) continue;
          n = p - 1;
        } else if (dir === 2) {
          if (py + 1 >= size) continue;
          n = p + size;
        } else {
          if (py - 1 < 0) continue;
          n = p - size;
        }
        if (visited[n] || pb[n] !== pBiome) continue;
        visited[n] = 1;
        pointSectors[n] = si;
        all.push(n);
        if (ph[n] >= 30) above.push(n);
        if (sp === stack.length) {
          const bigger = new Int32Array(stack.length * 2);
          bigger.set(stack);
          stack = bigger;
        }
        stack[sp++] = n;
      }
    }
  }

  // ---- Paso D: bordes, sólo el interior; vecinos en orden -x, +x, -y, +y y se queda
  // el PRIMERO distinto (el `||` corta).
  for (let y = 1; y < size - 1; y++) {
    const rowBase = y * size;
    for (let x = 1; x < size - 1; x++) {
      const k = rowBase + x;
      const self = pointSectors[k];
      let item = pointSectors[k - 1];
      if (item === self) {
        item = pointSectors[k + 1];
        if (item === self) {
          item = pointSectors[k - size];
          if (item === self) {
            item = pointSectors[k + size];
            if (item === self) continue;
          }
        }
      }
      const s = sectors[self];
      const h = ph[k];
      s.edgeCount++;
      s.centerX = F(s.centerX + x); // `Vector2 +=`: una suma float por punto
      s.centerY = F(s.centerY + y);
      if (x < s.minX) s.minX = x;
      if (x > s.maxX) s.maxX = x;
      if (y < s.minY) s.minY = y;
      if (y > s.maxY) s.maxY = y;
      if (!s.neighbors.includes(item)) s.neighbors.push(item);
      if (h < s.heightMin) s.heightMin = h;
      if (h > s.heightMax) s.heightMax = h;
    }
  }

  // ---- Paso E: de coordenadas de mapa a mundo, sólo con EdgeCount > 0.
  for (const info of byKey) {
    for (const si of info.sectors) {
      const s = sectors[si];
      if (s.edgeCount <= 0) continue;
      s.centerX = mapToWorld(F(s.centerX / s.edgeCount));
      s.centerY = mapToWorld(F(s.centerY / s.edgeCount));
      s.minX = mapToWorld(s.minX);
      s.minY = mapToWorld(s.minY);
      s.maxX = mapToWorld(s.maxX);
      s.maxY = mapToWorld(s.maxY);
      // GetZone(new Vector3(Min.x, Min.y)): el segundo argumento cae en Y y GetZone lee Z.
      s.minZoneX = zoneOf(s.minX);
      s.heightAvg = F(F(s.heightMin + s.heightMax) / 2);
    }
  }

  // ---- Paso F: la distancia al centro, para TODOS los sectores (también los sin borde).
  for (const s of sectors) s.distanceFromCenter = vec2Distance(s.centerX, s.centerY, 0, 0);

  const lookup = new Map<number, BiomeTypeInfo>();
  for (const info of byKey) lookup.set(info.biome, info);
  return { grid, pointSectors, sectors, byKey, lookup };
}

/**
 * `WorldGenerator.GetBiomeSector(x, z)`: el sector del punto de la grilla que
 * contiene (x, z), con la coordenada recortada a [0, 2047].
 */
export function getBiomeSector(field: BiomeField, worldX: number, worldZ: number): BiomeSector {
  let gx = worldToMap(worldX);
  let gy = worldToMap(worldZ);
  if (gx < 0) gx = 0;
  if (gy < 0) gy = 0;
  if (gx >= GRID_SIZE) gx = GRID_SIZE - 1;
  if (gy >= GRID_SIZE) gy = GRID_SIZE - 1;
  return field.sectors[field.pointSectors[gy * GRID_SIZE + gx]];
}

/**
 * `RandomBiomeFromBiomes`, con sus DOS errores (los dos cambian el resultado,
 * medido por SeedLab): el sorteo es `Range(0, n - 1)` con máximo exclusivo (el
 * último casillero nunca sale), el casillero de Llanura devuelve BOSQUE NEGRO y
 * el que devuelve Océano prueba el bit de PRADERA. Sin sorteo si la máscara
 * tiene 0 o 1 bits.
 */
export function randomBiomeFromBiomes(rnd: UnityRandom, biome: number): number {
  const m = biome;
  if ((m & (m - 1)) === 0) return biome;
  let num = 0;
  if (m & BIOME.Meadows) num++;
  if (m & BIOME.Swamp) num++;
  if (m & BIOME.Mountain) num++;
  if (m & BIOME.BlackForest) num++;
  if (m & BIOME.Plains) num++;
  if (m & BIOME.AshLands) num++;
  if (m & BIOME.DeepNorth) num++;
  if (m & BIOME.Ocean) num++;
  if (m & BIOME.Mistlands) num++;
  let n2 = rnd.rangeInt(0, num - 1);
  if (m & BIOME.Meadows && n2-- === 0) return BIOME.Meadows;
  if (m & BIOME.Swamp && n2-- === 0) return BIOME.Swamp;
  if (m & BIOME.Mountain && n2-- === 0) return BIOME.Mountain;
  if (m & BIOME.BlackForest && n2-- === 0) return BIOME.BlackForest;
  if (m & BIOME.Plains && n2-- === 0) return BIOME.BlackForest; // sic
  if (m & BIOME.AshLands && n2-- === 0) return BIOME.AshLands;
  if (m & BIOME.DeepNorth && n2-- === 0) return BIOME.DeepNorth;
  if (m & BIOME.Meadows && n2-- === 0) return BIOME.Ocean; // sic: prueba Pradera
  return BIOME.Mistlands;
}

function pointByBiome(field: BiomeField, rnd: UnityRandom, b: number): number {
  const info = field.lookup.get(b)!;
  if (info.allPoints.length === 0) {
    throw new Error(`No hay puntos de ${b}: el juego sortearía Range(0, 0) y fallaría al indexar.`);
  }
  return info.allPoints.get(rnd.rangeInt(0, info.allPoints.length));
}

/** `GetRandomPointByBiomes`: un sorteo de bioma (si la máscara tiene varios) y uno de índice. */
export function getRandomPointByBiomes(field: BiomeField, rnd: UnityRandom, biome: number): number {
  return pointByBiome(field, rnd, randomBiomeFromBiomes(rnd, biome));
}

/**
 * `GetRandomPointByBiomesAboveSeaLevel`: si la lista sobre el mar está vacía,
 * cae a la completa. Los sorteos son los mismos en los dos casos.
 */
export function getRandomPointByBiomesAboveSeaLevel(field: BiomeField, rnd: UnityRandom, biome: number): number {
  const b = randomBiomeFromBiomes(rnd, biome);
  const above = field.lookup.get(b)!.allPointsAboveSeaLevel;
  if (above.length === 0) return pointByBiome(field, rnd, b);
  return above.get(rnd.rangeInt(0, above.length));
}
