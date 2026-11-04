import { describe, expect, it } from "vitest";
import { keepBest, pickRank, rankTop, type RankRead } from "../src/seasonSnapshot";

const END = 1_793_916_000; // 5/11/2026 22:00 UTC

describe("pickRank", () => {
  const viejo: RankRead = { badge: 111, progress: 70_020, at: END - 86_400 };
  const nuevo: RankRead = { badge: 112, progress: 71_360, at: END - 3_600 };
  const deLaS2: RankRead = { badge: 31, progress: 14_000, at: END + 600 };

  it("se queda con el rango más nuevo de la temporada", () => {
    expect(pickRank(viejo, nuevo, END)).toBe(nuevo);
    expect(pickRank(nuevo, viejo, END)).toBe(nuevo);
  });

  it("una corrida atrasada no pisa el rango final con uno de la temporada siguiente", () => {
    expect(pickRank(nuevo, deLaS2, END)).toBe(nuevo);
  });

  it("sin rango guardado y ya en la siguiente, no hay rango", () => {
    expect(pickRank(undefined, deLaS2, END)).toBeUndefined();
  });

  it("badge 0 es sin rango", () => {
    expect(pickRank(undefined, { badge: 0, progress: 0, at: 0 }, END)).toBeUndefined();
  });
});

describe("rankTop", () => {
  it("ordena por progreso, desempata Wilson y deja afuera a quien no tiene rango", () => {
    const pool = [
      { accountId: 1, wins: 40, matches: 50 },
      { accountId: 2, wins: 30, matches: 50 },
      { accountId: 3, wins: 45, matches: 50 },
      { accountId: 4, wins: 50, matches: 50 },
    ];
    const ranks = new Map<number, RankRead>([
      [1, { badge: 112, progress: 71_000, at: END - 1 }],
      [2, { badge: 112, progress: 71_000, at: END - 1 }],
      [3, { badge: 92, progress: 57_000, at: END - 1 }],
    ]);
    const top = rankTop(pool, ranks, 2);
    expect(top.map((r) => [r.pos, r.accountId])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(top[0]).toEqual({ pos: 1, accountId: 1, wins: 40, matches: 50, badge: 112, progress: 71_000 });
  });
});

describe("keepBest", () => {
  it("guarda sólo los de más progreso", () => {
    const ranks = new Map<number, RankRead>([
      [1, { badge: 50, progress: 30_000, at: 1 }],
      [2, { badge: 112, progress: 71_000, at: 1 }],
      [3, { badge: 92, progress: 57_000, at: 1 }],
    ]);
    expect(Object.keys(keepBest(ranks, 2)).sort()).toEqual(["2", "3"]);
  });
});
