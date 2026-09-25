// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.WorldGen/Noise/FastNoisePort.cs
// Basado en FastNoise (Jordan Peck, MIT; ver NOTICE.md) tal como lo trae el juego.
/**
 * La parte de FastNoise que usa el generador: sólo la Tierra de Ceniza
 * (`GetAshlandsHeight`) llama a `GetCellular` y `GetSimplexFractal`.
 *
 * El FastNoise del juego es un port en DOUBLE: todo acá es double, sin `F`.
 * Configuración fija (la del constructor del generador): celular euclídeo que
 * devuelve la distancia al cuadrado, 2 octavas, y semilla 0 SIEMPRE (el juego
 * llama `SetSeed(0)` en cada mundo), así que este ruido es igual en todos los
 * mundos y no hace falta instanciarlo.
 */
import { CELL_2D, GRAD_2D } from "./fastNoiseTables";

const F = Math.fround;

const SEED = 0;
const FREQUENCY = 0.01;
const OCTAVES = 2;
const LACUNARITY = 2.0;
const GAIN = 0.5;
/** `m_cellularJitter` es un float 0.45f ensanchado: NO es el double 0.45 (corre cada centro de celda). */
const CELLULAR_JITTER = F(0.45);

/** `CalculateFractalBounding()` tal cual: 1 / (1 + 0.5) con 2 octavas. */
const FRACTAL_BOUNDING = (() => {
  let amp = GAIN;
  let ampFractal = 1.0;
  for (let i = 1; i < OCTAVES; i++) {
    ampFractal += amp;
    amp *= GAIN;
  }
  return 1.0 / ampFractal;
})();

// `(int)f` de C# trunca hacia cero; `| 0` hace lo mismo en el rango que llega acá (|f| < 2^31).
function fastFloor(f: number): number {
  return f >= 0.0 ? f | 0 : (f | 0) - 1;
}

function fastRound(f: number): number {
  return f >= 0.0 ? (f + 0.5) | 0 : (f - 0.5) | 0;
}

/** `Hash2D`: int32 con desborde en cada paso, y `>> 13` aritmético. */
function hash2D(seed: number, x: number, y: number): number {
  let n = seed;
  n ^= Math.imul(1619, x);
  n ^= Math.imul(31337, y);
  n = Math.imul(Math.imul(Math.imul(n, n), n), 60493);
  return (n >> 13) ^ n;
}

function gradCoord2D(seed: number, x: number, y: number, xd: number, yd: number): number {
  const g = (hash2D(seed, x, y) & 7) << 1;
  return xd * GRAD_2D[g] + yd * GRAD_2D[g + 1];
}

/**
 * `GetCellular(x, y)`: multiplica por la frecuencia (0.01) encima de la que ya
 * trae el llamador. Devuelve la distancia euclídea AL CUADRADO al centro más
 * cercano (no hay raíz). Recorre i (x) afuera y j (y) adentro, y ante empate
 * gana la primera celda: no cambies el orden.
 */
export function getCellular(x: number, y: number): number {
  x *= FREQUENCY;
  y *= FREQUENCY;
  const xr = fastRound(x);
  const yr = fastRound(y);
  let best = 999999.0;
  for (let i = xr - 1; i <= xr + 1; i++) {
    for (let j = yr - 1; j <= yr + 1; j++) {
      const c = (hash2D(SEED, i, j) & 0xff) << 1;
      const dx = i - x + CELL_2D[c] * CELLULAR_JITTER;
      const dy = j - y + CELL_2D[c + 1] * CELLULAR_JITTER;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
  }
  return best;
}

/** `SingleSimplex`: simplex 2D clásico con las constantes double exactas del juego. */
function singleSimplex(seed: number, x: number, y: number): number {
  let t = (x + y) * 0.3660254037844386;
  const i = fastFloor(x + t);
  const j = fastFloor(y + t);
  t = (i + j) * 0.21132486540518713;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;

  let i1: number, j1: number;
  if (x0 > y0) {
    i1 = 1;
    j1 = 0;
  } else {
    i1 = 0;
    j1 = 1;
  }

  const x1 = x0 - i1 + 0.21132486540518713;
  const y1 = y0 - j1 + 0.21132486540518713;
  const x2 = x0 - 1.0 + 0.42264973081037427;
  const y2 = y0 - 1.0 + 0.42264973081037427;

  let n0: number, n1: number, n2: number;

  t = 0.5 - x0 * x0 - y0 * y0;
  if (t < 0.0) n0 = 0.0;
  else {
    t *= t;
    n0 = t * t * gradCoord2D(seed, i, j, x0, y0);
  }

  t = 0.5 - x1 * x1 - y1 * y1;
  if (t < 0.0) n1 = 0.0;
  else {
    t *= t;
    n1 = t * t * gradCoord2D(seed, i + i1, j + j1, x1, y1);
  }

  t = 0.5 - x2 * x2 - y2 * y2;
  if (t < 0.0) n2 = 0.0;
  else {
    t *= t;
    n2 = t * t * gradCoord2D(seed, i + 1, j + 1, x2, y2);
  }

  return 50.0 * (n0 + n1 + n2);
}

/** `GetSimplexFractal` (FBM): la segunda octava usa semilla+1 (`++seed`), no otro hash. */
export function getSimplexFractal(x: number, y: number): number {
  x *= FREQUENCY;
  y *= FREQUENCY;
  let seed = SEED;
  let sum = singleSimplex(seed, x, y);
  let amp = 1.0;
  for (let i = 1; i < OCTAVES; i++) {
    x *= LACUNARITY;
    y *= LACUNARITY;
    amp *= GAIN;
    sum += singleSimplex(++seed, x, y) * amp;
  }
  return sum * FRACTAL_BOUNDING;
}
