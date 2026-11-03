import { describe, expect, it } from "vitest";
import { rarityKey, valuate } from "../src/cs2/inventory/value";
import type { InvItem } from "../src/cs2/inventory/steam";

const it2 = (name: string, n: number, type = "Container", rarity = "Base Grade"): InvItem => ({ name, n, icon: "x", type, rarity, tradable: true });

describe("valuar un inventario", () => {
  const v = valuate(
    [it2("Caja", 4), it2("Llave", 1, "Key"), it2("Medalla", 1, "Collectible"), it2("AK", 2, "Rifle", "Covert")],
    { Caja: 6.5, Llave: 2.49, AK: 100 },
  );
  it("suma cantidad × precio y deja afuera lo que no tiene precio", () => {
    expect(v.total).toBeCloseTo(4 * 6.5 + 2.49 + 200);
    expect(v.count).toBe(8);
    expect(v.unpriced).toBe(1);
    expect(v.items.find((x) => x.name === "Medalla")!.total).toBeNull();
  });
  it("agrupa por tipo, del que más vale al que menos", () => {
    expect(v.byType.map(([t]) => t)).toEqual(["Rifle", "Container", "Key", "Collectible"]);
  });
  it("lleva cada rareza de Steam a la del sitio (también stickers y agentes)", () => {
    expect(rarityKey("Mil-Spec Grade")).toBe("milspec");
    expect(rarityKey("Remarkable")).toBe("restricted");
    expect(rarityKey("Master")).toBe("covert");
    expect(rarityKey("algo raro")).toBe("consumer");
  });
});
