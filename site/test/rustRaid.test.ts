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

describe("la pestaña Raideo", () => {
  beforeAll(() => preloadTab(parseRoute("/es/rust/raideo")));

  it("tiene su h1, el selector y la tabla completa en el HTML", () => {
    const html = render("es", "/es/rust/raideo");
    expect(html).toMatch(/<h1[^>]*>Calculadora de raideo de Rust<\/h1>/);
    expect(html).toContain("Pared de piedra");
    expect(html).toContain("Puerta de chapa");
    expect(html).toContain('id="tabla"');
    expect(html).not.toContain("rs-loading");
  });

  it("la tabla dice 2 C4 para la pared de piedra", () => {
    const html = render("es", "/es/rust/raideo");
    expect(html).toMatch(/data-cell="building\.stone\|explosive\.timed"[^>]*>2</);
  });

  it("los objetivos que son objetos enlazan su ficha", () => {
    expect(render("es", "/es/rust/raideo")).toContain('href="/es/rust/objetos/puerta-de-chapa"');
  });

  it("en inglés", () => {
    const html = render("en", "/en/rust/raid");
    expect(html).toMatch(/<h1[^>]*>Rust Raid Calculator<\/h1>/);
    expect(html).toContain("Stone wall");
  });
});
