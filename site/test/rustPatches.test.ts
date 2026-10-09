import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import idx from "@rust/patches/index.json";
import rsMeta from "../../games/rust/data/meta.json";
import { LangContext } from "../src/i18n";
import { parseRoute, routePath } from "../src/route";
import Rust, { preloadTab } from "../src/Rust";
import { patchesPages } from "../src/rust/sitemapPages";
import { sitemapLastmod, sitemapPaths, type SitemapData } from "../src/sitemap";
import { prerenderPages } from "../src/prerender";

const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Rust, { route: parseRoute(path), navigate: () => undefined })),
  );

const newest = idx.editions[0];
const english = idx.editions.find((e) => !e.es)!;

describe("las direcciones de Parches de Rust (2026-10-09)", () => {
  it("la lista y cada edición, en los dos idiomas, con el mismo slug", () => {
    expect(parseRoute("/es/rust/parches")).toMatchObject({ rsSection: "patches", detail: undefined });
    expect(parseRoute(`/en/rust/patches/${newest.slug}`)).toMatchObject({ rsSection: "patches", detail: newest.slug });
    expect(routePath({ ...parseRoute(`/en/rust/patches/${newest.slug}`), lang: "es" })).toBe(`/es/rust/parches/${newest.slug}`);
  });
});

describe("la pestaña Parches de Rust", () => {
  beforeAll(async () => {
    await preloadTab(parseRoute("/en/rust/patches"));
    await preloadTab(parseRoute(`/en/rust/patches/${newest.slug}`));
    await preloadTab(parseRoute(`/en/rust/patches/${english.slug}`));
  });

  it("la lista enlaza cada edición, de la más nueva a la más vieja", () => {
    const html = render("es", "/es/rust/parches");
    expect(html).toContain(`href="/es/rust/parches/${newest.slug}"`);
    expect(html.indexOf(newest.slug)).toBeLessThan(html.indexOf(idx.editions[1].slug));
    expect(html).not.toContain("rs-loading");
  });

  it("la edición más nueva va traducida, con enlaces a las fichas de Objetos en su idioma", () => {
    const es = render("es", `/es/rust/parches/${newest.slug}`);
    expect(es).toContain(`>${newest.name}</h1>`);
    expect(es).not.toContain("todavía no está traducida");
    expect(es).toContain("Lista completa de cambios");
    const en = render("en", `/en/rust/patches/${newest.slug}`);
    expect(en).toContain('href="/en/rust/items/');
  });

  it("una sin traducir sale en inglés con aviso", () => {
    const es = render("es", `/es/rust/parches/${english.slug}`);
    expect(es).toContain("todavía no está traducida");
    expect(es).toContain('lang="en"');
  });
});

describe("Parches de Rust en el sitemap y el <head>", () => {
  const data = {
    dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
    rs: { build: rsMeta.build, extractedAt: rsMeta.extractedAt, items: [], pages: patchesPages(idx) },
    dates: { rust: rsMeta.extractedAt },
  } as unknown as SitemapData;
  const page = (p: string) => prerenderPages(data).find((x) => x.path === p)!;

  it("cada edición entra con su fecha, y la lista con la más nueva", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain(`/en/rust/patches/${newest.slug}`);
    expect(paths).toContain(`/es/rust/parches/${english.slug}`);
    expect(sitemapLastmod(`/en/rust/patches/${english.slug}`, data)).toBe(english.date);
    const listDate = sitemapLastmod("/es/rust/parches", data)!;
    expect(listDate >= newest.date).toBe(true);
  });

  it("el título dice qué actualización es y es un artículo con fecha", () => {
    const p = page(`/en/rust/patches/${newest.slug}`);
    expect(p.title).toBe(`Rust ${newest.name} Update: Patch Notes | Vestigo`);
    expect(p.ogType).toBe("article");
    expect(p.published).toBe(newest.date);
    expect(page(`/es/rust/parches/${newest.slug}`).title).toMatch(/^Parche .* de Rust/);
    expect(p.description.length).toBeLessThanOrEqual(160);
  });
});
