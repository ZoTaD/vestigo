import { HABIT_IDS, PLACEMENT_SD, type HabitId, type HabitStat, type HabitTable } from "./habits";

/**
 * What the players one rung up do differently — and only that.
 *
 * Three gates, all mandatory. Each one exists because a real measurement over
 * the store would otherwise have put something false on screen:
 *
 *  1. A habit on 95% of boards is not a choice, it is a description of having
 *     survived. Items held off the carry looked like the strongest effect in the
 *     whole dataset (-2.4 places) and is nothing.
 *  2. The bands have to actually differ, by more than a rounding error and by
 *     more than noise.
 *  3. And it has to cost placements INSIDE the player's own band, in the same
 *     direction. Rerolling is the case that forces this: the band above does it
 *     less (41.9% against 53.6%), yet it improves placement at every rank and
 *     more the lower you go. Without gate 3 the coach would tell a Gold player
 *     to stop doing the thing that is working for them.
 *
 * Returns ids and numbers, never prose, like tags.ts: the same figures have to
 * read in two languages, and the wording belongs with the screen that shows it.
 */

/** Outside this window a band's habit is not a decision players make. */
export const MIN_PREVALENCE = 0.05;
export const MAX_PREVALENCE = 0.85;
/** Worth a sentence: percentage points between two bands, and places lost. */
export const MIN_BAND_GAP = 0.05;
export const MIN_COST = 0.3;
/** Below this a band's rate is not steady enough to compare against. */
export const MIN_BAND_BOARDS = 500;
/** Below this many games of your own, a rate is noise. Same bar as the tags. */
export const MIN_PLAYER_GAMES = 8;
/** How many findings before the panel stops being scannable. Same as metaGap. */
export const MAX_FINDINGS = 3;
/**
 * How many standard errors a difference has to clear to be more than noise.
 *
 * The practical floors above answer "is this worth a sentence"; this answers
 * "is it real". Both, or the finding does not appear — a coaching line the
 * reader cannot check is a horoscope, and one that is real but worth 0.05
 * places wastes their time.
 */
const SIGMA = 2;

export interface CoachFinding {
  id: HabitId;
  /** The player's own rate, and the games behind it. */
  yourRate: number;
  yourGames: number;
  bandRate: number;
  aboveRate: number;
  /** Places the habit costs inside your band. Positive means it costs. */
  costInBand: number;
  /** Boards behind the band's figures, printed so the claim can be checked. */
  bandBoards: number;
  /** Places on offer if the gap closed. Sets the order; never displayed raw. */
  upside: number;
}

export interface CoachInput {
  mine: HabitTable;
  myGames: number;
  band: HabitTable;
  /** Null for an apex player: there is no rung above, and we do not invent one. */
  above: HabitTable | null;
}

/** Standard error of the difference between two proportions. */
function proportionSe(p1: number, n1: number, p2: number, n2: number): number {
  return Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
}

/**
 * Standard error of a placement gap between the two sides of a split.
 *
 * PLACEMENT_SD is known rather than fitted: placements inside a band are uniform
 * on 1..8 because bands are whole lobbies. See habits.ts.
 */
function placementSe(withN: number, withoutN: number): number {
  if (withN <= 0 || withoutN <= 0) return Infinity;
  return PLACEMENT_SD * Math.sqrt(1 / withN + 1 / withoutN);
}

/**
 * What a habit costs inside a band, and the boards that back that number.
 *
 * Prefers the corrected cost when the band published one. Being contested is
 * the habit that needs it: its raw split is confounded, because strong comps
 * get contested more and their good placements cancel the penalty out.
 */
function costOf(stat: HabitStat): { cost: number; withN: number; withoutN: number } {
  if (stat.adjustedCost !== undefined) {
    return {
      cost: stat.adjustedCost,
      withN: stat.adjustedWithN ?? 0,
      withoutN: stat.adjustedWithoutN ?? 0,
    };
  }
  return {
    cost: stat.avgWith - stat.avgWithout,
    withN: stat.withN,
    withoutN: stat.boards - stat.withN,
  };
}

export function coachFindings({ mine, myGames, band, above }: CoachInput): CoachFinding[] {
  if (myGames < MIN_PLAYER_GAMES || !above) return [];

  const found: CoachFinding[] = [];
  for (const id of HABIT_IDS) {
    const yours = mine[id];
    const ours = band[id];
    const theirs = above[id];
    // A habit either side could not measure is skipped, never assumed absent.
    if (!yours || !ours || !theirs) continue;
    if (ours.boards < MIN_BAND_BOARDS || theirs.boards < MIN_BAND_BOARDS) continue;

    // Gate 1 — a choice, not survival.
    if (ours.rate < MIN_PREVALENCE || ours.rate > MAX_PREVALENCE) continue;

    // Gate 2 — the band above really differs.
    const bandGap = ours.rate - theirs.rate;
    if (Math.abs(bandGap) < MIN_BAND_GAP) continue;
    if (
      Math.abs(bandGap) <
      SIGMA * proportionSe(ours.rate, ours.boards, theirs.rate, theirs.boards)
    ) {
      continue;
    }

    // Gate 3 — and it costs places here, the same way round.
    const { cost, withN, withoutN } = costOf(ours);
    if (Math.abs(cost) < MIN_COST) continue;
    if (Math.abs(cost) < SIGMA * placementSe(withN, withoutN)) continue;
    if (Math.sign(cost) !== Math.sign(bandGap)) continue;

    // And the player has to be on the wrong side of it. No statistical bar on
    // this one: twenty games could never clear one, which is why the panel
    // prints the game count beside the figure instead of hiding it.
    const yourGap = yours.rate - theirs.rate;
    if (Math.sign(yourGap) !== Math.sign(bandGap) || Math.abs(yourGap) < MIN_BAND_GAP) {
      continue;
    }

    found.push({
      id,
      yourRate: yours.rate,
      yourGames: yours.boards,
      bandRate: ours.rate,
      aboveRate: theirs.rate,
      costInBand: cost,
      bandBoards: ours.boards,
      upside: Math.abs(yourGap) * Math.abs(cost),
    });
  }

  return found
    .sort((a, b) => b.upside - a.upside || a.id.localeCompare(b.id))
    .slice(0, MAX_FINDINGS);
}
