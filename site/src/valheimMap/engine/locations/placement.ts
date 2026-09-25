// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Locations/LocationPlacementEngine.cs y PlacementResult.cs
/**
 * `ZoneSystem.GenerateLocationsTimeSliced`: dónde pone el juego cada altar,
 * mercader, cripta, cueva, aldea, pozo de brea… de un mundo nuevo.
 *
 * Cada tipo abre su propio Random sembrado con `seed + hash(prefab)`, sortea
 * zonas candidatas hasta tener `m_quantity` o gastar sus 60.000 / 12.000
 * intentos, y prueba hasta seis puntos por zona aceptada con once filtros en
 * orden fijo. La contabilidad de sorteos es lo que un port suele errar:
 * por intento, dos enteros por vuelta de GetRandomZone (tipos "centro primero")
 * o uno de bioma (si la máscara tiene varios) + uno de índice; por punto, dos
 * floats; y todo punto que pasa los filtros 1-5 gasta además 20 sorteos en
 * GetTerrainDelta, pase o no.
 *
 * SeedLab lo comparó con tres mundos generados por el juego: 12.228/12.228
 * lugares de un mundo recién creado (zona, prefab y x/y/z iguales bit a bit) y
 * 12.314 y 12.287 de dos mundos jugados.
 *
 * Lo que NO es función de la semilla (ver limits.md de SeedLab): cuál de los
 * candidatos de un tipo único sobrevive (el primero cuya zona se genera), la
 * rotación de cada lugar y el contenido de sus cofres.
 */
import { getForestFactor, type WorldGenerator } from "../generator";
import { UMathf } from "../unityMath";
import { UnityRandom } from "../unityRandom";
import {
  getBiomeSector, getRandomPointByBiomes, getRandomPointByBiomesAboveSeaLevel, type BiomeField,
} from "./biomeField";
import { GRID_SIZE, mapToWorld } from "./biomeGrid";
import { sectorBlocksLocation, sectorHasAltBiome, type AltBiomeAssignment } from "./altBiomes";
import type { LocationEntry, LocationTable } from "./table";
import {
  getRandomPointInZone, getRandomZone, lengthXZ, magnitude3, out, sqrMagnitude3, toShort, zoneKey, zoneOf,
} from "./zoneMath";

const F = Math.fround;
const PI_F = F(Math.PI); // MathF.PI

/** Por qué se descartó una zona o un punto (los contadores de cada tipo). */
export const REJECT = {
  None: 0, ZoneOccupied: 1, ZoneAlreadyGenerated: 2, BiomeArea: 3, CenterDistance: 4, Biome: 5,
  Altitude: 6, Forest: 7, DistanceFromCenter: 8, TerrainDelta: 9, Similar: 10, NotSimilar: 11,
  Vegetation: 12, AltBiomeMissing: 13, AltBiomeBlock: 14, SurroundBaseline: 15, SurroundBelowCutoff: 16,
  Accepted: 17,
} as const;
const REJECT_COUNT = 18;

