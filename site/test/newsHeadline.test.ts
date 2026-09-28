import { describe, expect, it } from "vitest";
import { NEWS_COPY, headlineLines } from "../src/newsCopy";

/**
 * El titular de Vestigo News va en dos líneas y el CSS lo achica según la más
 * larga, porque **las palabras no se cortan nunca** (ZoTaD, 2026-09-28). Si el
 * reparto dejara una línea larga y otra corta, el titular saldría chico sin
 * necesidad; si partiera una palabra, rompería la regla.
 */
describe("headlineLines", () => {
  it("reparte en las dos líneas más parejas", () => {
    expect(headlineLines("Thanks Yoshi")).toEqual(["Thanks", "Yoshi"]);
    expect(headlineLines("Valve afila el hacha")).toEqual(["Valve afila", "el hacha"]);
    expect(headlineLines("El gran reequilibrio")).toEqual(["El gran", "reequilibrio"]);
  });

  it("una sola palabra queda en una línea", () => {
    expect(headlineLines("Reequilibrio")).toEqual(["Reequilibrio"]);
  });

  it("nunca parte una palabra ni pierde ninguna, en todos los bancos", () => {
    for (const copy of Object.values(NEWS_COPY)) {
      for (const h of Object.values(copy.headlines).flat()) {
        const lines = headlineLines(h);
        expect(lines.length).toBeLessThanOrEqual(2);
        expect(lines.join(" ")).toBe(h);
        const words = new Set(h.split(" "));
        for (const w of lines.flatMap((l) => l.split(" "))) expect(words.has(w)).toBe(true);
      }
    }
  });
});
