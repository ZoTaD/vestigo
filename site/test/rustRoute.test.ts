import { describe, expect, it } from "vitest";
import { parseRoute, registerRustSlugs, routePath, RUST_SECTION_ES, RUST_SECTIONS } from "../src/route";

/** Rust (2026-10-05): la portada, las pestañas y las fichas, en los dos idiomas. */
describe("las direcciones de Rust", () => {
  it("la portada es /rust en los dos idiomas", () => {
    for (const lang of ["en", "es"] as const) {
      const r = parseRoute(`/${lang}/rust`);
      expect(r).toMatchObject({ lang, view: "rust", rsSection: "home" });
      expect(routePath(r)).toBe(`/${lang}/rust`);
    }
  });

  it("cada pestaña tiene su nombre en inglés y en español", () => {
    for (const tab of RUST_SECTIONS) {
      expect(routePath({ ...parseRoute("/en/rust"), rsSection: tab })).toBe(`/en/rust/${tab}`);
      expect(routePath({ ...parseRoute("/es/rust"), rsSection: tab })).toBe(`/es/rust/${RUST_SECTION_ES[tab]}`);
    }
    expect(RUST_SECTION_ES).toMatchObject({ items: "objetos", raid: "raideo", farming: "granjas" });
  });

  it("Objetos y Raideo están publicadas; lo que no existe muestra la portada", () => {
    expect(routePath(parseRoute("/es/rust/objetos"))).toBe("/es/rust/objetos");
    expect(routePath(parseRoute("/es/rust/raideo"))).toBe("/es/rust/raideo");
    expect(routePath(parseRoute("/en/rust/raid"))).toBe("/en/rust/raid");
    expect(routePath(parseRoute("/en/rust/no-existe"))).toBe("/en/rust");
  });

  it("las fichas llevan el slug de su idioma", () => {
    registerRustSlugs({ items: { "assault-rifle": "fusil-de-asalto" } });
    const ak = { ...parseRoute("/es/rust"), rsSection: "items" as const, detail: "assault-rifle" };
    expect(routePath(ak)).toBe("/es/rust/objetos/fusil-de-asalto");
    expect(routePath({ ...ak, lang: "en" })).toBe("/en/rust/items/assault-rifle");
  });

  it("parseRoute lee la ficha en los dos idiomas y con el slug del otro idioma", () => {
    registerRustSlugs({ items: { "assault-rifle": "fusil-de-asalto" } });
    expect(parseRoute("/es/rust/objetos/fusil-de-asalto")).toMatchObject({ lang: "es", view: "rust", rsSection: "items", detail: "assault-rifle" });
    expect(parseRoute("/en/rust/items/assault-rifle")).toMatchObject({ lang: "en", rsSection: "items", detail: "assault-rifle" });
    // El slug se traduce en los dos idiomas: un link en inglés con el slug español abre la misma ficha.
    expect(parseRoute("/en/rust/items/fusil-de-asalto").detail).toBe("assault-rifle");
    expect(parseRoute("/es/rust/items/assault-rifle")).toMatchObject({ rsSection: "items", detail: "assault-rifle" });
  });

  it("Granjas: la lista, la genética y cada planta en los dos idiomas (2026-10-09)", () => {
    registerRustSlugs({ farming: { genetics: "genetica", hemp: "canamo" } });
    expect(parseRoute("/es/rust/granjas")).toMatchObject({ view: "rust", rsSection: "farming", detail: undefined });
    expect(parseRoute("/en/rust/farming/genetics")).toMatchObject({ rsSection: "farming", detail: "genetics" });
    expect(parseRoute("/es/rust/granjas/genetica")).toMatchObject({ rsSection: "farming", detail: "genetics" });
    expect(routePath(parseRoute("/en/rust/farming/genetics"))).toBe("/en/rust/farming/genetics");
    expect(routePath({ ...parseRoute("/en/rust/farming/hemp"), lang: "es" })).toBe("/es/rust/granjas/canamo");
  });
});
