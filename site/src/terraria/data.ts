/**
 * Los datos de Terraria (2026-10-12) y cómo bajan: lo que escribe `games/terraria/tools/site_data.py`.
 *
 * - La lista liviana (`list.json`) y los nombres del idioma que se está leyendo (`names-en.json` o `names-es.json`).
 * - Las fichas, repartidas en `TR_SHARDS` archivos por el hash del slug inglés.
 * - Un mapa español → inglés repartido igual por el slug español, para abrir en frío una ficha en español sin bajar
 *   la lista entera.
 *
 * Cada vez que llega algo que nombra objetos (una ficha, la lista en español) se anotan sus slugs en español en
 * `route.ts`, que es lo que escribe los enlaces.
 */
import { registerTerrariaSlugs, type Route } from "../route";
import { KINDS, type Kind } from "../terrariaCopy";
import { pzShardOf } from "../zomboid/shard";
import { once, shardedFichas } from "../zomboid/store";

/** `CHUNKS` de site_data.py: si se cambia uno se cambia el otro (lo prueba terrariaData.test.ts). */
export const TR_SHARDS = 64;
const shard = (slug: string) => pzShardOf(slug, TR_SHARDS);

export type Lang = "en" | "es";

/** Una fila de `list.json`: id, slug inglés, tipo, rareza, ancho y alto del sprite (0 = sin sprite), cifra, banderas. */
type RawRow = [id: number, slug: string, kind: Kind, rare: number, w: number, h: number, figure: number, has: number];
/** Un objeto de la lista, ya con su nombre en el idioma pedido. */
export interface Row {
  id: number;
  slug: string;
  name: string;
  kind: Kind;
  rare: number;
  w: number;
  h: number;
  /** Daño, o defensa si no hace daño; 0 si ninguna. */
  figure: number;
  /** ¿Se fabrica? Sólo esos se pueden elegir en el árbol de crafteo. */
  craft: boolean;
}

/** Otro objeto nombrado por una ficha: slug, slug en español, nombres, rareza y tamaño del sprite. */
export type Ref = [slug: string, slugEs: string, en: string, es: string, rare: number, w: number, h: number];
/** Una receta: qué sale, cuántos, estación (−1 a mano), condiciones en bits, ingredientes (negativo = grupo). */
export type Recipe = [out: number, qty: number, tile: number, flags: number, ings: [key: number, n: number][]];
export type Stats = Partial<
  Record<
    | "damage" | "crit" | "useTime" | "useAnimation" | "knockBack" | "defense" | "pick" | "axe" | "hammer" | "mana" | "healLife"
    | "healMana" | "value" | "maxStack" | "tileBoost" | "fishingPole" | "bait" | "buffTime",
    number
  > &
    Record<"consumable" | "expert" | "master" | "melee" | "ranged" | "magic" | "summon" | "sentry" | "accessory" | "vanity" | "material" | "autoReuse", boolean>
>;

/** De qué otra forma se consigue: lo que escribe `games/terraria/tools/sources.py`. */
export interface Source {
  k: "shop" | "travel" | "pylon" | "angler" | "chest" | "pot" | "tree" | "bag" | "crate" | "open" | "fish" | "extract" | "shimmer";
  /** El NPC que lo vende (su nombre está en `npcs`). */
  n?: number;
  /** El objeto del que sale: la bolsa, la caja, lo que se pasa por el extractor o por el Shimmer. */
  i?: number;
  /** La estación (el extractor). */
  t?: number;
  /** El nombre del cofre. */
  l?: [en: string, es: string];
  /** El precio, en monedas de cobre; con `c`, en unidades de ese objeto. */
  p?: number;
  c?: number;
  /** Cantidad mínima y máxima. */
  q?: [min: number, max: number];
  /** Probabilidad, de 0 a 1. */
  r?: number;
  /** La rareza de la captura, en pesca. */
  tier?: "common" | "uncommon" | "rare" | "veryrare" | "legendary";
  /** La condición, ya escrita. */
  if?: [en: string, es: string];
}

export interface Ficha {
  id: number;
  slug: string;
  slugEs: string;
  name: [en: string, es: string];
  rare: number;
  size: [w: number, h: number];
  kind: Kind;
  tip: [en: string, es: string];
  stats: Stats;
  recipes: Recipe[];
  /** Las estaciones de sus recetas: el objeto que la coloca (0 si ninguno) y su nombre. */
  stations: Record<string, [item: number, en: string, es: string]>;
  /** Los grupos de sus recetas ("cualquier madera"): nombre y el objeto que hace de ícono. */
  groups: Record<string, [en: string, es: string, icon: number]>;
  /** Dónde se usa: qué sale y cuántos de este objeto pide. */
  uses: [out: number, need: number][];
  /** Quién lo suelta: enemigo, cantidad mínima y máxima, probabilidad (0–1) y modo ("n", "e", "m" o ""). */
  drops: [npc: number, min: number, max: number, rate: number, mode: string][];
  /** Tiendas, cofres, bolsas de jefe, cajas, pesca, extractor y Shimmer. */
  sources: Source[];
  refs: Record<string, Ref>;
  npcs: Record<string, [en: string, es: string]>;
}

