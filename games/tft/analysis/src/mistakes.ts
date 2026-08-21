import type { Board, Finding } from "./types";
import { primaryCarry } from "./comp";
import { formatRound } from "./rounds";
import { resolveContext, type AnalysisContext } from "./context";

/**
 * Hard, measurable slips visible in the final board.
 *
 * Every threshold here was calibrated against the 3758 stored boards, not
 * guessed. Two checks that seemed obvious were DROPPED because the data said
 * they carry no signal:
 *
 *  - Level for the round. Players below the median level of everyone eliminated
 *    on their own round averaged 4.54 placement against 4.55 for those at it.
 *    Indistinguishable, so claiming "you were underleveled" would be noise.
 *  - Star level of the carry when contested (see contested.ts).
 *  - Trait breakpoints. The first version said "you had 3, one more makes 4",
 *    which is arithmetic, not advice. The salvage attempt — flagging units that
 *    sit above a breakpoint and so activate nothing — measured 21% of boards but
 *    only 0.10 placements of difference. Noise again: those units are earning
 *    their slot through some other trait. What a board is missing is answered
 *    far better by metaGap, which compares against the boards that won.
 */

/**
 * Game rules, not measurements. These are the only numbers here that do NOT
 * come from our own store — they are how TFT works, and they turn a statistic
 * ("you died on 41 gold") into a lesson ("that was 20 rolls you never took").
 *
 * Interest pays 1 gold per 10 saved and stops at 50, so gold above that earns
 * nothing at all. Verified against two independent economy guides plus the
 * League wiki; see the design doc.
 */
const INTEREST_CAP = 50;
const REROLL_COST = 2;
const XP_COST = 4;

export function findMistakes(
  me: Board,
  context?: Partial<AnalysisContext>
): Finding[] {
  const { labels, calibration, copy } = resolveContext(context);
  const { gold, carryItems } = calibration;
  const GOLD_WASTED = gold.wastedFrom;
  const GOLD_SEVERE = gold.severeFrom;
  const FULL_ITEMS = carryItems.full;
  const say = copy.mistakes;

  const GOLD_EVIDENCE = say.goldEvidence(
    calibration.matches, gold.wastedFrom, gold.severeFrom,
    gold.wastedAvg, gold.severeAvg, gold.lowAvg
  );
  const ITEM_EVIDENCE = say.carryEvidence(
    (carryItems.shortRate * 100).toFixed(1),
    carryItems.shortAvg, carryItems.fullAvg, carryItems.full
  );

  const findings: Finding[] = [];

  if (me.goldLeft >= GOLD_WASTED) {
    findings.push({
      id: "mistake-gold",
      module: "mistakes",
      severity: me.goldLeft >= GOLD_SEVERE ? "high" : "medium",
      title: say.goldTitle(me.goldLeft),
      // Spelled out in what the gold buys, because "41 gold" is a number and
      // "20 rolls" is a decision you can picture yourself not having made.
      detail:
        say.goldDetail(
          formatRound(me.lastRound),
          me.goldLeft,
          Math.floor(me.goldLeft / REROLL_COST),
          Math.floor(me.goldLeft / XP_COST)
        ) +
        (me.goldLeft > INTEREST_CAP
          ? say.goldDead(INTEREST_CAP, me.goldLeft - INTEREST_CAP)
          : ""),
      evidence: GOLD_EVIDENCE,
    });
  }

  const carryId = primaryCarry(me);
  const carry = me.units.find((u) => u.id === carryId);
  if (carry && carry.items.length < FULL_ITEMS) {
    findings.push({
      id: "mistake-carry-items",
      module: "mistakes",
      severity: "high",
      title: say.carryTitle(labels.champion(carry.id)),
      detail: say.carryDetail(carry.items.length, FULL_ITEMS),
      evidence: ITEM_EVIDENCE,
    });
  }

  return findings;
}
