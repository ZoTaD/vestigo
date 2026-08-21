import { describe, it, expect } from "vitest";
import { selectRoster } from "../src/data";
import { buildComps } from "../src/data";

const u = (id: string, frequency: number) => ({ id, core: frequency >= 0.5, frequency });

describe("selectRoster", () => {
  // The bug this exists to prevent: a comp whose boards average level 9.2 was
  // shown with 3 champions, because only units on half the boards were kept and
  // a flexible comp rotates the rest. A level-9 board has nine units on it.
  it("fills the roster to the size of the board the comp actually plays", () => {
    const units = [
      u("a", 1), u("b", 0.9), u("c", 0.6), u("d", 0.55),
      u("e", 0.49), u("f", 0.44), u("g", 0.38), u("h", 0.37), u("i", 0.34), u("j", 0.30),
    ];
    const roster = selectRoster(units, 8.9);
    expect(roster).toHaveLength(9);
  });

  it("keeps the stable units first and fills with the most common rotations", () => {
    const units = [
      u("a", 1), u("b", 0.9),
      u("rare", 0.2), u("common", 0.45),
    ];
    const roster = selectRoster(units, 4.0);
    expect(roster.map((x) => x.id)).toEqual(["a", "b", "common", "rare"]);
  });

  it("marks the rotating units, so the display can tell a skeleton from an option", () => {
    const units = [u("a", 1), u("b", 0.45)];
    const roster = selectRoster(units, 2.0);
    expect(roster.find((x) => x.id === "a")?.flex).toBe(false);
    expect(roster.find((x) => x.id === "b")?.flex).toBe(true);
  });

  it("never invents units: a thin comp shows what was measured", () => {
    const units = [u("a", 1), u("b", 0.8)];
    expect(selectRoster(units, 9.0)).toHaveLength(2);
  });

  it("never drops a core unit, even past the board size", () => {
    const units = Array.from({ length: 10 }, (_, i) => u(`c${i}`, 0.6));
    expect(selectRoster(units, 8.0)).toHaveLength(10);
  });
});

describe("the real tier list", () => {
  it("shows a full board for every comp, like the boards it was measured from", () => {
    for (const comp of buildComps("global", "en")) {
      const want = Math.round(comp.avgLevel);
      expect(
        comp.units.length,
        `${comp.traitName} ${comp.carryNames.join("+")} (level ${comp.avgLevel.toFixed(1)})`
      ).toBeGreaterThanOrEqual(Math.min(want, 8));
    }
  });

  // TFT_Item_EmptyBag (a Riot placeholder with no catalog entry) was drawn as a
  // nameless, imageless chip. No item a comp shows may lack a name or an icon.
  it("never shows an item without a name and an icon", () => {
    for (const comp of buildComps("global", "en")) {
      const items = [...comp.itemPriority, ...comp.units.flatMap((u) => u.items)];
      for (const it of items) {
        expect(it.name, `${comp.traitName}: item ${it.id} has no name`).toBeTruthy();
        expect(it.img, `${comp.traitName}: item ${it.id} has no icon`).toBeTruthy();
      }
    }
  });
});
