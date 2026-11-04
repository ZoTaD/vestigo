import { describe, expect, it } from "vitest";
import { change, movers, type MarketRow } from "../src/cs2/market/movers";

// [nombre, slug, rareza, m24, m7, m30, m90, v7, v30]
const ROWS: MarketRow[] = [
  ["Sube (Field-Tested)", "sube", "covert", 12, 11, 10, 9, 40, 200],
  ["Baja (Field-Tested)", "baja", "milspec", 7, 8, 10, 12, 30, 150],
  ["Rara (Field-Tested)", "rara", "milspec", 5, 5, 5, 5, 2, 40],
  ["Sin 24 h", "sin", "milspec", null, 5, 4, 4, 20, 120],
  ["Caja", "caja", "case", 1.1, 1, 1, 1.2, 500, 3000],
];

describe("el cambio de cada período", () => {
  it("7 días contra 30, 24 h contra 7 días, 30 contra 90", () => {
    expect(change(ROWS[0], "7v30")).toBeCloseTo(0.1);
    expect(change(ROWS[0], "1v7")).toBeCloseTo(12 / 11 - 1);
    expect(change(ROWS[0], "30v90")).toBeCloseTo(10 / 9 - 1);
  });
  it("sin una de las dos medianas no hay cambio (nada de dividir por cero)", () => {
    expect(change(ROWS[3], "1v7")).toBeNull();
    expect(change(["x", "x", "", 1, 1, 0, 1, 1, 100], "7v30")).toBeNull();
  });
});

describe("suben, bajan y más vendidas", () => {
  it("ordena por el cambio, deja afuera lo que no llega al mínimo de ventas", () => {
    const m = movers(ROWS, "7v30", 100, "all");
    expect(m.up.map((r) => r[1])).toEqual(["sin", "sube"]);
    expect(m.down.map((r) => r[1])).toEqual(["baja"]);
    expect(m.top.map((r) => r[1])).toEqual(["caja", "sube", "baja", "sin"]);
  });
  it("filtra por tipo", () => {
    expect(movers(ROWS, "7v30", 30, "cases").top.map((r) => r[1])).toEqual(["caja"]);
    expect(movers(ROWS, "7v30", 30, "skins").top.map((r) => r[1])).not.toContain("caja");
  });
});
