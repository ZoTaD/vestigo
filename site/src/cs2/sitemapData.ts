/**
 * Lo que el sitemap y el prerender necesitan de CS2 (2026-11-03), armado de los archivos que escribe
 * `games/cs2/tools/site_data.py`: el sello de `meta.json` (la fecha del último cambio de catálogo, no la de los precios)
 * y la lista de cada pestaña. Lo llaman el build (`readSitemapData` en vite.config.ts) y los tests, así los dos leen igual.
 */
import type { Cs2SitemapData } from "../sitemap";

type Row = { slug: string; name: string; phase?: string };

export function cs2SitemapData(
  meta: { generatedAt: string },
  lists: Record<"skins" | "cases" | "collections", Row[]>,
  patches?: NonNullable<Cs2SitemapData["patches"]>,
): Cs2SitemapData {
  const rows = (rs: Row[]) => rs.map((r) => ({ slug: r.slug, name: r.phase ? `${r.name} · ${r.phase}` : r.name }));
  return {
    generatedAt: meta.generatedAt,
    skins: rows(lists.skins),
    cases: rows(lists.cases),
    collections: rows(lists.collections),
    // Etapa 5: sólo lo que nombra la página de cada edición.
    patches: patches?.map((p) => ({ slug: p.slug, date: p.date, kind: p.kind, title: p.title })),
  };
}
