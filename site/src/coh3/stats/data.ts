/**
 * Las estadísticas de partidas de CoH3 (2026-11-04): `games/coh3/stats/summary.json`, que arma `games/coh3/tools/stats.py`
 * todos los días con los datos abiertos de coh3stats.com. Las usan Estadísticas y la Tier list.
 */
import { once } from "../../zomboid/store";
import type { Faction } from "../../coh3Copy";

export type Mode = "1v1" | "2v2" | "3v3" | "4v4";
export const MODES: Mode[] = ["1v1", "2v2", "3v3", "4v4"];
export type Band = "all" | "lt1000" | "1000" | "1200" | "1400" | "1600";
export const BANDS: Band[] = ["all", "lt1000", "1000", "1200", "1400", "1600"];

export type GW = { g: number; w: number };
export interface BandStats {
  g: number;
  axisW: number;
  f: Partial<Record<Faction, GW>>;
}
export interface ModeStats {
  g: number;
  axisW: number;
  bands: Partial<Record<Band, BandStats>>;
  /** Sólo 1v1: `"german>american"` = partidas y victorias de la Wehrmacht contra EE. UU. */
  fvf: Partial<Record<Band, Record<string, GW>>>;
  maps: Record<string, BandStats>;
  /** Partidas por tramo de duración (`durStep` segundos); el último junta todo lo que sigue. */
  dur: number[];
}
export interface Summary {
  matches: number;
  modes: Partial<Record<Mode, ModeStats>>;
  from: string | null;
  to: string | null;
  days: number;
  durStep: number;
  generatedAt: string;
}

type Mod<T> = { default: T };
const summary = once<Summary>(() => import("@coh3stats/summary.json") as Promise<Mod<unknown>>);
export const loadSummary = () => summary.load();
export const peekSummary = () => summary.peek();

/** Porcentaje de victorias (0–1) o null sin partidas. */
export const wr = (x: GW | undefined | null): number | null => (x && x.g > 0 ? x.w / x.g : null);

/**
 * El intervalo de confianza del 95 % de un porcentaje (Wilson): con pocas partidas un 60 % no dice nada, y la Tier
 * list no le da letra a una facción cuyo intervalo es más ancho que ±6 puntos.
 */
export function wilson(x: GW): [number, number] {
  const n = x.g;
  if (!n) return [0, 1];
  const z = 1.96, p = x.w / n;
  const den = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [mid - half, mid + half];
}

export type Tier = "S" | "A" | "B" | "C" | "D";
/** La letra por el porcentaje de victorias: S ≥ 53 %, A ≥ 51 %, B ≥ 49 %, C ≥ 47 %, D por debajo. */
export function tierOf(p: number): Tier {
  if (p >= 0.53) return "S";
  if (p >= 0.51) return "A";
  if (p >= 0.49) return "B";
  if (p >= 0.47) return "C";
  return "D";
}

/** "pachino_2p" → "Pachino" cuando el mapa no tiene nombre en los datos del juego. */
export function prettyMap(id: string): string {
  return id
    .replace(/_(\d)p(_.*)?$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
