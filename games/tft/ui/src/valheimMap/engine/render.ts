// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Render/MapRenderer.cs, MapPalette.cs y Canvas.cs (Rgb)
/**
 * El color de cada píxel del mapa, como el renderizador de SeedLab: relleno de
 * bioma (los bytes medidos en la caché del minimapa del juego), agua sombreada
 * por profundidad, lava de la Tierra de Ceniza y sombreado de relieve (luz del
 * noroeste a 45°).
 *
 * Funciones puras sobre números (colores empaquetados 0xRRGGBB): corren en los
 * Web Workers sin asignar nada por píxel. Los redondeos son los de .NET
 * (`Math.Round` al par) para que un píxel salga igual que en SeedLab.
 */
import { BIOME } from "./contract";
import { roundHalfEven } from "./unityMath";

/** Nivel del agua (`Minimap`/`AltBiomeWorldData`): por debajo de 30 m es agua. */
export const WATER_LEVEL = 30;

const rgb = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;

/**
 * Los colores del juego, medidos en la `cacheMinimapBiome` real (semilla
 * -1772362158, verificados en 319486907). Son los del prefab, NO los del código
 * de `Minimap` (p. ej. Pradera es 146,167,92, no 115,255,110).
 */
export const MAP_COLORS = {
  meadows: rgb(146, 167, 92),
  swamp: rgb(163, 114, 88),
  blackForest: rgb(107, 116, 63),
  plains: rgb(231, 171, 120),
  mistlands: rgb(51, 51, 51),
  ashLands: rgb(123, 32, 32),
  white: rgb(255, 255, 255),
  /** Montaña: el blanco del juego. */
  mountain: rgb(255, 255, 255),
  /** Norte profundo: el juego lo pinta blanco como la Montaña; SeedLab usa #E8F0FF para distinguirlo. */
  deepNorth: rgb(232, 240, 255),
  /** Agua justo en la orilla (30 m). */
  waterShallow: 0x3e6e8c,
  /** Agua a 120 m bajo la orilla o más. */
  waterDeep: 0x10203a,
  /** Fuera del borde de 10.500 m. */
  void: 0x080d14,
  /** Lava (máscara de Ceniza > 0.6). */
  lava: 0xff5a1e,
} as const;

/** `Minimap.GetPixelColor(biome)`, byte por byte (Océano, Montaña y Norte profundo en blanco). */
export function gameColor(biome: number): number {
  switch (biome) {
    case BIOME.Meadows: return MAP_COLORS.meadows;
    case BIOME.Swamp: return MAP_COLORS.swamp;
    case BIOME.BlackForest: return MAP_COLORS.blackForest;
    case BIOME.Plains: return MAP_COLORS.plains;
    case BIOME.Mistlands: return MAP_COLORS.mistlands;
    case BIOME.AshLands: return MAP_COLORS.ashLands;
    default: return MAP_COLORS.white;
  }
}

/** La paleta legible de SeedLab: la del juego con el Norte profundo separado y el océano azul. */
export function landColor(biome: number): number {
  switch (biome) {
    case BIOME.Meadows: return MAP_COLORS.meadows;
    case BIOME.Swamp: return MAP_COLORS.swamp;
    case BIOME.BlackForest: return MAP_COLORS.blackForest;
    case BIOME.Plains: return MAP_COLORS.plains;
    case BIOME.Mistlands: return MAP_COLORS.mistlands;
    case BIOME.AshLands: return MAP_COLORS.ashLands;
    case BIOME.Mountain: return MAP_COLORS.mountain;
    case BIOME.DeepNorth: return MAP_COLORS.deepNorth;
    case BIOME.Ocean: return MAP_COLORS.waterShallow;
    default: return MAP_COLORS.white;
  }
}

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/** `Rgb.Lerp`: por canal, `Math.Round` al par y recorte a 0-255. */
export function lerpColor(a: number, b: number, t: number): number {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return rgb(
    clampByte(roundHalfEven(ar + (br - ar) * t)),
    clampByte(roundHalfEven(ag + (bg - ag) * t)),
    clampByte(roundHalfEven(ab + (bb - ab) * t)),
  );
}

/** `Rgb.Scale`: multiplica cada canal y redondea al par. */
export function scaleColor(c: number, f: number): number {
  return rgb(
    clampByte(roundHalfEven(((c >> 16) & 255) * f)),
    clampByte(roundHalfEven(((c >> 8) & 255) * f)),
    clampByte(roundHalfEven((c & 255) * f)),
  );
}

/** Agua bajo los 30 m: `t = clamp01((30 - h) / 120)`, de la orilla a lo hondo. */
export function waterColor(h: number): number {
  let t = (WATER_LEVEL - h) / 120.0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return lerpColor(MAP_COLORS.waterShallow, MAP_COLORS.waterDeep, t);
}

/**
 * El byte de lava que guarda SeedLab por punto de Ceniza:
 * `(byte)Math.Round(Clamp(mask.a, 0, 1) * 255f)`, con `mask.a` de
 * `getAshlandsHeight(x, z, cheap = true)` (la versión del minimapa).
 */
export function lavaByte(maskA: number): number {
  const a = maskA < 0 ? 0 : maskA > 1 ? 1 : maskA;
  return roundHalfEven(Math.fround(a * 255));
}

