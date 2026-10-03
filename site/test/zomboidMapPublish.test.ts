/**
 * El Mapa publicado (2026-10-01, Task 5): entra al sitemap con la fecha de SUS datos (`map/meta.json`, que sólo se mueve
 * si `map.py` cambió algo) y no con la del extractor general; el prerender trae su título y su hoja de introducción; y la
 * portada de la sección enlaza la herramienta "Mapa de Knox County" en vez de dejarla en "Pronto".
 */
import { beforeAll, describe, expect, it } from "vitest";
import pzMeta from "../../games/zomboid/data/meta.json";
import pzIndex from "../../games/zomboid/data/index.json";
import mapMeta from "../../games/zomboid/data/map/meta.json";
import { filesFor } from "../src/areaFiles";
import { renderApp } from "../src/entry-server";
import { buildEsSlugs } from "../src/esSlugs";
import { prerenderPages } from "../src/prerender";
import { parseRoute, PZ_PUBLISHED, registerPzSlugs, type PzTab } from "../src/route";
import { sitemapLastmod, sitemapPaths, sitemapXml, type SitemapData } from "../src/sitemap";

const INDEX = pzIndex as { sec: PzTab; id: string; en: string; es: string }[];
// Lo que arma `readSitemapData` del build: el sello del extractor general y, aparte, el del mapa.
const data = {
  dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
  zb: { version: pzMeta.version, extractedAt: pzMeta.extractedAt, mapExtractedAt: mapMeta.extractedAt, index: INDEX },
  dates: { zomboid: pzMeta.extractedAt },
} as unknown as SitemapData;

beforeAll(() => registerPzSlugs(buildEsSlugs(INDEX, [])));

describe("el Mapa publicado", () => {
  it("está en PZ_PUBLISHED y el sitemap lo lista en los dos idiomas", () => {
    expect(PZ_PUBLISHED).toContain("map");
    const paths = sitemapPaths(data);
    expect(paths).toContain("/en/project-zomboid/map");
    expect(paths).toContain("/es/project-zomboid/mapa");
    expect(sitemapXml(data, "zomboid")).toContain("<loc>https://vestigo.gg/es/project-zomboid/mapa</loc>");
  });

  it("lleva el lastmod de los datos del mapa, no el del extractor general", () => {
    const day = mapMeta.extractedAt.slice(0, 10);
    expect(sitemapLastmod("/en/project-zomboid/map", data)).toBe(day);
    expect(sitemapLastmod("/es/project-zomboid/mapa", data)).toBe(day);
    // Las demás pestañas y la portada siguen con la fecha del extractor.
    expect(sitemapLastmod("/es/project-zomboid", data)).toBe(pzMeta.extractedAt.slice(0, 10));
    expect(sitemapLastmod("/es/project-zomboid/objetos", data)).toBe(pzMeta.extractedAt.slice(0, 10));
    expect(sitemapXml(data, "zomboid")).toMatch(
      new RegExp(String.raw`<loc>https://vestigo.gg/es/project-zomboid/mapa</loc>\s*<lastmod>${day}</lastmod>`),
    );
  });

  it("sin el sello del mapa cae al del extractor (mejor una fecha de la sección que ninguna)", () => {
    const sinSello = { ...data, zb: { ...data.zb!, mapExtractedAt: undefined } } as SitemapData;
    expect(sitemapLastmod("/es/project-zomboid/mapa", sinSello)).toBe(pzMeta.extractedAt.slice(0, 10));
  });

  it("el prerender trae el título del Mapa y su hoja de introducción, en cada idioma", async () => {
    const es = prerenderPages(data).find((p) => p.path === "/es/project-zomboid/mapa")!;
    expect(es.title).toMatch(/^Mapa de Project Zomboid/);
    expect(es.canonical).toBe("https://vestigo.gg/es/project-zomboid/mapa");
    const en = prerenderPages(data).find((p) => p.path === "/en/project-zomboid/map")!;
    expect(en.title).toMatch(/^Project Zomboid Map/);
    const html = await renderApp(parseRoute("/es/project-zomboid/mapa"));
    expect(html).not.toContain("pz-loading");
    expect(html).toContain("Mapa de Project Zomboid");
    expect(html).toContain("Knox County entero");
  });

  it("el HTML de la pestaña pide su chunk (con el visor) además del área", () => {
    expect(filesFor(parseRoute("/es/project-zomboid/mapa"))[0]).toBe("src/Zomboid.tsx");
    expect(filesFor(parseRoute("/es/project-zomboid/mapa")).some((f) => f.includes("map"))).toBe(true);
  });

  it("la portada enlaza la herramienta «Mapa de Knox County», ya sin «Pronto»", async () => {
    const es = await renderApp(parseRoute("/es/project-zomboid"));
    expect(es).toMatch(/<a [^>]*href="\/es\/project-zomboid\/mapa"[^>]*>Mapa de Knox County</);
    const en = await renderApp(parseRoute("/en/project-zomboid"));
    expect(en).toMatch(/<a [^>]*href="\/en\/project-zomboid\/map"[^>]*>Map of Knox County</);
  });
});

