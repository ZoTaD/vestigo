import { describe, expect, it } from "vitest";
import { bestColumns } from "./useMasonry";

describe("reparto en columnas", () => {
  it("el caso de la cuenta del top: Traits no se apila sobre la columna larga", () => {
    // Ficha, puestos, rango en el tiempo, próximo rango, rasgos, actividad.
    const h = [385, 145, 268, 185, 597, 310];
    const r = bestColumns(h, 3, 22);
    const alto = [0, 0, 0];
    h.forEach((x, i) => (alto[r[i]] += x + 22));
    expect(r[0]).toBe(0);
    expect(Math.max(...alto)).toBeLessThanOrEqual(720);
  });

  it("una columna deja todo en orden", () => {
    expect(bestColumns([10, 20, 30], 1, 0)).toEqual([0, 0, 0]);
  });
});