export interface RecipeDb {
  recipes: Recipe[];
  groups: Record<string, { en: string; es: string; items: number[] }>;
  tiles: Record<string, { en: string; es: string; item: number }>;
}

/** Los destacados de la portada: id y lo mismo que una referencia. */
export type Featured = [id: number, ...Ref];

const rows = once<RawRow[]>(() => import("@terraria/site/list.json"));
const namesEn = once<string[]>(() => import("@terraria/site/names-en.json"));
const namesEs = once<[name: string, slug: string][]>(() => import("@terraria/site/names-es.json"));
const recipeDb = once<RecipeDb>(() => import("@terraria/site/recipes.json"));
const fichas = shardedFichas<Ficha>(import.meta.glob<{ default: Record<string, Ficha> }>("@terraria/site/items/*.json"), shard);
const esToEn = shardedFichas<string>(import.meta.glob<{ default: Record<string, string> }>("@terraria/site/es/*.json"), shard);

const lists: Partial<Record<Lang, Row[]>> = {};

function buildList(lang: Lang): Row[] | null {
  if (lists[lang]) return lists[lang]!;
  const raw = rows.peek();
  const en = namesEn.peek();
  const es = namesEs.peek();
  if (!raw || (lang === "es" ? !es : !en)) return null;
  if (lang === "es") registerTerrariaSlugs({ items: Object.fromEntries(raw.flatMap((r, i) => (es![i][1] !== r[1] ? [[r[1], es![i][1]]] : []))) });
  const list = raw.map((r, i): Row => ({ id: r[0], slug: r[1], name: lang === "es" ? es![i][0] : en![i], kind: r[2], rare: r[3], w: r[4], h: r[5], figure: r[6], craft: (r[7] & 1) > 0 }));
  // Por tipo (armas primero, bloques y vanidad al final) y, dentro del tipo, por nombre: en orden alfabético puro la
  // lista abría con las estatuas de letras.
  const order = new Map(KINDS.map((k, i) => [k, i]));
  list.sort((a, b) => order.get(a.kind)! - order.get(b.kind)! || a.name.localeCompare(b.name, lang));
  return (lists[lang] = list);
}

export const peekList = (lang: Lang): Row[] | null => buildList(lang);
export const loadList = (lang: Lang): Promise<Row[]> =>
  Promise.all([rows.load(), lang === "es" ? namesEs.load() : namesEn.load()]).then(() => buildList(lang)!);

/** Anota los slugs en español de una ficha y de todo lo que nombra. */
function note(f: Ficha | null): Ficha | null {
  if (f) {
    const own = f.slugEs !== f.slug ? [[f.slug, f.slugEs]] : [];
    registerTerrariaSlugs({ items: Object.fromEntries([...own, ...Object.values(f.refs).flatMap((r) => (r[1] !== r[0] ? [[r[0], r[1]]] : []))]) });
  }
  return f;
}

export const peekItem = (slug: string): Ficha | null | undefined => fichas.peek(slug);
export const loadItem = (slug: string): Promise<Ficha | null> => fichas.load(slug).then(note);

export const peekRecipes = (): RecipeDb | null => recipeDb.peek();
export const loadRecipes = (): Promise<RecipeDb> => recipeDb.load();

export const say = (pair: readonly [string, string], lang: Lang): string => (lang === "es" && pair[1]) || pair[0];
/** El nombre de una referencia en el idioma pedido. */
export const refName = (r: Ref, lang: Lang): string => (lang === "es" && r[3]) || r[2];

/**
 * Lo que una dirección de Objetos necesita antes de dibujarse: la ficha, o la lista si no hay ficha (o no existe).
 * En español y en frío el slug todavía no se conoce: se busca en su pedacito del mapa y se anota, así la dirección
 * leída de nuevo ya es la ficha.
 */
export async function preloadItemsRoute(route: Route): Promise<void> {
  if (route.detail) {
    let slug = route.detail;
    if (route.lang === "es") {
      const en = await esToEn.load(slug).catch(() => null);
      if (en) {
        registerTerrariaSlugs({ items: { [en]: slug } });
        slug = en;
      }
    }
    if (await loadItem(slug)) return;
  }
  await loadList(route.lang);
}

/** El árbol necesita las recetas y la lista (los nombres y cuáles se fabrican). */
export async function preloadCraftingRoute(route: Route): Promise<void> {
  await Promise.all([loadRecipes(), loadList(route.lang)]);
}
