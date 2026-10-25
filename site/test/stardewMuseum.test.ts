/**
 * La pestaña Museo de Stardew Valley (etapa 4, tarea 7): el checklist en el navegador (`checklist.ts`, con datos viejos,
 * rotos o sin acceso), el avance y los premios ganados con lo tildado, lo que se trae de una partida, la vista en la
 * dirección y las tres vistas dibujadas en los dos idiomas. Las pantallas se dibujan sin navegador, como el prerender.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import raw from "../../games/stardew/data/museum.json";
import { LangContext } from "../src/i18n";
import { parseRoute, routePath, STARDEW_PUBLISHED, type Route } from "../src/route";
import { STARDEW_TABS } from "../src/stardewCopy";
import { readDone, toggle, writeDone, type Done } from "../src/stardew/checklist";
import { loadMuseum } from "../src/stardew/data";
import { MuseumBook } from "../src/stardew/museum/StardewMuseum";
import {
  doneFromSave,
  MUSEUM_KEY,
  pieceKinds,
  progress,
  readMuseumView,
  shownPieces,
  viewOfAnchor,
  writeMuseumView,
  type MuseumData,
  type MuseumView,
} from "../src/stardew/museum/state";

const data = raw as unknown as MuseumData;
beforeAll(() => loadMuseum());
const route = (lang: "en" | "es") => ({ lang, view: "stardew", sdSection: "museum" }) as Route;
const inLang = (lang: "en" | "es", el: ReactElement) => renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, el));
const book = (initial: MuseumView, lang: "en" | "es" = "en", done: Done = {}) =>
  inLang(lang, createElement(MuseumBook, { data, route: route(lang), navigate: () => undefined, initial, initialDone: done }));
/** El texto del `<li>` con ese `id` (con lo que tenga adentro, hasta su cierre), sin etiquetas. */
const row = (html: string, id: string) => {
  const start = html.lastIndexOf("<li", html.indexOf(`id="${id}"`));
  expect(start).toBeGreaterThan(-1);
  const tags = /<li[\s>]|<\/li>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[0] === "</li>" ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  throw new Error(`sin cierre: ${id}`);
};
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

/** Un `localStorage` de mentira. */
function fakeStorage(): Record<string, string> {
  const store: Record<string, string> = {};
  const fake = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] };
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true });
  return store;
}
const original = globalThis.localStorage;
afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: original, configurable: true });
});

const ids = (...list: string[]): Done => Object.fromEntries(list.map((i) => [i, true]));

describe("el checklist en el navegador (checklist.ts)", () => {
  it("guarda y lee con la clave que se le pasa", () => {
    const store = fakeStorage();
    writeDone(MUSEUM_KEY, { "96": true });
    expect(store["sdv-museum-v1"]).toBe('{"96":true}');
    expect(readDone(MUSEUM_KEY)).toEqual({ "96": true });
    // Cada lista con su clave: el Museo no ve lo del Centro Comunitario.
    expect(readDone("sdv-cc-v1")).toEqual({});
  });

  it("JSON roto, algo que no es un objeto o marcas que no son true dan lo que se puede leer", () => {
    const store = fakeStorage();
    store[MUSEUM_KEY] = "no es json";
    expect(readDone(MUSEUM_KEY)).toEqual({});
    store[MUSEUM_KEY] = "[1,2]";
    expect(readDone(MUSEUM_KEY)).toEqual({});
    store[MUSEUM_KEY] = '{"96":true,"97":false,"98":3}';
    expect(readDone(MUSEUM_KEY)).toEqual({ "96": true });
  });

  it("con el acceso bloqueado no tira, y se tilda igual en memoria", () => {
    Object.defineProperty(globalThis, "localStorage", { get() { throw new Error("bloqueado"); }, configurable: true });
    expect(readDone(MUSEUM_KEY)).toEqual({});
    expect(() => writeDone(MUSEUM_KEY, { "96": true })).not.toThrow();
    expect(toggle(toggle({}, "96"), "97")).toEqual({ "96": true, "97": true });
    expect(toggle({ "96": true }, "96")).toEqual({});
  });

  it("claves que no son piezas (de otra versión, o a mano) no cuentan en el avance", () => {
    const store = fakeStorage();
    store[MUSEUM_KEY] = JSON.stringify({ "96": true, "999": true, "Pantry/0:1": true, "(O)97": true });
    const p = progress(data, readDone(MUSEUM_KEY));
    expect(p.pieces).toBe(1);
    // Y tampoco suman para los premios por cantidad.
    expect(p.rewards.find((r) => r.key === "museum5")!.missing).toBe(4);
  });
});

