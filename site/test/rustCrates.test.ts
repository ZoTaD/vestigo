import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import loot from "../../games/rust/data/loot.json";
import rsMeta from "../../games/rust/data/meta.json";
import list from "../../games/rust/data/site/list.json";
import { LangContext } from "../src/i18n";
import { parseRoute, registerRustSlugs, routePath, RUST_DETAIL_SECTIONS, RUST_PUBLISHED } from "../src/route";
import Rust, { preloadTab } from "../src/Rust";
import { RUST_COPY } from "../src/rustCopy";
import { crateIndex, crateName, crateRows, crateSlugsEs, type LootFile } from "../src/rust/crates/model";
import { prerenderPages, type SitemapData } from "../src/prerender";

const file = loot as unknown as LootFile;
const known = new Map(list.rows.map((r) => [r.id, r]));
const rows = crateRows(file, known);
const index = crateIndex(file, rows);
// Como en el build: los slugs en español se anotan antes de armar ninguna dirección.
registerRustSlugs({ crates: crateSlugsEs(index) });

const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Rust, { route: parseRoute(path), navigate: () => undefined })),
  );

/** Rust, pestaña Cajas (2026-10-06): una ficha por fuente de botín de `loot.json`. */
describe("el índice de Cajas", () => {
  it("una entrada por fuente, con slugs únicos en los dos idiomas", () => {
    expect(index).toHaveLength(Object.keys(file.containers).length);
    expect(new Set(index.map((e) => e.slug)).size).toBe(index.length);
    expect(new Set(index.map((e) => e.slugEs)).size).toBe(index.length);
  });

  it("la mena de metal de Halloween suma su clave; la de siempre se queda con el slug corto", () => {
    const by = new Map(index.map((e) => [e.key, e]));
    expect(by.get("collect_metalore")!.slug).toBe("metal-ore");
    expect(by.get("collect_halloween_metalore")!.slug).toBe("metal-ore-collect-halloween-metalore");
    expect(by.get("collect_halloween_metalore")!.slugEs).toBe("mena-de-metal-collect-halloween-metalore");
    expect(crateName(by.get("collect_halloween_metalore")!, "es", RUST_COPY.es.items.events)).toBe("Mena de metal (Halloween)");
    expect(by.get("elite")).toMatchObject({ slug: "elite-crate", slugEs: "caja-de-elite", kind: "box" });
  });

  it("las cajas primero, después NPC, recolectables y objetos que se abren", () => {
    const kinds = index.map((e) => e.kind);
    expect([...new Set(kinds)]).toEqual(["box", "npc", "collect", "item"]);
  });

  it("las filas van de la más probable a la menos y sólo con objetos que tienen ficha", () => {
    for (const [, rs] of rows) {
      for (let i = 1; i < rs.length; i++) expect(rs[i - 1].chance).toBeGreaterThanOrEqual(rs[i].chance);
      for (const r of rs) expect(known.has(r.id)).toBe(true);
    }
  });
});

describe("las direcciones de Cajas", () => {
  it("está publicada y tiene fichas", () => {
    expect(RUST_PUBLISHED).toContain("crates");
    expect(RUST_DETAIL_SECTIONS).toContain("crates");
  });

  it("la lista y la ficha, ida y vuelta en los dos idiomas", () => {
    expect(parseRoute("/en/rust/crates")).toMatchObject({ lang: "en", view: "rust", rsSection: "crates", detail: undefined });
    expect(routePath(parseRoute("/en/rust/crates"))).toBe("/en/rust/crates");
    expect(parseRoute("/es/rust/cajas")).toMatchObject({ lang: "es", rsSection: "crates" });
    expect(routePath(parseRoute("/es/rust/cajas"))).toBe("/es/rust/cajas");

    const en = parseRoute("/en/rust/crates/elite-crate");
    expect(en).toMatchObject({ rsSection: "crates", detail: "elite-crate" });
    expect(routePath(en)).toBe("/en/rust/crates/elite-crate");
    expect(routePath({ ...en, lang: "es" })).toBe("/es/rust/cajas/caja-de-elite");
    const es = parseRoute("/es/rust/cajas/caja-de-elite");
    expect(es).toMatchObject({ lang: "es", rsSection: "crates", detail: "elite-crate" });
    expect(routePath(es)).toBe("/es/rust/cajas/caja-de-elite");
  });
});

