import { describe, it, expect } from "vitest";
import {
  HABITS,
  HABIT_IDS,
  measureHabits,
  habitCarry,
  type HabitBoard,
} from "../src/habits";

/** A board with everything neutral, so each test changes exactly one thing. */
const board = (over: Partial<HabitBoard> = {}): HabitBoard => ({
  placement: 4,
  level: 8,
  goldLeft: 0,
  units: [{ id: "TFT17_Jinx", stars: 2, cost: 4, items: ["a", "b", "c"] }],
  ...over,
});

describe("the habit predicates", () => {
  it("reads leftover gold at the threshold the calibration measured", () => {
    expect(HABITS.hoardsGold(board({ goldLeft: 25 }))).toBe(false);
    expect(HABITS.hoardsGold(board({ goldLeft: 26 }))).toBe(true);
  });

  it("calls level 7 low and level 8 not, the cut the profile already uses", () => {
    expect(HABITS.lowLevel(board({ level: 8 }))).toBe(false);
    expect(HABITS.lowLevel(board({ level: 7 }))).toBe(true);
  });

  it("measures the carry's items, not any unit's", () => {
    expect(HABITS.carryShort(board())).toBe(false);
    expect(
      HABITS.carryShort(
        board({
          units: [
            { id: "TFT17_Jinx", stars: 2, cost: 4, items: ["a", "b"] },
            { id: "TFT17_Ornn", stars: 2, cost: 5, items: [] },
          ],
        })
      )
    ).toBe(true);
  });

  it("cannot answer carryShort for an empty board", () => {
    expect(HABITS.carryShort(board({ units: [] }))).toBeNull();
  });

  // Three stars is only a reroll decision on a cheap unit; a 3-star 5-cost is
  // an accident of the game, not a plan.
  it("counts a three-star cheap unit as rerolling, and an expensive one as not", () => {
    expect(
      HABITS.rerolls(board({ units: [{ id: "x", stars: 3, cost: 2, items: [] }] }))
    ).toBe(true);
    expect(
      HABITS.rerolls(board({ units: [{ id: "x", stars: 3, cost: 5, items: [] }] }))
    ).toBe(false);
    expect(
      HABITS.rerolls(board({ units: [{ id: "x", stars: 2, cost: 1, items: [] }] }))
    ).toBe(false);
  });

  // Summoned units carry cost 0 and can report three stars.
  it("does not read a summoned unit as a reroll", () => {
    expect(
      HABITS.rerolls(board({ units: [{ id: "TFT17_Golem", stars: 3, cost: 0, items: [] }] }))
    ).toBe(false);
  });

  // These three are facts about the lobby or the band's tier list, not about
  // the board alone. Absent means "cannot answer", never "no".
  it("returns null for the habits whose input was not supplied", () => {
    expect(HABITS.contestedCarry(board())).toBeNull();
    expect(HABITS.offMeta(board())).toBeNull();
    expect(HABITS.lowTierComp(board())).toBeNull();
    expect(HABITS.contestedCarry(board({ contested: true }))).toBe(true);
    expect(HABITS.offMeta(board({ compExact: true }))).toBe(false);
    expect(HABITS.lowTierComp(board({ compTier: "C" }))).toBe(true);
    expect(HABITS.lowTierComp(board({ compTier: "A" }))).toBe(false);
  });
});

describe("habitCarry", () => {
  it("is whoever the board committed the most items to", () => {
    const b = board({
      units: [
        { id: "front", stars: 2, cost: 1, items: ["a"] },
        { id: "carry", stars: 2, cost: 4, items: ["a", "b", "c"] },
      ],
    });
    expect(habitCarry(b)?.id).toBe("carry");
  });

  it("is null on an empty board rather than a guess", () => {
    expect(habitCarry(board({ units: [] }))).toBeNull();
  });
});

describe("measureHabits", () => {
  it("reports the rate and both sides' average placement", () => {
    const boards = [
      board({ goldLeft: 40, placement: 7 }),
      board({ goldLeft: 40, placement: 5 }),
      board({ goldLeft: 0, placement: 1 }),
      board({ goldLeft: 0, placement: 3 }),
    ];
    const table = measureHabits(boards);
    expect(table.hoardsGold).toEqual({
      rate: 0.5,
      boards: 4,
      withN: 2,
      avgWith: 6,
      avgWithout: 2,
    });
  });

  // A board that cannot answer must not be counted as a "no": that would turn
  // missing input into a claim that the habit is rare.
  it("leaves unanswerable boards out of the denominator", () => {
    const table = measureHabits([
      board({ contested: true }),
      board({ contested: false }),
      board(),
    ]);
    expect(table.contestedCarry?.boards).toBe(2);
    expect(table.contestedCarry?.rate).toBe(0.5);
  });

  it("omits a habit no board could answer instead of reporting zero", () => {
    const table = measureHabits([board(), board()]);
    expect(table.offMeta).toBeUndefined();
  });

  it("measures every habit in the vocabulary", () => {
    expect(HABIT_IDS).toEqual([
      "hoardsGold",
      "lowLevel",
      "carryShort",
      "rerolls",
      "contestedCarry",
      "offMeta",
      "lowTierComp",
    ]);
  });
});
