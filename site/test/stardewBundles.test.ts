import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { LangContext } from "../src/i18n";
import { loadBundles } from "../src/stardew/data";
import { BundleRooms } from "../src/stardew/bundles/StardewBundles";
import { bundleState, doneKey, inSeason, readDone, roomAnchor, roomState, toggle, writeDone } from "../src/stardew/bundles/progress";
import type { Route } from "../src/route";

describe("progreso del Centro Comunitario", () => {
  it("un paquete se completa con los requeridos, no con todos", () => {
    const b = { room: "Pantry", index: 1, need: 4, items: [["254", 1, 0], ["258", 1, 0], ["260", 1, 0], ["262", 1, 0], ["264", 1, 0]] };
    const done = { "Pantry/1:0": true, "Pantry/1:1": true, "Pantry/1:2": true, "Pantry/1:3": true } as const;
    expect(bundleState(b as any, done)).toEqual({ have: 4, need: 4, complete: true });
    expect(bundleState(b as any, { "Pantry/1:0": true })).toEqual({ have: 1, need: 4, complete: false });
  });

  it("sin localStorage no rompe", () => {
    const orig = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { get() { throw new Error("bloqueado"); }, configurable: true });
    expect(readDone()).toEqual({});
    expect(() => writeDone({ a: true })).not.toThrow();
    Object.defineProperty(globalThis, "localStorage", { value: orig, configurable: true });
  });

  it("guarda y lee lo tildado, y descarta lo que no es una marca", () => {
    const store: Record<string, string> = {};
    const fake = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) };
    const orig = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true });
    writeDone({ "Pantry/0:1": true });
    expect(store["sdv-cc-v1"]).toBe('{"Pantry/0:1":true}');
    expect(readDone()).toEqual({ "Pantry/0:1": true });
    store["sdv-cc-v1"] = '{"a":true,"b":false,"c":3}';
    expect(readDone()).toEqual({ a: true });
    store["sdv-cc-v1"] = "no es json";
    expect(readDone()).toEqual({});
    Object.defineProperty(globalThis, "localStorage", { value: orig, configurable: true });
  });

  it("tildar y destildar no tocan el original", () => {
    const a = {};
    const b = toggle(a, doneKey("Vault", 2, 0));
    expect(b).toEqual({ "Vault/2:0": true });
    expect(a).toEqual({});
    expect(toggle(b, "Vault/2:0")).toEqual({});
  });

  it("una sala cuenta los paquetes completos", () => {
    const room = {
      room: "Vault",
      bundles: [
        { index: 0, need: 1, items: [["-1", 2500, 0]] },
        { index: 1, need: 1, items: [["-1", 5000, 0]] },
      ],
    };
    expect(roomState(room as any, { "Vault/1:0": true })).toEqual({ done: 1, total: 2 });
  });

  it("el filtro de estación deja lo que no se sabe", () => {
    const seasons = { "24": [0], "256": [1, 2] };
    expect(inSeason(seasons, "24", 0)).toBe(true);
    expect(inSeason(seasons, "24", 1)).toBe(false);
    expect(inSeason(seasons, "186", 3)).toBe(true);
    expect(inSeason(seasons, "24", null)).toBe(true);
  });

  it("el ancla de una sala es su clave en minúsculas y con guiones", () => {
    expect(roomAnchor("Pantry")).toBe("pantry");
    expect(roomAnchor("Abandoned Joja Mart")).toBe("abandoned-joja-mart");
  });
});

describe("pantalla del Centro Comunitario", () => {
  const route = { lang: "en", view: "stardew", sdSection: "bundles" } as Route;
  it("dibuja todas las salas y los paquetes destildados", async () => {
    const rooms = await loadBundles();
    const html = renderToStaticMarkup(createElement(LangContext.Provider, { value: { lang: "en", setLang: () => undefined } }, createElement(BundleRooms, { rooms, route, navigate: () => {} })));
    for (const r of rooms) expect(html).toContain(`id="${roomAnchor(r.room)}"`);
    expect(html).toContain("0 of 6 bundles");
    expect(html).not.toContain("sd-tickable is-on");
    expect(html).not.toContain("sd-check");
  });
});
