import { describe, expect, it } from "vitest";
import rsMeta from "../../games/rust/data/meta.json";
import list from "../../games/rust/data/site/list.json";
import slugsEs from "../../games/rust/data/site/slugs-es.json";
import { parseRoute, registerRustSlugs } from "../src/route";
import { sitemapLastmod, sitemapPaths, sitemapXml, type SitemapData } from "../src/sitemap";
import { jsonLdFor, metaFor, ogImageUrl, prerenderPages } from "../src/prerender";

// Como en el build: los slugs en español se anotan antes de armar ninguna dirección.
registerRustSlugs(slugsEs);

const data = {
  dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
  rs: { build: rsMeta.build, extractedAt: rsMeta.extractedAt, items: list.rows.map((r) => ({ slug: r.slug, en: r.en, es: r.es })) },
  dates: { rust: rsMeta.extractedAt },
} as unknown as SitemapData;

describe("Rust en el sitemap y el <head>", () => {
  it("la portada entra en su grupo, con la fecha de sus datos", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/en/rust");
    expect(paths).toContain("/es/rust");
    expect(sitemapXml(data, "rust")).toContain("<loc>https://vestigo.gg/es/rust</loc>");
    expect(sitemapXml(data, "site")).not.toContain("/rust");
    expect(sitemapLastmod("/es/rust", data)).toBe(rsMeta.extractedAt.slice(0, 10));
  });

  it("Objetos y Raideo entran al sitemap", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/es/rust/objetos");
    expect(paths).toContain("/en/rust/items");
    expect(paths).toContain("/es/rust/raideo");
    expect(paths).toContain("/en/rust/raid");
  });

  it("sin el extractor corrido, Rust queda afuera en vez de romper el build", () => {
    expect(sitemapPaths({ ...data, rs: undefined })).not.toContain("/en/rust");
  });

  it("el título empieza por lo que se busca, en cada idioma", () => {
    expect(metaFor(parseRoute("/en/rust"), "en", null).title).toMatch(/^Rust Guide/);
    expect(metaFor(parseRoute("/es/rust"), "es", null).title).toMatch(/^Rust en español/);
  });

  it("la página prerenderizada tiene canonical, hreflang y el idioma", () => {
    const page = prerenderPages(data).find((p) => p.path === "/es/rust")!;
    expect(page.canonical).toBe("https://vestigo.gg/es/rust");
    expect(page.alternates).toContainEqual({ hreflang: "en", href: "https://vestigo.gg/en/rust" });
    expect(page.lang).toBe("es");
  });

  it("cada ficha entra al sitemap con su slug en cada idioma", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/en/rust/items/assault-rifle");
    expect(paths).toContain("/es/rust/objetos/fusil-de-asalto");
    expect(paths.filter((p) => p.startsWith("/es/rust/objetos/")).length).toBe(list.rows.length);
  });

  it("la ficha lleva el nombre del objeto en el título y migas hasta él", () => {
    const page = prerenderPages(data).find((p) => p.path === "/es/rust/objetos/fusil-de-asalto")!;
    expect(page.title).toMatch(/^Fusil de asalto — Rust/);
    expect(page.alternates).toContainEqual({ hreflang: "en", href: "https://vestigo.gg/en/rust/items/assault-rifle" });
    const crumbs = page.jsonLd.find((j) => (j as { "@type": string })["@type"] === "BreadcrumbList") as { itemListElement: { name: string }[] };
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(["Vestigo", "Rust", "Objetos", "Fusil de asalto"]);
  });

  it("la portada se presenta como aplicación web gratuita", () => {
    const route = parseRoute("/es/rust");
    const ld = jsonLdFor(route, "es", { title: "t", description: "d", canonical: "https://vestigo.gg/es/rust", image: "i" }, data, null);
    expect(ld).toContainEqual(expect.objectContaining({ "@type": "WebApplication", isAccessibleForFree: true }));
  });

  it("toda la sección usa su propia vista previa", () => {
    expect(ogImageUrl(parseRoute("/es/rust"))).toBe("https://vestigo.gg/rust/og.jpg");
    expect(ogImageUrl(parseRoute("/en/rust/items/assault-rifle"))).toBe("https://vestigo.gg/rust/og.jpg");
  });
});
