import type { Comp } from "./data";

/**
 * Groups comps that are the same set wearing one or two different champions.
 *
 * The tier list still measures every comp on its own — this only changes how
 * near-identical ones are shown. Two S-tier comps that share their whole core
 * and differ in a single carry read as duplicates; grouped, one leads and the
 * other sits behind a toggle.
 *
 * The grouping is deliberately strict. A shell shared between a strong carry and
 * a weak one (Akali in S, Kindred in D on the same tanks) is NOT one family:
 * hiding the weak variant behind the strong one would bury the very thing a
 * player needs to know. So a variant must share almost the whole core AND land
 * within a tier of the lead.
 */

/**
 * Share of core two comps must share to be the same family.
 *
 * Calibrated against the real list: at 0.7 the only families that form are
 * genuine one-champion swaps of the same set — Fiora+Illaoi with Fiora+Jinx,
 * Brawler Bel'Veth+Kindred with Master Yi+Kindred, Arbiter Illaoi+Aurora with
 * Diana+Aurora. Lower and it starts folding together carries of different types
 * (a tank build with an AP build) that only share their front line. Not higher,
 * because a swapped carry is itself a core unit, so "the same set with one
 * champion different" already sits near 0.7, not 1.0.
 */
const CORE_SIMILARITY = 0.7;
/** How many tier letters apart a variant may sit from its lead. */
const MAX_TIER_DISTANCE = 1;

const TIERS = ["S", "A", "B", "C", "D"];

export interface CompFamily {
  /** The comp shown by default: the best-placed of the family. */
  lead: Comp;
  /** The rest, best-placed first. Empty when the comp stands alone. */
  variants: Comp[];
}

/** The units that define a comp: its skeleton, not the rotation slots. */
export function coreOf(comp: Comp): Set<string> {
  return new Set(comp.units.filter((u) => !u.flex).map((u) => u.id));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const shared = [...a].filter((x) => b.has(x)).length;
  return shared / (a.size + b.size - shared);
}

const tierDistance = (a: string, b: string): number =>
  Math.abs(TIERS.indexOf(a) - TIERS.indexOf(b));

/** Whether two comps are the same set with a small change. */
export function sameFamily(a: Comp, b: Comp): boolean {
  return (
    tierDistance(a.tier, b.tier) <= MAX_TIER_DISTANCE &&
    jaccard(coreOf(a), coreOf(b)) >= CORE_SIMILARITY
  );
}

/**
 * Fold the comps into families, in the order given.
 *
 * The list arrives already sorted by adjusted placement (best first), so the
 * first comp to open a family is its lead and never needs re-ranking. A later
 * comp joins a family only if it matches that family's LEAD — never a chain of
 * variants — so a family can never drift away from the set it started as.
 */
export function groupFamilies(comps: Comp[]): CompFamily[] {
  const families: CompFamily[] = [];
  for (const comp of comps) {
    const home = families.find((f) => sameFamily(f.lead, comp));
    if (home) home.variants.push(comp);
    else families.push({ lead: comp, variants: [] });
  }
  return families;
}
