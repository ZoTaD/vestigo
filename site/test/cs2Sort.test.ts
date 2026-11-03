import { describe, expect, it } from "vitest";
import { nextSort, sortRows } from "../src/cs2/sort";

const ROWS = [
  { name: "b", p: 5 },
  { name: "a", p: null },
  { name: "c", p: 9 },
];
const COLS = { name: (r: (typeof ROWS)[number]) => r.name, p: (r: (typeof ROWS)[number]) => r.p };

describe("ordenar por columna", () => {
  it("de mayor a menor un número, y los vacíos siempre al final", () => {
    expect(sortRows(ROWS, COLS, { key: "p", dir: -1 }).map((r) => r.name)).toEqual(["c", "b", "a"]);
    expect(sortRows(ROWS, COLS, { key: "p", dir: 1 }).map((r) => r.name)).toEqual(["b", "c", "a"]);
  });
  it("el texto de la A a la Z", () => {
    expect(sortRows(ROWS, COLS, { key: "name", dir: 1 }).map((r) => r.name)).toEqual(["a", "b", "c"]);
  });
  it("tocar la misma columna invierte; otra columna arranca por lo más alto (o la A si es texto)", () => {
    expect(nextSort({ key: "p", dir: -1 }, "p")).toEqual({ key: "p", dir: 1 });
    expect(nextSort({ key: "p", dir: -1 }, "name", true)).toEqual({ key: "name", dir: 1 });
    expect(nextSort({ key: "name", dir: 1 }, "p")).toEqual({ key: "p", dir: -1 });
  });
});

describe("ordenar Skins por precio", () => {
  it("un precio sugerido (sin publicaciones) no ordena: queda al final", async () => {
    const { priceAt } = await import("../src/cs2/skins/SkinList");
    const s = { slug: "x", name: "x", weapon: "x", cat: "knives", rarity: "covert", min: 0, max: 1, st: false, sv: false, img: "x" } as const;
    expect(priceAt(s, { n: [55623, 10, null, null, null], sug: 1 }, 0)).toBeNull();
    expect(priceAt(s, { n: [55623, 10, null, null, null], sug: 1 }, 1)).toBe(10);
  });
});
