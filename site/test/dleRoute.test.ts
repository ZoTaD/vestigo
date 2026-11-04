import { describe, expect, it } from "vitest";
import { DEADLOCK_SECTIONS, parseRoute, routePath } from "../src/route";
import { dleMode } from "../src/dle/modes";

describe("las direcciones del Deadlockdle", () => {
  it("son una pestaña de Deadlock, después de Parches", () => {
    expect(DEADLOCK_SECTIONS.indexOf("dle")).toBe(DEADLOCK_SECTIONS.indexOf("patches") + 1);
  });

  it("leen el modo del detalle y vuelven a la misma dirección", () => {
    for (const path of ["/en/deadlock/dle", "/en/deadlock/dle/items", "/en/deadlock/dle/abilities", "/en/deadlock/dle/ranking", "/es/deadlock/dle"]) {
      const route = parseRoute(path);
      expect(route).toMatchObject({ view: "deadlock", dlSection: "dle" });
      expect(routePath(route)).toBe(path);
    }
    expect(parseRoute("/en/deadlock/dle/items")).toMatchObject({ detail: "items" });
  });

  it("sin modo o con uno que no existe es Heroes", () => {
    expect(dleMode(undefined)).toBe("heroes");
    expect(dleMode("items")).toBe("items");
    expect(dleMode("ranking")).toBe("ranking");
    expect(dleMode("cualquiera")).toBe("heroes");
  });
});
