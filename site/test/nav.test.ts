import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";
import Nav, { type Game, type View } from "../src/Nav";
import { GAME_GROUPS, GAME_LOGOS, logoFile } from "../src/gameGroups";

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
    expect(titles).toEqual(["Survival &amp; sandbox", "Shooters", "RTS"]);
    const logos = [...html.matchAll(/url\(\/logos\/([a-z0-9]+)\.(?:png|svg)\)/g)].map((m) => m[1]);
    expect(logos).toEqual(GAME_GROUPS.flatMap((g) => g.games));
    for (const game of Object.keys(GAME_LOGOS)) expect(existsSync(`public/logos/${logoFile(game as Game)}`)).toBe(true);
    // El nombre del juego queda escrito para el lector de pantalla y para Google.
    expect(html).toContain('<span class="visually-hidden">Counter-Strike 2</span>');
  });

  it("Rust y Terraria, congelados, no se ofrecen en el menú, pero sus páginas siguen andando", () => {
    const home = render("en", "/en", "home");
    expect(home).not.toContain("/logos/rust.png");
    expect(home).not.toContain("/logos/terraria.png");
    expect(home).not.toMatch(/href="\/en\/rust/);
    expect(render("en", "/en/rust", "rust")).toMatch(/class="top-here"[^>]*>Rust</);
  });

  it("PoE2, Diablo II y Warframe, escondidos desde el 2026-11-05, tampoco", () => {
    const home = render("en", "/en", "home");
    for (const logo of ["poe2.png", "d2r.png", "warframe.svg"]) expect(home).not.toContain(`/logos/${logo}`);
    expect(home).not.toMatch(/href="\/en\/(poe2|d2r|warframe)/);
  });

  it("los accesos directos llevan a la pestaña del juego, en el idioma de la página", () => {
    const html = render("es", "/es/valheim", "valheim");
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
