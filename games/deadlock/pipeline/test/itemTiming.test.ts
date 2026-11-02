import { describe, expect, it } from "vitest";
import { EDGES, buildTiming, slotOf } from "../src/itemTiming";

describe("minuto de compra", () => {
  it("reparte los minutos en tramos", () => {
    expect(slotOf(0)).toBe(0);
    expect(slotOf(9)).toBe(0);
    expect(slotOf(10)).toBe(1);
    expect(slotOf(39)).toBe(EDGES.length - 2);
    expect(slotOf(55)).toBe(EDGES.length - 1);
  });

  it("compara contra los otros objetos del mismo precio en el mismo tramo", () => {
    const cost = new Map([
      [1, 3200],
      [2, 3200],
    ]);
    const rows = [
      { item_id: 1, bucket: 12, wins: 300, matches: 500 },
      { item_id: 2, bucket: 13, wins: 250, matches: 500 },
    ];
    const t = buildTiming(rows, cost);
    // 60 % contra el 50 % del otro de 3.200 en el tramo 10–15.
    expect(t["1"][1]).toEqual([500, 600, 100]);
    expect(t["2"][1]).toEqual([500, 500, -100]);
    expect(t["1"][0]).toBeNull();
  });

  it("no publica tramos con menos de 200 compras", () => {
    const t = buildTiming([{ item_id: 1, bucket: 5, wins: 80, matches: 150 }], new Map([[1, 800]]));
    expect(t["1"]).toBeUndefined();
  });
});
