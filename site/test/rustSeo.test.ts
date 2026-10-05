import { describe, expect, it } from "vitest";
import rsMeta from "../../games/rust/data/meta.json";
import { parseRoute } from "../src/route";
import { sitemapLastmod, sitemapPaths, sitemapXml, type SitemapData } from "../src/sitemap";
import { metaFor, prerenderPages } from "../src/prerender";

const data = {
  dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
  rs: { build: rsMeta.build, extractedAt: rsMeta.extractedAt },
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

  it("Objetos entra; Raideo, que todavía no se publicó, no", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/es/rust/objetos");
    expect(paths).toContain("/en/rust/items");
    expect(paths.some((p) => p.startsWith("/es/rust/raideo") || p.startsWith("/en/rust/raid"))).toBe(false);
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
});
