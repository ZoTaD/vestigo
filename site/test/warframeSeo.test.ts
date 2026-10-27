import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import wfMeta from "../../games/warframe/data/meta.json";
import arsenal from "../../games/warframe/data/arsenal/list.json";
import relics from "../../games/warframe/data/relics/list.json";
import farming from "../../games/warframe/data/farming/list.json";
import mods from "../../games/warframe/data/mods/list.json";
import { parseRoute } from "../src/route";
import { SITEMAP_GROUPS, sitemapLastmod, sitemapPaths, sitemapXml, type SitemapData } from "../src/sitemap";
import { jsonLdFor, metaFor, ogImageUrl, prerenderPages } from "../src/prerender";
import { warframeSitemapData } from "../src/warframe/sitemapData";
import { isWfLoadingPage } from "../src/warframe/loadingGuard";
import { WfLoading } from "../src/warframe/ui";

// Como en el build: `warframeSitemapData` anota los slugs en español antes de armar ninguna dirección.
const wf = warframeSitemapData(wfMeta, { arsenal, relics, farming, mods } as never);
const data = {
  dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
  wf,
  dates: { warframe: wfMeta.generatedAt },
} as unknown as SitemapData;

const page = (path: string) => prerenderPages(data).find((p) => p.path === path)!;
const crumbNames = (p: { jsonLd: object[] }) =>
  (p.jsonLd.find((j) => (j as { "@type": string })["@type"] === "BreadcrumbList") as { itemListElement: { name: string }[] }).itemListElement.map((i) => i.name);

