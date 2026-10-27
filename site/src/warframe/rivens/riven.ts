/**
 * Las cuentas de la calculadora de Rivens (2026-10-27). `v = value × 10 × (rango + 1) × D × L × W`, mostrado como
 * `100 × v` %: `value` es el del export para ese tipo de Riven, `D` la disposición (desde el Hotfix 44.1.3 vale 1,2 para
 * todas), `L` según cuántos positivos hay y si hay negativo, y `W` la tirada, entre 0,9 y 1,1. Se ofrece sólo el rango 8:
 * los intermedios no están verificados contra el juego.
 */

/** Cantidad de positivos (2 o 3) y, con "-", un negativo. */
export type Combo = "2" | "2-" | "3" | "3-";
export const COMBOS: Combo[] = ["2", "2-", "3", "3-"];

/** El multiplicador L de cada combinación para un positivo y para el negativo. */
const L: Record<Combo, { pos: number; neg: number | null }> = {
  "2": { pos: 0.99, neg: null },
  "2-": { pos: 1.2375, neg: -0.495 },
  "3": { pos: 0.75, neg: null },
  "3-": { pos: 0.9375, neg: -0.75 },
};
/** La tirada: el valor mínimo y el máximo de un stat salen de W = 0,9 y W = 1,1. */
const W_MIN = 0.9;
const W_MAX = 1.1;

const at = (value: number, d: number, combo: Combo, curse: boolean, rank: number, w: number): number => {
  const l = curse ? L[combo].neg : L[combo].pos;
  if (l === null) throw new Error(`La combinación ${combo} no tiene negativo`);
  return value * 10 * (rank + 1) * d * l * w * 100;
};

/** El rango, en %, de un stat: `[mínimo, máximo]` (W = 0,9 y W = 1,1). Para el negativo, `curse = true`. */
export function rivenRange(value: number, d: number, combo: Combo, curse: boolean, rank: 8 = 8): [min: number, max: number] {
  return [at(value, d, combo, curse, rank, W_MIN), at(value, d, combo, curse, rank, W_MAX)];
}

/**
 * Qué tan buena salió una tirada, de 0 a 100, o null si cae fuera del rango (con un margen por el redondeo que muestra
 * el juego). `shown` va con su signo, en %. En un positivo 100 es el máximo; en un negativo, el que menos resta (W bajo).
 */
export function rivenGrade(value: number, d: number, combo: Combo, curse: boolean, shown: number): number | null {
  const [lo, hi] = rivenRange(value, d, combo, curse);
  if (!Number.isFinite(shown) || lo === hi) return null;
  const t = (shown - lo) / (hi - lo);
  // Margen de media centésima de punto: el juego muestra la cifra redondeada.
  const eps = 0.005 / Math.abs(hi - lo);
  if (t < -eps || t > 1 + eps) return null;
  const g = Math.min(1, Math.max(0, t)) * 100;
  return curse ? 100 - g : g;
}

/**
 * Cómo escribe el juego cada stat: casi todos en % (`pct`); eficiencia de munición y chance de combo usan −100v (`flip`);
 * el daño a una facción es un multiplicador ×(1 + v) (`factor`).
 */
export type Shown = "pct" | "flip" | "factor";
export function rivenShown(tag: string): Shown {
  if (/^Weapon(Melee)?FactionDamage/.test(tag)) return "factor";
  if (tag === "WeaponAmmoEfficiency" || tag === "WeaponMeleeComboPointsOnHitMod") return "flip";
  return "pct";
}
/** De la cuenta (en %) a la cifra que muestra el juego. */
export function rivenToShown(tag: string, pct: number): number {
  const k = rivenShown(tag);
  return k === "flip" ? -pct : k === "factor" ? 1 + pct / 100 : pct;
}
/** De la cifra que muestra el juego a la cuenta (en %). */
export function rivenFromShown(tag: string, shown: number): number {
  const k = rivenShown(tag);
  return k === "flip" ? -shown : k === "factor" ? (shown - 1) * 100 : shown;
}
