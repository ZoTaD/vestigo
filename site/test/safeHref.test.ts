import { describe, expect, it } from "vitest";
import { safeHref } from "../src/safeHref";

/**
 * Los links que salen de datos de terceros (perfil de Steam, notas de parche)
 * sólo se dibujan si son `https:` (auditoría de seguridad, 2026-09-28).
 */
describe("safeHref", () => {
  it("deja pasar https", () => {
    expect(safeHref("https://steamcommunity.com/profiles/123/")).toBe("https://steamcommunity.com/profiles/123/");
  });

  it("descarta cualquier otro esquema y lo que no es una URL", () => {
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,x", "http://x.com", "/relativa", "", null, undefined]) {
      expect(safeHref(bad), String(bad)).toBeUndefined();
    }
  });
});
