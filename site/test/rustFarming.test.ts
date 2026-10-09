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

describe("la pestaña Granjas de Rust (2026-10-09)", () => {
  beforeAll(async () => {
    await preloadTab(parseRoute("/es/rust/granjas"));
  });

  it("la portada de la granja enlaza cada planta y la calculadora, con su slug en español", () => {
    const html = render("es", "/es/rust/granjas");
    expect(html).toContain('href="/es/rust/granjas/canamo"');
    expect(html).toContain('href="/es/rust/granjas/genetica"');
    expect(html).toContain("Granjas en Rust");
    expect(html).toContain("Compostador");
    expect(html).not.toContain("rs-loading");
    // La pestaña se ve encendida en la barra.
    expect(html).toMatch(/class="rs-tab is-on"[^>]*>Granjas</);
  });

  it("la ficha de una planta dice lo que tarda y lo que da", () => {
    const html = render("en", "/en/rust/farming/hemp");
    expect(html).toContain("<h1");
    expect(html).toContain(">Hemp</h1>");
    expect(html).toContain("1 h 52 min");
    expect(html).toContain("40 × Cloth");
    expect(html).toContain('href="/en/rust/items/cloth"');
  });

  it("la calculadora sale en el prerender sin el estado del link", () => {
    const html = render("es", "/es/rust/granjas/genetica");
    expect(html).toContain("Calculadora de genética de Rust");
    expect(html).toContain("Buscar una cruza");
    expect(html).not.toContain("rs-loading");
  });

  it("una planta que no existe muestra la granja con una nota", () => {
    const html = render("en", "/en/rust/farming/no-such-plant");
    expect(html).toContain("rs-missing");
    expect(html).toContain('href="/en/rust/farming/genetics"');
  });
});
