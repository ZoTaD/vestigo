/**
 * La pestaña Cultivos de Stardew Valley (etapa 2, tarea 4): la tabla que arma la calculadora, la dirección que guarda
 * los filtros y la pantalla dibujada sin navegador (como el prerender).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import data from "../../games/stardew/data/crops.json";
import { LangContext } from "../src/i18n";
import { parseRoute, routePath, type Route } from "../src/route";
import type { CropsData } from "../src/stardew/crops/calc";
import { CropCalc } from "../src/stardew/crops/StardewCrops";
import { cropTable, DEFAULT_STATE, noShopTable, readCropState, treeTable, wildTable, writeCropState, type CropState } from "../src/stardew/crops/state";

const all = data as CropsData;
const route = { lang: "en", view: "stardew", sdSection: "crops" } as Route;
const st = (x: Partial<CropState>): CropState => ({ ...DEFAULT_STATE, ...x });
const slugs = (s: CropState) => cropTable(all.crops, s, "en").map((r) => r.crop.slug);

/** La pantalla dibujada con un estado, y las filas de la tabla de cultivos en el orden en que salen. */
function screen(state: CropState, lang: "en" | "es" = "en") {
  const html = renderToStaticMarkup(
    createElement(LangContext.Provider, { value: { lang, setLang: () => undefined } }, createElement(CropCalc, { data: all, route: { ...route, lang }, navigate: () => undefined, initial: state })),
  );
  const rows = [...html.matchAll(/data-crop="([\w-]+)"/g)].map((m) => m[1]);
  const noShop = [...html.matchAll(/data-noshop="([\w-]+)"/g)].map((m) => m[1]);
  const wild = [...html.matchAll(/data-wild="([\w-]+)"/g)].map((m) => m[1]);
  /** La fila con el tinte de "la mejor". */
  const top = html.match(/<tr class="is-top" data-crop="([\w-]+)"/)?.[1];
  return { html, rows, noShop, wild, top };
}

describe("semillas silvestres", () => {
  it("nunca compiten en el ranking, con Compradas ni con Propias, y van en su caja", () => {
    for (const seeds of ["buy", "own"] as const) {
      expect(slugs(st({ seeds }))).not.toContain("wild-horseradish");
      expect(noShopTable(all.crops, st({ seeds }), "en").map((r) => r.crop.slug)).not.toContain("wild-horseradish");
      expect(wildTable(all.crops, st({ seeds }), "en").map((r) => r.crop.slug)).toEqual(["wild-horseradish"]);
    }
    expect(wildTable(all.crops, st({ season: 2 }), "en").map((r) => r.crop.slug)).toEqual(["common-mushroom"]);
  });

  it("en pantalla: su caja con el título y la línea que lo explica", () => {
    const { html, rows, wild } = screen(st({ seeds: "own" }), "es");
    expect(html).toContain("Semillas silvestres");
    expect(html).toContain("recolección al azar");
    expect(rows).not.toContain("wild-horseradish");
    expect(wild).toEqual(["wild-horseradish"]);
  });
});

describe("la mejor fila y las notas", () => {
  it("el tinte va a la de más oro por día aunque se ordene por otra columna", () => {
    const best = cropTable(all.crops, DEFAULT_STATE, "en")[0].crop.slug;
    expect(screen(DEFAULT_STATE).top).toBe(best);
    const byName = screen(st({ sort: { key: "name", dir: "asc" } }));
    expect(byName.rows[0]).not.toBe(best);
    expect(byName.top).toBe(best);
  });

  it("la nota de la Fresa y la de los frutales de la isla", () => {
    const { html } = screen(DEFAULT_STATE, "es");
    expect(html).toContain("13 de primavera");
    expect(html).toContain("Isla Jengibre");
    // Fuera de primavera no hay Fresa: tampoco su nota.
    expect(screen(st({ season: 1 }), "es").html).not.toContain("13 de primavera");
  });
});