describe("el avance y los premios", () => {
  it("sin nada tildado: 0 de 95 y ningún premio", () => {
    const p = progress(data, {});
    expect(p.pieces).toBe(0);
    expect(p.total).toBe(95);
    expect(p.rewards).toHaveLength(31);
    expect(p.rewards.every((r) => !r.ok && r.missing > 0)).toBe(true);
    expect(p.rewards.find((r) => r.key === "museumComplete")!.missing).toBe(95);
  });

  it("los cuatro rollos enanos dan la guía de traducción (dwarf)", () => {
    expect(progress(data, ids("96", "97", "98")).rewards.find((r) => r.key === "dwarf")).toEqual({ key: "dwarf", ok: false, missing: 1 });
    const p = progress(data, ids("96", "97", "98", "99"));
    expect(p.rewards.find((r) => r.key === "dwarf")!.ok).toBe(true);
    // Cuatro artefactos: no alcanzan para los 5 de cualquier tipo, pero falta sólo 1.
    expect(p.rewards.find((r) => r.key === "museum5")).toEqual({ key: "museum5", ok: false, missing: 1 });
  });

  it("la estatua de gallina pide la estatua y 5 artefactos (ella cuenta como uno)", () => {
    const arts = data.pieces.filter((x) => x.kind === "arch" && x.id !== "113").slice(0, 4).map((x) => x.id);
    expect(progress(data, ids(...arts)).rewards.find((r) => r.key === "chicken")!.missing).toBe(2);
    expect(progress(data, ids("113", ...arts)).rewards.find((r) => r.key === "chicken")!.ok).toBe(true);
    // Minerales no suman para los artefactos.
    const mins = data.pieces.filter((x) => x.kind === "mineral").slice(0, 10).map((x) => x.id);
    expect(progress(data, ids("113", ...mins)).rewards.find((r) => r.key === "chicken")!.missing).toBe(4);
  });

  it("todo tildado: 95 de 95 y todos los premios", () => {
    const p = progress(data, ids(...data.pieces.map((x) => x.id)));
    expect(p.pieces).toBe(95);
    expect(p.rewards.every((r) => r.ok && r.missing === 0)).toBe(true);
  });

  it("el filtro: artefactos, minerales y lo que falta", () => {
    expect(shownPieces(data, "all", {})).toHaveLength(95);
    expect(shownPieces(data, "arch", {})).toHaveLength(42);
    expect(shownPieces(data, "mineral", {})).toHaveLength(53);
    expect(shownPieces(data, "missing", ids("96", "60"))).toHaveLength(93);
  });

  it("de dónde sale, en pocas palabras, sin repetir", () => {
    expect(pieceKinds(data.pieces.find((x) => x.id === "74")!)).toEqual(["geode", "monster", "fish", "other"]);
  });

  it("lo donado en la partida pasa a casilleros, sin prefijos ni ids que no son piezas", () => {
    expect(doneFromSave(["96", "(O)60", "999"], data)).toEqual({ "96": true, "60": true });
  });
});

describe("la dirección y la vista", () => {
  it("museum en inglés, museo en español, publicada, en la barra después de Minas", () => {
    expect(routePath(route("en"))).toBe("/en/stardew-valley/museum");
    expect(routePath(route("es"))).toBe("/es/stardew-valley/museo");
    expect(parseRoute("/es/stardew-valley/museo")).toMatchObject({ view: "stardew", sdSection: "museum" });
    expect(STARDEW_PUBLISHED).toContain("museum");
    expect(STARDEW_TABS.indexOf("museum")).toBe(STARDEW_TABS.indexOf("mines") + 1);
  });

  it("la vista viaja en ?v=; la Colección va sin nada", () => {
    expect(readMuseumView("?v=rewards")).toBe("rewards");
    expect(readMuseumView("?v=books")).toBe("books");
    expect(readMuseumView("?v=otra")).toBe("collection");
    expect(readMuseumView("")).toBe("collection");
    expect(writeMuseumView("collection")).toBe("");
    expect(writeMuseumView("rewards")).toBe("?v=rewards");
  });

  it("un ancla sin ?v= abre la vista donde está", () => {
    expect(viewOfAnchor(data, "emerald")).toBe("collection");
    expect(viewOfAnchor(data, "dwarf")).toBe("rewards");
    expect(viewOfAnchor(data, "the-alleyway-buffet")).toBe("books");
    expect(viewOfAnchor(data, "nada")).toBeNull();
    expect(viewOfAnchor(data, "")).toBeNull();
  });
});

