import { describe, it, expect } from "vitest";
import { buildComps } from "../src/data";

/**
 * These run against the real meta, so they check the thresholds actually sort
 * our comps into something useful — a rule that tags none of them, or all of
 * them, is worse than no rule.
 */
const comps = buildComps("global", "en");

describe("comp tags", () => {
  it("tags some comps but not most of them", () => {
    const tagged = comps.filter((c) => c.tags.length > 0);
    expect(tagged.length).toBeGreaterThan(3);
    expect(tagged.length).toBeLessThan(comps.length);
  });

  it("never calls the same comp both consistent and high-win", () => {
    // One reaches the top half without closing; the other closes. Both at once
    // would mean the thresholds overlap.
    for (const c of comps) {
      expect(c.tags.includes("consistent") && c.tags.includes("highWin")).toBe(false);
    }
  });

  it("flags thin samples, and only thin ones", () => {
    for (const c of comps) {
      expect(c.tags.includes("thinData")).toBe(c.count < 50);
    }
  });

  /**
   * Every tag a reader could meet has to be reachable, or a threshold has
   * drifted somewhere no one is looking.
   *
   * "thinData" is the exception, and the reason is the point: it fires when a
   * published comp rests on under fifty boards, so an empty set means the
   * sample finally outgrew it. Requiring it to appear would be requiring the
   * dataset to stay thin — it broke here the first time the store got big
   * enough for every comp to clear the bar.
   */
  it("gives every earned tag at least one comp", () => {
    const seen = new Set(comps.flatMap((c) => c.tags));
    for (const tag of ["consistent", "highWin", "contested"]) {
      expect(seen, `${tag} is unreachable`).toContain(tag);
    }
    expect([...seen].every((t) =>
      ["consistent", "highWin", "contested", "thinData"].includes(t)
    )).toBe(true);
  });
});

describe("unit swing", () => {
  const swings = comps.flatMap((c) => c.units.map((u) => u.swing).filter(Boolean));

  it("finds units whose presence moves the placement", () => {
    expect(swings.length).toBeGreaterThan(20);
  });

  it("never reports a swing for a carry", () => {
    // "This comp does worse without its carry" is a tautology, not advice.
    for (const c of comps) {
      for (const u of c.units) {
        if (u.isCarry) expect(u.swing).toBeNull();
      }
    }
  });

  it("keeps the rates as shares", () => {
    for (const s of swings) {
      expect(s!.winnerRate).toBeGreaterThanOrEqual(0);
      expect(s!.winnerRate).toBeLessThanOrEqual(1);
      expect(s!.loserRate).toBeGreaterThanOrEqual(0);
      expect(s!.loserRate).toBeLessThanOrEqual(1);
    }
  });

  it("only keeps units that separate winners from losers", () => {
    // The whole point: a unit on 98% of winning boards and 94% of losing ones
    // shows a huge placement swing and tells a player nothing, because the
    // boards without it are broken games rather than a different choice.
    for (const s of swings) {
      expect(Math.abs(s!.winnerRate - s!.loserRate)).toBeGreaterThanOrEqual(0.05);
    }
  });

  it("mostly finds units that help rather than hurt", () => {
    // Negative is better. A meta where most optional units made you place worse
    // would mean the sign convention slipped somewhere.
    const helping = swings.filter((s) => s!.impact < 0).length;
    expect(helping).toBeGreaterThan(swings.length / 2);
  });
});
