import {
  deadAt,
  objectiveSpots,
  posAt,
  type Replay,
  type ReplayFight,
  type ReplayObjective,
} from "./deadlockReplay";

/**
 * Coaching con las posiciones (2026-11-20): lo que la partida dice de cómo
 * jugó cada uno, segundo a segundo. Nada de esto sale del tablero final; sale
 * de dónde estaba cada jugador y qué hacía.
 *
 * - Muertes sin ayuda: ningún compañero vivo cerca cuando cayó.
 * - Peleas: en cuántas estuvo, a cuántas llegó tarde, cuántas se perdió vivo.
 * - Estructuras perdidas estando lejos: su equipo perdió una y él andaba lejos.
 * - En qué usó el tiempo: peleando, farmeando, moviéndose o muerto.
 */

/** A cuánto (unidades del mapa, 0..1000) tiene que estar un compañero para "estar con vos". */
export const NEAR_ALLY = 150;
/** A cuánto del centro de una pelea hay que llegar para contar como presente. */
export const FIGHT_REACH = 200;
/** Cuántos segundos después del comienzo cuenta como "llegó tarde". */
export const LATE_AFTER = 8;
/** Más lejos que esto de una estructura propia que cae, "no estaba". */
export const FAR_FROM_STRUCTURE = 300;

export interface TimeSplit {
  fighting: number;
  farming: number;
  moving: number;
  dead: number;
}

export interface PlayerCoaching {
  slot: number;
  deaths: number;
  /** Muertes sin un compañero vivo a menos de `NEAR_ALLY`. */
  deathsAlone: number;
  /** Peleas en que estaba vivo al comienzo. */
  fightsAlive: number;
  fightsPresent: number;
  /** De las presentes, a cuántas llegó después de `LATE_AFTER` segundos. */
  fightsLate: number;
  /** Vivo y nunca a menos de `FIGHT_REACH`. */
  fightsMissed: number;
  /** Estructuras propias que cayeron con él vivo y lejos. */
  structuresAway: ReplayObjective[];
  /** Estructuras propias que cayeron con él vivo. */
  structuresAlive: number;
  /** En segundos. */
  time: TimeSplit;
}

/** El centro de una pelea: el promedio de dónde murieron. */
export function fightCenter(f: ReplayFight): [number, number] {
  const n = f.kills.length || 1;
  return [f.kills.reduce((s, k) => s + k.at[0], 0) / n, f.kills.reduce((s, k) => s + k.at[1], 0) / n];
}

export function coachingOf(
  replay: Replay,
  teamOf: (slot: number) => number,
  fights: ReplayFight[],
  duration: number,
): Map<number, PlayerCoaching> {
  const out = new Map<number, PlayerCoaching>();
  const slots = [...replay.tracks.keys()];
  const pos = (s: number, t: number) => posAt(replay.tracks.get(s)!, replay.interval, t);
  const alive = (s: number, t: number) => !deadAt(replay.deaths, s, t);

  for (const slot of slots) {
    const tr = replay.tracks.get(slot)!;
    const team = teamOf(slot);
    const mias = replay.deaths.filter((d) => d.victim === slot);

    // Muertes sin ayuda: en el segundo antes de caer, ningún compañero vivo cerca.
    let deathsAlone = 0;
    for (const d of mias) {
      const t = Math.max(0, d.t - 1);
      const yo = pos(slot, t);
      const acompanado = slots.some(
        (s) => s !== slot && teamOf(s) === team && alive(s, t) && Math.hypot(pos(s, t).x - yo.x, pos(s, t).y - yo.y) <= NEAR_ALLY,
      );
      if (!acompanado) deathsAlone++;
    }

    // Peleas: vivo al comienzo; presente si llegó a menos de FIGHT_REACH.
    let fightsAlive = 0;
    let fightsPresent = 0;
    let fightsLate = 0;
    let fightsMissed = 0;
    for (const f of fights) {
      if (!alive(slot, f.start)) continue;
      fightsAlive++;
      const [cx, cy] = fightCenter(f);
      let llegó: number | null = null;
      for (let t = Math.max(0, f.start - 5); t <= f.end; t += replay.interval) {
        if (!alive(slot, t)) break;
        const q = pos(slot, t);
        if (Math.hypot(q.x - cx, q.y - cy) <= FIGHT_REACH) {
          llegó = t;
          break;
        }
      }
      // También cuenta como presente si murió en la pelea.
      if (llegó === null && f.kills.some((k) => k.victim === slot)) llegó = f.start;
      if (llegó === null) fightsMissed++;
      else {
        fightsPresent++;
        if (llegó > f.start + LATE_AFTER) fightsLate++;
      }
    }

    // Estructuras propias que cayeron con él vivo y lejos.
    const structuresAway: ReplayObjective[] = [];
    let structuresAlive = 0;
    for (const o of replay.objectives) {
      if (o.team !== team || o.id === 0 || !alive(slot, o.t)) continue;
      const spots = objectiveSpots(o);
      if (spots.length === 0) continue;
      structuresAlive++;
      const q = pos(slot, o.t);
      const cerca = spots.some(([x, y]) => Math.hypot(q.x - x, q.y - y) <= FAR_FROM_STRUCTURE);
      if (!cerca) structuresAway.push(o);
    }

    // El tiempo, segundo a segundo.
    const time: TimeSplit = { fighting: 0, farming: 0, moving: 0, dead: 0 };
    const n = Math.min(tr.x.length, Math.floor(duration / replay.interval));
    for (let i = 0; i < n; i++) {
      const t = i * replay.interval;
      if (!alive(slot, t)) time.dead += replay.interval;
      else if (tr.fight[i]) time.fighting += replay.interval;
      else if (tr.farm[i]) time.farming += replay.interval;
      else time.moving += replay.interval;
    }

    out.set(slot, {
      slot,
      deaths: mias.length,
      deathsAlone,
      fightsAlive,
      fightsPresent,
      fightsLate,
      fightsMissed,
      structuresAway,
      structuresAlive,
      time,
    });
  }
  return out;
}

/** El promedio de la partida de un número de coaching, para comparar. */
export function matchAverage(all: Map<number, PlayerCoaching>, pick: (c: PlayerCoaching) => number): number {
  const vs = [...all.values()].map(pick);
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
}