describe("las vistas dibujadas", () => {
  it("la Colección: 95 casilleros tildables, cada uno con su id y su sprite a tamaño fijo", () => {
    const html = book("collection");
    expect(html.match(/<li class="sd-mu-piece[^"]*" id="/g)).toHaveLength(95);
    const esmeralda = row(html, "emerald");
    expect(esmeralda).toContain('aria-pressed="false"');
    expect(esmeralda).toMatch(/<img[^>]*src="\/stardew\/items\/60.png"[^>]*width="48" height="48" loading="lazy" decoding="async"/);
    expect(plain(esmeralda)).toContain("Emerald");
    expect(html).toContain("0 / 95");
  });

  it("el dibujo y el nombre son un solo botón que tilda: tocar el nombre no se va de la página", () => {
    const esmeralda = row(book("collection"), "emerald");
    // El botón que tilda lleva adentro el dibujo y el nombre, y se nombra con el nombre de la pieza.
    const boton = /<button[^>]*class="sd-mu-tick"[^>]*>([\s\S]*?)<\/button>/.exec(esmeralda);
    expect(boton).not.toBeNull();
    expect(boton![0]).toContain('aria-pressed="false"');
    expect(boton![0]).toContain('aria-label="Emerald"');
    expect(plain(boton![1])).toContain("Emerald");
    expect(boton![1]).toContain('src="/stardew/items/60.png"');
    // Cerrada, la tarjeta no tiene enlaces: el de la ficha está en el detalle.
    expect(esmeralda).not.toContain("<a ");
    // Lo no donado también se ve: la casilla vacía, sin palomita.
    expect(esmeralda).toContain("sd-mu-box");
    expect(esmeralda).not.toContain("sd-check");
  });

  it("lo tildado se ve con la marca y suma al avance", () => {
    const html = book("collection", "es", ids("60"));
    expect(row(html, "emerald")).toContain('aria-pressed="true"');
    expect(row(html, "emerald")).toContain("sd-check");
    expect(html).toContain("1 / 95");
    expect(plain(row(html, "emerald"))).toContain("Esmeralda");
  });

  it("los Premios: lo que piden, lo que falta y el premio; el mueble con su dibujo", () => {
    const html = book("rewards", "en", ids("96", "97"));
    const enano = plain(row(html, "dwarf"));
    expect(enano).toContain("Dwarvish Translation Guide");
    expect(enano).toContain("2 left");
    const gallina = row(html, "chicken");
    expect(gallina).toMatch(/<img[^>]*src="\/stardew\/rewards\/f-1305.png"[^>]*width="32" height="64"/);
    expect(plain(gallina)).toContain("Chicken Statue");
    // La llave oxidada, sin ficha, con su dibujo.
    expect(row(html, "museum60")).toContain('src="/stardew/rewards/rusty-key.png"');
    // La de la receta se distingue de la de las semillas.
    expect(plain(row(html, "ancient-seed-recipe"))).toContain("Ancient Seeds (Recipe)");
    // El premio con ficha enlaza a ella.
    expect(row(html, "dwarf")).toContain('href="/en/stardew-valley/items/dwarvish-translation-guide"');
    expect(html).not.toMatch(/\(F\)|\(BC\)|\{0\}/);
  });

  it("los Premios en español, con el ganado marcado", () => {
    const html = book("rewards", "es", ids("96", "97", "98", "99"));
    const enano = plain(row(html, "dwarf"));
    expect(enano).toContain("Guía de traducción enana");
    expect(enano).toContain("Ganado");
    expect(plain(row(html, "ancient-seed-recipe"))).toContain("Semillas milenarias (Receta)");
    expect(row(html, "dwarf")).toContain('href="/es/stardew-valley/objetos/guia-de-traduccion-enana"');
  });

  it("los Libros: efecto, precio y dónde; los 21 libros perdidos aparte", () => {
    const html = book("books");
    const basural = plain(row(html, "the-alleyway-buffet"));
    expect(basural).toContain("The Alleyway Buffet");
    expect(basural).toMatch(/\d/);
    expect(html).toContain('href="/en/stardew-valley/items/the-alleyway-buffet"');
    expect(plain(html)).toContain("21");
    // El Librero va a la derecha con su precio; "uno de sus libros al azar, desde el año 3" se dice una vez arriba.
    expect(basural).not.toContain("Bookseller:");
    expect(basural).not.toContain("random books");
    expect(plain(html).match(/one of its random books, from Year 3/g)).toHaveLength(1);
    // La condición que no es la de todos va junto al precio.
    expect(plain(row(html, "queen-of-sauce-cookbook"))).toContain("100");
    const es = book("books", "es");
    expect(plain(es)).toContain("Librero");
    expect(es).not.toMatch(/\[|\{0\}/);
  });

  it("sin huecos ni claves del juego en ninguna vista", () => {
    for (const lang of ["en", "es"] as const)
      for (const v of ["collection", "rewards", "books"] as const) {
        const html = plain(book(v, lang));
        expect(html).not.toMatch(/\{\d?\}|\[[A-Za-z]|undefined|NaN/);
      }
  });

  it("la Colección entra en el presupuesto de nodos (lejos de 3.000)", () => {
    const html = book("collection");
    expect((html.match(/<[a-z][^>]*>/g) ?? []).length).toBeLessThan(1600);
    expect((html.match(/<img /g) ?? []).length).toBeLessThanOrEqual(100);
  });
});