describe("semillas que no se venden en tienda", () => {
  it("con Compradas salen del ranking y van aparte, con las cuentas de propias", () => {
    const ranked = slugs(DEFAULT_STATE);
    expect(ranked).not.toContain("ancient-fruit");
    expect(ranked).not.toContain("coffee-bean");
    for (const r of cropTable(all.crops, DEFAULT_STATE, "en")) expect(r.p.seedUnknown).toBe(false);
    const apart = noShopTable(all.crops, DEFAULT_STATE, "en");
    expect(apart.map((r) => r.crop.slug)).toContain("ancient-fruit");
    for (const r of apart) {
      expect(r.p.seedCost).toBe(0);
      expect(r.p.seedUnknown).toBe(false);
      expect(r.crop.seasons).toContain(0);
    }
  });

  it("con Propias compiten todos y no hay grupo aparte", () => {
    expect(slugs(st({ seeds: "own" }))).toContain("ancient-fruit");
    expect(noShopTable(all.crops, st({ seeds: "own" }), "en")).toEqual([]);
  });

  it("la Fresa, con precio del Festival del Huevo, compite y paga su semilla", () => {
    const fresa = cropTable(all.crops, DEFAULT_STATE, "en").find((r) => r.crop.slug === "strawberry")!;
    expect(fresa.crop.seedFestival).toBe(true);
    expect(fresa.p.seedCost).toBe(100);
  });

  it("en pantalla: el grupo aparte con su título, y el festival donde va el costo", () => {
    const { html, rows, noShop } = screen(DEFAULT_STATE, "es");
    expect(html).toContain("Sin semilla en tienda");
    expect(rows).not.toContain("ancient-fruit");
    expect(rows).toContain("strawberry");
    expect(noShop).toContain("ancient-fruit");
    expect(html).toContain("Festival del huevo");
    const own = screen(st({ seeds: "own" }));
    expect(own.html).not.toContain("Seeds not sold in shops");
    expect(own.rows).toContain("ancient-fruit");
    expect(own.noShop).toEqual([]);
    expect(screen(DEFAULT_STATE).html).toContain("Seeds not sold in shops");
  });
});

describe("tabla de cultivos", () => {
  it("por defecto es primavera día 1, sin fertilizante ni profesiones, lo mejor y semillas compradas", () => {
    expect(DEFAULT_STATE).toMatchObject({ season: 0, day: 1, level: 0, fert: "none", tiller: false, agriculturist: false, artisan: false, sell: "best", seeds: "buy", greenhouse: false });
    expect(DEFAULT_STATE.sort).toEqual({ key: "perDay", dir: "desc" });
  });

  it("los de otra estación no están; con los valores por defecto la primera fila es de primavera", () => {
    const rows = cropTable(all.crops, DEFAULT_STATE, "en");
    expect(rows.length).toBeGreaterThan(5);
    expect(rows[0].crop.seasons).toContain(0);
    expect(rows.map((r) => r.crop.slug)).not.toContain("melon");
    for (const r of rows) expect(r.crop.seasons).toContain(0);
  });

  it("ordena por oro por día, de mayor a menor", () => {
    const rows = cropTable(all.crops, DEFAULT_STATE, "en").filter((r) => r.p.harvests > 0);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].p.perDay).toBeGreaterThanOrEqual(rows[i].p.perDay);
  });

  it("al pasar a verano cambia el orden", () => {
    const spring = slugs(DEFAULT_STATE);
    const summer = slugs(st({ season: 1 }));
    expect(summer).not.toEqual(spring);
    expect(summer).toContain("melon");
    expect(summer).not.toContain("parsnip");
  });

  it("plantado tarde: el que no llega va al final, con 0 cosechas y pérdida, sin NaN", () => {
    const rows = cropTable(all.crops, st({ day: 24 }), "en");
    const parsnip = rows.findIndex((r) => r.crop.slug === "parsnip");
    const late = rows.findIndex((r) => r.p.harvests === 0);
    expect(late).toBeGreaterThan(-1);
    expect(rows[parsnip].p.harvests).toBe(1);
    const cauliflower = rows.find((r) => r.crop.slug === "cauliflower")!;
    expect(cauliflower.p.harvests).toBe(0);
    expect(cauliflower.p.net).toBeLessThan(0);
    expect(Number.isNaN(cauliflower.p.perDay)).toBe(false);
    // Todos los que no llegan, después de todos los que sí.
    for (let i = late; i < rows.length; i++) expect(rows[i].p.harvests).toBe(0);
  });

  it("se ordena por otra columna, y al revés", () => {
    const byName = cropTable(all.crops, st({ sort: { key: "name", dir: "asc" } }), "en").map((r) => r.crop.name[0]);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b, "en")));
    const gross = cropTable(all.crops, st({ sort: { key: "gross", dir: "asc" } }), "en").filter((r) => r.p.harvests > 0);
    for (let i = 1; i < gross.length; i++) expect(gross[i - 1].p.gross).toBeLessThanOrEqual(gross[i].p.gross);
  });

  it("en el invernadero entran los de todas las estaciones", () => {
    const rows = slugs(st({ greenhouse: true }));
    expect(rows).toContain("melon");
    expect(rows).toContain("parsnip");
    expect(rows).toContain("cranberries");
  });

  it("los frutales: 28 frutos por estación y el retoño aparte", () => {
    const trees = treeTable(all.fruitTrees, st({ sell: "raw" }), "en");
    expect(trees).toHaveLength(all.fruitTrees.length);
    const cherry = trees.find((r) => r.tree.slug === "cherry")!;
    expect(cherry.p.harvests).toBe(28);
    expect(cherry.p.gross).toBe(28 * 80);
    // El retoño cuesta 3.400 en Pierre (1.700 de los datos con su recargo ×2): se paga en 2 estaciones.
    expect(cherry.tree.saplingPrice).toBe(3400);
    expect(cherry.payback).toBe(2);
  });
});

