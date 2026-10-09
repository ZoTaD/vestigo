import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import mons from "@rust/monuments.json";
import slugs from "../../games/rust/data/site/monuments-slugs-es.json";
import rsMeta from "../../games/rust/data/meta.json";
import { LangContext } from "../src/i18n";
import { parseRoute, registerRustSlugs, routePath } from "../src/route";
import Rust, { preloadTab } from "../src/Rust";
import { monumentsPages } from "../src/rust/sitemapPages";
import { sitemapPaths, type SitemapData } from "../src/sitemap";
import { prerenderPages } from "../src/prerender";

registerRustSlugs(slugs);

const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Rust, { route: parseRoute(path), navigate: () => undefined })),
  );

describe("las direcciones de Monumentos de Rust (2026-10-09)", () => {
  it("la lista y cada ficha con su slug en cada idioma", () => {
    expect(parseRoute("/es/rust/monumentos")).toMatchObject({ rsSection: "monuments", detail: undefined });
    expect(parseRoute("/es/rust/monumentos/zona-de-lanzamiento")).toMatchObject({ rsSection: "monuments", detail: "launch-site" });
    expect(routePath({ ...parseRoute("/en/rust/monuments/launch-site"), lang: "es" })).toBe("/es/rust/monumentos/zona-de-lanzamiento");
  });
});

describe("la pestaña Monumentos de Rust", () => {
  beforeAll(async () => {
    await preloadTab(parseRoute("/en/rust/monuments"));
  });

  it("la lista enlaza cada monumento y trae la red de Power Trip por etapas", () => {
    const html = render("es", "/es/rust/monumentos");
    expect(html).toContain('href="/es/rust/monumentos/zona-de-lanzamiento"');
    expect(html).toContain("La red de Power Trip");
    for (const n of mons.powergrid.stages) expect(html).toContain(n === 1 ? "1 fusible" : `${n} fusibles`);
    expect(html).not.toContain("rs-loading");
  });

  it("la ficha dice el puzzle, la radiación, la red y la tienda", () => {
    const launch = render("en", "/en/rust/monuments/launch-site");
    expect(launch).toContain("4 × red keycard reader");
    expect(launch).toContain("High");
    expect(launch).toContain("Stage 3 (10 Heavy Fuses)");
    const outpost = render("es", "/es/rust/monumentos/puesto-avanzado");
    expect(outpost).toContain("Tienda de NPC");
    expect(outpost).toContain("Amarilla (zona segura)");
    expect(outpost).toContain('href="/es/rust/objetos/');
    const flats = render("en", "/en/rust/monuments/apartment-complex");
    expect(flats).toContain("Penthouse");
    expect(flats).toContain("Opening one costs 220 scrap");
    expect(flats).toContain("master key for 1000 scrap");
    expect(flats).toContain("Off by default");
  });

  it("la ficha dice qué cajas, NPC y objetos sueltos aparecen y cuántos, sin dibujar el botín hasta abrirlo", () => {
    const launch = render("en", "/en/rust/monuments/launch-site");
    expect(launch).toContain("Crates and barrels");
    expect(launch).toContain("Elite Crate");
    expect(launch).toContain("with power");
    expect(launch).toContain("<details>");
    expect(launch).not.toContain("rs-mon-loot");
    const rig = render("es", "/es/rust/monumentos/plataforma-petrolifera");
    expect(rig).toContain("Científico de la plataforma petrolera");
    expect(rig).toContain("Caja bloqueada");
    const bandit = render("es", "/es/rust/monumentos/campamento-de-bandoleros");
    expect(bandit).toContain("Guardia bandolero");
    expect(bandit).not.toContain("Cajas y barriles");
    const plant = render("en", "/en/rust/monuments/power-plant");
    expect(plant).toContain("On the ground");
    expect(plant).toContain('href="/en/rust/items/');
  });

  it("la red de Power Trip dice cuánto dura un fusible", () => {
    expect(render("en", "/en/rust/monuments")).toContain("last 2 h 40 min with 100 or more players online");
  });

  it("un monumento que no existe muestra la lista con una nota", () => {
    expect(render("en", "/en/rust/monuments/nope")).toContain("rs-missing");
  });
});

describe("Monumentos de Rust en el sitemap y el <head>", () => {
  const data = {
    dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
    rs: { build: rsMeta.build, extractedAt: rsMeta.extractedAt, items: [], pages: monumentsPages(mons) },
    dates: { rust: rsMeta.extractedAt },
  } as unknown as SitemapData;
  const page = (p: string) => prerenderPages(data).find((x) => x.path === p)!;

  it("cada ficha entra, con el título de lo que se busca", () => {
    const paths = sitemapPaths(data);
    expect(paths).toContain("/en/rust/monuments/launch-site");
    expect(paths).toContain("/es/rust/monumentos/zona-de-lanzamiento");
    expect(page("/en/rust/monuments").title).toMatch(/^Rust Monuments/);
    expect(page("/en/rust/monuments/launch-site").title).toBe("Launch Site — Rust Monument: Loot, Keycards and Fuses | Vestigo");
    expect(page("/es/rust/monumentos/zona-de-lanzamiento").title).toMatch(/^Zona de lanzamiento en Rust/);
    for (const p of ["/en/rust/monuments/water-treatment-plant", "/es/rust/monumentos/gran-plataforma-petrolifera"]) {
      expect(page(p).description.length, p).toBeLessThanOrEqual(160);
    }
  });
});
