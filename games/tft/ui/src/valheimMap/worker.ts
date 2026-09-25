/**
 * El Web Worker del mapa: calcula un rectángulo del mundo (bioma y altura por
 * píxel) y lo devuelve pintado. Cada worker crea el mundo de la semilla una
 * sola vez; varios en paralelo (`pool.ts`) reparten la grilla.
 *
 * Los colores son los del minimapa del juego (`engine/render.ts`, medidos por
 * SeedLab): relieve con luz del noroeste, agua por profundidad y lava.
 */
import { createWorld, DEFAULT_PAINT, lavaByte, paintPixel, WATER_LEVEL, type EngineWorld, type PaintOptions } from "./engine";
import { shade, type Layer } from "./palette";

/** Radio del borde del mundo (el agua sin fondo empieza a los 10.500 m). */
const EDGE = 10500;
const FLAT: PaintOptions = { ...DEFAULT_PAINT, plain: true };

export interface RegionRequest {
  type: "region";
  id: number;
  seed: string;
  /** Esquina noroeste (x mínima, z máxima) y metros por píxel. */
  x0: number;
  z0: number;
  step: number;
  w: number;
  h: number;
  layer: Layer;
}
export interface RegionResult {
  id: number;
  pixels: Uint8ClampedArray;
  /** El bioma de cada píxel (bit del juego, en u16), para leerlo bajo el cursor. */
  biomes: Uint16Array;
  heights: Float32Array;
  ms: number;
  error?: string;
}

let world: EngineWorld | null = null;
let worldSeed = "";

self.onmessage = (ev: MessageEvent<RegionRequest>) => {
  const q = ev.data;
  if (q.type !== "region") return;
  const t0 = performance.now();
  try {
    if (!world || worldSeed !== q.seed) {
      world = createWorld(q.seed) as EngineWorld;
      worldSeed = q.seed;
    }
    const gen = world.generator;
    const { w, h, step } = q;
    // Un píxel de más en cada lado: el relieve mira a los cuatro vecinos.
    const W = w + 2, H = h + 2;
    const hs = new Float32Array(W * H);
    const bs = new Uint16Array(W * H);
    const lava = new Uint8Array(W * H);
    const out = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) {
      const z = q.z0 - (j - 1) * step;
      for (let i = 0; i < W; i++) {
        const x = q.x0 + (i - 1) * step;
        const k = j * W + i;
        if (x * x + z * z > EDGE * EDGE) {
          hs[k] = WATER_LEVEL;
          out[k] = 1;
          continue;
        }
        bs[k] = world.biome(x, z);
        hs[k] = world.height(x, z);
        lava[k] = lavaByte(gen.maskA);
      }
    }
    const pixels = new Uint8ClampedArray(w * h * 4);
    const biomes = new Uint16Array(w * h);
    const heights = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = (j + 1) * W + (i + 1);
        const p = j * w + i;
        if (q.layer === "height") {
          const slope = hs[k] - hs[k - W - 1];
          shade(pixels, p * 4, bs[k], hs[k], slope * (20 / Math.max(step, 1)) * 0.05, "height", out[k] === 1);
        } else {
          paintPixel(pixels, p * 4, bs[k], hs[k], hs[k - 1], hs[k + 1], hs[k + W], hs[k - W], step,
            out[k] === 1, lava[k], q.layer === "biomes" ? FLAT : DEFAULT_PAINT);
        }
        biomes[p] = out[k] ? 0 : bs[k];
        heights[p] = out[k] ? -400 : hs[k];
      }
    }
    const res: RegionResult = { id: q.id, pixels, biomes, heights, ms: performance.now() - t0 };
    (self as unknown as Worker).postMessage(res, [pixels.buffer, biomes.buffer, heights.buffer]);
  } catch (e) {
    const res: RegionResult = { id: q.id, pixels: new Uint8ClampedArray(0), biomes: new Uint16Array(0), heights: new Float32Array(0), ms: 0, error: String(e) };
    (self as unknown as Worker).postMessage(res);
  }
};
