import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import index from "@zomboid/index.json";
import server from "@zomboid/server.json";

/**
 * Los datos de la pestaña Servidor de Project Zomboid (2026-10-01), los que escribe `games/zomboid/tools/server.py`:
 * las opciones de sandbox y del .ini, los presets y los cortes de agua y luz. Se prueba con el archivo real: si un
 * parche trae un default fuera de su rango o una hoja que no existe, salta acá antes de que la página lo muestre.
 */
type Loc = { en: string; es: string };
type Value = number | boolean | string;
type Opt = {
  key: string; type: "enum" | "int" | "double" | "bool" | "string" | "text"; default: Value;
  min?: number; max?: number; values?: Loc[]; n?: number; page: string;
};
type Data = {
  version: number;
  baseline: string;
  pages: { id: string; name: Loc }[];
  options: Opt[];
  presets: { id: string; file: string; name: Loc; desc: Loc; values: Record<string, Value> }[];
  iniPages: { id: string; name: Loc }[];
  ini: Opt[];
  shutoff: { water: [number, number][]; elec: [number, number][]; never: number };
};
const DATA = server as unknown as Data;

/** Que `v` sea un valor válido de la opción: su tipo y, si tiene, su rango (los enum van de 1 a la cantidad). */
function fits(o: Opt, v: Value): boolean {
  switch (o.type) {
    case "bool":
      return typeof v === "boolean";
    case "string":
    case "text":
      return typeof v === "string";
    case "enum": {
      const n = o.values?.length ?? o.n ?? 0;
      return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= n;
    }
    case "int":
    case "double":
      return typeof v === "number" && (o.type === "double" || Number.isInteger(v))
        && v >= (o.min as number) && v <= (o.max as number);
  }
}

describe("los datos del servidor de Project Zomboid", () => {
  it("cada default de sandbox y del .ini cae en su tipo y su rango", () => {
    for (const o of [...DATA.options, ...DATA.ini]) expect(fits(o, o.default), `${o.key} = ${o.default}`).toBe(true);
  });

  it("cada valor de un preset es de una opción que existe y cae en su tipo y su rango", () => {
    const byKey = new Map(DATA.options.map((o) => [o.key, o]));
    for (const p of DATA.presets) {
      for (const [k, v] of Object.entries(p.values)) {
        const o = byKey.get(k);
        expect(o, `${p.id}: ${k}`).toBeDefined();
        expect(fits(o as Opt, v), `${p.id}: ${k} = ${v}`).toBe(true);
        expect(v, `${p.id}: ${k} es igual al default y no tendría que estar`).not.toBe((o as Opt).default);
      }
    }
  });

  it("cada opción va en una hoja que existe, y las hojas en orden", () => {
    for (const [opts, pages] of [[DATA.options, DATA.pages], [DATA.ini, DATA.iniPages]] as const) {
      const order = pages.map((p) => p.id);
      expect(new Set(order).size).toBe(order.length);
      const seen = opts.map((o) => order.indexOf(o.page));
      expect(seen.every((i) => i >= 0)).toBe(true);
      expect(seen).toEqual([...seen].sort((a, b) => a - b));
      for (const id of order) expect(seen.includes(order.indexOf(id)), `hoja vacía: ${id}`).toBe(true);
    }
  });

  it("el primer preset es Apocalipsis, el que el juego trae elegido", () => {
    expect(DATA.presets[0].id).toBe("apocalypse");
    expect(DATA.presets.map((p) => p.id)).toEqual(["apocalypse", "outbreak", "extinction", "rising", "six-months-later"]);
  });

  it("cada preset trae lo que carga el juego (Apocalipsis ⊕ archivo) y el default efectivo es Apocalipsis", () => {
    expect(DATA.baseline).toBe("apocalypse");
    expect(DATA.presets.map((p) => Object.keys(p.values).length)).toEqual([45, 88, 78, 70, 61]);
    const six = DATA.presets[4].values;
    // Speed: el archivo la trae con el valor de Java, así que en Seis meses no se guarda (en Apocalipsis sí)
    expect(six["ZombieRespawn"]).toBe(4);
    expect(six["FoodLootNew"]).toBe(0.8);
    expect("ZombieLore.Speed" in six).toBe(false);
    expect("ZombieLore.Speed" in DATA.presets[0].values).toBe(true);
  });

  it("los cortes traen las 9 opciones de agua y de luz", () => {
    expect(DATA.shutoff.water).toHaveLength(9);
    expect(DATA.shutoff.elec).toHaveLength(9);
    expect(DATA.shutoff.water[8]).toEqual([DATA.shutoff.never, DATA.shutoff.never]);
  });

  it("pesa menos de 45 KB con gzip", () => {
    expect(gzipSync(JSON.stringify(server)).length).toBeLessThan(45 * 1024);
  });

  it("el índice trae las dos subpáginas del servidor", () => {
    const entries = (index as { sec: string; id: string; en: string; es: string }[]).filter((e) => e.sec === "server");
    expect(entries.map((e) => e.id)).toEqual(["sandbox-presets", "water-and-power-shutoff"]);
    expect(entries.map((e) => e.es)).toEqual(["Presets de sandbox", "Cortes de agua y luz"]);
  });
});
