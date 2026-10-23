/**
 * Motor de la calculadora de ganancias de cultivos de Stardew Valley (1.6.15). TypeScript puro: recibe los datos de
 * `games/stardew/data/crops.json` por parámetro y no importa nada del sitio.
 *
 * Las cuentas siguen las del juego:
 * - Velocidad (`HoeDirt.applySpeedIncreases`): se quitan `ceil(total × velocidad)` días de a uno por fase, en hasta 3
 *   vueltas; la primera fase sólo baja si vale más de 1 y las demás pueden quedar en 0. El juego multiplica en `float`
 *   (32 bits), por eso las cuentas pasan por `Math.fround`: con doble precisión, 20 × 0,35 daría 7,000…01 y un día de más.
 * - Calidad y cantidad (`Crop.harvest`): la calidad sale sólo en la primera unidad; las extra salen en calidad normal.
 *   La cantidad es pareja entre `min` y `max + floor(nivel × perLevel)`, más las extra con probabilidad `min(0,9; p)`
 *   repetida (geométrica: `p / (1 − p)` en promedio).
 * - Precio (`Object.sellToStorePrice`): `floor(base × (1 + calidad × 0,25))` y después los multiplicadores de profesión
 *   (Labrador ×1,1 en verdura, fruta y flor; Artesano ×1,4 en los productos artesanales), truncado.
 */

/** Un texto en [inglés, español]. */
export type Pair = [string, string];

export interface Product {
  machine: string;
  machineName: Pair;
  name: Pair;
  price: number;
  days: number;
  /** Unidades de cultivo por producto (5 en el deshidratador y en el Café). */
  per: number;
  /** Producto artesanal (categoría −26): el Artesano le suma 40 %. El Café no lo es. */
  artisan: boolean;
}

export interface Crop {
  seed: string;
  harvest: string;
  slug: string;
  slugEs: string;
  name: Pair;
  /** 0 primavera, 1 verano, 2 otoño, 3 invierno. */
  seasons: number[];
  phases: number[];
  /** Días entre cosechas si rebrota; −1 si no. */
  regrow: number;
  /** [mínimo, máximo] por cosecha. */
  stack: [number, number];
  extraChance: number;
  perLevel: number;
  raised: boolean;
  paddy: boolean;
  price: number;
  cat: number;
  /**
   * Lo que cuesta la semilla en una tienda fija o, si sólo la vende un festival, ahí (`seedFestival`); null si no se
   * vende en ninguna (carro ambulante, monstruos…).
   */
  seedPrice: number | null;
  /** La tienda, o el nombre del festival si `seedFestival`. */
  seedShop: Pair | null;
  /** La semilla sólo se vende en un festival (la Fresa en el Festival del Huevo). */
  seedFestival?: boolean;
  /** Semilla silvestre: da una recolección al azar de la estación; `harvest` es sólo una de las posibles. */
  wild?: boolean;
  products: Product[];
  /** Calidad máxima de la cosecha (0 = siempre normal: Fibra y Fruta Qi). Si falta, no hay tope. */
  maxQuality?: number | null;
}

export interface FruitTree {
  sapling: string;
  harvest: string;
  slug: string;
  slugEs: string;
  name: Pair;
  treeName: Pair;
  seasons: number[];
  price: number;
  cat: number;
  saplingPrice: number | null;
  saplingShop: Pair | null;
  products: Product[];
}

export interface CropsData {
  crops: Crop[];
  fruitTrees: FruitTree[];
}

export type Fert = "none" | "basic" | "quality" | "deluxe" | "speed" | "deluxeSpeed" | "hyper";

export interface Opts {
  season: 0 | 1 | 2 | 3;
  /** 1–28 */
  day: number;
  /** 0–10 */
  level: number;
  fert: Fert;
  tiller: boolean;
  agriculturist: boolean;
  artisan: boolean;
  /** "best": el mejor entre crudo y cada producto. */
  sell: "raw" | "best";
  seeds: "buy" | "own";
  greenhouse: boolean;
  /**
   * Arrozal: +0,25 de velocidad a los cultivos `paddy` (Arroz, Taro), como en el juego cuando la tierra está regada
   * y junto al agua. La pestaña lo exporta prendido por defecto.
   */
  paddyBonus: boolean;
}

