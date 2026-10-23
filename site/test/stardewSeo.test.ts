import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sdMeta from "../../games/stardew/data/meta.json";
import list from "../../games/stardew/data/site/list.json";
import namesEn from "../../games/stardew/data/site/names-en.json";
import namesEs from "../../games/stardew/data/site/names-es.json";
import villagers from "../../games/stardew/data/villagers.json";
import { parseRoute } from "../src/route";
import { SITEMAP_GROUPS, sitemapLastmod, sitemapPaths, sitemapXml, type SitemapData } from "../src/sitemap";
import { jsonLdFor, metaFor, ogImageUrl, prerenderPages } from "../src/prerender";
import { stardewSitemapData } from "../src/stardew/sitemapData";
import { isSdLoadingPage } from "../src/stardew/loadingGuard";
import { SdLoading } from "../src/stardew/ui";

// Como en el build: `stardewSitemapData` anota los slugs en español antes de armar ninguna dirección.
const sd = stardewSitemapData(sdMeta, list as never, namesEn, namesEs as never, villagers as never);
const data = {
  dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
  sd,
  dates: { stardew: sdMeta.generatedAt },
} as unknown as SitemapData;

const page = (path: string) => prerenderPages(data).find((p) => p.path === path)!;
const crumbNames = (p: { jsonLd: object[] }) =>
  (p.jsonLd.find((j) => (j as { "@type": string })["@type"] === "BreadcrumbList") as { itemListElement: { name: string }[] }).itemListElement.map((i) => i.name);

