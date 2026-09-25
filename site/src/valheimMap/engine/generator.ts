// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.WorldGen/WorldGeneratorPort.cs
/**
 * El `WorldGenerator` de Valheim 1.0.15 (versión de mundo 2), sentencia por
 * sentencia desde el port en C# de SeedLab, que coincide bit a bit con dos
 * mundos que el propio juego generó (bioma y altura en 4,2 M puntos cada uno).
 *
 * Aritmética: el IL del juego calcula en double y redondea a float al final de
 * cada sentencia, con los literales float ensanchados. Acá: `F` (Math.fround)
 * donde C# tiene `(float)` o una operación float, y double pelado donde C# es
 * double, en el mismo orden. Los literales "raros" (0.0020000000949949026…)
 * son floats ensanchados: se copian tal cual. No reordenes ni simplifiques:
 * varias fórmulas difieren de la obvia en un redondeo, y ése es el del juego.
 *
 * Los errores del juego se reproducen a propósito (el mundo depende de ellos):
 * la caché de ríos de una entrada que queda vieja, `Range(0, count)` en
 * FindRandomRiverEnd, la segunda pasada de arroyos que se descarta.
 *
 * Una instancia NO se comparte entre hilos (caché de ríos, memo de la altura
 * base): cada Web Worker crea la suya, o usa `fork()`.
 *
 * Omitido del original (no lo usa el sitio): el mundo del menú, `GetNormal` y
 * el bucle O(n²) de MergePoints (queda la versión con cubetas, probada igual).
 */
import { BIOME } from "./contract";
import { vec2Distance, vec2Equals, vec2Magnitude, UMathf, UtilsMath } from "./unityMath";
import { perlinNoise as unityPerlin } from "./unityPerlin";
import { UnityRandom, type RandomState } from "./unityRandom";
import * as DU from "./dUtils";
import { getCellular, getSimplexFractal } from "./fastNoise";

// `Math.fround` local y no importado: así el motor lo reconoce en el lazo caliente.
const F = Math.fround;

// ---------------------------------------------------------------------------
// Constantes (campos y literales del WorldGenerator)
// ---------------------------------------------------------------------------

export const ASHLANDS_MIN_DISTANCE = 12000;
export const ASHLANDS_Y_OFFSET = -4000;
export const WORLD_SIZE = 10000;
/** Radio del borde del agua: afuera, GetBiomeHeight devuelve -400 sin calcular nada. */
export const WATER_EDGE = 10500;
/** `GetHeightMultiplier()`: alturas normalizadas × 200 = metros. */
export const HEIGHT_MULTIPLIER = 200;

// Literales float del juego, ya redondeados (compararlos con un double cambia fronteras).
const F0_02 = F(0.02);
const F0_05 = F(0.05);
const F0_1 = F(0.1);
const F0_12 = F(0.12);
const F0_128 = F(0.128);
const F0_139 = F(0.139);
const F0_14 = F(0.14);
const F0_137 = F(0.137);
const F0_15 = F(0.15);
const F0_25 = F(0.25);
const F0_28 = F(0.28);
const F0_3 = F(0.3);
const F0_38 = F(0.38);
const F0_4 = F(0.4);
const F0_5 = F(0.5);
const F0_6 = F(0.6);
const F0_7 = F(0.7);
const F0_85 = F(0.85);
const F1_6 = F(1.6);
const F0_01 = F(0.01);
const FNEG0_2 = F(-0.2);
const F1EM5 = F(1e-5);
/** `Random.Range(0f, MathF.PI * 2f)` en FindStreamEndPoint: el float 6.2831854820251465. */
const TWO_PI_F = F(6.2831854820251465);
/**
 * El divisor del tope de montaña es la resta FLOAT 0.38f - 0.28f ensanchada
 * (0.099999994…), no (double)0.1f.
 */
const MOUNTAIN_CAP_DIVISOR = F0_38 - F0_28;

/** `WorldGenerator.RiverAdd`: qué arroyos dibuja cada pasada. */
const RIVER_ADD_ALL = 0;
const RIVER_ADD_SKIP_DEEP_NORTH = 1;
const RIVER_ADD_ONLY_DEEP_NORTH = 2;

/** `Heightmap.BiomeArea`: Edge 1, Median 2 (los lugares piden Everything = 3). */
export const BIOME_AREA = { Edge: 1, Median: 2, Everything: 3 } as const;

// Los ocho vecinos de GetBiomeArea (en metros, como Vector2s).
const BIOME_AREA_OFFSETS = [-64, -64, 64, -64, 64, 64, -64, 64, -64, 0, 64, 0, 0, -64, 0, 64];

/** Un punto del juego (Vector2 de floats). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** `WorldGenerator.River`: un río entre dos lagos, o un arroyo. y es la z del mundo. */
export interface River {
  p0x: number;
  p0y: number;
  p1x: number;
  p1y: number;
  centerX: number;
  centerY: number;
  widthMin: number;
  widthMax: number;
  curveWidth: number;
  curveWavelength: number;
}

/**
 * Los puntos de río de una celda de 64 m, aplanados de a cuatro:
 * [x, y, w, w2] (w2 = w² redondeado a float). El ORDEN importa: GetWeight suma
 * floats en ese orden.
 */
export type RiverCell = Float32Array;

/** Los datos de la pregeneración, para pasarlos a un Web Worker sin recalcular (ver `exportPregeneration`). */
export interface PregenerationData {
  lakes: Float32Array;
  /** 10 floats por río, en el orden de los campos de `River`. */
  rivers: Float32Array;
  streams: Float32Array;
  /** Celdas de ríos: `cellKeys[i]` (ver `riverCellKey`) con puntos en `points[cellStart[i]..cellStart[i+1])`. */
  cellKeys: Float64Array;
  cellStart: Uint32Array;
  points: Float32Array;
  /** La caché de una entrada como la dejó la pregeneración (vieja a propósito); gx = -999999 si está vacía. */
  cacheGx: number;
  cacheGy: number;
  cachePoints: Float32Array | null;
}

/** La clave numérica de una celda de 64 m (gx, gy), exacta en un double. */
export function riverCellKey(gx: number, gy: number): number {
  return (gx + 32768) * 65536 + (gy + 32768);
}

export interface WorldGeneratorOptions {
  /** `World.m_worldGenVersion`: 2 para todo mundo creado en 1.0. */
  version?: number;
  /**
   * Postergar lagos/ríos/arroyos hasta la primera altura que los necesite. Es
   * el MISMO mundo (las mismas llamadas desde el mismo estado del Random), pero
   * un consumidor que sólo pide biomas no paga la pregeneración.
   */
  deferPregeneration?: boolean;
}

// ---------------------------------------------------------------------------
// Funciones estáticas (no leen estado del mundo)
// ---------------------------------------------------------------------------

/** `DUtils.PerlinNoise(double, double)`: los dos redondeos a float son los que cuantizan cada coordenada. */
function PN(x: number, y: number): number {
  return unityPerlin(F(x), F(y));
}

/**
 * `WorldAngle`: TRES redondeos a float (después de Atan2, del ×20 y del Sin).
 * Ojo: Atan2(x, y), no (y, x). La ondulación de ±100 m de todos los anillos.
 */
export function worldAngle(wx: number, wy: number): number {
  // Memo de una entrada: GetBiome y los fosos de GetBiomeHeight la piden en el mismo
  // punto, y es pura (mismo argumento => mismo resultado), así que no cambia nada.
  if (wx === waX && wy === waY) return waV;
  waX = wx;
  waY = wy;
  waV = F(Math.sin(F(F(Math.atan2(wx, wy)) * 20.0)));
  return waV;
}
let waX = NaN;
let waY = NaN;
let waV = 0;

/**
 * `IsAshlands`: fuera de un círculo de 12.000 m (+ ondulación) centrado en
 * (0, +4000). Usa DUtils.Length y compara en DOUBLE, sin redondear la
 * ondulación: distinto de IsDeepnorth a propósito, no los unifiques.
 */
export function isAshlands(x: number, y: number, wa: number = worldAngle(x, y)): boolean {
  const a = wa * 100.0;
  return DU.length(x, F(y + ASHLANDS_Y_OFFSET)) > ASHLANDS_MIN_DISTANCE + a;
}

/** `IsDeepnorth`: el espejo al norte, pero con la ondulación en float y comparación float. */
export function isDeepnorth(x: number, y: number, wa: number = worldAngle(x, y)): boolean {
  const a = F(wa * 100.0);
  return vec2Magnitude(x, F(y + 4000.0)) > F(12000.0 + a);
}

/**
 * `CreateAshlandsGap`: 0 justo en el anillo de Ceniza, 1 a 400 m. Multiplica la
 * altura: cava el foso de mar delante del bioma. El `(float)` antes del
 * MathfLikeSmoothStep es real.
 */
