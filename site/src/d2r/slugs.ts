/**
 * Los slugs en español de las fichas de Diablo II (2026-09-30): `/es/d2r/unicos/la-rechinante` en vez de
 * `/es/d2r/unicos/the-gnasher`. Salen del nombre oficial en español de cada ficha, del mismo índice que usan el
 * sitemap y el `<head>` (la wiki y los jefes de la calculadora de drops).
 *
 * El build los arma una vez y los sirve como módulo (`virtual:d2r-slugs-es`, ver `vite.config.ts`): así no hay un
 * archivo más que regenerar cuando cambian los datos. La sección los anota en `route.ts` al cargarse. Las reglas
 * (choques, pestañas que no se traducen) están en `esSlugs.ts`, que desde Project Zomboid comparten los dos juegos.
 */
import type { D2rTab } from "../route";
import { buildEsSlugs } from "../esSlugs";

/** Por pestaña, id → slug en español. Sólo las fichas cuyo slug cambia. */
export type D2rSlugsEs = Partial<Record<D2rTab, Record<string, string>>>;

/**
 * Las runas se llaman igual en los dos idiomas ("Runa El" es la El, y la pestaña ya dice "runas") y los parches son un
 * número: se quedan con su slug.
 */
const SAME_SLUG: D2rTab[] = ["runes", "patches"];

export const buildD2rEsSlugs = (index: readonly { sec: D2rTab; id: string; es: string }[]): D2rSlugsEs =>
  buildEsSlugs(index, SAME_SLUG);
