/**
 * What a player does, in the vocabulary the coach compares across rank bands.
 *
 * Defined here, once, and imported by the pipeline as well as the browser. Two
 * copies of a predicate cannot be checked against each other the way the two
 * bands.ts tables can — a test can compare tables, not function bodies — so a
 * drift between them would silently compare the player against a habit that is
 * no longer the one measured for the band.
 *
 * Every habit is a CHOICE a player makes, never a description of having
 * survived. Items held off the carry is the counter-example that shaped this
 * file: measured over the store it sits on 84-95% of boards with an apparent
 * effect of -2.2 to -2.8 places, because what it really measures is having lived
 * long enough to have items on the board at all. The prevalence gate in coach.ts
 * is what keeps that class of thing off the screen.
 */

export interface HabitUnit {
  id: string;
  /** Star level, 1 to 3. */
  stars: number;
  /** Shop cost in gold, 1 to 5. Zero for summoned units, which are not bought. */
  cost: number;
  items: string[];
}

export interface HabitBoard {
  placement: number;
  level: number;
  goldLeft: number;
  units: HabitUnit[];
  /**
   * Facts a board cannot answer on its own: being contested is a fact about the
   * lobby, and which comp you played depends on the band's tier list. Whoever
   * calls fills these in — the pipeline has lobbies grouped, the browser has the
   * raw match — so every predicate stays pure over one shape.
   *
   * Absent means "cannot answer", never "no". Counting a missing input as false
   * would turn silence into the claim that the habit is rare.
   */
  contested?: boolean;
  compExact?: boolean;
  compTier?: string;
}

export type HabitId =
  | "hoardsGold"
  | "lowLevel"
  | "carryShort"
  | "rerolls"
  | "contestedCarry"
  | "offMeta"
  | "lowTierComp";

/** Where leftover gold stops being normal. From `calibration.gold.wastedFrom`. */
export const GOLD_HOARD_FROM = 26;
/** A board that reached level 8 was pushing levels; below it, it was not. */
export const LEVEL_FLOOR = 7;
/** A finished carry holds three items. From `calibrate.ts`. */
export const FULL_ITEMS = 3;
/**
 * Three stars is a reroll decision only on a cheap unit: it takes nine copies,
 * which is realistic at 1-3 cost and an accident above it.
 */
export const REROLL_MAX_COST = 3;
/**
 * The standard deviation of a placement inside a band.
 *
 * Not a guess and not fitted: bands are built from whole lobbies, so every band
 * holds exactly one 1st, one 2nd and so on. Placements are uniform on 1..8, and
 * a discrete uniform over 8 values has sd = sqrt((8^2 - 1)/12) = 2.29. Measured
 * across the store the mix is 12.5% per place in all four bands, which is the
 * fact this rests on. coach.ts uses it to turn a placement gap into a standard
 * error without needing a second pass over the data.
 */
export const PLACEMENT_SD = 2.29;

const LOW_TIERS = new Set(["C", "D"]);

/** Whoever the board committed items to. Ties break toward the pricier unit. */
export function habitCarry(board: HabitBoard): HabitUnit | null {
  if (board.units.length === 0) return null;
  return [...board.units].sort(
    (a, b) =>
      b.items.length - a.items.length ||
      b.stars - a.stars ||
      b.cost - a.cost ||
      a.id.localeCompare(b.id)
  )[0];
}

/** Null when this board cannot answer the question at all. */
export type HabitPredicate = (board: HabitBoard) => boolean | null;

export const HABITS: Record<HabitId, HabitPredicate> = {
  hoardsGold: (b) => b.goldLeft >= GOLD_HOARD_FROM,
  lowLevel: (b) => b.level <= LEVEL_FLOOR,
  carryShort: (b) => {
    const carry = habitCarry(b);
    return carry ? carry.items.length < FULL_ITEMS : null;
  },
  rerolls: (b) =>
    b.units.some((u) => u.stars === 3 && u.cost >= 1 && u.cost <= REROLL_MAX_COST),
  contestedCarry: (b) => b.contested ?? null,
  offMeta: (b) => (b.compExact === undefined ? null : !b.compExact),
  lowTierComp: (b) => (b.compTier === undefined ? null : LOW_TIERS.has(b.compTier)),
};

/** Stable order, so the published file and the tests read the same way. */
export const HABIT_IDS: HabitId[] = [
  "hoardsGold",
  "lowLevel",
  "carryShort",
  "rerolls",
  "contestedCarry",
  "offMeta",
  "lowTierComp",
];

export interface HabitStat {
  /** Share of the boards that could answer where the habit was present. */
  rate: number;
  /** Boards that could answer. Never the whole set — see HabitBoard. */
  boards: number;
  /** Boards with the habit, so a caller can size each side of the split. */
  withN: number;
  /** Average placement with the habit, and without it. */
  avgWith: number;
  avgWithout: number;
  /**
   * A cost measured a better way than `avgWith - avgWithout`, for the habits
   * whose raw split is confounded. The coach prefers it when it is present.
   *
   * Being contested is the case that forced this. The raw comparison says a
   * contested board costs nothing (-0.02 places at apex), and that is a known
   * artefact rather than a finding: strong comps get contested more often, so
   * their good placements cancel the penalty out. calibrate.ts documented it
   * and answers it by comparing contested against alone WITHIN the same carry,
   * which is what fills this field.
   *
   * Only ever set by whoever aggregates a whole band. A player's twenty games
   * cannot support a within-carry comparison — and never need to, because the
   * cost side of every finding comes from the band, never from the player.
   */
  adjustedCost?: number;
  /** Boards on each side of the comparison that produced `adjustedCost`. */
  adjustedWithN?: number;
  adjustedWithoutN?: number;
}

export type HabitTable = Partial<Record<HabitId, HabitStat>>;

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * Every habit's rate and placement split over a set of boards.
 *
 * The same function serves a whole rank band and one player's twenty games —
 * which is the point: a comparison between two numbers measured different ways
 * is not a comparison.
 */
export function measureHabits(boards: HabitBoard[]): HabitTable {
  const table: HabitTable = {};
  for (const id of HABIT_IDS) {
    const predicate = HABITS[id];
    const withIt: number[] = [];
    const without: number[] = [];
    for (const board of boards) {
      const hit = predicate(board);
      if (hit === null) continue;
      (hit ? withIt : without).push(board.placement);
    }
    const answered = withIt.length + without.length;
    if (answered === 0) continue;
    table[id] = {
      rate: withIt.length / answered,
      boards: answered,
      withN: withIt.length,
      avgWith: mean(withIt),
      avgWithout: mean(without),
    };
  }
  return table;
}
