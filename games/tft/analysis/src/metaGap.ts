import type { Board, Finding } from "./types";
import { compSignature, primaryCarry } from "./comp";
import { resolveContext, type AnalysisContext } from "./context";

/**
 * The board measured against what actually works.
 *
 * The first version compared a board to the comp's AVERAGE, which mixes first
 * place with eighth — so it produced observations, not lessons ("this unit is
 * in 85% of boards"). Every finding here instead compares the two halves of the
 * comp: what the top-4 boards did that the bottom-4 boards did not. That is the
 * only comparison that answers "what do the good players do that I don't".
 *
 * The comp source is an interface, not comps.json: the analyzer depends on the
 * shape it needs, so the pipeline can change how it stores things without
 * dragging this module along.
 */

export interface CompUnitRef {
  id: string;
  /** Share of the comp's boards that field this unit. */
  frequency: number;
  /** Whether the unit is part of the comp's identity, as opposed to a flex slot. */
  core?: boolean;
  /** Share that hand it items. */
  itemizedRate: number;
  items: { id: string; count: number }[];
  boards: number;

  // The outcome split. Absent on datasets built before it existed.
  winnerRate?: number;
  loserRate?: number;
  avgPlacementWith?: number;
  avgPlacementWithout?: number;
  winnerBoards?: number;
  loserBoards?: number;
  winnerItems?: { id: string; count: number }[];
}

export interface CompOutcomeRef {
  boards: number;
  avgPlacement: number;
  avgLevel: number;
  avgGoldLeft: number;
}

export interface CompReference {
  signature: string;
  /**
   * Every signature the pipeline merged into this comp. A board names its comp
   * by whichever unit ended up holding its items, so the same team arrives
   * under many spellings; matching only the winning one would leave most boards
   * unrecognised and quietly downgrade them to a loose match.
   */
  signatures?: string[];
  trait: string;
  carries: string[];
  tier: string;
  avgPlacement: number;
  avgLevel: number;
  count: number;
  units: CompUnitRef[];
  winners?: CompOutcomeRef;
  losers?: CompOutcomeRef;
}

/** A unit this common is part of the comp, not a flex slot. */
const CORE_FREQUENCY = 0.8;
/**
 * Below this overlap the "closest" comp is not really the same comp. Calibrated
 * over the whole store: at an overlap of 3 or 4 the match was routinely wrong —
 * a first-place board got told it was playing a D-tier comp it never built.
 */
const MIN_OVERLAP = 5;
/** How many pieces to name before the sentence stops being useful. */
const MAX_LISTED = 3;

/**
 * How much more often the top-4 boards must field a unit before we call it a
 * lesson. Winning boards field ~9% more units than losing ones simply because
 * surviving longer means more levels, which hands EVERY unit a baseline lift of
 * roughly 0.06. This bar sits well above that, so what it reports is a real
 * choice rather than an artefact of living longer.
 */
const MIN_LIFT = 0.2;
/** And the placement gap has to be worth a sentence. */
const MIN_PLACEMENT_DELTA = 0.5;
/**
 * Neither side of the comparison may rest on almost nothing. At the first pass
 * these sat at 4 and 3, which produced sentences like "63% of the top 4 ran it"
 * off three boards out of five — noise wearing a percentage sign.
 */
const MIN_WINNER_SAMPLE = 10;
const MIN_LOSER_SAMPLE = 10;
/** An item this common on the winners' carry is the intended build. */
const SIGNATURE_ITEM = 0.3;
/** Levels below the winners' average worth mentioning. */
const LEVEL_GAP = 0.75;

export interface CompMatch {
  comp: CompReference;
  /** True when the board's own signature named this comp outright. */
  exact: boolean;
  /** How many of the comp's units the board actually fielded. */
  overlap: number;
}

/**
 * Which comp the board was playing. Exact signature first; otherwise the comp
 * sharing the most units, which covers boards that drifted off-plan.
 */
export function matchComp(board: Board, comps: CompReference[]): CompMatch | null {
  if (comps.length === 0) return null;
  const ids = new Set(board.units.map((u) => u.id));
  const overlapWith = (c: CompReference) =>
    c.units.filter((u) => u.frequency >= CORE_FREQUENCY && ids.has(u.id)).length;

  const signature = compSignature(board);
  const exact = signature
    ? comps.find(
        (c) => c.signature === signature || (c.signatures ?? []).includes(signature)
      )
    : undefined;
  if (exact) return { comp: exact, exact: true, overlap: overlapWith(exact) };

  let best: CompMatch | null = null;
  for (const comp of comps) {
    const overlap = overlapWith(comp);
    if (overlap < MIN_OVERLAP) continue;
    if (
      !best ||
      overlap > best.overlap ||
      (overlap === best.overlap && comp.avgPlacement < best.comp.avgPlacement)
    ) {
      best = { comp, exact: false, overlap };
    }
  }
  return best;
}

/** A unit whose win/lose split rests on enough boards to be worth quoting. */
function hasSplit(u: CompUnitRef): boolean {
  return (
    u.winnerRate !== undefined &&
    u.loserRate !== undefined &&
    (u.winnerBoards ?? 0) + (u.loserBoards ?? 0) > 0 &&
    (u.winnerBoards ?? 0) >= MIN_WINNER_SAMPLE &&
    (u.loserBoards ?? 0) >= MIN_LOSER_SAMPLE
  );
}

