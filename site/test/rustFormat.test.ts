import { describe, expect, it } from "vitest";
import { condText, craftTimes, formatChance, formatDuration, upkeepRange } from "../src/rust/items/format";

describe("las cuentas chicas de la ficha de Rust", () => {
  it("formatDuration", () => {
    expect(formatDuration(30)).toBe("30 s");
    expect(formatDuration(300)).toBe("5 min");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(9000)).toBe("2 h 30 min");
    expect(formatDuration(900)).toBe("15 min");
  });

  it("el tiempo en cada banco: la mitad con un nivel más, un cuarto con dos o más (ItemCrafter)", () => {
    expect(craftTimes(30, 1)).toEqual([{ bench: 1, seconds: 30 }, { bench: 2, seconds: 15 }, { bench: 3, seconds: 7.5 }]);
    expect(craftTimes(30, 0)).toEqual([
      { bench: 0, seconds: 30 }, { bench: 1, seconds: 15 }, { bench: 2, seconds: 7.5 }, { bench: 3, seconds: 7.5 },
    ]);
    expect(craftTimes(45, 3)).toEqual([{ bench: 3, seconds: 45 }]);
  });
});

describe("el estado al aparecer y la probabilidad", () => {
  const pct = (p: number) => `${p} %`;
  it("condText", () => {
    expect(condText([0.1, 0.2], pct)).toBe("10–20 %");
    expect(condText([1, 1], pct)).toBe("100 %");
    expect(condText([0.01, 0.03], pct)).toBe("1–3 %");
  });
  it("formatChance", () => {
    expect(formatChance(0.2845, "es-AR")).toBe("28 %");
    expect(formatChance(0.039, "es-AR")).toBe("3,9 %");
    expect(formatChance(0.0004, "es-AR")).toBe("< 0,1 %");
    expect(formatChance(1, "es-AR")).toBe("100 %");
  });
});

describe("el mantenimiento por día", () => {
  it("de la base más chica a la más grande (10 % a 33,3 %, para abajo)", () => {
    expect(upkeepRange(150)).toEqual([15, 49]);
    expect(upkeepRange(300)).toEqual([30, 99]);
    expect(upkeepRange(20)).toEqual([2, 6]);
    expect(upkeepRange(4000)).toEqual([400, 1332]);
  });
});
