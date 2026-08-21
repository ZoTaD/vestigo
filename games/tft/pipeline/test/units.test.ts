import { describe, it, expect } from "vitest";
import { aggregateUnits } from "../src/aggregate/units";
import type { Participant } from "../src/aggregate/signature";

// Summon carries cost 0, ElderDragon the sentinel 11: both are non-champions
// that share the unit list in a real payload and must be dropped.
const COSTS: Record<string, number> = {
  Zoe: 4, Poppy: 1, Shen: 5, Ornn: 3, Summon: 0, ElderDragon: 11,
};
const costOf = (id: string) => COSTS[id] ?? 0;

function board(
  placement: number,
  units: { id: string; tier?: number; items?: string[] }[]
): Participant {
  return {
    puuid: "x",
    placement,
    level: 8,
    goldLeft: 0,
    traits: [{ name: "TFT17_Sorcerer", numUnits: 4, tierCurrent: 2, tierTotal: 4 }],
    units: units.map((u) => ({
      character_id: u.id,
      tier: u.tier ?? 2,
      rarity: 2,
      items: u.items ?? [],
    })),
  };
}

describe("aggregateUnits", () => {
  it("counts boards fielding a unit, collapsing duplicates, with its average placement", () => {
    const units = aggregateUnits(
      [
        // A board can field the same champion twice; it must count once.
        board(1, [{ id: "Zoe" }, { id: "Zoe" }]),
        board(3, [{ id: "Zoe" }]),
        board(5, [{ id: "Poppy" }]),
      ],
      2,
      costOf
    );
    const zoe = units.find((u) => u.id === "Zoe")!;
    expect(zoe.games).toBe(2);
    expect(zoe.avgPlacement).toBe(2);
    expect(zoe.playRate).toBeCloseTo(2 / 3, 5);
  });

  it("measures how much better boards place with the unit than without it", () => {
    const units = aggregateUnits(
      [
        board(1, [{ id: "Zoe" }]),
        board(3, [{ id: "Zoe" }]),
        board(7, [{ id: "Poppy" }]),
        board(8, [{ id: "Poppy" }]),
      ],
      2,
      costOf
    );
    const zoe = units.find((u) => u.id === "Zoe")!;
    expect(zoe.avgPlacement).toBe(2);
    expect(zoe.avgPlacementWithout).toBe(7.5);
    // Negative means boards place better with the unit than without.
    expect(zoe.delta).toBe(2 - 7.5);
  });

  it("breaks placement down by star level, since a reroll unit lives and dies on 3 stars", () => {
    const units = aggregateUnits(
      [
        board(1, [{ id: "Poppy", tier: 3 }]),
        board(2, [{ id: "Poppy", tier: 3 }]),
        board(6, [{ id: "Poppy", tier: 2 }]),
      ],
      3,
      costOf
    );
    const poppy = units.find((u) => u.id === "Poppy")!;
    const three = poppy.stars.find((s) => s.tier === 3)!;
    const two = poppy.stars.find((s) => s.tier === 2)!;
    expect(three.games).toBe(2);
    expect(three.avgPlacement).toBe(1.5);
    expect(two.avgPlacement).toBe(6);
  });

  it("reports how often the unit is itemized and what the winners build on it", () => {
    const units = aggregateUnits(
      [
        board(1, [{ id: "Zoe", items: ["IE", "JG", "HOJ"] }]),
        board(2, [{ id: "Zoe", items: ["IE"] }]),
        board(8, [{ id: "Zoe", items: [] }]),
      ],
      3,
      costOf
    );
    const zoe = units.find((u) => u.id === "Zoe")!;
    expect(zoe.itemizedRate).toBeCloseTo(2 / 3, 5);
    // Items come from the top-4 boards, so the eighth-place empty build is ignored.
    expect(zoe.topItems[0].id).toBe("IE");
    expect(zoe.topItems[0].games).toBe(2);
  });

  it("drops non-champion units and anything below the sample floor", () => {
    const units = aggregateUnits(
      [
        board(1, [{ id: "Zoe" }, { id: "Summon" }, { id: "ElderDragon" }]),
        board(2, [{ id: "Zoe" }, { id: "Summon" }, { id: "ElderDragon" }]),
        board(3, [{ id: "Poppy" }]),
      ],
      2,
      costOf
    );
    // Cost 0 (spawned) and cost 11 (the PvE sentinel) are both non-champions.
    expect(units.find((u) => u.id === "Summon")).toBeUndefined();
    expect(units.find((u) => u.id === "ElderDragon")).toBeUndefined();
    // Poppy appears once, below the floor of 2.
    expect(units.find((u) => u.id === "Poppy")).toBeUndefined();
    expect(units.find((u) => u.id === "Zoe")).toBeDefined();
  });

  it("orders by how often a unit is played, never by its cost", () => {
    const units = aggregateUnits(
      [
        board(1, [{ id: "Poppy" }]),
        board(2, [{ id: "Poppy" }]),
        board(3, [{ id: "Poppy" }, { id: "Shen" }]),
        board(4, [{ id: "Poppy" }]),
      ],
      1,
      costOf
    );
    // Poppy (1-cost, 4 games) must outrank Shen (5-cost, 1 game): cost is a shop
    // price, not a measure of importance.
    expect(units[0].id).toBe("Poppy");
  });
});
