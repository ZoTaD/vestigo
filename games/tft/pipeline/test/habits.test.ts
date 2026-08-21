import { describe, it, expect } from "vitest";
import { toHabitBoard, aggregateHabits } from "../src/aggregate/habits";
import type { Participant } from "../src/aggregate/signature";

const participant = (over: Partial<Participant> = {}): Participant => ({
  puuid: "p",
  placement: 4,
  level: 8,
  goldLeft: 0,
  units: [{ character_id: "TFT17_Jinx", tier: 2, rarity: 4, items: ["a", "b", "c"] }],
  traits: [],
  ...over,
});

// The adapter is the only place the pipeline's shape and the analyzer's shape
// touch. If it lies, the coach compares the player against a habit measured a
// different way and nothing fails.
describe("toHabitBoard", () => {
  it("renames every field the analyzer's shape expects", () => {
    const board = toHabitBoard(
      participant({ placement: 2, level: 9, goldLeft: 31 }),
      () => 4
    );
    expect(board.placement).toBe(2);
    expect(board.level).toBe(9);
    expect(board.goldLeft).toBe(31);
    expect(board.units).toEqual([
      { id: "TFT17_Jinx", stars: 2, cost: 4, items: ["a", "b", "c"] },
    ]);
  });

  // Riot's rarity is not cost-1: Set 17 reports Morgana at rarity 6 while she
  // is a 4-cost. The catalog is generated from the game's own data, so it wins.
  it("takes the cost from the catalog rather than from rarity", () => {
    const board = toHabitBoard(
      participant({
        units: [{ character_id: "TFT17_Morgana", tier: 2, rarity: 6, items: [] }],
      }),
      (id) => (id === "TFT17_Morgana" ? 4 : 0)
    );
    expect(board.units[0].cost).toBe(4);
  });

  it("carries the lobby-level facts through when given them", () => {
    const board = toHabitBoard(participant(), () => 4, { contested: true });
    expect(board.contested).toBe(true);
  });
});

describe("aggregateHabits", () => {
  it("marks a carry shared with another board in the same lobby as contested", () => {
    const lobby = [
      participant({ puuid: "a", placement: 1 }),
      participant({ puuid: "b", placement: 8 }),
    ];
    const table = aggregateHabits([lobby], () => 4);
    expect(table.contestedCarry?.rate).toBe(1);
    expect(table.contestedCarry?.boards).toBe(2);
  });

  it("leaves a lone carry uncontested", () => {
    const lobby = [
      participant({ puuid: "a" }),
      participant({
        puuid: "b",
        units: [{ character_id: "TFT17_Ornn", tier: 2, rarity: 6, items: ["a", "b", "c"] }],
      }),
    ];
    const table = aggregateHabits([lobby], () => 4);
    expect(table.contestedCarry?.rate).toBe(0);
  });

  it("measures the board habits across every lobby it is given", () => {
    const lobby = [
      participant({ goldLeft: 40, placement: 8 }),
      participant({ goldLeft: 0, placement: 1 }),
    ];
    const table = aggregateHabits([lobby], () => 4);
    expect(table.hoardsGold?.rate).toBe(0.5);
    expect(table.hoardsGold?.avgWith).toBe(8);
    expect(table.hoardsGold?.avgWithout).toBe(1);
  });

  // The tier list is not built yet when this runs, so these have no input.
  it("reports nothing for the habits that need the band's tier list", () => {
    const table = aggregateHabits([[participant(), participant()]], () => 4);
    expect(table.offMeta).toBeUndefined();
    expect(table.lowTierComp).toBeUndefined();
  });
});

/**
 * The raw contested/alone split is confounded and calibrate.ts says so: strong
 * comps get contested more, so their good placements cancel the penalty out and
 * the difference reads as nothing. The fix is to compare within the same carry.
 */
describe("the contested cost, corrected within each carry", () => {
  const on = (carry: string, placement: number) =>
    participant({
      placement,
      units: [{ character_id: carry, tier: 2, rarity: 4, items: ["a", "b", "c"] }],
    });

  // Carry A is contested in ten lobbies (placements 6 and 7) and alone in ten
  // (placement 2). Within A the gap is 6.5 - 2 = 4.5. Carry B only ever plays
  // alone, so it cannot be compared and drops out.
  const lobbies = [
    ...Array.from({ length: 10 }, () => [on("A", 6), on("A", 7)]),
    ...Array.from({ length: 10 }, () => [on("A", 2), on("B", 5)]),
  ];

  it("weighs contested against alone inside the same carry", () => {
    const table = aggregateHabits(lobbies, () => 4);
    expect(table.contestedCarry?.adjustedCost).toBeCloseTo(4.5, 6);
    expect(table.contestedCarry?.adjustedWithN).toBe(20);
    expect(table.contestedCarry?.adjustedWithoutN).toBe(10);
  });

  // The raw figures stay exactly what they were, so a reader of habits.json is
  // never handed two different meanings under one field name.
  it("leaves the raw split untouched beside it", () => {
    const table = aggregateHabits(lobbies, () => 4);
    // Forty boards in all: twenty contested, twenty playing their carry alone.
    expect(table.contestedCarry?.rate).toBeCloseTo(0.5, 6);
    expect(table.contestedCarry?.avgWith).toBeCloseTo(6.5, 6);
    // Ten A-alone boards at 2 and ten B boards at 5.
    expect(table.contestedCarry?.avgWithout).toBeCloseTo(3.5, 6);
  });

  it("adjusts nothing else", () => {
    const table = aggregateHabits(lobbies, () => 4);
    expect(table.hoardsGold?.adjustedCost).toBeUndefined();
    expect(table.lowLevel?.adjustedCost).toBeUndefined();
  });

  // A carry seen only a handful of times either way cannot support the
  // comparison; including it would let three boards move the whole number.
  it("ignores a carry without enough boards on both sides", () => {
    const thin = [
      [on("A", 1), on("A", 8)],
      [on("A", 2), on("B", 5)],
    ];
    const table = aggregateHabits(thin, () => 4);
    expect(table.contestedCarry?.adjustedCost).toBeUndefined();
  });
});
