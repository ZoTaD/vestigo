/**
 * La pestaña Isla Jengibre de Stardew Valley (etapa 4, tarea 8): las cuentas de las 130 nueces con lo tildado (una fila
 * suma su `n`, las de caída limitada pueden quedar a medias), lo que se trae de la partida, lo guardado en el navegador
 * (viejo, roto o sin acceso), la vista en la dirección y las cuatro vistas dibujadas en los dos idiomas.
 */
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import raw from "../../games/stardew/data/island.json";
import { LangContext } from "../src/i18n";
import { parseRoute, routePath, STARDEW_PUBLISHED, type Route } from "../src/route";
import { STARDEW_TABS } from "../src/stardewCopy";
import { readMarks, writeDone, type Marks } from "../src/stardew/checklist";
import { loadIsland } from "../src/stardew/data";
import { IslandBook } from "../src/stardew/island/StardewIsland";
import {
  isGenericNut,
  ISLAND_KEY,
  mergeMarks,
  nutCount,
  nutGot,
  nutsFromSave,
  readIslandView,
  saveSync,
  shownOrders,
  toggleNut,
  upgradesDone,
  upgradesInOrder,
  viewOfAnchor,
  writeIslandView,
  type IslandData,
  type IslandView,
} from "../src/stardew/island/state";
import { parseSave, type Save } from "../src/stardew/save/parse";

const data = raw as unknown as IslandData;
beforeAll(() => loadIsland());
const nut = (key: string) => data.nuts.find((n) => n.key === key)!;
const route = (lang: "en" | "es") => ({ lang, view: "stardew", sdSection: "island" }) as Route;
const inLang = (lang: "en" | "es", el: ReactElement) => renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, el));
type Saved = { nuts: Record<string, number>; walnuts: number; mail: string[] };
const book = (initial: IslandView, lang: "en" | "es" = "en", done: Marks = {}, saved: Saved | null = null) =>
  inLang(lang, createElement(IslandBook, { data, route: route(lang), navigate: () => undefined, initial, initialDone: done, initialSaved: saved }));
/** El texto del elemento con ese `id` (con lo que tenga adentro, hasta su cierre). */
const row = (html: string, id: string) => {
  const at = html.indexOf(`id="${id}"`);
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  const tag = /^<(\w+)/.exec(html.slice(start))![1];
  const tags = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  tags.lastIndex = start;
  let depth = 0;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  throw new Error(`sin cierre: ${id}`);
};
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

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

const parser = new DOMParser({ onError: () => {} }) as unknown as { parseFromString(s: string, type: string): Document };
const mini = (): Save => {
  const s = parseSave(readFileSync(new URL("./fixtures/stardew-save-mini.xml", import.meta.url), "utf8"), parser);
  if ("error" in s) throw new Error(s.error);
  return s;
};

