/**
 * Recetas y máquinas de Stardew Valley (etapa 2, tarea 6): la forma de `recipes.json` (more_data.py), la vista y la
 * búsqueda que se eligen en la pestaña, cómo viajan en la dirección (`?view=craft&q=melon`) y las listas ya filtradas.
 *
 * Las recetas traen sus ingredientes como id de objeto o, en negativo, una categoría ("-5" es cualquier huevo); los
 * nombres de los objetos están en `refs.items` y los de las categorías en `refs.cats`, todos en los dos idiomas.
 */

type Lang = "en" | "es";
type Pair = [en: string, es: string];

/** Cómo se aprende una receta: de entrada, por nivel de habilidad, por amistad, por el programa de cocina de la TV u otra forma. */
export type Unlock =
  | { type: "default" }
  | { type: "skill"; skill: string; level: number }
  | { type: "friend"; npc: string; hearts: number }
  | { type: "tv" }
  | { type: "other"; level?: number };

export interface Recipe {
  kind: "cook" | "craft";
  /** El objeto que sale; `(BC)n` los objetos grandes (máquinas, cofres). */
  out: string;
  qty: number;
  name: Pair;
  /** Ingredientes: id del objeto (o categoría en negativo) y cantidad. */
  ings: [id: string, n: number][];
  unlock: Unlock;
}

/** Lo que hace una máquina con un objeto: lo que entra (y cuántos), lo que sale, en cuánto tiempo y su precio. */
export interface MachineRule {
  in: string;
  inName: Pair;
  out: string;
  /** El nombre del producto; en los de sabor, armado ("Zumo de Melón"). */
  outName: Pair;
  /** Minutos del juego (los días ya van sumados de a 1.440). */
  minutes: number;
  price: number;
  /** Cuántos entran por vez si no es uno; 0 la colmena (usa la flor de al lado). */
  count?: number;
  /** El objeto que le da el sabor al producto (la fruta del vino). */
  flavor?: string;
}

export interface Machine {
  id: string;
  slug: string;
  slugEs: string;
  name: Pair;
  rules: MachineRule[];
  /** El índice de su receta de fabricación en `recipes`; sin él, la máquina no se fabrica (se compra o se gana). */
  recipe?: number;
}

/** Un objeto nombrado: slug, slug en español y nombre en los dos idiomas. */
export type ItemRef = [slug: string, slugEs: string, en: string, es: string];

export interface RecipesData {
  recipes: Recipe[];
  machines: Machine[];
  refs: {
    items: Record<string, ItemRef>;
    cats: Record<string, Pair>;
    skills: Record<string, Pair>;
    npcs: Record<string, Pair>;
    /** El programa de cocina de la TV ("La reina de la salsa"). */
    tv: Pair;
  };
}

// --- Lo que se elige y la dirección ---------------------------------------------------------------------------------

/** Las tres vistas de la pestaña: Cocina, Fabricación y Máquinas. */
export const VIEWS = ["cook", "craft", "machines"] as const;
export type View = (typeof VIEWS)[number];

export interface RecipeState {
  view: View;
  q: string;
}

/** Se abre en Cocina, sin búsqueda. */
export const DEFAULT_RECIPE_STATE: RecipeState = { view: "cook", q: "" };

/** El estado escrito en la dirección; una vista que no existe queda en Cocina. */
export function readRecipeState(search: string): RecipeState {
  const p = new URLSearchParams(search);
  const view = p.get("view");
  return {
    view: view && (VIEWS as readonly string[]).includes(view) ? (view as View) : DEFAULT_RECIPE_STATE.view,
    q: (p.get("q") ?? "").slice(0, 80),
  };
}

/** Lo contrario: el `?…` del estado, sólo con lo que no es el valor por defecto (vacío si no cambió nada). */
export function writeRecipeState(s: RecipeState): string {
  const p = new URLSearchParams();
  if (s.view !== DEFAULT_RECIPE_STATE.view) p.set("view", s.view);
  if (s.q.trim()) p.set("q", s.q.trim());
  const out = p.toString();
  return out ? `?${out}` : "";
}

