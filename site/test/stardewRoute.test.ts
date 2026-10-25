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
    expect(STARDEW_SECTION_ES).toEqual({ items: "objetos", villagers: "aldeanos", bundles: "centro-comunitario", crops: "cultivos", fishing: "pesca", recipes: "recetas", calendar: "calendario", mines: "minas", save: "partida", farm: "granja", museum: "museo", quests: "misiones", island: "isla-jengibre" });
    // Las de la etapa 4 ya tienen dirección (las fichas de Objetos enlazan a sus filas), aunque las que no tienen página
    // todavía caigan en la portada. Granja y Museo ya tienen la suya.
    expect(routePath({ ...base, lang: "es", sdSection: "island" })).toBe("/es/stardew-valley/isla-jengibre");
    expect(parseRoute("/es/stardew-valley/misiones")).toMatchObject({ view: "stardew", sdSection: "home" });
    expect(parseRoute("/es/stardew-valley/museo")).toMatchObject({ view: "stardew", sdSection: "museum" });
    expect(parseRoute("/es/stardew-valley/granja")).toMatchObject({ view: "stardew", sdSection: "farm" });
    expect(routePath({ ...base, sdSection: "home" })).toBe("/en/stardew-valley");
    expect(routePath({ ...base, lang: "es", sdSection: "home" })).toBe("/es/stardew-valley");
    expect(routePath({ ...base, sdSection: "bundles" })).toBe("/en/stardew-valley/bundles");
    expect(parseRoute("/es/stardew-valley/items")).toMatchObject({ view: "stardew", sdSection: "items", lang: "es" });
    expect(parseRoute("/en/stardew-valley/aldeanos")).toMatchObject({ view: "stardew", sdSection: "villagers" });
  });

  it("una pestaña que no existe muestra la portada, y el Centro Comunitario no lleva ficha", () => {
    expect(parseRoute("/en/stardew-valley/quests")).toMatchObject({ view: "stardew", sdSection: "home" });
    expect(parseRoute("/en/stardew-valley/quests").detail).toBeUndefined();
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
});
