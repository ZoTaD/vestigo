import type { Participant, Unit } from "./signature";

export interface ItemCarrier {
  id: string;             // champion id
  games: number;          // boards where this unit held the item
  avgPlacement: number;
}

/**
 * One item, measured across every board that built it.
 *
 * Read the way the units page reads a champion: the average placement is where
 * boards holding the item tend to finish, which is partly the item and partly
 * the comps that want it. `delta` and the carrier list are what make it useful.
 */
export interface ItemStat {
  id: string;
  games: number;
  playRate: number;
  avgPlacement: number;
  avgPlacementWithout: number;
  /** with − without. Negative means boards place better holding the item. */
  delta: number;
  /** Which champions hold it, most often first — the "best on" list. */
  bestUnits: ItemCarrier[];
}

/** True for items a player builds — the catalog gives them two components. */
export type ItemFilter = (id: string) => boolean;

const MAX_CARRIERS = 5;

/** A board's copies of one champion collapsed to its most-invested one. */
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

export function aggregateItems(
  participants: Participant[],
  minGames = 20,
  isCraftable: ItemFilter = () => true
): ItemStat[] {
  const total = participants.length;
  const totalPlace = participants.reduce((s, p) => s + p.placement, 0);

  const games = new Map<string, number>();
  const placeSum = new Map<string, number>();
  // item -> champion -> [games, placementSum]
  const carriers = new Map<string, Map<string, { games: number; place: number }>>();

  for (const p of participants) {
    // Which items the board held, counted once even if two units share one.
    const onBoard = new Set<string>();
    for (const u of bestCopies(p)) {
      for (const item of new Set(u.items)) {
        if (!isCraftable(item)) continue;
        onBoard.add(item);

        const byUnit = carriers.get(item) ?? new Map<string, { games: number; place: number }>();
        const cell = byUnit.get(u.character_id) ?? { games: 0, place: 0 };
        cell.games += 1;
        cell.place += p.placement;
        byUnit.set(u.character_id, cell);
        carriers.set(item, byUnit);
      }
    }
    for (const item of onBoard) {
      games.set(item, (games.get(item) ?? 0) + 1);
      placeSum.set(item, (placeSum.get(item) ?? 0) + p.placement);
    }
  }

  const stats: ItemStat[] = [];
  for (const [id, g] of games) {
    if (g < minGames) continue;

    const withSum = placeSum.get(id) ?? 0;
    const without = total - g;
    const avgWith = withSum / g;
    const avgWithout = without > 0 ? (totalPlace - withSum) / without : 0;

    const bestUnits: ItemCarrier[] = [...(carriers.get(id) ?? new Map()).entries()]
      .map(([unitId, c]) => ({ id: unitId, games: c.games, avgPlacement: c.place / c.games }))
      .sort((a, b) => b.games - a.games || a.avgPlacement - b.avgPlacement)
      .slice(0, MAX_CARRIERS);

    stats.push({
      id,
      games: g,
      playRate: g / total,
      avgPlacement: avgWith,
      avgPlacementWithout: avgWithout,
      delta: avgWith - avgWithout,
      bestUnits,
    });
  }

  return stats.sort((a, b) => b.games - a.games || a.id.localeCompare(b.id));
}
