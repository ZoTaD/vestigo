/**
 * Lo que el juego te da por invertir almas en una categoría.
 *
 * Deadlock convierte **almas gastadas por categoría** en un bonus, con una
 * escalera de once escalones que el juego muestra en la tienda ("Inversión en
 * Arma / Vitalidad / Espíritu"). Es la única forma honesta de traducir una build
 * a un número: sumar lo que da cada ítem no se puede, porque las stats no son
 * separables por categoría —la más común de los ítems de espíritu es *Bonus
 * Health*— ni comparables entre sí —% de cadencia, vida plana, segundos,
 * metros—.
 *
 * ---
 *
 * **De dónde salen estos números, y por qué es un problema que hay que vigilar.**
 *
 * No están en la API de assets: se revisaron las 108 rutas del OpenAPI de
 * deadlock-api y no hay ninguna que los publique. `generic-data` trae
 * `weapon_groups` / `armor_groups` / `spirit_groups`, pero son las agrupaciones
 * de la tienda, no la escalera. La wiki tampoco los tiene — su página de Souls
 * cubre cómo se consiguen, no qué compran.
 *
 * Así que están transcritos de **capturas del juego** que pasó ZoTaD el
 * 2026-07-31. Es la excepción a la regla del proyecto de no escribir a mano lo
 * que se puede bajar, y se paga con dos cosas: el test que los fija byte a byte,
 * y esta nota. **Un parche de balance puede moverlos y nada nos va a avisar.**
 * Si los números de la tarjeta dejan de coincidir con la tienda, es acá.
 *
 * Verificado contra una cuarta captura: al comprar Ricochet (6.400) el juego
 * saltó al escalón de 6.400 y mostró +54% de daño de arma, que es lo que dice
 * esta tabla.
 */

/** Un escalón: a partir de cuántas almas, y cuánto da. */
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
