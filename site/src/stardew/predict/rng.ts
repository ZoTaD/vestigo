// Núcleo aleatorio del predictor de Stardew Valley 1.6.15.
//
// El juego saca casi todo del azar con `System.Random(int)` de .NET 6 y semillas
// armadas con un xxHash32. Acá se reescribe lo justo para repetir esas tiradas
// exactas en el navegador. Cada pieza nombra el método del juego que replica y
// se valida contra el juego real con el oráculo de `games/stardew/tools/oracle`
// (valores esperados en `test/fixtures/stardew-predict/rng.json`).

const MBIG = 2147483647; // int.MaxValue
const MSEED = 161803398;

/**
 * `System.Random(int seed)` de .NET 6: el generador sustractivo de Knuth
 * (`Net5CompatSeedImpl`). Todas las tiradas devuelven lo mismo que el original.
 */
export class DotNetRandom {
  private readonly tabla = new Int32Array(56);
  private inext = 0;
  private inextp = 21;

  constructor(seed: number) {
    // Net5CompatSeedImpl(int Seed)
    const sub = seed === -2147483648 ? MBIG : Math.abs(seed);
    let mj = MSEED - sub;
    const t = this.tabla;
    t[55] = mj;
    let mk = 1;
    let ii = 0;
    for (let i = 1; i < 55; i++) {
      ii += 21;
      if (ii >= 55) ii -= 55;
      t[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = t[ii];
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        let n = i + 30;
        if (n >= 55) n -= 55;
        t[i] -= t[1 + n];
        if (t[i] < 0) t[i] += MBIG;
      }
    }
  }

  // Net5CompatSeedImpl.InternalSample
  private internalSample(): number {
    const t = this.tabla;
    if (++this.inext >= 56) this.inext = 1;
    if (++this.inextp >= 56) this.inextp = 1;
    let r = t[this.inext] - t[this.inextp];
    if (r === MBIG) r--;
    if (r < 0) r += MBIG;
    t[this.inext] = r;
    return r;
  }

  // Net5CompatSeedImpl.Sample
  private sample(): number {
    return this.internalSample() * (1.0 / MBIG);
  }

  // Net5CompatSeedImpl.GetSampleForLargeRange
  private sampleForLargeRange(): number {
    let result = this.internalSample();
    if (this.internalSample() % 2 === 0) result = -result;
    let d = result;
    d += MBIG - 1;
    d /= 2 * MBIG - 1;
    return d;
  }

  /** `Next()`, `Next(max)` y `Next(min, max)`. */
  next(): number;
  next(max: number): number;
  next(min: number, max: number): number;
  next(a?: number, b?: number): number {
    if (a === undefined) return this.internalSample();
    if (b === undefined) {
      if (a < 0) throw new RangeError("max debe ser positivo");
      return Math.trunc(this.sample() * a);
    }
    if (a > b) throw new RangeError("min es mayor que max");
    const rango = b - a; // en .NET es long: acá es exacto (< 2^33)
    if (rango <= MBIG) return Math.trunc(this.sample() * rango) + a;
    return Math.trunc(this.sampleForLargeRange() * rango) + a;
  }

  /** `NextDouble()`. */
  nextDouble(): number {
    return this.sample();
  }

  /**
   * `RandomExtensions.NextBool`: sin argumento es `NextDouble() < 0.5`; con
   * probabilidad, `NextDouble() < p` y, si `p >= 1`, verdadero sin tirar.
   */
  nextBool(chance?: number): boolean {
    if (chance === undefined) return this.nextDouble() < 0.5;
    if (chance >= 1) return true;
    return this.nextDouble() < chance;
  }

  /** `RandomExtensions.Choose`: `options[Next(options.Length)]`. */
  choose<T>(...xs: T[]): T {
    return xs[this.next(xs.length)];
  }
}

// ---------------------------------------------------------------- hash

const P1 = 2654435761;
const P2 = 2246822519;
const P3 = 3266489917;
const P4 = 668265263;
const P5 = 374761393;

const rotl = (x: number, r: number): number => (x << r) | (x >>> (32 - r));

/**
 * xxHash32 con semilla 0 (`HashUtility.GetDeterministicHashCode(byte[])`), con
 * signo como `BitConverter.ToInt32`.
 */
