import { describe, expect, it } from "vitest";
import { recycleScrap, recycleYield } from "../src/rust/items/recycle";

/**
 * La cuenta del reciclador (Recycler.RecycleThink): lo entero sale seguro y la parte decimal es la chance de uno más; la
 * chatarra fija se escala con la eficiencia. Los números son los de rusthelp.com (2026-10-05).
 */
describe("lo que da el reciclador", () => {
  it("la munición de escopeta de 40 mm (7,5 de pólvora y 2 fragmentos por unidad) en las cuatro recicladoras", () => {
    expect(recycleYield(7.5, 0.5)).toEqual({ n: 3, pct: 75 });
    expect(recycleYield(2, 0.5)).toEqual({ n: 1, pct: 0 });
    expect(recycleYield(7.5, 0.4)).toEqual({ n: 3, pct: 0 });
    expect(recycleYield(2, 0.4)).toEqual({ n: 0, pct: 80 });
    expect(recycleYield(7.5, 0.75)).toEqual({ n: 5, pct: 62 });
    expect(recycleYield(2, 0.75)).toEqual({ n: 1, pct: 50 });
    expect(recycleYield(7.5, 0.6)).toEqual({ n: 4, pct: 50 });
    expect(recycleYield(2, 0.6)).toEqual({ n: 1, pct: 20 });
  });

  it("los engranajes: 25 fragmentos", () => {
    expect(recycleYield(25, 0.75)).toEqual({ n: 18, pct: 75 });
    expect(recycleYield(25, 0.6)).toEqual({ n: 15, pct: 0 });
    expect(recycleYield(25, 0.5)).toEqual({ n: 12, pct: 50 });
    expect(recycleYield(25, 0.4)).toEqual({ n: 10, pct: 0 });
  });

  it("la chatarra fija se escala con la eficiencia", () => {
    expect([0.75, 0.6, 0.5, 0.4].map((e) => recycleScrap(10, e))).toEqual([15, 12, 10, 8]);
    expect(recycleScrap(7, 0.4)).toBe(5.6);
  });
});