/** Un lugar ubicado: lo que el juego escribe en la partida de un mundo nuevo. */
export interface LocationInstance {
  readonly entry: LocationEntry;
  readonly prefab: string;
  /** Posición en float32; y = `GetHeight` (lo que guarda la partida, no el suelo final). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly zoneX: number;
  readonly zoneY: number;
  readonly orderedIndex: number;
  readonly attempt: number;
}

/** El resultado de un tipo: `placed` es el contador del juego ("placed N out of M"). */
export interface LocationTypeResult {
  readonly entry: LocationEntry;
  readonly orderedIndex: number;
  readonly streamSeed: number;
  skippedAsUnique: boolean;
  placed: number;
  registered: number;
  registerCollisions: number;
  attempts: number;
  iterations: number;
  readonly rejections: Int32Array;
}

export interface PlacementResult {
  readonly seed: number;
  readonly instances: LocationInstance[];
  readonly types: LocationTypeResult[];
  /**
   * Los tipos únicos (Haldor, Hildir, la bruja…) con sus candidatos. Si hay más
   * de uno, cuál queda depende de qué zona se genera primero: no es predecible.
   */
  readonly uniqueCandidates: { entry: LocationEntry; candidates: LocationInstance[] }[];
}

export interface PlacementOptions {
  /** Avisa después de cada tipo (183 en total). */
  onProgress?: (done: number, total: number) => void;
  /** Cortar después de este índice de `table.ordered` (inclusive). */
  stopAfterOrderedIndex?: number;
}

/**
 * Corre la colocación completa. `gen` es el mundo tal como queda al crearse:
 * usa `world.fork("pregeneration")` (así la hace `placeLocations`).
 */
export function runPlacement(
  gen: WorldGenerator, field: BiomeField, alts: AltBiomeAssignment, table: LocationTable,
  options: PlacementOptions = {},
): PlacementResult {
  if (field.grid.seed !== gen.seed) {
    throw new Error(`La grilla es de la semilla ${field.grid.seed} y el generador de ${gen.seed}.`);
  }
  const eng = new Engine(gen, field, alts);
  const total = table.ordered.length;
  let last = options.stopAfterOrderedIndex ?? total - 1;
  if (last >= total) last = total - 1;
  const types: LocationTypeResult[] = [];
  for (let oi = 0; oi <= last; oi++) {
    types.push(eng.runOne(table.ordered[oi], oi));
    options.onProgress?.(oi + 1, last + 1);
  }
  const uniqueCandidates: PlacementResult["uniqueCandidates"] = [];
  for (const t of types) {
    if (!t.entry.unique) continue;
    const c = eng.instances.filter((i) => i.entry === t.entry);
    if (c.length > 0) uniqueCandidates.push({ entry: t.entry, candidates: c });
  }
  return { seed: gen.seed, instances: eng.instances, types, uniqueCandidates };
}

class Engine {
  readonly instances: LocationInstance[] = [];
  private readonly byZone = new Map<number, LocationInstance>();
  private readonly idCache = new Map<string, LocationInstance[]>();
  private readonly groupCache = new Map<string, LocationInstance[]>();
  private readonly maxGroupCache = new Map<string, LocationInstance[]>();
  private readonly countByPrefab = new Map<string, number>();
  /** `ZoneSystem.s_tempVeg`: se vacía por tipo y nunca se recorta (la base del filtro 11). */
  private readonly tempVeg: number[] = [];

  constructor(private readonly gen: WorldGenerator, private readonly field: BiomeField, private readonly alts: AltBiomeAssignment) {}

  runOne(loc: LocationEntry, orderedIndex: number): LocationTypeResult {
    const res: LocationTypeResult = {
      entry: loc, orderedIndex, streamSeed: (this.gen.seed + loc.nameHash) | 0,
      skippedAsUnique: false, placed: 0, registered: 0, registerCollisions: 0, attempts: 0, iterations: 0,
      rejections: new Int32Array(REJECT_COUNT),
    };
    const rnd = new UnityRandom(res.streamSeed);
    const maxRadius = loc.maxRadius;
    let placed = this.countByPrefab.get(loc.prefabName) ?? 0;
    let maxRange = 10000;
    this.tempVeg.length = 0;

    if (loc.unique && placed > 0) {
      res.skippedAsUnique = true;
      res.placed = placed;
      return res;
    }
    if (loc.centerFirst) maxRange = loc.minDistance;

    const before = this.instances.length;
    let i = 0;
    while (i < loc.attempts && placed < loc.quantity) {
      let zx: number, zy: number;
      if (loc.centerFirst) {
        getRandomZone(rnd, maxRange);
        zx = out.zx;
        zy = out.zy;
        maxRange = F(maxRange + 1); // DESPUÉS del sorteo: el intento k usa minDistance + k
      } else {
        const p = !(loc.minAltitude < 0)
          ? getRandomPointByBiomesAboveSeaLevel(this.field, rnd, loc.biome)
          : getRandomPointByBiomes(this.field, rnd, loc.biome);
        // GetZone(MapSpaceToWorldSpace(punto)): el índice y de la grilla es la Z del mundo.
        zx = zoneOf(mapToWorld(p & (GRID_SIZE - 1)));
        zy = zoneOf(mapToWorld(p >> 11));
      }

      if (this.byZone.has(zoneKey(zx, zy))) {
        res.rejections[REJECT.ZoneOccupied]++;
      } else {
        // GetZoneCenter: la zona × 64 como short, lo que recibe GetBiomeArea(Vector2s).
        const area = this.gen.getBiomeArea(toShort(zx * 64), toShort(zy * 64));
        if ((loc.biomeArea & area) === 0) {
          res.rejections[REJECT.BiomeArea]++;
        } else {
          for (let j = 0; j < 6; j++) {
            res.iterations++;
            if (this.tryPoint(loc, rnd, zx, zy, maxRadius, res, i, orderedIndex)) {
              placed++;
              break;
            }
          }
        }
      }
      i++;
    }
    res.attempts = i;
    res.placed = placed;
    res.registered = this.instances.length - before;
    return res;
  }