describe("Warframe en el sitemap", () => {
  const paths = sitemapPaths(data);

  it("la portada y las cuatro pestañas, en los dos idiomas y en main con la fecha de los datos", () => {
    const main = sitemapXml(data, "main");
    for (const p of [
      "/en/warframe", "/es/warframe",
      "/en/warframe/arsenal", "/es/warframe/arsenal",
      "/en/warframe/relics", "/es/warframe/reliquias",
      "/en/warframe/farming", "/es/warframe/donde-farmear",
      "/en/warframe/mods", "/es/warframe/mods",
    ]) {
      expect(paths).toContain(p);
      expect(main).toContain(`<loc>https://vestigo.gg${p}</loc>`);
      expect(sitemapLastmod(p, data)).toBe(wfMeta.generatedAt.slice(0, 10));
    }
  });

  it("una ficha por cosa en cada pestaña, con el slug de cada idioma y sin repetidas", () => {
    expect(paths).toContain("/en/warframe/arsenal/excalibur");
    expect(paths).toContain("/es/warframe/reliquias/lith-a1");
    expect(paths).toContain("/en/warframe/farming/neural-sensors");
    expect(paths).toContain("/en/warframe/mods/serration");
    expect(paths).toContain("/es/warframe/mods/sierra");
    expect(paths.filter((p) => p.startsWith("/en/warframe/arsenal/")).length).toBe(arsenal.length);
    expect(paths.filter((p) => p.startsWith("/es/warframe/reliquias/")).length).toBe(relics.length);
    expect(paths.filter((p) => p.startsWith("/es/warframe/donde-farmear/")).length).toBe(farming.length);
    expect(paths.filter((p) => p.startsWith("/es/warframe/mods/")).length).toBe(mods.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("las fichas van en el grupo warframe y las páginas principales en main, con la fecha de los datos", () => {
    expect(SITEMAP_GROUPS).toContain("warframe");
    expect(sitemapXml(data, "warframe")).toContain("<loc>https://vestigo.gg/en/warframe/arsenal/excalibur</loc>");
    expect(sitemapXml(data, "warframe")).not.toContain("<loc>https://vestigo.gg/en/warframe</loc>");
    expect(sitemapXml(data, "main")).not.toContain("/warframe/arsenal/excalibur");
    expect(sitemapLastmod("/en/warframe/mods/serration", data)).toBe(wfMeta.generatedAt.slice(0, 10));
  });

  it("sin los datos, Warframe queda afuera en vez de romper el build", () => {
    expect(sitemapPaths({ ...data, wf: undefined }).some((p) => p.includes("/warframe"))).toBe(false);
  });
});

describe("el <head> de Warframe", () => {
  it("cada ficha dice lo que se busca, en su idioma", () => {
    expect(page("/en/warframe/arsenal/excalibur").title).toBe("Excalibur — Warframe build parts, where to farm and stats | Vestigo");
    expect(page("/en/warframe/relics/lith-a1").title).toBe("Lith A1 Relic — Warframe drops, rewards and vault status | Vestigo");
    expect(page("/en/warframe/farming/neural-sensors").title).toBe("Where to farm Neural Sensors in Warframe | Vestigo");
    expect(page("/en/warframe/mods/serration").title).toBe("Serration — Warframe mod drops and stats | Vestigo");
    expect(page("/es/warframe/mods/sierra").title).toBe("Sierra — Warframe: drops y estadísticas del mod | Vestigo");
    expect(page("/es/warframe/reliquias/lith-a1").title).toBe("Reliquia Lith A1 — Warframe: recompensas, drops y estado del Vault | Vestigo");
    expect(page("/es/warframe/donde-farmear/sensores-neuronales").title).toMatch(/^Dónde farmear .+ en Warframe \| Vestigo$/);
  });

  it("un arcano habla de arcano, no de mod", () => {
    expect(page("/en/warframe/mods/arcane-guardian").title).toBe("Arcane Guardian — Warframe arcane drops and stats | Vestigo");
    expect(page("/es/warframe/mods/guardian-arcano").title).toMatch(/del arcano \| Vestigo$/);
  });

  it("la ficha en español enlaza a la inglesa y las migas llegan hasta ella", () => {
    const es = page("/es/warframe/reliquias/lith-a1");
    expect(es.alternates).toContainEqual({ hreflang: "en", href: "https://vestigo.gg/en/warframe/relics/lith-a1" });
    expect(crumbNames(es)).toEqual(["Vestigo", "Warframe", "Reliquias", "Lith A1"]);
    expect(crumbNames(page("/en/warframe/arsenal/excalibur"))).toEqual(["Vestigo", "Warframe", "Arsenal", "Excalibur"]);
    expect(crumbNames(page("/en/warframe/mods"))).toEqual(["Vestigo", "Warframe", "Mods"]);
  });

  it("ninguna descripción pasa de 160 caracteres, en ninguna página", () => {
    for (const p of prerenderPages(data).filter((x) => x.path.includes("/warframe"))) expect(p.description.length, p.path).toBeLessThanOrEqual(160);
  });

  it("una ficha sin nombre todavía (el archivo no llegó) lleva el título de su pestaña", () => {
    expect(metaFor(parseRoute("/en/warframe/arsenal/excalibur"), "en", null).title).toBe(metaFor(parseRoute("/en/warframe/arsenal"), "en", null).title);
  });

  it("la portada se presenta como aplicación web gratuita", () => {
    for (const path of ["/en/warframe", "/es/warframe"]) {
      const route = parseRoute(path);
      const ld = jsonLdFor(route, route.lang, { title: "t", description: "d", canonical: `https://vestigo.gg${path}`, image: "i" }, data, null);
      expect(ld).toContainEqual(expect.objectContaining({ "@type": "WebApplication", isAccessibleForFree: true, about: { "@type": "VideoGame", name: "Warframe" } }));
    }
  });

  it("toda la sección usa su propia vista previa", () => {
    expect(ogImageUrl(parseRoute("/es/warframe"))).toBe("https://vestigo.gg/warframe/og.jpg");
    expect(ogImageUrl(parseRoute("/en/warframe/arsenal/excalibur"))).toBe("https://vestigo.gg/warframe/og.jpg");
  });
});

// La guardia del prerender reconoce la clase como palabra entera, como en Stardew, Rust y Terraria.
describe("isWfLoadingPage", () => {
  it.each([
    ['class="wf-main wf-loading"', true],
    ['class="wf-loading"', true],
    ['class="wf-loading-bar"', false],
    ['class="x"', false],
  ])("%s -> %s", (html, esperado) => {
    expect(isWfLoadingPage(`<div ${html}></div>`)).toBe(esperado);
  });

  it("reconoce el marcado real de WfLoading", () => {
    expect(isWfLoadingPage(renderToStaticMarkup(createElement(WfLoading, {})))).toBe(true);
  });
});
