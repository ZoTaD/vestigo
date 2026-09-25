import { useEffect, useState } from "react";
import indexJson from "@deadlock/news.json";

/**
 * Las ediciones de Vestigo News.
 *
 * Las escribe `games/deadlock/pipeline/src/news-run.ts`, una por parche, y los
 * tipos de acá son un espejo de los de `news.ts`. El índice pesa ~1 KB y va en
 * el bundle; cada edición (~30 KB) se baja al abrirla.
 *
 * **El español es aparte y a mano**: `news/<fecha>.es.json` trae cada línea
 * traducida, indexada por el texto original de Valve. Si falta, la edición en
 * español muestra las líneas en inglés y lo avisa.
 */

export type Dir = "up" | "down" | "mid" | "fix";
export type Verdict = "nerf" | "buff" | "mixed" | "fix";

export interface NewsLine {
  src: string;
  text?: string;
  dir: Dir;
}

export interface Named {
  name: { en: string; es: string };
  img: string;
}

export interface Tally {
  nerf: number;
  buff: number;
  mixed: number;
  fix: number;
}

export interface Edition {
  slug: string;
  title: string;
  date: string;
  url: string;
  headline?: string;
  score: Tally;
  itemScore: Tally;
  totals: { heroes: number; heroLines: number; items: number; itemLines: number; general: number };
  general: NewsLine[];
  heroes: { heroId: number; verdict: Verdict; up: number; down: number; groups: { abilityId?: number; lines: NewsLine[] }[] }[];
  items: { itemId: number; verdict: Verdict; lines: NewsLine[] }[];
  unparsed: NewsLine[];
  abilities: Record<string, Named>;
  itemInfo: Record<string, Named & { slot: string }>;
}

export interface Translation {
  headline?: string;
  lines: Record<string, string>;
}

export interface IndexEntry {
  slug: string;
  title: string;
  date: string;
  headline?: string;
  score: Tally;
  itemScore: Tally;
}

/** De la más nueva a la más vieja. */
export const editions: IndexEntry[] = (indexJson as unknown as { editions: IndexEntry[] }).editions;

/**
 * `import.meta.glob` y no un `import()` armado a mano: Vite necesita ver el
 * patrón al compilar para emitir un chunk por edición. Las traducciones caen en
 * el mismo patrón y se separan por nombre.
 */
const FILES = import.meta.glob("../../games/deadlock/data/news/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;
const pathOf = (slug: string, es = false) => `../../games/deadlock/data/news/${slug}${es ? ".es" : ""}.json`;

export const hasEdition = (slug: string): boolean => pathOf(slug) in FILES;

/**
 * La edición que corresponde a una URL: la pedida si existe, si no la última.
 * `missing` avisa que se pidió una que no existe.
 */
export function resolveSlug(requested: string | undefined): { slug?: string; missing: boolean } {
  if (requested && hasEdition(requested)) return { slug: requested, missing: false };
  return { slug: editions[0]?.slug, missing: !!requested };
}

export interface LoadedEdition {
  edition: Edition;
  es?: Translation;
}

const cache = new Map<string, LoadedEdition>();

/** Precarga una edición (el prerender la llama antes de renderizar). */
export const loadEdition = (slug: string): Promise<LoadedEdition> => load(slug);

async function load(slug: string): Promise<LoadedEdition> {
  const hit = cache.get(slug);
  if (hit) return hit;
  const [edition, es] = await Promise.all([
    FILES[pathOf(slug)]().then((m) => m.default as Edition),
    FILES[pathOf(slug, true)]?.().then((m) => m.default as Translation),
  ]);
  const out = { edition, es };
  cache.set(slug, out);
  return out;
}

/** La edición, o null mientras baja. */
export function useEdition(slug: string | undefined): LoadedEdition | null {
  const [state, setState] = useState<LoadedEdition | null>(slug ? (cache.get(slug) ?? null) : null);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    setState(cache.get(slug) ?? null);
    load(slug)
      .then((l) => alive && setState(l))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [slug]);
  return state;
}

/** El texto de una línea en el idioma pedido, y si hubo que caer al inglés. */
export function lineText(l: NewsLine, lang: "en" | "es", es?: Translation): string {
  if (lang === "es" && es?.lines[l.src]) return es.lines[l.src];
  return l.text ?? l.src;
}
