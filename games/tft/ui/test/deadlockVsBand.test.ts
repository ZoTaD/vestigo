import { describe, it, expect } from "vitest";
import { bandRangeOf, compare, percentileOf, type MetricDist } from "../src/deadlockVsBand";

const dist: MetricDist = {
  avg: 1140,
  std: 180,
  percentile1: 742,
  percentile5: 854,
  percentile10: 907,
  percentile25: 1022,
  percentile50: 1130,
  percentile75: 1249,
  percentile90: 1380,
  percentile95: 1436,
  percentile99: 1587,
};

describe("percentileOf", () => {
  it("cae en los puntos publicados exactos", () => {
    expect(percentileOf(1130, dist)).toBe(50);
    expect(percentileOf(1249, dist)).toBe(75);
    expect(percentileOf(742, dist)).toBe(1);
  });

  it("interpola entre dos puntos", () => {
    // A mitad de camino entre p50 (1130) y p75 (1249) → 62,5 → 63.
    expect(percentileOf(1189.5, dist)).toBe(63);
  });

  it("no se sale de 1..99 por arriba ni por abajo", () => {
    expect(percentileOf(0, dist)).toBe(1);
    expect(percentileOf(99999, dist)).toBe(99);
  });

  // Las muertes: menos es mejor, así que estar en el p25 de muertes es
  // "mejor que el 75 %", no que el 25.
  it("invierte cuando menos es mejor", () => {
    expect(percentileOf(1022, dist, true)).toBe(75);
    expect(percentileOf(1380, dist, true)).toBe(10);
  });
});

describe("bandRangeOf", () => {
  it("traduce un badge a su banda y al rango de badges de la sala", () => {
    // Emisario 3 = 53 → ritualist-emissary, rangos 5 y 6 → 51..66.
    expect(bandRangeOf(53)).toEqual({ band: "ritualist-emissary", min: 51, max: 66 });
    // Eterno 1 = 111 → phantom-above, rangos 9-11 → 91..116.
    expect(bandRangeOf(111)).toEqual({ band: "phantom-above", min: 91, max: 116 });
  });

  it("la banda de abajo arranca en 1, no en 0: el 0 es sin rango", () => {
    expect(bandRangeOf(12)?.min).toBe(1);
  });

  it("sin rango no hay banda", () => {
    expect(bandRangeOf(0)).toBeNull();
  });
});

describe("compare", () => {
  it("arma una fila por métrica presente en las dos fuentes, en el orden fijo", () => {
    const mine = { net_worth_per_min: { ...dist, avg: 1189.5 }, deaths: { ...dist, avg: 1022 } };
    const band = { net_worth_per_min: dist, deaths: dist, kda: dist };
    const rows = compare(mine, band);
    expect(rows.map((r) => r.key)).toEqual(["net_worth_per_min", "deaths"]);
    expect(rows[0].percentile).toBe(63);
    expect(rows[0].median).toBe(1130);
    expect(rows[1].percentile).toBe(75);
    expect(rows[1].lowerIsBetter).toBe(true);
  });
});
