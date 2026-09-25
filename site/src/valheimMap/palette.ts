/**
 * Los colores del mapa: los del minimapa del juego (`Minimap.GetPixelColor`),
 * con el agua según su profundidad y un sombreado de relieve con luz del
 * noroeste, como el mapa del juego.
 *
 * Funciones puras sobre números: corren en los Web Workers, sin objetos por píxel.
 */
import { BIOME } from "./engine/contract";

/** Nivel del mar del juego (`ZoneSystem.m_waterLevel`). */
export const WATER_LEVEL = 30;

/** Color de cada bioma (0-255), el del minimapa del juego. */
export const BIOME_RGB: Record<number, [number, number, number]> = {
  [BIOME.Meadows]: [146, 167, 92],
  [BIOME.BlackForest]: [107, 116, 63],
  [BIOME.Swamp]: [163, 114, 88],
  [BIOME.Mountain]: [235, 238, 245],
  [BIOME.Plains]: [231, 171, 120],
  [BIOME.Mistlands]: [72, 72, 82],
  [BIOME.AshLands]: [176, 49, 49],
  [BIOME.DeepNorth]: [214, 228, 247],
  [BIOME.Ocean]: [40, 70, 110],
};

/** Los biomas en el orden de la leyenda (el de progresión del juego). */
export const BIOME_ORDER = [BIOME.Meadows, BIOME.BlackForest, BIOME.Swamp, BIOME.Mountain, BIOME.Plains,
  BIOME.Ocean, BIOME.Mistlands, BIOME.AshLands, BIOME.DeepNorth];

/** El id del sitio para cada bit (para enlazar a la guía del bioma y traducir). */
export const BIOME_ID: Record<number, string> = {
  [BIOME.Meadows]: "meadows", [BIOME.BlackForest]: "blackforest", [BIOME.Swamp]: "swamp", [BIOME.Mountain]: "mountain",
  [BIOME.Plains]: "plains", [BIOME.Ocean]: "ocean", [BIOME.Mistlands]: "mistlands", [BIOME.AshLands]: "ashlands",
  [BIOME.DeepNorth]: "deepnorth",
};

export type Layer = "relief" | "biomes" | "height";

/**
 * El color de un punto en RGB (escribe en `out[o..o+2]`).
 * `slope` es la diferencia de altura hacia el noroeste (para el sombreado).
 */
export function shade(out: Uint8ClampedArray, o: number, biome: number, h: number, slope: number, layer: Layer, outside: boolean): void {
  if (outside) {
    out[o] = 8; out[o + 1] = 10; out[o + 2] = 16; out[o + 3] = 255;
    return;
  }
  let r: number, g: number, b: number;
  if (layer === "height") {
    // Hipsométrico: agua azul por profundidad, tierra de verde a blanco.
    if (h < WATER_LEVEL) {
      const d = Math.min(1, (WATER_LEVEL - h) / 60);
      r = 30 - 20 * d; g = 90 - 50 * d; b = 150 - 60 * d;
    } else {
      const t = Math.min(1, (h - WATER_LEVEL) / 220);
      r = 70 + 185 * t; g = 120 + 130 * t; b = 60 + 195 * t;
    }
  } else if (h < WATER_LEVEL && !(biome === BIOME.Mountain)) {
    // Agua: cuanto más honda, más oscura. En la Tierra de Ceniza, el mar hierve (más rojizo).
    const d = Math.min(1, (WATER_LEVEL - h) / 50);
    if (biome === BIOME.AshLands) {
      r = 110 - 50 * d; g = 60 - 30 * d; b = 55 - 25 * d;
    } else {
      r = 58 - 38 * d; g = 98 - 58 * d; b = 138 - 68 * d;
    }
  } else {
    const c = BIOME_RGB[biome] ?? [120, 120, 120];
    r = c[0]; g = c[1]; b = c[2];
  }
  if (layer === "relief" && h >= WATER_LEVEL - 1) {
    // Luz del noroeste: la ladera que mira a la luz se aclara, la otra se oscurece.
    const k = Math.max(-0.45, Math.min(0.45, slope * 0.045));
    if (k > 0) { r += (255 - r) * k * 0.6; g += (255 - g) * k * 0.6; b += (255 - b) * k * 0.6; }
    else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  }
  out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
}
