import { describe, expect, it } from "vitest";
import { masteryRank, readChecked, writeChecked, MASTERY_KEY } from "../src/warframe/mastery/mastery";

/** Un almacenamiento en memoria con lo mínimo que usa el código. */
function memory(initial: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as unknown as Storage;
}

describe("masteryRank", () => {
  it("el rango es el mayor n con 2.500·n² ≤ puntos", () => {
    expect(masteryRank(0).rank).toBe(0);
    expect(masteryRank(2500).rank).toBe(1);
    expect(masteryRank(9999).rank).toBe(1);
    expect(masteryRank(10000).rank).toBe(2);
    expect(masteryRank(2_249_999).rank).toBe(29);
  });
  it("lo que falta para el siguiente rango", () => {
    expect(masteryRank(0).next).toBe(2500);
    expect(masteryRank(9999).next).toBe(1);
  });
  it("del 30 en adelante cuenta los Legendarios de a 147.500", () => {
    expect(masteryRank(2_250_000)).toMatchObject({ rank: 30, legendary: 0, next: 147_500 });
    expect(masteryRank(2_397_500)).toMatchObject({ rank: 30, legendary: 1 });
    expect(masteryRank(2_397_499).legendary).toBe(0);
  });
});

describe("lo tildado", () => {
  it("lee un conjunto vacío de basura, de lo que no es un arreglo y de un almacenamiento que tira", () => {
    expect(readChecked(memory({ [MASTERY_KEY]: "no es json" })).size).toBe(0);
    expect(readChecked(memory({ [MASTERY_KEY]: "{}" })).size).toBe(0);
    expect(readChecked(null).size).toBe(0);
    const tira = { getItem() { throw new Error("bloqueado"); } } as unknown as Storage;
    expect(readChecked(tira).size).toBe(0);
  });
  it("ignora lo que no es un slug", () => {
    expect([...readChecked(memory({ [MASTERY_KEY]: '["ash",3,null,"atlas"]' }))]).toEqual(["ash", "atlas"]);
  });
  it("ida y vuelta, y un almacenamiento que tira al guardar no rompe", () => {
    const s = memory();
    writeChecked(s, new Set(["ash", "atlas-prime"]));
    expect([...readChecked(s)]).toEqual(["ash", "atlas-prime"]);
    const tira = { setItem() { throw new Error("lleno"); } } as unknown as Storage;
    expect(() => writeChecked(tira, new Set(["ash"]))).not.toThrow();
  });
});
