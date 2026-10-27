import { describe, expect, it } from "vitest";
import { parseRoute, registerWfSlugs, routePath, WF_SECTION_ES, type Route } from "../src/route";

describe("rutas de Warframe", () => {
  it("lee y escribe las direcciones de Warframe en los dos idiomas", () => {
    expect(parseRoute("/en/warframe")).toMatchObject({ view: "warframe", wfSection: "home" });
    expect(parseRoute("/es/warframe/donde-farmear")).toMatchObject({ view: "warframe", wfSection: "farming" });
    registerWfSlugs({ relics: { "lith-a1": "lith-a1" }, farming: { "neural-sensors": "sensores-neurales" } });
    expect(routePath({ lang: "es", view: "warframe", wfSection: "farming", detail: "neural-sensors" } as Route)).toBe("/es/warframe/donde-farmear/sensores-neurales");
    expect(parseRoute("/es/warframe/donde-farmear/sensores-neurales")).toMatchObject({ wfSection: "farming", detail: "neural-sensors" });
    expect(routePath({ lang: "en", view: "warframe", wfSection: "farming", detail: "neural-sensors" } as Route)).toBe("/en/warframe/farming/neural-sensors");
  });

  it("las pestañas se escriben en su idioma y se leen en los dos", () => {
    expect(WF_SECTION_ES).toEqual({ arsenal: "arsenal", relics: "reliquias", farming: "donde-farmear", mods: "mods" });
    expect(routePath({ lang: "es", view: "warframe", wfSection: "relics" } as Route)).toBe("/es/warframe/reliquias");
    expect(routePath({ lang: "en", view: "warframe", wfSection: "relics" } as Route)).toBe("/en/warframe/relics");
    expect(routePath({ lang: "en", view: "warframe", wfSection: "home" } as Route)).toBe("/en/warframe");
    expect(parseRoute("/en/warframe/reliquias")).toMatchObject({ wfSection: "relics" });
    expect(parseRoute("/es/warframe/relics/lith-a1")).toMatchObject({ wfSection: "relics", detail: "lith-a1" });
  });

  it("una pestaña que no existe muestra la portada", () => {
    expect(parseRoute("/en/warframe/nada")).toMatchObject({ view: "warframe", wfSection: "home" });
    expect(parseRoute("/en/warframe/nada").detail).toBeUndefined();
  });
});
