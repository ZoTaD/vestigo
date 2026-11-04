import { describe, expect, it } from "vitest";
import { byMerit, joinRankWins, type LadderRow, type RawRankRow, type RawRow } from "./deadlockLadder";

// Forma real del scoreboard, recortada de respuestas del 2026-11-04.
const RANK: RawRankRow[] = [
  { account_id: 1871021649, value: 144560, matches: 585, badge: 116 },
  { account_id: 400239835, value: 129520, matches: 674, badge: 116 },
  { account_id: 7, value: 50000, matches: 60 },
];
const WINS: RawRow[] = [
  { rank: 1, account_id: 400239835, value: 426, matches: 674 },
  { rank: 2, account_id: 1871021649, value: 407, matches: 585 },
];

describe("joinRankWins", () => {
  it("toma el progreso como puntaje, el badge como rango y las ganadas del otro pedido", () => {
    const [a] = joinRankWins(RANK, WINS);
    expect(a).toMatchObject({ accountId: 1871021649, gameScore: 144560, badge: 116, wins: 407, matches: 585 });
    expect(a.winRate).toBeCloseTo(407 / 585);
  });

  it("sin victorias ni badge, la fila sale igual", () => {
    const c = joinRankWins(RANK, WINS)[2];
    expect(c).toMatchObject({ accountId: 7, wins: 0, gameScore: 50000 });
    expect(c.badge).toBeUndefined();
  });
});

describe("byMerit", () => {
  const fila = (accountId: number, gameScore: number, score: number): LadderRow => ({
    rank: 0,
    accountId,
    wins: 0,
    winRate: 0,
    score,
    gameScore,
    matches: 50,
  });

  it("el progreso del rango manda sobre Wilson, y Wilson desempata", () => {
    const filas = [fila(1, 27740, 0.9), fila(2, 57350, 0.6), fila(3, 57350, 0.7), fila(4, 0, 0.95)];
    expect(filas.sort(byMerit).map((r) => r.accountId)).toEqual([3, 2, 1, 4]);
  });
});
