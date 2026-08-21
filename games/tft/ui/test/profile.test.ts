import { describe, it, expect } from "vitest";
import { buildProfile, type MatchView } from "../src/analyzer";
import type { LpSnapshot } from "../src/lp";

function match(placement: number, over: Partial<MatchView> = {}): MatchView {
  return {
    matchId: `M${placement}-${Math.round(Math.abs(placement) * 1000)}`,
    standard: true,
    queueId: 1100,
    placement,
    playedAt: 0,
    level: 8,
    goldLeft: 0,
    lastRound: "5-1",
    compLabel: "Space Groove Blitzcrank",
    units: [],
    traits: [],
    findings: [],
    lobby: [],
    ...over,
  };
}

describe("buildProfile", () => {
  it("counts each finishing place", () => {
    const p = buildProfile([match(1), match(1), match(3), match(8)], "en");
    expect(p.placements).toEqual([2, 0, 1, 0, 0, 0, 0, 1]);
    expect(p.matches).toBe(4);
  });

  it("computes the headline figures from those placements", () => {
    const p = buildProfile([match(1), match(2), match(5), match(8)], "en");
    expect(p.avgPlacement).toBeCloseTo(4, 5);
    expect(p.top4Rate).toBeCloseTo(0.5, 5);
    expect(p.winRate).toBeCloseTo(0.25, 5);
  });

  // Double Up placements do not mean the same thing, so averaging them in would
  // quietly corrupt every number on the panel.
  it("keeps non-standard matches out of every statistic", () => {
    const p = buildProfile([match(1), match(8, { standard: false })], "en");
    expect(p.matches).toBe(1);
    expect(p.excluded).toBe(1);
    expect(p.avgPlacement).toBe(1);
    expect(p.placements[7]).toBe(0);
  });

  // "standard" is not the same thing as "ranked". Measured over the store,
  // tft_game_type "standard" also covers normals (1090), Choncc's Treasure
  // (1210) and the event queues, so a player who mixes them had half their
  // profile measured against a meta that was not theirs.
  it("keeps non-ranked queues out of every statistic", () => {
    const p = buildProfile([match(1), match(8, { queueId: 1090 })], "en");
    expect(p.matches).toBe(1);
    expect(p.excluded).toBe(1);
    expect(p.avgPlacement).toBe(1);
    expect(p.placements[7]).toBe(0);
  });

  // The graph is drawn from snapshots, not from matches, so the wiring is what
  // can break silently: buildProfile has to scope them to the newest set.
  it("carries the LP points of the newest set", () => {
    const snap = (over: Partial<LpSnapshot>): LpSnapshot => ({
      tier: "GOLD",
      division: "I",
      leaguePoints: 0,
      games: 10,
      setNumber: 17,
      takenAt: 0,
      ...over,
    });
    const p = buildProfile([match(1)], "en", "global", null, [
      snap({ takenAt: 2_000, leaguePoints: 40 }),
      snap({ takenAt: 1_000, leaguePoints: 10 }),
      // A point from last set. Rank resets between sets, so including it would
      // draw a collapse that never happened.
      snap({ takenAt: 500, leaguePoints: 90, setNumber: 16 }),
    ]);
    expect(p.lp.map((x) => x.leaguePoints)).toEqual([10, 40]);
  });

  it("has no LP points when nothing was ever recorded", () => {
    expect(buildProfile([match(1)], "en").lp).toEqual([]);
  });

  it("ignores a placement outside the eight seats", () => {
    const p = buildProfile([match(1), match(0), match(99)], "en");
    expect(p.matches).toBe(1);
    expect(p.excluded).toBe(2);
  });

  it("ranks comps by how often they were played", () => {
    const p = buildProfile([
      match(1, { compLabel: "A" }),
      match(5, { compLabel: "A" }),
      match(2, { compLabel: "B" }),
    ], "en");
    expect(p.comps[0].key).toBe("A");
    expect(p.comps[0].games).toBe(2);
    expect(p.comps[0].avgPlacement).toBeCloseTo(3, 5);
  });

  it("marks a one-game average as thin rather than stating it", () => {
    const p = buildProfile([match(1, { compLabel: "A" }), match(8, { compLabel: "B" })], "en");
    expect(p.comps.every((c) => c.thin)).toBe(true);
  });

  it("counts a champion once per match it appeared in", () => {
    const unit = { id: "TFT17_Shen", name: "Shen", img: "", cost: 4, stars: 2, isCarry: false, items: [] };
    const p = buildProfile([match(1, { units: [unit] }), match(3, { units: [unit] })]);
    expect(p.champions[0].key).toBe("TFT17_Shen");
    expect(p.champions[0].games).toBe(2);
    expect(p.champions[0].avgPlacement).toBeCloseTo(2, 5);
  });

  it("returns an empty profile rather than dividing by zero", () => {
    const p = buildProfile([], "en");
    expect(p.matches).toBe(0);
    expect(p.avgPlacement).toBe(0);
    expect(p.placements).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
