import { describe, expect, it } from "vitest";
import type { SkinPrice, SkinRow } from "../src/cs2/data";
import { contract, inverse, type TradeupCtx } from "../src/cs2/tradeup/engine";

const sk = (slug: string, rarity: SkinRow["rarity"], col: string, min = 0, max = 1, o: Partial<SkinRow> = {}): SkinRow & { col: string } => ({
  slug, name: slug, weapon: "AK-47", cat: "rifles", rarity, min, max, st: true, sv: false, img: slug, col, ...o,
});
const SKINS = [
  sk("a1", "restricted", "A"), sk("a2", "restricted", "A", 0, 0.08),
  sk("ca1", "classified", "A"), sk("ca2", "classified", "A", 0.1, 0.5), sk("ca3", "classified", "A"),
  sk("b1", "restricted", "B"), sk("cb1", "classified", "B"), sk("cb2", "classified", "B"),
  sk("cov1", "covert", "A"), sk("cov2", "covert", "N"),
  sk("knife", "covert", "", null as never, null as never, { cat: "knives" }),
  sk("top", "covert", "T"),
];
const flat = (v: number): SkinPrice => ({ n: [v, v, v, v, v], st: [v * 2, v * 2, v * 2, v * 2, v * 2] });
const PRICES: Record<string, SkinPrice> = {
  a1: flat(1), a2: flat(1), b1: flat(1), ca1: flat(10), ca2: flat(20), ca3: { n: [5, 5, 5, 5, 5] }, cb1: flat(8), cb2: flat(2),
  cov1: flat(50), knife: { n: [300] },
};
const ctx = (fee = 0): TradeupCtx => ({
  skins: new Map(SKINS.map((s) => [s.slug, s])),
  prices: PRICES,
  tradeup: {
    A: { name: "A", tiers: { restricted: ["a1", "a2"], classified: ["ca1", "ca2", "ca3"], covert: ["cov1"] }, rare: ["knife"] },
    B: { name: "B", tiers: { restricted: ["b1"], classified: ["cb1", "cb2"] }, rare: [] },
    N: { name: "N", tiers: { covert: ["cov2"] }, rare: [] },
    T: { name: "T", tiers: { covert: ["top"] }, rare: [] },
  },
  fee,
});
const rep = (slug: string, n: number, float = 0.2) => Array.from({ length: n }, () => ({ slug, float }));

describe("contrato de trade-up", () => {
  it("cada colección pesa por sus entradas y se reparte entre sus resultados (7/3 con 3 y 2 → 23,33 % y 15 %)", () => {
    const r = contract([...rep("a1", 7), ...rep("b1", 3)], "n", ctx());
    expect(r.valid).toBeNull();
    const ch = Object.fromEntries(r.outcomes.map((o) => [o.slug, o.chance]));
    expect(ch.ca1).toBeCloseTo(0.7 / 3);
    expect(ch.cb1).toBeCloseTo(0.15);
    expect(r.outcomes.reduce((s, o) => s + o.chance, 0)).toBeCloseTo(1);
  });
  it("el float de salida usa el float normalizado de cada entrada", () => {
    // a2 va de 0 a 0,08: 0,04 es la mitad (0,5); a1 a 0,5 también es 0,5 → promedio 0,5.
    const r = contract([...rep("a2", 5, 0.04), ...rep("a1", 5, 0.5)], "n", ctx());
    expect(r.avgN).toBeCloseTo(0.5);
    expect(r.outcomes.find((o) => o.slug === "ca2")!.float).toBeCloseTo(0.3);
  });
  it("un float fuera del rango de la skin se acota", () => {
    expect(contract(rep("a2", 10, 0.5), "n", ctx()).avgN).toBeCloseTo(1);
  });
  it("5 Encubiertos dan el objeto especial de la caja de su colección", () => {
    const r = contract(rep("cov1", 5), "n", ctx());
    expect(r.valid).toBeNull();
    expect(r.outcomes.map((o) => o.slug)).toEqual(["knife"]);
    expect(r.outcomes[0].float).toBeNull();
  });
  it("un Encubierto de una colección sin caja no da nada, y lo dice", () => {
    expect(contract(rep("cov2", 5), "n", ctx()).valid).toMatch(/caja/);
  });
  it("faltan entradas: lo dice, pero calcula igual", () => {
    const r = contract(rep("a1", 4), "n", ctx());
    expect(r.valid).toMatch(/6/);
    expect(r.outcomes.length).toBe(3);
  });
  it("no se mezclan rarezas", () => {
    expect(contract([...rep("a1", 5), ...rep("ca1", 5)], "n", ctx()).valid).toMatch(/rareza/);
  });
  it("StatTrak sin precio StatTrak en una salida: va sin precio y no cuenta para ganar", () => {
    const r = contract(rep("a1", 10), "st", ctx());
    const ca3 = r.outcomes.find((o) => o.slug === "ca3")!;
    expect(ca3.price).toBeNull();
    expect(r.cost).toBeCloseTo(20);
    // Gana sólo con ca2 (40 StatTrak > 20): 1/3.
    expect(r.win).toBeCloseTo(1 / 3);
  });
  it("la comisión baja el valor neto", () => {
    const r = contract(rep("a1", 10), "n", ctx(0.1));
    expect(r.ev).toBeCloseTo((10 + 20 + 5) / 3);
    expect(r.net).toBeCloseTo(r.ev * 0.9);
    expect(r.profit).toBeCloseTo(r.net - 10);
  });
});

describe("trade-up inverso", () => {
  it("el float promedio máximo para sacar un desgaste, y las entradas que sirven de la más barata a la más cara", () => {
    // ca2 va de 0,10 a 0,50: para MW (hasta 0,15) el promedio normalizado tiene que quedar por debajo de 0,125.
    const r = inverse("ca2", 1, ctx());
    expect(r.nMax).toBeCloseTo(0.125);
    expect(r.chance).toBeCloseTo(1 / 3);
    expect(r.inputs.map((i) => i.slug)).toEqual(["a1", "a2"]);
    expect(r.inputs[0].fMax).toBeCloseTo(0.125);
  });
  it("un desgaste que la skin no tiene da null", () => {
    expect(inverse("ca2", 0, ctx()).nMax).toBeNull();
  });
  it("para un cuchillo, las entradas son los Encubiertos de las colecciones cuya caja lo trae", () => {
    const r = inverse("knife", 0, ctx());
    expect(r.inputs.map((i) => i.slug)).toEqual(["cov1"]);
    expect(r.chance).toBeCloseTo(1);
  });
});
