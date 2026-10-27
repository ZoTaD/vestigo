/**
 * Lo que el sitemap y el prerender necesitan de Warframe (2026-10-27), armado de los archivos que escribe
 * `games/warframe/tools/site_data.py`: `meta.json` y la lista liviana de cada pestaña con fichas (`<pestaña>/list.json`).
 * Lo llaman el build (`readSitemapData` en vite.config.ts) y los tests, así los dos leen igual.
 *
 * De paso anota en `route.ts` los slugs en español de cada pestaña (sólo los que cambian), para que el sitemap y el
 * prerender escriban las direcciones en español.
 */
import { registerWfSlugs } from "../route";
import type { WarframeSitemapData } from "../sitemap";

type Meta = { generatedAt: string };
type Pair = [en: string, es: string];
type Row = { slug: string; slugEs: string; name: Pair; kind?: string; planet?: Pair; type?: string };
/** Las pestañas con fichas (las de `WF_DETAIL_SECTIONS`). */
type FichaTab = "arsenal" | "relics" | "farming" | "mods" | "star-chart";

export function warframeSitemapData(meta: Meta, lists: Record<FichaTab, Row[]>): WarframeSitemapData {
  registerWfSlugs(
    Object.fromEntries(
      (Object.keys(lists) as FichaTab[]).map((tab) => [tab, Object.fromEntries(lists[tab].filter((r) => r.slugEs !== r.slug).map((r) => [r.slug, r.slugEs]))]),
    ),
  );
  const rows = (tab: FichaTab) => lists[tab].map((r) => ({ slug: r.slug, en: r.name[0], es: r.name[1] || r.name[0] }));
  return {
    generatedAt: meta.generatedAt,
    arsenal: rows("arsenal"),
    relics: rows("relics"),
    farming: rows("farming"),
    // Un arcano lleva otro título que un mod (`seo.mod` en warframeCopy.ts).
    mods: lists.mods.map((r) => ({ slug: r.slug, en: r.name[0], es: r.name[1] || r.name[0], ...(r.kind === "arcane" ? { arcane: true as const } : {}) })),
    // Un nodo nombra su planeta y su tipo de misión en el título (`detailSeo["star-chart"]`).
    "star-chart": lists["star-chart"].map((r) => ({ slug: r.slug, en: r.name[0], es: r.name[1] || r.name[0], planet: r.planet ?? ["", ""], type: r.type ?? "" })),
  };
}
