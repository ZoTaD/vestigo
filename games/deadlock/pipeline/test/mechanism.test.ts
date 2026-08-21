import { describe, it, expect } from "vitest";
import {
  fitMechanism,
  predictWin,
  shrinkageToMechanism,
  shrinkToward,
} from "../src/mechanism";
import type { MatchedCell } from "../src/matching";

const cell = (p: Partial<MatchedCell>): MatchedCell => ({
  heroId: 1,
  itemId: 10,
  cost: 3200,
  n: 1000,
  win: 0,
  damage: 0,
  deaths: 0,
  economy: 0,
  damageControl: 1000,
  ...p,
});

describe("fitMechanism", () => {
  it("recupera los coeficientes de un mecanismo conocido", () => {
    // win = 0,01 + 0,1·(daño relativo) − 0,02·muertes + 0,000001·economía
    const cells: MatchedCell[] = [];
    for (let i = 0; i < 60; i++) {
      const rel = (i % 5) / 10; // 0 … 0,4
      const deaths = ((i % 3) - 1) / 2; // −0,5 … 0,5
      const economy = (i % 4) * 1000; // 0 … 3000
      cells.push(
        cell({
          damage: rel * 1000,
          deaths,
          economy,
          win: 0.01 + 0.1 * rel - 0.02 * deaths + 0.000001 * economy,
        })
      );
    }
    const fit = fitMechanism(cells);
    expect(fit.intercept).toBeCloseTo(0.01, 6);
    expect(fit.damage).toBeCloseTo(0.1, 6);
    expect(fit.deaths).toBeCloseTo(-0.02, 6);
    expect(fit.economy).toBeCloseTo(0.000001, 9);

    // Y lo que predice para una celda vuelve a dar lo que se midió.
    expect(predictWin(fit, cells[7])).toBeCloseTo(cells[7].win, 8);
  });

  it("devuelve un ajuste plano cuando no hay celdas suficientes", () => {
    const fit = fitMechanism([cell({ win: 0.05 })]);
    expect(fit).toEqual({ intercept: 0, damage: 0, deaths: 0, economy: 0 });
  });
});

describe("shrinkageToMechanism", () => {
  it("encoge todo lo posible cuando el residuo es puro ruido", () => {
    // Todas las celdas coinciden con lo que el mecanismo predice: no hay señal
    // propia que preservar, así que k es infinito.
    const fit = { intercept: 0, damage: 0, deaths: 0, economy: 0 };
    const cells = Array.from({ length: 50 }, () => cell({ win: 0, n: 100 }));
    expect(shrinkageToMechanism(cells, fit)).toBe(Number.POSITIVE_INFINITY);
  });

  it("da un k chico cuando los residuos son mucho más grandes que el ruido", () => {
    const fit = { intercept: 0, damage: 0, deaths: 0, economy: 0 };
    // Residuos de ±5 puntos con 100.000 compras cada una: casi todo es real.
    const cells = Array.from({ length: 50 }, (_, i) =>
      cell({ win: i % 2 === 0 ? 0.05 : -0.05, n: 100_000 })
    );
    const k = shrinkageToMechanism(cells, fit);
    // varianza real ≈ 0,0025 → k ≈ 0,25/0,0025 = 100
    expect(k).toBeGreaterThan(90);
    expect(k).toBeLessThan(110);
  });
});

describe("shrinkToward", () => {
  it("con k infinito devuelve el blanco", () => {
    expect(shrinkToward(0.2, 0.05, 1000, Number.POSITIVE_INFINITY)).toBe(0.05);
  });

  it("mezcla en proporción a la muestra", () => {
    // n = k → mitad y mitad.
    expect(shrinkToward(0.2, 0.0, 600, 600)).toBeCloseTo(0.1, 10);
  });

  it("con muestra enorme deja el valor casi intacto", () => {
    expect(shrinkToward(0.2, 0.0, 1_000_000, 600)).toBeCloseTo(0.2, 3);
  });
});
