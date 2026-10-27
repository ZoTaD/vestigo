/** Las cuentas de la calculadora de Rivens contra los extremos de la wiki (documento de fórmulas, sección 4). */
import { describe, expect, it } from "vitest";
import rivensJson from "../../games/warframe/data/rivens/list.json";
import { rivenFromShown, rivenGrade, rivenRange, rivenToShown, type Combo } from "../src/warframe/rivens/riven";

const D = 1.2;
const V = { crit: 0.016666001, dmg: 0.018333299, ms: 0.01, ammo: 0.00555 };

// [stat, combinación, ¿negativo?, mínimo esperado, máximo esperado]
const CASOS: [keyof typeof V, Combo, boolean, number, number][] = [
  ["crit", "2", false, 160.37, 196.01],
  ["crit", "2-", false, 200.46, 245.01],
  ["crit", "2-", true, -80.18, -98.0],
  ["crit", "3", false, 121.49, 148.49],
  ["crit", "3-", false, 151.86, 185.61],
  ["crit", "3-", true, -121.49, -148.49],
  ["dmg", "2", false, 176.42, 215.62],
  ["dmg", "2-", false, 220.52, 269.53],
  ["dmg", "2-", true, -88.21, -107.81],
  ["dmg", "3", false, 133.65, 163.35],
  ["dmg", "3-", false, 167.06, 204.19],
  ["dmg", "3-", true, -133.65, -163.35],
  ["ms", "2", false, 96.23, 117.61],
  ["ms", "2-", false, 120.29, 147.02],
  ["ms", "2-", true, -48.11, -58.81],
  ["ms", "3", false, 72.9, 89.1],
  ["ms", "3-", false, 91.13, 111.38],
  ["ms", "3-", true, -72.9, -89.1],
  ["ammo", "3-", false, 50.57, 61.81],
  ["ammo", "3-", true, -40.46, -49.45],
];

describe("rivenRange (rango 8)", () => {
  it.each(CASOS)("%s %s negativo=%s", (stat, combo, curse, min, max) => {
    const [lo, hi] = rivenRange(V[stat], D, combo, curse, 8);
    expect(Math.abs(lo - min)).toBeLessThan(0.01);
    expect(Math.abs(hi - max)).toBeLessThan(0.01);
  });

  it("un negativo en una combinación sin negativo no existe", () => {
    expect(() => rivenRange(V.crit, D, "2", true)).toThrow();
  });
});

describe("rivenGrade", () => {
  const [lo, hi] = rivenRange(V.crit, D, "2", false);
  const [nlo, nhi] = rivenRange(V.crit, D, "2-", true);

  it("el mínimo vale 0, el máximo 100 y la mitad 50", () => {
    expect(rivenGrade(V.crit, D, "2", false, lo)).toBeCloseTo(0, 6);
    expect(rivenGrade(V.crit, D, "2", false, hi)).toBeCloseTo(100, 6);
    expect(rivenGrade(V.crit, D, "2", false, (lo + hi) / 2)).toBeCloseTo(50, 6);
  });

  it("fuera del rango es null", () => {
    expect(rivenGrade(V.crit, D, "2", false, lo - 1)).toBeNull();
    expect(rivenGrade(V.crit, D, "2", false, hi + 1)).toBeNull();
    expect(rivenGrade(V.crit, D, "2", false, Number.NaN)).toBeNull();
  });

  it("en un negativo, el menos negativo es el mejor", () => {
    expect(rivenGrade(V.crit, D, "2-", true, nlo)).toBeCloseTo(100, 6);
    expect(rivenGrade(V.crit, D, "2-", true, nhi)).toBeCloseTo(0, 6);
  });
});

describe("datos de Rivens", () => {
  it("todas las armas están en un tipo y con la misma disposición (1,2)", () => {
    const tipos = new Set(rivensJson.types.map((t) => t.key));
    for (const w of rivensJson.weapons) {
      expect(tipos.has(w.type)).toBe(true);
      expect(w.d).toBe(1.2);
    }
  });
});

describe("cómo se muestra cada stat", () => {
  it("ida y vuelta", () => {
    for (const tag of ["WeaponCritChanceMod", "WeaponAmmoEfficiency", "WeaponFactionDamageGrineer", "WeaponMeleeFactionDamageCorpus"]) {
      expect(rivenFromShown(tag, rivenToShown(tag, 37.5))).toBeCloseTo(37.5, 9);
    }
  });
  it("daño a una facción es multiplicador y la eficiencia de munición invierte el signo", () => {
    expect(rivenToShown("WeaponFactionDamageGrineer", 30)).toBeCloseTo(1.3, 9);
    expect(rivenToShown("WeaponAmmoEfficiency", -40)).toBe(40);
    expect(rivenToShown("WeaponCritChanceMod", 40)).toBe(40);
  });
});
