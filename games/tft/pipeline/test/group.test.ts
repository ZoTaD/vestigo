import { describe, it, expect } from "vitest";
import { aggregateComps, aggregateFromSummaries } from "../src/aggregate/group";
import { summarize } from "../src/aggregate/summary";
import type { Participant } from "../src/aggregate/signature";

const COSTS: Record<string, number> = { Zoe: 4, Ornn: 3, Nami: 4, Akali: 2, Poppy: 1, Shen: 5, Vex: 3 };
const costOf = (id: string) => COSTS[id] ?? 0;

function board(
  placement: number,
  carry: string,
  units: { id: string; tier?: number; items?: string[] }[],
  level = 8
): Participant {
  return {
    puuid: "x",
    placement,
    level,
    goldLeft: 0,
    traits: [{ name: "TFT17_Sorcerer", numUnits: 6, tierCurrent: 3, tierTotal: 4 }],
    units: units.map((u) => ({
      character_id: u.id,
      tier: u.tier ?? 2,
      rarity: 2,
      items: u.items ?? (u.id === carry ? ["IE", "JG", "HOJ"] : []),
    })),
  };
}

describe("aggregateComps item filtering", () => {
  // TFT_Item_EmptyBag is a Riot placeholder, not a real item, and it has no
  // catalog entry — so the tier list drew it as a nameless, imageless chip. Any
  // item the caller does not vouch for is dropped from what a comp displays.
  const keepReal = (id: string) => id !== "TFT_Item_EmptyBag";

  it("drops an item the predicate rejects from unit items and item priority", () => {
    const comps = aggregateComps(
      [
        board(1, "Zoe", [{ id: "Zoe", items: ["IE", "TFT_Item_EmptyBag", "JG"] }, { id: "Ornn" }]),
        board(2, "Zoe", [{ id: "Zoe", items: ["IE", "TFT_Item_EmptyBag", "JG"] }, { id: "Ornn" }]),
        board(3, "Zoe", [{ id: "Zoe", items: ["IE", "JG"] }, { id: "Ornn" }]),
      ],
      3,
      costOf,
      Infinity,
      keepReal
    );
    const carry = comps[0].units.find((u) => u.id === "Zoe")!;
    expect(carry.items.map((i) => i.id)).not.toContain("TFT_Item_EmptyBag");
    expect(carry.items.map((i) => i.id)).toContain("IE");
    expect(comps[0].itemPriority.map((i) => i.id)).not.toContain("TFT_Item_EmptyBag");
  });

  it("keeps every item when no predicate is given, so nothing else changes", () => {
    const comps = aggregateComps(
      [
        board(1, "Zoe", [{ id: "Zoe", items: ["IE", "TFT_Item_EmptyBag"] }, { id: "Ornn" }]),
        board(2, "Zoe", [{ id: "Zoe", items: ["IE", "TFT_Item_EmptyBag"] }, { id: "Ornn" }]),
      ],
      2,
      costOf
    );
    const carry = comps[0].units.find((u) => u.id === "Zoe")!;
    expect(carry.items.map((i) => i.id)).toContain("TFT_Item_EmptyBag");
  });
});

