import { compSignature, type Participant, type Unit } from "./signature";

/** An item, counted the two ways the aggregator needs. */
export interface ItemCounts {
  /** Boards that carried it on this unit. Never more than one per board. */
  boards: number;
  winnerBoards: number;
  /** Copies of the item. A unit can carry the same item twice. */
  instances: number;
}

export interface UnitSummary {
  boards: number;
  sumStars: number;
  threeStar: number;
  sumItems: number;
  itemized: number;
  winnerBoards: number;
  loserBoards: number;
  /** For avgPlacementWith, and by difference for avgPlacementWithout. */
  sumPlacement: number;
  items: Record<string, ItemCounts>;
}

export interface TraitSummary {
  boards: number;
  /** Histogram of numUnits -> boards. The mode does not come from a sum. */
  units: Record<number, number>;
}

export interface OutcomeCounts {
  boards: number;
  sumPlacement: number;
  sumLevel: number;
  sumGoldLeft: number;
}

export interface SignatureSummary {
  signature: string;
  boards: number;
  sumPlacement: number;
  /**
   * Sum of squares, for the sample variance the shrinkage estimate needs.
   *
   * When a future caller derives that variance from these counters, compute it
   * as `(sumPlacementSq - boards * mean * mean) / (boards - 1)` with
   * `mean = sumPlacement / boards` — NOT the textbook-computational
   * `(sumPlacementSq - sumPlacement ** 2 / boards) / (boards - 1)`. Squaring
   * `sumPlacement` itself overflows the exact integer range (2^53) once a
   * single comp passes roughly 2.1e7 boards (sumPlacement ~9.5e7, so its
   * square ~9e15), corrupting the variance from that point on. Squaring the
   * much smaller `mean` first keeps every intermediate value exact.
   */
  sumPlacementSq: number;
  top4: number;
  wins: number;
  sumLevel: number;
  winner: OutcomeCounts;
  loser: OutcomeCounts;
  units: Record<string, UnitSummary>;
  traits: Record<string, TraitSummary>;
  /** Instances per item over every unit, for itemPriority. */
  itemInstances: Record<string, number>;
}

export type ItemFilter = (itemId: string) => boolean;

function emptyOutcome(): OutcomeCounts {
  return { boards: 0, sumPlacement: 0, sumLevel: 0, sumGoldLeft: 0 };
}

function emptyItemCounts(): ItemCounts {
  return { boards: 0, winnerBoards: 0, instances: 0 };
}

function emptyUnitSummary(): UnitSummary {
  return {
    boards: 0,
    sumStars: 0,
    threeStar: 0,
    sumItems: 0,
    itemized: 0,
    winnerBoards: 0,
    loserBoards: 0,
    sumPlacement: 0,
    items: {},
  };
}

function emptyTraitSummary(): TraitSummary {
  return { boards: 0, units: {} };
}

function emptySignatureSummary(signature: string): SignatureSummary {
  return {
    signature,
    boards: 0,
    sumPlacement: 0,
    sumPlacementSq: 0,
    top4: 0,
    wins: 0,
    sumLevel: 0,
    winner: emptyOutcome(),
    loser: emptyOutcome(),
    units: {},
    traits: {},
    itemInstances: {},
  };
}

/**
 * The best copy of each champion fielded on a board.
 *
 * A board can legitimately field the same champion twice (6.5% of real boards
 * do). Collapse the copies to the most-invested one — same rule statsFor
 * applies — so every per-unit figure stays "per board" and rates stay inside
 * [0, 1].
 */
function bestCopiesOf(units: Unit[]): Unit[] {
  const bestCopy = new Map<string, Unit>();
  for (const u of units) {
    const prev = bestCopy.get(u.character_id);
    const better =
      !prev ||
      u.items.length > prev.items.length ||
      (u.items.length === prev.items.length && u.tier > prev.tier);
    if (better) bestCopy.set(u.character_id, u);
  }
  return [...bestCopy.values()];
}

/**
 * Everything summarize() hands back: the per-signature counts, plus how many
 * boards it actually looked at.
 *
 * `totalBoards` is not optional and not a bare Map property, on purpose: the
 * real denominator for playRate is every board summarize() SAW, not the sum
 * of `boards` across `bySignature` — that sum excludes the boards with no
 * signature (no active multi-breakpoint trait, or no carry; measured at
 * 0.3-0.5% of real boards, not the ~10% originally assumed), which would
 * inflate every comp's playRate by roughly that share. Wrapping the result
 * forces a caller who only wants `bySignature` to say so explicitly, instead
 * of quietly reaching for a total that undercounts.
 */
