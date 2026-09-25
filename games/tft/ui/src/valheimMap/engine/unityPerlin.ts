// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.WorldGen/Unity/UnityPerlin.cs y PerlinFast.cs
/**
 * `Mathf.PerlinNoise` de Unity 6000.0.75f1, transcrito por SeedLab del código
 * nativo (UnityPlayer.dll) y comparado contra 262.780 muestras tomadas dentro
 * del juego: todas iguales bit a bit.
 *
 * Cada operación es float32 en el binario (addss/mulss), por eso cada paso va
 * envuelto en `F`. La tabla de permutación es un Uint8Array: los valores caben
 * en un byte y así el acceso es el más barato posible (es la función más
 * llamada de todo el motor).
 *
 * Dominio: |x|, |y| < 2^31. El generador nunca pasa de ~1,2·10^4.
 */
// `Math.fround` local y no importado: así el motor lo reconoce en el lazo caliente.
const F = Math.fround;

/** 0.69f y 1.483f: `PerlinNoise = (Noise + 0.69) / 1.483`. */
export const NORM_ADD = F(0.69);
export const NORM_DIV = F(1.483);

// La permutación clásica de Ken Perlin, la misma que está en el binario (dos veces seguidas).
const PERM256 = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
  140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
  247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
  57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
  74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
  60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
  65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
  200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
  52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
  207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
  119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
  129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
  218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
  81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
  184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
  222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
];

const P = new Uint8Array(512);
for (let i = 0; i < 256; i++) {
  P[i] = PERM256[i];
  P[i + 256] = PERM256[i];
}

function fade(t: number): number {
  let a = F(t * 6);
  a = F(a - 15);
  a = F(a * t);
  a = F(a + 10);
  const t3 = F(F(t * t) * t);
  return F(a * t3);
}

/** El signo se invierte con los bits 0 y 1 del hash COMPLETO, no de `h`. */
function grad(hash: number, x: number, y: number): number {
  const h = hash & 15;
  let u: number, v: number;
  if (h < 8) {
    u = x;
    v = h >= 4 ? 0 : y;
  } else {
    u = y;
    v = h === 12 || h === 14 ? x : 0;
  }
  if ((hash & 1) !== 0) u = -u;
  if ((hash & 2) !== 0) v = -v;
  return F(v + u);
}

/** `PerlinNoise::Noise(float, float)`, crudo: rango medido [-0.891581, 0.9995063]. */
export function noise(x: number, y: number): number {
  // Valor absoluto y no floor: el binario hace `andps 0x7FFFFFFF`, así que el
  // ruido es simétrico respecto de los ejes (variante P7 de SeedLab).
  x = Math.abs(x);
  y = Math.abs(y);
  const ix = x | 0;
  const iy = y | 0;
  const X = ix & 0xff;
  const Y = iy & 0xff;
  const fx = F(x - ix);
  const fy = F(y - iy);
  // MINSS(1, f): la cota sólo alimenta la curva de suavizado.
  const u = fade(1 < fx ? 1 : fx);
  const v = fade(1 < fy ? 1 : fy);

  const A = P[X] + Y;
  const B = P[X + 1] + Y;
  const AA = P[A], AB = P[A + 1], BA = P[B], BB = P[B + 1];

  const fx1 = F(fx - 1);
  const fy1 = F(fy - 1);
  const g00 = grad(P[AA], fx, fy);
  const g10 = grad(P[BA], fx1, fy);
  const g01 = grad(P[AB], fx, fy1);
  const g11 = grad(P[BB], fx1, fy1);

  const l1 = F(F(F(g11 - g01) * u) + g01);
  const l0 = F(F(F(g10 - g00) * u) + g00);
  return F(F(F(l1 - l0) * v) + l0);
}

/** `Mathf.PerlinNoise(float, float)`. Los argumentos tienen que venir ya en float. */
export function perlinNoise(x: number, y: number): number {
  return F(F(noise(x, y) + NORM_ADD) / NORM_DIV);
}

/** `Mathf.PerlinNoise1D(x)`: idéntico bit a bit a `PerlinNoise(x, 0f)`. */
export function perlinNoise1D(x: number): number {
  return perlinNoise(x, 0);
}
