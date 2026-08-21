import type { CompStats } from "./group";

export interface TieredComp extends CompStats {
  tier: string;
  /**
   * Average placement after accounting for how many boards back it. This is
   * what the ranking uses; `avgPlacement` stays raw for display, because that
   * is the number a player recognises.
   */
  adjustedPlacement: number;
}

/**
 * Comps rank by average placement, best first — the plain reading everyone
 * expects from a tier list.
 *
 * The one correction: an average is only as good as the boards behind it. A
 * 22-board comp showed 2.91 and took the top of the list, but at that sample the
 * standard error is around half a placement, so an ordinary comp lands there by
 * luck. Every average is therefore pulled toward the lobby mean in proportion to
 * how little evidence it has. Large comps barely move (0.03–0.13 in practice);
 * the 22-board one moved 1.34 and fell to ninth.
 *
 * Sites that skip this step have millions of games, where every comp's average
 * is already reliable. At our volume the correction is what makes the ordering
 * mean anything.
 */

const round = (n: number, places = 2) => Number(n.toFixed(places));

/** A lobby of eight averages this, so it is what an unknown comp is assumed to be. */
const LOBBY_AVERAGE = 4.5;

/**
 * Shrinkage strength in boards, used only when the data cannot supply its own.
 *
 * The value was hand-picked, and research on empirical Bayes says the strength
 * should be estimated from the spread of the comps themselves (see
 * `estimateShrinkage`). Measured against our own data it should sit far lower —
 * around 13-16 — so this constant is now a fallback for the degenerate case of
 * too few comps to estimate from, never the number a real build uses.
 */
const CONFIDENCE_BOARDS = 120;

/**
 * How hard to shrink, estimated from the comps rather than fixed.
 *
 * The adjusted placement is a weighted average of a comp's own mean and the
 * lobby mean, and the weight on the lobby is C boards. Empirical Bayes fixes C
 * at the within-comp variance over the between-comp variance of the true means:
 * when comps barely differ, the spread we see is sampling noise and C is large
 * (shrink hard); when they genuinely differ over big samples, C is small
 * (trust the data). A hand-picked 120 ignored this and over-shrank every comp,
 * pushing a real 3.9 S-tier comp down toward B.
 *
 *   C = sigma2_within / tau2_between
 *   tau2 = Var(observed means) - sigma2 * mean(1/n)   [remove sampling noise]
 */
export function estimateShrinkage(comps: CompStats[]): number {
  const usable = comps.filter((c) => c.count >= 2);
  // Two comps cannot describe a spread; fall back rather than invent one.
  if (usable.length < 2) return CONFIDENCE_BOARDS;

  const withinNum = usable.reduce((s, c) => s + (c.count - 1) * c.placementVar, 0);
  const withinDen = usable.reduce((s, c) => s + (c.count - 1), 0);
  const sigma2 = withinDen > 0 ? withinNum / withinDen : 0;
  if (sigma2 <= 0) return CONFIDENCE_BOARDS;

  const k = usable.length;
  const grand = usable.reduce((s, c) => s + c.avgPlacement, 0) / k;
  const observed = usable.reduce((s, c) => s + (c.avgPlacement - grand) ** 2, 0) / (k - 1);
  const noise = (sigma2 * usable.reduce((s, c) => s + 1 / c.count, 0)) / k;

  // Floor the true spread so a run where every comp looks alike shrinks hard
  // (the safe direction) instead of dividing by zero.
  const tau2 = Math.max(observed - noise, sigma2 / 1000);
  return sigma2 / tau2;
}

/** Thresholds in placements, anchored to the lobby average rather than to
 *  percentiles — S has to mean "beats the lobby by a lot", not "top tenth of
 *  whatever we happened to collect". */
const TIERS: [string, number][] = [
  ["S", 4.1],
  ["A", 4.3],
  ["B", 4.5],
  ["C", 4.75],
];

export function adjustPlacement(
  avgPlacement: number,
  boards: number,
  confidence = CONFIDENCE_BOARDS
): number {
  return (avgPlacement * boards + LOBBY_AVERAGE * confidence) / (boards + confidence);
}

export function assignTier(adjustedPlacement: number): string {
  for (const [tier, limit] of TIERS) if (adjustedPlacement <= limit) return tier;
  return "D";
}

/**
 * Rank and tier the comps, shrinking each average toward the lobby mean.
 *
 * The shrinkage strength defaults to one estimated from the comps themselves;
 * pass one explicitly only to reproduce an old build or to test the formula.
 */
export function tierComps(comps: CompStats[], confidence?: number): TieredComp[] {
  const C = confidence ?? estimateShrinkage(comps);
  return comps
    .map((c) => {
      // Rounded before it is used for anything, tier included, for the same
      // reason placementVar is rounded in group.ts: c.placementVar itself feeds
      // estimateShrinkage above, so two equally valid ways of computing it
      // (raw boards today, counters once the incremental pipeline lands) can
      // already disagree in the last bit of every avgPlacement/placementVar
      // upstream. Left unrounded, that noise would surface here as a comps.json
      // that "changed" on every rebuild even when nothing real did, defeating
      // both the summary equivalence check and the publish guard. 4 decimals
      // is far past the 2 the site displays, so nothing visible moves.
      const adjustedPlacement = round(adjustPlacement(c.avgPlacement, c.count, C), 4);
      return { ...c, adjustedPlacement, tier: assignTier(adjustedPlacement) };
    })
    .sort((a, b) => a.adjustedPlacement - b.adjustedPlacement);
}
