import type { HistoryEntry } from "./history";

/**
 * What kind of player the history says you are.
 *
 * The insights in history.ts answer "what should you fix". These answer
 * something different and lighter: "what are you like". A player recognises
 * themselves in "you force the same units every game" long before they act on
 * a placement average, and recognising yourself is what makes the rest worth
 * reading.
 *
 * Unlike the rest of the analysis these carry no prose. Each tag comes back as
 * an id plus the numbers behind it, and the wording lives with the profile that
 * renders them — the same numbers have to read in two languages, and the copy
 * for one screen does not belong in a module that knows nothing about screens.
 */

export type PlayerTagId =
  | "chainWins"
  | "chainLosses"
  | "forcer"
  | "flexible"
  | "unitGod"
  | "highRoller";

export interface PlayerTag {
  id: PlayerTagId;
  /** The measured values the wording quotes, so the label can be checked. */
  value: number;
  /** A second figure some tags need: a count of games, a unit name. */
  detail?: string | number;
}

/** Below this, a run of results is a coin landing the same way twice. */
const MIN_MATCHES = 8;
/** A streak claim needs this many chances to follow a result before it means anything. */
const MIN_TRANSITIONS = 4;
const CHAIN_RATE = 0.6;
/** Share of units repeated from one game to the next. */
const FORCER_OVERLAP = 0.4;
const FLEXIBLE_OVERLAP = 0.2;
/** A unit is "yours" once you have carried it this often, this well. */
const GOD_GAMES = 5;
const GOD_PLACEMENT = 4;
/** Reaching three stars on a unit this often marks a rerolling habit. */
const HIGH_ROLL_RATE = 0.3;

const isTop4 = (p: number) => p >= 1 && p <= 4;

/**
 * How often a result follows itself.
 *
 * Deliberately not "how often you top 4", which is just the win rate wearing a
 * disguise. This asks whether your last result predicts the next one — whether
 * you ride streaks or reset every game.
 */
function chainRate(places: number[], hit: (p: number) => boolean): { rate: number; n: number } {
  let chances = 0;
  let followed = 0;
  for (let i = 1; i < places.length; i++) {
    if (!hit(places[i - 1])) continue;
    chances++;
    if (hit(places[i])) followed++;
  }
  return { rate: chances === 0 ? 0 : followed / chances, n: chances };
}

/** Share of a game's units that were also on the board the game before. */
function overlap(entries: HistoryEntry[]): number | null {
  const pairs: number[] = [];
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1].units;
    const cur = entries[i].units;
    if (!prev?.length || !cur?.length) continue;
    const before = new Set(prev.map((u) => u.id));
    const shared = cur.filter((u) => before.has(u.id)).length;
    pairs.push(shared / cur.length);
  }
  if (pairs.length === 0) return null;
  return pairs.reduce((s, x) => s + x, 0) / pairs.length;
}

/**
 * Tags for a history, newest entry first — the order the profile already keeps.
 *
 * Returns an empty list rather than weak guesses when the sample is short: a
 * label a player cannot recognise costs more trust than showing nothing.
 */
export function findPlayerTags(entries: HistoryEntry[]): PlayerTag[] {
  if (entries.length < MIN_MATCHES) return [];

  // Streaks only mean anything in the order they were played.
  const chrono = [...entries].reverse();
  const places = chrono.map((e) => e.placement);
  const tags: PlayerTag[] = [];

  const wins = chainRate(places, isTop4);
  if (wins.n >= MIN_TRANSITIONS && wins.rate >= CHAIN_RATE) {
    tags.push({ id: "chainWins", value: wins.rate, detail: wins.n });
  }

  const losses = chainRate(places, (p) => !isTop4(p));
  if (losses.n >= MIN_TRANSITIONS && losses.rate >= CHAIN_RATE) {
    tags.push({ id: "chainLosses", value: losses.rate, detail: losses.n });
  }

  const rep = overlap(chrono);
  if (rep !== null && rep >= FORCER_OVERLAP) tags.push({ id: "forcer", value: rep });
  if (rep !== null && rep <= FLEXIBLE_OVERLAP) tags.push({ id: "flexible", value: rep });

  // The unit you carry best. Carries only: playing Jinx as a support says
  // nothing about you, holding three items on her says plenty.
  const carried = new Map<string, { name: string; places: number[] }>();
  for (const e of chrono) {
    for (const u of e.units ?? []) {
      if (!u.isCarry) continue;
      const g = carried.get(u.id) ?? { name: u.name, places: [] };
      g.places.push(e.placement);
      carried.set(u.id, g);
    }
  }
  const best = [...carried.values()]
    .filter((g) => g.places.length >= GOD_GAMES)
    .map((g) => ({ ...g, avg: g.places.reduce((s, p) => s + p, 0) / g.places.length }))
    .filter((g) => g.avg <= GOD_PLACEMENT)
    .sort((a, b) => a.avg - b.avg)[0];
  if (best) {
    tags.push({ id: "unitGod", value: best.avg, detail: best.name });
  }

  const rerolled = chrono.filter((e) => (e.units ?? []).some((u) => u.stars === 3)).length;
  const rerollRate = rerolled / chrono.length;
  if (rerollRate >= HIGH_ROLL_RATE) {
    tags.push({ id: "highRoller", value: rerollRate, detail: rerolled });
  }

  return tags;
}
