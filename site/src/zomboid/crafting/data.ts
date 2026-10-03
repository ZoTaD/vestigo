/**
 * El grafo de fabricación de Project Zomboid (2026-10-01), tal como lo escribe `games/zomboid/tools/craft.py`: un solo
 * archivo (~200 KB con gzip, medido el 2026-10-02) que baja sólo la pestaña Fabricación, por `import()`, y que el
 * prerender espera.
 */
import type { Route } from "../../route";
import { once } from "../store";
export type Loc = { en: string; es: string };
export interface CItem { en: string; es: string; icon: string | null; c: string; u?: number; f?: 1; w?: [key: string, cont: string, p: number, n: number] }
export interface CIn { n: number; k?: 1; o: string[]; on?: Record<string, number>; ic?: 1; fl?: Loc; any?: 1 }
export type COut = { n: number; i: string } | { n: number; m: [out: string, from: string[]][]; mi: number[] } | { e: 1 };
export interface CLearn { books: string[]; lv: [skill: string, lvl: number][]; anyLv?: 1; research: string[]; traits: string[]; profs: string[] }
export interface CRecipe {
  en: string; es: string; kind: "craft" | "build"; cat: string; icon: string | null; in: CIn[]; out: COut[];
  sk?: [skill: string, lvl: number][]; xp?: [skill: string, xp: number][]; st?: string[]; learn?: CLearn;
  x?: "pack" | "repair" | "self" | "undo";
}
export interface CStation { en: string; es: string; builds: string[] }
export interface CTrait { en: string; es: string; icon: string | null }
export interface CProf { en: string; es: string; icon: string | null; traits: string[] }
export interface CraftData {
  v: string; loot: boolean; cats: Record<string, Loc>; items: Record<string, CItem>; recipes: Record<string, CRecipe>;
  makes: Record<string, string[]>; stations: Record<string, CStation>; skills: Record<string, Loc>;
  traits: Record<string, CTrait>; profs: Record<string, CProf>;
  counts: { craftable: number; builds: number; multi: number; recipes: number };
}
// Si la Task 1 tuvo que usar `lists` (listas de opciones repetidas una sola vez), acá se vuelven a abrir antes de
// devolver los datos: el motor siempre ve `CIn.o` como `string[]`.
/**
 * Lo que hay en `o` bajo la clave `k`, sólo si es suya: los ids del link son texto libre, y `constructor`, `toString` o
 * `__proto__` existen en cualquier objeto de JS. Sin esto, `?q=constructor` rompía la pestaña.
 */
export const own = <T,>(o: Record<string, T>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);

const craft = once<CraftData>(() => import("@zomboid/craft.json"));
export const peekCraft = (): CraftData | null => craft.peek();
export const loadCraft = (): Promise<CraftData> => craft.load();
export async function preloadCraftRoute(_route: Route): Promise<void> {
  await loadCraft();
}
