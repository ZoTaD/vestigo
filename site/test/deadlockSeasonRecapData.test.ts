import { describe, expect, it } from "vitest";
import { seasonRecap } from "../src/deadlockSeasonRecapData";
import type { HistoryRow } from "../src/deadlockMatch";
import type { RankPoint } from "../src/deadlockRankHistory";
import type { Achievement } from "../src/deadlockAchievements";

let t = 1000;
const row = (heroId: number, won: boolean, kills = 5, assists = 5, deaths = 5): HistoryRow => ({
  matchId: t,
  heroId,
  won,
  kills,
  deaths,
  assists,
  netWorth: 0,
  durationS: 1800,
  startTime: t++,
  badge: 0,
  lastHits: 0,
  denies: 0,
  mode: 1,
  gameMode: 1,
});
const pt = (startTime: number, badge: number, score: number): RankPoint => ({ matchId: startTime, startTime, badge, score });

describe("seasonRecap", () => {
  it("cuenta partidas, horas, héroe más jugado, racha y mejor partida", () => {
    // Orden de juego: G G P G G G P (racha más larga: 3).
    const rows = [row(1, true), row(1, true), row(2, false), row(2, true, 20, 3), row(1, true), row(3, true), row(1, false)];
    const r = seasonRecap(2, rows, [], [])!;
    expect(r.matches).toBe(7);
    expect(r.wins).toBe(5);
    expect(r.hours).toBeCloseTo(3.5);
    expect(r.heroesPlayed).toBe(3);
    expect(r.topHero).toEqual({ heroId: 1, matches: 4, wins: 3 });
    expect(r.bestStreak).toBe(3);
    expect(r.bestGame?.kills).toBe(20);
    expect(r.rank).toBeNull();
  });

  it("rango: el primero, el último y el más alto por escalón", () => {
    const r = seasonRecap(2, [row(1, true)], [pt(3, 74, 20), pt(1, 61, 10), pt(2, 81, 30), pt(4, 0, 0)], [])!;
    expect(r.rank).toEqual({ from: 61, to: 74, peak: 81 });
  });

  it("el logro más raro es el de menor rareza conocida", () => {
    const a = (id: string, rarity?: number) => ({ id, rarity }) as unknown as Achievement;
    const r = seasonRecap(2, [row(1, true)], [], [a("x", 0.3), a("y"), a("z", 0.01)])!;
    expect(r.rarest?.id).toBe("z");
  });

  it("sin partidas no hay resumen", () => {
    expect(seasonRecap(2, [], [], [])).toBeNull();
  });
});