export interface PaintOptions {
  /** "seedlab" (legible, por defecto) o "game" (`GetPixelColor` tal cual, sin agua ni lava). */
  palette: "seedlab" | "game";
  /** Sin relieve (para el relleno plano de SeedLab, pon además `water` y `lava` en false). */
  plain: boolean;
  /** Fuerza del sombreado; 0 lo apaga. 0.35 es el "~35 %" de SeedLab. */
  shade: number;
  /** Exageración vertical del gradiente antes de sombrear. */
  exaggeration: number;
  /** Pintar por profundidad todo lo que esté bajo los 30 m. */
  water: boolean;
  /** Pintar la lava (byte de lava > 0.6·255). */
  lava: boolean;
}

export const DEFAULT_PAINT: PaintOptions = {
  palette: "seedlab", plain: false, shade: 0.35, exaggeration: 1.5, water: true, lava: true,
};

// La luz: azimut 315° (noroeste), altura 45°. Constantes del sombreado de Lambert.
const AZ = (315.0 * Math.PI) / 180.0;
const ALT = (45.0 * Math.PI) / 180.0;
const LX = Math.cos(ALT) * Math.sin(AZ);
const LY = Math.cos(ALT) * Math.cos(AZ);
const LZ = Math.sin(ALT);

/** El relleno de un punto, antes del relieve (pasos 1-2 del renderizador). */
export function fillColor(biome: number, h: number, outside: boolean, lava: number, o: PaintOptions = DEFAULT_PAINT): number {
  // La paleta del juego colorea el bioma sin condiciones, también fuera del borde.
  if (o.palette === "game") return gameColor(biome);
  if (outside) return MAP_COLORS.void;
  // Como en SeedLab, `plain` no apaga el agua ni la lava: eso lo deciden `water` y `lava`.
  if (o.water && h < WATER_LEVEL) return waterColor(h);
  let c = landColor(biome);
  if (o.lava && biome === BIOME.AshLands) {
    const a = lava / 255.0;
    if (a > 0.6) c = lerpColor(c, MAP_COLORS.lava, (a - 0.6) / 0.4);
  }
  return c;
}

/**
 * El factor de relieve de un punto (1 = llano). `hw/he/hs/hn`: alturas de los
 * vecinos oeste, este, sur y norte a `spacing` metros; un vecino fuera del
 * mundo se pasa como WATER_LEVEL (si no, el -400 dibuja un acantilado falso),
 * y en el borde de la grilla se repite la altura propia.
 */
export function shadeFactor(h: number, hw: number, he: number, hs: number, hn: number, spacing: number, o: PaintOptions = DEFAULT_PAINT): number {
  const inv2s = o.exaggeration / (2.0 * spacing);
  const dzdx = (he - hw) * inv2s;
  const dzdy = (hn - hs) * inv2s;
  const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1.0);
  const dot = (-dzdx * LX - dzdy * LY + LZ) / len;
  const rel = dot / LZ; // 1.0 en terreno llano
  const strength = o.water && h < WATER_LEVEL ? o.shade * 0.5 : o.shade;
  let f = 1.0 + strength * (rel - 1.0);
  const lo = 1.0 - strength * 1.4;
  const hi = 1.0 + strength * 0.9;
  f = f < lo ? lo : f > hi ? hi : f;
  return f;
}

/**
 * Escribe el RGBA de un punto en `out[o..o+3]`: relleno + relieve, como un
 * píxel de `MapRenderer.Render`. `lava`: el byte de `lavaByte` (0 si no aplica).
 */
export function paintPixel(
  out: Uint8ClampedArray, o: number, biome: number, h: number,
  hw: number, he: number, hs: number, hn: number, spacing: number,
  outside: boolean, lava = 0, opts: PaintOptions = DEFAULT_PAINT,
): void {
  let c = fillColor(biome, h, outside, lava, opts);
  if (!opts.plain && opts.shade > 0 && !outside) c = scaleColor(c, shadeFactor(h, hw, he, hs, hn, spacing, opts));
  out[o] = (c >> 16) & 255;
  out[o + 1] = (c >> 8) & 255;
  out[o + 2] = c & 255;
  out[o + 3] = 255;
}

/**
 * Pinta una grilla entera (`w × h` puntos a `spacing` metros) en `out` (RGBA).
 * Orden de imagen: la fila 0 es la de ARRIBA (el norte). `outside[k]` = 1 fuera
 * del borde de 10.500 m; `lava` opcional (bytes de `lavaByte`).
 */
export function paintGrid(
  out: Uint8ClampedArray, biomes: ArrayLike<number>, heights: ArrayLike<number>,
  w: number, h: number, spacing: number,
  outside?: ArrayLike<number>, lava?: ArrayLike<number>, opts: PaintOptions = DEFAULT_PAINT,
): void {
  const hAt = (k: number): number => (outside && outside[k] ? WATER_LEVEL : heights[k]);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const k = row * w + col;
      const kw = col > 0 ? k - 1 : k;
      const ke = col < w - 1 ? k + 1 : k;
      const kn = row > 0 ? k - w : k; // norte = fila de arriba
      const ks = row < h - 1 ? k + w : k;
      paintPixel(out, k * 4, biomes[k], heights[k], hAt(kw), hAt(ke), hAt(ks), hAt(kn), spacing,
        !!(outside && outside[k]), lava ? lava[k] : 0, opts);
    }
  }
}
