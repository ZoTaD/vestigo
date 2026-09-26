import { describe, it, expect } from "vitest";
import dlCatalogJson from "@deadlock/catalog.json";
import dlHeroesJson from "@deadlock/heroes.json";
import dlItemsJson from "@deadlock/items.json";
import {
  SITEMAP_GROUPS,
  deadlockDetailSlugs,
  sitemapIndexXml,
  sitemapLastmod,
  sitemapPaths,
  sitemapXml,
  type SitemapData,
} from "../src/sitemap";
import { heroes as dlHeroSlugs, items as dlItemSlugs } from "../src/deadlockSlugs";

const data = {
  dlHeroes: (dlCatalogJson as any).heroes,
  dlItems: (dlCatalogJson as any).items,
  dlHeroIds: (dlHeroesJson as any).heroes.map((h: { heroId: number }) => String(h.heroId)),
  dlItemIds: (dlItemsJson as any).items.map((i: { itemId: number }) => String(i.itemId)),
} as SitemapData;

describe("deadlockDetailSlugs", () => {
  /**
   * The point of these two: the sitemap is generated in Node from the raw
   * data, while the app resolves slugs from its own catalog layer. If those
   * ever disagree, Google gets a list of URLs the site does not answer.
   */
  it("matches the hero slugs the app serves", () => {
    expect(new Set(deadlockDetailSlugs(data).heroes)).toEqual(new Set(dlHeroSlugs.toSlug.values()));
  });

  it("matches the item slugs the app serves", () => {
    expect(new Set(deadlockDetailSlugs(data).items)).toEqual(new Set(dlItemSlugs.toSlug.values()));
  });
});

