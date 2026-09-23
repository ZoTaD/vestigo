import { describe, expect, it } from "vitest";
import {
  addItem,
  removeItem,
  investment,
  overlap,
  encodeBuild,
  decodeBuild,
  upgradesOwned,
  ownedWithComponents,
  BUILD_SLOTS,
  type BuilderItem,
} from "../src/deadlockBuilder";

/** Un catálogo chico con una cadena de mejora: 1 (800) → 2 (1.600) → 3 (3.200). */
const CAT: Record<number, BuilderItem> = {
  1: { itemId: 1, cost: 800, slot: "spirit", upgradesFrom: [], upgradesTo: [2] },
  2: { itemId: 2, cost: 1600, slot: "spirit", upgradesFrom: [1], upgradesTo: [3] },
  3: { itemId: 3, cost: 3200, slot: "spirit", upgradesFrom: [2], upgradesTo: [] },
  10: { itemId: 10, cost: 3200, slot: "weapon", upgradesFrom: [], upgradesTo: [] },
  11: { itemId: 11, cost: 1600, slot: "weapon", upgradesFrom: [], upgradesTo: [] },
  20: { itemId: 20, cost: 6400, slot: "vitality", upgradesFrom: [], upgradesTo: [] },
};
const look = (id: number) => CAT[id];

describe("addItem", () => {
  it("agrega al final", () => {
    expect(addItem([10], 20, look)).toEqual({ items: [10, 20], result: "added" });
  });

  it("comprar la mejora reemplaza al componente en su lugar, como en el juego", () => {
    expect(addItem([10, 1, 20], 2, look)).toEqual({ items: [10, 2, 20], result: "upgraded", replaced: 1 });
  });

  it("la mejora entra aunque la build esté llena: ocupa la casilla del componente", () => {
    const llena = [1, ...Array.from({ length: BUILD_SLOTS - 1 }, (_, i) => 100 + i)];
    const cat = { ...CAT, ...Object.fromEntries(llena.slice(1).map((id) => [id, { ...CAT[11], itemId: id }])) };
    expect(addItem(llena, 2, (id) => cat[id]).result).toBe("upgraded");
  });

  it("no repite un objeto", () => {
    expect(addItem([10], 10, look)).toEqual({ items: [10], result: "duplicate" });
  });

  it("no agrega un componente si ya tenés su mejora", () => {
    expect(addItem([2], 1, look)).toEqual({ items: [2], result: "has-upgrade" });
  });

  it("tampoco si la mejora está dos escalones más arriba", () => {
    expect(addItem([3], 1, look)).toEqual({ items: [3], result: "has-upgrade" });
  });

  it("comprar el III con el I en la build consume el I, como el juego", () => {
    expect(addItem([10, 1], 3, look)).toEqual({ items: [10, 3], result: "upgraded", replaced: 1 });
  });

  it("con doce no entra un decimotercero", () => {
    const llena = Array.from({ length: BUILD_SLOTS }, (_, i) => 100 + i);
    const cat = { ...CAT, ...Object.fromEntries(llena.map((id) => [id, { ...CAT[11], itemId: id }])) };
    expect(addItem(llena, 10, (id) => cat[id])).toEqual({ items: llena, result: "full" });
  });

  it("ignora ids que no están en el catálogo", () => {
    expect(addItem([10], 999, look)).toEqual({ items: [10], result: "unknown" });
  });
});

describe("ownedWithComponents", () => {
  it("con un escalón III en la build, el II y el I también quedan adquiridos", () => {
    expect([...ownedWithComponents([3, 10], look)].sort((a, b) => a - b)).toEqual([1, 2, 3, 10]);
  });

  it("sin mejoras en la build, sólo lo que está", () => {
    expect([...ownedWithComponents([1, 10], look)].sort((a, b) => a - b)).toEqual([1, 10]);
  });
});

describe("removeItem", () => {
  it("saca el objeto y deja el resto en orden", () => {
    expect(removeItem([10, 2, 20], 2)).toEqual([10, 20]);
  });
});

describe("upgradesOwned", () => {
  it("marca la mejora de algo que ya está en la build", () => {
    expect(upgradesOwned(CAT[2], [1])).toBe(true);
    expect(upgradesOwned(CAT[3], [1])).toBe(false);
  });
});

describe("investment", () => {
  it("suma almas por categoría y las pasa por la escalera del juego", () => {
    // Arma 3.200 + 1.600 = 4.800 → +46%; espíritu 3.200 → +19; vida 6.400 → +42%.
    const inv = investment([10, 11, 3, 20], look);
    expect(inv.total).toBe(14400);
    expect(inv.weapon).toMatchObject({ souls: 4800, bonus: 46, next: { souls: 6400, bonus: 54 } });
    expect(inv.spirit).toMatchObject({ souls: 3200, bonus: 19 });
    expect(inv.vitality).toMatchObject({ souls: 6400, bonus: 42 });
  });

  it("sin almas en una categoría el bonus es cero y el próximo escalón es el primero", () => {
    expect(investment([], look).weapon).toEqual({ souls: 0, bonus: 0, next: { souls: 800, bonus: 9 } });
  });
});

describe("overlap", () => {
  it("cuenta objetos en común", () => {
    expect(overlap([1, 2, 3], [3, 2, 9])).toBe(2);
  });
});

describe("encodeBuild / decodeBuild", () => {
  it("ida y vuelta", () => {
    const s = encodeBuild(11, [4053935515, 1763073141]);
    expect(decodeBuild(s)).toEqual({ heroId: 11, items: [4053935515, 1763073141] });
  });

  it("rechaza basura sin romper", () => {
    expect(decodeBuild("")).toBeNull();
    expect(decodeBuild("!!.x")).toBeNull();
    expect(decodeBuild("b.@@")).toEqual({ heroId: 11, items: [] }); // "b" es 11 en base 36
  });

  it("descarta repetidos y corta en doce", () => {
    const ids = Array.from({ length: 15 }, (_, i) => 1000 + i);
    const s = encodeBuild(3, [...ids, 1000]);
    const d = decodeBuild(s)!;
    expect(d.items).toHaveLength(BUILD_SLOTS);
    expect(new Set(d.items).size).toBe(BUILD_SLOTS);
  });
});
