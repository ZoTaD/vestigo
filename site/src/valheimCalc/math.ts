/**
 * Las cuentas de las calculadoras de Valheim (2026-10-30), sin React.
 *
 * Cada fórmula está confirmada en el código del juego (`assembly_valheim.dll`); el método va en el comentario y el
 * detalle en docs/superpowers/specs/2026-10-30-valheim-calculadoras-design.md. La UI no explica de dónde salen.
 */
import { BIOME_IDS, type BiomeId, type ItemRow } from "../valheimData";

export type Stats = { hp: number; st: number; eitr: number };
type Food = { hp: number; st: number; eitr: number; min: number };

/** Salud y aguante sin comida (`Player.m_baseHP`, `m_baseStamina`). */
export const BASE: Stats = { hp: 25, st: 50, eitr: 0 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Lo que aporta una comida `tMin` minutos después de comerla (`Player.UpdateFood`: `base · (restante/duración)^0,3`). */
export function foodValue(f: Food, tMin: number): Stats {
  const k = tMin >= f.min ? 0 : Math.pow(clamp01((f.min - tMin) / f.min), 0.3);
  return { hp: f.hp * k, st: f.st * k, eitr: f.eitr * k };
}

/** La base más las comidas, `tMin` minutos después de comerlas juntas (`Player.GetTotalFoodValue`). */
export function comboAt(foods: Food[], tMin: number): Stats {
  const out = { ...BASE };
  for (const f of foods) {
    const v = foodValue(f, tMin);
    out.hp += v.hp; out.st += v.st; out.eitr += v.eitr;
  }
  return out;
}

/** Desde qué minuto se puede volver a comer (`Food.CanEatAgain`: cuando queda menos de la mitad). */
export const canEatAgainAt = (f: Food): number => f.min / 2;

/**
 * El mejor trío de comidas de un bioma o de los anteriores: "hpst" maximiza salud + aguante (desempata la curación) y
 * "eitr" maximiza el eitr (desempata la salud). Son ~142 mil tríos con 96 comidas: sumas, unos milisegundos.
 */
export function bestCombo(foods: ItemRow[], key: "hpst" | "eitr", maxTier: BiomeId): ItemRow[] {
  const top = BIOME_IDS.indexOf(maxTier);
  const pool = foods.filter((f) => f.food && (f.food.hp || f.food.st || f.food.eitr) && BIOME_IDS.indexOf(f.tier ?? "meadows") <= top);
  const score = (f: ItemRow) => (key === "hpst" ? f.food!.hp + f.food!.st : f.food!.eitr);
  const tie = (f: ItemRow) => (key === "hpst" ? f.food!.regen : f.food!.hp);
  let best: ItemRow[] = [], bs = -1, bt = -1;
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++)
      for (let k = j + 1; k < pool.length; k++) {
        const a = pool[i], b = pool[j], c = pool[k];
        const s = score(a) + score(b) + score(c), t = tie(a) + tie(b) + tie(c);
        if (s > bs || (s === bs && t > bt)) { bs = s; bt = t; best = [a, b, c]; }
      }
  return best;
}

/** El factor de daño por habilidad, mínimo y máximo (`Skills.GetRandomSkillFactor`). */
export function skillRange(level: number): [number, number] {
  const c = 0.4 + 0.6 * clamp01(level / 100);
  return [clamp01(c - 0.15), clamp01(c + 0.15)];
}

const add = (base: Record<string, number> | null | undefined, per: Record<string, number> | null | undefined, n: number) => {
  const out: Record<string, number> = { ...(base ?? {}) };
  if (n > 0) for (const [k, v] of Object.entries(per ?? {})) out[k] = (out[k] ?? 0) + v * n;
  return out;
};

/** El daño de un arma en una calidad (`ItemData.GetDamage`: base + por nivel · (q − 1)). Sin talar ni picar. */
export function weaponDamage(row: ItemRow, q: number): Record<string, number> {
  const out = add(row.damage, row.damagePerLevel, q - 1);
  delete out.chop; delete out.pickaxe;
  return out;
}

