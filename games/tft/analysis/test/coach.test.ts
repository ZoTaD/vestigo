import { describe, it, expect } from "vitest";
import { coachFindings } from "../src/coach";
import type { HabitStat } from "../src/habits";

/** A band figure with everything unremarkable, so each test moves one thing. */
const stat = (over: Partial<HabitStat> = {}): HabitStat => ({
  rate: 0.2,
  boards: 4000,
  withN: 800,
  avgWith: 4.5,
  avgWithout: 4.5,
  ...over,
});

/** The player's own side: only `rate` and `boards` are ever read. */
const mine = (rate: number, games = 20): HabitStat =>
  stat({ rate, boards: games, withN: Math.round(rate * games) });

describe("coachFindings", () => {
  // The flagship case, with the figures habits.json actually publishes for
  // platinum-gold against diamond-emerald.
  it("reports a habit the band above does less and that costs places here", () => {
    const found = coachFindings({
      mine: { hoardsGold: mine(0.45) },
      myGames: 20,
      band: {
        hoardsGold: stat({
          rate: 0.213,
          boards: 4168,
          withN: 888,
          avgWith: 5.22,
          avgWithout: 4.31,
        }),
      },
      above: { hoardsGold: stat({ rate: 0.135, boards: 15648, withN: 2112 }) },
    });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe("hoardsGold");
    expect(found[0].yourRate).toBe(0.45);
    expect(found[0].bandRate).toBe(0.213);
    expect(found[0].aboveRate).toBe(0.135);
    expect(found[0].costInBand).toBeCloseTo(0.91, 2);
    expect(found[0].bandBoards).toBe(4168);
  });

  /**
   * REGRESSION — the case that forced gate 3 to exist.
   *
   * Measured on patch 16.14: the band above rerolls LESS (41.9% against 53.6%)
   * but rerolling IMPROVES placement inside platinum-gold (4.00 against 5.07).
   * "Reroll less, like the players above you" would be advice this project's own
   * data contradicts. Anything that makes this test fire is broken.
   */
  it("stays silent when the band gap and the placement cost disagree", () => {
    const found = coachFindings({
      mine: { rerolls: mine(0.7) },
      myGames: 20,
      band: {
        rerolls: stat({
          rate: 0.536,
          boards: 4168,
          withN: 2234,
          avgWith: 4.0,
          avgWithout: 5.07,
        }),
      },
      above: { rerolls: stat({ rate: 0.419, boards: 15648, withN: 6556 }) },
    });
    expect(found).toEqual([]);
  });

  /**
   * REGRESSION — the case that forced gate 1 to exist.
   *
   * Items held off the carry sits on 84-95% of boards with an apparent effect of
   * -2.4 places. It measures having survived long enough to have items on the
   * board, not a decision. Anything that common is not a choice.
   */
  it("stays silent for a habit almost every board has", () => {
    const found = coachFindings({
      mine: { carryShort: mine(0.99) },
      myGames: 20,
      band: {
        carryShort: stat({
          rate: 0.95,
          boards: 17464,
          withN: 16591,
          avgWith: 4.39,
          avgWithout: 6.77,
        }),
      },
      above: { carryShort: stat({ rate: 0.84, boards: 15648, withN: 13144 }) },
    });
    expect(found).toEqual([]);
  });

  // The other end of the same gate: at apex a carry reaches the end without its
  // items on 0.8% of boards, so the habit has nothing to say to an apex player.
  it("stays silent for a habit almost no board has", () => {
    const found = coachFindings({
      mine: { carryShort: mine(0.3) },
      myGames: 20,
      band: {
        carryShort: stat({
          rate: 0.008,
          boards: 17464,
          withN: 140,
          avgWith: 6.4,
          avgWithout: 4.48,
        }),
      },
      above: { carryShort: stat({ rate: 0.005, boards: 15648, withN: 78 }) },
    });
    expect(found).toEqual([]);
  });

  it("stays silent when the two bands barely differ", () => {
    const found = coachFindings({
      mine: { hoardsGold: mine(0.45) },
      myGames: 20,
      band: { hoardsGold: stat({ rate: 0.21, avgWith: 5.2, avgWithout: 4.3 }) },
      above: { hoardsGold: stat({ rate: 0.19 }) },
    });
    expect(found).toEqual([]);
  });

  it("stays silent when the habit costs nothing inside your own band", () => {
    const found = coachFindings({
      mine: { hoardsGold: mine(0.45) },
      myGames: 20,
      band: {
        hoardsGold: stat({ rate: 0.3, avgWith: 4.55, avgWithout: 4.45 }),
      },
      above: { hoardsGold: stat({ rate: 0.15 }) },
    });
    expect(found).toEqual([]);
  });

  it("stays silent when the player already behaves like the band above", () => {
    const found = coachFindings({
      mine: { hoardsGold: mine(0.12) },
      myGames: 20,
      band: {
        hoardsGold: stat({
          rate: 0.213,
          boards: 4168,
          withN: 888,
          avgWith: 5.22,
          avgWithout: 4.31,
        }),
      },
      above: { hoardsGold: stat({ rate: 0.135, boards: 15648, withN: 2112 }) },
    });
    expect(found).toEqual([]);
  });

  it("says nothing at all with too few games to call anything a habit", () => {
    expect(
      coachFindings({
        mine: { hoardsGold: mine(0.6, 5) },
        myGames: 5,
        band: {
          hoardsGold: stat({
            rate: 0.213,
            boards: 4168,
            withN: 888,
            avgWith: 5.22,
            avgWithout: 4.31,
          }),
        },
        above: { hoardsGold: stat({ rate: 0.135, boards: 15648, withN: 2112 }) },
      })
    ).toEqual([]);
  });

  // An apex player has no rung above them; the panel says so rather than
  // inventing a comparison against themselves.
  it("says nothing when there is no band above", () => {
    expect(
      coachFindings({
        mine: { hoardsGold: mine(0.45) },
        myGames: 20,
        band: {
          hoardsGold: stat({
            rate: 0.213,
            boards: 4168,
            withN: 888,
            avgWith: 5.22,
            avgWithout: 4.31,
          }),
        },
        above: null,
      })
    ).toEqual([]);
  });

  it("skips a habit the band could not measure instead of guessing", () => {
    const found = coachFindings({
      mine: { offMeta: mine(0.5) },
      myGames: 20,
      band: {},
      above: { offMeta: stat({ rate: 0.2 }) },
    });
    expect(found).toEqual([]);
  });

  it("skips a band whose sample is too thin to compare against", () => {
    const found = coachFindings({
      mine: { hoardsGold: mine(0.45) },
      myGames: 20,
      band: {
        hoardsGold: stat({
          rate: 0.3,
          boards: 120,
          withN: 36,
          avgWith: 5.5,
          avgWithout: 4.0,
        }),
      },
      above: { hoardsGold: stat({ rate: 0.15, boards: 15648, withN: 2347 }) },
    });
    expect(found).toEqual([]);
  });

  it("orders by the places on offer and shows at most three", () => {
    const cheap = stat({ rate: 0.3, boards: 4000, withN: 1200, avgWith: 4.7, avgWithout: 4.3 });
    const dear = stat({ rate: 0.3, boards: 4000, withN: 1200, avgWith: 6.0, avgWithout: 4.0 });
    const found = coachFindings({
      mine: {
        hoardsGold: mine(0.6),
        lowLevel: mine(0.6),
        carryShort: mine(0.6),
        contestedCarry: mine(0.6),
      },
      myGames: 20,
      band: {
        hoardsGold: cheap,
        lowLevel: dear,
        carryShort: cheap,
        contestedCarry: cheap,
      },
      above: {
        hoardsGold: stat({ rate: 0.15 }),
        lowLevel: stat({ rate: 0.15 }),
        carryShort: stat({ rate: 0.15 }),
        contestedCarry: stat({ rate: 0.15 }),
      },
    });
    expect(found).toHaveLength(3);
    expect(found[0].id).toBe("lowLevel");
  });
});