describe("Stardew Valley en el sitemap", () => {
  const paths = sitemapPaths(data);

  it("la portada y las tres pestañas, en los dos idiomas", () => {
    for (const p of [
      "/en/stardew-valley", "/es/stardew-valley",
      "/en/stardew-valley/items", "/es/stardew-valley/objetos",
      "/en/stardew-valley/villagers", "/es/stardew-valley/aldeanos",
      "/en/stardew-valley/bundles", "/es/stardew-valley/centro-comunitario",
    ]) expect(paths).toContain(p);
  });

  it("una ficha por objeto y por aldeano, con el slug de cada idioma", () => {
    expect(paths).toContain("/en/stardew-valley/items/melon");
    expect(paths).toContain("/es/stardew-valley/objetos/pastel-rosa");
    expect(paths).toContain("/en/stardew-valley/items/pink-cake");
    expect(paths).toContain("/es/stardew-valley/aldeanos/abigail");
    expect(paths).toContain("/es/stardew-valley/aldeanos/rasmodius");
    expect(paths).toContain("/en/stardew-valley/villagers/wizard");
    expect(paths.filter((p) => p.startsWith("/es/stardew-valley/objetos/")).length).toBe(list.length);
    expect(paths.filter((p) => p.startsWith("/en/stardew-valley/villagers/")).length).toBe(villagers.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("las cuatro pestañas de la etapa 2, en los dos idiomas y en main con la fecha de los datos", () => {
    const nuevas = [
      "/en/stardew-valley/crops", "/es/stardew-valley/cultivos",
      "/en/stardew-valley/fishing", "/es/stardew-valley/pesca",
      "/en/stardew-valley/recipes", "/es/stardew-valley/recetas",
      "/en/stardew-valley/calendar", "/es/stardew-valley/calendario",
    ];
    const main = sitemapXml(data, "main");
    for (const p of nuevas) {
      expect(paths).toContain(p);
      expect(main).toContain(`<loc>https://vestigo.gg${p}</loc>`);
      expect(sitemapLastmod(p, data)).toBe(sdMeta.generatedAt.slice(0, 10));
    }
  });

  it("Cultivos, Pesca, Recetas y Calendario no tienen fichas propias", () => {
    for (const seg of ["crops", "cultivos", "fishing", "pesca", "recipes", "recetas", "calendar", "calendario"]) {
      expect(paths.some((p) => p.includes(`/stardew-valley/${seg}/`)), seg).toBe(false);
    }
  });

  it("el Centro Comunitario no tiene fichas", () => {
    expect(paths.some((p) => p.startsWith("/en/stardew-valley/bundles/"))).toBe(false);
  });

  it("las fichas van en el grupo stardew y las páginas principales en main, con la fecha de los datos", () => {
    expect(SITEMAP_GROUPS).toContain("stardew");
    expect(sitemapXml(data, "main")).toContain("<loc>https://vestigo.gg/es/stardew-valley/aldeanos</loc>");
    expect(sitemapXml(data, "stardew")).toContain("<loc>https://vestigo.gg/en/stardew-valley/items/melon</loc>");
    expect(sitemapXml(data, "stardew")).not.toContain("<loc>https://vestigo.gg/en/stardew-valley</loc>");
    expect(sitemapLastmod("/en/stardew-valley/items/melon", data)).toBe(sdMeta.generatedAt.slice(0, 10));
    expect(sitemapLastmod("/es/stardew-valley", data)).toBe(sdMeta.generatedAt.slice(0, 10));
  });

  it("sin los datos, Stardew queda afuera en vez de romper el build", () => {
    expect(sitemapPaths({ ...data, sd: undefined }).some((p) => p.includes("stardew"))).toBe(false);
  });
});

describe("el <head> de Stardew Valley", () => {
  it("la ficha de objeto dice lo que se busca, y sólo lo que tiene", () => {
    expect(page("/en/stardew-valley/items/melon").title).toBe("Melon — Stardew Valley price, gifts, bundles and uses | Vestigo");
    expect(page("/es/stardew-valley/objetos/melon").title).toBe("Melón — Stardew Valley: precio, regalos, paquetes y usos | Vestigo");
    const cake = page("/en/stardew-valley/items/pink-cake");
    expect(cake.title).toBe("Pink Cake — Stardew Valley price, gifts and uses | Vestigo");
    expect(cake.description).not.toMatch(/bundle/i);
    expect(page("/en/stardew-valley/items/melon").description.length).toBeLessThanOrEqual(160);
  });

  it("un objeto sin regalos, paquetes ni usos promete sólo el precio", () => {
    // Los bits de `has` (`HAS` en stardew/data.ts): 1 regalos, 2 paquetes, 4 máquinas, 8 recetas; de 16 en adelante, fuentes.
    const bare = list.find((r) => ((r[6] as number) & 15) === 0 && ((r[6] as number) & ~15) !== 0)!;
    const p = page(`/en/stardew-valley/items/${bare[1]}`);
    expect(p.title).toMatch(/— Stardew Valley price and where to get it \| Vestigo$/);
    const none = list.find((r) => (r[6] as number) === 0);
    if (none) expect(page(`/en/stardew-valley/items/${none[1]}`).title).toMatch(/— Stardew Valley sell price \| Vestigo$/);
    expect(p.title + p.description).not.toMatch(/gift|bundle|uses/i);
  });

  it("la ficha de aldeano lleva su nombre y migas hasta él", () => {
    const es = page("/es/stardew-valley/aldeanos/abigail");
    expect(es.title).toBe("Abigail — Stardew Valley: regalos favoritos y cumpleaños | Vestigo");
    expect(es.alternates).toContainEqual({ hreflang: "en", href: "https://vestigo.gg/en/stardew-valley/villagers/abigail" });
    expect(crumbNames(es)).toEqual(["Vestigo", "Stardew Valley", "Aldeanos", "Abigail"]);
    expect(page("/en/stardew-valley/villagers/wizard").title).toBe("Wizard — Stardew Valley best gifts and birthday | Vestigo");
  });

  it("la ficha de objeto tiene migas hasta el objeto, en su idioma", () => {
    expect(crumbNames(page("/es/stardew-valley/objetos/pastel-rosa"))).toEqual(["Vestigo", "Stardew Valley", "Objetos", "Pastel rosa"]);
  });

  it("los títulos de las pestañas empiezan por lo que se busca", () => {
    expect(metaFor(parseRoute("/en/stardew-valley"), "en", null).title).toMatch(/^Stardew Valley Guide/);
    expect(metaFor(parseRoute("/es/stardew-valley"), "es", null).title).toMatch(/^Guía de Stardew Valley/);
    expect(metaFor(parseRoute("/en/stardew-valley/items"), "en", null).title).toMatch(/^Stardew Valley Items List/);
    expect(metaFor(parseRoute("/en/stardew-valley/villagers"), "en", null).title).toMatch(/^Stardew Valley Villagers/);
    expect(metaFor(parseRoute("/en/stardew-valley/bundles"), "en", null).title).toMatch(/^Stardew Valley Community Center Bundles/);
    expect(metaFor(parseRoute("/es/stardew-valley/centro-comunitario"), "es", null).title).toMatch(/^Paquetes del Centro Comunitario/);
    expect(metaFor(parseRoute("/en/stardew-valley/crops"), "en", null).title).toMatch(/^Stardew Valley Crop Profit Calculator/);
    expect(metaFor(parseRoute("/es/stardew-valley/cultivos"), "es", null).title).toMatch(/^Calculadora de cultivos de Stardew Valley/);
    expect(metaFor(parseRoute("/en/stardew-valley/fishing"), "en", null).title).toMatch(/What Fish Can I Catch/);
    expect(metaFor(parseRoute("/en/stardew-valley/recipes"), "en", null).title).toMatch(/^Stardew Valley Recipes: Cooking/);
    expect(metaFor(parseRoute("/en/stardew-valley/calendar"), "en", null).title).toMatch(/^Stardew Valley Calendar: Birthdays and Festivals/);
    expect(metaFor(parseRoute("/es/stardew-valley/calendario"), "es", null).title).toMatch(/^Calendario de Stardew Valley: cumpleaños y festivales/);
  });

  it("las pestañas nuevas llevan migas hasta la pestaña, en su idioma", () => {
    expect(crumbNames(page("/es/stardew-valley/cultivos"))).toEqual(["Vestigo", "Stardew Valley", "Cultivos"]);
    expect(crumbNames(page("/en/stardew-valley/fishing"))).toEqual(["Vestigo", "Stardew Valley", "Fishing"]);
    expect(crumbNames(page("/es/stardew-valley/recetas"))).toEqual(["Vestigo", "Stardew Valley", "Recetas"]);
    expect(crumbNames(page("/en/stardew-valley/calendar"))).toEqual(["Vestigo", "Stardew Valley", "Calendar"]);
  });

  it("ninguna descripción de pestaña pasa de 160 caracteres, en ningún idioma", () => {
    for (const path of [
      "/en/stardew-valley", "/es/stardew-valley", "/en/stardew-valley/items", "/es/stardew-valley/objetos", "/en/stardew-valley/villagers", "/es/stardew-valley/aldeanos", "/en/stardew-valley/bundles", "/es/stardew-valley/centro-comunitario",
      "/en/stardew-valley/crops", "/es/stardew-valley/cultivos", "/en/stardew-valley/fishing", "/es/stardew-valley/pesca", "/en/stardew-valley/recipes", "/es/stardew-valley/recetas", "/en/stardew-valley/calendar", "/es/stardew-valley/calendario",
    ]) {
      expect(page(path).description.length, path).toBeLessThanOrEqual(160);
    }
  });

  it("una ficha sin nombre todavía (el archivo no llegó) lleva el título de su pestaña", () => {
    expect(metaFor(parseRoute("/en/stardew-valley/items/melon"), "en", null).title).toBe(metaFor(parseRoute("/en/stardew-valley/items"), "en", null).title);
  });

  it("la portada, el Centro Comunitario, la calculadora y el buscador de Pesca se presentan como aplicación web gratuita", () => {
    for (const path of ["/es/stardew-valley", "/en/stardew-valley/bundles", "/en/stardew-valley/crops", "/es/stardew-valley/cultivos", "/en/stardew-valley/fishing"]) {
      const route = parseRoute(path);
      const ld = jsonLdFor(route, route.lang, { title: "t", description: "d", canonical: `https://vestigo.gg${path}`, image: "i" }, data, null);
      expect(ld).toContainEqual(expect.objectContaining({ "@type": "WebApplication", isAccessibleForFree: true, about: { "@type": "VideoGame", name: "Stardew Valley" } }));
    }
  });

  it("toda la sección usa su propia vista previa", () => {
    expect(ogImageUrl(parseRoute("/es/stardew-valley"))).toBe("https://vestigo.gg/stardew/og.jpg");
    expect(ogImageUrl(parseRoute("/en/stardew-valley/items/melon"))).toBe("https://vestigo.gg/stardew/og.jpg");
  });
});

// La guardia del prerender reconoce la clase como palabra entera, como en Rust y Terraria.
describe("isSdLoadingPage", () => {
  it.each([
    ['class="sd-main sd-loading"', true],
    ['class="sd-loading"', true],
    ['class="sd-loading-bar"', false],
    ['class="x"', false],
  ])("%s -> %s", (html, esperado) => {
    expect(isSdLoadingPage(`<div ${html}></div>`)).toBe(esperado);
  });

  it("reconoce el marcado real de SdLoading", () => {
    expect(isSdLoadingPage(renderToStaticMarkup(createElement(SdLoading, {})))).toBe(true);
  });
});