export function createAshlandsGap(wx: number, wy: number, wa: number = worldAngle(wx, wy)): number {
  const a = wa * 100.0;
  let v = DU.length(wx, F(wy + ASHLANDS_Y_OFFSET)) - (ASHLANDS_MIN_DISTANCE + a);
  v = DU.clamp01(Math.abs(v) / 400.0);
  return DU.mathfLikeSmoothStep(0.0, 1.0, F(v));
}

/** `CreateDeepNorthGap`: el mismo foso frente al Norte profundo. */
export function createDeepNorthGap(wx: number, wy: number, wa: number = worldAngle(wx, wy)): number {
  const a = wa * 100.0;
  let v = DU.length(wx, F(wy + 4000)) - (12000.0 + a);
  v = DU.clamp01(Math.abs(v) / 400.0);
  return DU.mathfLikeSmoothStep(0.0, 1.0, F(v));
}

/** `DeepNorthWaveFade`: sin smoothstep, /200 y no /400. */
export function deepNorthWaveFade(wx: number, wy: number): number {
  const a = worldAngle(wx, wy) * 100.0;
  return DU.clamp01((DU.length(wx, F(wy + 4000)) - (12000.0 + a)) / 200.0);
}

/** `GetAshlandsOceanGradient`: la ondulación va evaluada en (x, y − 4000), desfasada a propósito. */
export function getAshlandsOceanGradient(x: number, y: number): number {
  const yy = F(y + ASHLANDS_Y_OFFSET);
  const a = worldAngle(x, yy) * 100.0;
  return F((DU.length(x, yy) - (ASHLANDS_MIN_DISTANCE + a)) / 300.0);
}

/**
 * `GetForestFactor`: estática y SIN semilla (el bosque es igual en todo mundo).
 * `pos * 0.01f * 0.4f` son dos productos float separados: no lo pliegues a 0.004f.
 * Menor = más bosque; el minimapa usa 0.8 (Pradera) y SmoothStep(1.1, 1.3) (Niebla).
 */
export function getForestFactor(x: number, _y: number, z: number): number {
  return DU.fbm(F(F(x * F0_01) * F0_4), F(F(z * F0_01) * F0_4), 3, F1_6, F0_7);
}

/** `InForest`. */
export function inForest(x: number, y: number, z: number): boolean {
  return getForestFactor(x, y, z) < F(1.15);
}

/** `GetRiverGrid`: la misma grilla de 64 m que las zonas. Devuelve gx (y escribe gy en `out`). */
function riverGridX(w: number): number {
  return UMathf.floorToInt(F((w + 32.0) / 64.0));
}

/** `InsideRiverGrid`: Math.Abs sobre floats. */
function insideRiverGrid(gx: number, gy: number, px: number, py: number, r: number): boolean {
  const cx = F(gx * 64.0);
  const cy = F(gy * 64.0);
  const dx = F(px - cx);
  const dy = F(py - cy);
  const lim = F(r + 32.0);
  if (Math.abs(dx) < lim) return Math.abs(dy) < lim;
  return false;
}

// ---------------------------------------------------------------------------
// El generador
// ---------------------------------------------------------------------------

export class WorldGenerator {
  readonly seed: number;
  readonly version: number;

  readonly offset0: number;
  readonly offset1: number;
  readonly offset2: number;
  readonly offset3: number;
  readonly offset4: number;
  readonly riverSeed: number;
  readonly streamSeed: number;

  // Los de `VersionSetup`: los valores de v2 son los iniciales.
  readonly minMountainDistance: number;
  readonly minDarklandNoise: number;
  readonly maxMarshDistance: number;

  // Lo de la pregeneración: inmutable una vez hecha, compartido entre forks.
  private lakes: Vec2[] | null = null;
  private rivers: River[] = [];
  private streams: River[] = [];
  private riverPoints = new Map<number, RiverCell>();
  private pregenPending = false;
  private pregenState: RandomState = [0, 0, 0, 0];

  // La caché de ríos de UNA entrada. Arranca en (-999999, -999999), que nunca acierta, y
  // RenderRivers NO la invalida (como el juego): la primera consulta puede leer un array viejo.
  private cachedGx = -999999;
  private cachedGy = -999999;
  private cachedPoints: RiverCell | null = null;
  // La caché tal como la dejó la pregeneración (la última sonda de arroyos). Con ella
  // `fork("pregeneration")` reproduce el manejador recién construido aunque éste ya haya
  // respondido otras consultas.
  private pgGx = -999999;
  private pgGy = -999999;
  private pgPoints: RiverCell | null = null;

  // Memo de una entrada de GetBaseHeight: es pura, y GetBiome y la altura del bioma la piden
  // en el mismo punto. No cambia ningún valor (misma entrada => misma salida).
  private bhX = NaN;
  private bhY = NaN;
  private bhV = 0;

  // Las cachés de GetBiomeArea (en el juego, estáticas y vaciadas por mundo).
  private cachedBiomes: Map<number, number> | null = null;
  private cachedBiomeAreas: Map<number, number> | null = null;

  /**
   * La máscara que deja la última `getBiomeHeight`/`getHeight` (el `out Color`
   * del juego). Por defecto Color.black = (0,0,0,1); sólo la cambian Niebla (a),
   * Norte profundo (g) y Ceniza (a = lava).
   */
  maskR = 0;
  maskG = 0;
  maskB = 0;
  maskA = 1;

  /** Salidas de `getTerrainDelta` (así no se asigna un objeto por llamada). */
  terrainDelta = 0;
  slopeX = 0;
  slopeY = 0;
  slopeZ = 0;

  /**
   * `WorldGenerator..ctor`. Siete sorteos, en este orden: off0, off1, off2, off3,
   * riverSeed, streamSeed, off4 (off4 ÚLTIMO, no es un error). Después, la
   * pregeneración (lagos → ríos → arroyos), salvo que se postergue.
   */
  constructor(seed: number, options: WorldGeneratorOptions = {}) {
    this.seed = seed | 0;
    this.version = options.version ?? 2;

    let minMountainDistance = 1000;
    let minDarklandNoise = F0_4;
    let maxMarshDistance = 6000;
    if (this.version <= 0) minMountainDistance = 1500;
    if (this.version <= 1) {
      minDarklandNoise = F0_5;
      maxMarshDistance = 8000;
    }
    this.minMountainDistance = minMountainDistance;
    this.minDarklandNoise = minDarklandNoise;
    this.maxMarshDistance = maxMarshDistance;

    // El juego guarda y restaura el Random global; acá cada mundo tiene el suyo.
    const rnd = new UnityRandom(this.seed);
    this.offset0 = rnd.rangeInt(-10000, 10000);
    this.offset1 = rnd.rangeInt(-10000, 10000);
    this.offset2 = rnd.rangeInt(-10000, 10000);
    this.offset3 = rnd.rangeInt(-10000, 10000);
    this.riverSeed = rnd.rangeInt(-2147483648, 2147483647);
    this.streamSeed = rnd.rangeInt(-2147483648, 2147483647);
    this.offset4 = rnd.rangeInt(-10000, 10000);

    if (options.deferPregeneration) {
      this.pregenPending = true;
      this.pregenState = rnd.getState();
    } else {
      this.pregenerate(rnd);
    }
  }

  /** `WorldGenerator.Pregenerate()`. */
  private pregenerate(rnd: UnityRandom): void {
    this.findLakes();
    this.rivers = this.placeRivers(rnd);
    this.streams = this.placeStreams(rnd, false);
    // La segunda pasada (Norte profundo) sí se dibuja, pero su lista se DESCARTA:
    // GetStreams() devuelve la de la primera.
    this.placeStreams(rnd, true);
    this.pgGx = this.cachedGx;
    this.pgGy = this.cachedGy;
    this.pgPoints = this.cachedPoints;
  }

  private ensurePregenerated(): void {
    if (!this.pregenPending) return;
    this.pregenPending = false;
    const rnd = new UnityRandom();
    rnd.setState(this.pregenState);
    this.pregenerate(rnd);
  }

  /** True mientras la pregeneración está postergada y nadie la pidió. */
  get pregenerationPending(): boolean {
    return this.pregenPending;
  }

  /** Corre ya la pregeneración postergada (para no pagarla en medio de otra cosa). */
  forcePregeneration(): void {
    this.ensurePregenerated();
  }

