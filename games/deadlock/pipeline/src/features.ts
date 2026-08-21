/**
 * El vector que describe cómo jugó una partida un jugador.
 *
 * Es la entrada de `archetypes.ts`, y su forma decide qué puede llegar a
 * distinguir un arquetipo. Tres bloques, todos en **0..1** para que la distancia
 * entre dos arquetipos se lea directo: "esta build lleva tal objeto 30 puntos más
 * que la otra" es la misma unidad que "pone 30 puntos más de sus almas en arma".
 *
 * 1. **Objetos**: uno por objeto que el héroe se construye de verdad. Binario —
 *    lo llevó o no—, no la cantidad, porque un objeto se compra una vez.
 * 2. **Almas por categoría**: qué fracción de lo gastado fue a arma, vitalidad y
 *    espíritu. **Esto reemplaza al conteo de objetos por tipo** que usaba la firma
 *    vieja, que era una segunda definición de "tipo de daño" conviviendo con la
 *    del panel de inversión: cuatro objetos baratos de bala pesaban más que dos
 *    caros de espíritu en una y menos en la otra.
 * 3. **Habilidades**: qué fracción de los niveles subidos fue a cada una. Es lo
 *    que separa al McGinnis de muro del de torreta, y sale del snapshot — los
 *    eventos de subida viven adentro del stream de `items`, mezclados con las
 *    compras, que es donde nadie los había buscado.
 */

/** Lo mínimo que un objeto tiene que aparecer para merecer una coordenada. */
export const MIN_PREVALENCIA = 0.05;

export interface ItemMeta {
  cost: number;
  slot: string;
}

/** Una partida jugada por alguien, tal como sale del snapshot. */
export interface PlayerRow {
  heroId: number;
  won: boolean;
  /** Los objetos terminales con los que terminó. */
  items: number[];
  /** Cuántos niveles le puso a cada habilidad. */
  abilities: { id: number; levels: number }[];
  /**
   * La secuencia completa de subidas, en orden.
   *
   * No entra al vector —para agrupar alcanza con cuánto puso en cada una— pero es
   * lo que hace falta para publicar el paso a paso de cada arquetipo medido sobre
   * su propia gente.
   */
  abilitySeq?: number[];
  /** La habilidad que imbuyó, o 0. No entra al vector: describe, no separa. */
  imbued: number;
}

/** Qué significa cada coordenada, para poder explicar un arquetipo. */
export type Column =
  | { kind: "item"; id: number }
  | { kind: "souls"; slot: string }
  | { kind: "ability"; id: number };

export interface Vectors {
  columns: Column[];
  X: number[][];
}

export const SLOTS = ["weapon", "vitality", "spirit"] as const;

/**
 * Arma la matriz de un héroe.
 *
 * **Las columnas se ordenan de forma determinista** (ids ascendentes) y no por
 * frecuencia: si el orden dependiera de los datos, dos corridas con una partida
 * de diferencia podrían permutar coordenadas y mover los arquetipos sin que haya
 * cambiado nada real.
 */
export function vectorsFor(
  jugadores: PlayerRow[],
  items: Map<number, ItemMeta>,
  minPrevalencia = MIN_PREVALENCIA
): Vectors {
  const n = jugadores.length;
  if (n === 0) return { columns: [], X: [] };

  const cuenta = new Map<number, number>();
  for (const j of jugadores) for (const id of new Set(j.items)) cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  const itemCols = [...cuenta.entries()]
    .filter(([, c]) => c / n >= minPrevalencia)
    .map(([id]) => id)
    .sort((a, b) => a - b);

  const habs = new Set<number>();
  for (const j of jugadores) for (const a of j.abilities) habs.add(a.id);
  const abilityCols = [...habs].sort((a, b) => a - b);

  const columns: Column[] = [
    ...itemCols.map((id) => ({ kind: "item" as const, id })),
    ...SLOTS.map((slot) => ({ kind: "souls" as const, slot })),
    ...abilityCols.map((id) => ({ kind: "ability" as const, id })),
  ];

  const X = jugadores.map((j) => {
    const suyos = new Set(j.items);
    const fila: number[] = itemCols.map((id) => (suyos.has(id) ? 1 : 0));

    const almas: Record<string, number> = { weapon: 0, vitality: 0, spirit: 0 };
    let total = 0;
    for (const id of suyos) {
      const meta = items.get(id);
      if (!meta || !(meta.slot in almas)) continue;
      almas[meta.slot] += meta.cost;
      total += meta.cost;
    }
    for (const s of SLOTS) fila.push(total > 0 ? almas[s] / total : 0);

    const niveles = new Map(j.abilities.map((a) => [a.id, a.levels]));
    const totalNiv = j.abilities.reduce((a, x) => a + x.levels, 0);
    for (const id of abilityCols) fila.push(totalNiv > 0 ? (niveles.get(id) ?? 0) / totalNiv : 0);

    return fila;
  });

  return { columns, X };
}

/**
 * Cuánto pesa cada bloque en la distancia entre dos jugadores.
 *
 * **Sin esto, los objetos ahogan a todo lo demás por cantidad.** Un héroe puede
 * tener cuarenta columnas de objeto contra tres de almas y cuatro de habilidad,
 * así que dos builds que difieren en la habilidad que maxean pero comparten
 * objetos quedarían a distancia casi cero — justo el caso que este trabajo existe
 * para detectar. Cada bloque se escala para que aporte lo mismo.
 */
export function balancear(v: Vectors): Vectors {
  const porBloque = new Map<string, number>();
  for (const c of v.columns) porBloque.set(c.kind, (porBloque.get(c.kind) ?? 0) + 1);
  const bloques = porBloque.size;
  if (bloques === 0) return v;

  const peso = v.columns.map((c) => {
    const cuantas = porBloque.get(c.kind) ?? 1;
    return Math.sqrt(1 / (bloques * cuantas));
  });
  return { columns: v.columns, X: v.X.map((fila) => fila.map((x, j) => x * peso[j])) };
}

/**
 * De vuelta a la escala original, para poder leer un arquetipo.
 *
 * El arquetipo se calcula sobre el espacio balanceado, pero lo que se publica
 * —"esta build lleva tal objeto el 80% de las veces"— tiene que estar en las
 * unidades de la gente.
 */
export function desbalancear(Z: number[][], v: Vectors): number[][] {
  const porBloque = new Map<string, number>();
  for (const c of v.columns) porBloque.set(c.kind, (porBloque.get(c.kind) ?? 0) + 1);
  const bloques = porBloque.size;
  if (bloques === 0) return Z;
  const peso = v.columns.map((c) => Math.sqrt(1 / (bloques * (porBloque.get(c.kind) ?? 1))));
  return Z.map((fila) => fila.map((x, j) => (peso[j] > 0 ? x / peso[j] : x)));
}

/**
 * El tipo de daño de una build, por ALMAS y no por cantidad de objetos.
 *
 * Es el arreglo del cuarto punto: la firma vieja contaba objetos por tipo y el
 * panel de inversión sumaba almas, así que la misma tarjeta tenía dos
 * definiciones de lo mismo que podían discrepar.
 */
export function damageOf(items: number[], meta: Map<number, ItemMeta>): string {
  const almas: Record<string, number> = { weapon: 0, vitality: 0, spirit: 0 };
  for (const id of new Set(items)) {
    const m = meta.get(id);
    if (!m || !(m.slot in almas)) continue;
    almas[m.slot] += m.cost;
  }
  let mejor = "weapon";
  for (const s of SLOTS) if (almas[s] > almas[mejor]) mejor = s;
  return mejor;
}
