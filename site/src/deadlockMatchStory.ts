import type { LedgerEntry, ReplayFight, ReplayObjective } from "./deadlockReplay";

/**
 * Por qué ganó quien ganó, en hechos (2026-11-20). Cada idioma los escribe a
 * su manera (`deadlockMatchTabsCopy.ts`, `story`); acá sólo se eligen.
 *
 * Todo sale de lo que ya calcula el Impacto: la curva de chance, las peleas y
 * el libro de jugadas. Se cuentan como mucho `MAX_FACTS`, de lo más decisivo a
 * lo menos.
 */

export type StoryFact =
  /** La pelea que más movió la partida hacia el ganador. */
  | {
      kind: "turn";
      t: number;
      fight: ReplayFight;
      winner: 0 | 1;
      pts: number;
      /** "flip": venían abajo; "seal": fue en el tramo final; "lead": les dio ventaja. */
      phase: "flip" | "seal" | "lead";
    }
  /** El ganador estuvo abajo del 35 %: remontada. */
  | { kind: "comeback"; team: 0 | 1; low: number; t: number }
  /** El ganador nunca bajó del 45 % desde el minuto 10: la controló. */
  | { kind: "control"; team: 0 | 1 }
  /** Una racha de estructuras perdidas en poco tiempo. */
  | { kind: "collapse"; team: 0 | 1; n: number; from: number; to: number }
  /** El ganador se quedó con el Mid Boss. */
  | { kind: "boss"; team: 0 | 1; t: number; n: number }
  /** El que más sumó del ganador y el que más restó del perdedor. */
  | { kind: "carry"; slot: number; v: number }
  | { kind: "sink"; slot: number; v: number }
  /** El que más perdió farmeando contra los rivales. */
  | { kind: "farm"; slot: number; v: number };

export const MAX_FACTS = 5;

/** Cuántos segundos puede durar una racha de estructuras perdidas. */
const COLLAPSE_WINDOW = 150;

export interface StoryInput {
  winner: 0 | 1;
  duration: number;
  /** Chance de Hidden King en cada segundo. */
  chance: (t: number) => number;
  fights: ReplayFight[];
  objectives: ReplayObjective[];
  midBoss: { t: number; team: number }[];
  ledger: LedgerEntry[];
  totals: Map<number, number>;
  teamOf: (slot: number) => number;
}

/** La chance del equipo `team` (no la de Hidden King). */
const of = (p: number, team: 0 | 1) => (team === 0 ? p : 1 - p);

/** La racha más larga de estructuras perdidas por un equipo dentro de la ventana. */
export function worstCollapse(objectives: ReplayObjective[], team: 0 | 1): { n: number; from: number; to: number } | null {
  const propias = objectives.filter((o) => o.team === team && o.id !== 0).sort((a, b) => a.t - b.t);
  let best: { n: number; from: number; to: number } | null = null;
  for (let i = 0; i < propias.length; i++) {
    let j = i;
    while (j + 1 < propias.length && propias[j + 1].t - propias[i].t <= COLLAPSE_WINDOW) j++;
    const n = j - i + 1;
    if (!best || n > best.n) best = { n, from: propias[i].t, to: propias[j].t };
  }
  return best;
}

export function matchStory(input: StoryInput): StoryFact[] {
  const { winner, duration, chance, fights, objectives, midBoss, totals, ledger, teamOf } = input;
  const loser: 0 | 1 = winner === 0 ? 1 : 0;
  const facts: { f: StoryFact; weight: number }[] = [];

  // El vuelco: la pelea con más puntos a favor del ganador.
  let turn: { fight: ReplayFight; pts: number } | null = null;
  for (const f of fights) {
    const pts = (of(f.after, winner) - of(f.before, winner)) * 100;
    // Sólo cuenta una pelea que ganó de verdad (perdió menos que el otro).
    if (f.winner !== winner) continue;
    if (pts > 0 && (!turn || pts > turn.pts)) turn = { fight: f, pts };
  }
  if (turn && turn.pts >= 5) facts.push({
      f: {
        kind: "turn",
        t: turn.fight.start,
        fight: turn.fight,
        winner,
        pts: Math.round(turn.pts),
        phase: of(turn.fight.before, winner) < 0.5 ? "flip" : turn.fight.start > duration * 0.6 ? "seal" : "lead",
      },
      weight: 100 + turn.pts,
    });

  // Remontada o control: el piso del ganador desde el minuto 10.
  let low = 1;
  let lowT = 0;
  for (let t = 600; t <= duration; t += 5) {
    const p = of(chance(t), winner);
    if (p < low) {
      low = p;
      lowT = t;
    }
  }
  if (low < 0.35) facts.push({ f: { kind: "comeback", team: winner, low, t: lowT }, weight: 120 });
  else if (low >= 0.45 && duration > 900) facts.push({ f: { kind: "control", team: winner }, weight: 60 });

  // El derrumbe del perdedor.
  const c = worstCollapse(objectives, loser);
  if (c && c.n >= 3) facts.push({ f: { kind: "collapse", team: loser, ...c }, weight: 70 + c.n * 5 });

  // El Mid Boss del ganador.
  const jefes = midBoss.filter((b) => b.team === winner);
  if (jefes.length > 0 && jefes.length >= midBoss.filter((b) => b.team === loser).length + 1)
    facts.push({ f: { kind: "boss", team: winner, t: jefes[0].t, n: jefes.length }, weight: 50 });

  // Quién la ganó y quién la hundió.
  const ganadores = [...totals].filter(([s]) => teamOf(s) === winner).sort((a, b) => b[1] - a[1]);
  const perdedores = [...totals].filter(([s]) => teamOf(s) === loser).sort((a, b) => a[1] - b[1]);
  if (ganadores[0] && ganadores[0][1] > 0) facts.push({ f: { kind: "carry", slot: ganadores[0][0], v: ganadores[0][1] }, weight: 80 });
  if (perdedores[0] && perdedores[0][1] < 0) facts.push({ f: { kind: "sink", slot: perdedores[0][0], v: perdedores[0][1] }, weight: 75 });

  // El que quedó más atrás farmeando, si fue mucho.
  const farm = new Map<number, number>();
  for (const e of ledger) if (e.kind === "farm") farm.set(e.slot, (farm.get(e.slot) ?? 0) + e.value);
  const peorFarm = [...farm].filter(([s]) => teamOf(s) === loser).sort((a, b) => a[1] - b[1])[0];
  if (peorFarm && peorFarm[1] <= -5) facts.push({ f: { kind: "farm", slot: peorFarm[0], v: peorFarm[1] }, weight: 40 });

  return facts
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_FACTS)
    .map((x) => x.f);
}
