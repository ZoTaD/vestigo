// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Locations/AltBiomes.cs
/**
 * `AltBiomeWorldData.GenerateAltBiomes` y `BiomeSector.CanAddModifier`: qué
 * sectores de bioma reciben cada variante (Pantano con chozas, Llanura de la
 * muerte, Montaña fortaleza…). Algunos lugares sólo existen dentro de su
 * variante (filtro 10a) y otras variantes bloquean lugares (filtro 10b).
 *
 * SeedLab lo comparó contra el volcado del juego: las 32 variantes en los mismos
 * sectores y en el mismo orden. El estado por mundo vive en el resultado, no
 * en las entradas: se puede asignar muchas semillas con la misma tabla.
 */
import { BIOME } from "../contract";
import { indexToBiome } from "../biome";
import { UnityRandom } from "../unityRandom";
import type { BiomeField, BiomeSector } from "./biomeField";
import type { AltBiomeEntry } from "./table";

/** `Random.InitState(seed + 920)` al principio de GenerateAltBiomes. */
const GLOBAL_SEED_OFFSET = 920;

export interface AltBiomeAssignment {
  readonly altBiomes: readonly AltBiomeEntry[];
  /** Por variante (mismo índice que `altBiomes`): sus sectores, en orden de `AddModifier`. */
  readonly sectorsOf: number[][];
  readonly validPlacementSectors: number[];
  readonly validPlacementSectorCombos: number[];
  /** Por sector: las variantes que recibió (índices en `altBiomes`), en orden. */
  readonly ofSector: number[][];
}

/** `Enum.HasFlag`: `(value & flag) == flag`, true si flag es 0. */
function hasFlag(value: number, flag: number): boolean {
  return (value & flag) === flag;
}

/**
 * `GenerateAltBiomes`. En orden: el `InitState(seed + 920)` que no sirve de nada;
 * un recorrido por las DOCE claves (con None, Land y All); por cada par
 * (clave, variante) un `InitState(clave + hash + seed)` y un Fisher-Yates EN SU
 * LUGAR de la lista de sectores de la clave (la siguiente variante recorre la
 * lista ya barajada); y un sorteo float por sector examinado mientras la
 * variante no llegó a su máximo, aunque después falle CanAddModifier.
 * Las listas de sectores del campo no se tocan: se baraja una copia.
 */
export function assignAltBiomes(field: BiomeField, altBiomes: readonly AltBiomeEntry[], worldSeed: number): AltBiomeAssignment {
  const rnd = new UnityRandom((worldSeed + GLOBAL_SEED_OFFSET) | 0);
  const n = altBiomes.length;
  const sectorsOf: number[][] = altBiomes.map(() => []);
  const validPlacementSectors = new Array<number>(n).fill(0);
  const validPlacementSectorCombos = new Array<number>(n).fill(0);
  const ofSector: number[][] = field.sectors.map(() => []);
  const result: AltBiomeAssignment = { altBiomes, sectorsOf, validPlacementSectors, validPlacementSectorCombos, ofSector };

  const keyLists = field.byKey.map((info) => info.sectors.slice());
  for (let ki = 0; ki < field.byKey.length; ki++) {
    const key = field.byKey[ki].biome;
    const list = keyLists[ki];
    // AltBiomeList.GetValidAltBiomes: habilitada y con el bit de la clave.
    const valid: number[] = [];
    for (let a = 0; a < n; a++) if (altBiomes[a].enabled && hasFlag(altBiomes[a].biome, key)) valid.push(a);
    for (const a of valid) validPlacementSectorCombos[a]++;
    for (const a of valid) {
      const alt = altBiomes[a];
      rnd.initState((key + alt.nameHash + worldSeed) | 0);
      shuffle(list, rnd);
      for (const si of list) {
        if (sectorsOf[a].length >= alt.maxAmountSpawned) continue; // lleno: ya no sortea
        const r = rnd.rangeFloat(0, 1);
        const s = field.sectors[si];
        if ((sectorsOf[a].length < alt.minAmountSpawned || alt.chance >= r) && canAddModifier(field, result, s, a)) {
          validPlacementSectors[a]++;
          sectorsOf[a].push(si);
          ofSector[si].push(a);
        }
      }
    }
  }
  return result;
}

/** `Utils.Shuffle`: Fisher-Yates desde el final, Count-1 sorteos enteros. */
function shuffle(list: number[], rnd: UnityRandom): void {
  for (let n = list.length - 1; n > 0; n--) {
    const i = rnd.rangeInt(0, n + 1);
    const t = list[n];
    list[n] = list[i];
    list[i] = t;
  }
}

/**
 * `BiomeSector.CanAddModifier`, en el orden del juego y con sus dos errores de
 * vecinos (en 1.0.15 ninguna variante los alcanza: todas tienen
 * requireNeighbor y notNeighbor en None): `requireNeighbor` distinto de None
 * devuelve SIEMPRE false (la vuelta i = 0 exige un vecino de bioma None), y
 * `notNeighbor` prueba el bit del índice j pero compara con el bioma `j`.
 */
function canAddModifier(field: BiomeField, asg: AltBiomeAssignment, sector: BiomeSector, a: number): boolean {
  const m = asg.altBiomes[a];
  if (sector.distanceFromCenter < m.minDistanceFromCenter) return false;
  if (sector.edgeCount < m.minEdgeSize) return false;
  if (sector.edgeCount >= m.maxEdgeSize) return false;
  if (sector.heightAvg < m.minAvgHeight || sector.heightAvg >= m.maxAvgHeight) return false;
  if ((m.aboveWorldX !== 0 && sector.centerX < m.aboveWorldX)
    || (m.belowWorldX !== 0 && sector.centerX > m.belowWorldX)
    || (m.aboveWorldY !== 0 && sector.centerY < m.aboveWorldY)
    || (m.belowWorldY !== 0 && sector.centerY > m.belowWorldY)) return false;

  const present = asg.ofSector[sector.index];
  for (const p of present) {
    for (const s of asg.altBiomes[p].incompatibleAltBiomes) if (s === m.name) return false;
  }
  for (const s of m.incompatibleAltBiomes) {
    for (const p of present) if (asg.altBiomes[p].name === s) return false;
  }

  if (m.requireNeighbor !== BIOME.None) {
    for (let i = 0; i < 10; i++) {
      if (!hasFlag(m.requireNeighbor, indexToBiome(i))) continue;
      let found = false;
      for (const ni of sector.neighbors) {
        if (field.sectors[ni].biome === i) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
  }

  if (m.notNeighbor !== BIOME.None) {
    for (let j = 0; j < 10; j++) {
      if (!hasFlag(m.notNeighbor, indexToBiome(j))) continue;
      for (const ni of sector.neighbors) if (field.sectors[ni].biome === j) return false;
    }
  }
  return true;
}

/** ¿El sector tiene la variante de ese nombre? (filtro 10a) */
export function sectorHasAltBiome(asg: AltBiomeAssignment, sectorIndex: number, name: string): boolean {
  for (const a of asg.ofSector[sectorIndex]) if (asg.altBiomes[a].name === name) return true;
  return false;
}

/** ¿Alguna variante del sector bloquea ese `m_name`? (filtro 10b) */
export function sectorBlocksLocation(asg: AltBiomeAssignment, sectorIndex: number, locationName: string): boolean {
  for (const a of asg.ofSector[sectorIndex]) {
    for (const s of asg.altBiomes[a].blockLocationNames) if (s === locationName) return true;
  }
  return false;
}
