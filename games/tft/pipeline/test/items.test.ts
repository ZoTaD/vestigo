import { describe, it, expect } from "vitest";
import { aggregateItems } from "../src/aggregate/items";
import type { Participant } from "../src/aggregate/signature";

// Every item is craftable here unless a test says otherwise.
const craftable = () => true;

function board(
  placement: number,
  units: { id: string; items?: string[] }[]
): Participant {
  return {
    puuid: "x",
    placement,
    level: 8,
    goldLeft: 0,
    traits: [{ name: "TFT17_Sorcerer", numUnits: 4, tierCurrent: 2, tierTotal: 4 }],
    units: units.map((u) => ({
      character_id: u.id,
      tier: 2,
      rarity: 2,
      items: u.items ?? [],
    })),
  };
}

describe("aggregateItems", () => {
  it("counts a board once even when the item sits on two of its units", () => {
    const items = aggregateItems(
      [
        board(2, [
          { id: "Zoe", items: ["Guinsoo"] },
          { id: "Poppy", items: ["Guinsoo"] },
        ]),
        board(4, [{ id: "Zoe", items: ["Guinsoo"] }]),
      ],
      2,
      craftable
    );
    const g = items.find((i) => i.id === "Guinsoo")!;
    // Two boards fielded it, not three copies.
    expect(g.games).toBe(2);
    expect(g.avgPlacement).toBe(3);
  });

  it("measures how much better boards place with the item than without it", () => {
    const items = aggregateItems(
      [
        board(1, [{ id: "Zoe", items: ["Guinsoo"] }]),
        board(3, [{ id: "Zoe", items: ["Guinsoo"] }]),
        board(7, [{ id: "Poppy", items: ["Warmogs"] }]),
        board(8, [{ id: "Poppy", items: ["Warmogs"] }]),
      ],
      2,
      craftable
    );
    const g = items.find((i) => i.id === "Guinsoo")!;
    expect(g.avgPlacement).toBe(2);
    expect(g.avgPlacementWithout).toBe(7.5);
    expect(g.delta).toBe(2 - 7.5);
  });

  it("names the units that carry the item, most often first", () => {
    const items = aggregateItems(
      [
        board(1, [{ id: "Zoe", items: ["Guinsoo"] }]),
        board(2, [{ id: "Zoe", items: ["Guinsoo"] }]),
        board(8, [{ id: "Poppy", items: ["Guinsoo"] }]),
      ],
      3,
      craftable
    );
    const g = items.find((i) => i.id === "Guinsoo")!;
    expect(g.bestUnits[0].id).toBe("Zoe");
    expect(g.bestUnits[0].games).toBe(2);
    expect(g.bestUnits[0].avgPlacement).toBe(1.5);
    expect(g.bestUnits[1].id).toBe("Poppy");
  });

  it("keeps only craftable items and drops anything below the sample floor", () => {
    const only = (id: string) => id === "Guinsoo";
    const items = aggregateItems(
      [
        board(1, [{ id: "Zoe", items: ["Guinsoo", "BFSword"] }]),
        board(2, [{ id: "Zoe", items: ["Guinsoo", "BFSword"] }]),
        board(3, [{ id: "Poppy", items: ["Warmogs"] }]),
      ],
      2,
      only
    );
    // BFSword is a component (not craftable); Warmogs appears once, below the floor.
    expect(items.find((i) => i.id === "BFSword")).toBeUndefined();
    expect(items.find((i) => i.id === "Warmogs")).toBeUndefined();
    expect(items.find((i) => i.id === "Guinsoo")).toBeDefined();
  });

  it("orders by how often an item is built", () => {
    const items = aggregateItems(
      [
        board(1, [{ id: "Zoe", items: ["Guinsoo"] }]),
        board(2, [{ id: "Zoe", items: ["Guinsoo"] }]),
        board(3, [{ id: "Zoe", items: ["Guinsoo", "Warmogs"] }]),
      ],
      1,
      craftable
    );
    expect(items[0].id).toBe("Guinsoo");
  });
});
