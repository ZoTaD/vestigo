import { LANGS, DEADLOCK_PAGES, POE2_SECTIONS, SITE_ORIGIN, VALHEIM_TABS, routePath, slugify, type ValheimTab } from "./route";

/**
 * The list of addresses we ask Google to crawl.
 *
 * Written as a pure function over the pipeline's own output rather than a file
 * kept by hand: a catalog change rewrites the data, and a sitemap that still
 * lists last patch's heroes is worse than none at all.
 *
 * It takes the data as arguments instead of importing it so the build script
 * can call it from Node — where the app's `@deadlock` alias does not exist —
 * while the tests call it with the real files. `sitemap.test.ts` checks the
 * slugs it produces against the ones the running app uses, so the two cannot
 * drift.
 *
 * Las direcciones de TFT (pestañas, bandas, unidades, ítems y comps) salieron
 * de acá el 2026-09-15 junto con el juego; `netlify.toml` las contesta con 301
 * a la portada para que Google las saque del índice.
 */

interface Localized {
  en: string;
}

/** Una edición de Vestigo News, tal como la lista `data/news.json`. */
export interface NewsEntry {
  /** La fecha de publicación, YYYY-MM-DD: es su dirección. */
  slug: string;
  /** "09-16-2026 Update". */
  title: string;
  date: string;
  headline?: string;
  score: { nerf: number; buff: number; mixed: number; fix: number };
}

/**
 * Lo que el sitemap necesita de Path of Exile 2 (2026-09-23): las ligas de la
 * economía, las fichas de la enciclopedia y las ediciones del diario de
 * parches, tal como las escriben los pipelines de `games/poe2`.
 */
export interface Poe2SitemapData {
  /** La primera es la de por defecto, que ya es `/poe2` a secas. */
  leagues: { slug: string; name: string }[];
  /** Cada ficha, con su id `<cat>/<slug>`, que es su dirección. */
  entries: { id: string; cat: string; en: string; es: string }[];
  editions: { slug: string; version: string; date: string; title: { en: string; es: string | null } }[];
}

/**
 * Lo que el sitemap necesita de Valheim (2026-09-24): las fichas del índice
 * de la sección y las ediciones de la Crónica, tal como las escriben
 * `games/valheim/pipeline/site.py` y `patches.py`.
 */
export interface ValheimSitemapData {
  entries: { slug: string; tab: ValheimTab; en: string; es: string }[];
  editions: { slug: string; version: string; date: string; title: { en?: string; es?: string } }[];
}

/** Las categorías de la enciclopedia, en el orden de sus pestañas. */
export const POE2_CATS = ["gems", "uniques", "bases", "currency"] as const;

export interface SitemapData {
  /** Deadlock's catalog: hero and item name, in both languages. */
  dlHeroes: Record<string, { name: Localized }>;
  dlItems: Record<string, { name: Localized }>;
  /** Which heroes/items have data in the published default band. */
  dlHeroIds: string[];
  dlItemIds: string[];
  /**
   * Las ediciones de Vestigo News, de la más nueva a la más vieja. Opcional
   * porque el índice puede no existir todavía en un checkout viejo.
   */
  dlNews?: NewsEntry[];
  /** Path of Exile 2. Opcional por lo mismo que `dlNews`. */
  p2?: Poe2SitemapData;
  /** Valheim. Opcional por lo mismo. */
  vh?: ValheimSitemapData;
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

/** Every hero/item detail slug the Deadlock pages should list. */
export function deadlockDetailSlugs(data: SitemapData): { heroes: string[]; items: string[] } {
  return {
    heroes: uniqueSlugs(data.dlHeroIds.map((id) => data.dlHeroes[id]?.name.en ?? id)),
    items: uniqueSlugs(data.dlItemIds.map((id) => data.dlItems[id]?.name.en ?? id)),
  };
}

/** Every path the site answers, in every language. */
export function sitemapPaths(data: SitemapData): string[] {
  const paths: string[] = [];

  // `Route` sigue llevando la pestaña de TFT aunque el sitio ya no la sirva;
  // acá va con su valor por defecto y no cambia ningún camino.
  const base = { section: "meta", dlSection: "meta" } as const;

  for (const lang of LANGS) {
    paths.push(routePath({ ...base, lang, view: "home" }));
    for (const view of ["privacy", "terms"] as const) {
      paths.push(routePath({ ...base, lang, view }));
    }

    // Las pestañas de Deadlock. La de meta sale como /deadlock a secas, que es
    // la URL que ya estaba indexada.
    for (const dlSection of DEADLOCK_PAGES) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection }));
    }
    // Una página por héroe y por ítem de la banda publicada por defecto. No
    // se recorre DL_DETAIL_SECTIONS genéricamente porque cada sección saca
    // sus slugs de un catálogo distinto (héroes vs. ítems).
    for (const slug of deadlockDetailSlugs(data).heroes) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection: "meta", detail: slug }));
    }
    // La ficha entera de cada héroe, la que se abre desde la pestaña Héroes.
    for (const slug of deadlockDetailSlugs(data).heroes) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection: "heroes", detail: slug }));
    }
    for (const slug of deadlockDetailSlugs(data).items) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection: "items", detail: slug }));
    }
    // Una página por edición de Vestigo News (2026-09-18). Son las notas de
    // parche, que es lo que más se busca con fecha de vencimiento: si no están
    // indexadas la primera semana, no cuentan.
    for (const e of data.dlNews ?? []) {
      paths.push(routePath({ ...base, lang, view: "deadlock", dlSection: "patches", detail: e.slug }));
    }

    // Path of Exile 2 entero (2026-09-23): cada pestaña, cada liga de la
    // economía salvo la de por defecto (que ya es /poe2), cada categoría y cada
    // ficha de la enciclopedia, y cada edición del diario de parches.
    if (data.p2) {
      const p2 = (p2Section: (typeof POE2_SECTIONS)[number], detail?: string) =>
        routePath({ ...base, lang, view: "poe2", p2Section, detail });
      for (const s of POE2_SECTIONS) paths.push(p2(s));
      for (const l of data.p2.leagues.slice(1)) paths.push(p2("economy", l.slug));
      for (const c of POE2_CATS) if (data.p2.entries.some((e) => e.cat === c)) paths.push(p2("encyclopedia", c));
      for (const e of data.p2.entries) paths.push(p2("encyclopedia", e.id));
      for (const e of data.p2.editions) paths.push(p2("patches", e.slug));
    }

    // Valheim entero (2026-09-24): la portada, las diez pestañas, cada ficha
    // (objetos, piezas, criaturas, biomas y jefes) y la Crónica con cada edición.
    if (data.vh) {
      paths.push(routePath({ ...base, lang, view: "valheim", vhSection: "home" }));
      for (const t of VALHEIM_TABS) paths.push(routePath({ ...base, lang, view: "valheim", vhSection: t }));
      for (const e of data.vh.entries) paths.push(routePath({ ...base, lang, view: "valheim", vhSection: e.tab, detail: e.slug }));
      paths.push(routePath({ ...base, lang, view: "valheim", vhSection: "patches" }));
      for (const e of data.vh.editions) paths.push(routePath({ ...base, lang, view: "valheim", vhSection: "patches", detail: e.slug }));
    }
  }

  // Sin repetidas: una dirección dos veces es una página escrita dos veces y
  // una entrada de más en el sitemap (le pasó al índice de Valheim, 2026-09-24).
  return [...new Set(paths)];
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
