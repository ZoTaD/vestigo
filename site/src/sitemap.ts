import { LANGS, DEADLOCK_PAGES, D2R_SECTIONS, POE2_SECTIONS, PZ_DETAIL_SECTIONS, PZ_DETAILS_PENDING, PZ_PUBLISHED,PZ_SEGMENT, RUST_PUBLISHED, RUST_SEGMENT, SITE_ORIGIN, VALHEIM_TABS, parseRoute, routePath, slugify, type D2rTab, type PzTab, type ValheimTab } from "./route";

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

/**
 * Lo que el sitemap necesita de Diablo II (2026-09-29): el `meta.json` que
 * escribe `games/d2r/tools/extract.py`, más los índices de fichas (la wiki y los
 * jefes de la calculadora de drops) y los parches resumidos.
 */
export interface D2rSitemapData {
  build: string;
  patch: string;
  /** Cuándo cambiaron los datos de verdad (el extractor no la mueve si no cambió nada). */
  extractedAt: string;
  /**
   * Las fichas, con su pestaña: las de la wiki (`wiki/index.json`: runas, palabras rúnicas, únicos, conjuntos y clases) y
   * las de los jefes y superúnicos de la calculadora de drops (`drops/index.json`).
   */
  index?: { sec: D2rTab; id: string; en: string; es: string }[];
  /** Los parches resumidos (`patches/index.json`), con su fecha: es su `lastmod`. */
  patches?: { slug: string; version: string; date: string }[];
}

/** Lo que el sitemap necesita de Rust (2026-10-05): el `meta.json` de `games/rust/tools/extract.py`. */
export interface RustSitemapData {
  build: number;
  /** Cuándo cambiaron los datos de verdad (el extractor no la mueve si no cambió nada). */
  extractedAt: string;
  /** Las fichas de Objetos (`games/rust/data/site/list.json`): slug inglés y nombres, para el sitemap y el `<head>`. */
  items?: { slug: string; en: string; es: string | null; c?: 1; s?: 1; l?: 1; r?: 1 }[];
  /** Los circuitos listos de Electricidad (2026-10-09), por slug inglés (`site/src/rust/electric/circuits.ts`). */
  circuits?: string[];
}

/**
 * Lo que el sitemap necesita de Project Zomboid (2026-09-30): el `meta.json` y el `index.json` que escribe
 * `games/zomboid/tools/extract.py`.
 */
export interface ZomboidSitemapData {
  version: string;
  /** Cuándo cambiaron los datos de verdad (el extractor no la mueve si no cambió nada). */
  extractedAt: string;
  /**
   * Cuándo cambió el mapa de verdad (el `extractedAt` de `data/map/meta.json`, que escribe `map.py` y no se mueve si el
   * mapa salió igual). El Mapa se alimenta de eso y no del extractor general, que se corre más seguido: con la fecha
   * general, el sitemap diría que el mapa cambió cada vez que cambió un objeto.
   */
  mapExtractedAt?: string;
  /**
   * Cuándo cambió el botín de verdad (el `extractedAt` de `data/loot/meta.json`, que escribe `loot.py` y no se mueve si
   * el botín salió igual). Mueve la fecha de Objetos (cada ficha dice dónde aparece) y la del Mapa (cada edificio dice
   * qué puede aparecer por habitación), y Fabricación (qué se junta y qué se fabrica sale de dónde aparece cada cosa), y
   * sólo ésas: la receta de un rasgo no cambia porque cambió una tabla de botín.
   */
  lootExtractedAt?: string;
  /**
   * Las fichas, con su pestaña (objetos, recetas, rasgos, profesiones, habilidades, moodles). El build arma con ellas
   * los slugs en español, y el sitemap lista las de cada pestaña a medida que se publica.
   */
  index?: { sec: PzTab; id: string; en: string; es: string; via?: { en: string[]; es: string[] } }[];
  /**
   * Las versiones de la pestaña Parches (`site/patches/index.json`, 2026-10-02): una página por versión, con el slug
   * igual en los dos idiomas. Su `lastmod` es `updated` (cuándo se tocó su Crónica o su diff) o, sin eso, su fecha.
   */
  patches?: { slug: string; version: string; date: string; updated?: string }[];
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
  /** Diablo II: Resurrected. Opcional por lo mismo. */
  d2?: D2rSitemapData;
  /** Project Zomboid. Opcional por lo mismo. */
  zb?: ZomboidSitemapData;
  /** Rust. Opcional por lo mismo. */
  rs?: RustSitemapData;
  /**
   * Cuándo cambió de verdad cada juego, tal como lo sella su pipeline (ver
   * `sitemapLastmod`). Lo que no tiene sello va sin fecha.
   */
  dates?: { deadlock?: string; poe2Economy?: string; valheim?: string; d2r?: string; zomboid?: string; rust?: string };
}

