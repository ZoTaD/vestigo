import compsJson from "@data/comps.json";
import { catalog, text } from "./catalog";
import { bandFile, habitsFor } from "./data";
import { DEFAULT_BAND, bandAbove, type BandId } from "./bands";
import { RANKED_QUEUE, series, type LpPoint, type LpSnapshot } from "./lp";
import {
  buildReport,
  toLobby,
  formatRound,
  primaryCarry,
  compSignature,
  matchComp,
  measureHabits,
  coachFindings,
  findHistoryInsights,
  findPlayerTags,
} from "@analysis/index";
import type {
  AnalysisContext,
  Board,
  Calibration,
  CoachFinding,
  CompReference,
  Finding,
  HabitBoard,
  HistoryEntry,
  HistoryInsight,
  PlayerTag,
  Lang,
  Lobby,
  Report,
} from "@analysis/index";

/**
 * Bridges the pure analyzer to the UI: it supplies our own meta (comps.json)
 * and dresses the raw ids in the names and portraits from CommunityDragon.
 *
 * All the reasoning lives in games/tft/analysis, which is covered by tests. This
 * file only carries data across the seam.
 */

interface MetaFile {
  comps: CompReference[];
  sampleSize: number;
  calibration?: Calibration;
}

/**
 * The meta a report is measured against, for one rank band.
 *
 * Which band matters more than it looks. The calibration travels in this file
 * too, and it is not the same number twice: a carry reaches the end without its
 * items on 1% of apex boards and on 15% of Silver ones. Judging a Silver player
 * against the apex figure calls normal play a mistake.
 *
 * Falls back to the default band's file when the band has not been fetched —
 * the caller is expected to have waited, and this only keeps the types honest.
 */
const metaFor = (band: BandId): MetaFile =>
  (bandFile(band) ?? (compsJson as unknown as MetaFile)) as unknown as MetaFile;


const stripSet = (id: string) => id.replace(/^TFT\d+_/, "");

// Names are per-language: the same id reads "Master Yi" or "Maestro Yi"
// depending on the page. Images and costs are not.
export const championName = (id: string, lang: Lang) =>
  text(catalog.champions[id]?.name, lang, stripSet(id));
export const championImg = (id: string) => catalog.champions[id]?.img ?? "";
export const championCost = (id: string) => catalog.champions[id]?.cost ?? 0;
export const traitName = (id: string, lang: Lang) =>
  text(catalog.traits[id]?.name, lang, stripSet(id));
export const traitImg = (id: string) => catalog.traits[id]?.img ?? "";
export const itemName = (id: string, lang: Lang) =>
  text(catalog.items[id]?.name, lang, stripSet(id));
export const itemImg = (id: string) => catalog.items[id]?.img ?? "";

/**
 * What the analyzer needs from us. Display names come from the catalog —
 * without them the report would print raw ids like "TahmKench". The figures it
 * quotes come from comps.json, recomputed by the pipeline on every build, so
 * they never drift from the dataset actually on screen.
 *
 * The analyzer writes its findings in whichever language the page is in, and so
 * do the names it quotes, so the context is built per call rather than once at
 * module load.
 */
const contextFor = (lang: Lang, band: BandId): Partial<AnalysisContext> => ({
  labels: {
    champion: (id: string) => championName(id, lang),
    trait: (id: string) => traitName(id, lang),
    item: (id: string) => itemName(id, lang),
  },
  calibration: metaFor(band).calibration,
  lang,
});

export interface ViewUnit {
  id: string;
  name: string;
  img: string;
  cost: number;
  stars: number;
  isCarry: boolean;
  items: { id: string; name: string; img: string }[];
}

export interface ViewTrait {
  id: string;
  name: string;
  img: string;
  units: number;
}

