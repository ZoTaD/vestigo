import { describe, it, expect } from "vitest";
import { parseRoute, routePath, VALHEIM_TABS } from "../src/route";

/** Las tres formas de dirección de Valheim (2026-09-24): portada, pestaña y ficha. */
describe("las direcciones de Valheim", () => {
  it("portada", () => {
    const r = parseRoute("/es/valheim");
    expect(r.view).toBe("valheim");
    expect(r.vhSection).toBe("home");
    expect(routePath(r)).toBe("/es/valheim");
  });

  it("pestaña", () => {
    const r = parseRoute("/en/valheim/meads");
    expect(r.vhSection).toBe("meads");
    expect(r.detail).toBeUndefined();
    expect(routePath(r)).toBe("/en/valheim/meads");
  });

  it("ficha", () => {
    const r = parseRoute("/es/valheim/bosses/eikthyr");
    expect(r.vhSection).toBe("bosses");
    expect(r.detail).toBe("eikthyr");
    expect(routePath(r)).toBe("/es/valheim/bosses/eikthyr");
  });

  it("la Crónica y una edición", () => {
    const r = parseRoute("/es/valheim/patches/1-0-15");
    expect(r.vhSection).toBe("patches");
    expect(r.detail).toBe("1-0-15");
    expect(routePath(r)).toBe("/es/valheim/patches/1-0-15");
    expect(routePath(parseRoute("/en/valheim/patches"))).toBe("/en/valheim/patches");
  });

  it("el Planificador y su hoja de ruta (2026-09-25)", () => {
    const r = parseRoute("/es/valheim/planner");
    expect(r.vhSection).toBe("planner");
    expect(r.detail).toBeUndefined();
    expect(routePath(r)).toBe("/es/valheim/planner");
    const h = parseRoute("/en/valheim/planner/route");
    expect(h.detail).toBe("route");
    expect(routePath(h)).toBe("/en/valheim/planner/route");
    expect(parseRoute("/es/valheim/planner/otra").detail).toBeUndefined();
  });

  it("una pestaña que no existe cae en la portada", () => {
    expect(parseRoute("/es/valheim/dragones").vhSection).toBe("home");
  });

  it("tiene las once pestañas en orden (Lugares desde el 2026-09-24)", () => {
    expect(VALHEIM_TABS).toEqual(["foods", "meads", "weapons", "armor", "tools", "building", "materials", "creatures", "biomes", "places", "bosses"]);
  });
});
