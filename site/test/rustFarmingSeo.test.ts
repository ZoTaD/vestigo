import { describe, expect, it } from "vitest";
import farming from "@rust/farming.json";
import rsMeta from "../../games/rust/data/meta.json";
import farmingSlugs from "../../games/rust/data/site/farming-slugs-es.json";
import { registerRustSlugs } from "../src/route";
import { farmingPages } from "../src/rust/sitemapPages";
import { sitemapLastmod, sitemapPaths, type SitemapData } from "../src/sitemap";
import { prerenderPages } from "../src/prerender";

registerRustSlugs(farmingSlugs);

const data = {
  dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
  rs: { build: rsMeta.build, extractedAt: rsMeta.extractedAt, items: [], pages: farmingPages(farming) },
  dates: { rust: rsMeta.extractedAt },
} as unknown as SitemapData;

const page = (path: string) => prerenderPages(data).find((p) => p.path === path)!;

describe("Granjas de Rust en el sitemap y el <head> (2026-10-09)", () => {
  it("la pestaña, la calculadora y cada planta entran en los dos idiomas", () => {
    const paths = sitemapPaths(data);
    for (const p of ["/en/rust/farming", "/es/rust/granjas", "/en/rust/farming/genetics", "/es/rust/granjas/genetica", "/en/rust/farming/hemp", "/es/rust/granjas/canamo"]) {
      expect(paths).toContain(p);
    }
    expect(paths.filter((p) => p.startsWith("/en/rust/farming/"))).toHaveLength(farming.plants.length + 1);
    expect(sitemapLastmod("/es/rust/granjas/canamo", data)).toBe(rsMeta.extractedAt.slice(0, 10));
  });

  it("los títulos empiezan por lo que se busca, en inglés primero", () => {
    expect(page("/en/rust/farming").title).toMatch(/^Rust Farming Guide/);
    expect(page("/es/rust/granjas").title).toMatch(/^Granjas en Rust/);
    expect(page("/en/rust/farming/genetics").title).toMatch(/^Rust Genetics Calculator/);
    expect(page("/es/rust/granjas/genetica").title).toMatch(/^Calculadora de genética de Rust/);
    expect(page("/en/rust/farming/hemp").title).toBe("Hemp — Rust farming: growth time, harvest and genes | Vestigo");
    expect(page("/es/rust/granjas/canamo").title).toMatch(/^Cáñamo en Rust/);
    for (const p of ["/en/rust/farming/genetics", "/es/rust/granjas/genetica", "/en/rust/farming/white-berry", "/es/rust/granjas/baya-amarilla"]) {
      expect(page(p).description.length, p).toBeLessThanOrEqual(160);
      expect(page(p).description.length, p).toBeGreaterThan(80);
    }
  });

  it("la calculadora es una aplicación web y las fichas llevan su miga", () => {
    const ld = JSON.stringify(page("/en/rust/farming/genetics").jsonLd);
    expect(ld).toContain('"WebApplication"');
    expect(ld).toContain("Rust Genetics Calculator");
    const crumbs = JSON.stringify(page("/es/rust/granjas/canamo").jsonLd);
    expect(crumbs).toContain("Granjas");
    expect(crumbs).toContain("Cáñamo");
  });
});
