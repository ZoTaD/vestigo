import { describe, expect, it } from "vitest";
import meta from "../../games/cs2/data/meta.json";
import skins from "../../games/cs2/data/skins/list.json";
import cases from "../../games/cs2/data/cases/list.json";
import collections from "../../games/cs2/data/collections/list.json";
import { cs2SitemapData } from "../src/cs2/sitemapData";
import { isCs2LoadingPage } from "../src/cs2/loadingGuard";
import { prerenderPages } from "../src/prerender";
import { sitemapLastmod, sitemapPaths, sitemapXml, type SitemapData } from "../src/sitemap";

const c2 = cs2SitemapData(meta, { skins, cases, collections } as never);
const data = { dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [], c2, dates: { cs2: meta.generatedAt } } as unknown as SitemapData;

describe("CS2 en el sitemap", () => {
  const paths = sitemapPaths(data);
  it("trae las fichas en los dos idiomas, con el mismo slug", () => {
    for (const p of ["/en/cs2", "/es/cs2/cajas", "/en/cs2/skins/ak-47-inheritance", "/es/cs2/skins/ak-47-inheritance", "/es/cs2/cajas/kilowatt-case", "/en/cs2/collections/the-kilowatt-collection"]) {
      expect(paths).toContain(p);
    }
    expect(sitemapXml(data, "cs2")).toContain("<loc>https://vestigo.gg/es/cs2/cajas/kilowatt-case</loc>");
  });
  it("el lastmod es la fecha del catálogo, no la de los precios", () => {
    expect(sitemapLastmod("/en/cs2/skins/ak-47-inheritance", data)).toBe(meta.generatedAt);
  });
  it("el título de una ficha nombra lo que se busca", () => {
    const pages = prerenderPages(data);
    expect(pages.find((p) => p.path === "/en/cs2/cases/kilowatt-case")!.title).toContain("Kilowatt Case: CS2 Odds & Expected Value");
    expect(pages.find((p) => p.path === "/es/cs2/skins/bayonet-doppler-ruby")!.title).toContain("★ Bayonet | Doppler · Ruby: precio, float y cajas en CS2");
  });
  it("la guarda reconoce la hoja de cargando", () => {
    expect(isCs2LoadingPage('<main class="c2-main c2-loading">')).toBe(true);
    expect(isCs2LoadingPage('<main class="c2-main">')).toBe(false);
  });
});