describe("las cuentas de las nueces", () => {
  it("sin nada: 0 de 130, y byArea suma 130", () => {
    const c = nutCount(data, {});
    expect(c.found).toBe(0);
    expect(c.total).toBe(130);
    expect(Object.values(c.byArea).reduce((n, [, t]) => n + t, 0)).toBe(130);
    expect(Object.keys(c.byArea)).toEqual(data.areas.map((a) => a.key));
  });

  it("tildar Darts suma 3 (una fila cuenta su n, no 1)", () => {
    const c = nutCount(data, toggleNut({}, nut("Darts")));
    expect(c.found).toBe(3);
    expect(c.byArea[nut("Darts").area][0]).toBe(3);
  });

  it("todo tildado: 130 de 130, y cada zona completa", () => {
    const all: Marks = Object.fromEntries(data.nuts.map((n) => [n.key, true]));
    const c = nutCount(data, all);
    expect(c.found).toBe(130);
    expect(Object.values(c.byArea).every(([f, t]) => f === t)).toBe(true);
  });

  it("una fila a medias cuenta lo que dice, hasta su n; tildarla la completa y otra vez la destilda", () => {
    const barril = nut("VolcanoBarrel");
    expect(nutGot(barril, { VolcanoBarrel: 2 })).toBe(2);
    expect(nutGot(barril, { VolcanoBarrel: 9999 })).toBe(5);
    expect(nutGot(barril, { VolcanoBarrel: -3 })).toBe(0);
    expect(toggleNut({ VolcanoBarrel: 2 }, barril)).toEqual({ VolcanoBarrel: true });
    expect(toggleNut({ VolcanoBarrel: true }, barril)).toEqual({});
  });

  it("con la partida mínima: dos de collectedNutTracker y el barril con 2 son 3 filas (4 nueces), y el barril queda a medias", () => {
    const marks = nutsFromSave(mini().nuts, data);
    expect(marks).toEqual({ Bush_IslandNorth_13_33: true, TreeNut: true, VolcanoBarrel: 2 });
    expect(Object.keys(marks)).toHaveLength(3);
    // Las dos de collectedNutTracker dan 1 cada una; el barril, las 2 que lleva de 5.
    expect(nutCount(data, marks).found).toBe(4);
    expect(nutGot(nut("VolcanoBarrel"), marks)).toBe(2);
  });

  it("de la partida: el coco dorado, el esqueleto (6 de una clave) y el loro dorado (9999) completan su fila", () => {
    const marks = nutsFromSave({ GoldenCoconut: 1, IslandCenterSkeletonRestored: 1, Darts: 9999, Nada: 4 }, data);
    expect(marks).toEqual({ GoldenCoconut: true, IslandCenterSkeletonRestored: true, Darts: true });
    expect(nutCount(data, marks).found).toBe(1 + 6 + 3);
  });

  it("con el loro dorado (130 encontradas) se marcan todas, también Birdie y el coco, que el loro no anota", () => {
    const marks = nutsFromSave({ Darts: 9999 }, data, 130);
    expect(nutCount(data, marks).found).toBe(130);
    expect(marks.Birdie).toBe(true);
    expect(marks.GoldenCoconut).toBe(true);
  });

  it("una partida guardada antes de las nueces (nuts vacío y walnuts > 0) no se trae: hay que volver a abrirla", () => {
    expect(saveSync(null)).toBe("none");
    expect(saveSync({ nuts: {}, walnuts: 17, mail: [] })).toBe("stale");
    expect(saveSync({ nuts: {}, walnuts: 0, mail: [] })).toBe("ok");
    expect(saveSync({ nuts: { TreeNut: 1 }, walnuts: 17, mail: [] })).toBe("ok");
    for (const lang of ["en", "es"] as const) {
      const html = book("nuts", lang, {}, { nuts: {}, walnuts: 17, mail: [] });
      expect(html).not.toContain("sd-btn");
      expect(plain(html)).toContain(lang === "es" ? "Volvé a abrir tu partida en el Lector" : "Open your save in the Save reader again");
    }
    expect(book("nuts", "es", {}, { nuts: { TreeNut: 1 }, walnuts: 17, mail: [] })).toContain("Traer de mi partida");
  });

  it("traer de la partida no baja lo que ya estaba tildado a mano", () => {
    expect(mergeMarks({ VolcanoBarrel: true, Darts: 1 }, { VolcanoBarrel: 2, Darts: 2, TreeNut: true })).toEqual({ VolcanoBarrel: true, Darts: 2, TreeNut: true });
  });

  it("claves viejas, JSON roto o acceso bloqueado: la lista anda y no cuenta de más", () => {
    const store = fakeStorage();
    store[ISLAND_KEY] = JSON.stringify({ Darts: true, VolcanoBarrel: 2, Nada: true, TreeNut: false, Mermaid: "5", Birdie: 2.5 });
    const marks = readMarks(ISLAND_KEY);
    // Lo que no es una marca se descarta; la clave que ya no es una fila se guarda, pero no cuenta.
    expect(marks).toEqual({ Darts: true, VolcanoBarrel: 2, Nada: true });
    expect(nutCount(data, marks).found).toBe(5);
    store[ISLAND_KEY] = "{roto";
    expect(readMarks(ISLAND_KEY)).toEqual({});
    writeDone(ISLAND_KEY, { VolcanoBarrel: 2 });
    expect(store[ISLAND_KEY]).toBe('{"VolcanoBarrel":2}');
    Object.defineProperty(globalThis, "localStorage", { get() { throw new Error("bloqueado"); }, configurable: true });
    expect(readMarks(ISLAND_KEY)).toEqual({});
  });

  it("las ~30 nueces de frase genérica (arbusto o enterrada con casilla) se reconocen por su marca", () => {
    const gen = data.nuts.filter(isGenericNut);
    expect(isGenericNut({ ...nut("Bush_IslandNorth_13_33"), generic: true })).toBe(true);
    expect(gen.length).toBe(26);
    expect(gen.every((n) => n.tile && n.n === 1)).toBe(true);
    expect(isGenericNut(nut("Bush_IslandNorth_13_33"))).toBe(false);
  });
});