describe("aggregateComps", () => {
  it("groups boards sharing a trait+carry identity even when rosters differ", () => {
    const comps = aggregateComps(
      [
        board(1, "Zoe", [{ id: "Zoe" }, { id: "Ornn" }, { id: "Nami" }]),
        board(3, "Zoe", [{ id: "Zoe" }, { id: "Ornn" }, { id: "Shen" }]),
        board(4, "Zoe", [{ id: "Zoe" }, { id: "Ornn" }, { id: "Nami" }]),
      ],
      3,
      costOf
    );
    expect(comps).toHaveLength(1);
    expect(comps[0].count).toBe(3);
    expect(comps[0].avgPlacement).toBeCloseTo(2.667, 2);
    expect(comps[0].top4Rate).toBe(1);
  });

  it("names the carry from aggregate item investment, not one board", () => {
    const comps = aggregateComps(
      [
        board(1, "Zoe", [{ id: "Zoe", items: ["A", "B", "C"] }, { id: "Ornn", items: ["D", "E", "F"] }]),
        board(2, "Zoe", [{ id: "Zoe", items: [] }, { id: "Ornn", items: ["D", "E", "F"] }]),
        board(3, "Zoe", [{ id: "Zoe", items: [] }, { id: "Ornn", items: ["D", "E", "F"] }]),
      ],
      3,
      costOf
    );
    expect(comps[0].carry).toBe("Ornn");
    expect(comps[0].units.find((u) => u.id === "Ornn")!.itemizedRate).toBe(1);
    expect(comps[0].units.find((u) => u.id === "Zoe")!.itemizedRate).toBeCloseTo(1 / 3, 5);
  });

  it("ignores cost when ranking carries", () => {
    // Shen costs 5 and Akali 2, but Akali is the one that always holds items.
    const comps = aggregateComps(
      [
        board(1, "Akali", [{ id: "Akali", items: ["A", "B"] }, { id: "Shen", items: [] }]),
        board(2, "Akali", [{ id: "Akali", items: ["A", "B"] }, { id: "Shen", items: [] }]),
        board(3, "Akali", [{ id: "Akali", items: ["A", "B"] }, { id: "Shen", items: ["C"] }]),
      ],
      3,
      costOf
    );
    expect(comps[0].carry).toBe("Akali");
    expect(comps[0].carries[0]).toBe("Akali");
  });

  it("reports every consistently itemized unit as a carry, and every three-star unit as a target", () => {
    const comps = aggregateComps(
      [
        board(1, "Ornn", [{ id: "Ornn", tier: 3, items: ["A", "B"] }, { id: "Nami", tier: 3, items: ["C", "D"] }, { id: "Shen", items: [] }]),
        board(2, "Ornn", [{ id: "Ornn", tier: 3, items: ["A", "B"] }, { id: "Nami", tier: 3, items: ["C", "D"] }, { id: "Shen", items: [] }]),
        board(3, "Ornn", [{ id: "Ornn", tier: 2, items: ["A", "B"] }, { id: "Nami", tier: 2, items: ["C", "D"] }, { id: "Shen", items: [] }]),
      ],
      3,
      costOf
    );
    expect(comps[0].carries.sort()).toEqual(["Nami", "Ornn"]);
    expect(comps[0].starTargets.sort()).toEqual(["Nami", "Ornn"]);
    expect(comps[0].carries).not.toContain("Shen");
  });

  it("reports the share of boards a unit reaches three stars", () => {
    const comps = aggregateComps(
      [
        board(1, "Akali", [{ id: "Akali", tier: 3 }]),
        board(2, "Akali", [{ id: "Akali", tier: 3 }]),
        board(3, "Akali", [{ id: "Akali", tier: 2 }]),
      ],
      3,
      costOf
    );
    const akali = comps[0].units.find((u) => u.id === "Akali")!;
    expect(akali.threeStarRate).toBeCloseTo(2 / 3, 5);
    expect(akali.avgStars).toBeCloseTo(2.667, 2);
  });

  it("classifies a comp that three-stars a 2-cost as a 2-cost reroll", () => {
    const comps = aggregateComps(
      [
        board(1, "Akali", [{ id: "Akali", tier: 3 }, { id: "Poppy" }], 7),
        board(2, "Akali", [{ id: "Akali", tier: 3 }, { id: "Poppy" }], 7),
        board(3, "Akali", [{ id: "Akali", tier: 3 }, { id: "Poppy" }], 7),
      ],
      3,
      costOf
    );
    expect(comps[0].rerollTarget).toBe("Akali");
    expect(comps[0].archetype).toBe("reroll2");
    expect(comps[0].avgLevel).toBe(7);
  });

  it("classifies a high-level comp with no three-stars as fast8", () => {
    const comps = aggregateComps(
      [
        board(1, "Nami", [{ id: "Nami" }, { id: "Shen" }], 9),
        board(2, "Nami", [{ id: "Nami" }, { id: "Shen" }], 9),
        board(3, "Nami", [{ id: "Nami" }, { id: "Shen" }], 8),
      ],
      3,
      costOf
    );
    expect(comps[0].rerollTarget).toBe("");
    expect(comps[0].archetype).toBe("fast8");
  });

  it("ranks a unit's items by how often they are built, capped at three", () => {
    const comps = aggregateComps(
      [
        board(1, "Zoe", [{ id: "Zoe", items: ["IE", "JG", "HOJ"] }]),
        board(2, "Zoe", [{ id: "Zoe", items: ["IE", "JG", "BT"] }]),
        board(3, "Zoe", [{ id: "Zoe", items: ["IE", "RB", "BT"] }]),
      ],
      3,
      costOf
    );
    const zoe = comps[0].units.find((u) => u.id === "Zoe")!;
    expect(zoe.items.map((i) => i.id)).toEqual(["IE", "BT", "JG"]);
    expect(zoe.avgItems).toBe(3);
  });

  it("drops groups below minCount", () => {
    expect(aggregateComps([board(1, "Zoe", [{ id: "Zoe" }])], 3, costOf)).toHaveLength(0);
  });

  it("reports the comp's active synergies with their usual unit counts", () => {
    const withTraits = (placement: number, traits: { name: string; numUnits: number }[]): Participant => ({
      puuid: "x",
      placement,
      goldLeft: 0,
      level: 8,
      traits: traits.map((t) => ({ name: t.name, numUnits: t.numUnits, tierCurrent: 2, tierTotal: 4 })),
      units: [{ character_id: "Zoe", tier: 2, rarity: 2, items: ["IE"] }],
    });

    const comps = aggregateComps(
      [
        withTraits(1, [{ name: "SpaceGroove", numUnits: 5 }, { name: "Bastion", numUnits: 2 }]),
        withTraits(2, [{ name: "SpaceGroove", numUnits: 5 }, { name: "Bastion", numUnits: 2 }]),
        withTraits(3, [{ name: "SpaceGroove", numUnits: 4 }]),
      ],
      3,
      costOf
    );
    expect(comps[0].traits.map((t) => [t.id, t.units])).toEqual([
      ["SpaceGroove", 5],
      ["Bastion", 2],
    ]);
    expect(comps[0].traits[0].frequency).toBe(1);
    expect(comps[0].traits[1].frequency).toBeCloseTo(2 / 3, 5);
  });

  it("ignores per-champion unique traits when listing synergies", () => {
    const p = (placement: number): Participant => ({
      puuid: "x",
      placement,
      goldLeft: 0,
      level: 8,
      traits: [
        { name: "ZoeUniqueTrait", numUnits: 1, tierCurrent: 1, tierTotal: 1 },
        { name: "SpaceGroove", numUnits: 5, tierCurrent: 2, tierTotal: 4 },
      ],
      units: [{ character_id: "Zoe", tier: 2, rarity: 2, items: ["IE"] }],
    });
    const comps = aggregateComps([p(1), p(2), p(3)], 3, costOf);
    expect(comps[0].traits.map((t) => t.id)).toEqual(["SpaceGroove"]);
  });

  it("ranks the comp's overall item priority across every unit", () => {
    const comps = aggregateComps(
      [
        board(1, "Zoe", [{ id: "Zoe", items: ["A", "A", "B"] }, { id: "Ornn", items: ["C"] }]),
        board(2, "Zoe", [{ id: "Zoe", items: ["A", "B", "B"] }, { id: "Ornn", items: ["C"] }]),
        board(3, "Zoe", [{ id: "Zoe", items: ["A", "B", "D"] }, { id: "Ornn", items: [] }]),
      ],
      3,
      costOf
    );
    expect(comps[0].itemPriority.slice(0, 3)).toEqual([
      { id: "A", count: 4 },
      { id: "B", count: 4 },
      { id: "C", count: 2 },
    ]);
  });
});

