import { describe, expect, it } from "vitest";
import { recycleYield } from "../src/rust/items/recycle";

/** La cuenta del reciclador (Recycler.RecycleThink): más de 1 por objeto, ceil(cantidad × eficiencia); 1 o menos, una chance. */
describe("lo que da el reciclador", () => {
  it("los engranajes dan 13 fragmentos en una recicladora común y 10 en zona segura", () => {
    expect(recycleYield(25, 0.5)).toEqual({ kind: "fixed", n: 13 });
    expect(recycleYield(25, 0.4)).toEqual({ kind: "fixed", n: 10 });
  });
  it("2 de metal de alta calidad al 50 % es 1 seguro", () => {
    expect(recycleYield(2, 0.5)).toEqual({ kind: "fixed", n: 1 });
  });
  it("1 o menos es una probabilidad", () => {
    expect(recycleYield(1, 0.5)).toEqual({ kind: "chance", pct: 50 });
    expect(recycleYield(0.5, 0.4)).toEqual({ kind: "chance", pct: 20 });
  });
});
