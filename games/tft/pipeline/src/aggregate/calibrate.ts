import { primaryCarry, type Participant } from "./signature";

/**
 * The numbers the analyzer quotes back at the player.
 *
 * These used to be constants typed into the analysis modules, measured once by
 * hand. That breaks the project's rule that nothing is hardcoded: Set 18 would
 * silently leave the analyzer citing Set 17 figures. Measuring them here means
 * they refresh with every `build:comps`, like everything else.
 */

export interface Calibration {
  matches: number;
  boards: number;
  contest: {
    /** Placements lost by sharing your carry, measured within the same carry. */
    placementCost: number;
    /** Carries with enough of both groups to compare. */
    carriesCompared: number;
    /**
     * Board-level contest, corrected for how popular each champion is. Raw
     * counts are meaningless — a champion on a third of all boards is expected
     * on 2.3 of the other 7 seats, so "3 of 7 had it" is normal, not a fight.
     * These are average placements once that expectation is subtracted.
     */
    crowdedAvg: number;
    normalAvg: number;
    clearAvg: number;
    /** Excess rivals per unit that counts as a crowded or a clear board. */
    crowdedFrom: number;
  };
  /** Share of all boards fielding each champion. The expectation baseline. */
  pickRates: Record<string, number>;
  gold: {
    wastedFrom: number;
    severeFrom: number;
    lowAvg: number;
    wastedAvg: number;
    severeAvg: number;
  };
  carryItems: {
    full: number;
    /** Share of boards whose carry never completed its items. */
    shortRate: number;
    shortAvg: number;
    fullAvg: number;
  };
}

/** Where leftover gold stops being normal. Design choice; the averages measure it. */
const GOLD_WASTED_FROM = 26;
const GOLD_SEVERE_FROM = 51;
const GOLD_LOW_TO = 10;
const FULL_ITEMS = 3;
/** A carry needs this many boards in both groups before its delta means anything. */
const MIN_PER_GROUP = 10;
/**
 * How many rivals above expectation, averaged over a board's units, separates a
 * crowded board from a clear one. A quarter of a rival per unit is small on
 * paper but adds up across nine slots.
 */
const CROWDED_FROM = 0.25;

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const round = (n: number, places = 2) => Number(n.toFixed(places));

/**
 * Contest cost, controlled for which carry it is.
 *
 * The raw comparison is confounded: strong comps get contested more, so their
 * good placements cancel the penalty out (4.46 contested against 4.51 alone —
 * apparently nothing). Comparing contested against uncontested WITHIN the same
 * carry removes that, and the real cost appears.
 */
function contestCost(lobbies: Participant[][]): { placementCost: number; carriesCompared: number } {
  const groups = new Map<string, { contested: number[]; alone: number[] }>();

  for (const boards of lobbies) {
    if (boards.length < 2) continue;
    const carries = boards.map(primaryCarry);
    const tally = new Map<string, number>();
    for (const c of carries) if (c) tally.set(c, (tally.get(c) ?? 0) + 1);

    boards.forEach((board, i) => {
      const carry = carries[i];
      if (!carry) return;
      const group = groups.get(carry) ?? { contested: [], alone: [] };
      if ((tally.get(carry) ?? 0) > 1) group.contested.push(board.placement);
      else group.alone.push(board.placement);
      groups.set(carry, group);
    });
  }

  let weighted = 0;
  let weight = 0;
  let carriesCompared = 0;
  for (const { contested, alone } of groups.values()) {
    if (contested.length < MIN_PER_GROUP || alone.length < MIN_PER_GROUP) continue;
    carriesCompared++;
    weighted += (mean(contested) - mean(alone)) * contested.length;
    weight += contested.length;
  }

  return {
    placementCost: weight > 0 ? round(weighted / weight) : 0,
    carriesCompared,
  };
}

/** Share of all boards fielding each champion. Duplicates collapse to one. */
function pickRates(boards: Participant[]): Record<string, number> {
  const seen = new Map<string, number>();
  for (const b of boards) {
    for (const id of new Set(b.units.map((u) => u.character_id))) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  const rates: Record<string, number> = {};
  for (const [id, n] of seen) rates[id] = round(n / Math.max(1, boards.length), 4);
  return rates;
}

/**
 * How much a crowded board costs, once each champion's popularity is accounted
 * for. Without the correction the measure is worthless: a champion on a third of
 * all boards is EXPECTED on 2.3 of the other 7 seats.
 */
function crowding(lobbies: Participant[][], rates: Record<string, number>) {
  const crowded: number[] = [];
  const normal: number[] = [];
  const clear: number[] = [];

  for (const boards of lobbies) {
    if (boards.length < 2) continue;
    const rivalsPer = boards.length - 1;
    for (const me of boards) {
      const mine = new Set(me.units.map((u) => u.character_id));
      let excess = 0;
      let counted = 0;
      for (const id of mine) {
        const rate = rates[id];
        if (rate === undefined) continue;
        const rivals = boards.filter(
          (o) => o !== me && o.units.some((u) => u.character_id === id)
        ).length;
        excess += rivals - rate * rivalsPer;
        counted++;
      }
      if (counted === 0) continue;
      const perUnit = excess / counted;
      if (perUnit > CROWDED_FROM) crowded.push(me.placement);
      else if (perUnit < -CROWDED_FROM) clear.push(me.placement);
      else normal.push(me.placement);
    }
  }

  return {
    crowdedAvg: round(mean(crowded)),
    normalAvg: round(mean(normal)),
    clearAvg: round(mean(clear)),
    crowdedFrom: CROWDED_FROM,
  };
}

export function calibrate(lobbies: Participant[][]): Calibration {
  const boards = lobbies.flat();
  const rates = pickRates(boards);

  const inBand = (from: number, to: number) =>
    boards.filter((b) => b.goldLeft >= from && b.goldLeft <= to).map((b) => b.placement);

  const withCarry = boards.filter((b) => b.units.length > 0);
  const carryItemCount = (b: Participant) =>
    b.units.find((u) => u.character_id === primaryCarry(b))?.items.length ?? 0;
  const short = withCarry.filter((b) => carryItemCount(b) < FULL_ITEMS);
  const full = withCarry.filter((b) => carryItemCount(b) >= FULL_ITEMS);

  return {
    matches: lobbies.length,
    boards: boards.length,
    contest: { ...contestCost(lobbies), ...crowding(lobbies, rates) },
    pickRates: rates,
    gold: {
      wastedFrom: GOLD_WASTED_FROM,
      severeFrom: GOLD_SEVERE_FROM,
      lowAvg: round(mean(inBand(0, GOLD_LOW_TO))),
      wastedAvg: round(mean(inBand(GOLD_WASTED_FROM, GOLD_SEVERE_FROM - 1))),
      severeAvg: round(mean(inBand(GOLD_SEVERE_FROM, Number.MAX_SAFE_INTEGER))),
    },
    carryItems: {
      full: FULL_ITEMS,
      shortRate: withCarry.length ? round(short.length / withCarry.length, 4) : 0,
      shortAvg: round(mean(short.map((b) => b.placement))),
      fullAvg: round(mean(full.map((b) => b.placement))),
    },
  };
}
