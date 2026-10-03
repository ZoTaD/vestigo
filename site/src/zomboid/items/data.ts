/**
 * Los datos de la pestaña Objetos de Project Zomboid (2026-09-30), tal como los escribe `games/zomboid/tools/site.py`:
 * la lista liviana (`items-list.json`, ~115 KB con gzip) y las fichas repartidas en 100 archivos por el hash del slug
 * (`items/<NN>.json`, ~10 KB con gzip cada uno). La forma es la de `d2r/index.ts`: `load*` pide una sola vez, `peek*`
 * devuelve lo que ya llegó para el primer render (y el prerender, que espera a `preloadItemsRoute`).
 *
 * Nada de esto viaja en el chunk de la pestaña: la lista y cada archivo de fichas son `import()` aparte, así una ficha
 * baja su archivo y no la lista, y la lista no baja ninguna ficha.
 *
 * Los tipos siguen lo que escribe site.py de verdad, no el bloque del plan (`docs/superpowers/plans/…-objetos-recetas.md`):
 * `fixedWith` lleva las habilidades como `{ skill, lvl }[]`, con su nombre en los dos idiomas, y hay un campo de más
 * (`research`, las recetas que se aprenden investigando el objeto).
 */
import type { Route } from "../../route";
import { once, shardedFichas } from "../store";
import { loadItemLoot, loadLootCommon } from "../loot/data";
import type { FichaChange } from "../patches/data";

export type Loc = { en: string; es: string };
/** Un enlace a otra ficha: `id` es su slug. Los de objetos traen el ícono de ese id del juego; los de recetas, no. */
export interface Ref {
  id: string;
  en: string;
  es: string;
  icon?: string | null;
}

/** Una fila de la lista: lo de la primera variante (`icon`, `w`, `t`) y cuántas variantes tiene (`n`). */
export interface ItemRow {
  id: string;
  en: string;
  es: string;
  cat: string;
  icon: string | null;
  /** El peso; `null` si el juego no lo declara. */
  w: number | null;
  n: number;
  /** El tipo del juego (weapon, clothing, food, literature…). */
  t: string;
}

export interface ItemsList {
  cats: Record<string, Loc & { n: number }>;
  rows: ItemRow[];
}

export interface ItemVariant {
  gameId: string;
  en: string;
  es: string;
  icon: string | null;
  type: string;
  w: number | null;
  stats: Record<string, unknown>;
  tags: string[];
  tip?: Loc;
}

export interface FixedWith {
  fixer: Ref;
  /** Cuánto se gasta del objeto que repara en cada arreglo. */
  uses: number;
  skills: { skill: Loc; lvl: number }[];
}

export interface SkillBook {
  skill: Loc;
  /** El primer nivel para el que sirve; sirve para `levels` niveles seguidos. */
  from: number;
  levels: number;
  mult: number;
}

export interface ItemFicha {
  id: string;
  en: string;
  es: string;
  cat: string;
  catName: Loc;
  variants: ItemVariant[];
  /** Recetas que lo producen. */
  makes: Ref[];
  /** Recetas que lo consumen. */
  uses: Ref[];
  /** Recetas donde es herramienta (no se gasta). */
  tools: Ref[];
  fixedWith: FixedWith[];
  /** Objetos que este repara. */
  fixes: Ref[];
  /** Recetas que enseña (libros y revistas). */
  teaches: Ref[];
  /** Recetas que se aprenden investigándolo. */
  research: Ref[];
  skillBook?: SkillBook;
  /** La bala que dispara (un arma de fuego) o que carga (un cargador): site.py la resuelve del tipo de munición. */
  ammo?: Ref;
  /** El cargador que usa un arma de fuego, si usa uno. */
  magazine?: Ref;
  /** Lo que le cambió en las últimas versiones que comparamos ("Qué cambió"); sin cambios, no está. */
  changes?: FichaChange[];
}

// La lista y las fichas bajan con los ayudantes de `store.ts` (los mismos que usa Recetas); los `import()` van escritos
// acá para que Vite los vea y arme un chunk por archivo.
const list = once<ItemsList>(() => import("@zomboid/site/items-list.json"));
const fichas = shardedFichas<ItemFicha>(import.meta.glob<{ default: Record<string, ItemFicha> }>("@zomboid/site/items/*.json"));

export const peekItemsList = (): ItemsList | null => list.peek();
export const loadItemsList = (): Promise<ItemsList> => list.load();

/**
 * La ficha de un objeto si su archivo ya llegó: `undefined` si todavía no, `null` si llegó y no está (un slug que no
 * existe).
 */
export const peekItem = (slug: string): ItemFicha | null | undefined => fichas.peek(slug);

/** Pide el archivo donde vive la ficha; `null` si no está. */
export const loadItem = (slug: string): Promise<ItemFicha | null> => fichas.load(slug);

/**
 * Lo que necesita una dirección de la pestaña antes del primer render: la ficha con su "Dónde aparece" (el botín del
 * objeto y los nombres de `common`), o la lista si es la lista o si la ficha no existe (se muestra la lista con una
 * nota). Para el prerender y para `preloadTab`: así el HTML trae la hoja entera y la precarga al pasar el mouse también.
 *
 * Los tres archivos se piden juntos y no uno después del otro: esperar la ficha para recién ahí pedir el botín sumaba
 * una vuelta entera de red. Si la ficha no existe se pidieron dos archivos de botín de más (~15 KB con gzip), una
 * dirección rota que casi no pasa.
 */
export async function preloadItemsRoute(route: Route): Promise<void> {
  if (route.detail) {
    const [item] = await Promise.all([loadItem(route.detail), loadItemLoot(route.detail), loadLootCommon()]);
    if (item) return;
  }
  await loadItemsList();
}
