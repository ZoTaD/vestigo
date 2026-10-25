/**
 * La barra de pestañas de Stardew Valley en el teléfono (2026-10-25): una sola fila que se desliza de costado. La
 * pestaña abierta se lleva a la vista sin mover la página, y un degradé avisa de qué lado hay más.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LangContext } from "../src/i18n";
import type { Route } from "../src/route";
import Stardew from "../src/Stardew";
import { STARDEW_TABS } from "../src/stardewCopy";
import { tabScrollLeft, tabsMore } from "../src/stardew/tabsScroll";

describe("la barra que se desliza", () => {
  it("lleva la pestaña abierta al centro, sin pasarse de los bordes", () => {
    // Una barra de 343 px de ancho visible y 1.400 de largo.
    expect(tabScrollLeft({ left: 1200, width: 120 }, 343, 1400)).toBe(1400 - 343);
    expect(tabScrollLeft({ left: 20, width: 80 }, 343, 1400)).toBe(0);
    expect(tabScrollLeft({ left: 600, width: 100 }, 343, 1400)).toBe(Math.round(600 - (343 - 100) / 2));
    // Si todo entra, no se mueve.
    expect(tabScrollLeft({ left: 200, width: 100 }, 900, 900)).toBe(0);
  });

  it("dice de qué lado queda más por ver", () => {
    expect(tabsMore(0, 343, 1400)).toBe("right");
    expect(tabsMore(500, 343, 1400)).toBe("both");
    expect(tabsMore(1400 - 343, 343, 1400)).toBe("left");
    // Medio píxel de redondeo al final cuenta como el final; si todo entra, ninguno.
    expect(tabsMore(1400 - 343 - 0.5, 343, 1400)).toBe("left");
    expect(tabsMore(0, 900, 900)).toBe("none");
  });

  it("el prerender dibuja la barra con todas las pestañas y la abierta marcada", () => {
    const route = { lang: "es", view: "stardew", sdSection: "island" } as Route;
    const html = renderToStaticMarkup(
      createElement(LangContext.Provider, { value: { lang: "es", setLang: () => undefined } }, createElement(Stardew, { route, navigate: () => undefined })),
    );
    const nav = html.slice(html.indexOf('<nav class="sd-tabs"'), html.indexOf("</nav>"));
    expect((nav.match(/class="sd-tab[ "]/g) ?? []).length).toBe(STARDEW_TABS.length);
    expect(nav).toMatch(/class="sd-tab is-on"[^>]*>Isla Jengibre</);
  });
});