/** Los sitemaps en que se parte el sitio: uno por juego y uno para lo demás. */
export const SITEMAP_GROUPS = ["site", "deadlock", "poe2", "valheim", "d2r", "zomboid", "rust"] as const;
export type SitemapGroup = (typeof SITEMAP_GROUPS)[number];

function sitemapGroup(path: string): SitemapGroup {
  const game = path.split("/")[2];
  // Zomboid se llama distinto en la dirección (`/project-zomboid`) que en el grupo.
  if (game === PZ_SEGMENT) return "zomboid";
  if (game === RUST_SEGMENT) return "rust";
  return game === "deadlock" || game === "poe2" || game === "valheim" || game === "d2r" ? game : "site";
}

/** La más nueva de unas fechas, o nada si no hay ninguna. */
function newest(dates: (string | undefined)[]): string | undefined {
  return dates.filter((d): d is string => !!d).sort().at(-1);
}

/**
 * La fecha en que cambió una página, o nada si no la sabemos.
 *
 * Hasta el 2026-09-26 todas las URLs llevaban la fecha de los datos de
 * Deadlock, que se regeneran cada día: el sitemap decía que las 10.500 páginas
 * (fichas de Valheim y PoE2 incluidas) cambiaron hoy. Google usa `lastmod` sólo
 * si es "consistently and verifiably accurate", y cuando no lo es deja de
 * leerlo en todo el sitio. Por eso cada página lleva la fecha de lo que la
 * alimenta, y la que no tiene sello va sin `lastmod` antes que con uno falso.
 */