/**
 * El botín (2026-10-02, Loot Task 5): `loot.py` tiene su propio sello (`data/loot/meta.json`) y mueve la fecha de Objetos
 * (lista y fichas: cada una dice dónde aparece) y la del Mapa (cada edificio dice qué puede aparecer por habitación). Se
 * toma la más reciente entre ese sello y el propio de cada una; las demás pestañas no se enteran.
 */
describe("el botín mueve el lastmod de Objetos y del Mapa", () => {
  const con = (lootExtractedAt: string | undefined) =>
    ({ ...data, zb: { ...data.zb!, lootExtractedAt } }) as SitemapData;
  const rutas = ["/es/project-zomboid/objetos", "/es/project-zomboid/objetos/palanca", "/en/project-zomboid/items/crowbar", "/es/project-zomboid/mapa", "/en/project-zomboid/map"];
  const futura = "2099-01-05T10:00:00Z";
  const vieja = "2000-01-05T10:00:00Z";

  it("con un sello del botín posterior, Objetos y el Mapa llevan esa fecha", () => {
    const d = con(futura);
    for (const r of rutas) expect(sitemapLastmod(r, d), r).toBe("2099-01-05");
    expect(sitemapXml(d, "zomboid")).toMatch(
      new RegExp(String.raw`<loc>https://vestigo.gg/es/project-zomboid/objetos/palanca</loc>\s*<lastmod>2099-01-05</lastmod>`),
    );
  });

  it("con uno anterior, llevan la suya", () => {
    const d = con(vieja);
    expect(sitemapLastmod("/es/project-zomboid/objetos", d)).toBe(pzMeta.extractedAt.slice(0, 10));
    expect(sitemapLastmod("/es/project-zomboid/objetos/palanca", d)).toBe(pzMeta.extractedAt.slice(0, 10));
    expect(sitemapLastmod("/es/project-zomboid/mapa", d)).toBe(mapMeta.extractedAt.slice(0, 10));
  });

  it("sin el sello del botín, queda como estaba", () => {
    const d = con(undefined);
    expect(sitemapLastmod("/es/project-zomboid/objetos/palanca", d)).toBe(pzMeta.extractedAt.slice(0, 10));
    expect(sitemapLastmod("/es/project-zomboid/mapa", d)).toBe(mapMeta.extractedAt.slice(0, 10));
  });

  it("el Mapa sin su sello cae al del extractor, y el botín posterior lo mueve igual", () => {
    const d = { ...con(futura), zb: { ...con(futura).zb!, mapExtractedAt: undefined } } as SitemapData;
    expect(sitemapLastmod("/es/project-zomboid/mapa", d)).toBe("2099-01-05");
    const d2 = { ...con(vieja), zb: { ...con(vieja).zb!, mapExtractedAt: undefined } } as SitemapData;
    expect(sitemapLastmod("/es/project-zomboid/mapa", d2)).toBe(pzMeta.extractedAt.slice(0, 10));
  });

  it("las demás pestañas y la portada no se mueven con el botín", () => {
    const d = con(futura);
    for (const r of ["/es/project-zomboid", "/es/project-zomboid/recetas", "/es/project-zomboid/rasgos"]) {
      expect(sitemapLastmod(r, d), r).toBe(pzMeta.extractedAt.slice(0, 10));
    }
  });
});
