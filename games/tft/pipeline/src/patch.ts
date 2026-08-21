import { setOpeningVersions } from "./sets";

/**
 * Which patch a match was played on, and what to call it on screen.
 *
 * The meta moves between patches, and not a little: comparing 16.13 with 16.14
 * on the same bands, 14 of the 30 comps present in both changed tier letter, the
 * survivors moved 9.8 places on average, and three of the previous top ten do
 * not exist in the current patch at all. A tier list averaged over seven patches
 * describes none of them.
 */

/**
 * The client version Riot stamps on a match: "…[PUBLIC] <Releases/16.14>".
 *
 * Empty when absent — the caller decides whether that disqualifies the match,
 * rather than this guessing a default that would silently pool the unknown ones
 * into the current patch.
 */
export function patchOf(gameVersion: string): string {
  return /<Releases\/([\d.]+)>/.exec(gameVersion ?? "")?.[1] ?? "";
}

const parts = (patch: string): [number, number] => {
  const [major, minor] = patch.split(".");
  return [Number(major) || 0, Number(minor) || 0];
};

/**
 * Numeric order, because these are not strings to be sorted alphabetically:
 * "16.9" sorts after "16.10" that way, which would pick the wrong patch as the
 * newest one for the whole month after every minor rolls past nine.
 */
export function comparePatches(a: string, b: string): number {
  const [aMaj, aMin] = parts(a);
  const [bMaj, bMin] = parts(b);
  return aMaj - bMaj || aMin - bMin;
}

/** The highest patch in a list, or "" when there is nothing to choose from. */
export function newestPatch(patches: string[]): string {
  return patches.filter(Boolean).sort(comparePatches).pop() ?? "";
}

/**
 * The top `n` distinct patches in a list, newest first — never more than that,
 * but fewer when there are not that many distinct ones.
 *
 * Used to decide which patches still feed the summary (see summarize-run.ts):
 * the published patch and the one right before it, which is what makes "what
 * changed between patches" answerable at all. Read off whatever patches are
 * actually present, same as newestPatch — nothing here is hardcoded.
 */
export function newestPatches(patches: string[], n: number): string[] {
  const distinct = [...new Set(patches.filter(Boolean))];
  return distinct.sort(comparePatches).reverse().slice(0, Math.max(0, n));
}

/**
 * The first client version of each set, read off the one table that describes
 * sets (`sets.ts`) rather than written down a second time here.
 *
 * It used to be a literal in this file, which made it the fifth independent
 * place that knew a set number. A set whose client version has not been seen yet
 * is simply absent, and `patchLabel` already treats absent as "do not guess".
 */
const SET_OPENS_AT: Record<number, string> = setOpeningVersions();

/**
 * The name a player would use: Set 17's seventh patch is "17.7", not "16.14".
 *
 * Riot's client version and TFT's patch number are different things, and every
 * competitor shows the second one — MetaTFT and tactics.tools both call client
 * 16.14 "17.7", which is what confirmed the mapping.
 *
 * Falls back to the raw version whenever the arithmetic would be a guess: an
 * unknown set, a patch older than the set, or a set that spans a major version.
 * A wrong patch number is worse than an unfamiliar one.
 */
export function patchLabel(set: number, patch: string): string {
  const opens = SET_OPENS_AT[set];
  if (!opens || !patch) return patch;
  const [openMaj, openMin] = parts(opens);
  const [maj, min] = parts(patch);
  if (maj !== openMaj || min < openMin) return patch;
  return `${set}.${min - openMin + 1}`;
}
