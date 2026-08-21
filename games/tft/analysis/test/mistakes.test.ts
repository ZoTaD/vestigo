import { describe, it, expect } from "vitest";
import { toLobby } from "../src/normalize";
import { findMistakes } from "../src/mistakes";
import { defaultCalibration } from "../src/context";
import type { Board } from "../src/types";

import lobbyFixture from "./fixtures/NA1_5605803885.json";

const lobby = toLobby((lobbyFixture as { match: unknown }).match);
const board = (name: string): Board => {
  const b = lobby.boards.find((x) => x.gameName === name);
  if (!b) throw new Error(`no board for ${name}`);
  return b;
};

/** Minimal board for the cases the fixtures do not happen to contain. */
function make(over: Partial<Board> = {}): Board {
  return {
    puuid: "p",
    gameName: "test",
    tagLine: "0",
    placement: 5,
    level: 8,
    goldLeft: 0,
    lastRound: 30,
    units: [{ id: "TFT17_Ahri", stars: 2, cost: 4, items: ["a", "b", "c"] }],
    traits: [],
    ...over,
  };
}

describe("findMistakes", () => {
  // 大狗叫叫叫 finished 7th holding 34 gold — real, unedited fixture data.
  it("flags gold left unspent, using the calibrated band", () => {
    const gold = findMistakes(board("大狗叫叫叫")).find((f) => f.id === "mistake-gold");
    expect(gold).toBeDefined();
    expect(gold!.severity).toBe("medium");
    expect(gold!.detail).toContain("34");
  });

  it("escalates when the pile is huge", () => {
    const gold = findMistakes(make({ goldLeft: 60 })).find((f) => f.id === "mistake-gold");
    expect(gold!.severity).toBe("high");
  });

  it("stays quiet about a normal amount of leftover gold", () => {
    expect(findMistakes(make({ goldLeft: 8 })).some((f) => f.id === "mistake-gold")).toBe(
      false
    );
  });

  it("flags a carry that never got its third item", () => {
    const me = make({ units: [{ id: "TFT17_Ahri", stars: 2, cost: 4, items: ["a"] }] });
    const found = findMistakes(me).find((f) => f.id === "mistake-carry-items");
    expect(found).toBeDefined();
    // Rare, but those boards place around two full places worse.
    expect(found!.severity).toBe("high");
    expect(found!.evidence).toMatch(/of boards end that way/);
  });

  it("quotes the calibration it was given, not a number frozen in the code", () => {
    const calibration = {
      ...defaultCalibration,
      carryItems: { full: 3, shortRate: 0.077, shortAvg: 7.11, fullAvg: 4.02 },
    };
    const me = make({ units: [{ id: "TFT17_Ahri", stars: 2, cost: 4, items: ["a"] }] });
    const found = findMistakes(me, { calibration }).find(
      (f) => f.id === "mistake-carry-items"
    );
    expect(found!.evidence).toContain("7.7%");
    expect(found!.evidence).toContain("7.11");
    expect(found!.evidence).toContain("4.02");
  });

  it("moves the gold threshold with the calibration", () => {
    const calibration = {
      ...defaultCalibration,
      gold: { ...defaultCalibration.gold, wastedFrom: 40, severeFrom: 80 },
    };
    // 30 gold is over the default threshold but under the injected one.
    expect(findMistakes(make({ goldLeft: 30 }), { calibration }).some((f) => f.id === "mistake-gold")).toBe(false);
    expect(findMistakes(make({ goldLeft: 45 }), { calibration }).some((f) => f.id === "mistake-gold")).toBe(true);
  });

  it("says nothing when the carry is fully itemized", () => {
    expect(findMistakes(make()).some((f) => f.id === "mistake-carry-items")).toBe(false);
  });

  it("no longer restates breakpoint arithmetic as if it were advice", () => {
    // "You had 3, one more makes 4" is a fact the player can see. It measured
    // 0.10 placements of signal, so it is metaGap's job now.
    const me = make({ traits: [{ id: "Vanguard", units: 3, tier: 1, maxTier: 3 }] });
    expect(findMistakes(me).some((f) => f.id === "mistake-breakpoint")).toBe(false);
  });

  it("does not check level, which the store showed carries no signal", () => {
    const me = make({ level: 4, lastRound: 38 });
    expect(findMistakes(me).some((f) => f.id.includes("level"))).toBe(false);
  });

  it("survives an empty board", () => {
    expect(() => findMistakes(make({ units: [], traits: [] }))).not.toThrow();
  });
});
