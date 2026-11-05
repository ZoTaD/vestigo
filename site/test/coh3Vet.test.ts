import { describe, expect, it } from "vitest";
import { parseVetLines, vetAt } from "../src/coh3/combat/vet";

// La veteranía del Panzer IV y de los Fusileros, tal como la traen los datos (coh3-data v2.5.3).
const PZ4 = [
  { desc: { en: "Veteran ability \n+20% main gun accuracy" } },
  { desc: { en: "+25% weapon penetration \n+30% rotation rate" } },
  { desc: { en: "+80 health \n+25% rate of fire \n+66% focused fire recharge speed" } },
];
const RIFLES = [
  { desc: { en: "Veteran ability choice \n+10% harder to hit" } },
  { desc: { en: "+25% weapon accuracy \n+50% ability recharge speed" } },
  { desc: { en: "+15 health \n+20% harder to hit \n+35% rate of fire" } },
];

describe("veteranía (2026-11-04)", () => {
  it("suma los niveles hasta el pedido", () => {
    expect(vetAt(PZ4, 0).penetration).toBe(1);
    expect(vetAt(PZ4, 1).accuracy).toBeCloseTo(1.2);
    expect(vetAt(PZ4, 2).penetration).toBeCloseTo(1.25);
    const v3 = vetAt(PZ4, 3);
    expect(v3.health).toBe(80);
    expect(v3.rateOfFire).toBeCloseTo(1.25);
  });

  it("'más difícil de alcanzar' baja la precisión que recibe, y se acumula", () => {
    expect(vetAt(RIFLES, 1).receivedAccuracy).toBeCloseTo(0.9);
    expect(vetAt(RIFLES, 3).receivedAccuracy).toBeCloseTo(0.9 * 0.8);
    expect(vetAt(RIFLES, 3).health).toBe(15);
  });

  it("lo que no cambia el combate queda como desconocido", () => {
    const { unknown } = parseVetLines("+30% rotation rate\n+20% damage reduction");
    expect(unknown).toEqual(["+30% rotation rate"]);
  });
});
