import { describe, expect, it } from "vitest";
import { craftTimes, formatDuration } from "../src/rust/items/format";

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
