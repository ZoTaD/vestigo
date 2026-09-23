/**
 * La escalera de inversión de almas, copiada de `deadlock/pipeline/src/investment.ts`.
 *
 * El armador de builds la necesita en el navegador, y la app no puede importar
 * del pipeline (Vite sólo sirve `games/tft`). **La copia está fijada por
 * `test/deadlockInvestment.test.ts`**, que la compara con el original: si un
 * parche mueve la escalera y se corrige sólo uno de los dos, el test falla.
 * La historia de dónde salen los números está en el original.
 */

export interface Rung {
  souls: number;
  bonus: number;
}

/**
 * Los umbrales son los mismos para las tres categorías; lo que cambia es el
 * premio. El último, **28.800**, es donde el juego deja de escalar: gastar más
 * en esa categoría no suma nada.
 */
export const INVESTMENT_CAP = 28_800;

/** `+N` de poder espiritual, plano. */
export const SPIRIT: Rung[] = [
  { souls: 800, bonus: 7 },
  { souls: 1_600, bonus: 11 },
  { souls: 2_400, bonus: 15 },
  { souls: 3_200, bonus: 19 },
  { souls: 4_800, bonus: 38 },
  { souls: 6_400, bonus: 45 },
  { souls: 8_000, bonus: 52 },
  { souls: 11_200, bonus: 59 },
  { souls: 16_000, bonus: 66 },
  { souls: 22_400, bonus: 75 },
  { souls: 28_800, bonus: 100 },
];

/** `+N%` de vida. */
export const VITALITY: Rung[] = [
  { souls: 800, bonus: 9 },
  { souls: 1_600, bonus: 12 },
  { souls: 2_400, bonus: 15 },
  { souls: 3_200, bonus: 20 },
  { souls: 4_800, bonus: 38 },
  { souls: 6_400, bonus: 42 },
  { souls: 8_000, bonus: 46 },
  { souls: 11_200, bonus: 50 },
  { souls: 16_000, bonus: 54 },
  { souls: 22_400, bonus: 60 },
  { souls: 28_800, bonus: 66 },
];

/** `+N%` de daño del arma. */
export const WEAPON: Rung[] = [
  { souls: 800, bonus: 9 },
  { souls: 1_600, bonus: 12 },
  { souls: 2_400, bonus: 15 },
  { souls: 3_200, bonus: 18 },
  { souls: 4_800, bonus: 46 },
  { souls: 6_400, bonus: 54 },
  { souls: 8_000, bonus: 62 },
  { souls: 11_200, bonus: 74 },
  { souls: 16_000, bonus: 86 },
  { souls: 22_400, bonus: 100 },
  { souls: 28_800, bonus: 115 },
];

export const LADDERS = { weapon: WEAPON, vitality: VITALITY, spirit: SPIRIT } as const;
export type Category = keyof typeof LADDERS;

/**
 * El bonus que dan `souls` almas en una categoría.
 *
 * Es el **último escalón alcanzado**, no una interpolación: el juego premia al
 * cruzar el umbral y no antes, así que 4.700 almas de arma dan lo mismo que
 * 3.200 (+18%) y no algo intermedio. Por debajo del primer escalón, cero.
 */
export function bonusFor(category: Category, souls: number): number {
  const escalera = LADDERS[category];
  let bonus = 0;
  for (const r of escalera) {
    if (souls >= r.souls) bonus = r.bonus;
    else break;
  }
  return bonus;
}
