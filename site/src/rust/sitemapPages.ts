/**
 * Las fichas de las pestañas de Rust de la etapa 2 (2026-10-09) que entran al sitemap y al prerender, armadas desde sus
 * datos. Las usa el build (`vite.config.ts`, `readSitemapData`) y los tests: así el sitemap y el prerender salen de la
 * misma cuenta. Sin React ni `import()`: recibe los JSON ya leídos.
 */
import type { RustTab } from "../route";

export interface RustPage {
  tab: RustTab;
  /** El id de la ficha (slug inglés); el español sale de los slugs registrados. */
  slug: string;
  en: string;
  es: string | null;
  /** La fecha propia de la ficha (un parche), para el `lastmod`. Sin ella, la de los datos de Rust. */
  date?: string;
}

type Loc = { en: string; es: string | null };

/** Parches: una ficha por edición, con su fecha (va al `lastmod`). El nombre es el mismo en los dos idiomas. */
export function patchesPages(idx: { editions: { slug: string; name: string; date: string }[] }): RustPage[] {
  return idx.editions.map((e) => ({ tab: "patches" as const, slug: e.slug, en: e.name, es: e.name, date: e.date }));
}

/** Monumentos: una ficha por monumento. */
export function monumentsPages(d: { monuments: { id: string; name: Loc }[] }): RustPage[] {
  return d.monuments.map((m) => ({ tab: "monuments" as const, slug: m.id, en: m.name.en, es: m.name.es }));
}

/** Granjas: la calculadora de genética y una ficha por planta. */
export function farmingPages(f: { plants: { id: string; name: Loc }[] }): RustPage[] {
  return [
    { tab: "farming", slug: "genetics", en: "Genetics calculator", es: "Calculadora de genética" },
    ...f.plants.map((p) => ({ tab: "farming" as const, slug: p.id, en: p.name.en, es: p.name.es })),
  ];
}
