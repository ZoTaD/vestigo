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

describe("el raideo en las fichas", () => {
  beforeAll(async () => {
    await preloadTab(parseRoute("/es/rust/objetos/puerta-de-chapa"));
    await preloadTab(parseRoute("/es/rust/objetos/carga-explosiva-con-temporizador"));
    await preloadTab(parseRoute("/es/rust/objetos/fusil-de-asalto"));
  });

  it("una puerta dice lo que cuesta romperla y abre la calculadora con ella elegida", () => {
    const html = render("es", "/es/rust/objetos/puerta-de-chapa");
    expect(html).toContain("Lo que cuesta romperlo");
    expect(html).toMatch(/data-cell="door\.hinged\.metal\|explosive\.timed"[^>]*>1</);
    expect(html).toContain('href="/es/rust/raideo?o=door.hinged.metal"');
  });

  it("el C4 dice qué rompe", () => {
    const html = render("es", "/es/rust/objetos/carga-explosiva-con-temporizador");
    expect(html).toContain("Qué rompe");
    expect(html).toMatch(/data-cell="building\.stone\|explosive\.timed"[^>]*>2</);
  });

  it("un objeto que no es ni explosivo ni objetivo no muestra nada de raideo", () => {
    const html = render("es", "/es/rust/objetos/fusil-de-asalto");
    expect(html).not.toContain("Qué rompe");
    expect(html).not.toContain("Lo que cuesta romperlo");
  });
});
