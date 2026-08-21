import unitsJson from "@data/units.json";
import { catalog, text, byLang, useByLang } from "./catalog";
import type { Lang } from "./i18n";

/**
 * The Units page's data layer: reads the pipeline's units.json and resolves ids
 * to names and images through the catalog, the same way data.ts does for comps.
 *
 * Presentation decisions that are not the pipeline's job live here — which star
 * levels are worth drawing, and whether a unit reads as a carry — so the view
 * stays about layout.
 */

interface RawStar {
  tier: number;
  games: number;
  avgPlacement: number;
}

interface RawUnit {
  id: string;
  cost: number;
  games: number;
  playRate: number;
  avgPlacement: number;
  avgPlacementWithout: number;
  delta: number;
  itemizedRate: number;
  stars: RawStar[];
  topItems: { id: string; games: number }[];
}

interface UnitsFile {
  generatedAt: string;
  sampleSize: number;
  units: RawUnit[];
}

const file = unitsJson as unknown as UnitsFile;

const stripSet = (id: string) => id.replace(/^TFT\d+_/, "");

/** Below this many boards, a star level's average is noise; a game can also
 *  reach 4 stars through rare set mechanics, and those never clear the bar. */
const STAR_MIN_GAMES = 20;
/** A unit itemized at least this often is playing as a carry, not a support. */
const CARRY_ITEMIZED = 0.6;

export interface UnitStar {
  tier: number;
  games: number;
  avgPlacement: number;
}

export interface UnitItem {
  id: string;
  name: string;
  img: string;
  games: number;
}

export interface Unit {
  id: string;
  name: string;
  img: string;
  cost: number;
  games: number;
  playRate: number;
  avgPlacement: number;
  /** with − without; negative means boards place better with the unit. */
  delta: number;
  itemizedRate: number;
  isCarry: boolean;
  /** Star levels worth showing: real samples, capped at the normal 3. */
  stars: UnitStar[];
  /** The star level the unit places best at, when one has enough evidence. */
  bestStar: UnitStar | null;
  topItems: UnitItem[];
}

function toItem(raw: { id: string; games: number }, lang: Lang): UnitItem {
  const entry = catalog.items[raw.id];
  return {
    id: raw.id,
    name: text(entry?.name, lang, stripSet(raw.id)),
    img: entry?.img ?? "",
    games: raw.games,
  };
}

/** Every unit, named in one language. Built once per language and cached. */
export const buildUnits = byLang((lang: Lang): Unit[] =>
  file.units.map((u) => {
  const stars = u.stars
    .filter((s) => s.tier <= 3 && s.games >= STAR_MIN_GAMES)
    .sort((a, b) => a.tier - b.tier);
  const bestStar =
    stars.length > 0
      ? [...stars].sort((a, b) => a.avgPlacement - b.avgPlacement)[0]
      : null;
  const champ = catalog.champions[u.id];

  return {
    id: u.id,
    name: text(champ?.name, lang, stripSet(u.id)),
    img: champ?.img ?? "",
    cost: u.cost,
    games: u.games,
    playRate: u.playRate,
    avgPlacement: u.avgPlacement,
    delta: u.delta,
    itemizedRate: u.itemizedRate,
    isCarry: u.itemizedRate >= CARRY_ITEMIZED,
    stars,
    bestStar,
    topItems: u.topItems.map((i) => toItem(i, lang)),
  };
  })
);

/** Every unit in the language the page is in. */
export const useUnits = (): Unit[] => useByLang(buildUnits);

export const unitsDataset = {
  generatedAt: file.generatedAt,
  sampleSize: file.sampleSize,
};

/** The costs actually present, for the filter row — never hard-coded 1..5.
 *  Costs are numbers, so the language does not enter into it. */
export const unitCosts: number[] = [...new Set(file.units.map((u) => u.cost))].sort(
  (a, b) => a - b
);
