import { describe, expect, it } from "vitest";
import { parseRoute, routePath } from "../src/route";

describe("rutas de CS2", () => {
  it("lee una ficha en español con el mismo slug que en inglés", () => {
    const r = parseRoute("/es/cs2/cajas/kilowatt-case");
    expect(r).toMatchObject({ lang: "es", view: "cs2", c2Section: "cases", detail: "kilowatt-case" });
    expect(routePath(r)).toBe("/es/cs2/cajas/kilowatt-case");
  });
  it("y en inglés", () => {
    const r = parseRoute("/en/cs2/cases/kilowatt-case");
    expect(r).toMatchObject({ lang: "en", view: "cs2", c2Section: "cases", detail: "kilowatt-case" });
    expect(routePath(r)).toBe("/en/cs2/cases/kilowatt-case");
  });
  it("cambia de idioma sin cambiar el slug", () => {
    expect(routePath({ ...parseRoute("/en/cs2/collections/the-kilowatt-collection"), lang: "es" })).toBe("/es/cs2/colecciones/the-kilowatt-collection");
  });
  it("una pestaña desconocida es la portada", () => {
    expect(parseRoute("/en/cs2/nada")).toMatchObject({ view: "cs2", c2Section: "home" });
    expect(routePath(parseRoute("/en/cs2"))).toBe("/en/cs2");
  });
});