/** Armadura de una pieza en una calidad (`ItemData.GetArmor`). */
export const armorAt = (row: ItemRow, q: number): number => (row.armor ?? 0) + Math.max(0, q - 1) * (row.armorPerLevel ?? 0);

/** Bloqueo de un escudo en una calidad y con la habilidad Bloqueo (`ItemData.GetBlockPower`: + 0,5 · factor). */
export function blockAt(row: ItemRow, q: number, blockSkill: number): number {
  const base = (row.blockPower ?? 0) + Math.max(0, q - 1) * (row.blockPerLevel ?? 0);
  return base + base * clamp01(blockSkill / 100) * 0.5;
}

/** El multiplicador de cada `DamageModifier`. */
export const MOD_FACTOR: Record<string, number> = {
  veryWeak: 2, weak: 1.5, slightlyWeak: 1.25, normal: 1, slightlyResistant: 0.75, resistant: 0.5, veryResistant: 0.25, immune: 0, ignore: 0,
};

export function applyMods(dmg: Record<string, number>, mods: Record<string, string> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(dmg)) out[k] = v * (MOD_FACTOR[mods?.[k] ?? "normal"] ?? 1);
  return out;
}

/** Daño de una criatura con estrellas (`Attack.GetLevelDamageFactor`: nivel 1 = sin estrellas). */
export const levelDamage = (stars: number): number => 1 + 0.5 * stars;

export const total = (d: Record<string, number>): number => Object.values(d).reduce((a, b) => a + b, 0);

/**
 * La armadura contra un golpe (`DamageTypes.ApplyArmor`): sobre el total de todos los tipos; si la armadura no llega a
 * la mitad del golpe resta, si no, el golpe queda en `total² / (4 · armadura)`. Cada tipo baja en la misma proporción.
 */
export function applyArmor(dmg: Record<string, number>, ac: number): Record<string, number> {
  const sum = total(dmg);
  if (ac <= 0 || sum <= 0) return { ...dmg };
  const after = ac < sum / 2 ? sum - ac : sum * clamp01(sum / (4 * ac));
  const k = after / sum;
  const out: Record<string, number> = {};
  for (const [t, v] of Object.entries(dmg)) out[t] = v * k;
  return out;
}

export interface ComfortPiece { id: string; comfort: number; group: string | null }

/**
 * El confort al lado de la cama (`SE_Rested.CalculateComfortLevel`): 1; bajo techo, uno más y las piezas a 10 m. De
 * cada grupo cuenta la de más confort; las sin grupo suman todas, salvo la misma pieza repetida.
 */
export function comfortLevel(pieces: ComfortPiece[], shelter: boolean): number {
  if (!shelter) return 1;
  let c = 2;
  const groups = new Map<string, number>();
  const loose = new Set<string>();
  for (const p of pieces) {
    if (p.group) groups.set(p.group, Math.max(groups.get(p.group) ?? 0, p.comfort));
    else if (!loose.has(p.id)) { loose.add(p.id); c += p.comfort; }
  }
  for (const v of groups.values()) c += v;
  return c;
}

/** Cuánto dura el descanso, en segundos (`SE_Rested.UpdateTTL`: 480 + 60 por punto de confort pasado el primero). */
export const restedSeconds = (comfort: number): number => 480 + 60 * Math.max(0, comfort - 1);

/** XP para pasar del nivel `n` al siguiente (`Skill.GetNextLevelRequirement`). */
export const xpForNext = (n: number): number => 0.5 * Math.pow(Math.floor(n) + 1, 1.5) + 0.5;

/** XP desde el nivel entero `from` hasta `to`. */
export function xpBetween(from: number, to: number): number {
  let s = 0;
  for (let n = Math.floor(from); n < Math.floor(to); n++) s += xpForNext(n);
  return s;
}

/** El nivel después de morir (`Skills.OnDeath`: pierde `nivel · pct`; el avance al siguiente vuelve a 0). */
export const afterDeath = (level: number, pct: number): number => level - level * pct;
