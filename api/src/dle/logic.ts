import { COLUMNS, type Entry, type Hint, type Mode, type Value } from "./types";

/**
 * Las reglas del Deadlockdle sin nada del Worker: comparar un intento, elegir la
 * respuesta del día y ordenar el ranking. Ver `docs/plans/2026-11-04-deadlockdle.md`.
 */

export type Mark = "ok" | "near" | "no";
export interface Cell {
  key: string;
  value: Value;
  mark: Mark;
  /** Hacia dónde está la respuesta: "up" si es mayor que el intento. */
  dir?: "up" | "down";
}

/** El día #1. Se cuenta en UTC, igual que el cambio de respuesta. */
export const LAUNCH_DATE = "2026-11-05";
const DAY_MS = 86_400_000;

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function findByName(entries: Entry[], name: string): Entry | null {
  const want = norm(name);
  return entries.find((e) => norm(e.name) === want) ?? null;
}

function compareValue(type: string, guess: Value, answer: Value): Omit<Cell, "key" | "value"> {
  if (Array.isArray(guess) || Array.isArray(answer)) {
    if (!Array.isArray(guess) || !Array.isArray(answer)) return { mark: "no" };
    const shared = guess.filter((g) => answer.includes(g)).length;
    if (shared === answer.length && shared === guess.length) return { mark: "ok" };
    return { mark: shared > 0 ? "near" : "no" };
  }
  if (guess === answer) return { mark: "ok" };
  if (typeof guess !== "number" || typeof answer !== "number") return { mark: "no" };
  const dir = answer > guess ? "up" : "down";
  const near =
    type === "pct" ? Math.abs(guess - answer) <= 1 : type === "num" ? Math.abs(guess - answer) <= Math.abs(answer) * 0.1 : false;
  return { mark: near ? "near" : "no", dir };
}

export function compare(guess: Entry, answer: Entry, mode: Mode): Cell[] {
  return COLUMNS[mode].map(({ key, type }) => {
    const value = guess.cols[key] ?? null;
    return { key, value, ...compareValue(type, value, answer.cols[key] ?? null) };
  });
}

export function utcDate(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export function dayNumber(date: string): number {
  return daysBetween(LAUNCH_DATE, date) + 1;
}

/**
 * Cuánto pesa un candidato según los días desde que salió: casi nada al día
 * siguiente y lo mismo que todos al pasar la ventana (la mitad del pozo).
 */
export function weightFor(daysSince: number | null, poolSize: number): number {
  if (daysSince === null) return 1;
  const window = Math.max(1, Math.floor(poolSize / 2));
  return Math.min(1, Math.max(0, daysSince) / window) ** 2;
}

/** Un número en [0, 1) que sólo sabe calcular quien tiene el secreto. */
async function dayRandom(secret: string, date: string, mode: Mode): Promise<number> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${date}|${mode}`)));
  let n = 0;
  for (let i = 0; i < 6; i++) n = n * 256 + mac[i];
  return n / 2 ** 48;
}

export async function pickAnswer(entries: Entry[], lastSeen: Map<string, string>, date: string, mode: Mode, secret: string): Promise<Entry> {
  const weights = entries.map((e) => {
    const seen = lastSeen.get(e.id);
    return weightFor(seen ? daysBetween(seen, date) : null, entries.length);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const r = await dayRandom(secret, date, mode);
  // Si todo pesa cero (un pozo de uno que salió hoy), cualquiera vale.
  if (total === 0) return entries[Math.floor(r * entries.length)];
  let acc = 0;
  const target = r * total;
  for (let i = 0; i < entries.length; i++) {
    acc += weights[i];
    if (weights[i] > 0 && target < acc) return entries[i];
  }
  return entries[weights.findLastIndex((w) => w > 0)];
}

/** Umbrales de intentos para cada pista. */
const HINT_AT = [4, 6, 8];

export function hintsUnlocked(answer: Entry, guesses: number): Hint[] {
  const all: Hint[] = [{ kind: "img", src: answer.img, blur: true }, ...answer.hints];
  return all.filter((_, i) => guesses >= HINT_AT[i]);
}

export interface PlayRow {
  steamId: string;
  guesses: number;
  ms: number;
  finishedAt: number;
}

export function rankPlays<T extends PlayRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.guesses - b.guesses || a.ms - b.ms || a.finishedAt - b.finishedAt);
}
