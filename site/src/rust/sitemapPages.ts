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

/** Granjas: la calculadora de genética y una ficha por planta. */
export function farmingPages(f: { plants: { id: string; name: Loc }[] }): RustPage[] {
  return [
    { tab: "farming", slug: "genetics", en: "Genetics calculator", es: "Calculadora de genética" },
    ...f.plants.map((p) => ({ tab: "farming" as const, slug: p.id, en: p.name.en, es: p.name.es })),
  ];
}