export interface SummarizeResult {
  bySignature: Map<string, SignatureSummary>;
  /** Every participant passed in, before the no-signature filter runs. */
  totalBoards: number;
  /** Of totalBoards, how many were dropped for lacking a signature. */
  discardedBoards: number;
}

/**
 * Groups boards by comp signature and counts everything statsFor needs to
 * describe that comp, without holding on to the boards themselves.
 */
export function summarize(
  participants: Participant[],
  keepItem: ItemFilter = () => true
): SummarizeResult {
  const bySignature = new Map<string, SignatureSummary>();
  let discardedBoards = 0;

  for (const p of participants) {
    const signature = compSignature(p);
    if (signature === "") {
      discardedBoards += 1;
      continue;
    }

    const summary = bySignature.get(signature) ?? emptySignatureSummary(signature);
    bySignature.set(signature, summary);

    const won = p.placement <= 4;
    summary.boards += 1;
    summary.sumPlacement += p.placement;
    summary.sumPlacementSq += p.placement ** 2;
    if (won) summary.top4 += 1;
    if (p.placement === 1) summary.wins += 1;
    summary.sumLevel += p.level;

    const outcome = won ? summary.winner : summary.loser;
    outcome.boards += 1;
    outcome.sumPlacement += p.placement;
    outcome.sumLevel += p.level;
    outcome.sumGoldLeft += p.goldLeft;

    // Units: collapse duplicate champions to the most-invested copy first, so
    // every per-unit counter below is a per-board counter.
    for (const u of bestCopiesOf(p.units)) {
      const unit = summary.units[u.character_id] ?? emptyUnitSummary();
      summary.units[u.character_id] = unit;

      unit.boards += 1;
      unit.sumStars += u.tier;
      if (u.tier === 3) unit.threeStar += 1;
      unit.sumPlacement += p.placement;
      if (won) unit.winnerBoards += 1;
      else unit.loserBoards += 1;

      // Placeholders like TFT_Item_EmptyBag are not items a player builds;
      // keepItem drops them before they inflate any item counter.
      const items = u.items.filter(keepItem);
      unit.sumItems += items.length;

      if (items.length > 0) {
        unit.itemized += 1;

        // Count BOARDS holding the item, not instances of it: a unit can carry
        // the same item twice, which would push the share past 100%.
        const distinct = new Set(items);
        for (const item of distinct) {
          const counts = unit.items[item] ?? emptyItemCounts();
          unit.items[item] = counts;
          counts.boards += 1;
          if (won) counts.winnerBoards += 1;
        }

        // Instances, separately: how many copies of the item this unit held,
        // duplicates included.
        for (const item of items) {
          const counts = unit.items[item] ?? emptyItemCounts();
          unit.items[item] = counts;
          counts.instances += 1;
        }
      }
    }

    // Synergies: only real, multi-breakpoint traits that were actually active.
    // Per-champion "unique" traits (tierTotal === 1) are not comp-defining, and
    // an inactive trait (tierCurrent < 1) never fired this board.
    for (const t of p.traits) {
      if (t.tierCurrent < 1 || t.tierTotal <= 1) continue;
      const trait = summary.traits[t.name] ?? emptyTraitSummary();
      summary.traits[t.name] = trait;
      trait.boards += 1;
      trait.units[t.numUnits] = (trait.units[t.numUnits] ?? 0) + 1;
    }

    // Item priority: what this comp builds most across every unit. Counted
    // from the raw board, before the per-unit collapse above — a board that
    // fields the same champion twice contributes both copies' items, same as
    // statsFor's itemTally does today.
    for (const u of p.units) {
      for (const item of u.items) {
        if (!keepItem(item)) continue;
        summary.itemInstances[item] = (summary.itemInstances[item] ?? 0) + 1;
      }
    }
  }

  return { bySignature, totalBoards: participants.length, discardedBoards };
}

function mergeOutcome(a: OutcomeCounts, b: OutcomeCounts): OutcomeCounts {
  return {
    boards: a.boards + b.boards,
    sumPlacement: a.sumPlacement + b.sumPlacement,
    sumLevel: a.sumLevel + b.sumLevel,
    sumGoldLeft: a.sumGoldLeft + b.sumGoldLeft,
  };
}

function mergeItemCounts(a: ItemCounts, b: ItemCounts): ItemCounts {
  return {
    boards: a.boards + b.boards,
    winnerBoards: a.winnerBoards + b.winnerBoards,
    instances: a.instances + b.instances,
  };
}

