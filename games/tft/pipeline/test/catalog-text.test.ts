import { describe, it, expect } from "vitest";
import { resolvePlaceholders, cleanDesc, localized } from "../src/catalog-text";

describe("resolvePlaceholders", () => {
  it("substitutes a plain variable", () => {
    expect(resolvePlaceholders("Attacks grant @FlatManaRestore@ bonus Mana.", { FlatManaRestore: 5 }))
      .toBe("Attacks grant 5 bonus Mana.");
  });

  it("applies the multiplier, which is how percentages are stored", () => {
    expect(resolvePlaceholders("Gain @BonusPercentHP*100@% max Health.", { BonusPercentHP: 0.18 }))
      .toBe("Gain 18% max Health.");
  });

  it("rounds away float32 noise", () => {
    // CDragon ships 15% as this exact double.
    expect(resolvePlaceholders("@DamageAmp*100@%", { DamageAmp: 0.15000000596046448 }))
      .toBe("15%");
  });

  it("resolves several variables in one description", () => {
    expect(
      resolvePlaceholders("Gain @ArmorPerEnemy@ Armor and @MRPerEnemy@ Magic Resist.", {
        ArmorPerEnemy: 10,
        MRPerEnemy: 10,
      })
    ).toBe("Gain 10 Armor and 10 Magic Resist.");
  });

  it("leaves a variable it cannot resolve exactly as it was", () => {
    // An invented number is worse than visible punctuation: the reader can see
    // that @X@ is a defect, but not that a made-up "20%" is.
    expect(resolvePlaceholders("Gain @Missing@ Health.", { Other: 5 }))
      .toBe("Gain @Missing@ Health.");
    expect(resolvePlaceholders("Gain @Health@ Health.", { Health: null }))
      .toBe("Gain @Health@ Health.");
    expect(resolvePlaceholders("Gain @Health@ Health.", { Health: "n/a" }))
      .toBe("Gain @Health@ Health.");
  });

  it("drops live-state references, which no static catalog can ever fill", () => {
    // TFTUnitProperty reads a counter off the unit inside a running game.
    // Leaving it would park "@TFTUnitProperty…@" on the page for good.
    expect(
      resolvePlaceholders("Perfect peace for its holder. @TFTUnitProperty.:TFT_Augment_TragicalBlade_TRAKey@")
    ).toBe("Perfect peace for its holder.");
    expect(resolvePlaceholders("Stacks: @TFTUnitProperty.item:TFT_Tracker_Value1@ total."))
      .toBe("Stacks: total.");
  });

  it("resolves a stat cited by hash, and falls back to ? when it cannot", () => {
    expect(resolvePlaceholders("Deal {1543aa48} damage.", { "{1543aa48}": 12 }))
      .toBe("Deal 12 damage.");
    expect(resolvePlaceholders("Deal {1543aa48} damage.", {}))
      .toBe("Deal ? damage.");
  });
});

describe("cleanDesc", () => {
  it("resolves stats before stripping markup, so tagged numbers survive", () => {
    expect(cleanDesc("<tftitemrules>Gain @Armor@ Armor</tftitemrules>", { Armor: 25 }))
      .toBe("Gain 25 Armor");
  });

  it("collapses the whitespace left behind by the tags", () => {
    expect(cleanDesc("<br>Gain  <b>@Armor@</b>   Armor<br>", { Armor: 25 }))
      .toBe("Gain 25 Armor");
  });

  it("returns an empty string for a missing description", () => {
    expect(cleanDesc(undefined)).toBe("");
    expect(cleanDesc("")).toBe("");
  });
});

describe("localized", () => {
  it("keeps both languages", () => {
    expect(localized("Bloodthirster", "Sanguinaria"))
      .toEqual({ en: "Bloodthirster", es: "Sanguinaria" });
  });

  it("falls back to English when the locale is missing the entry", () => {
    // A new item mid-patch reaches en_us before the translators.
    expect(localized("Bloodthirster", undefined))
      .toEqual({ en: "Bloodthirster", es: "Bloodthirster" });
    expect(localized("Bloodthirster", ""))
      .toEqual({ en: "Bloodthirster", es: "Bloodthirster" });
  });
});