describe("la dirección de la calculadora", () => {
  it("los valores por defecto no escriben nada", () => {
    expect(writeCropState(DEFAULT_STATE)).toBe("");
    expect(readCropState("")).toEqual(DEFAULT_STATE);
  });

  it("conserva los filtros y el orden", () => {
    const s = st({
      season: 2, day: 9, level: 7, fert: "deluxeSpeed", tiller: true, agriculturist: true, artisan: true,
      sell: "raw", seeds: "own", greenhouse: true, sort: { key: "gross", dir: "asc" },
    });
    const q = writeCropState(s);
    expect(q.startsWith("?")).toBe(true);
    expect(readCropState(q)).toEqual(s);
  });

  it("lo que no se conoce se ignora", () => {
    expect(readCropState("?season=7&day=40&level=-2&fert=magic&sort=nope&dir=up&sell=x")).toEqual(DEFAULT_STATE);
  });

  it("la pestaña se escribe en su idioma", () => {
    expect(routePath({ ...route, lang: "es" })).toBe("/es/stardew-valley/cultivos");
    expect(routePath(route)).toBe("/en/stardew-valley/crops");
    expect(parseRoute("/es/stardew-valley/cultivos")).toMatchObject({ view: "stardew", sdSection: "crops" });
  });
});

describe("pantalla de Cultivos", () => {
  it("con los valores por defecto la primera fila es de primavera y no hay cultivos de otra estación", () => {
    const { rows, html } = screen(DEFAULT_STATE);
    const first = all.crops.find((c) => c.slug === rows[0])!;
    expect(first.seasons).toContain(0);
    expect(rows).not.toContain("melon");
    expect(rows).not.toContain("pumpkin");
    // Los frutales van en su propia tabla.
    expect(html).toContain('data-tree="cherry"');
  });

  it("en verano cambia el orden", () => {
    expect(screen(st({ season: 1 })).rows).not.toEqual(screen(DEFAULT_STATE).rows);
  });

  it("el que no llega dice que no llega", () => {
    const { html } = screen(st({ season: 1, day: 20 }), "es");
    expect(html).toContain("No llega");
  });

  it("los enlaces van a la ficha del objeto", () => {
    const { html } = screen(DEFAULT_STATE);
    expect(html).toContain('href="/en/stardew-valley/items/parsnip"');
  });
});
