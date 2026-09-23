import { describe, expect, it } from "vitest";
import { buildStats } from "../src/deadlockBuildStats";
import type { HeroBaseStats } from "../src/deadlockHeroKitData";
import type { Investment } from "../src/deadlockBuilder";

/** Los números base de Infernus (héroe 1) en hero-kit.json del 2026-09-22. */
const BASE: HeroBaseStats = {
  health: 830,
  healthRegen: 2,
  moveSpeed: 6.7,
  sprintSpeed: 1.6,
  stamina: 3,
  lightMelee: 50,
  heavyMelee: 116,
  perBoon: { bulletDamage: 0.088, health: 39, spiritPower: 1.1, meleeDamage: 1.58 },
  weapon: { bulletDamage: 5.5, pellets: 1, fireRate: 9.52, dps: 52.4, sustainedDps: 27.8, clip: 27, reload: 2.25, magazineDamage: 148.5 },
};

const inv = (weapon = 0, vitality = 0, spirit = 0): Investment => ({
  weapon: { souls: 0, bonus: weapon },
  vitality: { souls: 0, bonus: vitality },
  spirit: { souls: 0, bonus: spirit },
  total: 0,
});

const de = (rows: ReturnType<typeof buildStats>, key: string) => rows.find((r) => r.key === key)!;

describe("buildStats", () => {
  it("sin objetos devuelve los números base del juego", () => {
    const r = buildStats(BASE, [], inv());
    expect(de(r, "bulletDamage").value).toBeCloseTo(5.5);
    expect(de(r, "dps").value).toBeCloseTo(52.4, 1);
    expect(de(r, "magazineDamage").value).toBeCloseTo(148.5);
    expect(de(r, "health").value).toBe(830);
  });

  it("el daño de arma suma objetos e inversión", () => {
    // Extended Magazine (+8%) y la inversión de 4.800 almas de arma (+46%).
    const r = buildStats(BASE, [{ WEAPON_DAMAGE_INCREASE: 8, AMMO_CLIP_SIZE_PERCENT: 30 }], inv(46));
    expect(de(r, "weaponDamage").value).toBe(54);
    expect(de(r, "bulletDamage").value).toBeCloseTo(5.5 * 1.54);
    expect(de(r, "clip").value).toBe(Math.round(27 * 1.3));
  });

  it("las resistencias rinden menos al apilarse", () => {
    const r = buildStats(BASE, [{ BULLET_ARMOR_DAMAGE_RESIST: 30 }, { BULLET_ARMOR_DAMAGE_RESIST: 30 }], inv());
    expect(de(r, "bulletResist").value).toBeCloseTo(51);
  });

  it("la vida: base con su %, más la vida plana, por la inversión de vitalidad", () => {
    const r = buildStats(BASE, [{ HEALTH_MAX: 210 }], inv(0, 12));
    expect(de(r, "health").value).toBeCloseTo((830 + 210) * 1.12);
  });

  it("el poder espiritual es la inversión más lo plano, por el %", () => {
    const r = buildStats(BASE, [{ TECH_POWER: 12 }, { TECH_POWER_PERCENT: 15 }], inv(0, 0, 38));
    expect(de(r, "spiritPower").value).toBeCloseTo(50 * 1.15);
  });

  it("la recarga baja con su modificador negativo", () => {
    const r = buildStats(BASE, [{ RELOAD_SPEED: -10 }], inv());
    expect(de(r, "reload").value).toBeCloseTo(2.25 * 0.9);
    expect(de(r, "reload").lowerIsBetter).toBe(true);
  });
});