export type Best = "raw" | `(BC)${string}`;

export interface Profit {
  harvests: number;
  /** Unidades cosechadas (promedio). */
  yield: number;
  gross: number;
  seedCost: number;
  net: number;
  perDay: number;
  best: Best;
  /** Se pidió comprar semillas y la semilla no tiene precio fijo: el costo se tomó como 0. */
  seedUnknown: boolean;
  /** Fuera del invernadero, la estación elegida no está en `seasons`: no se planta (0 cosechas, sin costo). */
  outOfSeason: boolean;
}

const f = Math.fround;
const SEASON_DAYS = 28;
/** En el invernadero se cuenta un año desde la siembra: 4 estaciones de 28 días. */
const GREENHOUSE_DAYS = 4 * SEASON_DAYS;

/** Nivel de calidad del fertilizante (0–3). */
const FERT_QUALITY: Record<Fert, number> = { none: 0, basic: 1, quality: 2, deluxe: 3, speed: 0, deluxeSpeed: 0, hyper: 0 };
/** Velocidad del fertilizante. */
const FERT_SPEED: Record<Fert, number> = { none: 0, basic: 0, quality: 0, deluxe: 0, speed: 0.1, deluxeSpeed: 0.25, hyper: 0.33 };

/** Categorías a las que Labrador suma 10 %: verdura, fruta y flor. */
const TILLER_CATS = new Set([-75, -79, -80]);
/** Multiplicador de precio por calidad: normal, plata, oro, iridio (el juego guarda el iridio como calidad 4). */
const QUALITY_LEVEL = [0, 1, 2, 4];

/**
 * Velocidad de crecimiento con las opciones, sumada en `float` y en el orden del juego: fertilizante, +0,25 del arrozal
 * (si el cultivo es `paddy` y `paddyBonus` está prendido) y +0,10 de Agricultor.
 */
export function speedOf(opts: Pick<Opts, "fert" | "agriculturist" | "paddyBonus">, paddy = false): number {
  let s = f(FERT_SPEED[opts.fert]);
  if (paddy && opts.paddyBonus) s = f(s + f(0.25));
  if (opts.agriculturist) s = f(s + f(0.1));
  return s;
}

/** Días de crecimiento con la reducción del juego. */
export function growDays(phases: number[], speed: number): number {
  const p = phases.slice();
  const total = p.reduce((a, b) => a + b, 0);
  if (!(speed > 0)) return total;
  let remove = Math.ceil(f(f(total) * f(speed)));
  for (let tries = 0; remove > 0 && tries < 3; tries++) {
    for (let i = 0; i < p.length; i++) {
      if ((i > 0 || p[i] > 1) && p[i] > 0) {
        p[i]--;
        remove--;
      }
      if (remove <= 0) break;
    }
  }
  return p.reduce((a, b) => a + b, 0);
}

/** Probabilidades finales [normal, plata, oro, iridio] de la unidad con calidad. */
export function qualityOdds(level: number, fert: Fert): [number, number, number, number] {
  const q = FERT_QUALITY[fert];
  const gold = 0.2 * (level / 10) + 0.2 * q * ((level + 2) / 12) + 0.01;
  const silver = Math.min(0.75, gold * 2);
  const iridium = q >= 3 ? gold / 2 : 0;
  let rest = 1 - iridium;
  const g = rest * gold;
  rest -= g;
  const s = q >= 3 ? rest : rest * silver;
  rest -= s;
  return [rest, s, g, iridium];
}

/**
 * Último día (contado desde el 1 de la estación de siembra) en que todavía se puede cosechar; 0 si no se puede plantar.
 * En el invernadero, un año: del día de siembra a 111 días después.
 */
function lastDay(crop: Crop, opts: Opts): number {
  if (opts.greenhouse) return opts.day + GREENHOUSE_DAYS - 1;
  if (!crop.seasons.includes(opts.season)) return 0;
  let n = 1;
  while (n < 4 && crop.seasons.includes((opts.season + n) % 4)) n++;
  return n * SEASON_DAYS;
}

