import { primaryCarry, type Participant } from "./signature";
import {
  measureHabits,
  HABITS,
  HABIT_IDS,
  type HabitBoard,
  type HabitTable,
} from "../../../analysis/src/habits";

/**
 * A rank band's habits, measured with the very same predicates the browser runs
 * over the player's own games.
 *
 * The import above reaches across packages on purpose. games/tft/analysis is the
 * runtime-free package precisely so the same logic can run here, in the browser
 * and in tests; a second copy of a predicate could not be checked against this
 * one by any test, and the coach's whole claim is that the two sides of the
 * comparison were measured identically.
 */

/**
 * A carry needs this many boards in both groups before its own gap means
 * anything. The same bar calibrate.ts uses for the same comparison.
 */
const MIN_PER_CARRY = 10;

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * What being contested actually costs, compared within the same carry.
 *
 * The raw contested/alone split is confounded and calibrate.ts already showed
 * how badly: strong comps get contested more often, so their good placements
 * cancel the penalty out and the difference reads as nothing at all (-0.02
 * places across apex). Holding the carry fixed removes that, and the real cost
 * appears.
 *
 * Returns null when no single carry has enough boards on both sides — better an
 * absent number than one three boards could move.
 */
function contestedCost(
  lobbies: Participant[][]
): { cost: number; withN: number; withoutN: number } | null {
  const groups = new Map<string, { contested: number[]; alone: number[] }>();

  for (const lobby of lobbies) {
    if (lobby.length < 2) continue;
    const carries = lobby.map(primaryCarry);
    const tally = new Map<string, number>();
    for (const c of carries) if (c) tally.set(c, (tally.get(c) ?? 0) + 1);

    lobby.forEach((board, i) => {
      const carry = carries[i];
      if (!carry) return;
      const group = groups.get(carry) ?? { contested: [], alone: [] };
      ((tally.get(carry) ?? 0) > 1 ? group.contested : group.alone).push(board.placement);
      groups.set(carry, group);
    });
  }

  let weighted = 0;
  let withN = 0;
  let withoutN = 0;
  for (const { contested, alone } of groups.values()) {
    if (contested.length < MIN_PER_CARRY || alone.length < MIN_PER_CARRY) continue;
    weighted += (mean(contested) - mean(alone)) * contested.length;
    withN += contested.length;
    withoutN += alone.length;
  }

  return withN > 0 ? { cost: weighted / withN, withN, withoutN } : null;
}

/**
 * Why the board-state habits carry NO adjusted cost, and must not be given one.
 *
 * Everything Riot reports about a board is recorded at elimination, so the raw
 * split between boards with and without a habit is inflated by causation
 * running backwards: dying early produces both the low level and the bad
 * placement. Held to boards knocked out in the same round, "went out at a lower
 * level" drops from 2.09 places to 0.24 in platinum/gold.
 *
 * That correction was written, measured, and then deleted, because it is worse
 * than the problem. `last_round` IS very nearly the outcome — eliminated in
 * round 24 means eighth, surviving to 36 means first or second — so holding it
 * fixed conditions on the mediator the effect travels through. Levelling sooner
 * is how a board survives longer, and surviving longer is the good placement.
 * The correction removes the real effect along with the spurious one.
 *
 * Both numbers are therefore wrong in opposite directions and the true one is
 * not identifiable from a dataset that only sees the final board. The answer is
 * not to pick whichever looks better: it is to stop claiming a cost. The panel
 * reports the split as an association and says so, and the band-to-band rate
 * comparison — which IS clean, because every band holds the same mix of
 * placements — carries the finding.
 *
 * `contestedCarry` is different and keeps its correction: it compares within
 * the same carry, which is a confounder, not a mediator.
 */

/** Riot's rarity is not cost-1, so the catalog decides what a unit costs. */
export function toHabitBoard(
  p: Participant,
  costOf: (id: string) => number,
  extra: { contested?: boolean; compExact?: boolean; compTier?: string } = {}
): HabitBoard {
  return {
    placement: p.placement,
    level: p.level,
    goldLeft: p.goldLeft,
    units: p.units.map((u) => ({
      id: u.character_id,
      stars: u.tier,
      cost: costOf(u.character_id),
      items: u.items,
    })),
    ...extra,
  };
}

/**
 * Boards grouped by lobby, because being contested is a fact about a table and
 * disappears the moment every board is thrown into one list.
 *
 * compExact and compTier are left unset: the band's tier list does not exist yet
 * when this runs. A habit with no input is skipped rather than guessed, so those
 * two simply do not appear in the published file — which is also, correctly,
 * what happens for a band too thin to publish comps at all.
 */
export function aggregateHabits(
  lobbies: Participant[][],
  costOf: (id: string) => number
): HabitTable {
  // The board and the round it ended on travel together. They were two parallel
  // arrays first, lined up by index — which works right up until someone filters
  // one of them and the correction below silently pairs the wrong rows.
  const scored: { board: HabitBoard; lastRound: number; placement: number }[] = [];
  for (const lobby of lobbies) {
    const carries = lobby.map(primaryCarry);
    const tally = new Map<string, number>();
    for (const c of carries) if (c) tally.set(c, (tally.get(c) ?? 0) + 1);

    lobby.forEach((p, i) => {
      const carry = carries[i];
      scored.push({
        board: toHabitBoard(p, costOf, {
          // A board with no carry at all cannot answer the question; undefined
          // keeps it out of the denominator rather than counting it as calm.
          contested: carry ? (tally.get(carry) ?? 0) > 1 : undefined,
        }),
        lastRound: p.lastRound ?? 0,
        placement: p.placement,
      });
    });
  }

  const table = measureHabits(scored.map((s) => s.board));

  /**
   * Every habit gets a second, better-measured cost beside the raw split rather
   * than instead of it — habits.json must never give one field name two
   * meanings — and the coach prefers it when it is there.
   *
   * Which correction depends on what confounds that habit. Board state is
   * recorded at elimination, so anything read off the board is entangled with
   * how long its player survived; those compare within elimination round.
   * Being contested is not about survival at all — its raw gap is flattened
   * because strong comps get contested more — so it keeps the within-carry
   * comparison calibrate.ts established.
   */
  const contested = contestedCost(lobbies);
  if (table.contestedCarry && contested) {
    table.contestedCarry.adjustedCost = contested.cost;
    table.contestedCarry.adjustedWithN = contested.withN;
    table.contestedCarry.adjustedWithoutN = contested.withoutN;
  }

  return table;
}