describe("la pestaña Cajas", () => {
  beforeAll(async () => {
    await preloadTab(parseRoute("/es/rust/cajas"));
    await preloadTab(parseRoute("/en/rust/crates/elite-crate"));
  });

  it("la lista enlaza las 82 fichas, por grupo y con su evento", () => {
    const html = render("es", "/es/rust/cajas");
    for (const e of index) expect(html).toContain(`href="${routePath({ ...parseRoute("/es/rust"), rsSection: "crates", detail: e.slug })}"`);
    expect(html).toContain('href="/es/rust/cajas/caja-de-elite"');
    expect(html).toContain(">Cajas y barriles<");
    expect(html).toContain(">Halloween<");
    expect(html).not.toContain("rs-loading");
  });

  it("la ficha de la élite dibuja todas sus filas en el prerender, con ícono y enlace", () => {
    const want = rows.get("elite")!;
    expect(want.length).toBeGreaterThan(100);
    for (const lang of ["en", "es"] as const) {
      const html = render(lang, lang === "en" ? "/en/rust/crates/elite-crate" : "/es/rust/cajas/caja-de-elite");
      const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
      expect(body.match(/<tr>/g)).toHaveLength(want.length);
      expect(body).not.toContain("data-lazy");
      expect(body.match(/loading="lazy" decoding="async"/g)).toHaveLength(want.length);
      expect(html).toContain("<h1");
      expect(html).not.toContain("rs-loading");
    }
    const es = render("es", "/es/rust/cajas/caja-de-elite");
    expect(es).toContain("Caja de élite");
    expect(es).toContain('href="/es/rust/objetos/fusil-de-asalto"');
    expect(es).toMatch(/<thead><tr><th scope="col">Objeto<\/th><th scope="col">Cantidad<\/th><th scope="col">Probabilidad<\/th><\/tr><\/thead>/);
  });

  it("una ficha que no existe muestra la lista con una nota", () => {
    expect(render("en", "/en/rust/crates/no-such-crate")).toContain('class="rs-missing" role="status"');
  });

  it("la ficha de un objeto enlaza cada caja de su botín", async () => {
    await preloadTab(parseRoute("/es/rust/objetos/fusil-de-asalto"));
    const html = render("es", "/es/rust/objetos/fusil-de-asalto");
    expect(html).toContain('href="/es/rust/cajas/caja-de-elite"');
  });
});

describe("la copia y el <head> de Cajas", () => {
  it("la pestaña tiene nombre, SEO y textos en los dos idiomas", () => {
    expect(RUST_COPY.en.tabs.crates).toBe("Crates");
    expect(RUST_COPY.es.tabs.crates).toBe("Cajas");
    for (const lang of ["en", "es"] as const) {
      const c = RUST_COPY[lang].crates;
      expect(c.h1).toBeTruthy();
      expect(Object.keys(c.groups).sort()).toEqual(["box", "collect", "item", "npc"]);
    }
  });

  const data = {
    dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
    rs: {
      build: rsMeta.build, extractedAt: rsMeta.extractedAt,
      crates: index.map((e) => ({ slug: e.slug, en: crateName(e, "en", RUST_COPY.en.items.events), es: crateName(e, "es", RUST_COPY.es.items.events), kind: e.kind, n: e.n, bp: e.bp })),
    },
    dates: { rust: rsMeta.extractedAt },
  } as unknown as SitemapData;
  const pages = prerenderPages(data);
  const page = (path: string) => pages.find((p) => p.path === path)!;

  it("el sitemap trae la lista y cada ficha en los dos idiomas", () => {
    expect(page("/en/rust/crates")).toBeTruthy();
    expect(page("/es/rust/cajas")).toBeTruthy();
    expect(pages.filter((p) => p.path.startsWith("/en/rust/crates/"))).toHaveLength(index.length);
    expect(pages.filter((p) => p.path.startsWith("/es/rust/cajas/"))).toHaveLength(index.length);
  });

  it("los títulos empiezan por lo que se busca y la descripción dice cuántos objetos hay", () => {
    const n = new Set(rows.get("elite")!.map((r) => r.id)).size;
    expect(page("/en/rust/crates/elite-crate").title).toBe("Rust Elite Crate Loot Table: Drop Chances | Vestigo");
    expect(page("/en/rust/crates/elite-crate").description).toContain(`the ${n} items it can drop`);
    expect(page("/es/rust/cajas/caja-de-elite").title).toBe("Caja de élite de Rust: botín y probabilidades | Vestigo");
    expect(page("/es/rust/cajas/caja-de-elite").description).toContain(`los ${n} objetos que puede dar`);
    expect(page("/en/rust/crates").title).toMatch(/^Rust Loot Tables/);
    expect(page("/es/rust/cajas").title).toMatch(/^Cajas de Rust/);
    // Ningún objeto del botín sale como plano: la descripción no lo promete.
    expect(pages.some((p) => /blueprint|plano/i.test(p.description))).toBe(index.some((e) => e.bp));
  });

  it("las dos menas de metal no comparten título", () => {
    expect(page("/en/rust/crates/metal-ore").title).not.toBe(page("/en/rust/crates/metal-ore-collect-halloween-metalore").title);
    expect(page("/en/rust/crates/metal-ore-collect-halloween-metalore").title).toBe("Rust Metal Ore (Halloween): What Picking It Up Gives | Vestigo");
  });
});
