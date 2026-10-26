import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import Nav, { type View } from "../src/Nav";
import { GAME_GROUPS, GAME_LOGOS } from "../src/gameGroups";

const render = (lang: "en" | "es", path: string, active: View) =>
  renderToStaticMarkup(
    createElement(
      LangContext.Provider,
      { value: { lang, setLang: () => undefined } },
      createElement(Nav, { active, route: parseRoute(path), onNavigate: () => undefined }),
    ),
  );

describe("la barra: el menú de juegos", () => {
  it("el botón dice si el menú está abierto y a qué panel controla; el panel arranca cerrado", () => {
    const html = render("en", "/en", "home");
    expect(html).toMatch(/<button[^>]*class="top-menu-btn"[^>]*aria-expanded="false"[^>]*aria-controls="top-menu"/);
    expect(html).toMatch(/<div class="top-menu" id="top-menu"[^>]*hidden=""/);
  });

  it("todos los juegos están en el HTML, por categoría y en orden, con su logo", () => {
    const html = render("en", "/en", "home");
    const titles = [...html.matchAll(/<p class="top-menu-title">([^<]+)</g)].map((m) => m[1]);
    expect(titles).toEqual(["Survival &amp; sandbox", "ARPG", "Shooters"]);
    const logos = [...html.matchAll(/url\(\/logos\/([a-z0-9]+)\.png\)/g)].map((m) => m[1]);
    expect(logos).toEqual(GAME_GROUPS.flatMap((g) => g.games));
    for (const game of Object.keys(GAME_LOGOS)) expect(existsSync(`public/logos/${game}.png`)).toBe(true);
    // El nombre del juego queda escrito para el lector de pantalla y para Google.
    expect(html).toContain('<span class="visually-hidden">Diablo II: Resurrected</span>');
  });

  it("los accesos directos llevan a la pestaña del juego, en el idioma de la página", () => {
    const html = render("es", "/es/d2r", "d2r");
    expect(html).toContain('href="/es/d2r/palabras-runicas"');
    expect(html).toContain('href="/es/rust/raideo"');
    expect(html).toContain('href="/es/stardew-valley/predictor"');
    expect(html).toContain('aria-label="Valheim: Mapa"');
  });

  it("el juego en el que se está aparece en la barra y queda marcado en el menú", () => {
    const html = render("en", "/en/stardew-valley", "stardew");
    expect(html).toMatch(/class="top-here"[^>]*>Stardew</);
    expect(html).toContain('class="top-menu-game is-here"');
    expect(render("en", "/en", "home")).not.toContain("top-here");
  });
});
