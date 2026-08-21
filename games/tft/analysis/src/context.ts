import { defaultLabels, type Labels } from "./labels";
import { COPY, DEFAULT_LANG, type Lang } from "./copy";

/**
 * Everything the analyzer needs from the outside world.
 *
 * Both pieces are injected rather than baked in, for the same reason: this
 * package must stay honest across set changes. Display names come from the
 * CommunityDragon catalog; the figures the report quotes are measured by the
 * pipeline on every `build:comps` and travel inside comps.json.
 */

export interface Calibration {
  matches: number;
  boards: number;
  contest: {
    /** Placements lost by sharing your carry, measured within the same carry. */
    placementCost: number;
    carriesCompared: number;
    /**
     * Board-level crowding, corrected for how popular each champion is. Raw
     * counts say nothing: a champion on a third of all boards is EXPECTED on
     * 2.3 of the other 7 seats, so "3 of 7 had it" is normal, not a fight.
     */
    crowdedAvg?: number;
    normalAvg?: number;
    clearAvg?: number;
    crowdedFrom?: number;
  };
  /** Share of all boards fielding each champion — the expectation baseline. */
  pickRates?: Record<string, number>;
  gold: {
    wastedFrom: number;
    severeFrom: number;
    lowAvg: number;
    wastedAvg: number;
    severeAvg: number;
  };
  carryItems: {
    full: number;
    shortRate: number;
    shortAvg: number;
    fullAvg: number;
  };
}

/**
 * Last values measured by the pipeline, used when a caller supplies none — for
 * instance a comps.json written before calibration existed. Real runs always
 * pass the live figures.
 */
export const defaultCalibration: Calibration = {
  matches: 494,
  boards: 3910,
  contest: {
    placementCost: 0.26,
    carriesCompared: 17,
    crowdedAvg: 4.84,
    normalAvg: 4.52,
    clearAvg: 4.19,
    crowdedFrom: 0.25,
  },
  gold: { wastedFrom: 26, severeFrom: 51, lowAvg: 4.44, wastedAvg: 4.85, severeAvg: 5.05 },
  carryItems: { full: 3, shortRate: 0.011, shortAvg: 5.82, fullAvg: 4.48 },
};

export interface AnalysisContext {
  labels: Labels;
  calibration: Calibration;
  /** Which language the findings are written in. */
  lang: Lang;
}

export const defaultContext: AnalysisContext = {
  labels: defaultLabels,
  calibration: defaultCalibration,
  lang: DEFAULT_LANG,
};

/** A context with the sentences for its language already selected. */
export interface ResolvedContext extends AnalysisContext {
  copy: (typeof COPY)[Lang];
}

/** Fills in whatever a caller left out, so partial contexts are safe. */
export function resolveContext(partial?: Partial<AnalysisContext>): ResolvedContext {
  const lang = partial?.lang ?? DEFAULT_LANG;
  return {
    labels: partial?.labels ?? defaultLabels,
    calibration: partial?.calibration ?? defaultCalibration,
    lang,
    copy: COPY[lang],
  };
}
