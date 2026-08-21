import type { Participant } from "./signature";
import {
  summarize,
  mergeSummaries,
  type SignatureSummary,
  type ItemCounts,
  type OutcomeCounts,
  type ItemFilter,
} from "./summary";

export interface ItemStat {
  id: string;
  count: number;
}

export interface UnitStat {
  id: string;
  boards: number;
  frequency: number;
  /** True when the unit is common enough to be part of the comp's identity. */
  core: boolean;
  avgStars: number;
  threeStarRate: number; // share of boards where this unit reached 3 stars
  avgItems: number;      // items held per board that fielded it
  itemizedRate: number; // share of boards where this unit held at least one item
  items: ItemStat[];

  /**
   * Split by how the game ended. This is the whole point of the analyzer: a unit
   * that 80% of boards field tells you nothing, but one that 85% of the top-4
   * boards field and only 30% of the bottom-4 boards is the actual lesson.
   */
  winnerRate: number;  // share of this comp's top-4 boards that fielded it
  loserRate: number;   // share of its bottom-4 boards
  avgPlacementWith: number;
  avgPlacementWithout: number;
  /** Sample behind each side of the comparison, so weak evidence can be ignored. */
  winnerBoards: number;
  loserBoards: number;
  /** What the top-4 boards actually built on it. */
  winnerItems: ItemStat[];
}

/** One side of a comp's outcome split. */
export interface OutcomeStat {
  boards: number;
  avgPlacement: number;
  avgLevel: number;
  avgGoldLeft: number;
}

export interface TraitStat {
  id: string;
  units: number;     // most common number of units holding the trait
  frequency: number; // share of boards where the trait was active
}

// How a comp wants to be played. Reroll comps commit to 3-starring a cheap
// unit; fast-8 comps skip that and push levels for expensive 2-star carries.
export type Archetype = "reroll1" | "reroll2" | "reroll3" | "fast8" | "standard";

export interface CompStats {
  signature: string;
  /**
   * Every signature merged into this comp, including its own. A board spells
   * its comp by whichever unit happened to hold its items, so matching on the
   * single winning spelling would leave most boards unrecognised.
   */
  signatures: string[];
  trait: string;
  carry: string;        // re-derived from aggregate item investment
  rerollTarget: string; // unit the comp 3-stars, or "" when it does not
  carries: string[];     // every unit the comp reliably itemizes, best first
  starTargets: string[]; // every unit the comp reliably takes to 3 stars
  archetype: Archetype;
  avgLevel: number;
  count: number;
  avgPlacement: number;
  /**
   * Spread of this comp's board placements. The tier list needs it to estimate
   * how hard to shrink a thin average toward the lobby mean from the data,
   * rather than from a hand-picked constant.
   */
  placementVar: number;
  top4Rate: number;
  winRate: number;
  playRate: number;
  units: UnitStat[];
  traits: TraitStat[];
  itemPriority: ItemStat[];
  /** The same comp played well and played badly. The gap is the lesson. */
  winners: OutcomeStat;
  losers: OutcomeStat;
}

const round = (n: number, places = 2) => Number(n.toFixed(places));

const CORE_THRESHOLD = 0.5;
const MAX_ITEMS = 3;
// Below this share, a 3-star is a lucky accident rather than the game plan.
const REROLL_THRESHOLD = 0.4;
// Comps that routinely reach level 8+ are pushing levels, not rerolling.
const FAST8_LEVEL = 8.2;
// How many items to surface as the comp's overall priority.
const MAX_PRIORITY_ITEMS = 6;
// A unit this consistently itemized is a carry, not an item holder.
const CARRY_ITEMIZED = 0.8;
// At most this many carries name a comp.
const MAX_CARRIES = 2;

export type CostLookup = (championId: string) => number;

/** A unit needs at least this many boards before its win/lose split means anything. */
const MIN_UNIT_SAMPLE = 3;
/** Keep units this common in the stats, even when they are not comp-defining:
 *  the ones that separate a top 4 from an eighth often sit below the core line. */
const KEEP_THRESHOLD = 0.15;

