import type { HeroBaseStats } from "./deadlockHeroKitData";
import type { Investment } from "./deadlockBuilder";

/**
 * Las stats del héroe con la build puesta: los números base del juego
 * (`hero-kit.json`) más lo que suma cada objeto sin condiciones (`mods` del
 * catálogo, sólo la sección "innate" de su tarjeta) y la inversión de almas.
 *
 * **Las reglas de combinación son las que se documentan acá, y se validan
 * contra el panel de stats del juego antes de publicar:**
 * - Los porcentajes de un mismo tipo se suman entre sí (8% + 12% = 20%).
 * - Las resistencias (balas, espíritu, cuerpo a cuerpo, debuffs) se combinan
 *   con rendimientos decrecientes: 1 − Π(1 − r). Dos de 30% dan 51%, no 60%.
 * - La inversión de arma es daño de arma %, la de espíritu es poder espiritual
 *   plano; la de vitalidad es vida extra % sobre la vida con objetos.
 * - Todo a nivel base del héroe, sin boons.
 *
 * Lo condicional ("a corta distancia", "al activarlo") no se cuenta: la stat
 * que se muestra es la que el héroe tiene siempre.
 */

export type StatGroup = "weapon" | "vitality" | "spirit";
export type StatUnit = "flat" | "pct" | "s" | "m" | "perSec";

export interface StatRow {
  key: string;
  group: StatGroup;
  base: number;
  value: number;
  unit: StatUnit;
  /** Cuántos decimales mostrar. */
  digits: number;
  /** Menos es mejor (el tiempo de recarga). */
  lowerIsBetter?: boolean;
}

type Mods = Record<string, number>;

const suma = (mods: Mods[], tipo: string): number => mods.reduce((a, m) => a + (m[tipo] ?? 0), 0);

/** 1 − Π(1 − r), con r en porcentaje. */
const decreciente = (mods: Mods[], tipo: string): number =>
  (1 - mods.reduce((a, m) => a * (1 - (m[tipo] ?? 0) / 100), 1)) * 100;