const lift = (u: CompUnitRef) => (u.winnerRate ?? 0) - (u.loserRate ?? 0);
/** Positive means the boards WITHOUT it placed worse, i.e. the unit helps. */
const gain = (u: CompUnitRef) => (u.avgPlacementWithout ?? 0) - (u.avgPlacementWith ?? 0);
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function findMetaGap(
  board: Board,
  comps: CompReference[],
  context?: Partial<AnalysisContext>
): Finding[] {
  const match = matchComp(board, comps);
  if (!match) return [];

  const { labels, copy } = resolveContext(context);
  const say = copy.metaGap;
  const { comp, exact } = match;
  const findings: Finding[] = [];
  const held = new Set(board.units.map((u) => u.id));
  const winners = comp.winners;
  const losers = comp.losers;

  findings.push({
    id: "metagap-comp",
    module: "metaGap",
    severity: "info",
    title: (exact ? say.compTitleExact : say.compTitleLoose)(
      labels.trait(comp.trait),
      comp.carries.map(labels.champion).join(" / ")
    ),
    // The tier verdict only applies when the board really is that comp. Quoting
    // it on a loose match judges the player for a comp they never played.
    detail: exact
      ? say.compDetailExact(comp.tier, comp.avgPlacement.toFixed(2))
      : say.compDetailLoose(match.overlap),
    evidence: exact ? say.compEvidence(comp.count) : undefined,
  });

  // Only compare against a comp we know the player was building: "missing" is
  // undefined against a comp they never chose.
  if (exact) {
    // What the top-4 boards had and the bottom-4 boards did not.
    const missing = comp.units
      .filter((u) => !held.has(u.id) && hasSplit(u))
      .filter((u) => lift(u) >= MIN_LIFT && gain(u) >= MIN_PLACEMENT_DELTA)
      .sort((a, b) => gain(b) - gain(a) || lift(b) - lift(a))
      .slice(0, MAX_LISTED);

    for (const u of missing) {
      findings.push({
        id: `metagap-missing-${u.id}`,
        module: "metaGap",
        severity: gain(u) >= 1.5 ? "high" : "medium",
        title: say.missingTitle(labels.champion(u.id)),
        detail: say.missingDetail(
          pct(u.winnerRate!),
          pct(u.loserRate!),
          u.avgPlacementWith!.toFixed(1),
          u.avgPlacementWithout!.toFixed(1)
        ),
        evidence: say.splitEvidence(u.winnerBoards!, u.loserBoards!),
      });
    }

    // And what they were carrying that the winners tend to leave out.
    const dragging = comp.units
      .filter((u) => held.has(u.id) && hasSplit(u))
      .filter((u) => -lift(u) >= MIN_LIFT && -gain(u) >= MIN_PLACEMENT_DELTA)
      .sort((a, b) => gain(a) - gain(b))
      .slice(0, MAX_LISTED);

    for (const u of dragging) {
      findings.push({
        id: `metagap-dragging-${u.id}`,
        module: "metaGap",
        severity: "medium",
        title: say.draggingTitle(labels.champion(u.id)),
        detail: say.draggingDetail(
          pct(u.winnerRate!),
          pct(u.loserRate!),
          Math.abs(gain(u)).toFixed(1)
        ),
        evidence: say.splitEvidence(u.winnerBoards!, u.loserBoards!),
      });
    }
  }

  // The items the WINNERS build on this carry, not the average of everyone.
  const carryId = primaryCarry(board);
  const carryRef = comp.units.find((u) => u.id === carryId);
  const myCarry = board.units.find((u) => u.id === carryId);
  if (carryRef && myCarry && comp.carries.includes(carryId)) {
    const pool = carryRef.winnerItems?.length ? carryRef.winnerItems : carryRef.items;
    const base = carryRef.winnerItems?.length ? (carryRef.winnerBoards ?? 0) : carryRef.boards;
    const mine = new Set(myCarry.items);
    const wanted =
      base > 0
        ? pool
            .filter((i) => i.count / base >= SIGNATURE_ITEM && !mine.has(i.id))
            .slice(0, MAX_LISTED)
        : [];
    if (wanted.length > 0) {
      findings.push({
        id: "metagap-items",
        module: "metaGap",
        severity: "medium",
        title: say.itemsTitle(labels.champion(carryId)),
        detail: wanted
          .map((i) => say.itemsUnit(labels.item(i.id), pct(i.count / base)))
          .join(" · "),
        evidence: carryRef.winnerItems?.length
          ? say.itemsEvidence(carryRef.winnerBoards ?? 0)
          : undefined,
      });
    }
  }

  // Level, against the players who actually finished well — and only when both
  // halves rest on enough boards, the same bar every other finding must clear.
  if (
    exact &&
    winners &&
    losers &&
    winners.boards >= MIN_WINNER_SAMPLE &&
    losers.boards >= MIN_LOSER_SAMPLE &&
    winners.avgLevel - board.level >= LEVEL_GAP
  ) {
    findings.push({
      id: "metagap-level",
      module: "metaGap",
      severity: "medium",
      title: say.levelTitle(board.level),
      detail: say.levelDetail(
        winners.avgLevel.toFixed(1),
        losers.boards > 0 ? losers.avgLevel.toFixed(1) : null
      ),
      evidence: say.splitEvidence(winners.boards, losers.boards),
    });
  }

  return findings;
}
