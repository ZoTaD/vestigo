import { describe, expect, it } from "vitest";
import { readContract, writeContract } from "../src/cs2/tradeup/query";

const known = (slug: string) => slug === "ak-47-inheritance" || slug === "m4a4-etch-lord";

describe("el contrato en la dirección", () => {
  it("lee tipo, comisión y entradas; ignora un slug que no existe y un float que no es número", () => {
    const c = readContract("?t=st&f=15&i=ak-47-inheritance~0.21,nada~0.3,m4a4-etch-lord~abc,m4a4-etch-lord~0.4", known);
    expect(c.kind).toBe("st");
    expect(c.fee).toBeCloseTo(0.15);
    expect(c.inputs).toEqual([
      { slug: "ak-47-inheritance", float: 0.21 },
      { slug: "m4a4-etch-lord", float: 0.4 },
    ]);
  });
  it("sin nada en la dirección: contrato vacío, normal y 12 % de comisión", () => {
    expect(readContract("", known)).toEqual({ kind: "n", fee: 0.12, inputs: [] });
  });
  it("ida y vuelta", () => {
    const c = { kind: "sv" as const, fee: 0.12, inputs: [{ slug: "ak-47-inheritance", float: 0.2 }] };
    expect(readContract(writeContract(c), known)).toEqual(c);
  });
  it("como mucho 10 entradas", () => {
    const q = "?i=" + Array.from({ length: 14 }, () => "ak-47-inheritance~0.2").join(",");
    expect(readContract(q, known).inputs).toHaveLength(10);
  });
});