/** Everything one match row needs, already resolved for display. */
export interface MatchView {
  matchId: string;
  /** False for Double Up and PvE, which do not belong in the profile's stats. */
  standard: boolean;
  /**
   * Riot's queue. `standard` is NOT enough to mean "ranked": measured over the
   * store, tft_game_type "standard" also covers normals (1090), Choncc's
   * Treasure (1210) and the event queues, which together were 8.5% of the
   * usable matches. Only 1100 moves LP and only 1100 feeds the meta.
   */
  queueId: number;
  placement: number;
  playedAt: number;
  level: number;
  goldLeft: number;
  lastRound: string;
  /** How the comp is named, e.g. "Space Groove Blitzcrank". */
  compLabel: string;
  /** Stable identity for grouping the history; the comp signature. */
  compKey: string;
  /**
   * The three facts the coach needs that a board cannot answer on its own.
   * Being contested is a fact about the lobby, and which comp you played depends
   * on the band's tier list — the pipeline stamps the same three on the boards
   * it measures each band from.
   */
  contested: boolean;
  compExact: boolean;
  compTier?: string;
  units: ViewUnit[];
  traits: ViewTrait[];
  findings: Finding[];
  /** All eight boards, best placement first, for the lobby panel. */
  lobby: { name: string; placement: number; compLabel: string; isMe: boolean }[];
}

function labelFor(board: Board, unknown: string, lang: Lang): string {
  const carry = primaryCarry(board);
  const dominant = [...board.traits]
    .filter((t) => t.tier >= 1 && t.maxTier > 1)
    .sort((a, b) => b.tier - a.tier || b.units - a.units || a.id.localeCompare(b.id))[0];
  const parts = [
    dominant ? traitName(dominant.id, lang) : "",
    carry ? championName(carry, lang) : "",
  ];
  return parts.filter(Boolean).join(" ") || unknown;
}

function toViewUnits(board: Board, lang: Lang): ViewUnit[] {
  const carry = primaryCarry(board);
  return [...board.units]
    // Item investment first: it is what the comp actually committed to. Cost is
    // a shop price, never a ranking.
    .sort(
      (a, b) =>
        b.items.length - a.items.length ||
        b.stars - a.stars ||
        b.cost - a.cost ||
        championName(a.id, lang).localeCompare(championName(b.id, lang))
    )
    .map((u) => ({
      id: u.id,
      name: championName(u.id, lang),
      img: championImg(u.id),
      // Catalog first, rarity only as a fallback. Riot's `rarity` field maps to
      // cost for almost every unit, but not all: Set 17 reports Morgana at
      // rarity 6, which would read as a 5-cost, while she is a 4-cost. The
      // catalog is generated from the game's own data, so it wins.
      cost: championCost(u.id) || u.cost,
      stars: u.stars,
      isCarry: u.id === carry,
      items: u.items.map((i) => ({ id: i, name: itemName(i, lang), img: itemImg(i) })),
    }));
}

/** Build the full view for one player in one raw match, or null if absent. */
export function analyzeMatch(
  rawMatch: unknown,
  puuid: string,
  /** Shown when a board has neither a real synergy nor an itemized carry. The
   *  caller supplies it so this module stays free of prose in either language. */
  unknownComp: string,
  lang: Lang,
  /** The player's own rank band, so the comparison is against their peers. */
  band: BandId = DEFAULT_BAND
): MatchView | null {
  const lobby: Lobby = toLobby(rawMatch);
  const report: Report | null = buildReport({
    lobby,
    puuid,
    comps: metaFor(band).comps,
    context: contextFor(lang, band),
  });
  if (!report) return null;

  const board = report.board;
  // The same three facts the pipeline stamps on the boards it measures a band
  // from, computed here the same way so the two sides stay comparable.
  const match = matchComp(board, metaFor(band).comps);
  const carryId = primaryCarry(board);
  const contested =
    carryId !== "" &&
    lobby.boards.some((b) => b.puuid !== puuid && primaryCarry(b) === carryId);

  return {
    matchId: report.matchId,
    standard: lobby.gameType === "" || lobby.gameType === "standard",
    queueId: lobby.queueId,
    placement: report.placement,
    playedAt: lobby.playedAt,
    level: board.level,
    goldLeft: board.goldLeft,
    lastRound: formatRound(board.lastRound),
    compLabel: labelFor(board, unknownComp, lang),
    // The key groups the history, so it must not change with the language:
    // the signature is language-free, and the label is only its fallback.
    compKey: compSignature(board) || labelFor(board, unknownComp, "en"),
    contested,
    // Only an exact signature match names the comp you were building. A loose
    // one is our guess, and grading a board off-meta on a guess is not fair.
    compExact: match?.exact ?? false,
    compTier: match?.exact ? match.comp.tier : undefined,
    units: toViewUnits(board, lang),
    traits: [...board.traits]
      .filter((t) => t.maxTier > 1)
      .sort((a, b) => b.tier - a.tier || b.units - a.units)
      .map((t) => ({
        id: t.id,
        name: traitName(t.id, lang),
        img: traitImg(t.id),
        units: t.units,
      })),
    findings: report.findings,
    lobby: [...lobby.boards]
      .sort((a, b) => a.placement - b.placement)
      .map((b) => ({
        name: b.tagLine ? `${b.gameName}#${b.tagLine}` : b.gameName || "—",
        placement: b.placement,
        compLabel: labelFor(b, unknownComp, lang),
        isMe: b.puuid === puuid,
      })),
  };
}

