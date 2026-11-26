import type { MatchPlayer, Purchase } from "./deadlockMatch";

/**
 * "¿Cómo jugaste contra tu rango?" (2026-11-25): una partida contra los
 * jugadores del mismo héroe en salas de la misma banda, esta temporada.
 *
 * Las distribuciones salen de `analytics/player-stats/metrics` con `hero_ids`
 * y la banda de la sala (la misma unidad que el resto del sitio, ver
 * `deadlockVsBand.ts`); acá, lo que se compara de la partida y los tiempos de
 * los objetos.
 */

/** Lo que se compara, en este orden. `lowerIsBetter` invierte el percentil. */
export const VS_RANK_METRICS: { key: string; lowerIsBetter?: boolean; digits: number }[] = [
  { key: "net_worth_per_min", digits: 0 },
  { key: "player_damage_per_min", digits: 0 },
  { key: "boss_damage_per_min", digits: 0 },
  { key: "kda", digits: 2 },
  { key: "deaths", lowerIsBetter: true, digits: 0 },
];

/** Los valores de esta partida con las claves de la API. */
export function matchMetrics(p: MatchPlayer, durationS: number): Record<string, number> {
  const min = Math.max(1, durationS / 60);
  return {
    net_worth_per_min: p.netWorth / min,
    player_damage_per_min: p.damage / min,
    boss_damage_per_min: p.boss / min,
    kda: (p.kills + p.assists) / Math.max(1, p.deaths),
    deaths: p.deaths,
  };
}

/** Desde este precio, un objeto es "clave": los de 3.200 y 6.400. */
export const KEY_ITEM_COST = 3200;
/** Hasta tantos objetos se comparan, los primeros que compró. */
export const MAX_TIMINGS = 5;

export interface Timing {
  itemId: number;
  /** Minuto en que lo compró. */
  mine: number;
  /** Minuto típico de compra en la banda. */
  usual: number;
}

/**
 * Los objetos clave que compró, en orden, con el minuto típico de su banda.
 * Sin el dato de la banda (un objeto nuevo) no entra: no hay contra qué medir.
 */
export function keyTimings(purchases: Purchase[], costOf: (id: number) => number | undefined, usualMinute: (id: number) => number | undefined): Timing[] {
  const vistos = new Set<number>();
  const out: Timing[] = [];
  for (const p of [...purchases].sort((a, b) => a.buyS - b.buyS)) {
    if (vistos.has(p.itemId) || (costOf(p.itemId) ?? 0) < KEY_ITEM_COST) continue;
    vistos.add(p.itemId);
    const usual = usualMinute(p.itemId);
    if (usual === undefined || !Number.isFinite(usual) || usual <= 0) continue;
    out.push({ itemId: p.itemId, mine: p.buyS / 60, usual });
    if (out.length >= MAX_TIMINGS) break;
  }
  return out;
}
