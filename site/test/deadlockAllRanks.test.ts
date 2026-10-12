import { describe, expect, it } from "vitest";
import { mergeBands, type HeroesFile } from "../src/deadlockData";

const band = (matches: number, heroes: HeroesFile["heroes"]): HeroesFile => ({
  generatedAt: "",
  band: "x",
  patch: { date: "", title: "", link: "" },
  matches,
  boards: matches * 12,
  from: "2026-10-01",
  to: "2026-10-12",
  heroes,
});

describe("Deadlock: todos los rangos", () => {
  it("promedia cada cifra con el peso de su denominador", () => {
    const all = mergeBands([
      band(1000, [{ heroId: 1, matches: 300, winRate: 0.6, winRateRaw: 0.6, pickRate: 0.3 }]),
      band(3000, [
        { heroId: 1, matches: 100, winRate: 0.4, winRateRaw: 0.4, pickRate: 0.1 },
        { heroId: 2, matches: 900, winRate: 0.5, winRateRaw: 0.5, pickRate: 0.3 },
      ]),
    ]);
    expect(all.matches).toBe(4000);
    const uno = all.heroes.find((h) => h.heroId === 1)!;
    expect(uno.matches).toBe(400);
    expect(uno.winRate).toBeCloseTo(0.55);
    expect(uno.pickRate).toBeCloseTo(0.15);
    // El que falta en una banda cuenta cero ahí, no desaparece del total.
    expect(all.heroes.find((h) => h.heroId === 2)!.pickRate).toBeCloseTo(0.225);
    expect(all.heroes[0].heroId).toBe(1);
  });
});