/** Most frequent value in a histogram, ties going to the larger one. */
function modalFromHistogram(histogram: Record<number, number>): number {
  return Object.entries(histogram)
    .map(([value, boards]): [number, number] => [Number(value), boards])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/** Units common enough in a signature's boards to count as that comp's skeleton. */
function coreOf(s: SignatureSummary): Set<string> {
  const core = new Set<string>();
  for (const [id, unit] of Object.entries(s.units)) {
    if (unit.boards / s.boards >= CORE_THRESHOLD) core.add(id);
  }
  return core;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const shared = [...a].filter((x) => b.has(x)).length;
  return shared / (a.size + b.size - shared);
}

/**
 * Two signatures this alike are the same comp wearing different names.
 *
 * The signature is trait + item-holder, so one board that fed its items to Shen
 * instead of Nami spawned a whole second "comp" with an identical roster —
 * measured on real data, 406 pairs of comps shared 70%+ of their skeleton, and
 * the biggest Space Groove comp was split four ways. Merging on the roster puts
 * those boards back together, which is what makes the per-comp stats mean
 * anything.
 */
const MERGE_SIMILARITY = 0.7;
/**
 * A group needs this many boards before its skeleton is stable enough to anchor
 * a cluster — but never more than the caller's own bar for a comp existing, or
 * a small dataset would cluster nothing at all.
 */
const SEED_COUNT = 5;
const seedFloor = (minCount: number) => Math.max(1, Math.min(SEED_COUNT, minCount));

/**
 * How many core synergies two variants must share to be the same comp.
 *
 * Three, not two: every board runs a pair of generic class traits — Bastion,
 * Brawler, Vanguard, Marauder all sit at 2 units almost everywhere — so two
 * shared traits carry no information. Measured on real data, a two-trait bar
 * merged an N.O.V.A. comp with a Dark Star 6 comp on the strength of their
 * tanks alone.
 */
const IDENTITY_TRAITS = 3;

/**
 * The same comp wearing two rosters.
 *
 * A player names a comp by what it is built around, so identity is the carry it
 * commits items to plus the synergies it repeats — not the exact eight units.
 * The tier list had one team listed twice at the top, once at N.O.V.A. 2 and
 * once at N.O.V.A. 5, because the two shared only half their skeleton.
 *
 * Both guards are load-bearing. Without the carry, two comps with identical
 * synergies collapse into one even when a fast-8 Vex board and a reroll Akali
 * board have nothing in common. Without the archetype, a 2021-board fast-8 comp
 * absorbs an 86-board reroll variant — a different game plan with a different
 * power spike, which is exactly the distinction the analyzer exists to teach.
 */
function sameComp(a: CompStats, b: CompStats): boolean {
  if (a.carry === "" || b.carry === "") return false;
  if (a.archetype !== b.archetype) return false;
  if (!sameCarries(a, b)) return false;
  const traits = new Set(a.traits.map((t) => t.id));
  return b.traits.filter((t) => traits.has(t.id)).length >= IDENTITY_TRAITS;
}

/**
 * Built around the same units.
 *
 * Usually that means the same primary carry. But a comp that itemizes two units
 * spells itself by whichever one drew more items, so the same team surfaced
 * twice as "Vex + Graves" and "Graves + Vex" — 1325 boards and 31, the second
 * one just the games where the items happened to land the other way round. Two
 * comps investing in the same pair are one comp, whatever the order.
 */
function sameCarries(a: CompStats, b: CompStats): boolean {
  if (a.carry === b.carry) return true;
  if (a.carries.length !== b.carries.length) return false;
  const mine = new Set(a.carries);
  return b.carries.every((id) => mine.has(id));
}

/** A cluster of raw comp signatures being folded toward one identity. */
interface Cluster {
  /** The seed signature that named the cluster. */
  signature: string;
  /** Every raw signature merged into this cluster, including its own. */
  signatures: string[];
  /** Roster skeleton used to decide whether another signature belongs here. */
  core: Set<string>;
  /** One summary per raw signature folded in — merged into one only when needed. */
  summaries: SignatureSummary[];
}

/**
 * Groups signature summaries into comps and measures each one.
 *
 * This is the counters-only heart of the analyzer: it never looks at a board
 * directly, only at what summarize() already counted from it. aggregateComps
 * below is the board-facing wrapper that gets there via summarize().
 */
export function aggregateFromSummaries(
  summaries: SignatureSummary[],
  total: number,
  minCount = 20,
  costOf: CostLookup = () => 0,
  maxComps = Number.POSITIVE_INFINITY,
  // Accepted for signature parity with aggregateComps, but unused here: by the
  // time a summary reaches this function, summarize() has already dropped
  // whatever items this predicate rejects — there is nothing left to filter.
  keepItem: ItemFilter = () => true
): CompStats[] {
  const bySignature = new Map<string, SignatureSummary>();
  for (const s of summaries) bySignature.set(s.signature, s);

  // Cluster the signatures whose rosters match, largest first so the dominant
  // spelling of a comp becomes its name.
  const minSeed = seedFloor(minCount);
  const seeds = [...bySignature.entries()]
    .filter(([, s]) => s.boards >= minSeed)
    .sort((a, b) => b[1].boards - a[1].boards || a[0].localeCompare(b[0]))
    .map(([signature, s]) => ({ signature, core: coreOf(s), summaries: [s] }));

  const clusters: Cluster[] = [];
  for (const seed of seeds) {
    const host = clusters.find((c) => overlap(c.core, seed.core) >= MERGE_SIMILARITY);
    if (host) {
      host.summaries.push(...seed.summaries);
      host.signatures.push(seed.signature);
    } else {
      clusters.push({
        signature: seed.signature,
        signatures: [seed.signature],
        core: seed.core,
        summaries: [...seed.summaries],
      });
    }
  }

  // Fragments too small to cluster on their own still belong somewhere.
  //
  // Sorted, not walked in the Map's raw insertion order: that order is "however
  // summaries arrived", which is board-encounter order on the boards path and
  // query-row order on the summary-table path (see summaryStore.ts) — two
  // different orders for the same underlying data. Two fragments landing in the
  // same cluster would then append to `signatures` in a different sequence
  // depending on which path built the input, changing that array's contents'
  // ORDER (never its membership) for no reason tied to the boards themselves.
  // Verified against the real 16.14 dataset: comparing aggregateComps(boards)
  // with aggregateFromSummaries(summarize(boards)) — same boards, same
  // signatures, only reached via a differently-ordered Map — reproduced this
  // exact drift before this sort was added.
  const fragments = [...bySignature.entries()].sort(
    (a, b) => b[1].boards - a[1].boards || a[0].localeCompare(b[0])
  );
  for (const [signature, s] of fragments) {
    if (s.boards >= minSeed) continue;
    const core = coreOf(s);
    let best: Cluster | null = null;
    let bestScore = MERGE_SIMILARITY;
    for (const c of clusters) {
      const score = overlap(c.core, core);
      if (score >= bestScore) {
        best = c;
        bestScore = score;
      }
    }
    if (best) {
      best.summaries.push(s);
      best.signatures.push(signature);
    }
  }

  // The roster pass only sees units. It cannot join two variants of a comp that
  // swapped half their board, so measure every cluster, merge on the identity
  // that reveals — carry, archetype, synergies — and measure again after.
  const measured = clusters
    .map((c) => {
      const merged = mergeSummaries(c.summaries, c.signature);
      return { ...c, stats: statsFor(merged, total, costOf, c.signature, c.signatures) };
    })
    .sort((a, b) => b.stats.count - a.stats.count || a.signature.localeCompare(b.signature));

  const merged: typeof measured = [];
  for (const cluster of measured) {
    // Largest first, so the dominant variant hosts the comp and gives it its name.
    const host = merged.find((h) => sameComp(h.stats, cluster.stats));
    if (host) {
      host.summaries.push(...cluster.summaries);
      host.signatures.push(...cluster.signatures);
    } else {
      merged.push(cluster);
    }
  }

  // Re-measured over the joined boards rather than blended: averaging two
  // averages would weigh a 22-board variant like an 800-board one.
  const stats = merged
    .map((c) => ({ c, mergedSummary: mergeSummaries(c.summaries, c.signature) }))
    .filter(({ mergedSummary }) => mergedSummary.boards >= minCount)
    .map(({ c, mergedSummary }) => statsFor(mergedSummary, total, costOf, c.signature, c.signatures));

  // Keep the comps people actually play. Applied after merging, never before:
  // capping first would cut a real comp that is only small because it was split
  // across two spellings of its name.
  return stats
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature))
    .slice(0, maxComps);
}

