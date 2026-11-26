/**
 * La ruleta de builds (2026-11-25): un héroe al azar y una build armada con
 * reglas, como desafío. Plan: la cola de ideas del 25/11.
 *
 * Las reglas, para que salga algo jugable y no doce objetos sueltos:
 * - Cuatro etapas por precio, como la tienda: 800, 1.600, 3.200 y 6.400 almas.
 * - En cada etapa, uno de arma, uno de vitalidad y uno de espíritu.
 * - Nunca un objeto y su mejora (o su componente): cada uno ocupa su casilla,
 *   así que son las 12 casillas justas.
 *
 * Todo sale de una semilla. La del día es la fecha (UTC), así que el desafío
 * es el mismo para todos; "girar otra" usa una semilla nueva, que viaja en el
 * link (`?s=`) para poder compartirla.
 */

export type RouletteSlot = "weapon" | "vitality" | "spirit";

export interface RouletteItem {
  itemId: number;
  cost: number;
  slot: RouletteSlot;
  /** Toda la cadena: componentes y mejoras, en todos los escalones. */
  related: number[];
}

export interface RouletteSpin {
  seed: number;
  heroId: number;
  /** Cuatro etapas de tres objetos: arma, vitalidad, espíritu (en ese orden). */
  stages: number[][];
}

export const STAGE_COSTS = [800, 1600, 3200, 6400] as const;
const SLOTS: RouletteSlot[] = ["weapon", "vitality", "spirit"];

/** mulberry32: chico, rápido y con la misma secuencia en cualquier navegador. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** La semilla del día: 20261125 para el 25/11/2026 (UTC). */
export function dailySeed(d: Date = new Date()): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** La fecha de una semilla del día, o `null` si es una semilla al azar. */
export function seedDate(seed: number): Date | null {
  if (seed < 20200101 || seed > 21001231) return null;
  const y = Math.floor(seed / 10000);
  const m = Math.floor(seed / 100) % 100;
  const d = seed % 100;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** Una semilla nueva al azar, fuera del rango de las del día. */
export const randomSeed = (): number => 100_000_000 + Math.floor(Math.random() * 1_900_000_000);

/**
 * Gira la ruleta. `heroIds` y `items` tienen que venir siempre en el mismo
 * orden (por id) para que la misma semilla dé lo mismo en todos lados.
 * Devuelve `null` si no hay héroes o si alguna etapa no tiene de qué elegir.
 */
export function spin(seed: number, heroIds: number[], items: RouletteItem[]): RouletteSpin | null {
  if (heroIds.length === 0) return null;
  const r = rng(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const heroId = pick([...heroIds].sort((a, b) => a - b));
  const ordenados = [...items].sort((a, b) => a.itemId - b.itemId);
  const tomados = new Set<number>();
  const prohibidos = new Set<number>();
  const stages: number[][] = [];
  for (const cost of STAGE_COSTS) {
    const etapa: number[] = [];
    for (const slot of SLOTS) {
      const opciones = ordenados.filter((i) => i.cost === cost && i.slot === slot && !tomados.has(i.itemId) && !prohibidos.has(i.itemId));
      if (opciones.length === 0) return null;
      const it = pick(opciones);
      etapa.push(it.itemId);
      tomados.add(it.itemId);
      for (const id of it.related) prohibidos.add(id);
    }
    stages.push(etapa);
  }
  return { seed, heroId, stages };
}

/** Lee `?s=` del link: un entero positivo, o `null`. */
export function parseSeed(s: string | null): number | null {
  if (!s || !/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n < 2 ** 32 ? n : null;
}
