/**
 * Los datos de CS2 que bajan las pestañas (2026-11-03): lo que escriben `games/cs2/tools/site_data.py` (catálogo, en
 * `@cs2`) y `prices.py` (precios del día, en `@cs2prices`).
 *
 * - La lista liviana de cada pestaña (`list.json`), pedida una vez.
 * - Las fichas, repartidas en `CS2_SHARDS` archivos por el hash del slug (`f/NN.json`). El slug es el mismo en los dos
 *   idiomas, así que no hay mapa español → inglés.
 * - Los precios: `skins.json` (todas las skins, ~220 KB) y `cases.json` (las cajas), cada uno un `import()` aparte.
 *
 * Nunca en el chunk del área (regla 4 de CLAUDE.md).
 */
import type { Cs2Tab, Route } from "../route";
import type { Cs2Cat, Cs2Kind, Cs2Rarity } from "../cs2Copy";
import { pzShardOf } from "../zomboid/shard";
import { once, shardedFichas } from "../zomboid/store";

/** `CHUNKS` de cs2.py: si se cambia uno se cambia el otro (lo prueba cs2Data.test.ts). */
export const CS2_SHARDS = 32;
const shard = (slug: string) => pzShardOf(slug, CS2_SHARDS);

/** Una fila de `skins/list.json`. `min`/`max` son null en un cuchillo sin pintura. */
export interface SkinRow {
  slug: string;
  name: string;
  weapon: string;
  cat: Cs2Cat;
  rarity: Cs2Rarity;
  min: number | null;
  max: number | null;
  st: boolean;
  sv: boolean;
  img: string;
  phase?: string;
  /** Su colección (`tradeup.json`), si tiene. */
  col?: string;
}
export interface SkinFicha extends SkinRow {
  desc: string;
  wears: string[];
  cases: string[];
  collections: string[];
  variants: string[];
}
export interface CaseRow {
  slug: string;
  name: string;
  kind: Cs2Kind;
  date: string | null;
  img: string;
  n: number;
}
export interface Group {
  rarity: Cs2Rarity;
  skins: string[];
}
export interface CaseFicha extends CaseRow {
  groups: Group[];
  rare: string[];
}
export interface CollRow {
  slug: string;
  name: string;
  date: string | null;
  img: string;
  n: number;
}
export interface CollFicha extends CollRow {
  groups: Group[];
  cases: string[];
}

/** El precio de una skin por desgaste (FN..BS; un solo valor en un cuchillo sin pintura). `sug`: bits de `n` sugeridos. */
export interface SkinPrice {
  n: (number | null)[];
  st?: (number | null)[];
  sv?: (number | null)[];
  sug?: number;
}
export interface CasePrice {
  price?: number;
  ev?: number;
  ret?: number;
  groups?: Partial<Record<Cs2Rarity | "special", number>>;
}

type Mod<T> = { default: T };
interface ListOf {
  skins: SkinRow[];
  cases: CaseRow[];
  collections: CollRow[];
}
interface FichaOf {
  skins: SkinFicha;
  cases: CaseFicha;
  collections: CollFicha;
}

const lists = {
  skins: once<SkinRow[]>(() => import("@cs2/skins/list.json") as Promise<Mod<unknown>>),
  cases: once<CaseRow[]>(() => import("@cs2/cases/list.json") as Promise<Mod<unknown>>),
  collections: once<CollRow[]>(() => import("@cs2/collections/list.json") as Promise<Mod<unknown>>),
};
const fichas = {
  skins: shardedFichas<SkinFicha>(import.meta.glob<{ default: Record<string, SkinFicha> }>("@cs2/skins/f/*.json"), shard),
  cases: shardedFichas<CaseFicha>(import.meta.glob<{ default: Record<string, CaseFicha> }>("@cs2/cases/f/*.json"), shard),
  collections: shardedFichas<CollFicha>(import.meta.glob<{ default: Record<string, CollFicha> }>("@cs2/collections/f/*.json"), shard),
};
const skinPrices = once<Record<string, SkinPrice>>(() => import("@cs2prices/skins.json") as Promise<Mod<unknown>>);
const casePrices = once<Record<string, CasePrice>>(() => import("@cs2prices/cases.json") as Promise<Mod<unknown>>);
const priceMeta = once<{ date: string }>(() => import("@cs2prices/meta.json") as Promise<Mod<unknown>>);

export const isDataTab = (t: string | undefined): t is Cs2Tab => t === "skins" || t === "cases" || t === "collections";

export const loadList = <T extends Cs2Tab>(tab: T): Promise<ListOf[T]> => (lists[tab] as ReturnType<typeof once<ListOf[T]>>).load();
export const peekList = <T extends Cs2Tab>(tab: T): ListOf[T] | null => (lists[tab] as ReturnType<typeof once<ListOf[T]>>).peek();
export const loadFicha = <T extends Cs2Tab>(tab: T, slug: string): Promise<FichaOf[T] | null> =>
  (fichas[tab] as ReturnType<typeof shardedFichas<FichaOf[T]>>).load(slug);
export const peekFicha = <T extends Cs2Tab>(tab: T, slug: string): FichaOf[T] | null | undefined =>
  (fichas[tab] as ReturnType<typeof shardedFichas<FichaOf[T]>>).peek(slug);
export const loadSkinPrices = () => skinPrices.load();
export const peekSkinPrices = () => skinPrices.peek();
export const loadCasePrices = () => casePrices.load();
export const peekCasePrices = () => casePrices.peek();
export const loadPriceDate = () => priceMeta.load().then((m) => m.date);
export const peekPriceDate = () => priceMeta.peek()?.date ?? null;

/**
 * Lo que una dirección necesita antes de dibujarse (el prerender lo espera, así el HTML sale con datos y precios): la
 * ficha y lo que nombra, o la lista de la pestaña.
 */
export async function preloadRoute(route: Route): Promise<void> {
  const tab = route.c2Section;
  if (!isDataTab(tab)) {
    await Promise.all([loadCasePrices(), loadList("cases"), loadPriceDate()]);
    return;
  }
  // La lista de Cajas no nombra skins: le alcanzan sus precios (sin los ~220 KB de las skins).
  if (tab === "cases" && !route.detail) {
    await Promise.all([loadCasePrices(), loadPriceDate(), loadList("cases")]);
    return;
  }
  const base = [loadSkinPrices(), loadCasePrices(), loadPriceDate(), loadList("skins")];
  if (!route.detail) {
    await Promise.all([...base, loadList(tab)]);
    return;
  }
  const [f] = await Promise.all([loadFicha(tab, route.detail), ...base]);
  if (!f) return;
  // Lo que la ficha nombra con nombre e imagen: las cajas y colecciones (de sus listas, livianas).
  await Promise.all([loadList("cases"), loadList("collections")]);
}
