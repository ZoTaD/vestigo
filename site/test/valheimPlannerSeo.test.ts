import { describe, it, expect } from "vitest";
import { sitemapPaths, type SitemapData } from "../src/sitemap";
import { prerenderPages } from "../src/prerender";

/**
 * El Planificador de Valheim en el sitemap y el prerender (2026-09-25): la
 * página de elegir se indexa en los dos idiomas; la hoja de ruta no, porque
 * depende de cada lista.
 */
const data: SitemapData = { dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [], vh: { entries: [], editions: [] } };

describe("el Planificador de Valheim", () => {
  const paths = sitemapPaths(data);

  it("está en el sitemap en los dos idiomas, sin la hoja de ruta", () => {
    expect(paths).toContain("/es/valheim/planner");
    expect(paths).toContain("/en/valheim/planner");
    expect(paths.some((p) => p.includes("/planner/route"))).toBe(false);
  });

  it("tiene título propio en cada idioma", () => {
    const pages = prerenderPages(data);
    expect(pages.find((p) => p.path === "/es/valheim/planner")!.title).toContain("Planificador");
    expect(pages.find((p) => p.path === "/en/valheim/planner")!.title).toContain("Planner");
  });
});
