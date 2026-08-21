import { describe, it, expect } from "vitest";
import { findMetaGap, matchComp } from "../src/metaGap";
import type { Board } from "../src/types";
import type { CompReference, CompUnitRef } from "../src/metaGap";

import compsFile from "../../data/comps.json";

const comps = (compsFile as { comps: CompReference[] }).comps;

/** A board playing the SpaceGroove/Blitzcrank comp from the real dataset. */
function spaceGroove(over: Partial<Board> = {}): Board {
  return {
    puuid: "p",
    gameName: "test",
    tagLine: "0",
    placement: 5,
    level: 9,
    goldLeft: 0,
    lastRound: 33,
    units: [
      { id: "TFT17_Blitzcrank", stars: 2, cost: 5, items: ["a", "b", "c"] },
      { id: "TFT17_Nami", stars: 2, cost: 2, items: ["d"] },
      { id: "TFT17_Ornn", stars: 2, cost: 4, items: [] },
      { id: "TFT17_Pantheon", stars: 2, cost: 1, items: [] },
    ],
    traits: [{ id: "TFT17_SpaceGroove", units: 6, tier: 3, maxTier: 4 }],
    ...over,
  };
}

/**
 * A synthetic comp, so the thresholds are pinned by the test rather than by
 * whatever the live dataset happens to hold today.
 */
function unit(id: string, over: Partial<CompUnitRef> = {}): CompUnitRef {
  return {
    id,
    frequency: 0.9,
    core: true,
    itemizedRate: 0.5,
    items: [],
    boards: 50,
    winnerRate: 0.5,
    loserRate: 0.5,
    avgPlacementWith: 4.5,
    avgPlacementWithout: 4.5,
    winnerBoards: 25,
    loserBoards: 25,
    winnerItems: [],
    ...over,
  };
}

function synthetic(units: CompUnitRef[]): CompReference[] {
  return [
    {
      signature: "TFT17_SpaceGroove|TFT17_Blitzcrank",
      trait: "TFT17_SpaceGroove",
      carries: ["TFT17_Blitzcrank"],
      tier: "S",
      avgPlacement: 3.1,
      avgLevel: 9,
      count: 50,
      units,
      winners: { boards: 25, avgPlacement: 2.2, avgLevel: 9.4, avgGoldLeft: 5 },
      losers: { boards: 25, avgPlacement: 6.1, avgLevel: 8.3, avgGoldLeft: 12 },
    },
  ];
}

describe("matchComp", () => {
  // The pipeline merges spellings of the same comp, so a board naming itself
  // "SpaceGroove|Blitzcrank" must still match exactly even though the comp is
  // filed under the spelling that won the count.
  it("matches a board against every spelling the comp absorbed", () => {
    const match = matchComp(spaceGroove(), comps);
    expect(match?.exact).toBe(true);
    const spellings = [match!.comp.signature, ...(match!.comp.signatures ?? [])];
    expect(spellings).toContain("TFT17_SpaceGroove|TFT17_Blitzcrank");
  });

  it("refuses a match built on only a handful of shared units", () => {
    const thin = spaceGroove({ traits: [{ id: "TFT17_Nada", units: 2, tier: 1, maxTier: 3 }] });
    expect(thin.units).toHaveLength(4);
    expect(matchComp(thin, comps)).toBeNull();
  });
});

