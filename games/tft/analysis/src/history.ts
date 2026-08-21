import type { Severity } from "./types";
import { resolveContext, type AnalysisContext } from "./context";

/**
 * What the last N matches say that no single match can.
 *
 * Every other module answers "what happened in this game". These answer "what
 * is wrong with your play" — which needs the whole history, and is the reason a
 * player would come back. A slip that shows up once is variance; the same slip
 * in a third of your games is a habit.
 */

export interface HistoryEntry {
  matchId: string;
  placement: number;
  /** Stable key for the comp — its signature, or the label when unknown. */
  compKey: string;
  /** How the comp reads on screen. */
  compLabel: string;
  /** Ids of the findings that fired for this match. */
  findingIds: string[];
  /**
   * The board itself, for the tags in tags.ts. Optional because the insights
   * here never needed it, and an older caller passing entries without it should
   * keep working rather than break.
   */
  units?: { id: string; name: string; isCarry: boolean; stars: number }[];
}

export interface HistoryInsight {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  evidence?: string;
}

/**
 * Which finding ids count as a habit. The phrasing for each lives in copy.ts;
 * ids absent here are context rather than a mistake, so they can never be
 * reported as one.
 */
const HABIT_IDS = [
  "mistake-gold",
  "mistake-carry-items",
  "metagap-missing",
  "metagap-dragging",
  "metagap-items",
  "metagap-level",
  "contested-comp",
  "contested-carry",
  "contested-crowd",
];

/** Below this many matches nothing is a pattern, it is just a few games. */
const MIN_MATCHES = 6;
/** A habit has to show up this often, in both absolute and relative terms. */
const MIN_OCCURRENCES = 3;
const MIN_SHARE = 0.25;
/** A comp needs this many games before its average says anything about you. */
const MIN_COMP_GAMES = 3;
/** And it has to sit this far from your own average to be worth naming. */
const MIN_COMP_GAP = 0.8;

/** The habit a finding id belongs to, or null when the id is mere context. */
function habitOf(findingId: string): string | null {
  for (const prefix of HABIT_IDS) {
    if (findingId === prefix || findingId.startsWith(`${prefix}-`)) return prefix;
  }
  return null;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export function findHistoryInsights(
  entries: HistoryEntry[],
  context?: Partial<AnalysisContext>
): HistoryInsight[] {
  if (entries.length < MIN_MATCHES) return [];
  const say = resolveContext(context).copy.history;
  const insights: HistoryInsight[] = [];
  const total = entries.length;

  // 1. The slip that keeps coming back. Counted per match, not per finding, so
  //    three separate missing units in one game stay one occurrence.
  const perHabit = new Map<string, number>();
  for (const entry of entries) {
    const habits = new Set(
      entry.findingIds.map(habitOf).filter((h): h is string => h !== null)
    );
    for (const h of habits) perHabit.set(h, (perHabit.get(h) ?? 0) + 1);
  }

  const ranked = [...perHabit.entries()]
    .filter(([, n]) => n >= MIN_OCCURRENCES && n / total >= MIN_SHARE)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (ranked.length > 0) {
    const [habit, count] = ranked[0];
    const runnerUp = ranked[1];
    insights.push({
      id: "history-habit",
      severity: count / total >= 0.4 ? "high" : "medium",
      title: say.habitTitle(say.habits[habit]),
      detail:
        say.habitDetail(count, total) +
        (runnerUp
          ? say.habitRunnerUp(say.habits[runnerUp[0]], runnerUp[1])
          : say.habitNoOther),
      evidence: say.habitEvidence,
    });
  }

  // 2. Which comps work FOR YOU. Not a claim about the meta — the meta can be
  //    right about a comp and it can still be your worst one.
  const byComp = new Map<string, { label: string; places: number[] }>();
  for (const entry of entries) {
    if (!entry.compKey) continue;
    const g = byComp.get(entry.compKey) ?? { label: entry.compLabel, places: [] };
    g.places.push(entry.placement);
    byComp.set(entry.compKey, g);
  }

  const played = [...byComp.values()]
    .filter((g) => g.places.length >= MIN_COMP_GAMES)
    .map((g) => ({ label: g.label, games: g.places.length, avg: mean(g.places) }))
    .sort((a, b) => a.avg - b.avg);

  if (played.length >= 2) {
    const overall = mean(entries.map((e) => e.placement));
    const best = played[0];
    const worst = played[played.length - 1];

    if (worst.avg - overall >= MIN_COMP_GAP) {
      insights.push({
        id: "history-comp-worst",
        severity: "medium",
        title: say.compWorstTitle(worst.label),
        detail: say.compWorstDetail(worst.avg.toFixed(1), worst.games, overall.toFixed(1)),
        evidence: say.compEvidence,
      });
    }

    if (overall - best.avg >= MIN_COMP_GAP) {
      insights.push({
        id: "history-comp-best",
        severity: "info",
        title: say.compBestTitle(best.label),
        detail: say.compBestDetail(best.avg.toFixed(1), best.games, overall.toFixed(1)),
        evidence: say.compEvidence,
      });
    }
  }

  return insights;
}
