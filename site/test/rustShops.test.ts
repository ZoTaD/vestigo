import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import shopsJson from "../../games/rust/data/shops.json";
import rsMeta from "../../games/rust/data/meta.json";
import list from "../../games/rust/data/site/list.json";
import { LangContext } from "../src/i18n";
import { parseRoute, registerRustSlugs, routePath, RUST_DETAIL_SECTIONS, RUST_PUBLISHED } from "../src/route";
import Rust, { preloadTab } from "../src/Rust";
import { RUST_COPY } from "../src/rustCopy";
import { SCRAP, shopIndex, shopRows, shopSlugsEs, type ShopFile } from "../src/rust/shops/model";
import { prerenderPages, type SitemapData } from "../src/prerender";

const file = shopsJson as unknown as ShopFile;
const known = new Map(list.rows.map((r) => [r.id, r]));
const index = shopIndex(file);
const rows = shopRows(file, known);
// Como en el build: los slugs en español se anotan antes de armar ninguna dirección.
registerRustSlugs({ shops: shopSlugsEs(index) });

const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Rust, { route: parseRoute(path), navigate: () => undefined })),
  );

/** Rust, pestaña Tiendas (2026-10-06): una ficha por tienda de NPC de `shops.json`. */
describe("el índice de Tiendas", () => {
  it("una entrada por tienda, en el orden del archivo, con slugs legibles en los dos idiomas", () => {
    expect(index.map((e) => [e.key, e.slug, e.slugEs])).toEqual([
      ["outpost", "outpost", "puesto-avanzado"],
      ["bandit", "bandit-camp", "campamento-de-bandoleros"],
      ["fishing", "fishing-village", "poblado-pesquero"],
      ["ranch", "ranch", "rancho"],
      ["barn", "large-barn", "granero-espacioso"],
    ]);
  });

  it("cuenta todas las ofertas de cada tienda, y ninguna se pierde al armar las filas", () => {
    for (const e of index) {
      const want = file.orders.filter((o) => o.shop === e.key).length;
      expect(e.n).toBe(want);
      const r = rows.get(e.key)!;
      expect(r.scrap.length + r.other.length).toBe(want);
    }
    expect(index.reduce((n, e) => n + e.n, 0)).toBe(file.orders.length);
  });

  it("lo que se paga con chatarra va de lo más barato a lo más caro; lo demás, agrupado por lo que se paga", () => {
    for (const { scrap, other } of rows.values()) {
      for (let i = 1; i < scrap.length; i++) expect(scrap[i - 1].price).toBeLessThanOrEqual(scrap[i].price);
      for (const r of scrap) expect(r.currency.id).toBe(SCRAP);
      for (const r of other) expect(r.currency.id).not.toBe(SCRAP);
      // Cada moneda en un solo bloque.
      const seen = other.map((r) => r.currency.id).filter((id, i, a) => a.indexOf(id) === i);
      const runs = other.map((r) => r.currency.id).filter((id, i, a) => i === 0 || a[i - 1] !== id);
      expect(runs).toEqual(seen);
    }
    const bandit = rows.get("bandit")!.scrap;
    expect(bandit.at(-1)!.item.id).toBe("generator.wind.scrap");
  });
});

describe("las direcciones de Tiendas", () => {
  it("está publicada y tiene fichas", () => {
    expect(RUST_PUBLISHED).toContain("shops");
    expect(RUST_DETAIL_SECTIONS).toContain("shops");
  });

  it("la lista y la ficha, ida y vuelta en los dos idiomas", () => {
    expect(parseRoute("/en/rust/shops")).toMatchObject({ lang: "en", view: "rust", rsSection: "shops", detail: undefined });
    expect(routePath(parseRoute("/es/rust/tiendas"))).toBe("/es/rust/tiendas");
    const en = parseRoute("/en/rust/shops/bandit-camp");
    expect(en).toMatchObject({ rsSection: "shops", detail: "bandit-camp" });
    expect(routePath({ ...en, lang: "es" })).toBe("/es/rust/tiendas/campamento-de-bandoleros");
    const es = parseRoute("/es/rust/tiendas/puesto-avanzado");
    expect(es).toMatchObject({ lang: "es", rsSection: "shops", detail: "outpost" });
    expect(routePath(es)).toBe("/es/rust/tiendas/puesto-avanzado");
  });
});

