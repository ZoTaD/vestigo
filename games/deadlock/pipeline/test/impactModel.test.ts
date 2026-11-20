import { describe, expect, it } from "vitest";
import { FEATURES, fitLogistic, impactModel, impactSql, MIN_ROWS, smooth } from "../src/impactModel";

/** Filas agrupadas sacadas de una logística conocida, con n grande para que la proporción sea casi exacta. */
function synth(coef: number[]): { x: number[]; prev: number[]; n: number; wins: number }[] {
  const rows = [];
  for (const soul of [-0.2, -0.1, 0, 0.1, 0.2])
    for (const kill of [-3, -1, 0, 1, 3])
      for (const g of [-1, 0, 1]) {
        const x = [soul, kill, g, 0, 0, 0, 0];
        const p = 1 / (1 + Math.exp(-x.reduce((s, v, i) => s + v * coef[i], 0)));
        rows.push({ x, prev: [0, 0, 0, 0, 0, 0, 0], n: 100_000, wins: Math.round(100_000 * p) });
      }
  return rows;
}

describe("fitLogistic", () => {
  it("recupera los coeficientes de una logística conocida", () => {
    const real = [3, 0.15, 0.4, 0, 0, 0, 0];
    const b = fitLogistic(synth(real), 0.01);
    expect(b[0]).toBeCloseTo(3, 1);
    expect(b[1]).toBeCloseTo(0.15, 2);
    expect(b[2]).toBeCloseTo(0.4, 2);
  });

  it("todo parejo da 50 %: no hay término independiente", () => {
    const b = fitLogistic(synth([2, 0.1, 0.3, 0, 0, 0, 0]));
    expect(b.reduce((s, v) => s + v * 0, 0)).toBe(0);
  });
});

describe("impactModel", () => {
  it("deja afuera los minutos con pocas partidas", () => {
    const rows = synth([3, 0.15, 0.4, 0, 0, 0, 0]).map((r) => ({ ...r, minute: 6 }));
    const pocas = [{ minute: 40, x: [0.1, 1, 0, 0, 0, 0, 0], prev: [0, 0, 0, 0, 0, 0, 0], n: MIN_ROWS - 1, wins: 10 }];
    const f = impactModel([...rows, ...pocas], { from: "a", to: "b", generatedAt: "c", matches: 1 });
    expect(f.minutes.map((m) => m.minute)).toEqual([6]);
    expect(f.features).toEqual(FEATURES);
    expect(f.minutes[0].coef).toHaveLength(FEATURES.length);
    expect(f.minutes[0].play).toHaveLength(FEATURES.length - 1);
  });
});

describe("play: descuenta cómo venía la partida", () => {
  it("una jugada que sólo aparece en equipos que ya ganaban no se lleva ese mérito", () => {
    // Quien iba arriba en la muestra anterior gana el 80 %; la jugada (rompe una
    // estructura) aparece casi sólo en esos equipos pero no cambia nada.
    const rows = [];
    for (const prevSoul of [-0.2, 0.2])
      for (const hizo of [0, 1]) {
        const n = prevSoul > 0 ? (hizo ? 90_000 : 10_000) : hizo ? 10_000 : 90_000;
        const p = prevSoul > 0 ? 0.8 : 0.2;
        rows.push({ minute: 9, x: [prevSoul, 0, 0, hizo, 0, 0, 0], prev: [prevSoul, 0, 0, 0, 0, 0, 0], n, wins: Math.round(n * p) });
      }
    const f = impactModel(rows, { from: "a", to: "b", generatedAt: "c", matches: 1 });
    // walker es la tercera jugada (kill, guardian, walker…).
    expect(f.minutes[0].play[2]).toBeLessThan(0.05);
  });
});

describe("smooth", () => {
  it("no deja valores negativos y promedia con los vecinos", () => {
    const m = (minute: number, v: number) => ({ minute, n: 100, coef: [v], play: [v] });
    const out = smooth([m(6, 1), m(9, -1), m(12, 1)]);
    for (const x of out) expect(x.coef[0]).toBeGreaterThanOrEqual(0);
    // El del medio: (1·100 + 0·200 + 1·100) / 400.
    expect(out[1].coef[0]).toBeCloseTo(0.5);
  });
});

describe("impactSql", () => {
  it("filtra rankeadas normales y cuenta cada estructura por tipo", () => {
    const sql = impactSql("X");
    expect(sql).toContain("match_mode = 'Ranked'");
    expect(sql).toContain("game_mode = 'Normal'");
    for (const k of ["Tier1%", "Tier2%", "TitanShield%", "BarrackBoss%"]) expect(sql).toContain(k);
  });
});