  /**
   * Otro manejador del mismo mundo, con su propia caché de ríos y su memo (para
   * otro hilo, o para aislar consultas). No repite la pregeneración.
   * `inheritRiverCache`: true copia la caché como está ahora; "pregeneration", como
   * la dejó la pregeneración (el estado de un mundo recién creado, el que SeedLab
   * usa para ubicar lugares); false, fría.
   */
  fork(inheritRiverCache: boolean | "pregeneration" = false): WorldGenerator {
    this.ensurePregenerated();
    const f = new WorldGenerator(this.seed, { version: this.version, deferPregeneration: true });
    f.pregenPending = false;
    f.lakes = this.lakes;
    f.rivers = this.rivers;
    f.streams = this.streams;
    f.riverPoints = this.riverPoints;
    f.pgGx = this.pgGx;
    f.pgGy = this.pgGy;
    f.pgPoints = this.pgPoints;
    if (inheritRiverCache === "pregeneration") {
      f.cachedGx = this.pgGx;
      f.cachedGy = this.pgGy;
      f.cachedPoints = this.pgPoints;
    } else if (inheritRiverCache) {
      f.cachedGx = this.cachedGx;
      f.cachedGy = this.cachedGy;
      f.cachedPoints = this.cachedPoints;
    }
    return f;
  }

  // -------------------------------------------------------------------------
  // Accesos a la pregeneración
  // -------------------------------------------------------------------------

  /** `GetLakes()`: las cuencas bajas (el mar abierto cuenta). No las modifiques. */
  getLakes(): readonly Vec2[] {
    this.ensurePregenerated();
    return this.lakes ?? [];
  }

  /** `GetRivers()`. Compartidos entre forks: trátalos como inmutables. */
  getRivers(): readonly River[] {
    this.ensurePregenerated();
    return this.rivers;
  }

  /**
   * `GetStreams()`: la lista de la PRIMERA pasada, que incluye arroyos del Norte
   * profundo que nunca se dibujaron y omite los que sí (rareza del juego).
   */
  getStreams(): readonly River[] {
    this.ensurePregenerated();
    return this.streams;
  }

  /** La grilla de puntos de río por celda de 64 m (clave: `riverCellKey`). No la modifiques. */
  getRiverPoints(): ReadonlyMap<number, RiverCell> {
    this.ensurePregenerated();
    return this.riverPoints;
  }

  /**
   * Todo lo que calculó la pregeneración, en arrays tipados (transferibles a un
   * Web Worker). Incluye la caché de ríos tal como la dejó la pregeneración, así
   * el otro lado responde exactamente igual que un manejador recién construido.
   */
  exportPregeneration(): PregenerationData {
    this.ensurePregenerated();
    const lakes = this.lakes ?? [];
    const lk = new Float32Array(lakes.length * 2);
    lakes.forEach((p, i) => {
      lk[2 * i] = p.x;
      lk[2 * i + 1] = p.y;
    });
    const packRivers = (list: River[]) => {
      const a = new Float32Array(list.length * 10);
      list.forEach((r, i) => {
        a.set([r.p0x, r.p0y, r.p1x, r.p1y, r.centerX, r.centerY, r.widthMin, r.widthMax, r.curveWidth, r.curveWavelength], i * 10);
      });
      return a;
    };
    let total = 0;
    for (const c of this.riverPoints.values()) total += c.length;
    const cellKeys = new Float64Array(this.riverPoints.size);
    const cellStart = new Uint32Array(this.riverPoints.size + 1);
    const points = new Float32Array(total);
    let i = 0;
    let at = 0;
    for (const [k, c] of this.riverPoints) {
      cellKeys[i] = k;
      cellStart[i] = at;
      points.set(c, at);
      at += c.length;
      i++;
    }
    cellStart[i] = at;
    return {
      lakes: lk,
      rivers: packRivers(this.rivers),
      streams: packRivers(this.streams),
      cellKeys,
      cellStart,
      points,
      cacheGx: this.pgGx,
      cacheGy: this.pgGy,
      cachePoints: this.pgPoints ? this.pgPoints.slice() : null,
    };
  }

  /** Reconstruye un mundo ya pregenerado (en otro Web Worker) sin volver a calcular ríos. */
  static fromPregeneration(seed: number, data: PregenerationData, version = 2): WorldGenerator {
    const g = new WorldGenerator(seed, { version, deferPregeneration: true });
    g.pregenPending = false;
    const lakes: Vec2[] = [];
    for (let i = 0; i < data.lakes.length; i += 2) lakes.push({ x: data.lakes[i], y: data.lakes[i + 1] });
    g.lakes = lakes;
    const unpack = (a: Float32Array): River[] => {
      const out: River[] = [];
      for (let i = 0; i < a.length; i += 10) {
        out.push({
          p0x: a[i], p0y: a[i + 1], p1x: a[i + 2], p1y: a[i + 3], centerX: a[i + 4], centerY: a[i + 5],
          widthMin: a[i + 6], widthMax: a[i + 7], curveWidth: a[i + 8], curveWavelength: a[i + 9],
        });
      }
      return out;
    };
    g.rivers = unpack(data.rivers);
    g.streams = unpack(data.streams);
    const map = new Map<number, RiverCell>();
    for (let i = 0; i < data.cellKeys.length; i++) {
      map.set(data.cellKeys[i], data.points.subarray(data.cellStart[i], data.cellStart[i + 1]));
    }
    g.riverPoints = map;
    g.cachedGx = g.pgGx = data.cacheGx;
    g.cachedGy = g.pgGy = data.cacheGy;
    g.cachedPoints = g.pgPoints = data.cachePoints;
    return g;
  }

  // -------------------------------------------------------------------------
  // Lagos
  // -------------------------------------------------------------------------

