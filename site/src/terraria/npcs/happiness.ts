/**
 * La cuenta de felicidad de un NPC de Terraria (2026-10-12), sin React. Las reglas están medidas en el propio juego
 * (`games/terraria/tools/Dump.cs`, bloque "vecinos") y cotejadas con la wiki: cada gusto multiplica el precio, vivir
 * con pocos vecinos lo baja y amontonarse lo sube; al final se redondea a dos decimales y se acota.
 */

export type Level = "love" | "like" | "dislike" | "hate";

export interface NpcData {
  consts: { love: number; like: number; dislike: number; hate: number; min: number; max: number; solitude: number; solitudeUpTo: number; crowdFrom: number; crowdStep: number };
  biomes: Record<string, { name: [en: string, es: string]; pylon: number }>;
  npcs: { id: number; name: [en: string, es: string]; head: number; biomes: Record<string, Level>; likes: Record<string, Level> }[];
  refs: Record<string, [slug: string, slugEs: string, en: string, es: string, rare: number, w: number, h: number]>;
}

/** Los biomas donde el juego ni hace la cuenta: en la Mazmorra, la Corrupción y el Carmesí todo cuesta el máximo. */
export const RUINED_BIOMES = ["Dungeon", "Corruption", "Crimson"];
/** El Tabernero no vende pilones, viva donde viva. */
export const NO_PYLON_NPCS = [550];

export type Factor = { kind: "biome"; level: Level } | { kind: "npc"; level: Level; npc: number } | { kind: "solitude" } | { kind: "crowd"; neighbors: number } | { kind: "ruined" };

export interface Mood {
  /** El multiplicador del precio de su tienda: 0,75 es lo más barato y 1,5 lo más caro. */
  price: number;
  factors: Factor[];
  /** ¿Vende el pilón de este bioma? Desde la 1.4.5 no depende del precio: alcanza con tener otro NPC cerca. */
  pylon: boolean;
}

/** El precio de `npc` viviendo en `biome` con `others` (los demás NPC de la casa) como vecinos. */
export function moodOf(data: NpcData, npc: number, biome: string, others: readonly number[]): Mood {
  const c = data.consts;
  const me = data.npcs.find((n) => n.id === npc);
  if (!me) return { price: 1, factors: [], pylon: false };
  const neighbors = others.filter((o) => o !== npc);
  if (RUINED_BIOMES.includes(biome)) return { price: c.max, factors: [{ kind: "ruined" }], pylon: false };
  const factors: Factor[] = [];
  let m = 1;
  if (neighbors.length <= c.solitudeUpTo) {
    m *= c.solitude;
    factors.push({ kind: "solitude" });
  } else if (neighbors.length > c.crowdFrom) {
    m *= c.crowdStep ** (neighbors.length - c.crowdFrom);
    factors.push({ kind: "crowd", neighbors: neighbors.length });
  }
  const biomeLevel = me.biomes[biome];
  if (biomeLevel) {
    m *= c[biomeLevel];
    factors.push({ kind: "biome", level: biomeLevel });
  }
  for (const o of neighbors) {
    const level = me.likes[String(o)];
    if (level) {
      m *= c[level];
      factors.push({ kind: "npc", level, npc: o });
    }
  }
  const price = Math.min(c.max, Math.max(c.min, Math.round(m * 100) / 100));
  const pylon = neighbors.length > 0 && !NO_PYLON_NPCS.includes(npc) && (data.biomes[biome]?.pylon ?? 0) > 0;
  return { price, factors, pylon };
}