describe("la pestaña Tiendas", () => {
  beforeAll(async () => {
    await preloadTab(parseRoute("/es/rust/tiendas"));
  });

  it("la lista enlaza las cinco tiendas con cuántas ofertas tienen", () => {
    const html = render("es", "/es/rust/tiendas");
    for (const e of index) expect(html).toContain(`href="${routePath({ ...parseRoute("/es/rust"), rsSection: "shops", detail: e.slug })}"`);
    expect(html).toContain(`${index[1].n} ofertas`);
    expect(html).not.toContain("rs-loading");
  });

  it("la ficha del Bandit Camp dibuja cada oferta con ícono, enlace, cantidad y precio", () => {
    for (const lang of ["en", "es"] as const) {
      const html = render(lang, lang === "en" ? "/en/rust/shops/bandit-camp" : "/es/rust/tiendas/campamento-de-bandoleros");
      const n = (html.match(/<tbody>/g) ?? []).length;
      expect(n).toBe(2);
      expect(html.match(/<tr>/g)!.length - 2).toBe(index[1].n);
      expect(html).not.toContain("rs-loading");
    }
    const es = render("es", "/es/rust/tiendas/campamento-de-bandoleros");
    expect(es).toContain("Campamento de bandoleros");
    expect(es).toContain('href="/es/rust/objetos/chatarra"');
    expect(es).toMatch(/<img src="\/rust\/items\/rifle\.lr300\.webp" alt="" width="28" height="28" loading="lazy" decoding="async"\/>/);
    expect(es).toContain(">Se paga con chatarra<");
    expect(es).toContain(">Se paga con otros objetos<");
  });

  it("una ficha que no existe muestra la lista con una nota", () => {
    expect(render("en", "/en/rust/shops/no-such-shop")).toContain('class="rs-missing" role="status"');
  });

  it("la ficha de un objeto enlaza cada tienda donde se compra", async () => {
    await preloadTab(parseRoute("/es/rust/objetos/fusil-de-asalto-lr-300"));
    const html = render("es", "/es/rust/objetos/fusil-de-asalto-lr-300");
    expect(html).toContain('href="/es/rust/tiendas/campamento-de-bandoleros"');
  });
});

describe("la copia y el <head> de Tiendas", () => {
  const data = {
    dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
    rs: { build: rsMeta.build, extractedAt: rsMeta.extractedAt, shops: index.map((e) => ({ slug: e.slug, en: e.en, es: e.es, n: e.n, bp: e.bp })) },
    dates: { rust: rsMeta.extractedAt },
  } as unknown as SitemapData;
  const pages = prerenderPages(data);
  const page = (path: string) => pages.find((p) => p.path === path)!;

  it("la pestaña tiene nombre en los dos idiomas", () => {
    expect(RUST_COPY.en.tabs.shops).toBe("Shops");
    expect(RUST_COPY.es.tabs.shops).toBe("Tiendas");
  });

  it("el sitemap trae la lista y cada ficha en los dos idiomas", () => {
    expect(page("/en/rust/shops")).toBeTruthy();
    expect(page("/es/rust/tiendas")).toBeTruthy();
    expect(pages.filter((p) => p.path.startsWith("/en/rust/shops/"))).toHaveLength(index.length);
    expect(pages.filter((p) => p.path.startsWith("/es/rust/tiendas/"))).toHaveLength(index.length);
  });

  it("los títulos empiezan por lo que se busca y la descripción dice cuántas ofertas hay", () => {
    expect(page("/en/rust/shops/outpost").title).toBe("Rust Outpost Shop: Every Item and Price | Vestigo");
    expect(page("/es/rust/tiendas/puesto-avanzado").title).toBe("Tienda del Puesto Avanzado de Rust: objetos y precios | Vestigo");
    expect(page("/en/rust/shops/outpost").description).toContain(`all ${index[0].n} offers`);
    expect(page("/es/rust/tiendas/puesto-avanzado").description).toContain(`las ${index[0].n} ofertas`);
    expect(page("/en/rust/shops").title).toMatch(/^Rust Shops/);
    expect(page("/es/rust/tiendas").title).toMatch(/^Tiendas de Rust/);
    // Ninguna oferta es un plano hoy: la descripción no lo promete.
    expect(pages.some((p) => /blueprint|plano/i.test(p.description))).toBe(index.some((e) => e.bp));
  });
});
