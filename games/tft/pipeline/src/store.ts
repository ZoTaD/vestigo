import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { RawMatch } from "./riot/normalize";
import { toParticipants } from "./riot/normalize";
import type { Participant } from "./aggregate/signature";

// The store keeps Riot's payload verbatim. Normalizing happens at read time so
// that adding a new field later never requires re-downloading anything.
export interface StoredMatch {
  matchId: string;
  fetchedAt: string;
  /**
   * Rank of the player whose history surfaced this match. Matchmaking keeps a
   * lobby inside a narrow band, so this stands in for the whole table's rank —
   * which is what lets us ask what Challengers do that Gold players do not.
   * Absent on everything pulled before tiers existed.
   */
  tier?: string;
  match: RawMatch;
}

export function ensureStore(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function hasMatch(dir: string, matchId: string): boolean {
  return existsSync(join(dir, `${matchId}.json`));
}

export function saveMatch(
  dir: string,
  matchId: string,
  fetchedAt: string,
  match: RawMatch,
  tier?: string
): void {
  mkdirSync(dir, { recursive: true });
  const payload: StoredMatch = { matchId, fetchedAt, ...(tier ? { tier } : {}), match };
  writeFileSync(join(dir, `${matchId}.json`), JSON.stringify(payload), "utf-8");
}

export function loadRawMatches(dir: string): StoredMatch[] {
  if (!existsSync(dir)) return [];
  const out: StoredMatch[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    out.push(JSON.parse(readFileSync(join(dir, file), "utf-8")) as StoredMatch);
  }
  return out;
}

export function loadAllBoards(dir: string): Participant[] {
  const boards: Participant[] = [];
  for (const stored of loadRawMatches(dir)) {
    boards.push(...toParticipants(stored.match));
  }
  return boards;
}

export interface LobbyRecord {
  matchId: string;
  set: number;
  /**
   * Riot's queue. This, and not gameType, is what says a lobby was ranked.
   * Zero when the payload did not carry one, which excludes it.
   */
  queueId: number;
  /** Riot's mode marker: "standard", "pairs" (Double Up), "pve". */
  gameType: string;
  /**
   * Riot's client version string, which carries the patch the game was played
   * on. Kept raw here; src/patch.ts is what knows how to read it.
   */
  gameVersion: string;
  /** Rank band this lobby was pulled from; "" when the match predates tiers. */
  tier: string;
  boards: Participant[];
}

/**
 * The same boards, still grouped by match and carrying the mode they were
 * played in. Calibration needs the grouping — whether a carry was contested is
 * a fact about one lobby, and it disappears once every board is thrown into a
 * single list — and the aggregation needs the mode, because the store mixes
 * game types once players start searching themselves.
 */
export function loadLobbies(dir: string): LobbyRecord[] {
  return loadRawMatches(dir).map((stored) => {
    const info = (
      stored.match as {
        info?: {
          tft_set_number?: number;
          tft_game_type?: string;
          game_version?: string;
          queue_id?: number;
          queueId?: number;
        };
      }
    ).info;
    return {
      matchId: stored.matchId,
      set: info?.tft_set_number ?? 0,
      queueId: info?.queue_id ?? info?.queueId ?? 0,
      gameType: info?.tft_game_type ?? "",
      gameVersion: info?.game_version ?? "",
      tier: stored.tier ?? "",
      boards: toParticipants(stored.match),
    };
  });
}

/** The standard ranked queue, the only one whose meta we publish. */
export const RANKED_QUEUE = 1100;

/**
 * Only ranked lobbies of the current set may feed the meta.
 *
 * The store accumulates whatever players have played: Double Up ("pairs") pairs
 * two players and shares their economy, PvE lobbies hold a single participant,
 * and older sets are a different game entirely. Aggregating them together
 * poisons every placement average in the product.
 *
 * The cut used to be `gameType === "standard"`, and that field does not mean
 * ranked. Measured over 21,751 stored matches, "standard" also covers normal
 * games (1090), Choncc's Treasure (1210, so named in Riot's queues.json) and
 * event queues like 6120. On the published patch that was 2.6% of the boards,
 * and on the one before it 12.4% - the event queue simply happened to die the
 * day this patch landed. Ranked is a queue number, so it is checked as one.
 */
export function isComparable(lobby: LobbyRecord, set: number): boolean {
  return lobby.queueId === RANKED_QUEUE && lobby.set === set && lobby.boards.length >= 2;
}

export function countMatches(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.endsWith(".json")).length;
}
