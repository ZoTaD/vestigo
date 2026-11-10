import { describe, expect, it } from "vitest";
import { classify } from "../src/itemValue";

describe("classify", () => {
  // Dos objetos de 800 y dos de 6400: la vara de cada uno es su propio precio.
  const cost = new Map([
    [1, 800],
    [2, 800],
    [3, 6400],
    [4, 6400],
  ]);

  it("compara contra los del mismo precio, no contra el winrate del héroe", () => {
    const r = classify(
      [
        { item_id: 1, wins: 550, matches: 1000 }, // 55 %, comprado en el 10 %
        { item_id: 2, wins: 4500, matches: 9000 }, // 50 %, comprado en el 90 %
        { item_id: 3, wins: 600, matches: 1000 }, // 60 %, caro y ganador
        { item_id: 4, wins: 6000, matches: 10000 }, // 60 % también
      ],
      10_000,
      cost
    );
    // El 1 gana 5 puntos más que su precio (50,5 % de base): infravalorado.
    expect(r.under.map((x) => x[0])).toEqual([1]);
    // El 3 gana mucho, pero lo mismo que todo lo de 6.400: no se destaca.
    expect(r.under.some((x) => x[0] === 3)).toBe(false);
    // El 2 lo compra el 90 % y queda medio punto abajo de su precio.
    expect(r.over.map((x) => x[0])).toEqual([2]);
    expect(r.over[0][2]).toBe(900);
  });

  it("descarta los objetos con pocas compras", () => {
    const r = classify([{ item_id: 1, wins: 100, matches: 120 }], 10_000, cost);
    expect(r.under).toEqual([]);
  });
});