/**
 * Días de cosecha, contados desde el 1 de la estación de siembra (el 3 de otoño de un Maíz de verano es 31).
 * Los que rebrotan se plantan una vez; los demás se replantan al cosechar mientras lleguen a madurar.
 */
export function harvests(crop: Crop, opts: Opts): number[] {
  const end = lastDay(crop, opts);
  const out: number[] = [];
  if (end < opts.day) return out;
  const grow = growDays(crop.phases, speedOf(opts, crop.paddy));
  if (crop.regrow > 0) {
    for (let d = opts.day + grow; d <= end; d += crop.regrow) out.push(d);
  } else {
    for (let d = opts.day + Math.max(1, grow); d <= end; d += Math.max(1, grow)) out.push(d);
  }
  return out;
}

/** Precio de venta de una unidad cruda de la calidad `qi` (0 normal … 3 iridio). */
function rawPrice(crop: Crop, qi: number, tiller: boolean): number {
  const base = Math.trunc(f(f(crop.price) * f(1 + QUALITY_LEVEL[qi] * 0.25)));
  if (!tiller || !TILLER_CATS.has(crop.cat)) return base;
  return Math.trunc(f(f(base) * f(1.1)));
}

/** Aplica el tope de calidad del cultivo: lo que pase del tope cae en el tope (como el `Clamp` del juego). */
function capQuality(odds: [number, number, number, number], max: number | null | undefined): [number, number, number, number] {
  if (max == null) return odds;
  let top = 0;
  QUALITY_LEVEL.forEach((l, qi) => { if (l <= max) top = qi; });
  const out: [number, number, number, number] = [0, 0, 0, 0];
  odds.forEach((p, qi) => (out[Math.min(qi, top)] += p));
  return out;
}

/** Unidades promedio por cosecha. */
function unitsPerHarvest(crop: Crop, level: number): number {
  const min = crop.stack[0];
  let max = Math.max(min, crop.stack[1]);
  if (crop.perLevel > 0) max += Math.trunc(f(f(level) * f(crop.perLevel)));
  const stack = min > 1 || max > 1 ? (min + max) / 2 : 1;
  const p = Math.min(0.9, crop.extraChance);
  return stack + (p > 0 ? p / (1 - p) : 0);
}

export function profit(crop: Crop, opts: Opts): Profit {
  const outOfSeason = !opts.greenhouse && !crop.seasons.includes(opts.season);
  const days = harvests(crop, opts);
  const n = days.length;
  const units = unitsPerHarvest(crop, opts.level);

  // Crudo: la primera unidad con calidad, el resto en normal.
  const odds = capQuality(qualityOdds(opts.level, opts.fert), crop.maxQuality);
  const prices = [0, 1, 2, 3].map((qi) => rawPrice(crop, qi, opts.tiller));
  const first = odds.reduce((a, p, qi) => a + p * prices[qi], 0);
  let perHarvest = first + (units - 1) * prices[0];
  let best: Best = "raw";

  if (opts.sell === "best") {
    for (const pr of crop.products) {
      const each = opts.artisan && pr.artisan ? Math.trunc(f(f(pr.price) * f(1.4))) : pr.price;
      const value = (units * each) / pr.per;
      if (value > perHarvest) {
        perHarvest = value;
        best = pr.machine as Best;
      }
    }
  }

  const gross = n * perHarvest;
  let seedCost = 0;
  let seedUnknown = false;
  if (opts.seeds === "buy" && !outOfSeason) {
    if (crop.seedPrice == null) seedUnknown = true;
    else seedCost = crop.seedPrice * (crop.regrow > 0 ? 1 : Math.max(1, n));
  }
  const net = gross - seedCost;
  const span = n > 0 ? days[n - 1] - opts.day : lastDay(crop, opts) - opts.day;
  return { harvests: n, yield: n * units, gross, seedCost, net, perDay: net / Math.max(1, span), best, seedUnknown, outOfSeason };
}