  /**
   * `FindLakes`: sin Random. Pasos de 128 m sobre [-10000, 10000] (157 × 157
   * candidatos). El radio usa Vector2.magnitude y la altura DUtils.Length: las
   * dos precisiones conviven a propósito.
   */
  private findLakes(): void {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let z = -10000; z <= 10000; z = F(z + 128.0)) {
      for (let x = -10000; x <= 10000; x = F(x + 128.0)) {
        if (!(vec2Magnitude(x, z) > 10000) && this.getBaseHeight(x, z) < F0_05) {
          xs.push(x);
          ys.push(z);
        }
      }
    }
    this.lakes = mergePoints(xs, ys, 800);
  }

  // -------------------------------------------------------------------------
  // Ríos
  // -------------------------------------------------------------------------

  /**
   * `PlaceRivers`: resiembra con riverSeed. Un lago de partida sale de la lista
   * SÓLO si no encontró destino (así un lago larga ríos hasta agotar socios), y
   * el último lago nunca es partida (`Count > 1`).
   */
  private placeRivers(rnd: UnityRandom): River[] {
    const saved = rnd.getState();
    rnd.initState(this.riverSeed);
    const list: River[] = [];
    const lakes = this.lakes!;
    const work = lakes.slice();
    while (work.length > 1) {
      const p = work[0];
      let i = this.findRandomRiverEnd(rnd, list, lakes, p, 2000, F0_4, 128);
      if (i === -1 && !haveRiver(list, p.x, p.y)) {
        i = this.findRandomRiverEnd(rnd, list, lakes, p, 5000, F0_4, 128);
      }
      if (i !== -1) {
        const q = lakes[i];
        const widthMax = rnd.rangeFloat(60, 100);
        const widthMin = rnd.rangeFloat(60, widthMax); // usa el valor recién sorteado
        const len = vec2Distance(p.x, p.y, q.x, q.y);
        list.push({
          p0x: p.x, p0y: p.y, p1x: q.x, p1y: q.y,
          centerX: F(F(p.x + q.x) * F0_5), centerY: F(F(p.y + q.y) * F0_5),
          widthMin, widthMax,
          curveWidth: F(len / 15.0), curveWavelength: F(len / 20.0),
        });
      } else {
        work.shift();
      }
    }
    this.renderRivers(rnd, list, RIVER_ADD_ALL);
    rnd.setState(saved);
    return list;
  }

  /**
   * `FindRandomRiverEnd`: `Range(0, count)` tiene el máximo exclusivo. Consume
   * un sorteo sólo si devuelve un índice.
   */
  private findRandomRiverEnd(
    rnd: UnityRandom, rivers: River[], points: Vec2[], p: Vec2,
    maxDistance: number, heightLimit: number, checkStep: number,
  ): number {
    const list: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const q = points[i];
      if (!vec2Equals(q.x, q.y, p.x, p.y) && vec2Distance(p.x, p.y, q.x, q.y) < maxDistance
        && !haveRiverPair(rivers, p.x, p.y, q.x, q.y) && this.isRiverAllowed(p, q, checkStep, heightLimit)) {
        list.push(i);
      }
    }
    if (list.length === 0) return -1;
    return list[rnd.rangeInt(0, list.length)];
  }

  /**
   * `IsRiverAllowed`: sin Random. Una muestra por encima del límite mata el río,
   * y la línea tiene que cruzar algo de tierra.
   */
  private isRiverAllowed(p0: Vec2, p1: Vec2, step: number, heightLimit: number): boolean {
    const len = vec2Distance(p0.x, p0.y, p1.x, p1.y);
    const dx = F(p1.x - p0.x);
    const dy = F(p1.y - p0.y);
    const m = vec2Magnitude(dx, dy);
    let dirX = 0, dirY = 0;
    if (m > F1EM5) {
      dirX = F(dx / m);
      dirY = F(dy / m);
    }
    let allWater = true;
    const end = F(len - step);
    for (let s = step; s <= end; s = F(s + step)) {
      const qx = F(p0.x + F(dirX * s));
      const qy = F(p0.y + F(dirY * s));
      const b = this.getBaseHeight(qx, qy);
      if (b > heightLimit) return false;
      if (b > F0_05) allWater = false;
    }
    return !allWater;
  }

  // -------------------------------------------------------------------------
  // Arroyos
  // -------------------------------------------------------------------------

  /**
   * `PlaceStreams`: se llama DOS veces, las dos resembrando con streamSeed; la
   * segunda ve otro terreno (el +0.1 del Norte profundo y los puntos que dibujó
   * la primera), así que diverge sola.
   */
  private placeStreams(rnd: UnityRandom, isDN: boolean): River[] {
    const saved = rnd.getState();
    rnd.initState(this.streamSeed);
    const list: River[] = [];
    const riverPreGen = !isDN;
    for (let i = 0; i < 3000; i++) {
      if (!this.findStreamStartPoint(rnd, 100, 26, 31, riverPreGen)) continue;
      const px = this.foundX, py = this.foundY;
      if (!this.findStreamEndPoint(rnd, 100, 36, 44, px, py, 80, 200, riverPreGen)) continue;
      const ex = this.foundX, ey = this.foundY;
      const cx = F(F(px + ex) * F0_5);
      const cy = F(F(py + ey) * F0_5);
      const mh = this.getPregenerationHeight(cx, cy, riverPreGen);
      if (!(mh < 26) && !(mh > 44)) {
        const len = vec2Distance(px, py, ex, ey);
        list.push({
          p0x: px, p0y: py, p1x: ex, p1y: ey, centerX: cx, centerY: cy,
          widthMin: 20, widthMax: 20,
          curveWidth: F(len / 15.0), curveWavelength: F(len / 20.0),
        });
      }
    }
    this.renderRivers(rnd, list, isDN ? RIVER_ADD_ONLY_DEEP_NORTH : RIVER_ADD_SKIP_DEEP_NORTH);
    rnd.setState(saved);
    return list;
  }

  // Salida de los dos buscadores de arroyos (evita un objeto por intento).
  private foundX = 0;
  private foundY = 0;

  /** `FindStreamStartPoint`: sortea las DOS coordenadas antes de probar (un fallo cuesta dos sorteos). */
  private findStreamStartPoint(rnd: UnityRandom, iterations: number, minHeight: number, maxHeight: number, riverPreGen: boolean): boolean {
    for (let i = 0; i < iterations; i++) {
      const x = rnd.rangeFloat(-10000, 10000);
      const y = rnd.rangeFloat(-10000, 10000);
      const h = this.getPregenerationHeight(x, y, riverPreGen);
      if (h > minHeight && h < maxHeight) {
        this.foundX = x;
        this.foundY = y;
        return true;
      }
    }
    return false;
  }

  /** `FindStreamEndPoint`: el radio se achica de 198,8 m a 80 m; el punto es start + (sin, cos)·r. */
  private findStreamEndPoint(
    rnd: UnityRandom, iterations: number, minHeight: number, maxHeight: number,
    sx: number, sy: number, minLength: number, maxLength: number, riverPreGen: boolean,
  ): boolean {
    const stepLen = F((maxLength - minLength) / iterations);
    let cur = maxLength;
    for (let i = 0; i < iterations; i++) {
      cur = F(cur - stepLen);
      const ang = rnd.rangeFloat(0, TWO_PI_F);
      const qx = F(sx + F(UMathf.sin(ang) * cur));
      const qy = F(sy + F(UMathf.cos(ang) * cur));
      const h = this.getPregenerationHeight(qx, qy, riverPreGen);
      if (h > minHeight && h < maxHeight) {
        this.foundX = qx;
        this.foundY = qy;
        return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Dibujo de ríos y la grilla de ríos
  // -------------------------------------------------------------------------

  /**
   * `RenderRivers`: un sorteo por paso, SIEMPRE (también en arroyos, donde el
   * ancho es 20..20). Los puntos nuevos van DESPUÉS de los que ya tenía la celda,
   * y la celda recibe un array NUEVO (la caché puede quedar apuntando al viejo).
   */
  private renderRivers(rnd: UnityRandom, rivers: River[], addRule: number): void {
    const pending = new Map<number, number[]>();
    for (const river of rivers) {
      if (addRule !== RIVER_ADD_ALL) {
        const dn = isDeepnorth(river.p0x, river.p0y); // sólo p0
        if ((dn && addRule === RIVER_ADD_SKIP_DEEP_NORTH) || (!dn && addRule === RIVER_ADD_ONLY_DEEP_NORTH)) continue;
      }
      const step = F(river.widthMin / 8.0);
      const dx = F(river.p1x - river.p0x);
      const dy = F(river.p1y - river.p0y);
      const m = vec2Magnitude(dx, dy);
      let dirX = 0, dirY = 0;
      if (m > F1EM5) {
        dirX = F(dx / m);
        dirY = F(dy / m);
      }
      // `new Vector2(-dir.y, dir.x)`: cambio de signo, no resta desde +0.
      const perpX = -dirY;
      const perpY = dirX;
      const len = vec2Distance(river.p0x, river.p0y, river.p1x, river.p1y);
      for (let s = 0; s <= len; s = F(s + step)) {
        const t = F(s / river.curveWavelength);
        // Tres senos en DOUBLE multiplicados, un solo redondeo al final.
        const off = F(Math.sin(t) * Math.sin(t * 0.634119987487793) * Math.sin(t * 0.3341200053691864) * river.curveWidth);
        const r = rnd.rangeFloat(river.widthMin, river.widthMax);
        const px = F(F(river.p0x + F(dirX * s)) + F(perpX * off));
        const py = F(F(river.p0y + F(dirY * s)) + F(perpY * off));
        addRiverPoint(pending, px, py, r);
      }
    }
    for (const [key, list] of pending) {
      const existing = this.riverPoints.get(key);
      if (existing) {
        const merged = new Float32Array(existing.length + list.length);
        merged.set(existing, 0);
        merged.set(list, existing.length);
        this.riverPoints.set(key, merged);
      } else {
        this.riverPoints.set(key, new Float32Array(list));
      }
    }
    // Como el juego: la caché de una entrada NO se invalida acá.
  }

  /**
   * `GetRiverWeight`: cuánto está un punto dentro de un río/arroyo, y el ancho
   * medio ponderado. Deja el resultado en `rwWeight`/`rwWidth`.
   */
  private getRiverWeight(wx: number, wy: number): void {
    // El único lugar donde una altura lee la pregeneración.
    if (this.pregenPending) this.ensurePregenerated();
    const gx = riverGridX(wx);
    const gy = riverGridX(wy);
    if (gx === this.cachedGx && gy === this.cachedGy) {
      if (this.cachedPoints !== null) this.getWeight(this.cachedPoints, wx, wy);
      else {
        this.rwWeight = 0;
        this.rwWidth = 0;
      }
      return;
    }
    const pts = this.riverPoints.get(riverCellKey(gx, gy));
    this.cachedGx = gx;
    this.cachedGy = gy;
    if (pts !== undefined) {
      this.getWeight(pts, wx, wy);
      this.cachedPoints = pts;
    } else {
      this.cachedPoints = null;
      this.rwWeight = 0;
      this.rwWidth = 0;
    }
  }

  rwWeight = 0;
  rwWidth = 0;

  /** `GetRiverWeight`, público para validar e inspeccionar (en el juego es privado). */
  getRiverWeightPublic(wx: number, wy: number): { weight: number; width: number } {
    this.getRiverWeight(wx, wy);
    return { weight: this.rwWeight, width: this.rwWidth };
  }

  /**
   * `GetWeight`: el peso es un máximo (no depende del orden), pero los dos
   * acumuladores son sumas FLOAT en el orden del array.
   */
  private getWeight(points: RiverCell, wx: number, wy: number): void {
    let weight = 0;
    let width = 0;
    let acc = 0;
    let wsum = 0;
    for (let i = 0; i < points.length; i += 4) {
      const dx = F(points[i] - wx);
      const dy = F(points[i + 1] - wy);
      const d2 = F(dx * dx + dy * dy);
      if (d2 < points[i + 3]) {
        const rw = points[i + 2];
        const d = F(Math.sqrt(d2));
        const w = F(1.0 - d / rw);
        if (w > weight) weight = w;
        acc = F(acc + rw * w);
        wsum = F(wsum + w);
      }
    }
    if (wsum > 0) width = F(acc / wsum);
    this.rwWeight = weight;
    this.rwWidth = width;
  }

  /**
   * `AddRivers`: los ríos sólo BAJAN el terreno, a 0.14…0.12 (28…24 m). Un peso
   * NaN no devuelve h (el `<=` falla con NaN, igual que el `bgt.un` del IL).
   */
  private addRivers(wx: number, wy: number, h: number): number {
    this.getRiverWeight(wx, wy);
    const weight = this.rwWeight;
    if (weight <= 0) return h;
    const t = DU.lerpStep(20, 60, this.rwWidth);
    const bed = DU.lerp(F0_14, F0_12, t);
    const mid = DU.lerp(F0_139, F0_128, t);
    if (h > bed) h = DU.lerp(h, bed, weight);
    if (h > mid) {
      const t2 = DU.lerpStep(F0_85, 1, weight);
      h = DU.lerp(h, mid, t2);
    }
    return h;
  }

  // -------------------------------------------------------------------------
  // Altura base
  // -------------------------------------------------------------------------

  /**
   * `GetBaseHeight`: el corazón del terreno, normalizado (×200 = metros). X e Y
   * quedan en DOUBLE (no se redondean, a diferencia de las coordenadas de detalle).
   * off0 va con X y off1 con Y; todo lo demás usa un solo offset para los dos ejes.
   * Con memo de una entrada (ver `bhX`).
   */
  getBaseHeight(wx: number, wy: number): number {
    if (wx === this.bhX && wy === this.bhY) return this.bhV;
    const r = this.baseHeightCore(wx, wy);
    this.bhX = wx;
    this.bhY = wy;
    this.bhV = r;
    return r;
  }

  private baseHeightCore(wx: number, wy: number): number {
    const dist = DU.length(wx, wy);
    const x = wx + (100000.0 + this.offset0);
    const y = wy + (100000.0 + this.offset1);
    let h = 0;
    h = F(h + PN(x * 0.0020000000949949026 * 0.5, y * 0.0020000000949949026 * 0.5) * PN(x * 0.003000000026077032 * 0.5, y * 0.003000000026077032 * 0.5) * 1.0);
    h = F(h + PN(x * 0.0020000000949949026 * 1.0, y * 0.0020000000949949026 * 1.0) * PN(x * 0.003000000026077032 * 1.0, y * 0.003000000026077032 * 1.0) * h * 0.8999999761581421);
    h = F(h + PN(x * 0.004999999888241291 * 1.0, y * 0.004999999888241291 * 1.0) * PN(x * 0.009999999776482582 * 1.0, y * 0.009999999776482582 * 1.0) * 0.5 * h);
    h = F(h - 0.07000000029802322);

    // Canales de mar: dos muestras del mismo campo en fases distintas; donde coinciden, el
    // terreno baja a 0 y se abren estrechos.
    const n10 = PN(x * 0.0020000000949949026 * 0.25 + 0.12300000339746475, y * 0.0020000000949949026 * 0.25 + 0.15123000741004944);
    const n11 = PN(x * 0.0020000000949949026 * 0.25 + 0.32100000977516174, y * 0.0020000000949949026 * 0.25 + 0.23100000619888306);
    const v = Math.abs(F(n10 - n11));
    let c = F(1.0 - DU.lerpStep(F0_02, F0_12, v));
    c = F(c * DU.smoothStep(744, 1000, dist));
    h = F(h * (1.0 - c));

    if (dist > 10000) {
      const t = DU.lerpStep(10000, 10500, dist);
      h = DU.lerp(h, FNEG0_2, t);
      const edge = 10490;
      if (dist > edge) {
        // La ÚNICA llamada a Utils.LerpStep (todo float) de todo el generador.
        const t2 = UtilsMath.lerpStep(edge, 10500, dist);
        h = DU.lerp(h, -2, t2);
      }
      return h + 0; // `h * mul + add` con mul 1 y add 0 (convierte -0 en +0)
    }

    if (dist < this.minMountainDistance && h > F0_28) {
      const t3 = F(DU.clamp01((h - 0.2800000011920929) / MOUNTAIN_CAP_DIVISOR));
      h = DU.lerp(DU.lerp(F0_28, F0_38, t3), h,
        DU.lerpStep(F(this.minMountainDistance - 400.0), this.minMountainDistance, dist));
    }
    return h + 0;
  }

  /** `BaseHeightTilt`: cuatro alturas base más (lo que hace cara a la Montaña). */
  private baseHeightTilt(wx: number, wy: number): number {
    const a = this.getBaseHeight(F(wx - 1.0), wy);
    const b = this.getBaseHeight(F(wx + 1.0), wy);
    const c = this.getBaseHeight(wx, F(wy - 1.0));
    const d = this.getBaseHeight(wx, F(wy + 1.0));
    return F(Math.abs(F(b - a)) + Math.abs(F(c - d)));
  }

  // -------------------------------------------------------------------------
  // Bioma
  // -------------------------------------------------------------------------

  /**
   * `GetBiome(x, z)`. El ORDEN de las pruebas es la especificación: Ceniza le
   * gana al Océano, Océano al Norte profundo, éste a la Montaña, y las cuatro
   * máscaras de ruido van Pantano, Niebla, Llanura, Bosque Negro.
   *
   * Máscaras: `F(F(off + w) * 0.001…)`, dos redondeos por eje, el offset primero.
   * Los bordes inferiores llevan la ondulación de ±100 m; los superiores no.
   *
   * Las condiciones de distancia se prueban antes que el ruido: el Perlin es
   * puro, así que el orden no cambia el resultado y ahorra muestras.
   */
  getBiome(wx: number, wy: number, oceanLevel: number = F0_02, waterAlwaysOcean = false): number {
    const dist = DU.length(wx, wy);
    const baseHeight = this.getBaseHeight(wx, wy);
    const wa = worldAngle(wx, wy);
    const a = F(wa * 100.0);
    if (waterAlwaysOcean && this.getHeight(wx, wy) <= oceanLevel) return BIOME.Ocean;
    if (isAshlands(wx, wy, wa)) return BIOME.AshLands;
    if (!waterAlwaysOcean && baseHeight <= oceanLevel) return BIOME.Ocean;
    if (isDeepnorth(wx, wy, wa)) return BIOME.DeepNorth;
    if (baseHeight > F0_4) return BIOME.Mountain;
    if (dist > 2000 && dist < this.maxMarshDistance && baseHeight > F0_05 && baseHeight < F0_25
      && PN(F(this.offset0 + wx) * 0.0010000000474974513, F(this.offset0 + wy) * 0.0010000000474974513) > F0_6) {
      return BIOME.Swamp;
    }
    if (dist > F(6000.0 + a) && dist < 10000
      && PN(F(this.offset4 + wx) * 0.0010000000474974513, F(this.offset4 + wy) * 0.0010000000474974513) > this.minDarklandNoise) {
      return BIOME.Mistlands;
    }
    if (dist > F(3000.0 + a) && dist < 8000
      && PN(F(this.offset1 + wx) * 0.0010000000474974513, F(this.offset1 + wy) * 0.0010000000474974513) > F0_4) {
      return BIOME.Plains;
    }
    if (dist > F(600.0 + a) && dist < 6000
      && PN(F(this.offset2 + wx) * 0.0010000000474974513, F(this.offset2 + wy) * 0.0010000000474974513) > F0_4) {
      return BIOME.BlackForest;
    }
    if (dist > F(5000.0 + a)) return BIOME.BlackForest;
    return BIOME.Meadows;
  }

  /**
   * `GetBiome(Vector2s)`: la consulta en coordenadas enteras (short) con caché,
   * la que usa GetBiomeArea.
   */
  getBiomeShort(sx: number, sy: number): number {
    if (this.cachedBiomes === null) this.cachedBiomes = new Map();
    const key = (sx << 16) ^ (sy & 0xffff);
    let v = this.cachedBiomes.get(key);
    if (v === undefined) {
      v = this.getBiome(sx, sy);
      this.cachedBiomes.set(key, v);
    }
    return v;
  }

  /**
   * `GetBiomeArea(Vector2s)`: Median sólo si los ocho vecinos a 64 m coinciden
   * con el centro; si no, Edge. El juego evalúa los ocho siempre (no corta antes).
   * (`sx`, `sy`: enteros de 16 bits, como Vector2s.)
   */
  getBiomeArea(sx: number, sy: number): number {
    if (this.cachedBiomeAreas === null) this.cachedBiomeAreas = new Map();
    const key = (sx << 16) ^ (sy & 0xffff);
    const hit = this.cachedBiomeAreas.get(key);
    if (hit !== undefined) return hit;
    const b = this.getBiomeShort(sx, sy);
    let edge = false;
    for (let i = 0; i < 16; i += 2) {
      // Vector2s - Vector2s: resta con vuelta a int16 (conv.i2).
      const nx = ((sx - BIOME_AREA_OFFSETS[i]) << 16) >> 16;
      const ny = ((sy - BIOME_AREA_OFFSETS[i + 1]) << 16) >> 16;
      if (this.getBiomeShort(nx, ny) !== b) edge = true;
    }
    const v = edge ? BIOME_AREA.Edge : BIOME_AREA.Median;
    this.cachedBiomeAreas.set(key, v);
    return v;
  }

  // -------------------------------------------------------------------------
  // Alturas
  // -------------------------------------------------------------------------

  /** `GetHeight(x, z)`: metros, nivel del mar 30. Deja la máscara en `maskR..maskA`. */
  getHeight(wx: number, wy: number): number {
    return this.getBiomeHeight(this.getBiome(wx, wy), wx, wy);
  }

  /** `GetPregenerationHeight`: la altura que ven los arroyos mientras se generan. */
  getPregenerationHeight(wx: number, wy: number, riverPreGen: boolean): number {
    return this.getBiomeHeight(this.getBiome(wx, wy), wx, wy, true, riverPreGen);
  }

  /**
   * `GetBiomeHeight`: METROS (nivel del mar en 30). El multiplicador es 200 en la
   * pregeneración y 200 × foso de Ceniza × foso del Norte después. Más allá de
   * 10.500 m devuelve -400 exacto, sin foso ni terreno.
   */
  getBiomeHeight(biome: number, wx: number, wy: number, preGeneration = false, riverPreDN = true): number {
    let mult: number;
    if (!preGeneration) {
      // Los dos fosos piden WorldAngle en el mismo punto: es pura, se calcula una vez.
      const wa = worldAngle(wx, wy);
      mult = F(HEIGHT_MULTIPLIER * createAshlandsGap(wx, wy, wa) * createDeepNorthGap(wx, wy, wa));
    } else {
      mult = HEIGHT_MULTIPLIER;
    }
    this.maskR = 0;
    this.maskG = 0;
    this.maskB = 0;
    this.maskA = 1;

    if (DU.length(wx, wy) > 10500) return -2 * HEIGHT_MULTIPLIER;
    let h: number;
    switch (biome) {
      case BIOME.Swamp:
        h = this.getMarshHeight(wx, wy);
        break;
      case BIOME.DeepNorth:
        h = preGeneration ? this.getDeepNorthHeightPregenerate(wx, wy, riverPreDN) : this.getDeepNorthHeight(wx, wy);
        break;
      case BIOME.Mountain:
        h = this.getSnowMountainHeight(wx, wy);
        break;
      case BIOME.BlackForest:
        h = this.getForestHeight(wx, wy);
        break;
      case BIOME.Ocean:
        h = this.getBaseHeight(wx, wy); // GetOceanHeight: sin detalle ni ríos
        break;
      case BIOME.AshLands:
        h = preGeneration ? this.getAshlandsHeightPregenerate(wx, wy) : this.getAshlandsHeight(wx, wy, false);
        break;
      case BIOME.Plains:
        h = this.getPlainsHeight(wx, wy);
        break;
      case BIOME.Meadows:
        h = this.getMeadowsHeight(wx, wy);
        break;
      case BIOME.Mistlands:
        // En la pregeneración, la Niebla es literalmente Bosque Negro.
        h = preGeneration ? this.getForestHeight(wx, wy) : this.getMistlandsHeight(wx, wy);
        break;
      default:
        return 0; // incluye Biome.None
    }
    return F(h * mult + 0.0);
  }

  // --- Alturas por bioma: todas NORMALIZADAS (× mult después) ---------------

  /**
   * `GetMarshHeight` (Pantano): el único sin offset de semilla (el microrelieve
   * es igual en todos los mundos) y sin altura base: 0.137 plano + detalle.
   */
  private getMarshHeight(wx: number, wy: number): number {
    const wx2 = wx, wy2 = wy;
    let h = F0_137;
    const u = F(wx + 100000.0);
    const v = F(wy + 100000.0);
    const n = F(PN(u * 0.03999999910593033, v * 0.03999999910593033) * PN(u * 0.07999999821186066, v * 0.07999999821186066));
    h = F(h + n * 0.029999999329447746);
    h = this.addRivers(wx2, wy2, h);
    h = F(h + PN(u * 0.10000000149011612, v * 0.10000000149011612) * 0.009999999776482582);
    return F(h + PN(u * 0.4000000059604645, v * 0.4000000059604645) * 0.003000000026077032);
  }

  /**
   * El detalle compartido por casi todos los biomas: `D` con dos pares de
   * Perlin. `u`/`v` son `(w + 100000.0) + off3` redondeados a FLOAT: esa
   * cuantización a 1/128 m es del juego, no la saques.
   */
  private detailD(u: number, v: number): number {
    let d = F(PN(u * 0.009999999776482582, v * 0.009999999776482582) * PN(u * 0.019999999552965164, v * 0.019999999552965164));
    d = F(d + PN(u * 0.05000000074505806, v * 0.05000000074505806) * PN(u * 0.10000000149011612, v * 0.10000000149011612) * d * 0.5);
    return d;
  }

  /** Los dos términos finos del final de casi todos los biomas. */
  private fineNoise(h: number, u: number, v: number): number {
    h = F(h + PN(u * 0.10000000149011612, v * 0.10000000149011612) * 0.009999999776482582);
    return F(h + PN(u * 0.4000000059604645, v * 0.4000000059604645) * 0.003000000026077032);
  }

  /**
   * `GetMeadowsHeight` (Pradera). El aplastado sobre el nivel del mar agrupa
   * `over * ((1-k) * 0.75)`; la Llanura agrupa `(over * (1-k)) * 0.75`. Esa
   * diferencia es real.
   */
  private getMeadowsHeight(wx: number, wy: number): number {
    const baseHeight = this.getBaseHeight(wx, wy);
    const u = F(wx + 100000.0 + this.offset3);
    const v = F(wy + 100000.0 + this.offset3);
    const d = this.detailD(u, v);
    let h = baseHeight;
    h = F(h + d * 0.10000000149011612);
    const over = F(h - F0_15);
    const k = F(DU.clamp01(baseHeight / 0.4000000059604645));
    if (over > 0) h = F(h - over * ((1.0 - k) * 0.75));
    h = this.addRivers(wx, wy, h);
    return this.fineNoise(h, u, v);
  }

  /** `GetPlainsHeight` (Llanura): `over` es resta float y el aplastado agrupa distinto que Pradera. */
  private getPlainsHeight(wx: number, wy: number): number {
    const baseHeight = this.getBaseHeight(wx, wy);
    const u = F(wx + 100000.0 + this.offset3);
    const v = F(wy + 100000.0 + this.offset3);
    const d = this.detailD(u, v);
    let h = baseHeight;
    h = F(h + d * 0.10000000149011612);
    const over = F(h - F0_15);
    const k = F(DU.clamp01(baseHeight / 0.4000000059604645));
    if (over > 0) h = F(h - over * (1.0 - k) * 0.75);
    h = this.addRivers(wx, wy, h);
    return this.fineNoise(h, u, v);
  }

  /** `GetForestHeight` (Bosque Negro, y Niebla en la pregeneración): sin aplastado. */
  private getForestHeight(wx: number, wy: number): number {
    let h = this.getBaseHeight(wx, wy);
    const u = F(wx + 100000.0 + this.offset3);
    const v = F(wy + 100000.0 + this.offset3);
    const d = this.detailD(u, v);
    h = F(h + d * 0.10000000149011612);
    h = this.addRivers(wx, wy, h);
    return this.fineNoise(h, u, v);
  }

  /**
   * `GetMistlandsHeight` (Niebla). Dos trampas: el PRIMER producto de M es una
   * multiplicación float pura (sin ensanchar), y 0.02·0.7 son dos productos
   * separados (no los premultipliques). Ceil(h·400)/400 aterraza en escalones de 0,5 m.
   */
  private getMistlandsHeight(wx: number, wy: number): number {
    const baseHeight = this.getBaseHeight(wx, wy);
    const u = F(wx + 100000.0 + this.offset3);
    const v = F(wy + 100000.0 + this.offset3);
    let m = F(PN(u * 0.019999999552965164 * 0.699999988079071, v * 0.019999999552965164 * 0.699999988079071)
      * PN(u * 0.03999999910593033 * 0.699999988079071, v * 0.03999999910593033 * 0.699999988079071));
    m = F(m + PN(u * 0.029999999329447746 * 0.699999988079071, v * 0.029999999329447746 * 0.699999988079071)
      * PN(u * 0.05000000074505806 * 0.699999988079071, v * 0.05000000074505806 * 0.699999988079071) * m * 0.5);
    m = m > 0 ? F(Math.pow(m, 1.5)) : m;
    let h = F(baseHeight + m * 0.4000000059604645);
    h = this.addRivers(wx, wy, h);
    const k = F(DU.clamp01(m * 7.0));
    h = F(h + PN(u * 0.10000000149011612, v * 0.10000000149011612) * 0.029999999329447746 * k);
    h = F(h + PN(u * 0.4000000059604645, v * 0.4000000059604645) * 0.009999999776482582 * k);
    let alpha = F(1.0 - k * 1.2000000476837158);
    alpha = F(alpha - (1.0 - DU.lerpStep(F0_1, F0_3, k)));
    const smooth = F(h + PN(u * 0.4000000059604645, v * 0.4000000059604645) * 0.0020000000949949026);
    let terraced = h;
    terraced = F(terraced * 400.0);
    terraced = UMathf.ceil(terraced);
    terraced = F(terraced / 400.0);
    h = DU.lerp(smooth, terraced, k);
    this.maskA = alpha;
    return h;
  }

  /**
   * `GetSnowMountainHeight` (Montaña): `h + (h - 0.4)` SIN tope (el del Norte
   * profundo sí lo tiene), y el último término es la inclinación (cuatro
   * alturas base más, en las coordenadas originales).
   */
  private getSnowMountainHeight(wx: number, wy: number): number {
    let h = this.getBaseHeight(wx, wy);
    const tilt = this.baseHeightTilt(wx, wy);
    const u = F(wx + 100000.0 + this.offset3);
    const v = F(wy + 100000.0 + this.offset3);
    const over = F(h - 0.4000000059604645);
    h = F(h + over);
    const d = this.detailD(u, v);
    h = F(h + d * 0.20000000298023224);
    h = this.addRivers(wx, wy, h);
    h = this.fineNoise(h, u, v);
    return F(h + PN(u * 0.20000000298023224, v * 0.20000000298023224) * 2.0 * tilt);
  }

  /**
   * `GetDeepNorthHeight` (Norte profundo, final). La "trampa de la pila": la
   * suma base + 0.1f queda en la pila de Mono en DOUBLE; una copia se redondea
   * a float (esa es h) y la OTRA, sin redondear, se divide por 0.4 para k.
   * Pasar la float (lo que imprime ILSpy) le erra en 1 ULP al ~2,5 % de los puntos.
   */
  private getDeepNorthHeight(wx: number, wy: number): number {
    const bStack = this.getBaseHeight(wx, wy) + F0_1;
    const b = F(bStack);
    const u = F(wx + 100000.0 + this.offset3);
    const v = F(wy + 100000.0 + this.offset3);
    const d = this.detailD(u, v);
    let h = b;
    h = F(h + d * 0.10000000149011612);
    const over = F(h - F0_15);
    const k = F(DU.clamp01(bStack / 0.4000000059604645));
    if (over > 0) h = F(h - over * ((1.0 - k) * 0.75));
    h = this.addRivers(wx, wy, h);
    h = this.fineNoise(h, u, v);
    // La sobrecarga DOUBLE de Fbm, con las coordenadas ya redondeadas por el Vector2.
    let g = F(DU.fbmD(F(u * 0.009999999776482582), F(v * 0.009999999776482582), 3, 2.0, 0.5));
    g = F((g + 1.0) / 2.0);
    // Producto y suma en la pila (double), un solo redondeo al guardar.
    g = F(F0_3 + g * F0_3);
    this.maskG = g;
    this.maskA = 0;
    return h;
  }

  /**
   * `GetDeepNorthHeightPregenerate` (sólo pregeneración). La pasada de ríos
   * (`riverPregen` true) no suma el +0.1f; la segunda de arroyos sí. Los dos
   * últimos ruidos son los ÚNICOS con coordenadas multiplicadas en float
   * (`wx * 0.1f`), sobre la wx ya desplazada.
   */
  private getDeepNorthHeightPregenerate(wx: number, wy: number, riverPregen: boolean): number {
    const wx2 = wx, wy2 = wy;
    let h = this.getBaseHeight(wx, wy);
    if (!riverPregen) h = F(h + F0_1);
    wx = F(wx + 100000.0 + this.offset3);
    wy = F(wy + 100000.0 + this.offset3);
    const over = UMathf.max(0, F(h - 0.4000000059604645));
    h = F(h + over);
    const d = this.detailD(wx, wy);
    h = F(h + d * 0.20000000298023224);
    h = F(h * 1.2000000476837158);
    h = this.addRivers(wx2, wy2, h);
    h = F(h + unityPerlin(F(wx * F0_1), F(wy * F0_1)) * 0.009999999776482582);
    return F(h + unityPerlin(F(wx * F0_4), F(wy * F0_4)) * 0.003000000026077032);
  }

  /** `GetAshlandsHeightPregenerate`: acá AddRivers va AL FINAL, después del ruido fino. */
  private getAshlandsHeightPregenerate(wx: number, wy: number): number {
    let h = this.getBaseHeight(wx, wy);
    const u = F(wx + 100000.0 + this.offset3);
    const v = F(wy + 100000.0 + this.offset3);
    const d = this.detailD(u, v);
    h = F(h + d * 0.10000000149011612);
    h = F(h + 0.10000000149011612);
    h = this.fineNoise(h, u, v);
    return this.addRivers(wx, wy, h);
  }

  /**
   * `GetAshlandsHeight` (Tierra de Ceniza, final): la única en DOUBLE de punta a
   * punta. Una cresta alrededor de un círculo 1.200 m al sur del anillo, engordada
   * con ruido celular; el borde del océano a 10.150 m; un simplex fractal; y la
   * máscara de lava (fbm × celular) que hunde el suelo en pozos. `maskA` = lava
   * (el juego prueba > 0.6). `cheap`: la versión del minimapa (2/2 octavas).
   * Se omite el código muerto del original (dos productos de Perlin que nadie lee).
   */
  getAshlandsHeight(wx: number, wy: number, cheap = false): number {
    let x = wx;
    let y = wy;
    const a = this.getBaseHeight(wx, wy);
    const angle = worldAngle(wx, wy) * 100.0;

    let ridge = DU.lengthD(x, y + ASHLANDS_Y_OFFSET - ASHLANDS_Y_OFFSET * 0.3) - (ASHLANDS_MIN_DISTANCE + angle);
    ridge = Math.abs(ridge) / 1000.0;
    ridge = 1.0 - DU.clamp01(ridge);
    ridge = DU.mathfLikeSmoothStep(0.1, 1.0, ridge);
    let xFade = Math.abs(x);
    xFade = 1.0 - DU.clamp01(xFade / 7500.0);
    ridge *= xFade;

    let edge = DU.lengthD(x, y) - 10150.0;
    edge = 1.0 - DU.clamp01(edge / 600.0);

    // Suma FLOAT del offset, después ensanchada.
    const off = F(100000 + this.offset3);
    x += off;
    y += off;

    let cell = 0.0;
    let amp = 1.0;
    let freq = 0.33000001311302185;
    const octaves = cheap ? 2 : 5;
    for (let i = 0; i < octaves; i++) {
      cell += amp * DU.mathfLikeSmoothStep(0.0, 1.0, getCellular(x * freq, y * freq));
      freq *= 2.0;
      amp *= 0.5;
    }
    cell = DU.remap(cell, -1.0, 1.0, 0.0, 1.0);
    const ridgeBlend = DU.lerpD(ridge, DU.blendOverlay(ridge, cell), 0.5);

    let h = DU.lerpD(a, 0.15000000596046448, 0.75);
    h += ridgeBlend * 0.5;
    h = DU.lerpD(-1.0, h, DU.mathfLikeSmoothStep(0.0, 1.0, edge));

    const seaLevel = 0.15;
    let lavaCell = 0.0;
    amp = 1.0;
    freq = 8.0;
    const lavaOctaves = cheap ? 2 : 3;
    for (let j = 0; j < lavaOctaves; j++) {
      lavaCell += amp * getCellular(x * freq, y * freq);
      freq *= 2.0;
      amp *= 0.5;
    }
    lavaCell = DU.remap(lavaCell, -1.0, 1.0, 0.0, 1.0);
    lavaCell = DU.clamp01(Math.pow(lavaCell, 4.0) * 2.0);

    let simplex = getSimplexFractal(x * 0.075, y * 0.075);
    simplex = DU.remap(simplex, -1.0, 1.0, 0.0, 1.0);
    simplex = Math.pow(simplex, 1.399999976158142);
    h *= simplex;

    let f = DU.fbmD(F(x * 0.009999999776482582), F(y * 0.009999999776482582), 3, 2.0, 0.5);
    f *= DU.clamp01(DU.remap(ridge, 0.0, 0.5, 0.5, 1.0));
    f = DU.lerpStepD(0.699999988079071, 1.0, f); // el LerpStep DOUBLE, sólo acá
    f = Math.pow(f, 2.0);
    let lava = DU.blendOverlay(f, lavaCell);
    lava *= DU.clamp01((h - seaLevel - 0.02) / 0.01);

    let dip = PN(x * 0.05 + 5124.0, y * 0.05 + 5000.0);
    dip = Math.pow(dip, 2.0);
    dip = DU.remap(dip, 0.0, 1.0, 0.009999999776482582, 0.054999999701976776);
    const clamped = UMathf.clamp(F(h - dip), F(seaLevel + 0.009999999776482582), 5000);
    h = DU.lerpD(h, clamped, lava);
    this.maskR = 0;
    this.maskG = 0;
    this.maskB = 0;
    this.maskA = F(lava);
    return F(h);
  }

  // -------------------------------------------------------------------------
  // Para la ubicación de lugares
  // -------------------------------------------------------------------------

  /**
   * `GetTerrainDelta`: 10 muestras de GetHeight en un círculo (20 sorteos del
   * Random que pase el llamador). Deja `terrainDelta` y la dirección de la
   * pendiente (de lo alto a lo bajo) en `slopeX/Y/Z`.
   * Residuo conocido: el coseno de `insideUnitCircle` (ver unityRandom.ts).
   */
  getTerrainDelta(rnd: UnityRandom, cx: number, cy: number, cz: number, radius: number): number {
    let hi = -999999;
    let lo = 999999;
    let hiX = cx, hiY = cy, hiZ = cz;
    let loX = cx, loY = cy, loZ = cz;
    for (let i = 0; i < 10; i++) {
      rnd.insideUnitCircle();
      const qx = F(cx + F(rnd.circleX * radius));
      const qz = F(cz + F(rnd.circleY * radius));
      const h = this.getHeight(qx, qz);
      if (h < lo) {
        lo = h; loX = qx; loY = cy; loZ = qz;
      }
      if (h > hi) {
        hi = h; hiX = qx; hiY = cy; hiZ = qz;
      }
    }
    this.terrainDelta = F(hi - lo);
    const dx = F(loX - hiX);
    const dy = F(loY - hiY);
    const dz = F(loZ - hiZ);
    const mag = F(Math.sqrt(F(F(F(dx * dx) + F(dy * dy)) + F(dz * dz))));
    if (mag > F1EM5) {
      this.slopeX = F(dx / mag);
      this.slopeY = F(dy / mag);
      this.slopeZ = F(dz / mag);
    } else {
      this.slopeX = this.slopeY = this.slopeZ = 0;
    }
    return this.terrainDelta;
  }
}

// ---------------------------------------------------------------------------
// Ayudantes de la pregeneración (sin estado del mundo)
// ---------------------------------------------------------------------------

/** `HaveRiver(rivers, p0)`: igualdad con épsilon (Vector2 ==). */
function haveRiver(rivers: River[], x: number, y: number): boolean {
  for (let i = 0; i < rivers.length; i++) {
    const r = rivers[i];
    if (vec2Equals(r.p0x, r.p0y, x, y) || vec2Equals(r.p1x, r.p1y, x, y)) return true;
  }
  return false;
}

/** `HaveRiver(rivers, p0, p1)`: el par sin orden. */
function haveRiverPair(rivers: River[], ax: number, ay: number, bx: number, by: number): boolean {
  for (let i = 0; i < rivers.length; i++) {
    const r = rivers[i];
    if ((vec2Equals(r.p0x, r.p0y, ax, ay) && vec2Equals(r.p1x, r.p1y, bx, by))
      || (vec2Equals(r.p0x, r.p0y, bx, by) && vec2Equals(r.p1x, r.p1y, ax, ay))) return true;
  }
  return false;
}

/**
 * `AddRiverPoint`: recorre y afuera y x adentro (fija el orden de los puntos en
 * cada celda). Cada punto va como [x, y, w, w²].
 */
function addRiverPoint(pending: Map<number, number[]>, px: number, py: number, r: number): void {
  const gx0 = riverGridX(px);
  const gy0 = riverGridX(py);
  const n = UMathf.ceilToInt(F(r / 64.0));
  const w2 = F(r * r);
  for (let y = gy0 - n; y <= gy0 + n; y++) {
    for (let x = gx0 - n; x <= gx0 + n; x++) {
      if (!insideRiverGrid(x, y, px, py, r)) continue;
      const key = riverCellKey(x, y);
      let cell = pending.get(key);
      if (cell === undefined) {
        cell = [];
        pending.set(key, cell);
      }
      cell.push(px, py, r, w2);
    }
  }
}

/**
 * `MergePoints` con un índice de cubetas delante de FindClosest (la variante O4
 * de SeedLab, comparada exhaustivamente contra el O(n²) del juego). Mismo
 * resultado porque: (1) una celda mide `range`, así que todo candidato aceptable
 * está en el 3×3; (2) el juego se queda con el MÁS cercano y, en empate, con el
 * de índice vivo más bajo, y acá se compara (distancia, índice) igual; (3) la
 * lista viva se reproduce tal cual: RemoveAt(0) es `head++` y el borrado por
 * intercambio mueve el último al hueco. El punto que se acumula es un PUNTO
 * MEDIO, no un centroide.
 */
function mergePoints(px: number[], py: number[], range: number): Vec2[] {
  const result: Vec2[] = [];
  const n = px.length;
  if (n === 0) return result;
  const ax = Float64Array.from(px);
  const ay = Float64Array.from(py);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (ax[i] < minX) minX = ax[i];
    if (ax[i] > maxX) maxX = ax[i];
    if (ay[i] < minY) minY = ay[i];
    if (ay[i] > maxY) maxY = ay[i];
  }
  const gw = (F(F(maxX - minX) / range) | 0) + 1;
  const gh = (F(F(maxY - minY) / range) | 0) + 1;
  const col = (value: number, min: number, extent: number): number => {
    const c = F(F(value - min) / range) | 0;
    if (c < 0) return 0;
    if (c >= extent) return extent - 1;
    return c;
  };

  // Cubetas como listas enlazadas sobre identidades; -1 termina.
  const cellHead = new Int32Array(gw * gh).fill(-1);
  const next = new Int32Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const c = col(ay[i], minY, gh) * gw + col(ax[i], minX, gw);
    next[i] = cellHead[c];
    cellHead[c] = i;
  }
  const id = new Int32Array(n); // ranura -> identidad
  const pos = new Int32Array(n); // identidad -> ranura
  for (let i = 0; i < n; i++) {
    id[i] = i;
    pos[i] = i;
  }
  let head = 0;
  let count = n;

  while (count - head > 0) {
    let vx = ax[head];
    let vy = ay[head];
    head++; // == points.RemoveAt(0)
    while (count - head > 0) {
      let bestSlot = -1;
      let bestD = 99999; // el `best` inicial de FindClosest
      const cx0 = col(vx, minX, gw);
      const cy0 = col(vy, minY, gh);
      for (let dy = -1; dy <= 1; dy++) {
        const cy = cy0 + dy;
        if (cy < 0 || cy >= gh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = cx0 + dx;
          if (cx < 0 || cx >= gw) continue;
          for (let e = cellHead[cy * gw + cx]; e !== -1; e = next[e]) {
            const slot = pos[e];
            if (slot < head || slot >= count || id[slot] !== e) continue; // no está viva
            const qx = ax[slot], qy = ay[slot];
            if (vec2Equals(qx, qy, vx, vy)) continue;
            const d = vec2Distance(vx, vy, qx, qy);
            if (d < range && (d < bestD || (d === bestD && slot < bestSlot))) {
              bestD = d;
              bestSlot = slot;
            }
          }
        }
      }
      if (bestSlot === -1) break;
      vx = F(F(vx + ax[bestSlot]) * F0_5);
      vy = F(F(vy + ay[bestSlot]) * F0_5);
      // points[i] = points[^1]; points.RemoveAt(^1)
      const last = count - 1;
      ax[bestSlot] = ax[last];
      ay[bestSlot] = ay[last];
      id[bestSlot] = id[last];
      pos[id[bestSlot]] = bestSlot;
      count--;
    }
    result.push({ x: vx, y: vy });
  }
  return result;
}