export function sitemapLastmod(path: string, data: SitemapData): string | undefined {
  const [, , game, section, detail] = path.split("/");
  const day = (d: string | undefined) => d?.slice(0, 10) || undefined;
  if (game === "deadlock") {
    const news = data.dlNews ?? [];
    if (section === "patches") {
      return day(detail ? news.find((e) => e.slug === detail)?.date : newest(news.map((e) => e.date)));
    }
    return day(data.dates?.deadlock);
  }
  if (game === "poe2") {
    const editions = data.p2?.editions ?? [];
    if (section === "patches") {
      return day(detail ? editions.find((e) => e.slug === detail)?.date : newest(editions.map((e) => e.date)));
    }
    // `/poe2` a secas es la economía de la liga por defecto.
    if (!section || section === "economy") return day(data.dates?.poe2Economy);
    return undefined;
  }
  if (game === "valheim") {
    const editions = data.vh?.editions ?? [];
    if (section === "patches") {
      return day(detail ? editions.find((e) => e.slug === detail)?.date : newest(editions.map((e) => e.date)));
    }
    return day(data.dates?.valheim);
  }
  if (game === "d2r") {
    // En español la pestaña se llama "parches": se lee la ruta y no el segmento.
    const route = parseRoute(path);
    const patches = data.d2?.patches ?? [];
    if (route.d2Section === "patches") {
      return day(route.detail ? patches.find((p) => p.slug === route.detail)?.date : newest(patches.map((p) => p.date)));
    }
    return day(data.dates?.d2r);
  }
  if (game === PZ_SEGMENT) {
    // En español la pestaña se llama "mapa" y "objetos": se lee la ruta y no el segmento. Sin el sello del mapa, la
    // fecha de la sección antes que ninguna. El botín mueve la del Mapa y la de Objetos (lista y fichas): la más
    // reciente entre su sello y la propia de cada una; sin el sello del botín, queda como estaba.
    const route = parseRoute(path);
    const sec = route.pzSection;
    // Parches, como Diablo II: cada versión con la fecha en que se tocó su página, y la lista con la más nueva.
    if (sec === "patches") {
      const patches = data.zb?.patches ?? [];
      const when = (p: { date: string; updated?: string }) => p.updated ?? p.date;
      const p = route.detail ? patches.find((x) => x.slug === route.detail) : undefined;
      return day(route.detail ? (p && when(p)) : newest(patches.map(when)));
    }
    const loot = day(data.zb?.lootExtractedAt);
    const later = (a: string | undefined, b: string | undefined) => (a && b ? (a > b ? a : b) : a ?? b);
    if (sec === "map") return later(day(data.zb?.mapExtractedAt) ?? day(data.dates?.zomboid), loot);
    // Fabricación también: cada objeto dice si se encuentra tirado o se fabrica, y eso sale del botín.
    if (sec === "items" || sec === "crafting") return later(day(data.dates?.zomboid), loot);
    return day(data.dates?.zomboid);
  }
  if (game === RUST_SEGMENT) return day(data.dates?.rust);
  return undefined;
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

  // La pestaña de Deadlock es obligatoria en `Route`; fuera de Deadlock va con
  // su valor por defecto y no cambia ningún camino.
  const base = { dlSection: "meta" } as const;

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
      paths.push(routePath({ ...base, lang, view: "valheim", vhSection: "map" }));
      paths.push(routePath({ ...base, lang, view: "valheim", vhSection: "planner" }));
      for (const e of data.vh.editions) paths.push(routePath({ ...base, lang, view: "valheim", vhSection: "patches", detail: e.slug }));
    }

    // Diablo II: Resurrected (2026-09-29): la portada, cada pestaña, cada ficha (la wiki y los jefes de la calculadora de
    // drops) y cada parche resumido.
    if (data.d2) {
      paths.push(routePath({ ...base, lang, view: "d2r", d2Section: "home" }));
      for (const s of D2R_SECTIONS) paths.push(routePath({ ...base, lang, view: "d2r", d2Section: s }));
      for (const e of data.d2.index ?? []) paths.push(routePath({ ...base, lang, view: "d2r", d2Section: e.sec, detail: e.id }));
      for (const p of data.d2.patches ?? []) paths.push(routePath({ ...base, lang, view: "d2r", d2Section: "patches", detail: p.slug }));
    }

    // Project Zomboid (2026-09-30): la portada, las pestañas que ya tienen página (`PZ_PUBLISHED`) y las fichas de las
    // que las tienen. Una ficha de una pestaña sin publicar no entra: su dirección todavía abre la portada. Tampoco una
    // ficha que todavía no tiene página propia (`PZ_DETAILS_PENDING`, 2026-10-01): abriría la pestaña con otro título.
    if (data.zb) {
      paths.push(routePath({ ...base, lang, view: "zomboid", pzSection: "home" }));
      for (const s of PZ_PUBLISHED) paths.push(routePath({ ...base, lang, view: "zomboid", pzSection: s }));
      const withDetails = new Set(PZ_PUBLISHED.filter((s) => PZ_DETAIL_SECTIONS.includes(s)));
      for (const e of data.zb.index ?? []) {
        if (!withDetails.has(e.sec) || PZ_DETAILS_PENDING[e.sec as PzTab]?.includes(e.id)) continue;
        paths.push(routePath({ ...base, lang, view: "zomboid", pzSection: e.sec, detail: e.id }));
      }
      // Las versiones de Parches no están en el índice de fichas: salen de su propio índice.
      if (PZ_PUBLISHED.includes("patches")) {
        for (const p of data.zb.patches ?? []) paths.push(routePath({ ...base, lang, view: "zomboid", pzSection: "patches", detail: p.slug }));
      }
    }

    // Rust (2026-10-05): la portada y las pestañas que ya tienen página (`RUST_PUBLISHED`).
    if (data.rs) {
      paths.push(routePath({ ...base, lang, view: "rust", rsSection: "home" }));
      for (const s of RUST_PUBLISHED) paths.push(routePath({ ...base, lang, view: "rust", rsSection: s }));
      if (RUST_PUBLISHED.includes("items")) {
        for (const it of data.rs.items ?? []) paths.push(routePath({ ...base, lang, view: "rust", rsSection: "items", detail: it.slug }));
      }
      if (RUST_PUBLISHED.includes("electricity")) {
        for (const slug of data.rs.circuits ?? []) paths.push(routePath({ ...base, lang, view: "rust", rsSection: "electricity", detail: slug }));
      }
    }
  }

  // Sin repetidas: una dirección dos veces es una página escrita dos veces y
  // una entrada de más en el sitemap (le pasó al índice de Valheim, 2026-09-24).
  return [...new Set(paths)];
}

