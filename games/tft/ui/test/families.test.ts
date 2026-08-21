import { describe, it, expect } from "vitest";
import { groupFamilies, coreOf, sameFamily } from "../src/families";
import { buildComps, type Comp, type CompUnit } from "../src/data";

/** A comp is only its tier, placement and roster here; the rest is display. */
function comp(id: string, tier: string, avgPlacement: number, core: string[], flex: string[] = []): Comp {
  const unit = (uid: string, isFlex: boolean): CompUnit => ({
    id: uid, name: uid, cost: 1, img: "", flex: isFlex, stars: 0, threeStarRate: 0,
    itemizedRate: 0, isStarTarget: false, isCarry: false, holdsItems: false,
    frequency: isFlex ? 0.3 : 0.9, items: [], swing: null,
  });
  return {
    id, tier, tags: [], traitName: id, carryNames: [core[0] ?? id], archetype: "standard",
    avgLevel: 8, units: [...core.map((u) => unit(u, false)), ...flex.map((u) => unit(u, true))],
    traits: [], itemPriority: [], count: 100, avgPlacement, top4Rate: 0.5, winRate: 0.15, playRate: 0.05,
  };
}

const ids = (cs: { id: string }[]) => cs.map((c) => c.id);

describe("coreOf", () => {
  it("is the units that are not rotation slots", () => {
    const c = comp("x", "S", 3.5, ["a", "b", "c"], ["d", "e"]);
    expect([...coreOf(c)].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("sameFamily", () => {
  const s1 = comp("fiora-illaoi", "S", 3.3, ["fiora", "illaoi", "jinx", "aurora"]);
  it("groups the same core in a close tier", () => {
    const s2 = comp("fiora-jinx", "S", 3.8, ["fiora", "illaoi", "jinx", "aurora"]);
    expect(sameFamily(s1, s2)).toBe(true);
  });
  it("allows one tier of distance but not more", () => {
    const a = comp("v", "A", 4.2, ["fiora", "illaoi", "jinx", "aurora"]);
    const d = comp("w", "D", 4.9, ["fiora", "illaoi", "jinx", "aurora"]);
    expect(sameFamily(s1, a)).toBe(true);
    expect(sameFamily(s1, d)).toBe(false);
  });
  it("does not group a merely-overlapping shell", () => {
    // Shares 3 of 5 tanks but a different carry — the Akali-S vs Kindred-D case.
    const shell = comp("kindred", "S", 3.4, ["kindred", "morgana", "maokai", "urgot", "aatrox"]);
    const other = comp("akali", "S", 3.4, ["akali", "jax", "maokai", "urgot", "aatrox"]);
    expect(sameFamily(shell, other)).toBe(false);
  });
});

describe("groupFamilies", () => {
  it("keeps the best-placement comp as the lead and the rest as variants", () => {
    // File order is already adjusted-placement order, best first.
    const families = groupFamilies([
      comp("lead", "S", 3.3, ["fiora", "illaoi", "jinx", "aurora"]),
      comp("var", "S", 3.8, ["fiora", "illaoi", "jinx", "aurora"]),
      comp("solo", "A", 4.1, ["ornn", "samira", "nami", "blitz"]),
    ]);
    expect(families).toHaveLength(2);
    expect(families[0].lead.id).toBe("lead");
    expect(ids(families[0].variants)).toEqual(["var"]);
    expect(families[1].lead.id).toBe("solo");
    expect(families[1].variants).toEqual([]);
  });

  it("only ever puts a variant in a family whose lead it truly matches", () => {
    // The invariant that makes grouping honest: no comp is folded in via a chain
    // of near-misses. Every variant must match its family's lead directly.
    const families = groupFamilies([
      comp("a", "S", 3.3, ["one", "two", "three", "four"]),
      comp("b", "S", 3.5, ["one", "two", "three", "four"]),
      comp("c", "S", 3.7, ["one", "two", "six", "seven"]),
    ]);
    for (const f of families) {
      for (const v of f.variants) expect(sameFamily(f.lead, v)).toBe(true);
    }
  });

  it("leaves every comp reachable exactly once", () => {
    const input = [
      comp("lead", "S", 3.3, ["fiora", "illaoi", "jinx", "aurora"]),
      comp("var", "S", 3.8, ["fiora", "illaoi", "jinx", "aurora"]),
      comp("solo", "A", 4.1, ["ornn", "samira", "nami", "blitz"]),
    ];
    const families = groupFamilies(input);
    const seen = families.flatMap((f) => [f.lead, ...f.variants]).map((c) => c.id).sort();
    expect(seen).toEqual(["lead", "solo", "var"]);
  });
});

describe("against the real published meta", () => {
  const families = groupFamilies(buildComps("global", "en"));

  it("loses no comp: every published comp is in exactly one family", () => {
    const flat = families.flatMap((f) => [f.lead, ...f.variants]);
    expect(flat).toHaveLength(buildComps("global", "en").length);
    expect(new Set(flat.map((c) => c.id)).size).toBe(flat.length);
  });

  it("only groups genuine variants, never across a wide tier gap", () => {
    const order = ["S", "A", "B", "C", "D"];
    for (const f of families) {
      for (const v of f.variants) {
        expect(sameFamily(f.lead, v)).toBe(true);
        expect(Math.abs(order.indexOf(f.lead.tier) - order.indexOf(v.tier))).toBeLessThanOrEqual(1);
      }
    }
  });
});