// Re-exported so existing callers that imported the filter type from this
// module keep working; it is defined in ./summary, which is where it is used.
export type { ItemFilter };

export function aggregateComps(
  participants: Participant[],
  minCount = 20,
  costOf: CostLookup = () => 0,
  maxComps = Number.POSITIVE_INFINITY,
  keepItem: ItemFilter = () => true
): CompStats[] {
  const { bySignature } = summarize(participants, keepItem);
  return aggregateFromSummaries(
    [...bySignature.values()],
    participants.length,
    minCount,
    costOf,
    maxComps,
    keepItem
  );
}

const topItemsFromCounts = (items: Record<string, ItemCounts>): ItemStat[] =>
  Object.entries(items)
    .sort((a, b) => b[1].boards - a[1].boards || a[0].localeCompare(b[0]))
    .slice(0, MAX_ITEMS)
    .map(([id, counts]) => ({ id, count: counts.boards }));

// Only items that actually showed up on a winning board — summarize() carries
// every item the unit ever held, winner or not, so the zero-winner ones have
// to be filtered here rather than relying on the map being sparse.
const winnerItemsFromCounts = (items: Record<string, ItemCounts>): ItemStat[] =>
  Object.entries(items)
    .filter(([, counts]) => counts.winnerBoards > 0)
    .sort((a, b) => b[1].winnerBoards - a[1].winnerBoards || a[0].localeCompare(b[0]))
    .slice(0, MAX_ITEMS)
    .map(([id, counts]) => ({ id, count: counts.winnerBoards }));

