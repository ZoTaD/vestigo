import { describe, it, expect } from "vitest";
import { DEADLOCK_PAGES, DEADLOCK_SECTIONS, parseRoute, routePath } from "../src/route";

/**
 * La tier list de Street Brawl (2026-09-24) tiene dirección propia pero no
 * pestaña: se entra desde el selector de modo de la Tier list.
 */
describe("la dirección de Street Brawl", () => {
  it("se parsea y se arma de vuelta igual", () => {
    const r = parseRoute("/es/deadlock/street-brawl");
    expect(r.view).toBe("deadlock");
    expect(r.dlSection).toBe("street-brawl");
    expect(r.detail).toBeUndefined();
    expect(routePath(r)).toBe("/es/deadlock/street-brawl");
  });

  it("no es un héroe llamado street-brawl", () => {
    expect(parseRoute("/en/deadlock/street-brawl").dlSection).not.toBe("meta");
  });

  it("va al sitemap pero no a la barra de pestañas", () => {
    expect(DEADLOCK_PAGES).toContain("street-brawl");
    expect(DEADLOCK_SECTIONS).not.toContain("street-brawl");
  });
});