// --- Las listas -----------------------------------------------------------------------------------------------------

const say = (pair: readonly [string, string], lang: Lang): string => (lang === "es" && pair[1]) || pair[0];
/** Sin acentos ni mayúsculas, para buscar "melon" y encontrar "Melón" (igual que `normalize` de data.ts). */
const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * El sprite que representa a una categoría de ingrediente en su casillero: el objeto más común de esa categoría (el
 * Pez sol, el Huevo, la Leche, las Semillas de primavera). El nombre sigue siendo el de la categoría.
 */
export const CAT_ICON: Record<string, string> = { "-4": "145", "-5": "176", "-6": "184", "-777": "495" };

/** El sprite de un ingrediente: el del objeto, el representativo de su categoría o ninguno. */
export const ingSprite = (data: RecipesData, id: string): string | null => (id.startsWith("-") ? (CAT_ICON[id] ?? null) : data.refs.items[id] ? id : null);

/** El nombre de un ingrediente: el del objeto o el de su categoría ("Huevo (cualquiera)"). */
export function ingName(data: RecipesData, id: string, lang: Lang): string {
  if (id.startsWith("-")) {
    const cat = data.refs.cats[id];
    return cat ? say(cat, lang) : id;
  }
  const r = data.refs.items[id];
  return r ? (lang === "es" && r[3]) || r[2] : id;
}

/** Las recetas de una vista que coinciden con la búsqueda por su nombre o por el de cualquier ingrediente, por nombre. */
export function recipeList(data: RecipesData, kind: "cook" | "craft", query: string, lang: Lang): Recipe[] {
  const q = fold(query);
  const hit = (r: Recipe) => !q || fold(say(r.name, lang)).includes(q) || r.ings.some(([id]) => fold(ingName(data, id, lang)).includes(q));
  return data.recipes
    .filter((r) => r.kind === kind && hit(r))
    .sort((a, b) => say(a.name, lang).localeCompare(say(b.name, lang), lang));
}

/** Una fila de la tabla de una máquina: lo que entra y todo lo que puede salir de eso (el Molino de huesos da uno de cuatro). */
export interface RuleRow {
  in: string;
  inName: Pair;
  count: number;
  minutes: number;
  outs: { out: string; outName: Pair; price: number; flavor?: string }[];
}

/** Las reglas de una máquina juntas por lo que entra, en el orden del juego. */
export function ruleRows(m: Machine): RuleRow[] {
  const rows = new Map<string, RuleRow>();
  for (const r of m.rules) {
    const row = rows.get(r.in) ?? { in: r.in, inName: r.inName, count: r.count ?? 1, minutes: r.minutes, outs: [] };
    row.outs.push({ out: r.out, outName: r.outName, price: r.price, ...(r.flavor ? { flavor: r.flavor } : {}) });
    rows.set(r.in, row);
  }
  return [...rows.values()];
}

/**
 * Las máquinas que coinciden con la búsqueda, por nombre, con sus filas: todas si la busca el nombre de la máquina, si
 * no sólo las filas donde aparece lo buscado (lo que entra o lo que sale): "melón" deja el Barril con el Vino de melón.
 */
export function machineList(data: RecipesData, query: string, lang: Lang): { machine: Machine; rows: RuleRow[] }[] {
  const q = fold(query);
  return data.machines
    .map((machine) => {
      const rows = ruleRows(machine);
      if (!q || fold(say(machine.name, lang)).includes(q)) return { machine, rows };
      return { machine, rows: rows.filter((r) => fold(say(r.inName, lang)).includes(q) || r.outs.some((o) => fold(say(o.outName, lang)).includes(q))) };
    })
    .filter((m) => m.rows.length > 0)
    .sort((a, b) => say(a.machine.name, lang).localeCompare(say(b.machine.name, lang), lang));
}
