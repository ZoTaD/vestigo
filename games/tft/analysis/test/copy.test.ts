import { describe, it, expect } from "vitest";
import { findMistakes } from "../src/mistakes";
import { findHistoryInsights, type HistoryEntry } from "../src/history";
import { COPY } from "../src/copy";
import type { Board } from "../src/types";

function make(over: Partial<Board> = {}): Board {
  return {
    puuid: "p",
    gameName: "test",
    tagLine: "0",
    placement: 7,
    level: 8,
    goldLeft: 60,
    lastRound: 30,
    units: [{ id: "TFT17_Ahri", stars: 2, cost: 4, items: ["a"] }],
    traits: [],
    ...over,
  };
}

const history = (n: number): HistoryEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    matchId: `m${i}`,
    placement: 5,
    compKey: "sig",
    compLabel: "Some Comp",
    findingIds: ["mistake-gold"],
  }));

describe("analyzer copy", () => {
  it("writes findings in English by default and Spanish on request", () => {
    const en = findMistakes(make()).find((f) => f.id === "mistake-gold")!;
    const es = findMistakes(make(), { lang: "es" }).find((f) => f.id === "mistake-gold")!;

    expect(en.title).toMatch(/gold/i);
    expect(es.title).toMatch(/oro/i);
    // The measured figure is the point of the finding, so it survives translation.
    expect(en.title).toContain("60");
    expect(es.title).toContain("60");
  });

  it("translates history insights too, keeping the counts", () => {
    const en = findHistoryInsights(history(10)).find((i) => i.id === "history-habit")!;
    const es = findHistoryInsights(history(10), { lang: "es" }).find(
      (i) => i.id === "history-habit"
    )!;

    expect(en.detail).toContain("10");
    expect(es.detail).toContain("10");
    expect(en.detail).not.toEqual(es.detail);
  });

  it("names every habit in both languages, so no id renders blank", () => {
    const ids = Object.keys(COPY.en.history.habits);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(COPY.es.history.habits[id], id).toBeTruthy();
    }
    expect(Object.keys(COPY.es.history.habits).sort()).toEqual(ids.sort());
  });

  it("orders placements the way each language writes them", () => {
    expect(COPY.en.ordinal(1)).toBe("1st");
    expect(COPY.en.ordinal(3)).toBe("3rd");
    expect(COPY.en.ordinal(8)).toBe("8th");
    expect(COPY.es.ordinal(8)).toBe("8°");
  });
});