/**
 * Two entries topped the tier list with different names and the same team. They
 * survived the roster merge because their skeletons only half overlapped: one ran
 * N.O.V.A. at 2 units, the other at 5, and each kept a different pair of flex
 * units. A player reads those as one comp, so identity has to be what the comp is
 * built around — its carry and the synergies it repeats — not the exact roster.
 */
describe("aggregateComps — comps identified by carry and core traits", () => {
  const SHARED = [
    { name: "Bastion", numUnits: 2, tierCurrent: 1, tierTotal: 3 },
    { name: "Brawler", numUnits: 2, tierCurrent: 1, tierTotal: 3 },
    { name: "Vanguard", numUnits: 2, tierCurrent: 1, tierTotal: 3 },
  ];

  /** A board whose signature is `headline|carry`, with the three shared synergies. */
  function variant(
    placement: number,
    headline: string,
    carry: string,
    others: { id: string; tier?: number }[],
    level = 9
  ): Participant {
    return {
      puuid: "x",
      placement,
      level,
      goldLeft: 0,
      traits: [
        { name: headline, numUnits: 6, tierCurrent: 3, tierTotal: 4 },
        ...SHARED,
      ],
      units: [
        { character_id: carry, tier: 2, rarity: 2, items: ["IE", "JG", "HOJ"] },
        ...others.map((u) => ({
          character_id: u.id,
          tier: u.tier ?? 2,
          rarity: 2,
          items: [] as string[],
        })),
      ],
    };
  }

  it("merges variants that share a carry, an archetype and three core traits", () => {
    const comps = aggregateComps(
      [
        // Same carry and synergies, different skeletons and headline trait, so
        // neither the signature nor the roster merge can see they are one comp.
        variant(1, "Sorcerer", "Zoe", [{ id: "Ornn" }, { id: "Nami" }]),
        variant(3, "Sorcerer", "Zoe", [{ id: "Ornn" }, { id: "Nami" }]),
        variant(2, "Duelist", "Zoe", [{ id: "Poppy" }, { id: "Shen" }]),
        variant(4, "Duelist", "Zoe", [{ id: "Poppy" }, { id: "Shen" }]),
      ],
      2,
      costOf
    );
    expect(comps).toHaveLength(1);
    expect(comps[0].count).toBe(4);
    expect(comps[0].carry).toBe("Zoe");
    // The merged comp is re-measured over every board, never a blend of averages.
    expect(comps[0].avgPlacement).toBe(2.5);
  });

  it("merges a comp with its own carries in the other order", () => {
    // The same pair of itemized units, spelled by whichever one drew more items
    // that game. Zoe and Ornn both carry here; which one leads is an accident.
    const twoCarries = (
      placement: number,
      headline: string,
      lead: string,
      second: string
    ): Participant => ({
      puuid: "x",
      placement,
      level: 9,
      goldLeft: 0,
      traits: [{ name: headline, numUnits: 6, tierCurrent: 3, tierTotal: 4 }, ...SHARED],
      units: [
        { character_id: lead, tier: 2, rarity: 2, items: ["IE", "JG", "HOJ"] },
        { character_id: second, tier: 2, rarity: 2, items: ["BT", "QSS"] },
        { character_id: "Shen", tier: 2, rarity: 2, items: [] },
      ],
    });

    const comps = aggregateComps(
      [
        twoCarries(1, "Sorcerer", "Zoe", "Ornn"),
        twoCarries(3, "Sorcerer", "Zoe", "Ornn"),
        twoCarries(2, "Duelist", "Ornn", "Zoe"),
        twoCarries(4, "Duelist", "Ornn", "Zoe"),
      ],
      2,
      costOf
    );
    expect(comps).toHaveLength(1);
    expect(comps[0].count).toBe(4);
    expect(comps[0].carries.slice().sort()).toEqual(["Ornn", "Zoe"]);
  });

  it("keeps comps apart when the carry differs, even with identical traits", () => {
    const comps = aggregateComps(
      [
        variant(1, "Sorcerer", "Zoe", [{ id: "Ornn" }, { id: "Nami" }]),
        variant(3, "Sorcerer", "Zoe", [{ id: "Ornn" }, { id: "Nami" }]),
        variant(2, "Sorcerer", "Akali", [{ id: "Poppy" }, { id: "Shen" }]),
        variant(4, "Sorcerer", "Akali", [{ id: "Poppy" }, { id: "Shen" }]),
      ],
      2,
      costOf
    );
    expect(comps).toHaveLength(2);
    expect(comps.map((c) => c.carry).sort()).toEqual(["Akali", "Zoe"]);
  });

  it("keeps a reroll comp apart from a fast-8 one that shares its carry and traits", () => {
    const comps = aggregateComps(
      [
        // Rerolling Poppy to 3 stars is a different game plan from pushing to 9,
        // even when both play Zoe behind the same synergies.
        variant(1, "Sorcerer", "Zoe", [{ id: "Poppy", tier: 3 }, { id: "Ornn" }], 7),
        variant(3, "Sorcerer", "Zoe", [{ id: "Poppy", tier: 3 }, { id: "Ornn" }], 7),
        variant(2, "Duelist", "Zoe", [{ id: "Nami" }, { id: "Shen" }]),
        variant(4, "Duelist", "Zoe", [{ id: "Nami" }, { id: "Shen" }]),
      ],
      2,
      costOf
    );
    expect(comps).toHaveLength(2);
    expect(comps.map((c) => c.archetype).sort()).toEqual(["fast8", "reroll1"]);
  });
});

