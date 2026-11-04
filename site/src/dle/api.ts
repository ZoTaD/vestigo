import type { DleMode } from "./modes";

/**
 * Lo que contesta el Worker del Deadlockdle (`api/src/dle/routes.ts`). Los tipos
 * son un espejo a mano: el sitio no importa nada de `api/`.
 */

export type Value = number | string | string[] | null;
export type Mark = "ok" | "near" | "no";
export interface Cell {
  key: string;
  value: Value;
  mark: Mark;
  dir?: "up" | "down";
}
export type Hint = { kind: "img"; src: string; blur: boolean } | { kind: "text"; text: string };
export interface Brief {
  id: string;
  name: string;
  img: string;
}
export interface Row {
  guess: Brief;
  cells: Cell[];
}
export interface Revealed extends Brief {
  link: string;
}
export interface Column {
  key: string;
  label: string;
  type: "exact" | "num" | "pct" | "list";
}
export interface Today {
  number: number;
  date: string;
  mode: DleMode;
  columns: Column[];
  rows: Row[];
  hints: Hint[];
  solved: boolean;
  answer?: Revealed;
}
export interface GuessResult {
  date: string;
  row: Row;
  hints: Hint[];
  solved: boolean;
  answer?: Revealed;
}
export interface RankEntry {
  pos: number;
  name: string;
  avatar: string;
  guesses: number;
  ms: number;
}
export interface Ranking {
  date: string;
  number: number;
  modes: Record<DleMode, { players: number; top: RankEntry[]; me: { pos: number; guesses: number; ms: number } | null }>;
}
export type Me = Record<DleMode, { streak: number; played: number; won: number; today: "solved" | "playing" | "none" }>;

/** El pozo que arma el build (`scripts/dle-pool.mjs`): acá sólo hace falta para el buscador. */
export interface PoolEntry extends Brief {
  cols: Record<string, Value>;
}
export type Pool = Record<DleMode, PoolEntry[]>;

/** No hubo respuesta del juego: red caída o el Worker contestó 5xx. */
export class DleOffline extends Error {}
/** El Worker rechazó el intento: nombre de otro modo, repetido o demasiados. */
export class DleRejected extends Error {
  constructor(readonly reason: "unknown" | "duplicate" | "busy") {
    super(reason);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init });
  } catch {
    throw new DleOffline();
  }
  if (res.status === 400) throw new DleRejected("unknown");
  if (res.status === 409) throw new DleRejected("duplicate");
  if (res.status === 429) throw new DleRejected("busy");
  if (!res.ok) throw new DleOffline();
  return (await res.json()) as T;
}

export const getToday = (mode: DleMode) => call<Today>(`/api/dle/${mode}/today`);
export const postGuess = (mode: DleMode, name: string, extra: { date?: string; n?: number } = {}) =>
  call<GuessResult>(`/api/dle/${mode}/guess`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, ...extra }),
  });
export const getRanking = () => call<Ranking>("/api/dle/ranking");
export const getMe = () => call<Me>("/api/dle/me");

let pool: Promise<Pool> | null = null;
export function getPool(): Promise<Pool> {
  pool ??= fetch("/deadlock/dle-pool.json")
    .then((r) => {
      if (!r.ok) throw new DleOffline();
      return r.json() as Promise<Pool>;
    })
    .catch((err) => {
      pool = null;
      throw err instanceof DleOffline ? err : new DleOffline();
    });
  return pool;
}
