import { describe, it, expect } from "vitest";
import catalogJson from "@data/catalog.json";
import compsJson from "@data/comps.json";
import unitsJson from "@data/units.json";
import itemsJson from "@data/items.json";
import dlCatalogJson from "@deadlock/catalog.json";
import dlHeroesJson from "@deadlock/heroes.json";
import dlItemsJson from "@deadlock/items.json";
import {
  detailSlugs,
  deadlockDetailSlugs,
  sitemapPaths,
  sitemapXml,
  type SitemapData,
} from "../src/sitemap";
import { units, items, comps } from "../src/slugs";
import { heroes as dlHeroSlugs, items as dlItemSlugs } from "../src/deadlockSlugs";

const data = {
  champions: (catalogJson as any).champions,
  traits: (catalogJson as any).traits,
  items: (catalogJson as any).items,
  comps: (compsJson as any).comps,
  unitIds: (unitsJson as any).units.map((u: { id: string }) => u.id),
  itemIds: (itemsJson as any).items.map((i: { id: string }) => i.id),
  dlHeroes: (dlCatalogJson as any).heroes,
  dlItems: (dlCatalogJson as any).items,
  dlHeroIds: (dlHeroesJson as any).heroes.map((h: { heroId: number }) => String(h.heroId)),
  dlItemIds: (dlItemsJson as any).items.map((i: { itemId: number }) => String(i.itemId)),
} as SitemapData;

describe("detailSlugs", () => {
  /**
   * The point of these three: the sitemap is generated in Node from the raw
   * data, while the app resolves slugs from its own catalog layer. If those
   * ever disagree, Google gets a list of URLs the site does not answer.
   */
  it("matches the unit slugs the app serves", () => {
    expect(new Set(detailSlugs(data).units)).toEqual(new Set(units.toSlug.values()));
  });

  it("matches the item slugs the app serves", () => {
    expect(new Set(detailSlugs(data).items)).toEqual(new Set(items.toSlug.values()));
  });

  it("matches the comp slugs the app serves", () => {
    expect(new Set(detailSlugs(data).meta)).toEqual(new Set(comps.toSlug.values()));
  });
});

describe("deadlockDetailSlugs", () => {
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

  it("includes the sections and the detail pages", () => {
    expect(paths).toContain("/en/tft/meta");
    expect(paths).toContain("/es/tft/items");
    expect(paths).toContain("/en/privacy");
    expect(paths.filter((p) => p.split("/").length > 4).length).toBeGreaterThan(100);
  });

  /**
   * Cada pestaña de Deadlock, nombrada. El sitemap las recorre desde
   * `DEADLOCK_SECTIONS`, así que una pestaña nueva entra sola — pero "entra sola"
   * es exactamente lo que nadie verifica hasta que un día no entró.
   *
   * El meta va sin sufijo a propósito: es la URL indexada, y agregarle `/meta`
   * partiría el posicionamiento entre dos direcciones de la misma página.
   */
  it("lista las tres pestañas de Deadlock en los dos idiomas", () => {
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
  const xml = sitemapXml(data, "2026-07-23");

  it("is well-formed enough to submit", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<urlset");
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
    expect((xml.match(/<url>/g) ?? []).length).toBe((xml.match(/<\/url>/g) ?? []).length);
  });

  it("uses absolute URLs, which sitemaps require", () => {
    expect(xml).toContain("<loc>https://vestigo.gg/en/tft/meta</loc>");
    expect(xml).not.toMatch(/<loc>\/[^<]/);
  });

  it("declares each page's translation", () => {
    expect(xml).toContain('hreflang="es"');
    expect(xml).toContain('hreflang="en"');
  });
});