/**
 * A varied batch of boards, used only to prove that aggregating from
 * summaries agrees with aggregating from boards once boards flow through
 * summarize() instead of straight into aggregateComps. Touches every case
 * that made the summary-based rewrite risky: two raw signatures whose
 * rosters overlap enough to merge before either one's identity is known, a
 * champion fielded twice on one board, an item held twice by the same unit,
 * and a trait whose numUnits varies between boards.
 */
function manyBoards(): Participant[] {
  const mkBoard = (
    placement: number,
    trait: string,
    numUnits: number,
    units: { id: string; tier?: number; items?: string[] }[],
    level = 8
  ): Participant => ({
    puuid: "x",
    placement,
    level,
    goldLeft: 0,
    traits: [{ name: trait, numUnits, tierCurrent: 3, tierTotal: 4 }],
    units: units.map((u) => ({
      character_id: u.id,
      tier: u.tier ?? 2,
      rarity: 2,
      items: u.items ?? [],
    })),
  });

  return [
    // Signature "TFT17_Chrono|Zoe": core roster {Zoe, Ornn, Nami}. The same
    // item ("IE") held twice by Zoe exercises the repeated-item counters.
    mkBoard(1, "TFT17_Chrono", 6, [
      { id: "Zoe", items: ["IE", "IE"] },
      { id: "Ornn" },
      { id: "Nami" },
    ]),
    // Same signature, different numUnits on the same trait — traits[].units
    // has to pick the mode over the histogram, not an average.
    mkBoard(3, "TFT17_Chrono", 4, [
      { id: "Zoe", items: ["IE", "IE", "JG"] },
      { id: "Ornn" },
      { id: "Nami" },
    ]),
    // Signature "TFT17_Chrono|Shen": same trait, one extra unit (Shen, who
    // now holds the items) added to the same three-unit skeleton. Core
    // overlap with the signature above is 3/4 = 0.75, above the 0.7 merge
    // bar, so the roster pass has to fold these two signatures together
    // before either one's identity (carry, archetype) is known.
    mkBoard(2, "TFT17_Chrono", 6, [
      { id: "Zoe" },
      { id: "Ornn" },
      { id: "Nami" },
      { id: "Shen", items: ["JG", "HOJ"] },
    ]),
    mkBoard(4, "TFT17_Chrono", 6, [
      { id: "Zoe" },
      { id: "Ornn" },
      { id: "Nami" },
      { id: "Shen", items: ["JG", "HOJ"] },
    ]),
    // An unrelated comp, small enough to be a fragment, where the same
    // champion is fielded twice on one board — summarize() has to collapse
    // to the best-invested copy, same as the raw aggregator does.
    mkBoard(5, "TFT17_Challenger", 2, [
      { id: "Akali", tier: 1, items: [] },
      { id: "Akali", tier: 2, items: ["BT"] },
      { id: "Poppy" },
    ]),
    mkBoard(6, "TFT17_Challenger", 2, [{ id: "Akali", items: ["BT", "QSS"] }, { id: "Poppy" }], 7),
  ];
}