export type { PlayerTag } from "@analysis/index";

export const datasetSize = (compsJson as unknown as { sampleSize: number }).sampleSize;

/** How many entries a "most played" list shows before it stops being scannable. */
const TOP_LIST = 5;
/** Below this many games an average placement is a coin flip, not a tendency. */
const MIN_GAMES_FOR_AVERAGE = 2;

export interface Tally {
  key: string;
  label: string;
  img?: string;
  games: number;
  avgPlacement: number;
  /** True when the sample is thin enough that the average should be hedged. */
  thin: boolean;
}

export interface PlayerProfile {
  matches: number;
  /** What the history says that no single match can. */
  insights: HistoryInsight[];
  /** What kind of player it says you are — lighter than the insights. */
  tags: PlayerTag[];
  /** Double Up and PvE games, counted but kept out of every statistic. */
  excluded: number;
  avgPlacement: number;
  top4Rate: number;
  winRate: number;
  /** Games finished in each place; index 0 is first. */
  placements: number[];
  /** Placement per game, oldest first, so a run reads left to right. */
  timeline: { placement: number; playedAt: number }[];
  /**
   * The account's LP this set, oldest first — one point per time we looked.
   *
   * Sparse by nature: Riot publishes no LP history, so this only holds what we
   * have recorded since we started, and a brand new account has one point or
   * none. The panel treats fewer than two as "nothing to draw yet" rather than
   * drawing a line through a single dot.
   */
  lp: LpPoint[];
  comps: Tally[];
  champions: Tally[];
  /**
   * What the players one rung up do differently. An empty list is a real
   * answer — it means nothing cleared all three gates — not a failure.
   */
  coach: CoachFinding[];
  /** Which bands the comparison used, so the panel can name them. */
  coachBand: { own: BandId | null; above: BandId | null };
}

function tally(
  rows: { key: string; label: string; img?: string; placement: number }[]
): Tally[] {
  const groups = new Map<string, { label: string; img?: string; places: number[] }>();
  for (const r of rows) {
    const g = groups.get(r.key) ?? { label: r.label, img: r.img, places: [] };
    g.places.push(r.placement);
    groups.set(r.key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      label: g.label,
      img: g.img,
      games: g.places.length,
      avgPlacement: g.places.reduce((s, p) => s + p, 0) / g.places.length,
      thin: g.places.length < MIN_GAMES_FOR_AVERAGE,
    }))
    .sort((a, b) => b.games - a.games || a.avgPlacement - b.avgPlacement)
    .slice(0, TOP_LIST);
}

/** One player's games in the shape the habit predicates read. */
function toHabitBoards(views: MatchView[]): HabitBoard[] {
  return views.map((v) => ({
    placement: v.placement,
    level: v.level,
    goldLeft: v.goldLeft,
    units: v.units.map((u) => ({
      id: u.id,
      stars: u.stars,
      cost: u.cost,
      items: u.items.map((i) => i.id),
    })),
    contested: v.contested,
    compExact: v.compExact,
    compTier: v.compTier,
  }));
}

/**
 * What the players one rung up do differently.
 *
 * Reads the player's REAL band, not the one the report fell back to. A Silver
 * player is measured against the default band's comps because their own band
 * publishes none — but their habits ARE published, and comparing them against
 * Platinum+ is exactly the mistake the bands were split to end.
 */