const itemPriorityFrom = (itemInstances: Record<string, number>): ItemStat[] =>
  Object.entries(itemInstances)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_PRIORITY_ITEMS)
    .map(([id, count]) => ({ id, count }));

/**
 * Everything a comp knows about itself, measured over the counters that summed
 * up the boards that played it. Split out because it has to run twice: once to
 * reveal the identity the merge above needs, then again over the boards that
 * merge joined.
 */
function statsFor(
  summary: SignatureSummary,
  total: number,
  costOf: CostLookup,
  signature: string,
  signatures: string[]
): CompStats {
  const count = summary.boards;
  const avgPlace = summary.sumPlacement / count;
  const avgLevel = summary.sumLevel / count;
  // Sample variance of placement, for the shrinkage estimate. Zero for a lone
  // board, which carries no spread of its own. Computed from the mean, not from
  // sumPlacement squared directly — see the comment on sumPlacementSq in
  // summary.ts for why that distinction stops mattering only up to ~2.1e7 boards.
  const placementVar =
    count > 1 ? (summary.sumPlacementSq - count * avgPlace * avgPlace) / (count - 1) : 0;

  const outcomeFrom = (o: OutcomeCounts): OutcomeStat => ({
    boards: o.boards,
    avgPlacement: o.boards ? o.sumPlacement / o.boards : 0,
    avgLevel: o.boards ? o.sumLevel / o.boards : 0,
    avgGoldLeft: o.boards ? o.sumGoldLeft / o.boards : 0,
  });

  // Every board this comp won or lost, for the per-unit winnerRate/loserRate
  // denominators below — equal to summary.top4 and count - summary.top4, kept
  // as the outcome counters' own boards field since that is what they are.
  const winnerBoardsTotal = summary.winner.boards;
  const loserBoardsTotal = summary.loser.boards;

  const units: UnitStat[] = Object.entries(summary.units)
    // Deliberately looser than CORE_THRESHOLD: the units that separate a top 4
    // from an eighth are often the ones only some boards bothered to field.
    .filter(([, u]) => u.boards / count >= KEEP_THRESHOLD)
    .map(([id, u]) => {
      const without = count - u.boards;
      return {
        id,
        boards: u.boards,
        frequency: u.boards / count,
        core: u.boards / count >= CORE_THRESHOLD,
        avgStars: u.sumStars / u.boards,
        threeStarRate: u.threeStar / u.boards,
        avgItems: u.sumItems / u.boards,
        itemizedRate: u.itemized / u.boards,
        items: topItemsFromCounts(u.items),

        winnerRate: winnerBoardsTotal ? u.winnerBoards / winnerBoardsTotal : 0,
        loserRate: loserBoardsTotal ? u.loserBoards / loserBoardsTotal : 0,
        avgPlacementWith: u.boards ? u.sumPlacement / u.boards : 0,
        avgPlacementWithout: without > 0 ? (summary.sumPlacement - u.sumPlacement) / without : 0,
        winnerBoards: u.winnerBoards,
        loserBoards: u.loserBoards,
        winnerItems: winnerItemsFromCounts(u.items),
      };
    })
    .sort((a, b) => b.boards - a.boards || a.id.localeCompare(b.id));

  // Synergies: only real, multi-breakpoint traits that were actually active —
  // already true of everything summarize() recorded in summary.traits.
  const traits: TraitStat[] = Object.entries(summary.traits)
    .filter(([, t]) => t.boards / count >= CORE_THRESHOLD)
    .map(([id, t]) => ({
      id,
      units: modalFromHistogram(t.units),
      frequency: t.boards / count,
    }))
    .sort((a, b) => b.units - a.units || b.frequency - a.frequency || a.id.localeCompare(b.id));

  // Item priority: what this comp builds most across every unit.
  const itemPriority = itemPriorityFrom(summary.itemInstances);

  // Identity — carry, 3-star targets, archetype — is decided by the comp's
  // CORE units only. The wider set above exists to explain outcomes, and a
  // fringe unit on a fifth of the boards must never rename the comp.
  const coreUnits = units.filter((u) => u.core);

  // The carry is whoever the comp reliably commits items to, judged across
  // every board rather than from a single one.
  // Carries are ranked by how consistently the comp commits items to them.
  // Cost is deliberately ignored: it is a shop price, not a measure of power.
  const byInvestment = [...coreUnits].sort(
    (a, b) =>
      b.itemizedRate - a.itemizedRate ||
      b.avgItems - a.avgItems ||
      b.threeStarRate - a.threeStarRate ||
      a.id.localeCompare(b.id)
  );
  const carries = byInvestment
    .filter((u) => u.itemizedRate >= CARRY_ITEMIZED)
    .slice(0, MAX_CARRIES)
    .map((u) => u.id);
  // Never leave a comp unnamed: fall back to the single best-invested unit.
  if (carries.length === 0 && byInvestment[0]) carries.push(byInvestment[0].id);
  const carry = carries[0] ?? "";

  // A reroll comp is one that reliably 3-stars a unit; the cheapest such unit
  // defines which reroll it is.
  const rerollCandidates = coreUnits
    .filter((u) => u.threeStarRate >= REROLL_THRESHOLD)
    .sort((a, b) => b.threeStarRate - a.threeStarRate || a.id.localeCompare(b.id));
  const starTargets = rerollCandidates.map((u) => u.id);
  // The cheapest 3-star target defines which reroll the comp is.
  const rerollTarget =
    [...rerollCandidates].sort(
      (a, b) => costOf(a.id) - costOf(b.id) || b.threeStarRate - a.threeStarRate
    )[0]?.id ?? "";

  let archetype: Archetype = "standard";
  if (rerollTarget) {
    const cost = costOf(rerollTarget);
    archetype = cost <= 1 ? "reroll1" : cost === 2 ? "reroll2" : "reroll3";
  } else if (avgLevel >= FAST8_LEVEL) {
    archetype = "fast8";
  }

  const [trait] = signature.split("|");
  return {
    signature,
    signatures,
    trait,
    carry,
    carries,
    rerollTarget,
    starTargets,
    archetype,
    avgLevel,
    count,
    avgPlacement: avgPlace,
    // Rounded on the way out: this variance used to be computed by walking raw
    // boards, and is now computed from counters, and the two arrive at doubles
    // that differ in their last bit (e.g. 5.326475155279494 vs
    // 5.3264751552795015). That noise would make an unchanged comps.json look
    // changed to both the "same input, same output" check on the summary and
    // the publish guard that skips a commit when nothing real changed. 6
    // decimals is far past what the site shows (2), so nothing visible moves.
    placementVar: round(placementVar, 6),
    top4Rate: summary.top4 / count,
    winRate: summary.wins / count,
    playRate: total > 0 ? count / total : 0,
    units,
    traits,
    itemPriority,
    winners: outcomeFrom(summary.winner),
    losers: outcomeFrom(summary.loser),
  };
}
