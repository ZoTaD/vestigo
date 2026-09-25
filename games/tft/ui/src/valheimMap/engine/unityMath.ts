// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.WorldGen/Unity/UnityMath.cs
/**
 * Las piezas de `UnityEngine.Vector2`, `Mathf` y `Utils` que toca el generador.
 *
 * Regla de todo el motor: un número de JS es un `double`, así que cada operación
 * que en C# es `float` va envuelta en `F` (`Math.fround`), y cada suma o producto
 * que en C# es `double` se deja tal cual, en el mismo orden. No reordenes nada:
 * varias fórmulas difieren de la "obvia" en un redondeo y ése es el que el juego
 * guardó en el mundo.
 *
 * Vector2 no es un objeto acá: sus operaciones son funciones sobre (x, y) para
 * no asignar nada por punto.
 */

/** Redondeo a float32: la conversión `(float)` de C#. */
export const F = Math.fround;

/** El épsilon de `Vector2 ==`, como float (9.9999994E-11f) ensanchado a double. */
const VEC2_EPS = F(9.9999994e-11);

/**
 * `Vector2.magnitude`: los cuadrados y la suma quedan en la pila de Mono a R8
 * (double) y se redondean una sola vez, al final. Por eso es idéntico a
 * `DUtils.Length(float, float)`.
 */
export function vec2Magnitude(x: number, y: number): number {
  return F(Math.sqrt(x * x + y * y));
}

/** `Vector2.sqrMagnitude`: suma en double, un solo redondeo al guardar. */
export function vec2SqrMagnitude(x: number, y: number): number {
  return F(x * x + y * y);
}

/** `Vector2.Distance(a, b)`: las restas sí se redondean (van a locales float32). */
export function vec2Distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = F(ax - bx);
  const dy = F(ay - by);
  return F(Math.sqrt(dx * dx + dy * dy));
}

/**
 * `Vector2 ==` es una prueba con épsilon, no igualdad exacta. Decide qué lagos
 * puede unir un río: con igualdad exacta sale otro grafo de ríos.
 */
export function vec2Equals(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = F(ax - bx);
  const dy = F(ay - by);
  return dx * dx + dy * dy < VEC2_EPS;
}

/** Redondeo de `Math.Round(double)` de .NET: mitades al par (el de JS las sube). */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** `UnityEngine.Mathf`: envoltorios de System.Math con el ida y vuelta por double. */
export const UMathf = {
  abs: (f: number): number => Math.abs(f),
  sin: (f: number): number => F(Math.sin(f)),
  cos: (f: number): number => F(Math.cos(f)),
  ceil: (f: number): number => F(Math.ceil(f)),
  floorToInt: (f: number): number => Math.floor(f) | 0,
  ceilToInt: (f: number): number => Math.ceil(f) | 0,
  /** Como en Unity: redondeo bancario. */
  roundToInt: (f: number): number => roundHalfEven(f) | 0,
  /** La comparación de tres vías tal cual, sin tratar NaN. */
  clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  },
  max: (a: number, b: number): number => (a > b ? a : b),
  min: (a: number, b: number): number => (a < b ? a : b),
  /** `Mathf.Clamp01(float)`; no confundir con `DUtils.Clamp01(double)`. */
  clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  },
  /** `Mathf.Lerp`: todo en float, a + (b - a) * Clamp01(t). No es `DUtils.Lerp`. */
  lerp(a: number, b: number, t: number): number {
    return F(a + F(F(b - a) * UMathf.clamp01(t)));
  },
  /** `Mathf.SmoothStep`, el de Unity, en float. */
  smoothStep(from: number, to: number, t: number): number {
    t = UMathf.clamp01(t);
    t = F(F(F(F(-2 * t) * t) * t) + F(F(3 * t) * t));
    return F(F(to * t) + F(from * F(1 - t)));
  },
};

/**
 * Los dos miembros de `Utils` que difieren de sus homónimos en `DUtils`.
 * `Utils.LerpStep` es TODO float y el generador lo usa una sola vez: el borde
 * del mundo a 10.490 m dentro de GetBaseHeight.
 */
export const UtilsMath = {
  clamp01(v: number): number {
    if (v > 1) return 1;
    if (v < 0) return 0;
    return v;
  },
  lerpStep(l: number, h: number, v: number): number {
    return UtilsMath.clamp01(F(F(v - l) / F(h - l)));
  },
};
