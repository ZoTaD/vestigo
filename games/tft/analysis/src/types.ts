/**
 * The shapes the analyzer works with. Deliberately independent of the pipeline
 * package: this one must stay runtime-free (no node:) so the same logic runs in
 * the browser, in Deno and in tests.
 */

export interface Unit {
  /** Riot's character id, e.g. "TFT17_Morgana". */
  id: string;
  /** Star level, 1 to 3. */
  stars: number;
  /** Shop cost in gold, 1 to 5. Zero when the unit is not a shop unit. */
  cost: number;
  items: string[];
}

export interface Trait {
  id: string;
  /** How many units on the board carry the trait. */
  units: number;
  /** Breakpoint currently reached, 0 when inactive. */
  tier: number;
  /** How many breakpoints the trait has in total. */
  maxTier: number;
  /**
   * Riot's colour for the breakpoint: 0 none, 1 bronze, 2 silver, 3 gold,
   * 4 chromatic. Not the same as `tier`, which counts breakpoints — two traits
   * can both sit on breakpoint 2 and be bronze and gold respectively, because
   * the colour reflects how far into the trait's own ladder that breakpoint is.
   *
   * Optional: nothing reads it yet. It is carried because the raw payload is
   * already on disk, so capturing it costs nothing and re-downloading later
   * would cost the whole store.
   */
  style?: number;
}

/** One player's final board, as Riot recorded it when they were eliminated. */
export interface Board {
  puuid: string;
  gameName: string;
  tagLine: string;
  placement: number;
  level: number;
  goldLeft: number;
  /** Riot's flat round counter. Decode with rounds.ts. */
  lastRound: number;
  /** Duplicate copies of a champion are already collapsed. */
  units: Unit[];
  traits: Trait[];

  /**
   * Riot reports these three and nothing reads them yet. They are carried
   * because the raw payload already sits in the store: capturing them now is
   * free, and wanting them later would mean re-downloading everything.
   *
   * Optional rather than defaulted so the many hand-built Board fixtures in the
   * tests stay valid, and so a caller can tell "not supplied" from "zero" —
   * which matters most for `eliminations`, where zero is a real and common
   * answer.
   */
  /** Rivals this player knocked out. Fixed sum per lobby, so useless across bands. */
  eliminations?: number;
  /** Seconds survived. A finer grain of the same thing `lastRound` measures. */
  survivedFor?: number;
  /** Damage dealt to other players over the whole game. */
  damageDealt?: number;
}

/**
 * A whole match. Note the boards are NOT a simultaneous snapshot: each one was
 * recorded when that player was eliminated, so units on an early loser's board
 * had already returned to the shared pool before the winner's board was taken.
 * Never sum copies across boards. See the design doc, section 4.3.
 */
export interface Lobby {
  matchId: string;
  set: number;
  playedAt: number;
  queueId: number;
  /** Riot's mode marker: "standard", "pairs" (Double Up), "pve". */
  gameType: string;
  boards: Board[];
}

export type Severity = "high" | "medium" | "info";
export type ModuleId = "contested" | "metaGap" | "mistakes";

export interface Finding {
  /** Stable key, so the UI can animate and test can assert without matching prose. */
  id: string;
  module: ModuleId;
  severity: Severity;
  title: string;
  detail: string;
  /** The raw numbers behind the claim, so the user can check our work. */
  evidence?: string;
}