  /** Un punto. True si se aceptó (el llamador suma `placed` aunque el registro choque, como el juego). */
  private tryPoint(loc: LocationEntry, rnd: UnityRandom, zx: number, zy: number, maxRadius: number,
    res: LocationTypeResult, attempt: number, orderedIndex: number): boolean {
    const gen = this.gen;
    // Dos sorteos float, siempre, antes de cualquier filtro.
    getRandomPointInZone(rnd, zx, zy, maxRadius);
    const px = out.px;
    const pz = out.pz;

    // Filtro 1: distancia al origen (la y todavía es 0).
    const magnitude = magnitude3(px, 0, pz);
    if ((loc.minDistance !== 0 && magnitude < loc.minDistance) || (loc.maxDistance !== 0 && magnitude > loc.maxDistance)) {
      res.rejections[REJECT.CenterDistance]++;
      return false;
    }

    // Filtro 2: el bioma CRUDO en el punto (no el de la grilla de 12 m).
    const biome = gen.getBiome(px, pz);
    if ((loc.biome & biome) === 0) {
      res.rejections[REJECT.Biome]++;
      return false;
    }

    // Filtro 3: altitud. De acá salen p.y y la máscara (se lee YA: GetTerrainDelta la pisa).
    // GetHeight = GetBiomeHeight(GetBiome(p)); el bioma ya está calculado y es puro.
    const py = gen.getBiomeHeight(biome, px, pz);
    const maskA = gen.maskA;
    const alt = F(py - 30.0);
    if (alt < loc.minAltitude || alt > loc.maxAltitude) {
      res.rejections[REJECT.Altitude]++;
      return false;
    }

    // Filtro 4: factor de bosque (estático, sin semilla).
    if (loc.inForest) {
      const ff = getForestFactor(px, py, pz);
      if (ff < loc.forestTresholdMin || ff > loc.forestTresholdMax) {
        res.rejections[REJECT.Forest]++;
        return false;
      }
    }

    // Filtro 5: el segundo par de distancias, con Utils.LengthXZ (no Vector3.magnitude).
    if (loc.minDistanceFromCenter > 0 || loc.maxDistanceFromCenter > 0) {
      const d = lengthXZ(px, pz);
      if ((loc.minDistanceFromCenter > 0 && d < loc.minDistanceFromCenter)
        || (loc.maxDistanceFromCenter > 0 && d > loc.maxDistanceFromCenter)) {
        res.rejections[REJECT.DistanceFromCenter]++;
        return false;
      }
    }

    // Filtro 6: desnivel. DIEZ insideUnitCircle siempre, con radio m_exteriorRadius (no maxRadius).
    const delta = gen.getTerrainDelta(rnd, px, py, pz, loc.exteriorRadius);
    if (delta > loc.maxTerrainDelta || delta < loc.minTerrainDelta) {
      res.rejections[REJECT.TerrainDelta]++;
      return false;
    }

    // Filtro 7: demasiado cerca de algo parecido.
    if (loc.minDistanceFromSimilar > 0 && this.haveLocationInRange(loc.assetKey, loc.group, px, py, pz, loc.minDistanceFromSimilar, false)) {
      res.rejections[REJECT.Similar]++;
      return false;
    }
    // Filtro 8: no lo bastante cerca de algo parecido (también mira el mismo prefab).
    if (loc.maxDistanceFromSimilar > 0 && !this.haveLocationInRange(loc.assetKey, loc.groupMax, px, py, pz, loc.maxDistanceFromSimilar, true)) {
      res.rejections[REJECT.NotSimilar]++;
      return false;
    }

    // Filtro 9: el alfa de la máscara. Vale 1 por defecto (Color.black), 0 en el Norte
    // profundo y calculado en Niebla y Ceniza.
    if ((loc.minimumVegetation > 0 && maskA <= loc.minimumVegetation)
      || (loc.maximumVegetation < 1 && maskA >= loc.maximumVegetation)) {
      res.rejections[REJECT.Vegetation]++;
      return false;
    }

    // Filtros 10a / 10b: variantes de bioma del sector de 12 m donde cae el punto.
    const sector = getBiomeSector(this.field, px, pz).index;
    if (loc.altBiomeParent !== null && !sectorHasAltBiome(this.alts, sector, loc.altBiomeParent)) {
      res.rejections[REJECT.AltBiomeMissing]++;
      return false;
    }
    if (sectorBlocksLocation(this.alts, sector, loc.name)) {
      res.rejections[REJECT.AltBiomeBlock]++;
      return false;
    }

    // Filtro 11: vegetación alrededor. Sin sorteos, pero 6 × capas GetHeight.
    if (loc.surroundCheckVegetation) {
      let score = 0;
      const dist = loc.surroundCheckDistance;
      for (let layer = 0; layer < loc.surroundCheckLayers; layer++) {
        const r = F(((layer + 1) / loc.surroundCheckLayers) * dist);
        for (let k = 0; k < 6; k++) {
          const f = F((k / 6.0) * PI_F * 2.0);
          const vx = F(px + F(UMathf.sin(f) * r));
          const vz = F(pz + F(UMathf.cos(f) * r));
          gen.getHeight(vx, vz);
          // El anillo de afuera pesa 0: ahí r == distancia.
          const w = F((dist - r) / (dist * 2.0));
          score = F(score + gen.maskA * w);
        }
      }
      this.tempVeg.push(score);
      if (this.tempVeg.length < 10) {
        // Los primeros nueve puntos que llegan acá, de cada TIPO, se tiran siempre.
        res.rejections[REJECT.SurroundBaseline]++;
        return false;
      }
      const max = maxOf(this.tempVeg);
      const avg = averageOf(this.tempVeg);
      const cutoff = F(avg + (max - avg) * loc.surroundBetterThanAverage);
      if (score < cutoff) {
        res.rejections[REJECT.SurroundBelowCutoff]++;
        return false;
      }
    }

    res.rejections[REJECT.Accepted]++;
    this.register(loc, px, py, pz, res, orderedIndex, attempt);
    return true;
  }