function coachFor(
  standard: MatchView[],
  ownBand: BandId | null
): Pick<PlayerProfile, "coach" | "coachBand"> {
  const above = ownBand ? bandAbove(ownBand) : null;
  const bandHabits = ownBand ? habitsFor(ownBand) : null;
  if (!ownBand || !bandHabits) return { coach: [], coachBand: { own: ownBand, above } };

  return {
    coach: coachFindings({
      mine: measureHabits(toHabitBoards(standard)),
      myGames: standard.length,
      band: bandHabits,
      above: above ? habitsFor(above) : null,
    }),
    coachBand: { own: ownBand, above },
  };
}

/**
 * The player's own record across the matches on screen.
 *
 * Double Up and PvE are excluded rather than averaged in: their placements do
 * not mean the same thing, so mixing them would quietly corrupt every number.
 */

/**
 * The highest set any snapshot names, or null when none of them names one.
 *
 * Null means "do not filter": we would rather draw every point we have than
 * draw none, and a snapshot only lacks a set when we held no match for the
 * account at the time it was taken.
 */
function newestSet(snapshots: LpSnapshot[]): number | null {
  let set: number | null = null;
  for (const s of snapshots) {
    if (typeof s.setNumber === "number") set = Math.max(set ?? 0, s.setNumber);
  }
  return set;
}

export function buildProfile(
  views: MatchView[],
  lang: Lang,
  band: BandId = DEFAULT_BAND,
  /**
   * The player's REAL band, which is not always the one the report is measured
   * against: a Silver player falls back to the default band for comps because
   * theirs publishes none. Their habits are published, so the coach needs the
   * real one or it would compare a Silver player against Platinum+.
   */
  ownBand: BandId | null = null,
  /** Every rank we have on record for this account, in any order. */
  snapshots: LpSnapshot[] = []
): PlayerProfile {
  // Ranked only. The meta these numbers are compared against is built from
  // ranked boards, so measuring a player's normals against it compares them to
  // a game they were not playing.
  const standard = views.filter(
    (v) => v.standard && v.queueId === RANKED_QUEUE && v.placement >= 1 && v.placement <= 8
  );
  const placements = Array.from({ length: 8 }, (_, i) =>
    standard.filter((v) => v.placement === i + 1).length
  );
  const n = standard.length;

  const history: HistoryEntry[] = standard.map((v) => ({
    matchId: v.matchId,
    placement: v.placement,
    compKey: v.compKey,
    compLabel: v.compLabel,
    findingIds: v.findings.map((f) => f.id),
    // The boards themselves, which the tags read to tell a forcer from someone
    // who plays what the game gives them.
    units: v.units.map((u) => ({
      id: u.id,
      name: u.name,
      isCarry: u.isCarry,
      stars: u.stars,
    })),
  }));

  return {
    matches: n,
    insights: findHistoryInsights(history, contextFor(lang, band)),
    tags: findPlayerTags(history),
    excluded: views.length - n,
    avgPlacement: n ? standard.reduce((s, v) => s + v.placement, 0) / n : 0,
    top4Rate: n ? standard.filter((v) => v.placement <= 4).length / n : 0,
    winRate: n ? standard.filter((v) => v.placement === 1).length / n : 0,
    placements,
    // standard is newest-first; a timeline reads oldest-first, so the last point
    // is the most recent game.
    timeline: standard
      .map((v) => ({ placement: v.placement, playedAt: v.playedAt }))
      .reverse(),
    // Scoped to the newest set we know of, because rank resets between sets
    // and a line across that reset would draw a collapse that never happened.
    lp: series(snapshots, newestSet(snapshots)),
    comps: tally(
      standard.map((v) => ({ key: v.compLabel, label: v.compLabel, placement: v.placement }))
    ),
    champions: tally(
      standard.flatMap((v) =>
        v.units.map((u) => ({
          key: u.id,
          label: u.name,
          img: u.img,
          placement: v.placement,
        }))
      )
    ),
    ...coachFor(standard, ownBand),
  };
}
