/**
 * Cuántos puntos tiene un personaje en cada nivel.
 *
 * - Un punto de pasiva por nivel desde el 2: 99.
 * - 24 más de las misiones de la campaña (libros de habilidad). El nivel de cada
 *   una es el nivel de zona donde se consigue, sacado de `world_areas` del juego:
 *   Terrenos de caza 10 y Tierras de cultivo de Ogham 12 (acto 1), Keth 21 y
 *   Deshar 28 (acto 2), Ruinas de la jungla 34 y Aggorat 44 (acto 3), Fin del
 *   viaje 47 y Prueba de los ancestros 51 (acto 4), y los interludios con el
 *   regreso a Kingsmarch en el 56 (8 puntos).
 * - Cada libro de especialización da además puntos de set de armas: cada set
 *   tiene tantos como puntos de misión se juntaron (hasta 24).
 * - Ascendencia: 2 puntos por prueba. Sekhemas (22) y Caos (38) en la campaña;
 *   la tercera y la cuarta piden nivel 60 y 75.
 */
export const QUESTS: ReadonlyArray<readonly [level: number, points: number]> = [
  [10, 2], [12, 2], [21, 2], [28, 2], [34, 2], [44, 2], [47, 2], [51, 2], [56, 8],
];
export const TRIALS = [22, 38, 60, 75] as const;
export const MAX_LEVEL = 100;
export const QUEST_TOTAL = QUESTS.reduce((s, [, p]) => s + p, 0);
export const ASC_TOTAL = TRIALS.length * 2;

/** Puntos de misión juntados al llegar a `level`. */
export function questAt(level: number): number {
  let n = 0;
  for (const [l, p] of QUESTS) if (l <= level) n += p;
  return n;
}

/** Puntos de ascendencia al llegar a `level`. */
export const ascAt = (level: number) => TRIALS.filter((t) => t <= level).length * 2;

/** Nivel en que llega el punto de ascendencia `i` (desde 0), o null si no hay tantos. */
export const ascLevel = (i: number): number | null => TRIALS[Math.floor(i / 2)] ?? null;

/**
 * Puntos del árbol al llegar a `level`: nivel, misiones y lo que den los nodos
 * de ascendencia ya tomados (`bonus`: [nivel, puntos]).
 */
export function mainAt(level: number, bonus: ReadonlyArray<readonly [number, number]> = []): number {
  let n = level - 1 + questAt(level);
  for (const [l, p] of bonus) if (l <= level) n += p;
  return n;
}

/**
 * El nivel de cada punto de una ruta, en orden. `pools[i]` es 0 para el fondo
 * general y 1 o 2 para un set de armas. Un punto llega en el primer nivel en que
 * su fondo lo alcanza, y nunca antes que el anterior: la ruta es el orden en que
 * se toman. null = no alcanzan los puntos.
 */
export function routeLevels(pools: ReadonlyArray<0 | 1 | 2>, bonus: ReadonlyArray<readonly [number, number]> = []): (number | null)[] {
  const used = [0, 0, 0];
  let prev = 1;
  const out: (number | null)[] = [];
  for (const pool of pools) {
    const need = ++used[pool];
    let lv = prev;
    const has = (l: number) => (pool === 0 ? mainAt(l, bonus) : questAt(l)) >= need;
    while (lv <= MAX_LEVEL && !has(lv)) lv++;
    if (lv > MAX_LEVEL) {
      out.push(null);
      continue;
    }
    prev = lv;
    out.push(lv);
  }
  return out;
}
