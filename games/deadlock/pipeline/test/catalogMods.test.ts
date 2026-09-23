import { describe, expect, it } from "vitest";
import { modsDe } from "../src/catalog";

// Recortes reales de /v1/assets/items del 2026-09-22.
const innate = (...props: string[]) => [{ section_type: "innate", section_attributes: [{ properties: props }] }];

describe("modsDe", () => {
  it("toma los modificadores de la sección innata", () => {
    const props = {
      BonusClipSizePercent: { value: "30", provided_property_type: "MODIFIER_VALUE_AMMO_CLIP_SIZE_PERCENT" },
      BaseAttackDamagePercent: { value: "8", provided_property_type: "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE" },
    };
    expect(modsDe(props, innate("BonusClipSizePercent", "BaseAttackDamagePercent"))).toEqual({
      AMMO_CLIP_SIZE_PERCENT: 30,
      WEAPON_DAMAGE_INCREASE: 8,
    });
  });

  it("ignora lo que sólo vale activado (Colossus)", () => {
    const props = {
      BaseAttackDamagePercent: { value: "15", provided_property_type: "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE" },
      BonusMeleeDamagePercent: { value: "30", provided_property_type: "MODIFIER_VALUE_MELEE_DAMAGE_INCREASE" },
    };
    const secciones = [
      ...innate("BaseAttackDamagePercent"),
      { section_type: "active", section_attributes: [{ properties: ["BonusMeleeDamagePercent"] }] },
    ];
    expect(modsDe(props, secciones)).toEqual({ WEAPON_DAMAGE_INCREASE: 15 });
  });

  it("ignora lo condicional, los ceros y los valores sin número", () => {
    const props = {
      A: { value: "20", provided_property_type: "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE", conditional: "within Range" },
      B: { value: "15", provided_property_type: "MODIFIER_VALUE_BULLET_ARMOR_DAMAGE_RESIST", usage_flags: ["ConditionallyApplied"] },
      C: { value: "0", provided_property_type: "MODIFIER_VALUE_TECH_POWER" },
      D: { provided_property_type: "MODIFIER_VALUE_HEALTH_MAX" },
    };
    expect(modsDe(props, innate("A", "B", "C", "D"))).toEqual({});
  });

  it("con el mismo tipo en dos claves se queda con uno, no los suma", () => {
    const props = {
      AbilityLifestealPercentHero: { value: "13", provided_property_type: "MODIFIER_VALUE_TECH_LIFESTEAL" },
      BonusSpiritLifesteal: { value: "10", provided_property_type: "MODIFIER_VALUE_TECH_LIFESTEAL" },
    };
    expect(modsDe(props, innate("AbilityLifestealPercentHero", "BonusSpiritLifesteal"))).toEqual({ TECH_LIFESTEAL: 13 });
  });

  it("lee los metros como número", () => {
    const props = { BonusMoveSpeed: { value: "2.0m", provided_property_type: "MODIFIER_VALUE_MOVEMENT_SPEED_MAX" } };
    expect(modsDe(props, innate("BonusMoveSpeed"))).toEqual({ MOVEMENT_SPEED_MAX: 2 });
  });
});
