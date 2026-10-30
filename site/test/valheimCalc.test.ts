import { describe, expect, it } from "vitest";
import {
  afterDeath, applyArmor, applyMods, armorAt, bestCombo, blockAt, canEatAgainAt, comboAt, comfortLevel, foodValue,
  levelDamage, restedSeconds, skillRange, weaponDamage, xpBetween, xpForNext,
} from "../src/valheimCalc/math";
import type { ItemRow } from "../src/valheimData";

const food = (id: string, hp: number, st: number, eitr: number, min: number, tier: ItemRow["tier"] = "meadows") =>
  ({ id, tier, food: { hp, st, eitr, min, regen: 1 } }) as unknown as ItemRow;

describe("comida (Player.UpdateFood)", () => {
  it("baja con la potencia 0,3 del tiempo que queda: los casos de la wiki", () => {
    const f = { hp: 45, st: 0, eitr: 0, min: 100 };
    expect(Math.round(foodValue(f, 25).hp)).toBe(41);
    expect(Math.round(foodValue(f, 50).hp)).toBe(37);
    expect(Math.round(foodValue(f, 75).hp)).toBe(30);
    expect(Math.round(foodValue(f, 90).hp)).toBe(23);
    expect(foodValue(f, 100).hp).toBe(0);
    expect(foodValue(f, 0).hp).toBe(45);
  });
  it("sin comida: la base del jugador", () => {
    expect(comboAt([], 0)).toEqual({ hp: 25, st: 50, eitr: 0 });
  });
  it("se puede volver a comer a la mitad del tiempo", () => {
    expect(canEatAgainAt({ hp: 1, st: 1, eitr: 0, min: 30 })).toBe(15);
  });
  it("el mejor trío: tres distintos y sólo del bioma elegido o anteriores", () => {
    const foods = [food("a", 10, 10, 0, 10), food("b", 20, 0, 0, 10), food("c", 0, 30, 0, 10), food("d", 100, 100, 0, 10, "plains"), food("e", 5, 5, 0, 10)];
    const best = bestCombo(foods, "hpst", "swamp").map((f) => f.id).sort();
    expect(best).toEqual(["a", "b", "c"]);
    expect(bestCombo(foods, "hpst", "plains").map((f) => f.id)).toContain("d");
  });
});

describe("daño (Skills.GetRandomSkillFactor, ItemData.GetDamage)", () => {
  it("rango del factor de habilidad", () => {
    expect(skillRange(0)[0]).toBeCloseTo(0.25);
    expect(skillRange(0)[1]).toBeCloseTo(0.55);
    expect(skillRange(100)[0]).toBeCloseTo(0.85);
    expect(skillRange(100)[1]).toBe(1);
    expect(skillRange(150)).toEqual(skillRange(100));
  });
  it("calidad: base + por nivel · (q − 1)", () => {
    const sw = { damage: { slash: 55 }, damagePerLevel: { slash: 6 } } as unknown as ItemRow;
    expect(weaponDamage(sw, 1)).toEqual({ slash: 55 });
    expect(weaponDamage(sw, 4)).toEqual({ slash: 73 });
  });
  it("debilidades y resistencias", () => {
    expect(applyMods({ slash: 100, fire: 10 }, { slash: "weak", fire: "immune" })).toEqual({ slash: 150, fire: 0 });
    expect(applyMods({ blunt: 100 }, { blunt: "veryResistant" })).toEqual({ blunt: 25 });
  });
  it("estrellas: 1 + 0,5 por estrella", () => {
    expect(levelDamage(0)).toBe(1);
    expect(levelDamage(2)).toBe(2);
  });
});

describe("armadura y bloqueo (DamageTypes.ApplyArmor)", () => {
  it("sobre el total del golpe, repartido en proporción", () => {
    expect(applyArmor({ blunt: 100 }, 40).blunt).toBeCloseTo(60);
    expect(applyArmor({ blunt: 60 }, 40).blunt).toBeCloseTo(22.5);
    const mix = applyArmor({ slash: 50, fire: 50 }, 100);
    expect(mix.slash).toBeCloseTo(12.5);
    expect(mix.fire).toBeCloseTo(12.5);
    expect(applyArmor({ blunt: 30 }, 0).blunt).toBe(30);
  });
  it("armadura y bloqueo por calidad", () => {
    const helm = { armor: 20, armorPerLevel: 2 } as unknown as ItemRow;
    expect(armorAt(helm, 3)).toBe(24);
    const shield = { blockPower: 42, blockPerLevel: 6 } as unknown as ItemRow;
    expect(blockAt(shield, 3, 0)).toBe(54);
    expect(blockAt(shield, 1, 100)).toBe(63);
  });
});

describe("confort (SE_Rested.CalculateComfortLevel)", () => {
  const fire1 = { id: "fire_pit", comfort: 1, group: "Fire" };
  const hearth = { id: "hearth", comfort: 2, group: "Fire" };
  const rug = { id: "rug_deer", comfort: 1, group: "Carpet" };
  const plant1 = { id: "plant_a", comfort: 1, group: null };
  const plant2 = { id: "plant_b", comfort: 1, group: null };
  it("sin techo es 1", () => {
    expect(comfortLevel([fire1, hearth, rug], false)).toBe(1);
  });
  it("bajo techo: 1 + 1 + la mejor de cada grupo + las sin grupo", () => {
    expect(comfortLevel([fire1, hearth], true)).toBe(4);
    expect(comfortLevel([fire1, rug, plant1, plant2, plant1], true)).toBe(6);
  });
  it("descanso: 8 min con 1 y uno más por punto", () => {
    expect(restedSeconds(1)).toBe(480);
    expect(restedSeconds(17)).toBe(1440);
  });
});

describe("habilidades (Skills)", () => {
  it("XP al siguiente nivel", () => {
    expect(xpForNext(0)).toBe(1);
    expect(xpForNext(99)).toBeCloseTo(500.5);
    expect(xpForNext(10.7)).toBe(xpForNext(10));
  });
  it("XP entre dos niveles", () => {
    expect(xpBetween(0, 2)).toBeCloseTo(xpForNext(0) + xpForNext(1));
    expect(xpBetween(5, 5)).toBe(0);
  });
  it("muerte: pierde el % del nivel", () => {
    expect(afterDeath(50, 0.05)).toBeCloseTo(47.5);
    expect(afterDeath(47.5, 0.05)).toBeCloseTo(45.125);
  });
});
