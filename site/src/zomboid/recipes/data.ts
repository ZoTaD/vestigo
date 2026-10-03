/**
 * Los datos de la pestaña Recetas de Project Zomboid (2026-09-30), tal como los escribe `games/zomboid/tools/site.py`:
 * la lista liviana (`recipes-list.json`, ~32 KB con gzip) y las fichas repartidas en 100 archivos por el hash del slug
 * (`recipes/<NN>.json`, ~6 KB con gzip cada uno). Carga igual que Objetos (`items/data.ts`, con `store.ts`): la lista
 * baja sólo en la lista, y una ficha baja sólo su archivo.
 *
 * Los tipos siguen lo que escribe site.py de verdad (ver `.superpowers/sdd/or-1-report.md`), que suma al bloque del
 * plan: `max` en las cantidades variables, `any` en "cualquier objeto", `n` en una opción que pide otra cantidad,
 * `learn.anySkill` si alcanza con una de las habilidades, e `icon` en la ficha.
 */
import type { Route } from "../../route";
import type { Loc, Ref } from "../items/data";
import { once, shardedFichas } from "../store";
import type { FichaChange } from "../patches/data";

export type { Loc, Ref };
export type RecipeKind = "craft" | "build";

/** Una fila de la lista. `icon` es de `items/` o, si es de construcción, de `build/`; `null` si no tiene. */
export interface RecipeRow {
  id: string;
  en: string;
  es: string;
  cat: string;
  kind: RecipeKind;
  icon: string | null;
}

export interface RecipesList {
  cats: Record<string, Loc & { n: number }>;
  rows: RecipeRow[];
}

export interface SkillLvl {
  skill: Loc;
  lvl: number;
}

/**
 * Una línea de ingredientes o de herramientas.
 *
 * - `opts`: los objetos que sirven (uno, varios, o los que tiene la etiqueta `tag`, ya abierta). Una opción con su propio
 *   `n` pide otra cantidad (cordel: 1 de cáñamo, o 25 hilos de tendón).
 * - `max`: la cantidad es variable, de `n` a `max` (secar de 1 a 20 hierbas).
 * - `keep`: vuelve al inventario (una sierra): es herramienta.
 * - `fluid`: un líquido, en litros (`n`), sin objetos. En el juego es parte de la línea anterior: el líquido que va
 *   adentro de ese recipiente. Varios nombres van juntos con " / " (leche de vaca / de oveja).
 * - `any`: cualquier objeto (`[*]`); seguido de un líquido, cualquier recipiente con ese líquido.
 * - `tag`: la etiqueta del juego (varias, juntas con ";"). Sólo para saber que es "cualquiera de".
 */
export interface RecipeInput {
  n: number;
  max?: number;
  keep: boolean;
  tag?: string;
  fluid?: Loc;
  any?: true;
  opts: (Ref & { n?: number })[];
}

export interface RecipeChoice {
  /** Los ingredientes que dan este resultado; vacío = "con cualquier otro". */
  from: Ref[];
  item: Ref;
}

/** Un objeto, uno según el ingrediente (`choices`), o el mueble que se construye en el lugar (`entity`). */
export type RecipeOutput =
  | { n: number; max?: number; item: Ref }
  | { n: number; max?: number; choices: RecipeChoice[] }
  | { entity: Loc };

export interface RecipeLearn {
  /** Libros y revistas que la enseñan. */
  books: Ref[];
  /** Los niveles que la enseñan solos; con `anySkill`, alcanza con llegar a uno. */
  skills: SkillLvl[];
  anySkill?: true;
  /** Objetos que la enseñan al investigarlos. */
  research: Ref[];
  /** Rasgos y profesiones que la traen de entrada (sus íconos van en `traits/` y `professions/`). */
  traits: Ref[];
  professions: Ref[];
}

export interface RecipeFicha {
  id: string;
  en: string;
  es: string;
  kind: RecipeKind;
  cat: string;
  catName: Loc;
  /** Tal como lo declara el juego; no se convierte a segundos. */
  time: number;
  skills: SkillLvl[];
  xp: { skill: Loc; xp: number }[];
  inputs: RecipeInput[];
  outputs: RecipeOutput[];
  stations: Loc[];
  /** `null`: se sabe desde el principio. */
  learn: RecipeLearn | null;
  tip?: Loc;
  icon: string | null;
  /** Lo que le cambió en las últimas versiones que comparamos ("Qué cambió"); sin cambios, no está. */
  changes?: FichaChange[];
}

// Los `import()` van escritos acá para que Vite los vea y arme un chunk por archivo (ver `store.ts`).
const list = once<RecipesList>(() => import("@zomboid/site/recipes-list.json"));
const fichas = shardedFichas<RecipeFicha>(import.meta.glob<{ default: Record<string, RecipeFicha> }>("@zomboid/site/recipes/*.json"));

export const peekRecipesList = (): RecipesList | null => list.peek();
export const loadRecipesList = (): Promise<RecipesList> => list.load();

/** La ficha si su archivo ya llegó: `undefined` si todavía no, `null` si llegó y no está (un slug que no existe). */
export const peekRecipe = (slug: string): RecipeFicha | null | undefined => fichas.peek(slug);

/** Pide el archivo donde vive la ficha; `null` si no está. */
export const loadRecipe = (slug: string): Promise<RecipeFicha | null> => fichas.load(slug);

/**
 * Lo que necesita una dirección de la pestaña antes del primer render: la ficha, o la lista si es la lista o si la
 * ficha no existe (se muestra la lista con una nota). Para el prerender y para `preloadTab`.
 */
export async function preloadRecipesRoute(route: Route): Promise<void> {
  if (route.detail && (await loadRecipe(route.detail))) return;
  await loadRecipesList();
}
