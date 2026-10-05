/**
 * Los datos de la pestaña Objetos de Rust (2026-10-05), tal como los escribe `games/rust/tools/site_data.py`: la lista
 * liviana (`list.json`) y las fichas repartidas en 32 archivos por el hash del slug (`items/NN.json`). Bajan con los
 * mismos ayudantes que Zomboid (`zomboid/store.ts`): `load*` pide una sola vez, `peek*` devuelve lo que ya llegó para
 * el primer render y el prerender.
 *
 * Los `import()` van escritos acá para que Vite arme un chunk por archivo: nada de esto viaja en el de la pestaña.
 */
import type { Route } from "../../route";
import { once, shardedFichas } from "../../zomboid/store";
import { pzShardOf } from "../../zomboid/shard";

export type Loc = { en: string; es: string | null };
/** Un enlace a otro objeto: `slug` es `null` si no tiene ficha (una skin, un objeto oculto). */
export interface Ref {
  id: string;
  slug: string | null;
  name: Loc;
}
export interface ListRow {
  id: string;
  slug: string;
  slugEs: string;
  en: string;
  es: string | null;
  cat: string;
}

/** Las cuatro recicladoras, de la que más rinde a la que menos (`RECYCLERS` de extract.py). */
export type RecyclerKey = "red" | "green_power" | "green" | "yellow";
export interface Recycler {
  key: RecyclerKey;
  eff: number;
}
export interface ItemsList {
  cats: string[];
  rows: ListRow[];
}
export interface Ficha {
  id: string;
  itemid: number;
  slug: string;
  slugEs: string;
  name: Loc;
  desc: Loc;
  cat: string;
  rarity: string;
  stack: number;
  condition: { max: number; repairable: boolean } | null;
  craft: {
    amount: number;
    time: number;
    workbench: number;
    researchScrap: number | null;
    default: boolean;
    ingredients: (Ref & { amount: number })[];
  } | null;
  usedIn: Ref[];
  recycle: { scrap: number; out: (Ref & { amount: number })[]; eff: Recycler[] } | null;
  recycledFrom: { eff: Recycler[]; rows: (Ref & { amount: number; scrap: boolean })[] } | null;
  loot: { c: string; name: Loc; chance: number; min: number; max: number; bp: boolean }[];
  shops: { shop: Loc; amount: number; bp: boolean; currency: Ref; price: number }[];
}

/** `SHARDS` de site_data.py: si se cambia uno se cambia el otro (lo prueba rustItemsData.test.ts). */
export const RUST_SHARDS = 32;

const list = once<ItemsList>(() => import("@rust/site/list.json"));
const fichas = shardedFichas<Ficha>(
  import.meta.glob<{ default: Record<string, Ficha> }>("@rust/site/items/*.json"),
  (slug) => pzShardOf(slug, RUST_SHARDS),
);

export const peekList = (): ItemsList | null => list.peek();
export const loadList = (): Promise<ItemsList> => list.load();
export const peekItem = (slug: string): Ficha | null | undefined => fichas.peek(slug);
export const loadItem = (slug: string): Promise<Ficha | null> => fichas.load(slug);

/** El nombre en el idioma de la página; el juego no traduce todo, y lo que falta va en inglés. */
export const say = (loc: Loc, lang: "en" | "es"): string => (lang === "es" && loc.es) || loc.en;

/**
 * Lo que necesita una dirección de la pestaña antes del primer render: la ficha, o la lista si es la lista o si la
 * ficha no existe (se muestra la lista con una nota). Para el prerender y para `preloadTab`.
 */
export async function preloadItemsRoute(route: Route): Promise<void> {
  if (route.detail && (await loadItem(route.detail))) return;
  await loadList();
}
