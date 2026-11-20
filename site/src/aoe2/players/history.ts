/**
 * Los filtros del historial de partidas del perfil de AoE2 (2026-11-20), sin React. Tests en `test/aoe2Matches.test.ts`.
 */
import type { Aoe2Match, MatchMode } from "../api/wel";

export type HistoryFilter = { mode?: MatchMode; civ?: number; map?: string; result?: "win" | "loss" };

/** Las partidas que cumplen todos los filtros; civ y resultado son los del dueño del perfil (`id`). */
export function filterHistory(matches: readonly Aoe2Match[], id: number, f: HistoryFilter): Aoe2Match[] {
  return matches.filter((m) => {
    const yo = m.players.find((p) => p.profileId === id);
    if (f.mode && m.mode !== f.mode) return false;
    if (f.map && m.map !== f.map) return false;
    if (f.civ != null && yo?.civ !== f.civ) return false;
    if (f.result && yo?.result !== f.result) return false;
    return true;
  });
}
