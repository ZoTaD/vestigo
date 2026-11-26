import impactModelJson from "@deadlock/impact-model.json";
import type { ParsedMatch } from "./deadlockMatch";
import { curveAt, farmSouls, ledgerTotals, matchImpact, replayFights, type ImpactModel, type MatchImpact, type ReplayFight } from "./deadlockReplay";
import { matchStory, type StoryFact } from "./deadlockMatchStory";
import { coachingOf, type PlayerCoaching } from "./deadlockCoaching";

/**
 * El Impacto de una partida, armado una sola vez y compartido entre "Tu
 * informe" (la columna y tu resumen) y la pestaña Repetición (el panel y el
 * desglose), así los dos muestran los mismos números.
 *
 * El modelo (`impact-model.json`, ~1,6 KB) sale del lake: ver
 * `games/deadlock/pipeline/src/impactModel.ts`.
 */

export const impactModel = impactModelJson as unknown as ImpactModel;

/** Las almas de cada equipo en un segundo, interpolando las muestras de la partida. */
export function teamSoulsAt(match: ParsedMatch, t: number): [number, number] {
  const out: [number, number] = [0, 0];
  for (const p of match.players) {
    const s = [{ t: 0, netWorth: 0 }, ...p.souls];
    let v = s[s.length - 1].netWorth;
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i].t) {
        const f = (t - s[i - 1].t) / Math.max(1, s[i].t - s[i - 1].t);
        v = s[i - 1].netWorth + f * (s[i].netWorth - s[i - 1].netWorth);
        break;
      }
    }
    out[p.team === 0 ? 0 : 1] += v;
  }
  return out;
}

export interface MatchImpactResult extends MatchImpact {
  /** El total de cada jugador, por `slot`. */
  totals: Map<number, number>;
  /** El que más sumó y el que más restó. */
  mvp: number | null;
  sink: number | null;
  /** Las peleas, con la chance antes y después según el modelo. */
  fights: ReplayFight[];
  /** Por qué ganó quien ganó. */
  story: StoryFact[];
  /** Cómo jugó cada uno, por `slot`. */
  coaching: Map<number, PlayerCoaching>;
}

const cache = new WeakMap<ParsedMatch, MatchImpactResult | null>();

/** El impacto de la partida, o `null` si no trae posiciones. */
export function impactOf(match: ParsedMatch): MatchImpactResult | null {
  if (cache.has(match)) return cache.get(match) ?? null;
  const replay = match.replay;
  if (!replay) {
    cache.set(match, null);
    return null;
  }
  const teamOf = (slot: number) => match.players.find((p) => p.slot === slot)?.team ?? 0;
  const farm = new Map(
    match.players.map((p) => [p.slot, p.samples.map((x) => ({ t: Number(x.time_stamp_s ?? 0), v: farmSouls(x) }))]),
  );
  const imp = matchImpact(impactModel, replay, teamOf, match.midBoss, (t) => teamSoulsAt(match, t), match.durationS, farm);
  const totals = ledgerTotals(imp.ledger, replay.tracks.keys());
  const orden = [...totals].sort((a, b) => b[1] - a[1]);
  const chance = (t: number) => curveAt(imp.curve, t);
  const fights = replayFights(replay, teamOf, chance, match.durationS);
  const winner: 0 | 1 = match.winningTeam === 1 ? 1 : 0;
  const story = matchStory({
    winner,
    duration: match.durationS,
    chance,
    fights,
    objectives: replay.objectives,
    midBoss: match.midBoss,
    ledger: imp.ledger,
    totals,
    teamOf,
  });
  const res: MatchImpactResult = {
    ...imp,
    totals,
    mvp: orden.length ? orden[0][0] : null,
    sink: orden.length ? orden[orden.length - 1][0] : null,
    fights,
    story,
    coaching: coachingOf(replay, teamOf, fights, match.durationS),
  };
  cache.set(match, res);
  return res;
}
