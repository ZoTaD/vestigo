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
    expect(RUST_SECTION_ES).toEqual({ items: "objetos", raid: "raideo" });
  });

  it("una pestaña que todavía no se publicó (o que no existe) muestra la portada", () => {
    expect(routePath(parseRoute("/es/rust/objetos"))).toBe("/es/rust");
    expect(routePath(parseRoute("/en/rust/no-existe"))).toBe("/en/rust");
  });

  it("las fichas llevan el slug de su idioma", () => {
    registerRustSlugs({ items: { "assault-rifle": "fusil-de-asalto" } });
    const ak = { ...parseRoute("/es/rust"), rsSection: "items" as const, detail: "assault-rifle" };
    expect(routePath(ak)).toBe("/es/rust/objetos/fusil-de-asalto");
    expect(routePath({ ...ak, lang: "en" })).toBe("/en/rust/items/assault-rifle");
  });
});