describe("sitemapPaths", () => {
  const paths = sitemapPaths(data);

  it("covers both languages", () => {
    expect(paths.some((p) => p.startsWith("/en"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/es"))).toBe(true);
    // Every English page has a Spanish twin and the other way round.
    const en = paths.filter((p) => p.startsWith("/en")).map((p) => p.slice(3));
    const es = paths.filter((p) => p.startsWith("/es")).map((p) => p.slice(3));
    expect(new Set(en)).toEqual(new Set(es));
  });

  it("lists every page once", () => {
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("includes the site pages and the detail pages", () => {
    expect(paths).toContain("/en");
    expect(paths).toContain("/en/privacy");
    expect(paths).toContain("/es/terms");
    expect(paths.filter((p) => p.split("/").length > 4).length).toBeGreaterThan(100);
  });

  /**
   * TFT salió del sitio el 2026-09-15. Si una de sus direcciones vuelve a
   * entrar acá, Google la rastrea, Netlify la contesta con 301 y el sitemap
   * queda pidiendo indexar redirecciones — que es lo que esto vino a evitar.
   */
  it("no lista ninguna dirección de TFT", () => {
    expect(paths.some((p) => /\/tft(\/|$)/.test(p))).toBe(false);
  });

  /**
   * Cada pestaña de Deadlock, nombrada. El sitemap las recorre desde
   * `DEADLOCK_SECTIONS`, así que una pestaña nueva entra sola — pero "entra sola"
   * es exactamente lo que nadie verifica hasta que un día no entró.
   *
   * El meta va sin sufijo a propósito: es la URL indexada, y agregarle `/meta`
   * partiría el posicionamiento entre dos direcciones de la misma página.
   */
  it("lista las pestañas de Deadlock en los dos idiomas", () => {
    for (const lang of ["en", "es"]) {
      expect(paths).toContain(`/${lang}/deadlock`);
      expect(paths).toContain(`/${lang}/deadlock/items`);
      expect(paths).toContain(`/${lang}/deadlock/patches`);
      expect(paths).not.toContain(`/${lang}/deadlock/meta`);
    }
  });

  it("incluye una página por héroe y por ítem de Deadlock, en la banda por defecto", () => {
    const dlDetails = deadlockDetailSlugs(data);
    expect(dlDetails.heroes.length).toBeGreaterThan(0);
    expect(dlDetails.items.length).toBeGreaterThan(0);
    for (const slug of dlDetails.heroes) {
      expect(paths).toContain(`/en/deadlock/${slug}`);
      expect(paths).toContain(`/es/deadlock/${slug}`);
    }
    for (const slug of dlDetails.items) {
      expect(paths).toContain(`/en/deadlock/items/${slug}`);
    }
  });

  it("grew the site well past the single page it used to be", () => {
    expect(paths.length).toBeGreaterThan(200);
  });
});

describe("sitemapXml", () => {
  const xml = sitemapXml(data);

  it("is well-formed enough to submit", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<urlset");
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
    expect((xml.match(/<url>/g) ?? []).length).toBe((xml.match(/<\/url>/g) ?? []).length);
  });

  it("uses absolute URLs, which sitemaps require", () => {
    expect(xml).toContain("<loc>https://vestigo.gg/en/deadlock</loc>");
    expect(xml).not.toMatch(/<loc>\/[^<]/);
  });

  it("declares each page's translation", () => {
    expect(xml).toContain('hreflang="es"');
    expect(xml).toContain('hreflang="en"');
  });
});

/**
 * `lastmod` honesto (2026-09-26): antes todas las URLs llevaban la fecha diaria
 * de Deadlock y Google deja de leer `lastmod` en todo el sitio cuando no es
 * exacto. Cada página lleva la fecha de lo que la alimenta, o ninguna.
 */
describe("sitemapLastmod", () => {
  const conFechas: SitemapData = {
    ...data,
    dlNews: [{ slug: "2026-09-16", title: "x", date: "2026-09-16T20:16:43.000Z", score: { nerf: 0, buff: 0, mixed: 0, fix: 0 } }],
    p2: {
      leagues: [{ slug: "std", name: "Standard" }],
      entries: [{ id: "gems/abiding-hex", cat: "gems", en: "Abiding Hex", es: "Maleficio duradero" }],
      editions: [
        { slug: "0-5-5c", version: "0.5.5c", date: "2026-09-17", title: { en: "a", es: null } },
        { slug: "0-5-5b", version: "0.5.5b", date: "2026-09-10", title: { en: "b", es: null } },
      ],
    },
    vh: {
      entries: [{ slug: "honey", tab: "foods", en: "Honey", es: "Miel" }],
      editions: [{ slug: "1-0-15", version: "1.0.15", date: "2026-09-18", title: {} }],
    },
    dates: { deadlock: "2026-09-26T03:00:00Z", poe2Economy: "2026-09-23T22:00:02Z", valheim: "2026-09-25T14:20:32Z" },
  };

  it("fecha cada página con lo que la alimenta", () => {
    expect(sitemapLastmod("/en/deadlock", conFechas)).toBe("2026-09-26");
    expect(sitemapLastmod("/es/deadlock/patches/2026-09-16", conFechas)).toBe("2026-09-16");
    expect(sitemapLastmod("/en/deadlock/patches", conFechas)).toBe("2026-09-16");
    expect(sitemapLastmod("/en/poe2", conFechas)).toBe("2026-09-23");
    expect(sitemapLastmod("/en/poe2/patches", conFechas)).toBe("2026-09-17");
    expect(sitemapLastmod("/en/poe2/patches/0-5-5b", conFechas)).toBe("2026-09-10");
    expect(sitemapLastmod("/en/valheim/foods/honey", conFechas)).toBe("2026-09-25");
    expect(sitemapLastmod("/es/valheim/patches/1-0-15", conFechas)).toBe("2026-09-18");
  });

  it("deja sin fecha lo que no tiene sello, en vez de inventarla", () => {
    expect(sitemapLastmod("/en", conFechas)).toBeUndefined();
    expect(sitemapLastmod("/en/privacy", conFechas)).toBeUndefined();
    expect(sitemapLastmod("/en/poe2/encyclopedia/gems/abiding-hex", conFechas)).toBeUndefined();
    const xml = sitemapXml(conFechas, "site");
    expect(xml).toContain("<loc>https://vestigo.gg/en</loc>");
    expect(xml).not.toContain("<lastmod>");
  });

  it("parte el sitio en un sitemap por juego, con un índice en /sitemap.xml", () => {
    const index = sitemapIndexXml(conFechas);
    expect(index).toContain("<sitemapindex");
    for (const g of ["site", "deadlock", "poe2", "valheim"]) {
      expect(index).toContain(`<loc>https://vestigo.gg/sitemaps/${g}.xml</loc>`);
    }
    expect(index).toContain("<lastmod>2026-09-26</lastmod>");
    // Entre los cuatro están todas las páginas, y ninguna en dos.
    const locs = SITEMAP_GROUPS.flatMap((g) => sitemapXml(conFechas, g).match(/<loc>[^<]+/g) ?? []);
    expect(locs.length).toBe(sitemapPaths(conFechas).length);
    expect(sitemapXml(conFechas, "valheim")).not.toContain("/deadlock");
  });
});

describe("las ediciones de Vestigo News", () => {
  const conNews = {
    ...data,
    dlNews: [{ slug: "2026-09-16", title: "09-16-2026 Update", date: "2026-09-16T20:16:43.000Z", score: { nerf: 7, buff: 10, mixed: 2, fix: 1 } }],
  };

  it("entran al sitemap en los dos idiomas, y sin índice no entra ninguna", () => {
    const paths = sitemapPaths(conNews);
    expect(paths).toContain("/en/deadlock/patches/2026-09-16");
    expect(paths).toContain("/es/deadlock/patches/2026-09-16");
    expect(sitemapPaths(data).some((p) => p.includes("/patches/"))).toBe(false);
  });
});
