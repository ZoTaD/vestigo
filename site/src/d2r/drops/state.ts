/**
 * El estado de la calculadora de drops en la dirección (2026-09-29): el modo,
 * el ítem, el lugar y las opciones, para compartirlo con un enlace. Sólo se
 * escribe lo que no es el valor por defecto, y lo que llega roto cae en él.
 */
import { SEASON } from "../season";
import { dropData } from "./data";
import { targetParam } from "./farm";
import { CATS, type Cat, type PlaceOpts, type PlaceRef } from "./places";
import type { Diff, Settings, Target } from "./types";

export type Mode = "farm" | "drops" | "sim";
export interface DropsState {
  m: Mode;
  item: Target | null;
  place: PlaceRef | null;
  /** La dificultad del lugar en "¿Qué suelta?" y el simulador. */
  pdiff: Diff;
  mf: number;
  players: number;
  party: number;
  /** La dificultad de "¿Dónde lo farmeo?" (−1 = todas). */
  diff: -1 | Diff;
  /** Zona de Terror: tu nivel (0 = apagada). */
  tz: number;
  tier: number;
  ladder: boolean;
  quest: boolean;
  runs: number;
  /** La semilla del cofre (0 = sin abrir). */
  seed: number;
}

export const DEFAULT_STATE: DropsState = {
  m: "farm", item: null, place: null, pdiff: 2, mf: 300, players: 1, party: 1, diff: -1,
  tz: 0, tier: 1, ladder: false, quest: false, runs: 100, seed: 0,
};

/** Los topes del simulador, que comparten la dirección y la página: cuántas runs se pueden abrir de una vez y la semilla más alta (0 = cerrado). */
export const MAX_RUNS = 1000;
export const MAX_SEED = 2147483646;

export function parseTarget(v: string | null): Target | null {
  const m = /^([usb])\.(.+)$/.exec(v ?? "");
  if (!m) return null;
  return m[1] === "b" ? { k: "b", code: m[2] } : { k: m[1] as "u" | "s", id: m[2] };
}

export const placeParam = (p: PlaceRef): string => (p.k === "s" ? `s.${p.id}` : `a.${p.id}.${p.cat}`);

export function parsePlace(v: string | null): PlaceRef | null {
  const s = /^s\.(.+)$/.exec(v ?? "");
  if (s) return { k: "s", id: s[1] };
  const a = /^a\.(\d+)\.(\w+)$/.exec(v ?? "");
  return a && (CATS as string[]).includes(a[2]) ? { k: "a", id: Number(a[1]), cat: a[2] as Cat } : null;
}

const int = (v: string | null, def: number, min: number, max: number): number => {
  // Un valor en blanco ("?mf=%20") vale como si no estuviera: `Number(" ")` da 0.
  const s = (v ?? "").trim();
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

export function readState(search: string): DropsState {
  const q = new URLSearchParams(search);
  const d = DEFAULT_STATE;
  const m = q.get("m");
  const players = int(q.get("p"), d.players, 1, 8);
  return {
    m: m === "drops" || m === "sim" ? m : "farm",
    item: parseTarget(q.get("i")),
    place: parsePlace(q.get("src")),
    pdiff: int(q.get("pd"), d.pdiff, 0, 2) as Diff,
    mf: int(q.get("mf"), d.mf, 0, 9999),
    players,
    party: int(q.get("g"), d.party, 1, players),
    diff: int(q.get("d"), d.diff, -1, 2) as -1 | Diff,
    tz: int(q.get("tz"), d.tz, 0, 99),
    // El nivel más alto del Heraldo es el de los datos del juego (5 desde RotW), no uno fijo.
    tier: int(q.get("h"), d.tier, 1, Math.max(1, dropData().tz.maxTier)),
    ladder: q.get("l") === "1",
    quest: q.get("q") === "1",
    runs: int(q.get("n"), d.runs, 1, MAX_RUNS),
    seed: int(q.get("seed"), d.seed, 0, MAX_SEED),
  };
}

export function writeState(st: DropsState): string {
  const d = DEFAULT_STATE;
  const q = new URLSearchParams();
  if (st.m !== d.m) q.set("m", st.m);
  if (st.item) q.set("i", targetParam(st.item));
  if (st.place) q.set("src", placeParam(st.place));
  if (st.pdiff !== d.pdiff) q.set("pd", String(st.pdiff));
  if (st.mf !== d.mf) q.set("mf", String(st.mf));
  if (st.players !== d.players) q.set("p", String(st.players));
  if (st.party !== d.party) q.set("g", String(st.party));
  if (st.diff !== d.diff) q.set("d", String(st.diff));
  if (st.tz !== d.tz) q.set("tz", String(st.tz));
  if (st.tier !== d.tier) q.set("h", String(st.tier));
  if (st.ladder) q.set("l", "1");
  if (st.quest) q.set("q", "1");
  if (st.runs !== d.runs) q.set("n", String(st.runs));
  if (st.seed !== d.seed) q.set("seed", String(st.seed));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const toSettings = (st: DropsState): Settings => ({ mf: st.mf, players: st.players, party: st.party, ladder: st.ladder, season: SEASON });
export const toOpts = (st: DropsState): PlaceOpts => ({ tz: st.tz, tier: st.tier, quest: st.quest });
