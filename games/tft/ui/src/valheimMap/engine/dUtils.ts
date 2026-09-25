// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.WorldGen/DUtils.cs
/**
 * `DUtils` del juego (assembly_utils): cuentas en double y UN redondeo a float
 * justo donde el IL tiene `conv.r4`. Varias de estas funciones difieren de la
 * versión obvia en un redondeo, y ése es el que el juego usó para el mundo. No
 * las "simplifiques".
 *
 * Las variantes `...D` son las sobrecargas en double del juego.
 */
import { perlinNoise as unityPerlin } from "./unityPerlin";

// `Math.fround` local y no importado: así el motor lo reconoce en el lazo caliente.
const F = Math.fround;

/**
 * `DUtils.Length(float, float)`: cuadrados y suma en DOUBLE, luego sqrt y a
 * float. La usan GetBiome, GetBaseHeight, IsAshlands y los huecos del borde.
 */
export function length(x: number, y: number): number {
  return F(Math.sqrt(x * x + y * y));
}

/** `DUtils.Length(double, double)`: sólo la usa GetAshlandsHeight, que es double de punta a punta. */
export function lengthD(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** `DUtils.BlendOverlay`: el juego calcula las dos ramas y elige; como son puras, basta la elegida. */
export function blendOverlay(a: number, b: number): number {
  if (!(a < 0.5)) return 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
  return 2.0 * a * b;
}

/**
 * `DUtils.Lerp(float, float, float)`: corta en t <= 0 y t >= 1 devolviendo a o b
 * exactos; si no, a*(1-t) + b*t en double y un solo redondeo. No es `Mathf.Lerp`.
 */
export function lerp(a: number, b: number, t: number): number {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return F(a * (1.0 - t) + b * t);
}

/** `DUtils.Lerp(double, double, double)`: los mismos cortes, sin redondeo. */
export function lerpD(a: number, b: number, t: number): number {
  if (t <= 0.0) return a;
  if (t >= 1.0) return b;
  return a * (1.0 - t) + b * t;
}

/** `DUtils.LerpStep(float...)`: interior en double, UN redondeo a la salida. */
export function lerpStep(l: number, h: number, v: number): number {
  return F(clamp01((v - l) / (h - l)));
}

/** `DUtils.LerpStep(double...)`: una sola vez, en GetAshlandsHeight. */
export function lerpStepD(l: number, h: number, v: number): number {
  return clamp01((v - l) / (h - l));
}

/** `DUtils.SmoothStep`: ojo al redondeo a float EN EL MEDIO, antes de elevar t. */
export function smoothStep(pMin: number, pMax: number, pX: number): number {
  const t = F(clamp01((pX - pMin) / (pMax - pMin)));
  return F(t * t * (3.0 - 2.0 * t));
}

/**
 * `DUtils.MathfLikeSmoothStep` devuelve un double REDONDEADO A FLOAT (el IL
 * termina en `conv.r4; conv.r8`). Sin ese redondeo se corren todas las crestas
 * de Ashlands y los dos huecos del borde.
 */
export function mathfLikeSmoothStep(from: number, to: number, t: number): number {
  t = clamp01(t);
  t = -2.0 * t * t * t + 3.0 * t * t;
  return F(to * t + from * (1.0 - t));
}

/** `DUtils.Clamp01(double)`: NaN pasa derecho (las dos comparaciones fallan). */
export function clamp01(v: number): number {
  if (v > 1.0) return 1.0;
  if (v < 0.0) return 0.0;
  return v;
}

/**
 * `DUtils.Fbm(Vector2, int, float, float)`: acumulador FLOAT y la escala de la
 * coordenada es un producto de Vector2 (float por componente). La usa
 * GetForestFactor (vía la sobrecarga de Vector3, que toma x y z).
 */
export function fbm(px: number, py: number, octaves: number, lacunarity: number, gain: number): number {
  let sum = 0;
  let amp = 1;
  let vx = px;
  let vy = py;
  for (let i = 0; i < octaves; i++) {
    sum = F(sum + amp * unityPerlin(vx, vy));
    amp = F(amp * gain);
    vx = F(vx * lacunarity);
    vy = F(vy * lacunarity);
  }
  return sum;
}

/**
 * `DUtils.Fbm(Vector2, int, double, double)`: acumulador y escala en DOUBLE,
 * pero el Perlin sigue recibiendo float. `px`/`py` ya vienen en float (el
 * constructor de Vector2 los redondeó). Máscara de Deep North y lava de Ashlands.
 */
export function fbmD(px: number, py: number, octaves: number, lacunarity: number, gain: number): number {
  let sum = 0.0;
  let amp = 1.0;
  let x = px;
  let y = py;
  for (let i = 0; i < octaves; i++) {
    sum += amp * perlinNoise(x, y);
    amp *= gain;
    x *= lacunarity;
    y *= lacunarity;
  }
  return sum;
}

export function remap(value: number, inLow: number, inHigh: number, outLow: number, outHigh: number): number {
  return lerpD(outLow, outHigh, inverseLerp(inLow, inHigh, value));
}

export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0.0;
  return clamp01((value - a) / (b - a));
}

/**
 * `DUtils.PerlinNoise(double, double)` = `Mathf.PerlinNoise((float)x, (float)y)`.
 * Esos dos redondeos son la razón de que cada "coordenada × frecuencia" del
 * generador vuelva a float antes de entrar al ruido. Con argumentos que ya son
 * float (la sobrecarga float del juego) el redondeo no cambia nada.
 */
export function perlinNoise(x: number, y: number): number {
  return unityPerlin(F(x), F(y));
}
