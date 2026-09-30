/**
 * Los slugs en español de las fichas de Diablo II (2026-09-30): `/es/d2r/unicos/la-rechinante` en vez de
 * `/es/d2r/unicos/the-gnasher`. Salen del nombre oficial en español de cada ficha, del mismo índice que usan el
 * sitemap y el `<head>` (la wiki y los jefes de la calculadora de drops).
 *
 * El build los arma una vez y los sirve como módulo (`virtual:d2r-slugs-es`, ver `vite.config.ts`): así no hay un
 * archivo más que regenerar cuando cambian los datos. La sección los anota en `route.ts` al cargarse.
 */
import { slugify, type D2rTab } from "../route";

/** Por pestaña, id → slug en español. Sólo las fichas cuyo slug cambia. */
export type D2rSlugsEs = Partial<Record<D2rTab, Record<string, string>>>;

/**
 * Las runas se llaman igual en los dos idiomas ("Runa El" es la El, y la pestaña ya dice "runas") y los parches son un
 * número: se quedan con su slug.
 */
const SAME_SLUG: D2rTab[] = ["runes", "patches"];

export function buildD2rEsSlugs(index: readonly { sec: D2rTab; id: string; es: string }[]): D2rSlugsEs {
  const bySec = new Map<D2rTab, { id: string; es: string }[]>();
  for (const e of index) {
    if (SAME_SLUG.includes(e.sec)) continue;
    const list = bySec.get(e.sec) ?? [];
    list.push({ id: e.id, es: slugify(e.es ?? "") || e.id });
    bySec.set(e.sec, list);
  }
  const out: D2rSlugsEs = {};
  for (const [sec, list] of bySec) {
    const ids = new Set(list.map((e) => e.id));
    const uses = new Map<string, number>();
    for (const e of list) uses.set(e.es, (uses.get(e.es) ?? 0) + 1);
    const map: Record<string, string> = {};
    for (const e of list) {
      // Dos fichas con el mismo nombre en español (Wrath y Temper son las dos "Ira"), o un nombre en español que es el
      // slug inglés de otra ficha: llevan también el inglés, así ninguna dirección abre dos cosas.
      const clash = (uses.get(e.es) ?? 0) > 1 || (e.es !== e.id && ids.has(e.es));
      const slug = clash ? `${e.es}-${e.id}` : e.es;
      if (slug !== e.id) map[e.id] = slug;
    }
    if (Object.keys(map).length) out[sec] = map;
  }
  return out;
}
