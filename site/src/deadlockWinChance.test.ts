import { describe, expect, it } from "vitest";
import { bucketCenters, chanceAt, fightsOf, relativeLead, type ComebackBand } from "./deadlockWinChance";
import type { MatchPlayer, ParsedMatch } from "./deadlockMatch";

const edges = [-0.3, -0.2, -0.1, -0.05, 0.05, 0.1, 0.2, 0.3];
const minutes = [6, 9];
// Un minuto donde ganar sube parejo con la ventaja, y otro más empinado.
const fila = (wrs: number[]) => wrs.map((w) => ({ n: 1000, wins: Math.round(w * 1000) }));
const band: ComebackBand = {
  matches: 1000,
  cells: [
    fila([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]),
    fila([0.0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9, 1.0]),
  ],
};

describe("probabilidad de ganar", () => {
  it("los centros de tramo quedan entre sus cortes", () => {
    const c = bucketCenters(edges);
    expect(c).toHaveLength(9);
    expect(c[4]).toBeCloseTo(0);
    expect(c[0]).toBeLessThan(-0.3);
    expect(c[8]).toBeGreaterThan(0.3);
  });

  it("sin ventaja es 50 % y es simétrica", () => {
    expect(chanceAt(band, { minutes, edges }, 6, 0)).toBeCloseTo(0.5);
    const a = chanceAt(band, { minutes, edges }, 6, 0.15);
    const b = chanceAt(band, { minutes, edges }, 6, -0.15);
    expect(a + b).toBeCloseTo(1);
  });

  it("interpola entre minutos", () => {
    const m6 = chanceAt(band, { minutes, edges }, 6, 0.15);
    const m9 = chanceAt(band, { minutes, edges }, 9, 0.15);
    const m75 = chanceAt(band, { minutes, edges }, 7.5, 0.15);
    expect(m75).toBeCloseTo((m6 + m9) / 2);
  });

  it("la ventaja relativa es contra el promedio", () => {
    expect(relativeLead(110, 90)).toBeCloseTo(0.2);
    expect(relativeLead(0, 0)).toBe(0);
  });
});

describe("peleas", () => {
  const jugador = (team: number, slot: number, muertes: number[]): MatchPlayer =>
    ({ team, slot, deathsAt: muertes.map((t) => ({ t, killer: 0 })) }) as unknown as MatchPlayer;
  const partida = (players: MatchPlayer[]) => ({ players }) as unknown as ParsedMatch;

  it("junta muertes cercanas y descarta las sueltas", () => {
    const f = fightsOf(
      partida([jugador(0, 1, [100, 500]), jugador(0, 2, [110]), jugador(1, 7, [120, 900])])
    );
    expect(f).toEqual([{ start: 100, end: 120, deaths: [2, 1] }]);
  });
});
