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
    expect(html).toContain("Guía de Rust en español");
    expect(html).toContain(meta.counts.items.toLocaleString("es-AR"));
    expect(html).toContain(meta.counts.recipes.toLocaleString("es-AR"));
    expect(html).toContain("Próximo wipe forzado");
    expect(html).toContain("Sobre esta guía");
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

  it("las pestañas sin publicar se ven apagadas y sin enlace, y las de las etapas que vienen también", () => {
    const html = render("es", "/es/rust");
    expect(html).toContain('href="/es/rust"');
    expect(html).not.toContain('href="/es/rust/objetos"');
    expect(html).toMatch(/class="rs-tab is-soon"[^>]*>Objetos</);
    expect(html).toMatch(/class="rs-tab is-soon"[^>]*>Monumentos</);
  });

  it("antes de tener reloj (el prerender) muestra el día del wipe sin la cuenta", () => {
    const html = render("es", "/es/rust");
    expect(html).toContain('class="rs-wipe-when"');
    expect(html).not.toContain('class="rs-count"');
  });
});
