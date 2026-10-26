import { describe, expect, it } from "vitest";
import { parseRoute, registerStardewSlugs, routePath, STARDEW_SECTION_ES, type Route } from "../src/route";

const base: Route = { lang: "en", view: "stardew", dlSection: "meta" };

describe("rutas de Stardew Valley", () => {
  it("lee y escribe las direcciones de Stardew en los dos idiomas", () => {
    expect(parseRoute("/en/stardew-valley")).toMatchObject({ view: "stardew", sdSection: "home" });
    expect(parseRoute("/es/stardew-valley/centro-comunitario")).toMatchObject({ view: "stardew", sdSection: "bundles" });
    expect(routePath({ lang: "es", view: "stardew", sdSection: "villagers", detail: "abigail" } as Route)).toBe("/es/stardew-valley/aldeanos/abigail");
  });

  it("una ficha en español con slug anotado", () => {
    registerStardewSlugs({ items: { "pink-cake": "pastel-rosa" } });
    expect(routePath({ lang: "es", view: "stardew", sdSection: "items", detail: "pink-cake" } as Route)).toBe("/es/stardew-valley/objetos/pastel-rosa");
    expect(parseRoute("/es/stardew-valley/objetos/pastel-rosa")).toMatchObject({ view: "stardew", sdSection: "items", detail: "pink-cake" });
    // En inglés la dirección lleva el slug inglés.
    expect(routePath({ ...base, sdSection: "items", detail: "pink-cake" })).toBe("/en/stardew-valley/items/pink-cake");
  });

  it("las pestañas se escriben en su idioma y se leen en los dos", () => {
    expect(STARDEW_SECTION_ES).toEqual({ items: "objetos", villagers: "aldeanos", bundles: "centro-comunitario", crops: "cultivos", fishing: "pesca", recipes: "recetas", calendar: "calendario", mines: "minas", save: "partida", predict: "predictor", farm: "granja", museum: "museo", quests: "misiones", island: "isla-jengibre", planner: "planificador" });
    // Las de la etapa 4 tienen dirección (las fichas de Objetos enlazan a sus filas) y página.
    expect(routePath({ ...base, lang: "es", sdSection: "island" })).toBe("/es/stardew-valley/isla-jengibre");
    expect(parseRoute("/es/stardew-valley/misiones")).toMatchObject({ view: "stardew", sdSection: "quests" });
    expect(parseRoute("/es/stardew-valley/museo")).toMatchObject({ view: "stardew", sdSection: "museum" });
    expect(parseRoute("/es/stardew-valley/granja")).toMatchObject({ view: "stardew", sdSection: "farm" });
    expect(routePath({ ...base, sdSection: "home" })).toBe("/en/stardew-valley");
    expect(routePath({ ...base, lang: "es", sdSection: "home" })).toBe("/es/stardew-valley");
    expect(routePath({ ...base, sdSection: "bundles" })).toBe("/en/stardew-valley/bundles");
    expect(parseRoute("/es/stardew-valley/items")).toMatchObject({ view: "stardew", sdSection: "items", lang: "es" });
    expect(parseRoute("/en/stardew-valley/aldeanos")).toMatchObject({ view: "stardew", sdSection: "villagers" });
  });

  it("una pestaña que no existe muestra la portada, y el Centro Comunitario no lleva ficha", () => {
    expect(parseRoute("/en/stardew-valley/nada")).toMatchObject({ view: "stardew", sdSection: "home" });
    expect(parseRoute("/en/stardew-valley/nada").detail).toBeUndefined();
    // Las Misiones son una sola página: lo que sigue no es una ficha.
    expect(parseRoute("/en/stardew-valley/quests")).toMatchObject({ view: "stardew", sdSection: "quests" });
    expect(parseRoute("/en/stardew-valley/quests/willy").detail).toBeUndefined();
    // El Museo ya tiene página, sin fichas.
    expect(parseRoute("/en/stardew-valley/museum")).toMatchObject({ view: "stardew", sdSection: "museum" });
    // Pesca es una sola página: lo que sigue no es una ficha.
    expect(parseRoute("/en/stardew-valley/fishing/carp").detail).toBeUndefined();
    expect(parseRoute("/en/stardew-valley/bundles/pantry").detail).toBeUndefined();
    // Minas y combate sí: el tercer segmento es la ficha de un monstruo.
    expect(parseRoute("/en/stardew-valley/mines/green-slime")).toMatchObject({ view: "stardew", sdSection: "mines", detail: "green-slime" });
    // `/stardew` es la carpeta de los sprites, no la sección.
    expect(parseRoute("/en/stardew")).toMatchObject({ view: "home" });
  });

  it("el Planificador es /planner y /planificador, sin ficha", () => {
    expect(routePath({ ...base, sdSection: "planner" })).toBe("/en/stardew-valley/planner");
    expect(routePath({ ...base, lang: "es", sdSection: "planner" })).toBe("/es/stardew-valley/planificador");
    expect(parseRoute("/es/stardew-valley/planificador")).toMatchObject({ view: "stardew", sdSection: "planner", lang: "es" });
    expect(parseRoute("/en/stardew-valley/planner/x").detail).toBeUndefined();
  });

  it("el Predictor es /predictor en los dos idiomas y no lleva ficha", () => {
    expect(routePath({ ...base, sdSection: "predict" })).toBe("/en/stardew-valley/predictor");
    expect(routePath({ ...base, lang: "es", sdSection: "predict" })).toBe("/es/stardew-valley/predictor");
    expect(parseRoute("/en/stardew-valley/predictor")).toMatchObject({ view: "stardew", sdSection: "predict", lang: "en" });
    expect(parseRoute("/es/stardew-valley/predictor")).toMatchObject({ view: "stardew", sdSection: "predict", lang: "es" });
    expect(parseRoute("/en/stardew-valley/predictor/geodes").detail).toBeUndefined();
  });
});
