import {
  LANGS,
  SECTIONS,
  DEADLOCK_SECTIONS,
  SITE_ORIGIN,
  routePath,
  slugify,
  type Section,
} from "./route";
import { BANDS, DEFAULT_BAND } from "./bands";

/**
 * The list of addresses we ask Google to crawl.
 *
 * Written as a pure function over the pipeline's own output rather than a file
 * kept by hand: a set change rewrites the catalog, and a sitemap that still
 * lists last set's champions is worse than none at all.
 *
 * It takes the data as arguments instead of importing it so the build script
 * can call it from Node — where the app's `@data` alias does not exist — while
 * the tests call it with the real files. `sitemap.test.ts` checks the slugs it
 * produces against the ones the running app uses, so the two cannot drift.
 */

interface Localized {
  en: string;
}

export interface SitemapData {
  champions: Record<string, { name: Localized }>;
  traits: Record<string, { name: Localized }>;
  items: Record<string, { name: Localized }>;
  /** From comps.json: the shape the meta page is built from. */
  comps: { signature: string; trait: string; carries: string[] }[];
  /** From units.json and items.json: which ids actually have a page. */
  unitIds: string[];
  itemIds: string[];
  /** Deadlock's catalog: hero and item name, in both languages. */
  dlHeroes: Record<string, { name: Localized }>;
  dlItems: Record<string, { name: Localized }>;
  /** Which heroes/items have data in the published default band. */
  dlHeroIds: string[];
  dlItemIds: string[];
}

/** The same name the comp shows on screen: defining trait, then carries. */
function compLabel(
  comp: { trait: string; carries: string[] },
  data: SitemapData
): string {
  const trait = data.traits[comp.trait]?.name.en ?? "";
  const carries = comp.carries.map((id) => data.champions[id]?.name.en ?? "");
  return [trait, ...carries].filter(Boolean).join(" ");
}

/**
 * Slugs, deduplicated the same way the app does it: a repeat gets a numbered
 * suffix rather than overwriting the entry that got there first.
 */
function uniqueSlugs(names: string[]): string[] {
  const taken = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const base = slugify(name);
    if (!base) continue;
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    out.push(slug);
  }
  return out;
}

export function detailSlugs(data: SitemapData): Record<"units" | "items" | "meta", string[]> {
  return {
    units: uniqueSlugs(data.unitIds.map((id) => data.champions[id]?.name.en ?? id)),
    items: uniqueSlugs(data.itemIds.map((id) => data.items[id]?.name.en ?? id)),
    meta: uniqueSlugs(data.comps.map((c) => compLabel(c, data))),
  };
}

/** Every hero/item detail slug the Deadlock pages should list. */
export function deadlockDetailSlugs(data: SitemapData): { heroes: string[]; items: string[] } {
  return {
    heroes: uniqueSlugs(data.dlHeroIds.map((id) => data.dlHeroes[id]?.name.en ?? id)),
    items: uniqueSlugs(data.dlItemIds.map((id) => data.dlItems[id]?.name.en ?? id)),
  };
}

/** Every path the site answers, in every language. */
export function sitemapPaths(data: SitemapData): string[] {
  const details = detailSlugs(data);
  const paths: string[] = [];

  // Toda ruta se arma con las dos pestañas por defecto y se sobreescribe la que
  // importa: `dlSection` sólo cambia el camino cuando la vista es Deadlock, y
  // `section` sólo cuando es TFT.
  const base = { section: "meta", dlSection: "meta" } as const;

  for (const lang of LANGS) {
    paths.push(routePath({ ...base, lang, view: "home" }));
    for (const view of ["privacy", "terms"] as const) {
      paths.push(routePath({ ...base, lang, view }));
    }

    // Las pestañas de Deadlock. La de meta sale como /deadlock a secas, que es
    // la URL que ya estaba indexada.
    for (const dlSection of DEADLOCK_SECTIONS) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection }));
    }
    // Una página por héroe y por ítem de la banda publicada por defecto. No
    // se recorre DL_DETAIL_SECTIONS genéricamente porque cada sección saca
    // sus slugs de un catálogo distinto (héroes vs. ítems).
    for (const slug of deadlockDetailSlugs(data).heroes) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection: "meta", detail: slug }));
    }
    for (const slug of deadlockDetailSlugs(data).items) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection: "items", detail: slug }));
    }

    for (const section of SECTIONS) {
      paths.push(routePath({ ...base, lang, view: "tft", section }));
      for (const detail of details[section as keyof typeof details] ?? []) {
        paths.push(routePath({ ...base, lang, view: "tft", section, detail }));
      }
    }

    // One landing page per rank band. The comps inside a band are deliberately
    // NOT listed: the same comp under four ranks would be four near-identical
    // pages competing with each other, which is how a site teaches Google to
    // ignore it. The default band is already covered by /tft/meta above.
    for (const band of BANDS) {
      if (band.id === DEFAULT_BAND) continue;
      paths.push(routePath({ ...base, lang, view: "tft", section: "meta", band: band.id }));
    }
  }

  return paths;
}

/**
 * The XML itself.
 *
 * Each URL carries its translations as `alternate` links, which is how Google
 * learns the two language versions are the same page rather than duplicates
 * competing with each other.
 */
export function sitemapXml(data: SitemapData, lastmod: string): string {
  const paths = sitemapPaths(data);
  // Group by the path with the language stripped, so both languages of one page
  // list each other.
  const byPage = new Map<string, string[]>();
  for (const path of paths) {
    const key = path.replace(/^\/(en|es)/, "") || "/";
    byPage.set(key, [...(byPage.get(key) ?? []), path]);
  }

  const entries = [...byPage.values()]
    .flatMap((group) =>
      group.map((path) => {
        const alternates = group
          .map((alt) => {
            const lang = alt.slice(1, 3);
            return `    <xhtml:link rel="alternate" hreflang="${lang}" href="${SITE_ORIGIN}${alt}"/>`;
          })
          .join("\n");
        return (
          `  <url>\n` +
          `    <loc>${SITE_ORIGIN}${path}</loc>\n` +
          `    <lastmod>${lastmod}</lastmod>\n` +
          `${alternates}\n` +
          `  </url>`
        );
      })
    )
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `${entries}\n` +
    `</urlset>\n`
  );
}

export const ROBOTS_TXT =
  `User-agent: *\n` +
  `Allow: /\n` +
  `\n` +
  `Sitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
