/**
 * La pestaña Lector de partida de Stardew Valley (etapa 3, tarea 5): la dirección, la caja para elegir el archivo (lo
 * que sale en el prerender), los avisos del archivo equivocado, la partida leída con sus cinco cajas, lo que se guarda en
 * el navegador y el paso de lo hecho al checklist del Centro Comunitario. Las pantallas se dibujan sin navegador, como
 * el prerender; la partida es la mínima escrita a mano (`fixtures/stardew-save-mini.xml`).
 */
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LangContext } from "../src/i18n";
import { parseRoute, routePath, type Route } from "../src/route";
import { STARDEW_COPY } from "../src/stardewCopy";
import { readDone } from "../src/stardew/bundles/progress";
import { loadSaveBundle, type SaveBundle } from "../src/stardew/data";
import { parseSave, type Save } from "../src/stardew/save/parse";
import StardewSave, { SavePicker, SaveView } from "../src/stardew/save/StardewSave";
import { checklistFromSave, forgetSave, isOldVersion, readStoredSave, storeSave, syncChecklist } from "../src/stardew/save/store";

const parser = new DOMParser({ onError: () => {} }) as unknown as { parseFromString(s: string, type: string): Document };
const mini = readFileSync(new URL("./fixtures/stardew-save-mini.xml", import.meta.url), "utf8");
const leer = (xml = mini): Save => {
  const s = parseSave(xml, parser);
  if ("error" in s) throw new Error(`no se leyó: ${s.error}`);
  return s;
};

const route = (lang: "en" | "es") => ({ lang, view: "stardew", sdSection: "save" }) as Route;
const nav = () => undefined;
const inLang = (lang: "en" | "es", el: ReactElement) => renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, el));

/** Un `localStorage` de mentira, para cada test que lo necesite. */
function fakeStorage(): Record<string, string> {
  const store: Record<string, string> = {};
  const fake = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => void (store[k] = v),
    removeItem: (k: string) => void delete store[k],
  };
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true });
  return store;
}
const original = globalThis.localStorage;
afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: original, configurable: true });
});

describe("la dirección del Lector de partida", () => {
  it("es save en inglés y partida en español, sin fichas", () => {
    expect(routePath(route("en"))).toBe("/en/stardew-valley/save");
    expect(routePath(route("es"))).toBe("/es/stardew-valley/partida");
    expect(parseRoute("/es/stardew-valley/partida")).toMatchObject({ view: "stardew", sdSection: "save", lang: "es" });
    expect(parseRoute("/en/stardew-valley/save/algo").detail).toBeUndefined();
  });

  it("va al final de la barra", () => {
    // La barra se arma con STARDEW_TABS en stardewCopy.ts.
    expect(STARDEW_COPY.en.tabs.save).toBe("Save reader");
    expect(STARDEW_COPY.es.tabs.save).toBe("Lector de partida");
  });
});

describe("sin partida (lo que sale en el prerender)", () => {
  it("la caja para soltar o elegir el archivo, dónde está y que no se sube", () => {
    const html = inLang("en", createElement(StardewSave, { route: route("en"), navigate: nav })).replaceAll("<wbr/>", "");
    expect(html).toContain('type="file"');
    expect(html).toContain("Drop your save file here");
    expect(html).toContain("%AppData%\\");
    expect(html).toContain("~/.config/");
    expect(html).toContain("isn&#x27;t uploaded anywhere");
    expect(html).not.toContain("sd-loading");
    const es = inLang("es", createElement(StardewSave, { route: route("es"), navigate: nav }));
    expect(es).toContain("Soltá acá el archivo de tu partida");
    expect(es).toContain("no se sube a ningún lado");
  });

  it("la carpeta de Windows se puede cortar después de cada separador, no en cualquier lado", () => {
    const html = inLang("en", createElement(SavePicker, { onFile: () => undefined }));
    expect(html).toContain("StardewValley\\<wbr/>");
  });
});

