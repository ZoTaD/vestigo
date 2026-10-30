import { describe, expect, it } from "vitest";
import { movers } from "../src/patchMovers";

const h = (hero_id: number, wins: number, matches: number) => ({ hero_id, wins, matches });

describe("patch movers", () => {
  it("ordena por cuánto se movió, no por winrate", () => {
    const antes = [h(1, 400, 1000), h(2, 550, 1000), h(3, 500, 1000), h(4, 500, 1000)];
    const despues = [h(1, 440, 1000), h(2, 560, 1000), h(3, 450, 1000), h(4, 500, 1000)];
    const m = movers(antes, despues, (r) => r.hero_id, 300);
    expect(m.up.map((x) => x[0])).toEqual([1, 2]);
    expect(m.down).toEqual([[3, 0.5, 0.45, 1000, 1000]]);
  });

  it("deja afuera a quien no llega al piso en alguna de las dos ventanas", () => {
    const m = movers([h(1, 100, 200), h(2, 500, 1000)], [h(1, 150, 200), h(2, 600, 1000), h(3, 900, 1000)], (r) => r.hero_id, 300);
    expect(m.up.map((x) => x[0])).toEqual([2]);
  });
});
