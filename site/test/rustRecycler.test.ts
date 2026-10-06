import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import recycle from "virtual:rust-recycle";
import items from "../../games/rust/data/items.json";
import rsMeta from "../../games/rust/data/meta.json";
import list from "../../games/rust/data/site/list.json";
import { LangContext } from "../src/i18n";
import { parseRoute, routePath, RUST_DETAIL_SECTIONS, RUST_PUBLISHED } from "../src/route";
import Rust, { preloadTab } from "../src/Rust";
import { RUST_COPY } from "../src/rustCopy";
import { DEFAULT_RECYCLER, recycleRows, sortRecycleRows } from "../src/rust/recycler/model";
import { prerenderPages, type SitemapData } from "../src/prerender";

const known = new Map(list.rows.map((r) => [r.id, r]));
const eff = (key: string) => recycle.recyclers.find((r) => r.key === key)!.eff;
const at = (key: string) => new Map(recycleRows(recycle, eff(key), known).map((r) => [r.id, r]));

const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Rust, { route: parseRoute(path), navigate: () => undefined })),
  );

/** Rust, pestaña Reciclador (2026-10-06): una sola página con lo que da cada objeto que se recicla. */
describe("los datos del Reciclador", () => {
  it("el módulo del build trae cada objeto con ficha que se recicla, y las cuatro recicladoras", () => {
    const want = items.items.filter((i) => i.recycle && known.has(i.id)).length;
    expect(recycle.rows).toHaveLength(want);
    expect(recycle.recyclers).toEqual(items.recyclers);
  });

  it("la de entrada es la verde de los monumentos", () => {
    expect(DEFAULT_RECYCLER).toBe("green");
    expect(recycle.recyclers.map((r) => r.key)).toContain(DEFAULT_RECYCLER);
  });

  // Las mismas cuentas que la ficha (`recycle.ts`). Cotejado el 2026-10-06 con wiki.facepunch.com/rust/item/gears:
  // "Recycler" (60 %) 15 fragmentos y 12 de chatarra; "Safe Zone Recycler" (40 %) 10 y 8.
  it("los engranajes: chatarra escalada y fragmentos con la chance de uno más", () => {
    const g = (key: string) => at(key).get("gears")!;
    expect(g("green").scrap).toBe(10);
    expect(g("green").out[0]).toMatchObject({ id: "metal.fragments", yield: { n: 12, pct: 50 } });
    expect(g("green_power").scrap).toBe(12);
    expect(g("green_power").out[0].yield).toEqual({ n: 15, pct: 0 });
    expect(g("yellow").scrap).toBe(8);
    expect(g("yellow").out[0].yield).toEqual({ n: 10, pct: 0 });
  });

  it("ordena por chatarra (de más a menos) o por nombre, y busca en los dos idiomas y el shortname", () => {
    const rows = recycleRows(recycle, eff("green"), known);
    const byScrap = sortRecycleRows(rows, "scrap", "", "en", "en");
    for (let i = 1; i < byScrap.length; i++) expect(byScrap[i - 1].scrap).toBeGreaterThanOrEqual(byScrap[i].scrap);
    const byName = sortRecycleRows(rows, "name", "", "es", "es");
    for (let i = 1; i < byName.length; i++) expect((byName[i - 1].name.es || byName[i - 1].name.en).localeCompare(byName[i].name.es || byName[i].name.en, "es")).toBeLessThanOrEqual(0);
    expect(sortRecycleRows(rows, "scrap", "engranaje", "es", "es").map((r) => r.id)).toContain("gears");
    expect(sortRecycleRows(rows, "scrap", "riflebody", "en", "en").map((r) => r.id)).toEqual(["riflebody"]);
  });
});

describe("la pestaña Reciclador", () => {
  beforeAll(async () => {
    await preloadTab(parseRoute("/es/rust/reciclador"));
  });

  it("está publicada, sin fichas, en /recycler y /reciclador", () => {
    expect(RUST_PUBLISHED).toContain("recycler");
    expect(RUST_DETAIL_SECTIONS).not.toContain("recycler");
    expect(parseRoute("/en/rust/recycler")).toMatchObject({ rsSection: "recycler", detail: undefined });
    expect(routePath({ ...parseRoute("/en/rust/recycler"), lang: "es" })).toBe("/es/rust/reciclador");
  });

  it("el prerender escribe todas las filas, con ícono y enlace a la ficha, ordenadas por chatarra", () => {
    for (const lang of ["en", "es"] as const) {
      const html = render(lang, lang === "en" ? "/en/rust/recycler" : "/es/rust/reciclador");
      const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
      expect(body.match(/<tr>/g)).toHaveLength(recycle.rows.length);
      expect(body).not.toContain("data-lazy");
      expect(body.match(/<img src="\/rust\/items\/[^"]+" alt="" width="28" height="28" loading="lazy" decoding="async"\/>/g)).toHaveLength(recycle.rows.length);
      expect(html).not.toContain("rs-loading");
    }
    const es = render("es", "/es/rust/reciclador");
    expect(es).toContain('href="/es/rust/objetos/engranajes"');
    expect(es).toContain('aria-pressed="true">Verde <span');
    const first = es.indexOf('href="/es/rust/objetos/motopico"');
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(es.indexOf('href="/es/rust/objetos/engranajes"'));
  });
});

describe("el <head> del Reciclador", () => {
  const data = {
    dlHeroes: {}, dlItems: {}, dlHeroIds: [], dlItemIds: [],
    rs: { build: rsMeta.build, extractedAt: rsMeta.extractedAt },
    dates: { rust: rsMeta.extractedAt },
  } as unknown as SitemapData;
  const pages = prerenderPages(data);

  it("título y descripción en los dos idiomas", () => {
    expect(RUST_COPY.en.tabs.recycler).toBe("Recycler");
    expect(RUST_COPY.es.tabs.recycler).toBe("Reciclador");
    expect(pages.find((p) => p.path === "/en/rust/recycler")!.title).toBe("Rust Recycler: What Every Item Recycles Into (Scrap List) | Vestigo");
    expect(pages.find((p) => p.path === "/es/rust/reciclador")!.title).toBe("Reciclador de Rust: qué da cada objeto (chatarra) | Vestigo");
  });
});