/**
 * Being contested is measured twice on purpose: the raw split is a known
 * artefact, so the band also publishes a cost compared within each carry.
 */
describe("the corrected cost", () => {
  it("uses the band's adjusted cost in place of the raw split", () => {
    const found = coachFindings({
      mine: { contestedCarry: mine(0.4) },
      myGames: 20,
      band: {
        contestedCarry: stat({
          rate: 0.2,
          boards: 4168,
          withN: 834,
          // The raw split says being contested is free. It is not; it is
          // confounded, and on its own this would fail the cost gate.
          avgWith: 4.51,
          avgWithout: 4.49,
          adjustedCost: 0.71,
          adjustedWithN: 271,
          adjustedWithoutN: 1471,
        }),
      },
      above: { contestedCarry: stat({ rate: 0.1, boards: 15648, withN: 1565 }) },
    });
    expect(found).toHaveLength(1);
    expect(found[0].costInBand).toBeCloseTo(0.71, 2);
  });

  // silver-below publishes -0.39 off 38 contested boards against 89 alone,
  // which is well inside one standard error of nothing.
  it("rejects an adjusted cost its own sample cannot support", () => {
    const found = coachFindings({
      mine: { contestedCarry: mine(0.05) },
      myGames: 20,
      band: {
        contestedCarry: stat({
          rate: 0.1,
          boards: 1032,
          withN: 118,
          avgWith: 4.6,
          avgWithout: 4.44,
          adjustedCost: -0.39,
          adjustedWithN: 38,
          adjustedWithoutN: 89,
        }),
      },
      above: { contestedCarry: stat({ rate: 0.2, boards: 4168, withN: 834 }) },
    });
    expect(found).toEqual([]);
  });
});
