import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import Rust, { preloadTab } from "../src/Rust";

const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Rust, { route: parseRoute(path), navigate: () => undefined })),
  );

describe("la pestaña Objetos de Rust", () => {
  beforeAll(async () => {
    await preloadTab(parseRoute("/es/rust/objetos"));
    await preloadTab(parseRoute("/es/rust/objetos/fusil-de-asalto"));
    await preloadTab(parseRoute("/en/rust/items/wood"));
    await preloadTab(parseRoute("/en/rust/items/gears"));
  });

  it("la lista enlaza cada ficha con su slug en español y trae los filtros", () => {
    const html = render("es", "/es/rust/objetos");
    expect(html).toContain('href="/es/rust/objetos/fusil-de-asalto"');
    expect(html).toContain(">Armas<");
    expect(html).toContain('type="search"');
    expect(html).not.toContain("rs-loading");
  });

  it("la pestaña ya no está apagada", () => {
    expect(render("es", "/es/rust")).toContain('href="/es/rust/objetos"');
  });

  it("la ficha del AK: nombre, comando, receta con enlaces, investigación y botín", () => {
    const html = render("es", "/es/rust/objetos/fusil-de-asalto");
    expect(html).toContain("<h1");
    expect(html).toContain("Fusil de asalto");
    expect(html).toContain("inventory.give rifle.ak 1");
    expect(html).toMatch(/href="\/es\/rust\/objetos\/[^"]+"/);
    expect(html).toContain("500");
    expect(html).toContain("Caja de élite");
    expect(html).not.toContain("rs-loading");
  });

  it("la madera: se usa en, y la tienda de Outpost si la vende", () => {
    const html = render("en", "/en/rust/items/wood");
    expect(html).toContain("Used in");
    expect(html).toContain('href="/en/rust/items/assault-rifle"');
  });

  it("los engranajes: lo que da el reciclador en cada recicladora", () => {
    const html = render("en", "/en/rust/items/gears");
    expect(html).toContain("Recycling");
    expect(html).toContain(">13<");
    expect(html).toContain(">10<");
  });

  it("una ficha que no existe muestra la lista con una nota", async () => {
    await preloadTab(parseRoute("/es/rust/objetos/no-existe"));
    const html = render("es", "/es/rust/objetos/no-existe");
    expect(html).toContain("rs-missing");
    expect(html).toContain('href="/es/rust/objetos/fusil-de-asalto"');
  });
});
