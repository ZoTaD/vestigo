import { describe, it, expect } from "vitest";
import { findHistoryInsights, type HistoryEntry } from "../src/history";

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    matchId: "M",
    placement: 4,
    compKey: "A",
    compLabel: "Comp A",
    findingIds: [],
    ...over,
  };
}

/** n entries, each carrying the same findings. */
const many = (n: number, over: Partial<HistoryEntry> = {}) =>
  Array.from({ length: n }, (_, i) => entry({ matchId: `M${i}`, ...over }));

describe("findHistoryInsights", () => {
  it("says nothing on a history too short to hold a pattern", () => {
    expect(findHistoryInsights(many(5, { findingIds: ["mistake-gold"] }))).toEqual([]);
  });

  it("names the slip that keeps coming back", () => {
    const history = [
      ...many(4, { findingIds: ["mistake-gold"] }),
      ...many(6, { findingIds: [] }),
    ];
    const found = findHistoryInsights(history).find((i) => i.id === "history-habit");
    expect(found).toBeDefined();
    expect(found!.title).toContain("gold unspent");
    expect(found!.detail).toContain("4 of your last 10");
  });

  it("counts a habit once per match, not once per finding", () => {
    // Three missing units in one game is one occurrence of one habit.
    const history = [
      ...many(3, {
        findingIds: ["metagap-missing-TFT17_Shen", "metagap-missing-TFT17_Jhin", "metagap-missing-TFT17_Ornn"],
      }),
      ...many(7, { findingIds: [] }),
    ];
    const found = findHistoryInsights(history).find((i) => i.id === "history-habit");
    expect(found!.detail).toContain("3 of your last 10");
  });

  it("ignores a slip that is rare enough to be variance", () => {
    const history = [
      ...many(2, { findingIds: ["mistake-gold"] }),
      ...many(18, { findingIds: [] }),
    ];
    expect(findHistoryInsights(history).some((i) => i.id === "history-habit")).toBe(false);
  });

  it("never reports context findings as a mistake", () => {
    const history = many(10, { findingIds: ["metagap-comp", "mode-not-comparable"] });
    expect(findHistoryInsights(history).some((i) => i.id === "history-habit")).toBe(false);
  });

  it("escalates a habit that shows up in most games", () => {
    const history = [
      ...many(6, { findingIds: ["mistake-gold"] }),
      ...many(4, { findingIds: [] }),
    ];
    const found = findHistoryInsights(history).find((i) => i.id === "history-habit");
    expect(found!.severity).toBe("high");
  });

  // The point of this one: the meta can be right about a comp and it can still
  // be the wrong comp for this player.
  it("flags a comp that goes worse for this player than their own average", () => {
    const history = [
      ...many(4, { compKey: "bad", compLabel: "N.O.V.A. Kindred", placement: 7 }),
      ...many(4, { compKey: "ok", compLabel: "Space Groove Blitzcrank", placement: 2 }),
    ];
    const found = findHistoryInsights(history).find((i) => i.id === "history-comp-worst");
    expect(found).toBeDefined();
    expect(found!.title).toContain("N.O.V.A. Kindred");
    expect(found!.detail).toContain("7.0");
  });

  it("also names the comp that works best for them", () => {
    const history = [
      ...many(4, { compKey: "bad", compLabel: "Mala", placement: 7 }),
      ...many(4, { compKey: "ok", compLabel: "Buena", placement: 2 }),
    ];
    const found = findHistoryInsights(history).find((i) => i.id === "history-comp-best");
    expect(found!.title).toContain("Buena");
  });

  it("ignores a comp played too few times to judge", () => {
    const history = [
      ...many(2, { compKey: "rare", compLabel: "Rara", placement: 8 }),
      ...many(8, { compKey: "usual", compLabel: "Usual", placement: 3 }),
    ];
    expect(findHistoryInsights(history).some((i) => i.id === "history-comp-worst")).toBe(false);
  });

  it("stays quiet when every comp performs about the same", () => {
    const history = [
      ...many(5, { compKey: "a", compLabel: "A", placement: 4 }),
      ...many(5, { compKey: "b", compLabel: "B", placement: 4 }),
    ];
    const ids = findHistoryInsights(history).map((i) => i.id);
    expect(ids).not.toContain("history-comp-worst");
    expect(ids).not.toContain("history-comp-best");
  });
});
