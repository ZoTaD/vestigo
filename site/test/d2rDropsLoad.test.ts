// site/test/d2rDropsLoad.test.ts
// Cómo cargan las cuentas pesadas de la calculadora (la tanda final): la ficha de un jefe trae sus listas de siempre escritas
// en el HTML (una isla de datos) y no las recalcula al abrir; "¿Qué suelta?" abierto desde un enlace calcula después del primer
// pintado; y mientras lo que se ve va atrás de las opciones elegidas, un "calculando…" callado lo dice.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dropData } from "../src/d2r/drops/data";
import DropsFarm from "../src/d2r/drops/DropsFarm";
import DropsWhat from "../src/d2r/drops/DropsWhat";
import { ISLAND_ID, islandText, parseIsland, readIsland } from "../src/d2r/drops/island";
import { dropsOf, NO_TZ, sourceKill, type DropLists } from "../src/d2r/drops/places";
import SourcePage from "../src/d2r/drops/SourcePage";
import { DEFAULT_STATE, type DropsState } from "../src/d2r/drops/state";
import { SEASON } from "../src/d2r/season";
import { D2R_COPY } from "../src/d2rCopy";
import { LangContext } from "../src/i18n";
import { parseRoute } from "../src/route";

// `useDeferredValue` en el servidor devuelve el mismo valor. Acá se le puede dar una función que diga qué copia atrasada devuelve
// cada llamada (`lag.of`), como pasa en el navegador mientras la cuenta nueva no llegó.
const lag = vi.hoisted(() => ({ of: undefined as ((v: unknown) => unknown) | undefined }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useDeferredValue: (v: unknown) => (lag.of ? lag.of(v) : v) };
});
afterEach(() => {
  lag.of = undefined;
  vi.unstubAllGlobals();
});

const es = D2R_COPY.es.drops;
const inEs = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang: "es", setLang: () => undefined } }, el));
const D = dropData();
const mephisto = D.sourceById.get("mephisto")!;
const ficha = () => inEs(createElement(SourcePage, { src: mephisto, route: parseRoute("/es/d2r/drops/mephisto"), navigate: () => undefined }));
/** Las listas de siempre de la ficha: Infierno, 300% de hallazgo mágico, 1 jugador. */
const fromEngine = (): DropLists => dropsOf(D, sourceKill(D, mephisto, 2, NO_TZ)!, { mf: 300, players: 1, party: 1, ladder: false, season: SEASON });
/** El texto de la isla que dejó el prerender, o null. */
const islandOf = (html: string) =>
  new RegExp(`<script type="application/json" id="${ISLAND_ID}" data-key="mephisto">([^<]*)</script>`).exec(html)?.[1] ?? null;
/** Lo que se ve de la ficha, sin la isla: las listas y los controles. */
const withoutIsland = (html: string) => html.replace(/<script type="application\/json"[^>]*>[^<]*<\/script>/, "");
/** Un `document` de mentira con la isla (o sin ella), y un `window` para que la ficha se sepa en el navegador. */
const browser = (island: { key: string; text: string } | null) => {
  vi.stubGlobal("window", { location: { search: "" } });
  vi.stubGlobal("document", {
    getElementById: (id: string) =>
      island && id === ISLAND_ID ? { getAttribute: (a: string) => (a === "data-key" ? island.key : null), textContent: island.text } : null,
  });
};
const cue = `<p class="d2-dr-busy">${es.calculating}</p>`;

describe("la isla de datos de la ficha de un jefe", () => {
  it("el prerender la escribe con las listas de siempre, y leída da exactamente las del motor", () => {
    const text = islandOf(ficha());
    expect(text).not.toBeNull();
    expect(parseIsland(text!)).toEqual(fromEngine());
  });

  it("va compacta y sin «<» (vive dentro de un <script>): runas por código, únicos y piezas por id", () => {
    const lists: DropLists = {
      runes: [{ target: { k: "b", code: "r30" }, p: 0.5 }],
      uniques: [{ target: { k: "u", id: "</script><b>" }, p: 1e-7 }],
      sets: [{ target: { k: "s", id: "tal-rashas-guardianship" }, p: 0.25 }],
    };
    const text = islandText(lists);
    expect(text).not.toContain("<");
    expect(text).toBe('{"r":[["r30",0.5]],"u":[["\\u003c/script>\\u003cb>",1e-7]],"s":[["tal-rashas-guardianship",0.25]]}');
    expect(parseIsland(text)).toEqual(lists);
    expect(parseIsland("no es JSON")).toBeNull();
    expect(parseIsland('{"r":1}')).toBeNull();
  });

  it("en el navegador la ficha arranca con la isla, sin recalcular: sale igual que el prerender y sin «calculando…»", () => {
    const server = ficha();
    browser({ key: "mephisto", text: islandOf(server)! });
    const client = ficha();
    // En el navegador la isla no se vuelve a escribir: el HTML del prerender ya no está después del primer render.
    expect(islandOf(client)).toBeNull();
    expect(client).toBe(withoutIsland(server));
    expect(client).not.toContain(es.calculating);
  });

  it("lo que dibuja es lo que dice la isla (no una cuenta nueva)", () => {
    browser({ key: "mephisto", text: '{"r":[["r30",0.5]],"u":[],"s":[]}' });
    const html = ficha();
    expect(html).toContain("<b>Runa Ber</b><small>1 en 2</small>");
    expect(html).not.toContain("Runa Cham");
  });

  it("una isla de otro jefe, o ninguna, no sirve: la cuenta va después del primer pintado y mientras tanto dice «calculando…»", () => {
    for (const island of [{ key: "baal", text: islandOf(ficha())! }, null]) {
      browser(island);
      const html = ficha();
      expect(html, JSON.stringify(island?.key)).toContain(cue);
      expect(html, JSON.stringify(island?.key)).not.toContain("Runa Ber");
    }
  });

  it("readIsland lee sólo la de ese jefe, y en el servidor no hay nada que leer", () => {
    expect(readIsland("mephisto")).toBeNull();
    browser({ key: "mephisto", text: '{"r":[],"u":[],"s":[]}' });
    expect(readIsland("mephisto")).toEqual({ runes: [], uniques: [], sets: [] });
    expect(readIsland("baal")).toBeNull();
  });
});

