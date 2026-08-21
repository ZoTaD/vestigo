import type { Board } from "./types";

/**
 * How a comp is identified: dominant trait plus primary carry. Mirrors the
 * pipeline's aggregate/signature.ts so the analyzer and comps.json agree on
 * what a comp IS — the two packages keep separate copies only because they
 * consume different shapes (Board here, Participant there).
 */

/**
 * Per-champion "unique" traits (maxTier === 1) are not comp-defining: every
 * champion brings one, so they identify nothing.
 */
export function dominantTrait(board: Board): string {
  const real = board.traits.filter((t) => t.tier >= 1 && t.maxTier > 1);
  if (real.length === 0) return "";
  return [...real].sort(
    (a, b) => b.tier - a.tier || b.units - a.units || a.id.localeCompare(b.id)
  )[0].id;
}

/**
 * The carry is whoever the player committed items to. Items are the signal, not
 * cost: a 1-cost with three items is the carry, a 5-cost with none is not.
 */
export function primaryCarry(board: Board): string {
  if (board.units.length === 0) return "";
  return [...board.units].sort(
    (a, b) =>
      b.items.length - a.items.length ||
      b.stars - a.stars ||
      b.cost - a.cost ||
      a.id.localeCompare(b.id)
  )[0].id;
}

/** A comp's identity, matching the keys used in comps.json. */
export function compSignature(board: Board): string {
  const trait = dominantTrait(board);
  const carry = primaryCarry(board);
  if (trait === "" || carry === "") return "";
  return `${trait}|${carry}`;
}

/** "name#TAG", or just the name when Riot gave us no tag. */
export function riotId(board: Board): string {
  return board.tagLine ? `${board.gameName}#${board.tagLine}` : board.gameName;
}
