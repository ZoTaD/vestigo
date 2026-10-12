/**
 * La lógica del árbol de crafteo de Terraria (2026-10-12), sin React: desplegar un objeto hasta sus materiales base y
 * sumar cuánto hace falta de cada uno.
 *
 * Tres cosas del juego que hay que cuidar:
 * - **Recetas de ida y vuelta** (madera → plataforma y plataforma → madera). La de vuelta se reconoce porque se cargó
 *   después que la de ida: no se usa por defecto, y así la madera es un material base y no "se fabrica con plataformas".
 * - **Ciclos más largos**: un objeto nunca se vuelve a desplegar dentro de su propia rama.
 * - **Grupos** ("cualquier lingote de hierro"): son una hoja, no se despliegan.
 */
import type { Recipe, RecipeDb } from "../data";

export interface TreeIndex {
  db: RecipeDb;
  /** Las recetas que dan cada objeto, en el orden del juego. */
  byOut: Map<number, number[]>;
  /** Las recetas "de vuelta": deshacen otra que se cargó antes. */
  reverse: Set<number>;
}

export interface TreeNode {
  /** El objeto, o un grupo si es negativo (grupo `g` → `-(g + 1)`). */
  key: number;
  qty: number;
  /** La receta usada, o `null` si es una hoja. */
  recipe: number | null;
  /** Las recetas entre las que se puede elegir (sin las de vuelta, salvo que no haya otra). */
  options: number[];
  /** Cuántas veces hay que fabricar la receta. */
  crafts: number;
  children: TreeNode[];
  /** Es una hoja: no tiene receta, es un grupo, o cerraría un ciclo. */
  base: boolean;
  /** Es una hoja porque el objeto ya está más arriba en la misma rama. */
  cycle: boolean;
}

export function indexRecipes(db: RecipeDb): TreeIndex {
  const byOut = new Map<number, number[]>();
  db.recipes.forEach((r, i) => byOut.set(r[0], [...(byOut.get(r[0]) ?? []), i]));
  const reverse = new Set<number>();
  db.recipes.forEach((r, i) => {
    for (const [key] of r[4]) {
      if (key < 0) continue;
      // ¿El ingrediente se fabrica, en una receta anterior, con lo que sale de ésta?
      if ((byOut.get(key) ?? []).some((j) => j < i && db.recipes[j][4].some(([k]) => k === r[0]))) reverse.add(i);
    }
  });
  return { db, byOut, reverse };
}

/** Las recetas elegibles de un objeto: las de ida; si sólo tiene de vuelta, ninguna (es un material base). */
export const optionsFor = (ix: TreeIndex, item: number): number[] => (ix.byOut.get(item) ?? []).filter((i) => !ix.reverse.has(i));

/** ¿Se puede elegir en el árbol? */
export const isCraftable = (ix: TreeIndex, item: number): boolean => optionsFor(ix, item).length > 0;

/**
 * Despliega `qty` de un objeto. `choice` dice qué receta usar en cada objeto que tiene varias (objeto → índice de la
 * receta); una elección que ya no existe se ignora.
 */
export function expand(ix: TreeIndex, key: number, qty: number, choice: Record<number, number> = {}, path: ReadonlySet<number> = new Set()): TreeNode {
  const leaf = (cycle: boolean, options: number[] = []): TreeNode => ({ key, qty, recipe: null, options, crafts: 0, children: [], base: true, cycle });
  if (key < 0) return leaf(false);
  if (path.has(key)) return leaf(true);
  const options = optionsFor(ix, key);
  if (!options.length) return leaf(false);
  const recipe = options.includes(choice[key]) ? choice[key] : options[0];
  const [, makes, , , ings] = ix.db.recipes[recipe];
  const crafts = Math.ceil(qty / makes);
  const below = new Set(path).add(key);
  return { key, qty, recipe, options, crafts, children: ings.map(([k, n]) => expand(ix, k, n * crafts, choice, below)), base: false, cycle: false };
}

export interface Totals {
  /** Cuánto hace falta de cada material base (objeto o grupo), de mayor a menor. */
  base: [key: number, qty: number][];
  /** Las estaciones que se usan, sin repetir, en el orden en que aparecen. */
  stations: number[];
  /** Las condiciones de receta que aparecen, como bits. */
  flags: number;
}

export function totals(ix: TreeIndex, root: TreeNode): Totals {
  const base = new Map<number, number>();
  const stations: number[] = [];
  let flags = 0;
  const walk = (n: TreeNode): void => {
    if (n.base) {
      base.set(n.key, (base.get(n.key) ?? 0) + n.qty);
      return;
    }
    const r: Recipe = ix.db.recipes[n.recipe!];
    if (r[2] >= 0 && !stations.includes(r[2])) stations.push(r[2]);
    flags |= r[3];
    n.children.forEach(walk);
  };
  walk(root);
  return { base: [...base].sort((a, b) => b[1] - a[1] || a[0] - b[0]), stations, flags };
}

/** Cuántos nodos tiene el árbol: para saber si conviene dibujarlo plegado. */
export const size = (n: TreeNode): number => 1 + n.children.reduce((s, c) => s + size(c), 0);