  /**
   * `RegisterLocation`: la zona se recalcula DESDE EL PUNTO. Si está ocupada, el
   * juego avisa y no registra, pero el llamador igual cuenta el lugar.
   */
  private register(loc: LocationEntry, x: number, y: number, z: number, res: LocationTypeResult, orderedIndex: number, attempt: number): void {
    const zx = zoneOf(x);
    const zy = zoneOf(z);
    const key = zoneKey(zx, zy);
    if (this.byZone.has(key)) {
      res.registerCollisions++;
      return;
    }
    const inst: LocationInstance = { entry: loc, prefab: loc.prefabName, x, y, z, zoneX: zx, zoneY: zy, orderedIndex, attempt };
    this.byZone.set(key, inst);
    this.instances.push(inst);
    addTo(this.idCache, loc.assetKey, inst);
    addTo(this.groupCache, loc.group, inst); // también la clave vacía
    addTo(this.maxGroupCache, loc.groupMax, inst);
    this.countByPrefab.set(loc.prefabName, (this.countByPrefab.get(loc.prefabName) ?? 0) + 1);
  }

  /**
   * `HaveLocationInRange`: distancia 3D y estricta, y las dos posiciones llevan su
   * altura de GetHeight (el relieve participa: no lo pases a 2D).
   */
  private haveLocationInRange(assetKey: string, group: string, px: number, py: number, pz: number, radius: number, maxGroup: boolean): boolean {
    const r2 = radius * radius;
    const anyWithin = (l: LocationInstance[] | undefined): boolean => {
      if (!l) return false;
      for (let i = 0; i < l.length; i++) {
        const sqr = sqrMagnitude3(F(l[i].x - px), F(l[i].y - py), F(l[i].z - pz));
        if (sqr < r2) return true;
      }
      return false;
    };
    if (anyWithin(this.idCache.get(assetKey))) return true;
    if (group.length > 0 && !maxGroup && anyWithin(this.groupCache.get(group))) return true;
    if (group.length > 0 && maxGroup && anyWithin(this.maxGroupCache.get(group))) return true;
    return false;
  }
}

function addTo(map: Map<string, LocationInstance[]>, key: string, inst: LocationInstance): void {
  let l = map.get(key);
  if (!l) {
    l = [];
    map.set(key, l);
  }
  l.push(inst);
}

/** `Enumerable.Max` sobre floats (con su manejo de NaN). */
function maxOf(v: number[]): number {
  let m = v[0];
  for (let i = 1; i < v.length; i++) if (v[i] > m || Number.isNaN(m)) m = v[i];
  return m;
}

/** `Enumerable.Average` sobre floats: suma en DOUBLE, devuelve float. */
function averageOf(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i];
  return F(sum / v.length);
}
