import { describe, expect, it } from "vitest";
import { forcedWipe, nextForcedWipe } from "../src/rust/wipe";

/**
 * El wipe forzado de Rust (2026-10-05): el primer jueves de cada mes, cuando Facepunch saca la actualización, a las
 * 14:00 de Nueva York. Por eso es 18:00 UTC con horario de verano allá y 19:00 UTC sin él.
 */
describe("el wipe forzado", () => {
  it("es el primer jueves del mes a las 14 de Nueva York", () => {
    expect(forcedWipe(2026, 9).toISOString()).toBe("2026-10-01T18:00:00.000Z"); // con horario de verano
    expect(forcedWipe(2026, 10).toISOString()).toBe("2026-11-05T19:00:00.000Z"); // el horario terminó el 1/11
    expect(forcedWipe(2026, 11).toISOString()).toBe("2026-12-03T19:00:00.000Z");
    expect(forcedWipe(2027, 0).toISOString()).toBe("2027-01-07T19:00:00.000Z");
  });

  it("el próximo es el de este mes si todavía no pasó, y si no el del que viene", () => {
    expect(nextForcedWipe(new Date("2026-10-05T12:00:00Z")).toISOString()).toBe("2026-11-05T19:00:00.000Z");
    expect(nextForcedWipe(new Date("2026-10-01T17:59:00Z")).toISOString()).toBe("2026-10-01T18:00:00.000Z");
    expect(nextForcedWipe(new Date("2026-10-01T18:00:01Z")).toISOString()).toBe("2026-11-05T19:00:00.000Z");
    expect(nextForcedWipe(new Date("2026-12-20T00:00:00Z")).toISOString()).toBe("2027-01-07T19:00:00.000Z");
  });
});
