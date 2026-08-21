import { describe, it, expect } from "vitest";
import { toStageRound, formatRound, isCarousel, eliminatesPlayers } from "../src/rounds";

// The mapping below was derived empirically from 3758 real boards, not from a
// wiki: rounds where nobody is ever eliminated are exactly the carousel (X-4)
// and PvE (X-7) rounds. See docs/design/2026-07-22-fase3-buscador-analizador.md
describe("toStageRound", () => {
  it("keeps stage 1 flat, since it only has 4 rounds", () => {
    expect(toStageRound(1)).toEqual({ stage: 1, round: 1 });
    expect(toStageRound(4)).toEqual({ stage: 1, round: 4 });
  });

  it("starts stage 2 at round 5 and gives every later stage 7 rounds", () => {
    expect(toStageRound(5)).toEqual({ stage: 2, round: 1 });
    expect(toStageRound(11)).toEqual({ stage: 2, round: 7 });
    expect(toStageRound(12)).toEqual({ stage: 3, round: 1 });
  });

  it("maps the empirically observed no-elimination rounds to X-4 and X-7", () => {
    expect(formatRound(15)).toBe("3-4");
    expect(formatRound(22)).toBe("4-4");
    expect(formatRound(25)).toBe("4-7");
    expect(formatRound(29)).toBe("5-4");
    expect(formatRound(32)).toBe("5-7");
    expect(formatRound(36)).toBe("6-4");
    expect(formatRound(39)).toBe("6-7");
  });

  it("maps the longest observed game to 7-3", () => {
    expect(formatRound(42)).toBe("7-3");
  });

  it("flags the carousel rounds", () => {
    expect(isCarousel(22)).toBe(true); // 4-4
    expect(isCarousel(29)).toBe(true); // 5-4
    expect(isCarousel(23)).toBe(false); // 4-5
  });

  it("marks exactly the rounds where the store shows almost no eliminations", () => {
    for (const quiet of [15, 22, 25, 29, 32, 36, 39]) {
      expect(eliminatesPlayers(quiet), `round ${quiet}`).toBe(false);
    }
    for (const busy of [19, 24, 27, 30, 33, 37, 42]) {
      expect(eliminatesPlayers(busy), `round ${busy}`).toBe(true);
    }
  });
});
