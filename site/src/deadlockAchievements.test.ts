import { describe, expect, it } from "vitest";
import {
  achievementsOf,
  longestWinStreak,
  nextStep,
  peakTier,
  recordsOf,
  stepTier,
  MASTERY,
  type RecordsFile,
} from "./deadlockAchievements";
import type { HistoryRow } from "./deadlockMatch";
import { parseRoute } from "./route";

const S1 = Date.UTC(2026, 7, 10) / 1000;

function fila(p: Partial<HistoryRow>): HistoryRow {
  return {
    matchId: 1,
    heroId: 6,
    won: true,
    kills: 5,
    deaths: 3,
    assists: 8,
    netWorth: 30_000,
    durationS: 1800,
    startTime: S1,
    badge: 0,
    lastHits: 150,
    denies: 5,
    mode: 4,
    gameMode: 1,
    ...p,
  };
}

const base = { accountId: 7, career: [], rankSeries: [], placings: [], world: null, records: null };

describe("umbrales", () => {
  it("stepTier y nextStep", () => {
    expect(stepTier(49, MASTERY)).toBeNull();
    expect(stepTier(50, MASTERY)).toBe("bronze");
    expect(stepTier(1000, MASTERY)).toBe("eternal");
    expect(nextStep(160, MASTERY)).toBe(400);
    expect(nextStep(5000, MASTERY)).toBeNull();
  });

  it("peakTier por división", () => {
    expect(peakTier(54)).toBeNull();
    expect(peakTier(63)).toBe("bronze");
    expect(peakTier(86)).toBe("silver");
    expect(peakTier(101)).toBe("gold");
    expect(peakTier(112)).toBe("eternal");
  });
});

it("la racha más larga va en orden cronológico", () => {
  const rows = [true, true, false, true, true, true].map((won, i) => fila({ won, startTime: S1 + i }));
  expect(longestWinStreak([...rows].reverse())).toBe(3);
});

it("las hazañas ignoran lobbies privados y la pelea callejera", () => {
  const { earned } = achievementsOf({
    ...base,
    history: [fila({ netWorth: 1_207_450, mode: 2 }), fila({ kills: 40, gameMode: 4 }), fila({ kills: 21 })],
  });
  expect(earned.find((a) => a.kind.type === "bestSouls")).toBeUndefined();
  const k = earned.find((a) => a.kind.type === "bestKills");
  expect(k?.tag).toBe("21");
  expect(k?.tier).toBe("silver");
});

it("veterano de la Season 1 con una clasificatoria", () => {
  const { earned } = achievementsOf({ ...base, history: [fila({})] });
  expect(earned.some((a) => a.kind.type === "veteran")).toBe(true);
});

it("recordsOf encuentra la cuenta en héroe y mundo", () => {
  const f: RecordsFile = {
    generatedAt: "",
    metrics: ["kills"],
    seasons: { "1": { final: true, heroes: { "6": { kills: [9, 7] } }, world: { kills: [7] } } },
  };
  const r = recordsOf(f, 7);
  expect(r.map((a) => [a.tag, a.tier])).toEqual([
    ["#1", "eternal"],
    ["#2", "gold"],
  ]);
});

it("la URL del perfil lleva la pestaña", () => {
  expect(parseRoute("/es/deadlock/player/123/achievements").detail).toBe("123/achievements");
  expect(parseRoute("/es/deadlock/player/123").detail).toBe("123");
});