/**
 * El `_redirects` de Netlify (2026-09-30): las páginas que se mudaron mandan con 301 a su dirección nueva. Sin esto la
 * vieja caía en la regla del final de `netlify.toml`, que sirve la portada con 200: una página duplicada para Google y
 * un enlace compartido que abría otra cosa. Netlify lee este archivo antes que las reglas de `netlify.toml`.
 *
 * - La tier list de Deadlock: `/deadlock` → `/deadlock/tier-list` (ver `DL_TIER_LIST`).
 * - Cada página de Diablo II en español con la dirección de las palabras en inglés (`/es/d2r/runewords/enigma`,
 *   publicada el 29/9) → la de ahora (`/es/d2r/palabras-runicas/enigma`).
 */
export function redirectsFile(data: SitemapData): string {
  const lines = LANGS.map((lang) => `/${lang}/deadlock  ${routePath({ lang, view: "deadlock", dlSection: "meta" })}  301`);
  for (const path of sitemapPaths(data)) {
    if (!path.startsWith("/es/d2r/")) continue;
    const old = "/es" + routePath({ ...parseRoute(path), lang: "en" }).slice("/en".length);
    if (old !== path) lines.push(`${old}  ${path}  301`);
  }
  return lines.length ? lines.join("\n") + "\n" : "";
}

/**
 * The XML itself.
 *
 * Each URL carries its translations as `alternate` links, which is how Google
 * learns the two language versions are the same page rather than duplicates
 * competing with each other.
 */
export function sitemapXml(data: SitemapData, group?: SitemapGroup): string {
  const paths = sitemapPaths(data).filter((p) => !group || sitemapGroup(p) === group);
  // Group by the page, so both languages of one page list each other. La página
  // es la dirección en inglés de su ruta, no la dirección sin el idioma: desde el
  // 2026-09-30 Diablo II en español lleva otras palabras (`/es/d2r/unicos/…` es
  // `/en/d2r/uniques/…`) y, sacando sólo el idioma, cada una quedaba sola.
  const byPage = new Map<string, string[]>();
  for (const path of paths) {
    const key = routePath({ ...parseRoute(path), lang: "en" });
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
        const lastmod = sitemapLastmod(path, data);
        return (
          `  <url>\n` +
          `    <loc>${SITE_ORIGIN}${path}</loc>\n` +
          (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : "") +
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

/** Dónde se publica el sitemap de cada grupo. */
export function sitemapFile(group: SitemapGroup): string {
  return `sitemaps/${group}.xml`;
}

/**
 * El índice que se publica en `/sitemap.xml` (2026-09-26): apunta a un sitemap
 * por juego para que Search Console cuente las páginas indexadas de cada uno
 * por separado. La dirección no cambia, así que el sitemap ya enviado sigue
 * sirviendo.
 */
export function sitemapIndexXml(data: SitemapData): string {
  const paths = sitemapPaths(data);
  const entries = SITEMAP_GROUPS.filter((g) => paths.some((p) => sitemapGroup(p) === g))
    .map((g) => {
      const lastmod = newest(paths.filter((p) => sitemapGroup(p) === g).map((p) => sitemapLastmod(p, data)));
      return (
        `  <sitemap>\n` +
        `    <loc>${SITE_ORIGIN}/${sitemapFile(g)}</loc>\n` +
        (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : "") +
        `  </sitemap>`
      );
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries}\n` +
    `</sitemapindex>\n`
  );
}

export const ROBOTS_TXT =
  `User-agent: *\n` +
  `Allow: /\n` +
  `\n` +
  `Sitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
