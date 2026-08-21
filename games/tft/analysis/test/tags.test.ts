import { describe, it, expect } from "vitest";
import { findPlayerTags } from "../src/tags";
import type { HistoryEntry } from "../src/history";

/**
 * Built from made-up histories rather than a real account: a tag has to fire
 * for a reason we can state, and a fixture pulled from someone's profile would
 * drift the day they played another game.
 *
 * Entries are newest-first, the order the profile keeps them in.
 */
type Unit = { id: string; name: string; isCarry: boolean; stars: number };

function entry(placement: number, units: Unit[] = []): HistoryEntry {
  return { matchId: `m${Math.random()}`, placement, compKey: "k", compLabel: "l", findingIds: [], units };
}

const unit = (id: string, isCarry = false, stars = 2): Unit => ({ id, name: id, isCarry, stars });

/** Newest first, so pass results in the order they were played and flip. */
const played = (places: number[], units: (i: number) => Unit[] = () => []) =>
  places.map((p, i) => entry(p, units(i))).reverse();

describe("findPlayerTags", () => {
  it("says nothing about a short history", () => {
    expect(findPlayerTags(played([1, 1, 1, 1]))).toEqual([]);
  });

  it("spots a player who rides top-4 streaks", () => {
    const tags = findPlayerTags(played([1, 2, 3, 4, 2, 1, 3, 8, 7, 2]));
    const chain = tags.find((t) => t.id === "chainWins");
    expect(chain).toBeDefined();
    expect(chain!.value).toBeGreaterThanOrEqual(0.6);
  });

  it("spots the opposite: bad results that follow each other", () => {
    const tags = findPlayerTags(played([8, 7, 6, 5, 8, 7, 1, 6, 8, 5]));
    expect(tags.some((t) => t.id === "chainLosses")).toBe(true);
    expect(tags.some((t) => t.id === "chainWins")).toBe(false);
  });

  it("never calls the same history both streaky and not", () => {
    const tags = findPlayerTags(played([1, 8, 2, 7, 3, 6, 4, 5, 1, 8]));
    expect(tags.some((t) => t.id === "chainWins") && tags.some((t) => t.id === "chainLosses")).toBe(
      false
    );
  });

  it("calls out forcing the same board every game", () => {
    const same = [unit("a"), unit("b"), unit("c"), unit("d")];
    const tags = findPlayerTags(played(Array(10).fill(4), () => same));
    const forcer = tags.find((t) => t.id === "forcer");
    expect(forcer).toBeDefined();
    expect(forcer!.value).toBeCloseTo(1, 5);
    expect(tags.some((t) => t.id === "flexible")).toBe(false);
  });

  it("calls out a player who never repeats a board", () => {
    const tags = findPlayerTags(played(Array(10).fill(4), (i) => [
      unit(`x${i}`),
      unit(`y${i}`),
      unit(`z${i}`),
    ]));
    expect(tags.some((t) => t.id === "flexible")).toBe(true);
    expect(tags.some((t) => t.id === "forcer")).toBe(false);
  });

  it("names the unit you carry best", () => {
    const tags = findPlayerTags(
      played([2, 3, 2, 1, 3, 8, 7, 8, 6, 7], (i) =>
        i < 5 ? [unit("Jinx", true), unit("filler")] : [unit("filler")]
      )
    );
    const god = tags.find((t) => t.id === "unitGod");
    expect(god).toBeDefined();
    expect(god!.detail).toBe("Jinx");
    expect(god!.value).toBeLessThanOrEqual(4);
  });

  it("ignores a unit you played a lot but never carried", () => {
    const tags = findPlayerTags(
      played([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], () => [unit("Jinx", false)])
    );
    expect(tags.some((t) => t.id === "unitGod")).toBe(false);
  });

  it("ignores a carry you play often and place badly with", () => {
    const tags = findPlayerTags(
      played([7, 8, 6, 7, 8, 6, 7, 8, 6, 7], () => [unit("Jinx", true)])
    );
    expect(tags.some((t) => t.id === "unitGod")).toBe(false);
  });

  it("spots a three-star habit", () => {
    const tags = findPlayerTags(
      played([4, 4, 4, 4, 4, 4, 4, 4, 4, 4], (i) =>
        i < 6 ? [unit("Poppy", true, 3)] : [unit("Poppy", true, 2)]
      )
    );
    const roll = tags.find((t) => t.id === "highRoller");
    expect(roll).toBeDefined();
    expect(roll!.detail).toBe(6);
  });

  it("survives a history with no board data at all", () => {
    // Older callers built entries before units were carried on them.
    const bare = Array.from({ length: 10 }, (_, i) => entry(i % 8 + 1));
    expect(() => findPlayerTags(bare)).not.toThrow();
    expect(findPlayerTags(bare).every((t) => t.id !== "forcer")).toBe(true);
  });
});
