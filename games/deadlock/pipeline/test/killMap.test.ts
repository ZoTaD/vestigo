import { describe, expect, it } from "vitest";
import { BOUND, SIZE, buildKillMap, cellOf, quantize } from "../src/killMap";

describe("mapa de calor", () => {
  it("arriba a la izquierda es la celda 0 y el equipo 1 se gira", () => {
    expect(cellOf(-BOUND, BOUND - 1, false)).toBe(0);
    // Girado 180°, la esquina de arriba a la izquierda cae abajo a la derecha.
    expect(cellOf(-BOUND, BOUND - 1, true)).toBe(SIZE * SIZE - 1);
    expect(cellOf(BOUND * 2, 0, false)).toBeNull();
  });

  it("una kill del equipo 1 y una del 0 en lugares opuestos caen en la misma celda", () => {
    const m = buildKillMap([
      { position_x: 3000, position_y: -5000, killer_team: 0, kills: 1, deaths: 0 },
      { position_x: -3000, position_y: 5000, killer_team: 1, kills: 1, deaths: 0 },
    ]);
    expect(m.totals.kills).toBe(2);
    expect([...m.kills].filter((v) => v > 0)).toEqual([255]);
  });

  it("una muerte usa el equipo contrario al que mata", () => {
    const m = buildKillMap([{ position_x: 3000, position_y: -5000, killer_team: 1, kills: 0, deaths: 1 }]);
    expect(m.deaths[cellOf(3000, -5000, false)!]).toBe(255);
  });

  it("cuantiza con raíz: un cuarto del máximo es la mitad", () => {
    const q = quantize(Float64Array.from([0, 25, 100]));
    expect([...q]).toEqual([0, 128, 255]);
  });
});
