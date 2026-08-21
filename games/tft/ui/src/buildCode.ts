import { catalog } from "./catalog";

/**
 * A comp as a code the game reads.
 *
 * Pasted into the in-game Team Planner, the code marks which champions to buy.
 * The format is Riot's own: `02` (version) + ten 12-bit champion ids (three hex
 * digits each, the id in hex, zero-padded) + `TFTSetNN`. Empty slots are `000`.
 *
 * The id per champion is the game's intrinsic number — not the alphabetical or
 * list order — carried in the catalog as `teamId`, extracted from the raw game
 * data by the pipeline. Champions without one (summoned units) are skipped.
 * Verified by round-tripping real in-game codes; see buildCode.test.ts.
 */

/** The Team Planner board holds ten slots. */
const SLOTS = 10;

const idsFor = (championIds: string[]): number[] =>
  championIds
    .map((id) => catalog.champions[id]?.teamId)
    .filter((n): n is number => typeof n === "number")
    .slice(0, SLOTS);

export function buildCode(championIds: string[]): string {
  const ids = idsFor(championIds);
  let hex = "02";
  for (let i = 0; i < SLOTS; i++) {
    hex += (i < ids.length ? ids[i] : 0).toString(16).padStart(3, "0");
  }
  return hex + "TFTSet" + catalog.set;
}

/** Whether any of these champions can be encoded — used to hide an empty button. */
export const hasBuildCode = (championIds: string[]): boolean => idsFor(championIds).length > 0;
