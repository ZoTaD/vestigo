import { describe, expect, it } from "vitest";
import { resistances } from "../src/d2r/D2rPlanner";

/** Lo que suma el equipo para cada stat, como lo lee el planificador. */
const gear = (m: Record<string, number>) => (stat: string) => m[stat] ?? 0;

describe("las resistencias del planificador, como en la hoja del personaje", () => {
  it("en Infierno arrancan en −100: +50 de fuego y +10 de lo demás dan −50 y −90", () => {
    const r = resistances(gear({ fireresist: 50, coldresist: 10, lightresist: 10, poisonresist: 10 }), 2);
    expect(r.map((x) => x.shown)).toEqual([-50, -90, -90, -90]);
    expect(r.map((x) => x.gear)).toEqual([50, 10, 10, 10]);
  });

  it("en Pesadilla restan 40", () => {
    expect(resistances(gear({ poisonresist: 40 }), 1)[3].shown).toBe(0);
  });

  it("en Normal no hay penalidad, y el tope es 75 más la resistencia máxima", () => {
    const r = resistances(gear({ fireresist: 50, coldresist: 120, maxcoldresist: 5 }), 0);
    expect(r[0].shown).toBe(50);
    expect(r[1]).toMatchObject({ raw: 120, cap: 80, shown: 80 });
  });
});
