import { describe, expect, it } from "vitest";
import { bestPicks, decodeTeam, draftMargin, encodeTeam, parts, reasons, sigma, tablesOf } from "../src/deadlockDraft";
import type { HeroInsightsFile } from "../src/deadlockHeroKitData";

// Los mismos héroes que `games/deadlock/pipeline/test/draftModel.test.ts`.
const vacio = { daily: [], perMatch: {} };
const t = tablesOf(
  [
    { heroId: 1, winRate: 0.55 },
    { heroId: 2, winRate: 0.5 },
    { heroId: 3, winRate: 0.45 },
  ],
  {
    heroes: {
      "1": { ...vacio, vs: [[2, 998, 698]], with: [] },
      "2": { ...vacio, vs: [[1, 998, 300]], with: [[3, 198, 119]] },
      "3": { ...vacio, vs: [], with: [[2, 198, 119]] },
    },
  } as unknown as HeroInsightsFile
);

describe("Armador de equipo", () => {
  it("el margen es la cuenta del pipeline", () => {
    // s(1 | vs 2,3) = L1 + (vs(1,2) − L1); s(2 | con 3, vs 1) = L2 + (vs(2,1) − L2) + ½(with(2,3) − L2)…
    const lg = (p: number) => Math.log(p / (1 - p));
    const L1 = lg(0.55), L2 = lg(0.5), L3 = lg(0.45);
    const v12 = lg(699 / 1000), v21 = lg(301 / 1000), w23 = lg(120 / 200);
    const esperado = v12 - (v21 + 0.5 * (w23 - L2) + L3 + 0.5 * (w23 - L3));
    expect(draftMargin(t, [1], [2, 3], 1, 0.5)).toBeCloseTo(esperado, 9);
    expect(L1).toBeGreaterThan(0);
  });

  it("las razones juntan los dos lados de un cruce", () => {
    const rs = reasons(parts(t, [1], [2], 1, 0.5), 0.1);
    const cruces = rs.filter((r) => r.kind === "counter");
    expect(cruces).toHaveLength(1);
    expect(cruces[0].heroes).toEqual([1, 2]);
    expect(cruces[0].pp).toBeGreaterThan(0);
  });

  it("el mejor próximo héroe es el que más sube la chance", () => {
    const [mejor] = bestPicks(t, [1, 2, 3], [], [2], 0.1, 1, 0.5);
    expect(mejor.hero).toBe(1);
    expect(mejor.p).toBeCloseTo(sigma(0.1 * draftMargin(t, [1], [2], 1, 0.5)), 9);
  });

  it("los equipos van y vuelven por la URL", () => {
    const validos = new Set([1, 2, 3, 15]);
    expect(encodeTeam([1, null, 15, null, null, null])).toBe("1,-,15");
    expect(encodeTeam([null, null, null, null, null, null])).toBe("");
    expect(decodeTeam("1,-,15", validos)).toEqual([1, null, 15, null, null, null]);
    // Un héroe que no existe o repetido no entra.
    expect(decodeTeam("1,1,99,2,3,15,2", validos)).toEqual([1, null, null, 2, 3, 15]);
  });
});
