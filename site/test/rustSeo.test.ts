import { describe, expect, it } from "vitest";
import rsMeta from "../../games/rust/data/meta.json";
import list from "../../games/rust/data/site/list.json";
import slugsEs from "../../games/rust/data/site/slugs-es.json";
import { parseRoute, registerRustSlugs } from "../src/route";
import { sitemapLastmod, sitemapPaths, sitemapXml, type SitemapData } from "../src/sitemap";
import { jsonLdFor, metaFor, ogImageUrl, prerenderPages } from "../src/prerender";
import { CIRCUITS, circuitSlugsEs } from "../src/rust/electric/circuits";

// Como en el build: los slugs en español se anotan antes de armar ninguna dirección.
registerRustSlugs(slugsEs);
registerRustSlugs({ electricity: circuitSlugsEs() });

const data = {
  dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
  rs: { build: rsMeta.build, extractedAt: rsMeta.extractedAt, items: list.rows.map((r) => ({ slug: r.slug, en: r.en, es: r.es, c: r.c, s: r.s, l: r.l, r: r.r })), circuits: CIRCUITS.map((c) => c.slug) },
  dates: { rust: rsMeta.extractedAt },
} as unknown as SitemapData;

const page = (path: string) => prerenderPages(data).find((p) => p.path === path)!;
const bare = list.rows.find((r) => !r.c && !r.s && !r.l && !r.r)!;
const sold = list.rows.find((r) => r.s && !r.c)!;

describe("el <head> de la ficha sólo afirma lo que el objeto tiene", () => {
  it("con receta (AK): crafteo, reciclaje y dónde se encuentra; el nombre va primero", () => {
    const es = page("/es/rust/objetos/fusil-de-asalto");
    expect(es.title).toBe("Fusil de asalto — Rust: crafteo, reciclaje y dónde se encuentra | Vestigo");
    expect(es.description).toBe("Fusil de asalto en Rust: cómo se craftea, con su receta, banco y costo de investigación, lo que da al reciclarlo, dónde aparece, más su shortname y el comando para spawnearlo.");
    const en = page("/en/rust/items/assault-rifle");
    expect(en.title).toBe("Assault Rifle — Rust: crafting, recycling and where to find it | Vestigo");
    expect(en.description).toMatch(/^Assault Rifle in Rust: how to craft it, with its recipe, workbench and research cost, what it recycles into, where to find it, plus/);
  });
  it("una veta (mineral de metal): sólo dónde se encuentra, sin crafteo, compra ni cajas", () => {
    for (const path of ["/es/rust/objetos/mena-de-metal", "/en/rust/items/metal-ore"]) {
      const p = page(path);
      expect(p.title + p.description).not.toMatch(/craft|receta|recipe|compra|buy|cajas|crates|recicl|recycl/i);
    }
    expect(page("/es/rust/objetos/mena-de-metal").title).toBe("Mena de metal — Rust: dónde se encuentra | Vestigo");
    expect(page("/es/rust/objetos/mena-de-metal").description).toMatch(/^Mena de metal en Rust: dónde aparece, más su shortname/);
  });
  it("lo que se compra dice dónde se compra", () => {
    const es = page("/es/rust/objetos/chatarra");
    expect(es.description).toBe("Chatarra en Rust: dónde aparece, dónde se compra, más su shortname y el comando para spawnearlo.");
    expect(es.title).toBe("Chatarra — Rust: dónde se encuentra | Vestigo");
    expect(page(`/en/rust/items/${sold.slug}`).description).toContain("where to buy it");
    expect(page("/es/rust/objetos/fusil-de-asalto").description).not.toContain("se compra");
  });
  it("sin nada: título neutro y descripción sin promesas", () => {
    const es = page(`/es/rust/objetos/${bare.slugEs}`);
    expect(es.title).toBe(`${bare.es ?? bare.en} en Rust: datos, shortname y comando para spawnearlo | Vestigo`);
    expect(es.description).toBe(`${bare.es ?? bare.en} en Rust: para qué sirve, su shortname y el comando para spawnearlo.`);
    const en = page(`/en/rust/items/${bare.slug}`);
    expect(en.title).toBe(`${bare.en} in Rust: Stats, Shortname and Spawn Command | Vestigo`);
    expect(en.title + en.description).not.toMatch(/craft|recipe|buy|find|recycl/i);
  });
});

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
    expect(metaFor(parseRoute("/es/rust"), "es", null).title).toMatch(/^Guía de Rust/);
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

  it("la calculadora se presenta como aplicación web gratuita, con migas", () => {
    const page = prerenderPages(data).find((p) => p.path === "/es/rust/raideo")!;
    expect(page.title).toMatch(/^Calculadora de raideo de Rust/);
    const types = page.jsonLd.map((j) => (j as { "@type": string })["@type"]);
    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("WebApplication");
    const app = page.jsonLd.find((j) => (j as { "@type": string })["@type"] === "WebApplication") as { name: string };
    expect(app.name).toBe("Calculadora de raideo de Rust");
  });

  it("toda la sección usa su propia vista previa", () => {
    expect(ogImageUrl(parseRoute("/es/rust"))).toBe("https://vestigo.gg/rust/og.jpg");
    expect(ogImageUrl(parseRoute("/en/rust/items/assault-rifle"))).toBe("https://vestigo.gg/rust/og.jpg");
  });
});

describe("Electricidad en el sitemap y el <head> (2026-10-09)", () => {
  it("el editor y cada circuito listo entran al sitemap en los dos idiomas", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/en/rust/electricity");
    expect(paths).toContain("/es/rust/electricidad");
    expect(paths).toContain("/en/rust/electricity/solar-turret");
    expect(paths).toContain("/es/rust/electricidad/torreta-solar");
    expect(paths.filter((p) => p.startsWith("/es/rust/electricidad/")).length).toBe(CIRCUITS.length);
  });

  it("el circuito lleva su nombre en el título, su explicación y migas hasta él", () => {
    const en = page("/en/rust/electricity/solar-turret");
    expect(en.title).toBe("Rust Solar Turret Circuit: How to Wire It | Vestigo");
    expect(en.description.length).toBeLessThanOrEqual(160);
    expect(en.description).toMatch(/^Two large solar panels/);
    const es = page("/es/rust/electricidad/torreta-solar");
    expect(es.title).toBe("Circuito de torreta solar en Rust: cómo cablearlo | Vestigo");
    expect(es.alternates).toContainEqual({ hreflang: "en", href: "https://vestigo.gg/en/rust/electricity/solar-turret" });
    const crumbs = es.jsonLd.find((j) => (j as { "@type": string })["@type"] === "BreadcrumbList") as { itemListElement: { name: string }[] };
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(["Vestigo", "Rust", "Electricidad", "Torreta solar"]);
  });

  it("el editor es una aplicación web gratuita con su título", () => {
    const p = page("/en/rust/electricity");
    expect(p.title).toMatch(/^Rust Electricity Simulator/);
    const app = p.jsonLd.find((j) => (j as { "@type": string })["@type"] === "WebApplication") as { name: string };
    expect(app.name).toBe("Rust Electricity Simulator: Circuit Builder and Wiring Guide");
  });
});