describe("mejoras, pedidos y la dirección", () => {
  it("las mejoras van en el orden en que se desbloquean; con la partida, las hechas por su carta", () => {
    const order = upgradesInOrder(data).map((u) => u.key);
    expect(order).toHaveLength(11);
    expect(order.slice(0, 2)).toEqual(["Hut", "Turtle"]);
    expect(order.at(-1)).toBe("Obelisk");
    // Ninguna antes de lo que pide.
    for (const u of data.upgrades) for (const n of u.needs) expect(order.indexOf(n), `${n} antes de ${u.key}`).toBeLessThan(order.indexOf(u.key));
    expect(order.indexOf("House")).toBeLessThan(order.indexOf("House_Mailbox"));
    expect([...upgradesDone(["Island_FirstParrot", "Island_Turtle", "otra"], data)].sort()).toEqual(["Hut", "Turtle"]);
  });

  it("los pedidos de Qi que el juego no ofrece no se muestran", () => {
    const keys = shownOrders(data).map((q) => q.key);
    expect(keys).not.toContain("QiChallenge");
    expect(keys).not.toContain("QiChallenge11");
    expect(keys).toHaveLength(10);
  });

  it("island en inglés, isla-jengibre en español, publicada, en la barra después del Centro Comunitario", () => {
    expect(routePath(route("en"))).toBe("/en/stardew-valley/island");
    expect(routePath(route("es"))).toBe("/es/stardew-valley/isla-jengibre");
    expect(parseRoute("/es/stardew-valley/isla-jengibre")).toMatchObject({ view: "stardew", sdSection: "island" });
    expect(STARDEW_PUBLISHED).toContain("island");
    expect(STARDEW_TABS.indexOf("island")).toBe(STARDEW_TABS.indexOf("bundles") + 1);
    expect(STARDEW_TABS.indexOf("save")).toBe(STARDEW_TABS.indexOf("island") + 1);
  });

  it("la vista viaja en ?v=; las Nueces van sin nada; un ancla sin ?v= abre su vista", () => {
    expect(readIslandView("?v=upgrades")).toBe("upgrades");
    expect(readIslandView("?v=walnut-room")).toBe("walnut-room");
    expect(readIslandView("?v=qi")).toBe("qi");
    expect(readIslandView("?v=otra")).toBe("nuts");
    expect(writeIslandView("nuts")).toBe("");
    expect(writeIslandView("qi")).toBe("?v=qi");
    expect(viewOfAnchor(data, "darts")).toBe("nuts");
    expect(viewOfAnchor(data, "north")).toBe("nuts");
    expect(viewOfAnchor(data, "turtle")).toBe("upgrades");
    expect(viewOfAnchor(data, "f2400")).toBe("walnut-room");
    expect(viewOfAnchor(data, "qichallenge2")).toBe("qi");
    expect(viewOfAnchor(data, "nada")).toBeNull();
  });

  it("ninguna ancla se repite entre filas y zonas", () => {
    const all = [...data.areas.map((a) => a.key.toLowerCase()), ...data.nuts.map((n) => n.slug), ...data.upgrades.map((u) => u.slug), ...data.walnutRoom.map((w) => w.slug), ...data.qiOrders.map((q) => q.slug)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("las vistas dibujadas", () => {
  it("las Nueces: la cifra grande, una fila tildable por nuez con su id y lo que da", () => {
    const html = book("nuts");
    expect(plain(html)).toContain("0 of 130");
    for (const n of data.nuts) expect(html).toContain(`id="${n.slug}"`);
    const dardos = row(html, "darts");
    expect(dardos).toContain('aria-pressed="false"');
    expect(plain(dardos)).toContain("Beat the pirate at darts");
    expect(plain(dardos)).toMatch(/×\s*3/);
    // Las de frase genérica dicen su casilla.
    expect(plain(row(html, "bush-islandnorth-4-42"))).toContain("4, 42");
    // Una zona por caja, con su cuenta.
    expect(plain(row(html, "volcano"))).toContain("0 / 19");
  });

  it("lo tildado se marca y suma; la fila a medias dice cuánto lleva", () => {
    const html = book("nuts", "es", { Darts: true, VolcanoBarrel: 2 });
    expect(plain(html)).toContain("5 de 130");
    // En español, el nombre del juego: nuez de oro.
    expect(plain(html)).toContain("Nueces de oro encontradas");
    expect(plain(html)).not.toMatch(/nuez dorada|nueces doradas/i);
    expect(row(html, "darts")).toContain('aria-pressed="true"');
    const barril = row(html, "volcanobarrel");
    expect(barril).toContain('aria-pressed="mixed"');
    expect(barril).not.toContain("title=");
    expect(plain(barril)).toMatch(/2\s*\/\s*5/);
    expect(plain(barril)).toContain("2 de 5 nueces");
    expect(plain(row(book("nuts", "en", { VolcanoBarrel: 2 }), "volcanobarrel"))).toContain("2 of 5 walnuts");
    expect(plain(barril)).toContain("Rompé barriles");
  });

  it("las Mejoras: cada una con su precio en nueces y lo que pide antes", () => {
    const html = book("upgrades", "es");
    const puente = plain(row(html, "volcanobridge"));
    expect(puente).toContain("Construir puente");
    expect(puente).toContain("5");
    expect(puente).toContain("Despertar tortuga");
    expect(puente).toContain("Además, llegar a la cima del Volcán.");
  });

  it("el Walnut Room: precio en gemas, la gema por una nuez, y lo que no tiene ficha con su dibujo y sin enlace", () => {
    const html = book("walnut-room");
    const cama = row(html, "f2514");
    expect(cama).toMatch(/<img[^>]*src="\/stardew\/rewards\/f-2514.png"[^>]*width="48" height="64"[^>]*loading="lazy" decoding="async"/);
    expect(cama).not.toContain("<a ");
    expect(plain(cama)).toContain("Exotic Double Bed");
    expect(plain(cama)).toContain("50");
    expect(row(html, "townkey")).toContain('src="/stardew/rewards/key-to-the-town.png"');
    expect(row(html, "h82")).toContain('src="/stardew/rewards/h-82.png"');
    expect(row(html, "o911")).toContain('href="/en/stardew-valley/items/horse-flute"');
    expect(plain(row(html, "o858"))).toMatch(/1\s*Golden Walnut/);
    expect(plain(row(html, "bc264-recipe"))).toContain("Recipe");
    expect(html).not.toMatch(/\(F\)|\(BC\)|\(H\)/);
  });

  it("los Pedidos de Qi: objetivo, días y gemas; sin los que no están en el juego", () => {
    const html = book("qi", "es");
    expect(html).not.toContain('id="qichallenge"');
    expect(html).not.toContain('id="qichallenge11"');
    expect(plain(html)).not.toContain("Cinco Plagas");
    const cultivo = plain(row(html, "qichallenge2"));
    expect(cultivo).toContain("El cultivo de Qi");
    expect(cultivo).toContain("28");
    expect(cultivo).toContain("100");
  });

  it("sin huecos ni claves del juego, y dentro del presupuesto", () => {
    for (const lang of ["en", "es"] as const)
      for (const v of ["nuts", "upgrades", "walnut-room", "qi"] as const) {
        const html = book(v, lang);
        expect(plain(html)).not.toMatch(/\{\d?\}|\[[A-Za-z]|undefined|NaN/);
        expect((html.match(/<[a-z][^>]*>/g) ?? []).length).toBeLessThan(2000);
        expect((html.match(/<img /g) ?? []).length).toBeLessThanOrEqual(100);
      }
  });
});
