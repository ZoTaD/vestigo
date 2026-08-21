/**
 * The four rank bands the meta is published for.
 *
 * The tier list used to be apex-only, so a Gold player read advice drawn from
 * Challenger boards. The bands do not accumulate: what a player needs is what
 * wins *at* their rank, and pooling the ranks above dilutes exactly that.
 *
 * The pipeline owns this table (games/tft/pipeline/src/bands.ts); this is the
 * browser's copy of it. `test/bands.test.ts` checks it against the files the
 * pipeline actually wrote, so the two cannot drift apart unnoticed.
 */
export type BandId =
  | "global"
  | "apex"
  | "diamond-emerald"
  | "platinum-gold"
  | "silver-below";

export interface Band {
  id: BandId;
  /** Riot tier names this band covers, uppercase as the API reports them. */
  tiers: string[];
  /**
   * True for the band that overlaps the others on purpose. It answers "what is
   * strong right now" rather than "what wins at my rank", so it is published
   * like any other but never used to decide which band a player belongs to.
   */
  aggregate?: boolean;
}

export const BANDS: Band[] = [
  {
    id: "global",
    tiers: ["PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"],
    aggregate: true,
  },
  { id: "apex", tiers: ["CHALLENGER", "GRANDMASTER", "MASTER"] },
  { id: "diamond-emerald", tiers: ["DIAMOND", "EMERALD"] },
  { id: "platinum-gold", tiers: ["PLATINUM", "GOLD"] },
  { id: "silver-below", tiers: ["SILVER", "BRONZE", "IRON"] },
];

/** The bands that partition the ladder: a player belongs to exactly one. */
export const EXCLUSIVE: Band[] = BANDS.filter((b) => !b.aggregate);

/**
 * The exclusive bands from the bottom up, which is what makes "the band above
 * yours" a thing that can be named.
 *
 * Written out rather than derived from BANDS: the order in that table is display
 * order, with the overlapping default first, and reusing it would tie the
 * coach's meaning to a cosmetic decision. The pipeline keeps the same list;
 * test/bands.test.ts checks both against the files on disk.
 */
export const BAND_LADDER: BandId[] = [
  "silver-below",
  "platinum-gold",
  "diamond-emerald",
  "apex",
];

/** The next rung up, or null at the top — and for the band that claims nobody. */
export function bandAbove(band: BandId): BandId | null {
  const at = BAND_LADDER.indexOf(band);
  if (at < 0 || at === BAND_LADDER.length - 1) return null;
  return BAND_LADDER[at + 1];
}

/**
 * The band that ships inside the bundle, and the one with no URL segment.
 *
 * Declared with `satisfies` rather than an annotation so it keeps the literal
 * type "apex": the loader map below is typed as "every band except this one",
 * and a widened BandId would make that set empty.
 */
export const DEFAULT_BAND = "global" satisfies BandId;

/** The bands that are fetched on demand instead of riding in the bundle. */
export type LazyBandId = Exclude<BandId, typeof DEFAULT_BAND>;

export const isBandId = (v: string): v is BandId => BANDS.some((b) => b.id === v);

/**
 * The band whose meta applies to a player of this rank.
 *
 * Null means we cannot say — unranked, or a tier we do not know. The caller has
 * to tell the player that rather than quietly showing them apex: advice from a
 * rank that is not theirs, unlabelled, is worse than no advice.
 */
export function bandForTier(tier: string): BandId | null {
  const name = tier.trim().split(/\s+/)[0].toUpperCase();
  if (!name) return null;
  // Only the exclusive bands: a Diamond player belongs to Diamond/Emerald, not
  // to the overlapping default, or the answer would depend on table order.
  return EXCLUSIVE.find((b) => b.tiers.includes(name))?.id ?? null;
}

/** The data file a band lives in. The default band keeps the plain name. */
export function bandDataPath(band: BandId, kind = "comps"): string {
  return band === DEFAULT_BAND ? `${kind}.json` : `${kind}.${band}.json`;
}

const STORAGE_KEY = "vestigo.band";

/**
 * The band picked last time, the same way the language is remembered.
 *
 * A player's rank does not change between visits, so asking them to re-pick it
 * every time would be asking them to keep telling us something we already know.
 * A URL that names a band still wins over this, exactly as it does for language.
 */
export function storedBand(): BandId {
  if (typeof localStorage === "undefined") return DEFAULT_BAND;
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved && isBandId(saved) ? saved : DEFAULT_BAND;
}

export function rememberBand(band: BandId): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, band);
}
