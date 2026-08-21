import type { Participant, Unit } from "./signature";

export interface UnitStar {
  tier: number;      // star level 1-3
  games: number;
  avgPlacement: number;
}

export interface UnitItemStat {
  id: string;
  games: number; // top-4 boards that held this item on the unit
}

/**
 * One champion, measured across every board that fielded it.
 *
 * The average placement of a unit is read the way every stats site reads it: it
 * is where boards fielding the unit tend to finish, which is partly the unit and
 * partly the comps it lives in. `delta` against boards without it, and the
 * per-star split, are what turn that raw average into something you can act on.
 */
export interface UnitStat {
  id: string;
  /** Shop price. Shown and filtered on, never used to rank — cost is not power. */
  cost: number;
  games: number;
  playRate: number;
  avgPlacement: number;
  avgPlacementWithout: number;
  /** with − without. Negative means boards place better with the unit. */
  delta: number;
  /** Share of boards that gave it at least one item — a carry sits near 1. */
  itemizedRate: number;
  /** Placement by star level: a reroll unit is only good at 3 stars, and the
   *  split is the only thing that shows it. */
  stars: UnitStar[];
  /** What the winning boards actually built on it. */
  topItems: UnitItemStat[];
}

export type CostLookup = (championId: string) => number;

const MAX_ITEMS = 3;

/**
 * A board's copies of one champion collapsed to its most-invested one, so every
 * per-unit figure is per board rather than per copy. 6.5% of real boards field
 * the same champion twice.
 */
function bestCopies(board: Participant): Unit[] {
  const best = new Map<string, Unit>();
  for (const u of board.units) {
    const prev = best.get(u.character_id);
    const better =
      !prev ||
      u.items.length > prev.items.length ||
      (u.items.length === prev.items.length && u.tier > prev.tier);
    if (better) best.set(u.character_id, u);
  }
  return [...best.values()];
}

/** Champions cost 1–5 in the shop. Anything outside that is not a bought unit:
 *  the spawned "Bia & Bayin" and the PvE dragon carry a sentinel cost of 11.
 *  Meepsie is cost 2 and stays — it has a summon mechanic but every stats site
 *  lists it as a champion, because you can also buy and play it. */
const MIN_COST = 1;
const MAX_COST = 5;

/**
 * Per-champion stats across the whole dataset.
 *
 * Restricted to bought champions, so the spawned and PvE units that share the
 * unit list in a payload never reach the page.
 */
export function aggregateUnits(
  participants: Participant[],
  minGames = 20,
  costOf: CostLookup = () => 0
): UnitStat[] {
  const total = participants.length;
  const totalPlace = participants.reduce((s, p) => s + p.placement, 0);

  const games = new Map<string, number>();
  const placeSum = new Map<string, number>();
  const itemizedBoards = new Map<string, number>();
  const starGames = new Map<string, Map<number, number>>();
  const starPlaceSum = new Map<string, Map<number, number>>();
  const winnerItems = new Map<string, Map<string, number>>();

  for (const p of participants) {
    const won = p.placement <= 4;
    for (const u of bestCopies(p)) {
      const id = u.character_id;
      games.set(id, (games.get(id) ?? 0) + 1);
      placeSum.set(id, (placeSum.get(id) ?? 0) + p.placement);
      if (u.items.length > 0) itemizedBoards.set(id, (itemizedBoards.get(id) ?? 0) + 1);

      const sg = starGames.get(id) ?? new Map<number, number>();
      sg.set(u.tier, (sg.get(u.tier) ?? 0) + 1);
      starGames.set(id, sg);

      const sp = starPlaceSum.get(id) ?? new Map<number, number>();
      sp.set(u.tier, (sp.get(u.tier) ?? 0) + p.placement);
      starPlaceSum.set(id, sp);

      // Winners' items only: what the top-4 boards built, not the average board.
      if (won && u.items.length > 0) {
        const wi = winnerItems.get(id) ?? new Map<string, number>();
        for (const item of new Set(u.items)) wi.set(item, (wi.get(item) ?? 0) + 1);
        winnerItems.set(id, wi);
      }
    }
  }

  const stats: UnitStat[] = [];
  for (const [id, g] of games) {
    if (g < minGames) continue;
    const cost = costOf(id);
    if (cost < MIN_COST || cost > MAX_COST) continue;

    const withSum = placeSum.get(id) ?? 0;
    const without = total - g;
    const avgWith = withSum / g;
    const avgWithout = without > 0 ? (totalPlace - withSum) / without : 0;

    const sg = starGames.get(id)!;
    const sp = starPlaceSum.get(id)!;
    const stars: UnitStar[] = [...sg.entries()]
      .map(([tier, gg]) => ({ tier, games: gg, avgPlacement: (sp.get(tier) ?? 0) / gg }))
      .sort((a, b) => a.tier - b.tier);

    const topItems: UnitItemStat[] = [...(winnerItems.get(id) ?? new Map<string, number>()).entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_ITEMS)
      .map(([itemId, gg]) => ({ id: itemId, games: gg }));

    stats.push({
      id,
      cost,
      games: g,
      playRate: g / total,
      avgPlacement: avgWith,
      avgPlacementWithout: avgWithout,
      delta: avgWith - avgWithout,
      itemizedRate: (itemizedBoards.get(id) ?? 0) / g,
      stars,
      topItems,
    });
  }

  // Most-played first. Never by cost: a 1-cost carry outranks a 5-cost bench.
  return stats.sort((a, b) => b.games - a.games || a.id.localeCompare(b.id));
}
