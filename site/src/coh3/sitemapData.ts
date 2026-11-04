/**
 * Lo que el sitemap y el prerender necesitan de Company of Heroes 3 (2026-11-04), armado de los archivos que escribe
 * `games/coh3/tools/site_data.py`: el sello de `meta.json` y, de cada pestaña del explorador, slug y nombre en/es.
 */
import type { Coh3Named, Coh3SitemapData } from "../sitemap";

type Row = { slug: string; name: { en: string; es?: string | null } | string; title?: { en: string; es?: string | null } | string };

const named = (rows: Row[] | undefined): Coh3Named[] =>
  (rows ?? []).map((r) => {
    const n = r.name ?? r.title ?? r.slug;
    const en = typeof n === "string" ? n : n.en;
    const es = typeof n === "string" ? n : n.es || n.en;
    return { slug: r.slug, name: { en, es } };
  });

export function coh3SitemapData(
  meta: { generatedAt: string },
  lists: { units: Row[]; weapons: Row[]; battlegroups: Row[]; maps: Row[]; patches: Row[] },
): Coh3SitemapData {
  return {
    generatedAt: meta.generatedAt,
    units: named(lists.units),
    weapons: named(lists.weapons),
    battlegroups: named(lists.battlegroups),
    maps: named(lists.maps),
    patches: named(lists.patches),
  };
}