function mergeItemRecords(
  a: Record<string, ItemCounts>,
  b: Record<string, ItemCounts>
): Record<string, ItemCounts> {
  const merged: Record<string, ItemCounts> = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    merged[id] = mergeItemCounts(a[id] ?? emptyItemCounts(), b[id] ?? emptyItemCounts());
  }
  return merged;
}

function mergeUnit(a: UnitSummary, b: UnitSummary): UnitSummary {
  return {
    boards: a.boards + b.boards,
    sumStars: a.sumStars + b.sumStars,
    threeStar: a.threeStar + b.threeStar,
    sumItems: a.sumItems + b.sumItems,
    itemized: a.itemized + b.itemized,
    winnerBoards: a.winnerBoards + b.winnerBoards,
    loserBoards: a.loserBoards + b.loserBoards,
    sumPlacement: a.sumPlacement + b.sumPlacement,
    items: mergeItemRecords(a.items, b.items),
  };
}

function mergeUnits(
  a: Record<string, UnitSummary>,
  b: Record<string, UnitSummary>
): Record<string, UnitSummary> {
  const merged: Record<string, UnitSummary> = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    merged[id] = mergeUnit(a[id] ?? emptyUnitSummary(), b[id] ?? emptyUnitSummary());
  }
  return merged;
}

function mergeTraitHistogram(
  a: Record<number, number>,
  b: Record<number, number>
): Record<number, number> {
  const merged: Record<number, number> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    merged[Number(key)] = (a[Number(key)] ?? 0) + (b[Number(key)] ?? 0);
  }
  return merged;
}

function mergeTrait(a: TraitSummary, b: TraitSummary): TraitSummary {
  return {
    boards: a.boards + b.boards,
    units: mergeTraitHistogram(a.units, b.units),
  };
}

function mergeTraits(
  a: Record<string, TraitSummary>,
  b: Record<string, TraitSummary>
): Record<string, TraitSummary> {
  const merged: Record<string, TraitSummary> = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    merged[id] = mergeTrait(a[id] ?? emptyTraitSummary(), b[id] ?? emptyTraitSummary());
  }
  return merged;
}

function mergeCounts(
  a: Record<string, number>,
  b: Record<string, number>
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    merged[id] = (a[id] ?? 0) + (b[id] ?? 0);
  }
  return merged;
}

/**
 * Sums two summaries field by field into a new object, touching neither input.
 *
 * `signature` is a required parameter rather than `a.signature`: keeping one
 * side's label made merging non-commutative (A then B named the result
 * differently than B then A, with every number identical). The next consumer
 * — comp clustering — merges summaries whose signatures legitimately differ,
 * since a cluster gathers every spelling of a comp under one host label, so
 * failing on a mismatch would make that impossible. Naming the result
 * explicitly puts the caller in charge of the label instead of an arbitrary
 * side of the fold.
 */
function mergeTwo(a: SignatureSummary, b: SignatureSummary, signature: string): SignatureSummary {
  return {
    signature,
    boards: a.boards + b.boards,
    sumPlacement: a.sumPlacement + b.sumPlacement,
    sumPlacementSq: a.sumPlacementSq + b.sumPlacementSq,
    top4: a.top4 + b.top4,
    wins: a.wins + b.wins,
    sumLevel: a.sumLevel + b.sumLevel,
    winner: mergeOutcome(a.winner, b.winner),
    loser: mergeOutcome(a.loser, b.loser),
    units: mergeUnits(a.units, b.units),
    traits: mergeTraits(a.traits, b.traits),
    itemInstances: mergeCounts(a.itemInstances, b.itemInstances),
  };
}

/**
 * Combines summaries into one, as if every board behind them had been
 * summarized together, and labels the result `signature` — deliberately not
 * derived from any entry in `list`, see mergeTwo. Returns a new object: the
 * summaries that come from storage are reused across bands and must not be
 * mutated.
 */
export function mergeSummaries(list: SignatureSummary[], signature: string): SignatureSummary {
  if (list.length === 0) {
    throw new Error("mergeSummaries requires at least one summary");
  }
  // Seed the fold with a fresh empty summary instead of letting reduce() default
  // to list[0]: without a seed, a one-element list comes back BY REFERENCE,
  // breaking the "new object, mutates neither input" promise above for the most
  // common case — a cluster that is still just one signature.
  return list.reduce((acc, s) => mergeTwo(acc, s, signature), emptySignatureSummary(signature));
}