describe("el archivo equivocado", () => {
  it("SaveGameInfo (raíz <Farmer>) da el aviso en la misma caja, sin romper", () => {
    const r = parseSave('<?xml version="1.0"?><Farmer><name>Fulana</name></Farmer>', parser);
    expect(r).toEqual({ error: "save-info" });
    const html = inLang("en", createElement(SavePicker, { error: "save-info", onFile: () => undefined }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("That&#x27;s SaveGameInfo");
    expect(html).toContain('type="file"');
  });

  it("un archivo que no es XML o no es una partida también avisa", () => {
    expect(parseSave("hola", parser)).toEqual({ error: "not-xml" });
    expect(parseSave("<Otra/>", parser)).toEqual({ error: "not-save" });
    for (const error of ["not-xml", "not-save", "read"] as const) {
      const html = inLang("es", createElement(SavePicker, { error, onFile: () => undefined }));
      expect(html).toContain(STARDEW_COPY.es.save.errors[error]);
    }
  });

  it("una partida de antes de la 1.6 se lee igual, con el aviso de la perfección", () => {
    expect(isOldVersion("1.5.6")).toBe(true);
    expect(isOldVersion("1.4")).toBe(true);
    expect(isOldVersion("<1.3")).toBe(true);
    expect(isOldVersion("1.6.15")).toBe(false);
    expect(isOldVersion("1.6")).toBe(false);
  });
});

describe("la partida leída", () => {
  let data: SaveBundle;
  beforeAll(async () => {
    data = await loadSaveBundle("en");
  });
  const view = (save: Save, lang: "en" | "es" = "en") => inLang(lang, createElement(SaveView, { save, data, route: route(lang), navigate: nav }));

  it("muestra las cinco cajas: Hoy, Perfección, Regalos, Centro Comunitario y lo que falta", () => {
    const html = view(leer());
    for (const id of ["sd-sv-today-h", "sd-sv-perf-h", "sd-sv-gifts-h", "sd-sv-cc-h", "sd-sv-missing-h"]) expect(html).toContain(`id="${id}"`);
    expect(html).toContain("Los Sauces Farm");
    expect(html).toContain("Summer 26, year 2");
  });

  it("con dos granjeros, los botones para elegir de quién se mira (el anfitrión primero)", () => {
    const s = leer();
    expect(s.players.length).toBeGreaterThan(1);
    const html = view(s);
    expect(html).toContain(`${s.players[0].name} (host)`);
    expect(html).toContain(`>${s.players[1].name}<`);
  });

  it("la perfección: la cifra y una fila por parte, sin lo que falta hasta abrirla", () => {
    const html = view(leer());
    expect(html.match(/data-part="/g)?.length).toBe(11);
    expect(html).toContain("Produce &amp; Forage Shipped");
    expect(html).not.toContain("sd-sv-pmore");
  });

  it("regalos: Penny cumple el 2 de otoño, a 4 días, con lo que le encanta", () => {
    const html = view(leer());
    expect(html).toContain("/en/stardew-valley/villagers/penny");
    expect(html).toContain("Fall 2 · In 4 days");
  });

  it("Centro Comunitario: el paquete a medias con lo que le falta y el botón del checklist", () => {
    const html = view(leer());
    expect(html).toContain("Copy what&#x27;s done to the checklist");
    expect(html).toContain("Spring Foraging");
    expect(html).toContain("3 more items");
  });

  it("con la ruta Joja lo dice y no muestra paquetes faltantes; con el Centro terminado, todo hecho", () => {
    const joja = view({ ...leer(), joja: true });
    expect(joja).toContain("You joined Joja");
    expect(joja).not.toContain("sd-sv-bundle");
    expect(joja).not.toContain("Copy what&#x27;s done");
    const done = view({ ...leer(), ccComplete: true }, "es");
    expect(done).toContain("El Centro Comunitario está restaurado");
    expect(done).not.toContain("sd-sv-bundle");
  });

  it("los peces y las recetas que faltan, con los de la estación primero", () => {
    const html = view(leer());
    expect(html).toContain("Fish and recipes left");
    expect(html).toContain("You can get these now");
  });

  it("una partida de la 1.5 avisa que la perfección puede no coincidir", () => {
    expect(view({ ...leer(), version: "1.5.6" })).toContain("This save is from version 1.5.6");
    expect(view(leer())).not.toContain("This save is from version");
  });
});

describe("lo que se guarda en el navegador", () => {
  it("sólo la partida leída, no el XML; se lee de vuelta y se olvida", () => {
    const store = fakeStorage();
    const s = leer();
    storeSave(s);
    const raw = store["sdv-save-v1"];
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("<SaveGame");
    expect(raw).not.toContain("<?xml");
    expect(readStoredSave()).toEqual(s);
    forgetSave();
    expect(readStoredSave()).toBeNull();
  });

  it("lo guardado roto o de otra forma no se usa", () => {
    const store = fakeStorage();
    store["sdv-save-v1"] = "no es json";
    expect(readStoredSave()).toBeNull();
    store["sdv-save-v1"] = JSON.stringify({ v: 1, save: { farm: 3 } });
    expect(readStoredSave()).toBeNull();
    store["sdv-save-v1"] = JSON.stringify({ v: 2, save: leer() });
    expect(readStoredSave()).toBeNull();
  });

  it("sin localStorage (bloqueado) nada tira", () => {
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new Error("bloqueado");
      },
      configurable: true,
    });
    expect(readStoredSave()).toBeNull();
    expect(() => storeSave(leer())).not.toThrow();
    expect(() => forgetSave()).not.toThrow();
  });
});

describe("pasar lo hecho al checklist del Centro Comunitario", () => {
  let data: SaveBundle;
  beforeAll(async () => {
    data = await loadSaveBundle("en");
  });

  it("un paquete terminado tilda todo su paquete del checklist; uno a medias, lo entregado por objeto", () => {
    const s = leer();
    // Spring Foraging en su índice de verdad (13), con el primer objeto (16) entregado.
    s.bundles.defs = [
      { room: "Pantry", index: 0, name: "Spring Crops", items: [["24", 1, 0], ["188", 1, 0], ["192", 1, 0]], need: 3 },
      { room: "Crafts Room", index: 13, name: "Spring Foraging", items: [["16", 1, 0], ["18", 1, 0], ["20", 1, 0], ["22", 1, 0]], need: 4 },
    ];
    s.bundles.done = { 0: [true, true, true], 13: [true, false, false, false] };
    const done = checklistFromSave(s, data.rooms);
    // bundles.json tiene cuatro objetos en Spring Crops: terminado en la partida, tilda los cuatro.
    expect(Object.keys(done).filter((k) => k.startsWith("Pantry/0:")).sort()).toEqual(["Pantry/0:0", "Pantry/0:1", "Pantry/0:2", "Pantry/0:3"]);
    expect(Object.keys(done).filter((k) => k.startsWith("Crafts Room/13:"))).toEqual(["Crafts Room/13:0"]);
  });

  it("un objeto remezclado que el checklist no tiene se saltea; con Joja no pasa nada", () => {
    const s = leer();
    s.bundles.defs = [{ room: "Crafts Room", index: 13, name: "Spring Foraging", items: [["9999", 1, 0], ["18", 1, 0]], need: 2 }];
    s.bundles.done = { 13: [true, true, false] };
    // Los dos entregados alcanzan lo que pide: terminado.
    expect(Object.keys(checklistFromSave(s, data.rooms))).toHaveLength(4);
    s.bundles.done = { 13: [true, false] };
    expect(checklistFromSave(s, data.rooms)).toEqual({});
    expect(checklistFromSave({ ...s, joja: true }, data.rooms)).toEqual({});
  });

  it("con el Centro terminado tilda todo, y no destilda lo que ya estaba", () => {
    const store = fakeStorage();
    store["sdv-cc-v1"] = JSON.stringify({ "Vault/23:0": true });
    const s = leer();
    s.bundles.defs = [{ room: "Pantry", index: 0, name: "Spring Crops", items: [["24", 1, 0]], need: 1 }];
    s.bundles.done = { 0: [true] };
    expect(syncChecklist(s, data.rooms)).toBe(4);
    expect(readDone()).toMatchObject({ "Vault/23:0": true, "Pantry/0:3": true });
    expect(syncChecklist(s, data.rooms)).toBe(0);
    const all = checklistFromSave({ ...s, ccComplete: true }, data.rooms);
    const slots = data.rooms.reduce((n, r) => n + r.bundles.reduce((m, b) => m + b.items.length, 0), 0);
    expect(Object.keys(all)).toHaveLength(slots);
  });
});
