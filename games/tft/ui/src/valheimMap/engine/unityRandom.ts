// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.WorldGen/Unity/UnityRandom.cs
/**
 * `UnityEngine.Random` (xorshift128), transcrito por SeedLab de UnityPlayer.dll
 * y comparado dentro del juego: 276 trazas, 1.980 sorteos, 268 semillas, todo
 * exacto (resultado y estado después de cada sorteo).
 *
 * El juego tiene UNA instancia global; acá es una clase para que cada mundo (y
 * cada Web Worker) tenga la suya. El estado son cuatro int32 públicos porque la
 * ubicación de lugares los guarda y restaura (`Random.state`).
 */
// `Math.fround` local y no importado: así el motor lo reconoce en el lazo caliente.
const F = Math.fround;

/** 1f / 8388607f como float (0x34000001). */
export const RANDOM_SCALE = F(1.1920930376163765e-7);
/** 2·pi como float (0x40C90FDB), el tope de `insideUnitCircle`. */
const TWO_PI_F = F(6.28318548);

export type RandomState = [number, number, number, number];

export class UnityRandom {
  s0 = 0;
  s1 = 0;
  s2 = 0;
  s3 = 0;

  /** Los dos componentes del último `insideUnitCircle` (así no se asigna un objeto por sorteo). */
  circleX = 0;
  circleY = 0;

  constructor(seed?: number) {
    if (seed !== undefined) this.initState(seed);
  }

  /** `Random.InitState(int)`; el setter de `Random.seed` es la misma función nativa. */
  initState(seed: number): void {
    this.s0 = seed | 0;
    this.s1 = (Math.imul(this.s0, 1812433253) + 1) | 0; // 0x6C078965
    this.s2 = (Math.imul(this.s1, 1812433253) + 1) | 0;
    this.s3 = (Math.imul(this.s2, 1812433253) + 1) | 0;
  }

  /** `Random.state` get: copia cruda de los cuatro int. */
  getState(): RandomState {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  /** `Random.state` set. */
  setState(st: RandomState): void {
    this.s0 = st[0] | 0;
    this.s1 = st[1] | 0;
    this.s2 = st[2] | 0;
    this.s3 = st[3] | 0;
  }

  /** Un paso de xorshift128 (desplazamientos 11, 8, 19); devuelve el nuevo s3 como uint. */
  next(): number {
    const x0 = this.s0 >>> 0;
    const x3 = this.s3 >>> 0;
    const t = ((x0 << 11) ^ x0) >>> 0;
    this.s0 = this.s1;
    this.s1 = this.s2;
    this.s2 = this.s3;
    // Los `>>` de C# sobre uint son lógicos: en JS van con `>>>`.
    const w = (x3 ^ t ^ (((x3 >>> 11) ^ t) >>> 8)) >>> 0;
    this.s3 = w | 0;
    return w;
  }

  /** `Random.value`: los 23 bits bajos por 1/8388607 (sí puede dar 1). */
  value(): number {
    return F((this.next() & 0x7fffff) * RANDOM_SCALE);
  }

  /**
   * `Random.Range(float, float)`: SIEMPRE consume un sorteo, y la fórmula es
   * (1-f)*max + f*min, al revés de lo que uno escribiría (medido: la forma
   * directa queda a 31 ULP). Código nativo: tres redondeos float, ni uno más.
   */
  rangeFloat(minInclusive: number, maxInclusive: number): number {
    const f = F((this.next() & 0x7fffff) * RANDOM_SCALE);
    return F(F(F(1 - f) * maxInclusive) + F(f * minInclusive));
  }

  /**
   * `Random.Range(int, int)`: el máximo es EXCLUSIVO y con min == max NO
   * consume sorteo (medido en el juego).
   */
  rangeInt(minInclusive: number, maxExclusive: number): number {
    minInclusive |= 0;
    maxExclusive |= 0;
    if (minInclusive < maxExclusive) {
      const span = (maxExclusive - minInclusive) >>> 0;
      return ((minInclusive >>> 0) + (this.next() % span)) | 0;
    }
    if (minInclusive > maxExclusive) {
      const span = (minInclusive - maxExclusive) >>> 0;
      return ((minInclusive >>> 0) - (this.next() % span)) | 0;
    }
    return minInclusive;
  }

  /**
   * `Random.insideUnitCircle`: exactamente dos sorteos, sin rechazo; x = cos,
   * y = sin. Deja el resultado en `circleX`/`circleY`.
   *
   * Residuo conocido (SeedLab R3): no está probado si el juego usa el coseno en
   * double o en float; difieren en 1 ULP en el 0,26 % de los ángulos. Además el
   * `Math.cos` de JS puede diferir del de .NET en el último bit. Sólo toca a
   * `GetTerrainDelta` (ubicación de lugares), nunca al bioma ni a la altura.
   */
  insideUnitCircle(): void {
    const a = this.rangeFloat(0, TWO_PI_F);
    const t = this.rangeFloat(0, 1);
    const r = F(Math.sqrt(t));
    this.circleX = F(F(Math.cos(a)) * r);
    this.circleY = F(F(Math.sin(a)) * r);
  }
}
