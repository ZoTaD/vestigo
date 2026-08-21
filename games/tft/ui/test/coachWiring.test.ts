import { describe, it, expect } from "vitest";
import { habitsFor, habitBoards } from "../src/data";
import { BAND_LADDER, bandAbove } from "../src/bands";

/**
 * The coach reads two bands out of one published file. If a band the ladder
 * names is missing from it, the panel silently disappears for every player of
 * that rank — no error, just nothing where the advice should be.
 */
describe("habits.json covers the ladder", () => {
  it("publishes habits for every band a player can be in", () => {
    for (const band of BAND_LADDER) {
      expect(habitsFor(band), `${band} habits`).not.toBeNull();
    }
  });

  it("gives every band except apex something to be compared against", () => {
    for (const band of BAND_LADDER) {
      const above = bandAbove(band);
      if (above === null) {
        expect(band).toBe("apex");
      } else {
        expect(habitsFor(above), `${above} habits`).not.toBeNull();
      }
    }
  });

  // The band whose tier list publishes empty is exactly the one that most needs
  // to be told what the rung above does differently.
  it("speaks to silver-below even though its tier list is empty", () => {
    expect(habitsFor("silver-below")).not.toBeNull();
    expect(habitBoards("silver-below")).toBeGreaterThan(500);
  });

  it("has nothing for the overlapping default band, which sits on no rung", () => {
    expect(habitsFor("global")).toBeNull();
  });

  /**
   * The signal the whole feature rests on. If this inverts, the adapter in the
   * pipeline or the band filter is wrong, and every finding would be backwards.
   */
  it("still finds players hoarding more gold the lower the band", () => {
    const apex = habitsFor("apex")!.hoardsGold!.rate;
    const platinum = habitsFor("platinum-gold")!.hoardsGold!.rate;
    const silver = habitsFor("silver-below")!.hoardsGold!.rate;
    expect(platinum).toBeGreaterThan(apex);
    expect(silver).toBeGreaterThan(platinum);
  });

  // The regression that the coach's third gate exists for, checked against the
  // published file rather than a fixture: rerolling is MORE common lower down
  // while it IMPROVES placement there. Anything that inverts either half means
  // the gate is now guarding a case that no longer exists.
  it("keeps rerolling more common lower down and still worth doing", () => {
    const apex = habitsFor("apex")!.rerolls!;
    const platinum = habitsFor("platinum-gold")!.rerolls!;
    expect(platinum.rate).toBeGreaterThan(apex.rate);
    expect(platinum.avgWith - platinum.avgWithout).toBeLessThan(0);
  });
});
