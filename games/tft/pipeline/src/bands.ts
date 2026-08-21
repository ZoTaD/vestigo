/**
 * The rank bands the meta is built for.
 *
 * The tier list used to be apex-only, and everything below it was thrown away —
 * including diamond, which is the band we hold the most matches from. The reason
 * for the filter was sound (averaging Iron in with Master produced 267 "comps"
 * that describe what happens on the ladder rather than what wins on it), but the
 * conclusion was not: the fix is to separate the bands, not to discard them.
 *
 * The groups are fixed and do NOT accumulate. "Diamond+" would answer what wins
 * from your rank upward; a player wants to know what wins *at* their rank, and
 * pooling the ranks above dilutes exactly that.
 *
 * Ids are English even though the site is bilingual, matching every other slug
 * in the product: two spellings of one page compete for the same search and
 * break every shared link on a language switch.
 */
export interface RankBand {
  /** Slug used for the filename and, later, the URL. */
  id: string;
  /** Riot tier names this band covers, lowercase and without division. */
  tiers: string[];
  /**
   * Whether matches stored without a tier land here. Everything untagged was
   * pulled before tier stamping existed, from challenger pulls or from
   * searching a high-elo player, so it belongs with the high-elo cuts.
   */
  untagged?: boolean;
  /**
   * True for a band that overlaps the others on purpose. It is published like
   * any other, but never used to decide which band a match belongs to.
   */
  aggregate?: boolean;
}

export const BANDS: RankBand[] = [
  /**
   * The default cut, and the only one that overlaps: it is the general "what is
   * strong right now" answer rather than a per-rank one. Both competitors open
   * on a cumulative cut of roughly this shape — MetaTFT on Platinum+ and
   * tactics.tools on Diamond+ — and it is by far our largest sample.
   */
  {
    id: "global",
    tiers: ["platinum", "emerald", "diamond", "master", "grandmaster", "challenger"],
    untagged: true,
    aggregate: true,
  },
  { id: "apex", tiers: ["challenger", "grandmaster", "master"], untagged: true },
  { id: "diamond-emerald", tiers: ["diamond", "emerald"] },
  { id: "platinum-gold", tiers: ["platinum", "gold"] },
  { id: "silver-below", tiers: ["silver", "bronze", "iron"] },
];

/**
 * The bands that partition the ladder: every match belongs to exactly one, which
 * is what makes "the band above yours" a well-defined thing to compare against.
 */
export const EXCLUSIVE: RankBand[] = BANDS.filter((b) => !b.aggregate);

/**
 * The exclusive bands from the bottom up, which is what makes "the band above
 * yours" a thing that can be named. The coach compares one rung to the next.
 *
 * Written out rather than derived from BANDS, whose order is display order. The
 * browser's copy in games/tft/ui/src/bands.ts must match; ui/test/bands.test.ts
 * is the referee.
 */
export const BAND_LADDER: string[] = [
  "silver-below",
  "platinum-gold",
  "diamond-emerald",
  "apex",
];

/** The next rung up, or null at the top — and for the band that claims nobody. */
export function bandAbove(bandId: string): string | null {
  const at = BAND_LADDER.indexOf(bandId);
  if (at < 0 || at === BAND_LADDER.length - 1) return null;
  return BAND_LADDER[at + 1];
}

/** The band the bundle ships with, and the one the plain filenames hold. */
export const DEFAULT_BAND = "global";

/** Whether a band's cut includes this tier. Works for overlapping bands too. */
export function bandCovers(bandId: string, rawTier: string): boolean {
  const band = BANDS.find((b) => b.id === bandId);
  if (!band) return false;
  const tier = tierOf(rawTier);
  return tier === "" ? band.untagged === true : band.tiers.includes(tier);
}

/** "GOLD IV" → "gold". A division does not change which comps win. */
export function tierOf(rawTier: string): string {
  return rawTier.trim().split(/\s+/)[0].toLowerCase();
}

/**
 * The band a stored lobby belongs to, or undefined for a tier we do not know.
 *
 * Only ever searches the exclusive bands: the aggregate one overlaps them, so
 * including it here would make the answer depend on table order.
 */
export function bandOf(rawTier: string): RankBand | undefined {
  const tier = tierOf(rawTier);
  if (tier === "") return EXCLUSIVE.find((b) => b.untagged);
  return EXCLUSIVE.find((b) => b.tiers.includes(tier));
}

/**
 * Where a band's copy of a dataset lives: `comps.json` for the default band,
 * `comps.diamond-emerald.json` for the rest.
 *
 * The default keeps the plain name so the bundle's static import stays as it is
 * — that import is what keeps apex in the main chunk while the other bands are
 * fetched on demand.
 */
export function bandPath(path: string, bandId: string): string {
  if (bandId === DEFAULT_BAND) return path;
  const dot = path.lastIndexOf(".");
  return `${path.slice(0, dot)}.${bandId}${path.slice(dot)}`;
}
