import { describe, expect, it } from "vitest";
import { byMerit, parseRanks, type LadderRow, type RawRank } from "./deadlockLadder";

// Forma real de `/v1/players/rank`, recortada de una respuesta del 2026-11-04.
const RAW: RawRank[] = [
  {
    account_id: 1016503423,
    badge: 46,
    last_match: { player_rank_final_flat_progress: 27740 },
  },
  {
    account_id: 76776315,
    badge: 92,
    last_match: { player_rank_final_flat_progress: 57350 },
  },
  // Sin clasificatorias con rango: la API manda badge 0 y last_match null.
  { account_id: 5, badge: 0, last_match: null },
];

describe("parseRanks", () => {
  it("saca el badge y el progreso plano de cada cuenta", () => {
    const m = parseRanks(RAW);
    expect(m.get(1016503423)).toEqual({ badge: 46, score: 27740 });
    expect(m.get(76776315)).toEqual({ badge: 92, score: 57350 });
  });

  it("una cuenta sin rango queda en cero, no rompe", () => {
    expect(parseRanks(RAW).get(5)).toEqual({ badge: 0, score: 0 });
  });
});

describe("byMerit con el rango de /players/rank", () => {
  const fila = (accountId: number, gameScore: number, score: number): LadderRow => ({
    rank: 0,
    accountId,
    wins: 0,
    winRate: 0,
    score,
    gameScore,
    matches: 50,
  });

  it("el progreso del juego manda sobre Wilson, y Wilson desempata", () => {
    const filas = [fila(1, 27740, 0.9), fila(2, 57350, 0.6), fila(3, 57350, 0.7), fila(4, 0, 0.95)];
    expect(filas.sort(byMerit).map((r) => r.accountId)).toEqual([3, 2, 1, 4]);
  });
});