describe("«calculando…» mientras las listas van atrás de las opciones", () => {
  it("la ficha: con el hallazgo mágico recién cambiado, la lista vieja sigue y lo avisa", () => {
    // La copia atrasada del hallazgo mágico todavía es 250: lo elegido (300) no llegó a la lista.
    lag.of = (v) => (v === 300 ? 250 : v);
    expect(ficha()).toContain(cue);
    lag.of = undefined;
    expect(ficha()).not.toContain(es.calculating);
  });

  it("«¿Qué suelta?»: con las opciones nuevas todavía sin calcular, la lista es la de antes y lo avisa", () => {
    const st: DropsState = { ...DEFAULT_STATE, m: "drops", place: { k: "s", id: "mephisto" }, mf: 450 };
    const old: DropsState = { ...st, mf: 300 };
    lag.of = (v) => (v === st ? old : v);
    const html = inEs(createElement(DropsWhat, { st, set: () => undefined, route: parseRoute("/es/d2r/drops"), navigate: () => undefined }));
    expect(html).toContain(cue);
    expect(html).toContain("Runa Cham");
  });

  it("«¿Dónde lo farmeo?»: lo mismo con los jefes y las áreas", () => {
    const st: DropsState = { ...DEFAULT_STATE, item: { k: "u", id: "harlequin-crest" }, diff: 2, mf: 450 };
    const old: DropsState = { ...st, mf: 300 };
    lag.of = (v) => (v === st ? old : v);
    const html = inEs(createElement(DropsFarm, { st, set: () => undefined }));
    expect(html).toContain(cue);
    expect(html).toContain("Jefes y superúnicos");
    lag.of = undefined;
    expect(inEs(createElement(DropsFarm, { st, set: () => undefined }))).not.toContain(es.calculating);
  });

  it("«¿Dónde lo farmeo?»: el primer ítem elegido, mientras se calcula, también lo avisa", () => {
    const st: DropsState = { ...DEFAULT_STATE, item: { k: "u", id: "harlequin-crest" } };
    lag.of = (v) => (v === st ? DEFAULT_STATE : v);
    const html = inEs(createElement(DropsFarm, { st, set: () => undefined }));
    expect(html).toContain("Probá con");
    expect(html).toContain(cue);
  });
});

describe("«¿Qué suelta?» abierto desde un enlace", () => {
  const route = parseRoute("/es/d2r/drops");
  const what = (st: Partial<DropsState>) =>
    inEs(createElement(DropsWhat, { st: { ...DEFAULT_STATE, m: "drops" as const, ...st }, set: () => undefined, route, navigate: () => undefined }));

  it("en el navegador no calcula en el primer render: muestra el lugar elegido y «calculando…», y la lista llega después del pintado", () => {
    vi.stubGlobal("window", { location: { search: "" } });
    for (const place of [{ k: "s" as const, id: "mephisto" }, { k: "a" as const, id: 74, cat: "normal" as const }]) {
      const html = what({ place });
      expect(html, JSON.stringify(place)).toContain(cue);
      expect(html, JSON.stringify(place)).not.toContain("Runas");
      expect(html, JSON.stringify(place)).toMatch(/<option value="[^"]+" selected="">/);
    }
    // Sin lugar no hay nada que calcular ni que avisar.
    expect(what({ place: null })).not.toContain(es.calculating);
  });

  it("en el prerender (sin `window`) calcula en el mismo render, como siempre", () => {
    const html = what({ place: { k: "s", id: "mephisto" } });
    expect(html).toContain("Runa Cham");
    expect(html).not.toContain(es.calculating);
  });
});

describe("el texto del aviso", () => {
  it("está en los dos idiomas", () => {
    expect(D2R_COPY.en.drops.calculating).toBe("calculating…");
    expect(D2R_COPY.es.drops.calculating).toBe("calculando…");
  });
});
