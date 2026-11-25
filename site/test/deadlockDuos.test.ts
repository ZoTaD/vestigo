import { describe, expect, it } from "vitest";
import { buildDuos, duosHeroOf } from "../src/DeadlockDuos";
import type { Hero } from "../src/deadlockData";

const heroe = (heroId: number, winRate: number) => ({ heroId, winRate, name: `H${heroId}`, img: "" }) as unknown as Hero;
const file = (duos: [number, number, number, number][], band = "phantom-above") => ({
  generatedAt: "",
  minDuo: 200,
  bands: { [band]: { from: "2026-11-10", to: "2026-11-25", duos } },
});

describe("tier list de dúos", () => {
  it("pone letra por winrate y ordena de mejor a peor", () => {
    const d = buildDuos(file([[1, 2, 1000, 600], [1, 3, 1000, 400]]) as never, ["phantom-above"], [heroe(1, 0.5), heroe(2, 0.5), heroe(3, 0.5)]);
    expect(d.map((x) => [x.b.heroId, x.tier])).toEqual([
      [2, "S"],
      [3, "D"],
    ]);
  });

  it("suma las bandas para todos los rangos y deja afuera lo que no llega al piso", () => {
    const f = { generatedAt: "", minDuo: 200, bands: { "phantom-above": { from: "", to: "", duos: [[1, 2, 150, 75]] }, "archon-oracle": { from: "", to: "", duos: [[1, 2, 100, 50], [1, 3, 150, 80]] } } };
    const d = buildDuos(f as never, ["phantom-above", "archon-oracle"], [heroe(1, 0.5), heroe(2, 0.5), heroe(3, 0.5)]);
    expect(d).toHaveLength(1);
    expect(d[0].n).toBe(250);
  });

  it("la sinergia aparece sólo si supera tres errores estándar", () => {
    // Dos héroes al 50 %: lo esperado es 50 %. Con 10.000 partidas el error es 0,5 puntos.
    const h = [heroe(1, 0.5), heroe(2, 0.5), heroe(3, 0.5)];
    const d = buildDuos(file([[1, 2, 10000, 5300], [1, 3, 10000, 5100]]) as never, ["phantom-above"], h);
    expect(d[0].synergy).toBeCloseTo(0.03);
    expect(d[1].synergy).toBeUndefined();
  });

  it("lee el héroe de la dirección", () => {
    expect(duosHeroOf("duos")).toBeNull();
    expect(duosHeroOf(undefined)).toBeNull();
    expect(typeof duosHeroOf("duos/graves")).toBe("number");
  });
});
