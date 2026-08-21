import { describe, it, expect } from "vitest";
import { adjustPlacement, assignTier, tierComps, estimateShrinkage } from "../src/aggregate/tier";
import type { CompStats } from "../src/aggregate/group";

function stats(over: Partial<CompStats>): CompStats {
  return {
    signature: "T|C", signatures: ["T|C"], trait: "T", carry: "C", count: 500,
    rerollTarget: "", archetype: "standard" as const, avgLevel: 8,
    avgPlacement: 4.5, placementVar: 4, top4Rate: 0.5, winRate: 0.125, playRate: 0.1,
    units: [], traits: [], itemPriority: [], carries: [], starTargets: [],
    winners: { boards: 0, avgPlacement: 0, avgLevel: 0, avgGoldLeft: 0 },
    losers: { boards: 0, avgPlacement: 0, avgLevel: 0, avgGoldLeft: 0 }, ...over,
  };
}

describe("adjustPlacement", () => {
  it("leaves a comp with plenty of boards where it is", () => {
    // 800 boards is evidence; the average barely moves.
    expect(adjustPlacement(3.6, 800)).toBeCloseTo(3.72, 1);
  });

  // The bug this exists for: 22 boards showed 2.91 and took the top of the list,
  // where the standard error is around half a placement.
  it("drags a thin average toward the lobby mean", () => {
    const thin = adjustPlacement(2.91, 22);
    expect(thin).toBeGreaterThan(4.2);
    expect(thin).toBeLessThan(4.5);
  });

  it("corrects a suspiciously bad average too, not only a good one", () => {
    expect(adjustPlacement(6.5, 20)).toBeLessThan(5);
  });

  it("assumes nothing about a comp with no boards", () => {
    expect(adjustPlacement(1, 0)).toBeCloseTo(4.5, 5);
  });
});

describe("estimateShrinkage", () => {
  // The shrinkage strength should come from the data, not a hand-picked 120.
  // It is the within-comp variance over the true between-comp variance:
  // strong shrink when comps barely differ, weak when they differ a lot.

  it("computes C from the spread of comp means, hand-checkable", () => {
    // Three comps, 100 boards each, within-variance 4, means 4.0/4.5/5.0.
    //   sigma2 = 4
    //   observed between-var of means = (0.25 + 0 + 0.25) / 2 = 0.25
    //   sampling noise = 4 * mean(1/100) = 0.04
    //   tau2 = 0.21  ->  C = 4 / 0.21 ~ 19
    const C = estimateShrinkage([
      stats({ count: 100, placementVar: 4, avgPlacement: 4.0 }),
      stats({ count: 100, placementVar: 4, avgPlacement: 4.5 }),
      stats({ count: 100, placementVar: 4, avgPlacement: 5.0 }),
    ]);
    expect(C).toBeGreaterThan(17);
    expect(C).toBeLessThan(21);
  });

  it("shrinks hard when the comps barely differ, since the spread is noise", () => {
    const C = estimateShrinkage([
      stats({ count: 100, placementVar: 4, avgPlacement: 4.5 }),
      stats({ count: 100, placementVar: 4, avgPlacement: 4.5 }),
      stats({ count: 100, placementVar: 4, avgPlacement: 4.5 }),
    ]);
    // Nearly identical means → tiny true spread → very heavy shrinkage.
    expect(C).toBeGreaterThan(120);
  });

  it("shrinks little when comps genuinely differ over large samples", () => {
    const C = estimateShrinkage([
      stats({ count: 1000, placementVar: 4, avgPlacement: 3.5 }),
      stats({ count: 1000, placementVar: 4, avgPlacement: 4.5 }),
      stats({ count: 1000, placementVar: 4, avgPlacement: 5.5 }),
    ]);
    // A full placement of real spread on 1000-board samples is signal, not noise.
    expect(C).toBeLessThan(15);
  });

  it("falls back rather than guess from too few comps", () => {
    expect(estimateShrinkage([stats({})])).toBe(120);
    expect(estimateShrinkage([])).toBe(120);
  });
});

describe("tierComps with a data-estimated C", () => {
  it("shrinks less than the old fixed 120 when the data says comps differ", () => {
    const comps = [
      stats({ signature: "hot", avgPlacement: 3.6, count: 60, placementVar: 4 }),
      stats({ signature: "b", avgPlacement: 4.5, count: 800, placementVar: 4 }),
      stats({ signature: "c", avgPlacement: 5.2, count: 800, placementVar: 4 }),
    ];
    const withData = tierComps(comps)[0];
    const withOld = tierComps(comps, 120).find((c) => c.signature === "hot")!;
    // The 60-board 3.6 comp keeps more of its real signal under the estimate.
    expect(withData.signature).toBe("hot");
    expect(withData.adjustedPlacement).toBeLessThan(withOld.adjustedPlacement);
  });
});

describe("assignTier", () => {
  it("grades against the lobby average, not against the other comps", () => {
    expect(assignTier(3.8)).toBe("S");
    expect(assignTier(4.2)).toBe("A");
    expect(assignTier(4.45)).toBe("B");
    expect(assignTier(4.7)).toBe("C");
    expect(assignTier(5.1)).toBe("D");
  });

  it("never calls a comp that loses to the lobby better than average", () => {
    // 4.5 is the lobby; anything above it has to fall below B.
    expect(["C", "D"]).toContain(assignTier(4.51));
  });
});

describe("tierComps", () => {
  it("sorts by adjusted placement, best first", () => {
    const tiered = tierComps([
      stats({ signature: "mid", avgPlacement: 4.4 }),
      stats({ signature: "good", avgPlacement: 3.6 }),
    ]);
    expect(tiered.map((c) => c.signature)).toEqual(["good", "mid"]);
  });

  it("ranks a solid comp above a lucky small one with a better raw average", () => {
    // Pinned to the old fixed strength: this checks the shrinkage mechanism
    // itself, not the estimate, which two synthetic comps cannot inform.
    const tiered = tierComps(
      [
        stats({ signature: "lucky", avgPlacement: 2.9, count: 22 }),
        stats({ signature: "solid", avgPlacement: 3.6, count: 800 }),
      ],
      120
    );
    expect(tiered[0].signature).toBe("solid");
    expect(tiered[0].tier).toBe("S");
    expect(tiered[1].tier).not.toBe("S");
  });

  it("keeps the raw average for display alongside the adjusted one", () => {
    const [only] = tierComps([stats({ avgPlacement: 2.9, count: 22 })]);
    expect(only.avgPlacement).toBe(2.9);
    expect(only.adjustedPlacement).toBeGreaterThan(only.avgPlacement);
  });
});