export function buildStats(base: HeroBaseStats, mods: Mods[], inv: Investment): StatRow[] {
  const w = base.weapon;
  const danioPct = inv.weapon.bonus + suma(mods, "WEAPON_DAMAGE_INCREASE");
  const cadenciaPct = suma(mods, "FIRE_RATE");
  const cargadorPct = suma(mods, "AMMO_CLIP_SIZE_PERCENT");
  const meleePct = suma(mods, "MELEE_DAMAGE_INCREASE");

  const filas: StatRow[] = [];
  const fila = (r: Omit<StatRow, "digits"> & { digits?: number }) => filas.push({ digits: 0, ...r });

  if (w) {
    const bala = w.bulletDamage * (1 + danioPct / 100);
    const cadencia = w.fireRate * (1 + cadenciaPct / 100);
    const cargador = Math.round(w.clip * (1 + cargadorPct / 100)) + suma(mods, "AMMO_CLIP_SIZE");
    const recarga = w.reload * (1 + suma(mods, "RELOAD_SPEED") / 100);
    fila({ key: "bulletDamage", group: "weapon", base: w.bulletDamage, value: bala, unit: "flat", digits: 1 });
    fila({ key: "pellets", group: "weapon", base: w.pellets, value: w.pellets, unit: "flat" });
    fila({ key: "dps", group: "weapon", base: w.bulletDamage * w.pellets * w.fireRate, value: bala * w.pellets * cadencia, unit: "flat", digits: 1 });
    fila({ key: "magazineDamage", group: "weapon", base: w.bulletDamage * w.pellets * w.clip, value: bala * w.pellets * cargador, unit: "flat" });
    fila({ key: "clip", group: "weapon", base: w.clip, value: cargador, unit: "flat" });
    fila({ key: "fireRate", group: "weapon", base: w.fireRate, value: cadencia, unit: "perSec", digits: 2 });
    fila({ key: "reload", group: "weapon", base: w.reload, value: recarga, unit: "s", digits: 2, lowerIsBetter: true });
  }
  fila({ key: "weaponDamage", group: "weapon", base: 0, value: danioPct, unit: "pct" });
  fila({ key: "bulletVelocity", group: "weapon", base: 0, value: suma(mods, "BONUS_BULLET_SPEED_PERCENT"), unit: "pct" });
  fila({ key: "bulletLifesteal", group: "weapon", base: 0, value: suma(mods, "BULLET_LIFESTEAL"), unit: "pct" });
  fila({ key: "lightMelee", group: "weapon", base: base.lightMelee, value: base.lightMelee * (1 + meleePct / 100), unit: "flat" });
  fila({ key: "heavyMelee", group: "weapon", base: base.heavyMelee, value: base.heavyMelee * (1 + meleePct / 100), unit: "flat" });

  const vida =
    (base.health * (1 + suma(mods, "BASE_HEALTH_PERCENT") / 100) + suma(mods, "HEALTH_MAX")) *
    (1 + inv.vitality.bonus / 100) *
    (1 + suma(mods, "HEALTH_MAX_PERCENT") / 100);
  fila({ key: "health", group: "vitality", base: base.health, value: vida, unit: "flat" });
  fila({ key: "healthRegen", group: "vitality", base: base.healthRegen, value: base.healthRegen + suma(mods, "HEALTH_REGEN_PER_SECOND"), unit: "perSec", digits: 1 });
  fila({ key: "outOfCombatRegen", group: "vitality", base: 0, value: suma(mods, "OUT_OF_COMBAT_HEALTH_REGEN"), unit: "perSec", digits: 1 });
  fila({ key: "bulletResist", group: "vitality", base: 0, value: decreciente(mods, "BULLET_ARMOR_DAMAGE_RESIST"), unit: "pct" });
  fila({ key: "spiritResist", group: "vitality", base: 0, value: decreciente(mods, "TECH_RESIST"), unit: "pct" });
  fila({ key: "meleeResist", group: "vitality", base: 0, value: decreciente(mods, "MELEE_RESIST"), unit: "pct" });
  fila({ key: "debuffResist", group: "vitality", base: 0, value: decreciente(mods, "STATUS_RESISTANCE"), unit: "pct" });
  fila({ key: "moveSpeed", group: "vitality", base: base.moveSpeed, value: base.moveSpeed + suma(mods, "MOVEMENT_SPEED_MAX"), unit: "m", digits: 1 });
  fila({ key: "sprintSpeed", group: "vitality", base: base.sprintSpeed, value: base.sprintSpeed + suma(mods, "SPRINT_SPEED_BONUS"), unit: "m", digits: 2 });
  fila({ key: "stamina", group: "vitality", base: base.stamina, value: base.stamina + suma(mods, "STAMINA"), unit: "flat" });

  const espiritu = (inv.spirit.bonus + suma(mods, "TECH_POWER")) * (1 + suma(mods, "TECH_POWER_PERCENT") / 100);
  fila({ key: "spiritPower", group: "spirit", base: 0, value: espiritu, unit: "flat" });
  fila({ key: "cooldownReduction", group: "spirit", base: 0, value: suma(mods, "COOLDOWN_REDUCTION_PERCENTAGE"), unit: "pct" });
  fila({ key: "abilityRange", group: "spirit", base: 0, value: suma(mods, "TECH_RANGE_PERCENT"), unit: "pct" });
  fila({ key: "abilityDuration", group: "spirit", base: 0, value: suma(mods, "BONUS_ABILITY_DURATION_PERCENTAGE"), unit: "pct" });
  fila({ key: "spiritLifesteal", group: "spirit", base: 0, value: suma(mods, "TECH_LIFESTEAL"), unit: "pct" });

  return filas;
}
