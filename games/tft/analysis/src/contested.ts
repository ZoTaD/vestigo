import type { Board, Finding, Lobby } from "./types";
import { compSignature, dominantTrait, primaryCarry, riotId } from "./comp";
import { resolveContext, type AnalysisContext } from "./context";

/**
 * Who was fighting you for the same pieces.
 *
 * Scope note, and it matters: this module deliberately does NOT count how many
 * copies of a champion the lobby held. Riot records each board at the moment
 * that player was eliminated, so the eight boards are not a simultaneous
 * snapshot — a dead player's units go back into the shared pool and get bought
 * again. Summing copies across boards counted the same recycled copy twice and
 * produced 17 copies of a 4-cost, against a real pool of 10. See the design
 * doc, section 4.3. Everything below is a plain fact about the final boards.
 */

/**
 * The cost of being contested comes from the pipeline, measured within the same
 * carry so the "strong comps get contested more" bias cannot hide it. Star level
 * was unaffected (-0.027, noise), so we never blame contest for a missed 3-star.
 */
/** How many crowded units to name before the list stops being readable. */
const MAX_SHARED_UNITS = 3;
/** A unit needs this many rivals above expectation before it is worth naming. */
const UNIT_EXCESS = 1;

/** "Name (3rd)" or "Name (3°)", depending on the language. */
const listOf = (boards: Board[], ordinal: (n: number) => string) =>
  boards.map((b) => `${riotId(b)} (${ordinal(b.placement)})`).join(", ");

export function findContested(
  me: Board,
  lobby: Lobby,
  context?: Partial<AnalysisContext>
): Finding[] {
  const rivals = lobby.boards.filter((b) => b.puuid !== me.puuid);
  if (rivals.length === 0) return [];

  const { labels, calibration, copy } = resolveContext(context);
  const say = copy.contested;
  const list = (boards: Board[]) => listOf(boards, copy.ordinal);
  const EVIDENCE = say.evidence(
    calibration.matches,
    calibration.contest.placementCost.toFixed(2)
  );

  const findings: Finding[] = [];
  const myCarry = primaryCarry(me);
  const mySignature = compSignature(me);

  // The strongest claim available: someone played your comp, trait and carry.
  const sameComp = mySignature
    ? rivals.filter((b) => compSignature(b) === mySignature)
    : [];
  if (sameComp.length > 0) {
    const beatYou = sameComp.filter((b) => b.placement < me.placement);
    findings.push({
      id: "contested-comp",
      module: "contested",
      severity: "high",
      title: say.compTitle(sameComp.length),
      detail: say.compDetail({
        list: list(sameComp),
        trait: labels.trait(dominantTrait(me)),
        carry: labels.champion(myCarry),
        count: sameComp.length,
        placement: me.placement,
        beatYou: beatYou.length,
      }),
      evidence: EVIDENCE,
    });
  }

  // Same carry out of a different trait still means competing for the same unit.
  const sameCompIds = new Set(sameComp.map((b) => b.puuid));
  const sameCarry = myCarry
    ? rivals.filter((b) => primaryCarry(b) === myCarry && !sameCompIds.has(b.puuid))
    : [];
  if (sameCarry.length > 0) {
    findings.push({
      id: "contested-carry",
      module: "contested",
      severity: sameCarry.length > 1 ? "high" : "medium",
      title: say.carryTitle(labels.champion(myCarry)),
      detail: say.carryDetail(
        list(sameCarry),
        labels.champion(myCarry),
        sameCarry.length
      ),
      evidence: EVIDENCE,
    });
  }

  // How crowded the board was, against how crowded it SHOULD have been.
  //
  // The first version just listed "3 of the other 7 also had Morgana", which
  // taught nothing: Morgana is on a third of all boards, so 2.3 of the other 7
  // is the expected number and 3 is unremarkable. Corrected for each champion's
  // pickrate, crowding is worth 0.65 placements — but only once corrected.
  const rates = calibration.pickRates;
  const threshold = calibration.contest.crowdedFrom;
  if (rates && threshold !== undefined && rivals.length > 0) {
    const perUnit = me.units
      .map((u) => {
        const rate = rates[u.id];
        if (rate === undefined) return null;
        const held = rivals.filter((b) => b.units.some((their) => their.id === u.id)).length;
        return { id: u.id, held, expected: rate * rivals.length };
      })
      .filter((x): x is { id: string; held: number; expected: number } => x !== null);

    if (perUnit.length > 0) {
      const excess =
        perUnit.reduce((s, u) => s + (u.held - u.expected), 0) / perUnit.length;

      const worst = perUnit
        .filter((u) => u.held - u.expected >= UNIT_EXCESS)
        .sort((a, b) => b.held - b.expected - (a.held - a.expected))
        .slice(0, MAX_SHARED_UNITS);

      if (excess > threshold && worst.length > 0) {
        findings.push({
          id: "contested-crowd",
          module: "contested",
          severity: "medium",
          title: say.crowdTitle,
          detail: worst
            .map((u) =>
              say.crowdUnit(
                labels.champion(u.id),
                u.held,
                rivals.length,
                u.expected.toFixed(1)
              )
            )
            .join(" · "),
          evidence:
            calibration.contest.crowdedAvg !== undefined &&
            calibration.contest.clearAvg !== undefined
              ? say.crowdEvidence(
                  calibration.matches,
                  calibration.contest.crowdedAvg,
                  calibration.contest.clearAvg
                )
              : undefined,
        });
      }
    }
  }

  return findings;
}
