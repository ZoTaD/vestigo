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
  /** Receta, se vende, aparece en botín/NPC/recolectables: sólo está la que es cierta (ver `flags_of` de site_data.py). */
  c?: 1;
  s?: 1;
  l?: 1;
  r?: 1;
}

/** Las cuatro recicladoras, de la que más rinde a la que menos (`RECYCLERS` de extract.py). */
export type LootKind = "box" | "npc" | "item" | "collect";
export type LootEvent = "xmas" | "halloween" | "easter";
export type RecyclerKey = "red" | "green_power" | "green" | "yellow";
export interface Recycler {
  key: RecyclerKey;
  eff: number;
}
/** Lo que mueve usar o comer un objeto (`MetabolismAttribute.Type` en extract.py). */
export type EffectStat = "calories" | "hydration" | "poison" | "radiation" | "bleeding" | "health" | "healthOverTime";
/** Los modificadores de los tés, con `value` en fracción (0,5 = +50 %). */
export type ModStat = "woodYield" | "oreYield" | "radiationResistance" | "maxHealth" | "scrapYield";
export interface ItemsList {
  cats: string[];
  rows: ListRow[];
}
export type HowKind = "cook" | "burn" | "swap" | "mix";

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
  despawn: number;
  repair: { cost: (Ref & { amount: number })[]; bp: boolean; loss: number } | null;
  use: {
    effects: { stat: EffectStat; amount: number; time: number }[];
    mods: { stat: ModStat; value: number; duration: number }[];
    spoil: { hours: number; into: Ref | null } | null;
  } | null;
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
  loot: {
    c: string;
    name: Loc;
    kind: LootKind;
    event: LootEvent | null;
    /** El objeto que se abre, si la fuente es uno (un regalo, una bolsa de Halloween). */
    item: Ref | null;
    chance: number;
    min: number;
    max: number;
    bp: boolean;
    cond: [number, number] | null;
  }[];
  contents: (Ref & { chance: number; min: number; max: number; bp: boolean })[];
  obtained: { how: HowKind; from: (Ref & { amount: number })[]; amount: number; chance: number; time?: number; bp?: boolean }[];
  turns: { how: Exclude<HowKind, "mix">; into: Ref; amount: number; chance: number }[];
  shops: { shop: Loc; amount: number; bp: boolean; currency: Ref; price: number }[];
  deploy: {
    attach: Ref[];
    upkeep: (Ref & { amount: number })[];
    /** En horas, sin mantenimiento y afuera de una base. */
    decay: { delay: number; duration: number } | null;
  } | null;
  vibration: number | null;
  detectedBy: Ref | null;
  /** `icon`: ruta debajo de `/rust/` sin `.webp` (`skins/10135` o `items/rifle.ak.ice`). */
  skins: { id: number; name: Loc; icon: string | null; workshop: boolean }[];
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