export function xxh32(bytes: Uint8Array): number {
  const len = bytes.length;
  const vista = new DataView(bytes.buffer, bytes.byteOffset, len);
  let i = 0;
  let h: number;
  if (len >= 16) {
    let v1 = (0 + P1 + P2) | 0;
    let v2 = (0 + P2) | 0;
    let v3 = 0;
    let v4 = (0 - P1) | 0;
    const ronda = (v: number, lane: number) => Math.imul(rotl((v + Math.imul(lane, P2)) | 0, 13), P1);
    for (; i <= len - 16; i += 16) {
      v1 = ronda(v1, vista.getInt32(i, true));
      v2 = ronda(v2, vista.getInt32(i + 4, true));
      v3 = ronda(v3, vista.getInt32(i + 8, true));
      v4 = ronda(v4, vista.getInt32(i + 12, true));
    }
    h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) | 0;
  } else {
    h = (0 + P5) | 0;
  }
  h = (h + len) | 0;
  for (; i <= len - 4; i += 4) {
    h = Math.imul(rotl((h + Math.imul(vista.getInt32(i, true), P3)) | 0, 17), P4);
  }
  for (; i < len; i++) {
    h = Math.imul(rotl((h + Math.imul(bytes[i], P5)) | 0, 11), P1);
  }
  h ^= h >>> 15;
  h = Math.imul(h, P2);
  h ^= h >>> 13;
  h = Math.imul(h, P3);
  h ^= h >>> 16;
  return h | 0;
}

/** `HashUtility.GetDeterministicHashCode(string)`: el texto en UTF-8. */
export function hashString(s: string): number {
  return xxh32(new TextEncoder().encode(s));
}

/** `HashUtility.GetDeterministicHashCode(params int[])`: cada entero en 4 bytes little-endian. */
export function hashInts(...xs: number[]): number {
  const buf = new Uint8Array(xs.length * 4);
  const vista = new DataView(buf.buffer);
  xs.forEach((x, i) => vista.setInt32(i * 4, x, true));
  return xxh32(buf);
}

// ---------------------------------------------------------------- semillas

/** El cast `(int)(x % 2147483647.0)` de C#: el resto conserva el signo y el cast trunca. */
const aInt = (x: number): number => Math.trunc(x % MBIG) | 0;

/**
 * `Utility.CreateRandomSeed`: con la aleatoriedad moderna, el hash de los cinco
 * valores; con `UseLegacyRandom`, su suma módulo 2147483647.
 */
export function createRandomSeed(legacy: boolean, a: number, b: number, c = 0, d = 0, e = 0): number {
  if (legacy) {
    return Math.trunc(((a % MBIG) + (b % MBIG) + (c % MBIG) + (d % MBIG) + (e % MBIG)) % MBIG) | 0;
  }
  return hashInts(aInt(a), aInt(b), aInt(c), aInt(d), aInt(e));
}

/** `Utility.CreateRandom`. */
export function createRandom(legacy: boolean, a: number, b = 0, c = 0, d = 0, e = 0): DotNetRandom {
  return new DotNetRandom(createRandomSeed(legacy, a, b, c, d, e));
}

/** Lo que identifica la partida para el azar: `uniqueIDForThisGame` y `UseLegacyRandom`. */
export interface Seed {
  gameId: number;
  legacy: boolean;
}

/** `Utility.CreateDaySaveRandom`: `CreateRandom(DaysPlayed, uniqueIDForThisGame / 2, a, b, c)`. */
export function daySaveRandom(seed: Seed, daysPlayed: number, a = 0, b = 0, c = 0): DotNetRandom {
  return createRandom(seed.legacy, daysPlayed, Math.floor(seed.gameId / 2), a, b, c);
}

/**
 * `Utility.TryCreateIntervalRandom` (los intervalos "day", "season" y "year";
 * "tick" no se puede predecir). `season` es la clave en minúsculas ("spring"...).
 */
export function syncedRandom(
  seed: Seed,
  interval: "day" | "season" | "year",
  key: string,
  daysPlayed: number,
  season: string,
  year: number,
): DotNetRandom {
  const clave = hashString(key);
  const tercero =
    interval === "day" ? daysPlayed : interval === "season" ? hashString(season + year) : hashString("year" + year);
  return createRandom(seed.legacy, clave, seed.gameId, tercero);
}

/** `Game1.stats.DaysPlayed` para un día del calendario: `season` 0-3 (primavera-invierno), `day` 1-28. */
export function daysPlayed(season: 0 | 1 | 2 | 3, day: number, year: number): number {
  return (year - 1) * 112 + season * 28 + day;
}
