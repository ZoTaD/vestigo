import { describe, expect, it } from "vitest";
import { dailySeed, parseSeed, rng, seedDate, spin, STAGE_COSTS, type RouletteItem } from "../src/deadlockRouletteSpin";

/** Seis objetos por precio y estante; el 1º y el 2º de cada grupo son componente y mejora. */
function catalogo(): RouletteItem[] {
  const out: RouletteItem[] = [];
  let id = 1;
  for (const cost of STAGE_COSTS)
    for (const slot of ["weapon", "vitality", "spirit"] as const)
      for (let k = 0; k < 6; k++) out.push({ itemId: id++, cost, slot, related: [] });
  return out;
}

describe("ruleta", () => {
  it("la misma semilla da lo mismo, y otra semilla da otra cosa", () => {
    const items = catalogo();
    const a = spin(20261125, [1, 2, 3], items);
    expect(spin(20261125, [3, 2, 1], [...items].reverse())).toEqual(a);
    expect(spin(20261126, [1, 2, 3], items)).not.toEqual(a);
  });

  it("cuatro etapas de arma, vitalidad y espíritu, por precio, sin repetir", () => {
    const items = catalogo();
    const s = spin(42, [7], items)!;
    expect(s.heroId).toBe(7);
    expect(s.stages).toHaveLength(4);
    const por = new Map(items.map((i) => [i.itemId, i]));
    s.stages.forEach((etapa, k) => {
      expect(etapa.map((id) => por.get(id)!.slot)).toEqual(["weapon", "vitality", "spirit"]);
      for (const id of etapa) expect(por.get(id)!.cost).toBe(STAGE_COSTS[k]);
    });
    expect(new Set(s.stages.flat()).size).toBe(12);
  });

  it("nunca pone un objeto y su mejora", () => {
    // Un solo objeto de arma de 1.600, y es la mejora del único de 800: no hay build posible.
    const items: RouletteItem[] = catalogo().filter((i) => !(i.slot === "weapon" && (i.cost === 800 || i.cost === 1600)));
    items.push({ itemId: 900, cost: 800, slot: "weapon", related: [901] }, { itemId: 901, cost: 1600, slot: "weapon", related: [900] });
    expect(spin(1, [1], items)).toBeNull();
  });

  it("semillas del día y del link", () => {
    expect(dailySeed(new Date(Date.UTC(2026, 10, 25, 23)))).toBe(20261125);
    expect(seedDate(20261125)?.toISOString().slice(0, 10)).toBe("2026-11-25");
    expect(seedDate(123456789)).toBeNull();
    expect(parseSeed("123")).toBe(123);
    expect(parseSeed("-1")).toBeNull();
    expect(parseSeed("abc")).toBeNull();
    expect(parseSeed("99999999999")).toBeNull();
    const r = rng(5);
    expect(r()).toBe(rng(5)());
  });
});
