/**
 * Las cuentas con que el juego escribe el tooltip de un objeto (2026-10-12), sin React: velocidad y retroceso en
 * palabras, monedas, y el color de cada rareza. Los umbrales son los de `Main.MouseText_DrawItemTooltip`.
 */

/** La velocidad de uso, de 0 ("Insanely fast") a 7 ("Snail"): índice de `copy.items.speeds`. */
export function speedTier(useAnimation: number): number {
  const limits = [8, 20, 25, 30, 35, 45, 55];
  const i = limits.findIndex((l) => useAnimation <= l);
  return i === -1 ? 7 : i;
}

/** El retroceso, de 0 ("No knockback") a 8 ("Insane"): índice de `copy.items.knockbacks`. */
export function knockbackTier(knockBack: number): number {
  if (knockBack === 0) return 0;
  const limits = [1.5, 3, 4, 6, 7, 9, 11];
  const i = limits.findIndex((l) => knockBack <= l);
  return i === -1 ? 8 : i + 1;
}

/** El precio de venta (un quinto del valor) en platino, oro, plata y cobre. */
export function sellCoins(value: number): [platinum: number, gold: number, silver: number, copper: number] {
  const v = Math.floor(value / 5);
  return [Math.floor(v / 1_000_000), Math.floor(v / 10_000) % 100, Math.floor(v / 100) % 100, v % 100];
}

/** Un precio de compra en platino, oro, plata y cobre. */
export function buyCoins(value: number): [platinum: number, gold: number, silver: number, copper: number] {
  return [Math.floor(value / 1_000_000), Math.floor(value / 10_000) % 100, Math.floor(value / 100) % 100, value % 100];
}

/** El color del nombre según la rareza, como en el juego. Experto y Maestro (arcoíris y fuego) van con un color fijo. */
const RARITY: Record<number, string> = {
  [-13]: "#ff8c1a",
  [-12]: "#ff9df0",
  [-11]: "#ffaf00",
  [-1]: "#828282",
  0: "#ffffff",
  1: "#9696ff",
  2: "#96ff96",
  3: "#ffc896",
  4: "#ff9696",
  5: "#ff96ff",
  6: "#d2a0ff",
  7: "#96ff0a",
  8: "#ffff0a",
  9: "#05c8ff",
  10: "#ff2864",
  11: "#b428ff",
};
export const rarityColor = (rare: number): string => RARITY[rare] ?? RARITY[0];

/** Las rarezas que se pueden elegir en el filtro, de menor a mayor. */
export const RARITIES = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, -11, -12, -13];

/** Una probabilidad (0–1) como porcentaje corto: 25 %, 0,5 %, 100 %. */
export function percent(rate: number, locale: string): string {
  const p = rate * 100;
  return `${p.toLocaleString(locale, { maximumFractionDigits: p < 1 ? 2 : p < 10 ? 1 : 0 })}%`;
}

/** Sin acentos ni mayúsculas, para comparar lo que se escribe con los nombres. */
export const normalize = (s: string): string => s.normalize("NFD").replace(/[^\x00-\x7F]/g, "").toLowerCase().trim();
