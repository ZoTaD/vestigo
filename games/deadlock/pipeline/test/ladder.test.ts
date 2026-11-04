import { describe, expect, it } from "vitest";
import { byProgress } from "../src/ladder";

describe("byProgress", () => {
  it("ordena por progreso del rango y saca las cuentas repetidas", () => {
    const filas = [
      { account_id: 2, value: 129520, matches: 674 },
      { account_id: 1, value: 144560, matches: 585 },
      { account_id: 2, value: 129520, matches: 674 },
      { account_id: 3, value: 129520, matches: 700 },
    ];
    expect(byProgress(filas)).toEqual([1, 3, 2]);
  });
});
