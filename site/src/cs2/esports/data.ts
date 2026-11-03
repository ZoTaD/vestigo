/**
 * Los datos de la pestaña Torneos de CS2 (2026-11-03, etapa 6a). Los torneos, el ranking de Valve y los equipos los
 * escribe `games/cs2/tools/esports_data.py` (una vez por día); los partidos, que cambian cada hora, se piden a la
 * función `/api/cs2/matches` al abrir la página (no se prerenderizan).
 */
import { once } from "../../zomboid/store";
import type { Match } from "./matches";

type Mod<T> = { default: T };
export type Tier = "S" | "A" | "B" | "C";
export interface TourRow {
  slug: string;
  name: string;
  state: "ongoing" | "upcoming" | "concluded";
  series: string | null;
  organizer: string | null;
  type: string | null;
  location: string | null;
  venue: string | null;
  prize: number | null;
  start: string | null;
  end: string | null;
  teams: number | null;
  tier: Tier | null;
  streams: string[];
}
export interface Why {
  start: number | null;
  h2h: number | null;
  factors: Partial<Record<"bounty_offered" | "bounty_collected" | "network" | "lan", number>>;
  matches: { date: string; opp: string; won: boolean }[];
}
export interface VrsRow {
  rank: number;
  pts: number;
  team: string;
  roster: string[];
  /** El puesto del mes anterior (sólo en el mundial); `null`: no estaba. */
  prev?: number | null;
  why: Why;
  /** Su página en Liquipedia, si se pudo cruzar por nombre (para el logo). */
  lp: string | null;
}
export type Region = "global" | "europe" | "americas" | "asia";
export type Vrs = { date: string; before: string | null } & Record<Region, VrsRow[]>;
export type Teams = Record<string, { name: string; logo: string | null }>;
export type Esports = { tournaments: TourRow[]; vrs: Vrs; teams: Teams };

const tournaments = once<TourRow[]>(() => import("@cs2/esports/tournaments.json") as Promise<Mod<unknown>>);
const vrs = once<Vrs>(() => import("@cs2/esports/vrs.json") as Promise<Mod<unknown>>);
const teams = once<Teams>(() => import("@cs2/esports/teams.json") as Promise<Mod<unknown>>);

export const loadEsports = (): Promise<Esports> =>
  Promise.all([tournaments.load(), vrs.load(), teams.load()]).then(([t, v, tm]) => ({ tournaments: t, vrs: v, teams: tm }));
export function peekEsports(): Esports | undefined {
  const t = tournaments.peek(), v = vrs.peek(), tm = teams.peek();
  return t && v && tm ? { tournaments: t, vrs: v, teams: tm } : undefined;
}

/** Los partidos de la función; una sola vez por visita (la CDN ya los guarda 10 minutos). */
export type Matches = { at: number; matches: Match[] };
let matches: Promise<Matches> | null = null;
let matchesReady: Matches | undefined;
export function loadMatches(): Promise<Matches> {
  matches ??= fetch("/api/cs2/matches")
    .then((r) => (r.ok ? (r.json() as Promise<Matches>) : Promise.reject(new Error(`matches ${r.status}`))))
    .then((m) => (matchesReady = m))
    .catch((e) => {
      matches = null;
      throw e;
    });
  return matches;
}
export const peekMatches = () => matchesReady;
