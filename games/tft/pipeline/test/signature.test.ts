import { describe, it, expect } from "vitest";
import { compSignature, dominantTrait, primaryCarry, type Participant } from "../src/aggregate/signature";

function participant(over: Partial<Participant> = {}): Participant {
  return { puuid: "p1", placement: 1, level: 8, goldLeft: 0, units: [], traits: [], ...over };
}

describe("dominantTrait", () => {
  it("ignores per-champion unique traits (tierTotal === 1)", () => {
    const p = participant({
      traits: [
        { name: "TFT17_BlitzcrankUniqueTrait", numUnits: 1, tierCurrent: 1, tierTotal: 1 },
        { name: "TFT17_ResistTank", numUnits: 2, tierCurrent: 1, tierTotal: 3 },
      ],
    });
    expect(dominantTrait(p)).toBe("TFT17_ResistTank");
  });

  it("ignores inactive traits and picks the highest tier", () => {
    const p = participant({
      traits: [
        { name: "TFT17_APTrait", numUnits: 1, tierCurrent: 0, tierTotal: 2 },
        { name: "TFT17_Sorcerer", numUnits: 6, tierCurrent: 3, tierTotal: 4 },
        { name: "TFT17_ResistTank", numUnits: 2, tierCurrent: 1, tierTotal: 3 },
      ],
    });
    expect(dominantTrait(p)).toBe("TFT17_Sorcerer");
  });

  it("returns empty string when no real trait is active", () => {
    expect(dominantTrait(participant())).toBe("");
  });
});

describe("primaryCarry", () => {
  it("picks the unit holding the most items", () => {
    const p = participant({
      units: [
        { character_id: "TFT17_Ornn", tier: 2, rarity: 4, items: [] },
        { character_id: "TFT17_Nasus", tier: 3, rarity: 0, items: ["a", "b", "c"] },
      ],
    });
    expect(primaryCarry(p)).toBe("TFT17_Nasus");
  });

  it("breaks item ties toward the more expensive unit", () => {
    const p = participant({
      units: [
        { character_id: "TFT17_Nasus", tier: 3, rarity: 0, items: ["a", "b", "c"] },
        { character_id: "TFT17_Samira", tier: 3, rarity: 2, items: ["a", "b", "c"] },
      ],
    });
    expect(primaryCarry(p)).toBe("TFT17_Samira");
  });
});

describe("compSignature", () => {
  it("combines dominant trait and primary carry", () => {
    const p = participant({
      traits: [{ name: "TFT17_Sorcerer", numUnits: 6, tierCurrent: 3, tierTotal: 4 }],
      units: [{ character_id: "TFT17_Zoe", tier: 3, rarity: 2, items: ["a", "b"] }],
    });
    expect(compSignature(p)).toBe("TFT17_Sorcerer|TFT17_Zoe");
  });

  it("returns empty string when there is no active trait", () => {
    const p = participant({
      units: [{ character_id: "TFT17_Zoe", tier: 1, rarity: 2, items: [] }],
    });
    expect(compSignature(p)).toBe("");
  });
});
