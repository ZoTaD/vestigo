import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import Rust from "../src/Rust";
import meta from "../../games/rust/data/meta.json";
import home from "../../games/rust/data/home.json";

const render = (lang: "en" | "es", path: string) =>
  renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(Rust, { route: parseRoute(path), navigate: () => undefined })),
  );

describe("la portada de Rust", () => {
  it("dice qué hay, con las cifras de los datos, en español", () => {
    const html = render("es", "/es/rust");
    expect(html).toMatch(/<h1[^>]*>Guía de Rust<\/h1>/);
    expect(html).toContain('type="search"');
    expect(html).toContain(meta.counts.items.toLocaleString("es-AR"));
    expect(html).toContain(meta.counts.recipes.toLocaleString("es-AR"));
    expect(html).toContain("Próximo wipe forzado");
    expect(html).toContain("Sobre esta guía");
  });

  it("el adelanto de la calculadora: C4 y azufre para la pared de piedra, y los dos botones", () => {
    const html = render("es", "/es/rust");
    expect(html).toContain("Pared de piedra");
    expect(html).toMatch(/data-cell="building\.stone"[^>]*>2 C4 · 4\.400</);
    expect(html).toContain('href="/es/rust/raideo"');
    expect(html).toContain('href="/es/rust/raideo#tabla"');
  });

  it("en inglés, el h1 dice lo que se busca", () => {
    expect(render("en", "/en/rust")).toMatch(/<h1[^>]*>Rust Guide: Items, Crafting &amp; Raids<\/h1>/);
  });

  it("los casilleros enlazan la ficha de cada objeto con su slug en español", () => {
    const html = render("es", "/es/rust");
    expect(html).toContain('href="/es/rust/objetos/fusil-de-asalto"');
    expect(html).toContain('href="/es/rust/objetos/azufre"');
  });

  it("en inglés, con los textos en inglés", () => {
    const html = render("en", "/en/rust");
    expect(html).toContain("Next forced wipe");
    expect(html).toContain("About this guide");
  });

  it("los casilleros muestran los íconos con el nombre oficial en el idioma de la página", () => {
    const html = render("es", "/es/rust");
    for (const it of home) {
      expect(html).toContain(`src="/rust/items/${it.id}.webp"`);
      expect(html).toContain(`alt="${it.name.es ?? it.name.en}"`);
    }
  });

  it("Objetos y Raideo enlazan; las pestañas de las etapas que vienen se ven apagadas", () => {
    const html = render("es", "/es/rust");
    expect(html).toContain('href="/es/rust/objetos"');
    expect(html).toContain('href="/es/rust/raideo"');
    expect(html).toMatch(/class="rs-tab is-soon"[^>]*>Monumentos</);
  });

  it("antes de tener reloj (el prerender) muestra el día del wipe sin la cuenta", () => {
    const html = render("es", "/es/rust");
    expect(html).toContain('class="rs-wipe-when"');
    expect(html).not.toContain('class="rs-count"');
  });
});
