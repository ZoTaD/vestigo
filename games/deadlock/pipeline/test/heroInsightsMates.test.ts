import { describe, expect, it } from "vitest";
import { buildInsights, matesOf, MIN_MATE, type SynergyRow } from "../src/heroInsights";

const fila = (a: number, b: number, n: number, w: number): SynergyRow => ({ hero_id1: a, hero_id2: b, matches_played: n, wins: w });

describe("compañeros de línea", () => {
  it("cada par cuenta para los dos, de mejor a peor", () => {
    const m = matesOf([fila(1, 2, MIN_MATE, 120), fila(1, 3, MIN_MATE, 80)], [1, 2, 3]);
    expect(m.get(1)).toEqual([
      [2, MIN_MATE, 120],
      [3, MIN_MATE, 80],
    ]);
    expect(m.get(2)).toEqual([[1, MIN_MATE, 120]]);
  });

  it("deja afuera poca muestra y héroes que no se publican", () => {
    const m = matesOf([fila(1, 2, MIN_MATE - 1, 150), fila(1, 99, 900, 500)], [1, 2]);
    expect(m.size).toBe(0);
  });

  it("buildInsights los guarda en cada héroe", () => {
    const m = matesOf([fila(1, 2, 300, 170)], [1, 2, 3]);
    const f = buildInsights("phantom-above", [1, 2, 3], { from: "a", to: "b" }, [], [], [], [], "", undefined, m);
    expect(f.heroes["2"].mates).toEqual([[1, 300, 170]]);
    expect(f.heroes["3"].mates).toBeUndefined();
  });
});

describe("dúos para la tier list", () => {
  it("guarda cada par una vez, el id menor primero, con piso bajo", async () => {
    const { duosOf, MIN_DUO_RAW } = await import("../src/heroInsights");
    const d = duosOf([fila(5, 2, MIN_DUO_RAW, 12), fila(1, 3, MIN_DUO_RAW - 1, 9), fila(2, 99, 500, 250)], [1, 2, 3, 5]);
    expect(d).toEqual([[2, 5, MIN_DUO_RAW, 12]]);
  });
});
