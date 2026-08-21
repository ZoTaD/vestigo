import { describe, it, expect } from "vitest";
import { calibrate } from "../src/aggregate/calibrate";
import type { Participant } from "../src/aggregate/signature";

function board(
  placement: number,
  carry: string,
  over: Partial<Participant> = {}
): Participant {
  return {
    puuid: `p${placement}-${carry}`,
    placement,
    level: 8,
    goldLeft: 0,
    // The carry is whoever holds items, so give it three and nobody else any.
    units: [
      { character_id: carry, tier: 2, rarity: 2, items: ["a", "b", "c"] },
      { character_id: "Filler", tier: 1, rarity: 0, items: [] },
    ],
    traits: [],
    ...over,
  };
}

/** n lobbies where `carry` is shared by two players, placing `contested`. */
function lobbies(count: number, carry: string, contested: number[], alone: number): Participant[][] {
  return Array.from({ length: count }, () => [
    board(contested[0], carry),
    board(contested[1], carry),
    board(alone, "Other"),
  ]);
}

describe("calibrate", () => {
  it("counts what it measured, so the report can cite the sample", () => {
    const c = calibrate(lobbies(3, "Ahri", [5, 6], 1));
    expect(c.matches).toBe(3);
    expect(c.boards).toBe(9);
  });

  it("measures the contest cost within the same carry", () => {
    // Ahri is contested in 12 lobbies (placing 5 and 6) and alone in 12 (placing 2).
    const shared = lobbies(12, "Ahri", [5, 6], 8);
    const solo = Array.from({ length: 12 }, () => [board(2, "Ahri"), board(4, "Other")]);
    const c = calibrate([...shared, ...solo]);
    // Contested mean 5.5 against 2 alone: 3.5 placements worse.
    expect(c.contest.placementCost).toBeCloseTo(3.5, 1);
    expect(c.contest.carriesCompared).toBe(1);
  });

  it("ignores carries without enough of both groups to compare", () => {
    // Only two contested boards: far too few to draw a delta from.
    const c = calibrate(lobbies(1, "Ahri", [1, 8], 4));
    expect(c.contest.carriesCompared).toBe(0);
    expect(c.contest.placementCost).toBe(0);
  });

  it("averages placement inside each gold band", () => {
    const c = calibrate([
      [board(2, "A", { goldLeft: 0 }), board(3, "B", { goldLeft: 5 })],
      [board(6, "C", { goldLeft: 30 }), board(8, "D", { goldLeft: 70 })],
    ]);
    expect(c.gold.lowAvg).toBeCloseTo(2.5, 2);
    expect(c.gold.wastedAvg).toBeCloseTo(6, 2);
    expect(c.gold.severeAvg).toBeCloseTo(8, 2);
  });

  it("separates boards whose carry never completed its items", () => {
    const short = board(7, "A");
    short.units[0].items = ["a"];
    const c = calibrate([[short, board(1, "B")]]);
    expect(c.carryItems.shortRate).toBeCloseTo(0.5, 2);
    expect(c.carryItems.shortAvg).toBeCloseTo(7, 2);
    expect(c.carryItems.fullAvg).toBeCloseTo(1, 2);
  });

  it("does not divide by zero on an empty store", () => {
    const c = calibrate([]);
    expect(c.matches).toBe(0);
    expect(c.contest.placementCost).toBe(0);
    expect(c.carryItems.shortRate).toBe(0);
  });
});
