import type { Board, Finding, Lobby, ModuleId, Severity } from "./types";
import type { CompReference } from "./metaGap";
import { findContested } from "./contested";
import { findMetaGap } from "./metaGap";
import { findMistakes } from "./mistakes";
import { boardOf } from "./normalize";
import { resolveContext, type AnalysisContext } from "./context";

export interface ReportInput {
  lobby: Lobby;
  /** Whose match this is. */
  puuid: string;
  comps: CompReference[];
  /**
   * Display names and the measured figures the report quotes. Anything omitted
   * falls back to the defaults, so a caller can pass just one.
   */
  context?: Partial<AnalysisContext>;
}

export interface Report {
  matchId: string;
  board: Board;
  placement: number;
  findings: Finding[];
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, info: 2 };
/** Ties break toward the finding the player can least easily explain away. */
const MODULE_RANK: Record<ModuleId, number> = { mistakes: 0, metaGap: 1, contested: 2 };
/**
 * Which comp the board was goes first regardless of severity: it is the frame
 * every other finding is stated against. Reading "you were missing Shen" before
 * knowing what you were even playing is backwards.
 */
const LEADS = "metagap-comp";

function bySeverityThenModule(a: Finding, b: Finding): number {
  if (a.id === LEADS) return -1;
  if (b.id === LEADS) return 1;
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    MODULE_RANK[a.module] - MODULE_RANK[b.module] ||
    a.id.localeCompare(b.id)
  );
}

/**
 * The whole report for one player in one match. Returns null when that player
 * was not in the lobby, which happens if a caller pairs the wrong ids.
 *
 * Each module is independent: one throwing or returning nothing never blanks
 * the others.
 */
export function buildReport({
  lobby,
  puuid,
  comps,
  context,
}: ReportInput): Report | null {
  const board = boardOf(lobby, puuid);
  if (!board) return null;

  const ctx = resolveContext(context);

  // Our meta is built from standard lobbies only. Double Up pairs two players
  // and shares their economy; PvE has no opponents at all. Measuring either
  // against a standard-mode comp table produces confident nonsense, so the
  // comparison is withheld and the reason is stated instead.
  const standard = lobby.gameType === "" || lobby.gameType === "standard";
  const findings = standard
    ? [
        ...findMistakes(board, ctx),
        ...findMetaGap(board, comps, ctx),
        ...findContested(board, lobby, ctx),
      ].sort(bySeverityThenModule)
    : [
        {
          id: "mode-not-comparable",
          module: "metaGap" as const,
          severity: "info" as const,
          title:
            lobby.gameType === "pairs"
              ? ctx.copy.report.doubleUpTitle
              : ctx.copy.report.nonStandardTitle,
          detail: ctx.copy.report.modeDetail,
        },
      ];

  return {
    matchId: lobby.matchId,
    board,
    placement: board.placement,
    findings,
  };
}