describe("findMetaGap", () => {
  it("names the comp it recognised, with its tier", () => {
    const found = findMetaGap(spaceGroove(), comps).find((f) => f.id === "metagap-comp");
    expect(found).toBeDefined();
    expect(found!.detail).toMatch(/tier/i);
  });

  it("treats a merged spelling as exact, not as a loose resemblance", () => {
    const found = findMetaGap(spaceGroove(), comps).find((f) => f.id === "metagap-comp");
    expect(found!.title).toMatch(/^You were playing/);
  });

  // The whole point: a unit the winners had and the losers did not.
  it("flags a missing unit that separates the top 4 from the bottom 4", () => {
    const board = spaceGroove();
    const found = findMetaGap(
      board,
      synthetic([
        unit("TFT17_Blitzcrank"),
        unit("TFT17_Shen", {
          winnerRate: 0.88,
          loserRate: 0.24,
          avgPlacementWith: 3.0,
          avgPlacementWithout: 6.2,
        }),
      ])
    ).find((f) => f.id === "metagap-missing-TFT17_Shen");

    expect(found).toBeDefined();
    expect(found!.severity).toBe("high");
    expect(found!.detail).toContain("88%");
    expect(found!.detail).toContain("24%");
    // It shows the placement gap, not just the frequency.
    expect(found!.detail).toContain("6.2");
    expect(found!.evidence).toContain("25");
  });

  it("stays silent about a unit both halves field equally", () => {
    // Common in the comp, but it does not separate winners from losers.
    const found = findMetaGap(
      spaceGroove(),
      synthetic([unit("TFT17_Shen", { winnerRate: 0.9, loserRate: 0.88 })])
    );
    expect(found.some((f) => f.id.startsWith("metagap-missing"))).toBe(false);
  });

  it("ignores a lift that rests on almost no boards", () => {
    const found = findMetaGap(
      spaceGroove(),
      synthetic([
        unit("TFT17_Shen", {
          winnerRate: 0.9,
          loserRate: 0.1,
          avgPlacementWith: 2,
          avgPlacementWithout: 7,
          winnerBoards: 2,
          loserBoards: 1,
        }),
      ])
    );
    expect(found.some((f) => f.id.startsWith("metagap-missing"))).toBe(false);
  });

  it("flags a unit on the board that the winning boards leave out", () => {
    const found = findMetaGap(
      spaceGroove(),
      synthetic([
        unit("TFT17_Blitzcrank"),
        unit("TFT17_Nami", {
          winnerRate: 0.3,
          loserRate: 0.78,
          avgPlacementWith: 5.6,
          avgPlacementWithout: 3.9,
        }),
      ])
    ).find((f) => f.id === "metagap-dragging-TFT17_Nami");

    expect(found).toBeDefined();
    expect(found!.detail).toContain("30%");
    expect(found!.detail).toContain("78%");
  });

  it("compares level against the winners, not against everyone", () => {
    const found = findMetaGap(spaceGroove({ level: 8 }), synthetic([unit("TFT17_Blitzcrank")])).find(
      (f) => f.id === "metagap-level"
    );
    expect(found).toBeDefined();
    // 9.4 is the winners' average; 8.3 is the losers'. Both are shown.
    expect(found!.detail).toContain("9.4");
    expect(found!.detail).toContain("8.3");
  });

  it("says nothing about level when the board matched the winners", () => {
    const found = findMetaGap(spaceGroove({ level: 10 }), synthetic([unit("TFT17_Blitzcrank")]));
    expect(found.some((f) => f.id === "metagap-level")).toBe(false);
  });

  it("prefers the items the winners built on the carry", () => {
    const found = findMetaGap(
      spaceGroove(),
      synthetic([
        unit("TFT17_Blitzcrank", {
          items: [{ id: "TFT_Item_Wrong", count: 40 }],
          winnerItems: [{ id: "TFT_Item_Right", count: 20 }],
          winnerBoards: 25,
        }),
      ])
    ).find((f) => f.id === "metagap-items");

    expect(found).toBeDefined();
    expect(found!.detail).toContain("Right");
    expect(found!.detail).not.toContain("Wrong");
  });

  it("never claims missing units or a tier verdict on a loose match", () => {
    const core = comps
      .find((c) => c.units.filter((u) => u.frequency >= 0.8).length >= 6)!
      .units.filter((u) => u.frequency >= 0.8)
      .slice(0, 6)
      .map((u) => ({ id: u.id, stars: 2, cost: 3, items: [] }));
    const loose = spaceGroove({
      units: core,
      level: 4,
      traits: [{ id: "TFT17_Nada", units: 2, tier: 1, maxTier: 3 }],
    });
    const found = findMetaGap(loose, comps);
    expect(found.some((f) => f.id.startsWith("metagap-missing"))).toBe(false);
    expect(found.some((f) => f.id === "metagap-level")).toBe(false);
    expect(found.find((f) => f.id === "metagap-comp")!.detail).not.toMatch(/tier/i);
  });

  it("reports nothing at all when no comp resembles the board", () => {
    const alien = spaceGroove({
      units: [{ id: "TFT17_Nobody", stars: 1, cost: 1, items: [] }],
      traits: [],
    });
    expect(findMetaGap(alien, comps)).toEqual([]);
  });

  it("survives an empty comp dataset", () => {
    expect(findMetaGap(spaceGroove(), [])).toEqual([]);
  });
});
