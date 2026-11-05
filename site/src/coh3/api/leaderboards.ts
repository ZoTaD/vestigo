/**
 * Los leaderboards de CoH3 que el sitio muestra (2026-11-04), sacados una vez de
 * `getAvailableLeaderboards?title=coh3`. Las que tienen jugadores son las `…Unranked` (matchtype 20–23: la ladder
 * de automatch). Las "ranked" (matchtype 1–4) hoy están vacías, pero se aceptan por si Relic las vuelve a usar.
 * Las de contra la IA y la `Custom` quedan afuera.
 */

export type Faction = "american" | "british" | "german" | "dak";
export type Mode = "1v1" | "2v2" | "3v3" | "4v4";
export type Leaderboard = { id: number; mode: Mode; faction: Faction; ranked: boolean };

export const FACTIONS: readonly Faction[] = ["american", "british", "german", "dak"];
export const MODES: readonly Mode[] = ["1v1", "2v2", "3v3", "4v4"];

// [modo, facción, id automatch (Unranked), id ranked]
const TABLA: [Mode, Faction, number, number][] = [
  ["1v1", "american", 2130255, 2130256],
  ["1v1", "british", 2130257, 2130258],
  ["1v1", "dak", 2130259, 2130260],
  ["1v1", "german", 2130261, 2130262],
  ["2v2", "american", 2130300, 2130301],
  ["2v2", "british", 2130302, 2130303],
  ["2v2", "dak", 2130304, 2130305],
  ["2v2", "german", 2130306, 2130307],
  ["3v3", "american", 2130329, 2130330],
  ["3v3", "british", 2130331, 2130332],
  ["3v3", "dak", 2130333, 2130334],
  ["3v3", "german", 2130335, 2130336],
  ["4v4", "american", 2130353, 2130354],
  ["4v4", "british", 2130356, 2130357],
  ["4v4", "dak", 2130358, 2130359],
  ["4v4", "german", 2130360, 2130361],
];

export const LEADERBOARDS: readonly Leaderboard[] = TABLA.flatMap(([mode, faction, auto, ranked]) => [
  { id: auto, mode, faction, ranked: false },
  { id: ranked, mode, faction, ranked: true },
]);

const POR_ID = new Map(LEADERBOARDS.map((l) => [l.id, l]));
export const leaderboardById = (id: number): Leaderboard | undefined => POR_ID.get(id);

/** El leaderboard de automatch (el que tiene jugadores) de un modo y una facción. */
export const automatchId = (mode: Mode, faction: Faction): number =>
  LEADERBOARDS.find((l) => !l.ranked && l.mode === mode && l.faction === faction)!.id;

/** Regiones de `leaderboardRegion_id`. */
export const REGIONS: Record<number, string> = {
  2074389: "europe",
  2074390: "north-america",
  2074436: "middle-east",
  2074437: "asia",
  2074438: "south-america",
  2074440: "oceania",
  2074441: "africa",
  2074442: "unknown",
};

/** `race_id` → facción. Las británicas de multijugador son `British_Africa` (203852); 197345 es la británica vieja. */
const RAZAS: Record<number, Faction> = { 129494: "american", 137123: "german", 198437: "dak", 203852: "british", 197345: "british" };
export const factionOfRace = (raceId: number): Faction | null => RAZAS[raceId] ?? null;

/** `matchtype_id` → modo. 1–4 ranked, 20–23 automatch, 5–16 contra la IA, 0 personalizada. */
export function modeOfMatchType(t: number): { mode: Mode | "ai" | "custom" | "other"; ranked: boolean } {
  if (t >= 1 && t <= 4) return { mode: MODES[t - 1], ranked: true };
  if (t >= 20 && t <= 23) return { mode: MODES[t - 20], ranked: false };
  if (t >= 5 && t <= 16) return { mode: "ai", ranked: false };
  if (t === 0) return { mode: "custom", ranked: false };
  return { mode: "other", ranked: false };
}
