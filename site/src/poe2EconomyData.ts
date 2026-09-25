/**
 * Datos de la pestaña Economía de PoE2 (2026-09-23).
 *
 * `games/poe2/data/economy/` lo escribe `games/poe2/pipeline/economy.mjs`: dos
 * archivos por liga y el índice `leagues.json`. `<slug>.json` trae la moneda y
 * sólo las pestañas de los únicos; sus filas (tres cuartos del peso) viven en
 * `<slug>.uniques.json` y se piden recién al abrir una de esas pestañas o al
 * buscar (2026-09-25, ver economy-split.mjs). Nada entra al bundle: se pide lo
 * que se abre y queda en memoria para el resto de la visita.
 */
import type { Lang } from "./i18n";
import index from "@poe2/economy/leagues.json";

export type Currency = "divine" | "chaos" | "exalted";

export interface ExchangeRow {
  id: string;
  en: string;
  es: string;
  icon: string | null;
  /** Precio en divinos. */
  v: number;
  /** Volumen comerciado, en divinos. */
  vol: number;
  /** Cambio en 7 días, en %. */
  chg: number | null;
  /** % acumulado día por día (7 puntos); puede traer huecos. */
  spark: (number | null)[];
}

export interface UniqueRow {
  id: string;
  en: string;
  es: string;
  baseEn: string;
  base: string;
  icon: string;
  v: number;
  /** Publicaciones que sostienen el precio. */
  n: number;
  chg: number | null;
  spark: (number | null)[];
  lvl: number;
  corrupted: boolean;
  modsEn: string[];
  mods: string[];
  impsEn: string[];
  imps: string[];
}

export interface Tab<R> {
  id: string;
  label: { es: string; en: string };
  rows: R[];
}

/** Una pestaña de únicos sin sus filas: lo que trae `<slug>.json`. */
export interface UniqueHead {
  id: string;
  label: { es: string; en: string };
  count: number;
}

export interface Economy {
  league: string;
  updated: string;
  rates: { chaos: number; exalted: number };
  core: Record<Currency, { en: string; es: string; icon: string }>;
  exchange: Tab<ExchangeRow>[];
  uniques: UniqueHead[];
}

/** Las filas de cada pestaña de únicos, por id de pestaña. */
export type UniqueRows = Record<string, UniqueRow[]>;

export interface League {
  id: string;
  slug: string;
  name: string;
  hardcore: boolean;
  /** Standard y Hardcore: no terminan nunca. */
  permanent: boolean;
  updated: string;
  /** Volumen del intercambio en divinos, sumado entre todas las pestañas. */
  volume: number;
}

/** El índice es chico (seis ligas), así que va en el bundle. */
export const LEAGUES: League[] = (index as { leagues: League[] }).leagues;
/** La primera del índice: el orden es el del proveedor, que pone arriba la liga en curso. */
export const DEFAULT_LEAGUE: League = LEAGUES[0];

export const leagueBySlug = (slug: string | undefined): League =>
  LEAGUES.find((l) => l.slug === slug) ?? DEFAULT_LEAGUE;

/**
 * La misma liga en el otro modo: "Forbidden Rites" ↔ "HC Forbidden Rites",
 * "Standard" ↔ "Hardcore". Así el selector son dos preguntas (qué liga, y si
 * es hardcore) en vez de seis botones sueltos.
 */
export const baseName = (l: League): string =>
  l.id === "Hardcore" ? "Standard" : l.id.replace(/^HC /, "");
export function sibling(l: League, hardcore: boolean): League | undefined {
  return LEAGUES.find((o) => o.hardcore === hardcore && baseName(o) === baseName(l));
}
/** Las ligas sin repetir el par softcore/hardcore, en el orden del índice. */
export const BASE_LEAGUES: League[] = LEAGUES.filter((l, i) => LEAGUES.findIndex((o) => baseName(o) === baseName(l)) === i);

const archivos = import.meta.glob<{ default: unknown }>([
  "@poe2/economy/*.json",
  "!@poe2/economy/leagues.json",
  "!@poe2/economy/*.uniques.json",
]);
const archivosUnicos = import.meta.glob<{ default: unknown }>("@poe2/economy/*.uniques.json");
const pedidos = new Map<string, Promise<Economy>>();
/** Lo ya cargado, para el primer render (y el prerender del build). */
const listas = new Map<string, Economy>();
export function loadEconomy(slug: string): Promise<Economy> {
  let p = pedidos.get(slug);
  if (!p) {
    const key = Object.keys(archivos).find((k) => k.endsWith(`/${slug}.json`));
    if (!key) return Promise.reject(new Error(`sin datos de la liga ${slug}`));
    p = archivos[key]().then((m) => {
      listas.set(slug, m.default as Economy);
      return m.default as Economy;
    });
    pedidos.set(slug, p);
  }
  return p;
}
export const peekEconomy = (slug: string): Economy | null => listas.get(slug) ?? null;

const pedidosUnicos = new Map<string, Promise<UniqueRows>>();
const unicos = new Map<string, UniqueRows>();
/** Las filas de los únicos de una liga, que viajan en su propio archivo. */
export function loadUniques(slug: string): Promise<UniqueRows> {
  let p = pedidosUnicos.get(slug);
  if (!p) {
    const key = Object.keys(archivosUnicos).find((k) => k.endsWith(`/${slug}.uniques.json`));
    if (!key) return Promise.resolve({});
    p = archivosUnicos[key]().then((m) => {
      const file = m.default as { tabs: { id: string; rows: UniqueRow[] }[] };
      const rows: UniqueRows = Object.fromEntries(file.tabs.map((t) => [t.id, t.rows]));
      unicos.set(slug, rows);
      return rows;
    });
    pedidosUnicos.set(slug, p);
  }
  return p;
}
export const peekUniques = (slug: string): UniqueRows | null => unicos.get(slug) ?? null;

/** Por debajo de esto un precio no es confiable: casi nadie lo vende. */
export const isThin = (r: ExchangeRow | UniqueRow): boolean => ("n" in r ? r.n < 10 : r.vol < 1);

/** La moneda con la que conviene mostrar un precio: divino, caos o exaltado. */
export function pickCurrency(e: Economy, divines: number): { amount: number; cur: Currency } {
  if (divines >= 1) return { amount: divines, cur: "divine" };
  if (divines * e.rates.chaos >= 1) return { amount: divines * e.rates.chaos, cur: "chaos" };
  return { amount: divines * e.rates.exalted, cur: "exalted" };
}

export function fmtAmount(v: number, lang: Lang): string {
  const a = Math.abs(v);
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  return new Intl.NumberFormat(lang === "es" ? "es-AR" : "en-US", { maximumFractionDigits: digits }).format(v);
}

export const nameOf = (r: { en: string; es: string }, lang: Lang): string => (lang === "es" ? r.es : r.en);

/** Lo que se busca con el buscador: nombre, base y modificadores en los dos idiomas. */
export function haystack(r: ExchangeRow | UniqueRow): string {
  const parts = [r.en, r.es];
  if ("base" in r) parts.push(r.base, r.baseEn, ...r.mods, ...r.modsEn);
  return parts.join(" ").toLowerCase();
}
