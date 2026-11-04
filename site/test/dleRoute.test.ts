import { describe, expect, it } from "vitest";
import { DEADLOCK_PAGES, DEADLOCK_SECTIONS, parseRoute, routePath } from "../src/route";
import { dleMode } from "../src/dle/modes";

describe("las direcciones del Deadlockdle", () => {
  it("no es una pestaña de la barra de Deadlock: va arriba, al lado del juego, pero tiene página", () => {
    expect(DEADLOCK_SECTIONS).not.toContain("dle");
    expect(DEADLOCK_PAGES).toContain("dle");
    expect(parseRoute("/en/deadlock/dle")).toMatchObject({ dlSection: "dle" });
  });

  it("leen el modo del detalle y vuelven a la misma dirección", () => {
    for (const path of ["/en/deadlock/dle", "/en/deadlock/dle/items", "/en/deadlock/dle/abilities", "/es/deadlock/dle"]) {
      const route = parseRoute(path);
      expect(route).toMatchObject({ view: "deadlock", dlSection: "dle" });
      expect(routePath(route)).toBe(path);
    }
    expect(parseRoute("/en/deadlock/dle/items")).toMatchObject({ detail: "items" });
  });

  it("sin modo o con uno que no existe es Heroes", () => {
    expect(dleMode(undefined)).toBe("heroes");
    expect(dleMode("items")).toBe("items");
    // El ranking está en construcción (ZoTaD, 4/11): hasta que haya jugadores de verdad, su dirección abre Heroes.
    expect(dleMode("ranking")).toBe("heroes");
    expect(dleMode("cualquiera")).toBe("heroes");
  });
});