describe("aggregateFromSummaries", () => {
  // La prueba de que resumir no pierde nada de lo que se publica.
  it("da exactamente lo mismo que agregar desde los tableros", () => {
    const boards = manyBoards();
    const desdeTableros = aggregateComps(boards, 2);
    const resumenes = [...summarize(boards).bySignature.values()];
    const desdeResumen = aggregateFromSummaries(resumenes, boards.length, 2);
    expect(desdeResumen).toEqual(desdeTableros);
  });

  // Bug real, encontrado comparando el parche 16.14 real armado desde tableros
  // contra el mismo parche reconstruido desde las tablas del resumen (Tarea 5,
  // resumen-incremental: build.ts --from=summary). Dos fragmentos (menos
  // tableros que minSeed) que se pliegan al mismo cluster terminaban en un
  // orden distinto dentro de `signatures` según el orden de LLEGADA del array
  // `summaries` — "orden en que aparecen los tableros" en el camino viejo,
  // pero "orden de la fila de Postgres" en el nuevo. Mismos datos, mismo
  // resultado esperado, sin importar en qué orden lleguen los resúmenes.
  it("no depende del orden del array de resúmenes cuando dos fragmentos se pliegan al mismo cluster", () => {
    const seedBoards = [1, 2, 3].map((placement) =>
      board(placement, "UnitA", [{ id: "UnitA" }, { id: "UnitB" }, { id: "UnitC" }])
    );
    const fragment1 = board(10, "UnitD", [
      { id: "UnitA" },
      { id: "UnitB" },
      { id: "UnitC" },
      { id: "UnitD" },
    ]);
    const fragment2 = board(11, "UnitE", [
      { id: "UnitA" },
      { id: "UnitB" },
      { id: "UnitC" },
      { id: "UnitE" },
    ]);

    const boards = [...seedBoards, fragment1, fragment2];
    const summaries = [...summarize(boards).bySignature.values()];
    expect(summaries).toHaveLength(3); // el seed y los dos fragmentos, tres firmas distintas

    const forward = aggregateFromSummaries(summaries, boards.length, 2, costOf);
    const reversed = aggregateFromSummaries([...summaries].reverse(), boards.length, 2, costOf);
    expect(reversed).toEqual(forward);

    // Los dos fragmentos se plegaron al mismo comp — por eso el orden importaba.
    expect(forward).toHaveLength(1);
    expect(forward[0].signatures).toHaveLength(3);
  });
});
