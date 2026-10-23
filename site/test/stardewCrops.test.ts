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
import { cropTable, DEFAULT_STATE, readCropState, treeTable, writeCropState, type CropState } from "../src/stardew/crops/state";

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
  return { html, rows };
}

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
    expect(cherry.payback).toBe(Math.ceil(1700 / (28 * 80)));
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

  it("una semilla sin precio fijo lleva la marca en vez del costo, y el que no llega dice que no llega", () => {
    const { html } = screen(st({ season: 1, day: 20 }), "es");
    expect(html).toContain("sd-seedmark");
    expect(html).toContain("No llega");
  });

  it("los enlaces van a la ficha del objeto", () => {
    const { html } = screen(DEFAULT_STATE);
    expect(html).toContain('href="/en/stardew-valley/items/parsnip"');
  });
});
