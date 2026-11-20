/**
 * La repetición 2D de una partida (2026-11-20).
 *
 * Sale de la misma metadata que el informe: `match_paths` trae la posición de
 * cada jugador **cada segundo**, con su vida en % y si está peleando, y
 * `death_details` dónde murió cada uno y desde dónde le pegaron. No hace falta
 * bajar la demo: alcanza para mover los héroes sobre el mapa, marcar las
 * muertes y armar las peleas.
 *
 * Todo se pasa al encuadre del relieve de la pestaña Mapa (`map.json`): el
 * mundo va de −10.752 a 10.752 en los dos ejes y el mapa de 0 a 1000, con la
 * base de Archmother arriba (y del mundo crece hacia arriba, la del dibujo
 * hacia abajo).
 */

export const BOUND = 10752;

/** Una posición del mundo en el encuadre del mapa, de 0 a 1000. */
export function toMap(x: number, y: number): [number, number] {
  return [((x + BOUND) / (2 * BOUND)) * 1000, ((BOUND - y) / (2 * BOUND)) * 1000];
}

export interface ReplayTrack {
  slot: number;
  /** Posición en el encuadre del mapa (0..1000), una por muestra. */
  x: Float32Array;
  y: Float32Array;
  /** Vida en % (0..100). */
  hp: Uint8Array;
  /** 1 si en ese segundo estaba peleando contra héroes. */
  fight: Uint8Array;
  /** 1 si en ese segundo estaba farmeando (creeps de línea o jungla). */
  farm: Uint8Array;
}

export interface ReplayDeath {
  t: number;
  victim: number;
  /** `slot` de quien mató; 0 si no hubo (una torre, la caída). */
  killer: number;
  at: [number, number];
  from: [number, number] | null;
  /** Cuánto tardó en revivir. */
  dur: number;
}

export interface ReplayObjective {
  t: number;
  /** El equipo **dueño** de la estructura que cayó. */
  team: number;
  id: number;
}

export interface Replay {
  /** Segundos entre muestras (hoy 1). */
  interval: number;
  tracks: Map<number, ReplayTrack>;
  deaths: ReplayDeath[];
  objectives: ReplayObjective[];
}

export interface RawPath {
  player_slot: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  x_pos: number[];
  y_pos: number[];
  health?: number[];
  combat_type?: number[];
}

export interface RawReplayInfo {
  match_paths?: { interval_s?: number; x_resolution?: number; y_resolution?: number; paths?: RawPath[] };
  objectives?: { destroyed_time_s?: number; team?: number; team_objective_id?: number }[];
  players: {
    player_slot: number;
    death_details?: {
      game_time_s: number;
      killer_player_slot?: number;
      death_pos?: { x: number; y: number };
      killer_pos?: { x: number; y: number };
      death_duration_s?: number;
    }[];
  }[];
}

/**
 * `combat_type` vale 0 fuera de pelea; 1 se junta en los segundos antes de
 * cada kill (contra héroes); 2 y 3 caen con creeps y jungla. Sólo cuenta el 1.
 */
const COMBAT_HEROES = 1;

/** Arma la repetición. `null` si la partida no trae posiciones (las viejas o las cortadas). */
export function parseReplay(mi: RawReplayInfo): Replay | null {
  const mp = mi.match_paths;
  const paths = mp?.paths ?? [];
  if (paths.length === 0) return null;
  const rx = mp?.x_resolution || 16383;
  const ry = mp?.y_resolution || 16383;
  const tracks = new Map<number, ReplayTrack>();
  for (const p of paths) {
    const n = Math.min(p.x_pos?.length ?? 0, p.y_pos?.length ?? 0);
    if (n === 0) continue;
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const hp = new Uint8Array(n);
    const fight = new Uint8Array(n);
    const farm = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const wx = p.x_min + (p.x_pos[i] / rx) * (p.x_max - p.x_min);
      const wy = p.y_min + (p.y_pos[i] / ry) * (p.y_max - p.y_min);
      const [mx, my] = toMap(wx, wy);
      x[i] = mx;
      y[i] = my;
      hp[i] = Math.max(0, Math.min(100, p.health?.[i] ?? 100));
      fight[i] = p.combat_type?.[i] === COMBAT_HEROES ? 1 : 0;
      farm[i] = p.combat_type?.[i] === 2 || p.combat_type?.[i] === 3 ? 1 : 0;
    }
    tracks.set(p.player_slot, { slot: p.player_slot, x, y, hp, fight, farm });
  }
  if (tracks.size === 0) return null;

  const deaths: ReplayDeath[] = [];
  for (const p of mi.players) {
    for (const d of p.death_details ?? []) {
      if (!(d.game_time_s >= 0 && d.game_time_s <= 21_600) || !d.death_pos) continue;
      deaths.push({
        t: d.game_time_s,
        victim: p.player_slot,
        killer: d.killer_player_slot ?? 0,
        at: toMap(d.death_pos.x, d.death_pos.y),
        from: d.killer_pos ? toMap(d.killer_pos.x, d.killer_pos.y) : null,
        dur: d.death_duration_s ?? 15,
      });
    }
  }
  deaths.sort((a, b) => a.t - b.t);

  const objectives = (mi.objectives ?? [])
    .filter((o) => (o.destroyed_time_s ?? 0) > 0)
    .map((o) => ({ t: o.destroyed_time_s ?? 0, team: o.team ?? 0, id: o.team_objective_id ?? -1 }))
    .sort((a, b) => a.t - b.t);

  return { interval: mp?.interval_s || 1, tracks, deaths, objectives };
}

export interface Pos {
  x: number;
  y: number;
  hp: number;
  fighting: boolean;
}

/** Dónde estaba un jugador en el segundo `t`, interpolando entre muestras. */
export function posAt(track: ReplayTrack, interval: number, t: number): Pos {
  const n = track.x.length;
  const f = Math.min(n - 1, Math.max(0, t / interval));
  const i = Math.floor(f);
  const j = Math.min(n - 1, i + 1);
  const k = f - i;
  // Un salto grande entre dos muestras es un teletransporte (revivir, la base):
  // no se dibuja el viaje.
  const jump = Math.abs(track.x[j] - track.x[i]) + Math.abs(track.y[j] - track.y[i]) > 60;
  return {
    x: jump ? track.x[k < 0.5 ? i : j] : track.x[i] + (track.x[j] - track.x[i]) * k,
    y: jump ? track.y[k < 0.5 ? i : j] : track.y[i] + (track.y[j] - track.y[i]) * k,
    hp: track.hp[i],
    fighting: track.fight[i] === 1,
  };
}

/** La muerte en curso de un jugador en `t`, o `null` si estaba vivo. */
export function deadAt(deaths: ReplayDeath[], slot: number, t: number): ReplayDeath | null {
  for (const d of deaths) if (d.victim === slot && t >= d.t && t < d.t + d.dur) return d;
  return null;
}

/* ── Peleas ──────────────────────────────────────────────────────────────── */

export interface ReplayFight {
  start: number;
  end: number;
  kills: ReplayDeath[];
  /** Muertes de cada equipo: `[Hidden King, Archmother]`. */
  deaths: [number, number];
  /** El equipo que perdió menos, o `null` si fue parejo. */
  winner: 0 | 1 | null;
  /** Chance de Hidden King 10 s antes y un minuto después. */
  before: number;
  after: number;
  /** El encuadre del mapa que abarca la pelea, `[x0, y0, x1, y1]`. */
  view: [number, number, number, number];
}

/**
 * Las peleas: muertes a menos de `gap` segundos una de otra, desde dos. Igual
 * que `fightsOf` de la chance de ganar, pero con dónde fue y su encuadre.
 */
export function replayFights(
  replay: Replay,
  teamOf: (slot: number) => number,
  chance: (t: number) => number,
  duration: number,
  gap = 25,
): ReplayFight[] {
  const groups: ReplayDeath[][] = [];
  for (const d of replay.deaths) {
    const g = groups[groups.length - 1];
    if (g && d.t - g[g.length - 1].t <= gap) g.push(d);
    else groups.push([d]);
  }
  return groups
    .filter((g) => g.length >= 2)
    .map((kills) => {
      const deaths: [number, number] = [0, 0];
      for (const k of kills) deaths[teamOf(k.victim) === 0 ? 0 : 1]++;
      const start = kills[0].t;
      const end = kills[kills.length - 1].t;
      return {
        start,
        end,
        kills,
        deaths,
        winner: deaths[0] === deaths[1] ? null : deaths[0] < deaths[1] ? 0 : 1,
        before: chance(Math.max(0, start - 10)),
        after: chance(Math.min(duration, end + 60)),
        view: fightView(kills),
      };
    });
}

/** Un encuadre 4:3 que abarca las muertes y desde dónde las hicieron, con margen. */
export function fightView(kills: ReplayDeath[]): [number, number, number, number] {
  const pts = kills.flatMap((k) => (k.from ? [k.at, k.from] : [k.at]));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const w = Math.max(260, x1 - x0 + 160, ((y1 - y0 + 160) * 4) / 3);
  const h = (w * 3) / 4;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

/** El tipo de estructura, para los textos. */
export function objectiveKind(id: number): "patron" | "shrine" | "walker" | "baseGuardian" | "guardian" {
  if (id === 0 || id === 9) return "patron";
  if (id === 10 || id === 11) return "shrine";
  if (id >= 5 && id <= 8) return "walker";
  if (id >= 12 && id <= 15) return "baseGuardian";
  return "guardian";
}

/* ── El modelo de chance ─────────────────────────────────────────────────── */

/**
 * Los coeficientes que ajusta `games/deadlock/pipeline/src/impactModel.ts` con
 * partidas rankeadas del lake: una logística por minuto sobre las diferencias
 * (del lado de Hidden King) de almas, kills, guardianes, caminantes,
 * santuarios, guardianes de base y Mid Boss. `coef` es el modelo entero (la
 * curva). `play` es lo que corre la chance (en log-odds) cada jugada, en el
 * orden kill, guardián, caminante, santuario, guardián de base, Mid Boss: se
 * mide descontando cómo venía la partida antes, con las almas que trae la
 * jugada incluidas.
 */
export interface ImpactModel {
  features: readonly string[];
  minutes: { minute: number; coef: number[]; play: number[] }[];
}

/** Las variables sin las almas, en el orden del modelo a partir del índice 1. */
export const PLAY = { kill: 1, guardian: 2, walker: 3, shrine: 4, baseGuardian: 5, boss: 6 } as const;
export type PlayKind = keyof typeof PLAY;

/** Los coeficientes en el segundo `t`, interpolando entre los minutos medidos. */
export function coefAt(model: ImpactModel, t: number, key: "coef" | "play"): number[] {
  const ms = model.minutes;
  if (ms.length === 0) return [];
  const m = t / 60;
  if (m <= ms[0].minute) return ms[0][key];
  const last = ms[ms.length - 1];
  if (m >= last.minute) return last[key];
  for (let i = 1; i < ms.length; i++) {
    if (m <= ms[i].minute) {
      const f = (m - ms[i - 1].minute) / (ms[i].minute - ms[i - 1].minute);
      return ms[i][key].map((_, j) => ms[i - 1][key][j] + f * (ms[i][key][j] - ms[i - 1][key][j]));
    }
  }
  return last[key];
}

/** El tipo de jugada de una estructura; `null` para el Patrón (cierra la partida). */
export function objectivePlay(id: number): PlayKind | null {
  if (id >= 1 && id <= 4) return "guardian";
  if (id >= 5 && id <= 8) return "walker";
  if (id === 10 || id === 11) return "shrine";
  if (id >= 12 && id <= 15) return "baseGuardian";
  return null;
}

/**
 * Cómo iba la partida justo antes del segundo `t`, del lado de Hidden King:
 * `[0, kills, guardianes, caminantes, santuarios, guardianes de base, Mid Boss]`
 * (el 0 es el lugar de las almas, que se llena aparte).
 */
export function stateAt(
  replay: Replay,
  teamOf: (slot: number) => number,
  midBoss: { t: number; team: number }[],
  t: number,
): number[] {
  const x = [0, 0, 0, 0, 0, 0, 0];
  for (const d of replay.deaths) if (d.t < t) x[PLAY.kill] += teamOf(d.victim) === 1 ? 1 : -1;
  for (const o of replay.objectives) {
    const k = objectivePlay(o.id);
    if (k && o.t < t) x[PLAY[k]] += o.team === 1 ? 1 : -1;
  }
  for (const b of midBoss) if (b.t < t && (b.team === 0 || b.team === 1)) x[PLAY.boss] += b.team === 0 ? 1 : -1;
  x[PLAY.kill] = Math.max(-15, Math.min(15, x[PLAY.kill]));
  return x;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);

/** La chance de Hidden King con el modelo entero, dadas las almas de cada equipo. */
export function modelChance(model: ImpactModel, state: number[], souls: [number, number], t: number): number {
  const mean = (souls[0] + souls[1]) / 2;
  const x = state.slice();
  x[0] = mean > 0 ? (souls[0] - souls[1]) / mean : 0;
  return sigmoid(dot(coefAt(model, t, "coef"), x));
}

/**
 * Cuánto vale una jugada para el equipo que la hace, en puntos de chance
 * (0..100): cuánto corre la chance de ese momento (`pBefore`, la de Hidden
 * King justo antes) el coeficiente de la jugada. Con la partida pareja una
 * kill al minuto 10 vale ~2,7; con un equipo al 95 % casi no mueve nada.
 */
export function playPts(model: ImpactModel, pBefore: number, t: number, kind: PlayKind, team: number): number {
  const b = coefAt(model, t, "play")[PLAY[kind] - 1] ?? 0;
  const p = Math.min(0.999, Math.max(0.001, pBefore));
  const logit = Math.log(p / (1 - p));
  const after = sigmoid(logit + (team === 0 ? b : -b));
  return Math.abs(after - p) * 100;
}

/* ── Libro del impacto ───────────────────────────────────────────────────── */

/**
 * Asistencias por cercanía. La API sólo dice quién dio el último golpe; cuenta
 * como asistencia todo compañero del que mató que estuvo a menos de `radius`
 * (en unidades del mapa, 0..1000) de la víctima en los `window` segundos antes
 * de la muerte. Calibrado el 2026-11-20 contra las asistencias que la API da
 * por jugador en 6 partidas: 120 y 6 s infieren 916 donde hubo 915, con 1,5 de
 * error medio por jugador (sobre ~13 asistencias cada uno). Exigir que el
 * compañero estuviera "peleando" daba peor.
 */
export const ASSIST_RADIUS = 120;
export const ASSIST_WINDOW = 6;

export function assistsOf(
  replay: Replay,
  d: ReplayDeath,
  teamOf: (slot: number) => number,
  radius = ASSIST_RADIUS,
  window = ASSIST_WINDOW,
): number[] {
  if (!d.killer) return [];
  const victim = replay.tracks.get(d.victim);
  if (!victim) return [];
  const vt = teamOf(d.victim);
  const out: number[] = [];
  for (const [slot, tr] of replay.tracks) {
    if (slot === d.killer || slot === d.victim || teamOf(slot) === vt) continue;
    for (let t = Math.max(0, d.t - window); t <= d.t; t += replay.interval) {
      if (deadAt(replay.deaths, slot, t)) continue;
      const a = posAt(tr, replay.interval, t);
      const v = posAt(victim, replay.interval, t);
      if (Math.hypot(a.x - v.x, a.y - v.y) <= radius) {
        out.push(slot);
        break;
      }
    }
  }
  return out;
}

export type LedgerKind = "kill" | "assist" | "death" | "objective" | "objectiveLost" | "boss" | "bossLost" | "farm";

/** Una línea del libro: quién, cuándo, por qué y cuánto. */
export interface LedgerEntry {
  t: number;
  slot: number;
  kind: LedgerKind;
  /** Puntos de chance de ganar (0..100) que sumó (+) o restó (−). */
  value: number;
  death?: ReplayDeath;
  objective?: ReplayObjective;
}

/** Del valor de una kill, la parte de quien la hizo cuando hubo asistencias. */
export const KILLER_SHARE = 0.5;
/** A cuánto de una estructura (o del Mid Boss) hay que estar para llevarse crédito. */
export const OBJECTIVE_RADIUS = 150;
/** Cuántos segundos antes de que caiga se mira quién estaba cerca. */
export const OBJECTIVE_WINDOW = 8;

export interface LedgerOptions {
  deathPts: (d: ReplayDeath) => number;
  objectivePts: (o: ReplayObjective) => number;
  /** Dónde pueden estar las estructuras de ese tipo y dueño (0..1000). Vacío si no se sabe. */
  objectiveSpots?: (o: ReplayObjective) => [number, number][];
  midBoss?: { t: number; team: number }[];
  bossPts?: (b: { t: number; team: number }) => number;
  bossSpot?: [number, number];
}

/** Quiénes del equipo `team` estuvieron a menos de `radius` de `spot` en la ventana. */
function nearSpot(replay: Replay, slots: number[], spot: [number, number], t: number, radius = OBJECTIVE_RADIUS): number[] {
  return slots.filter((s) => {
    const tr = replay.tracks.get(s);
    if (!tr) return false;
    for (let k = Math.max(0, t - OBJECTIVE_WINDOW); k <= t; k += replay.interval) {
      if (deadAt(replay.deaths, s, k)) continue;
      const q = posAt(tr, replay.interval, k);
      if (Math.hypot(q.x - spot[0], q.y - spot[1]) <= radius) return true;
    }
    return false;
  });
}

/**
 * Quiénes se llevan el crédito de algo que pasó en un lugar: los que estuvieron
 * cerca de alguno de los lugares posibles (el más cercano a alguno de ellos);
 * si no se sabe dónde fue, el grupo más grande de vivos que andaba junto; y si
 * nadie estaba, todos los vivos (lo empujaron los creeps).
 */
function participants(replay: Replay, slots: number[], t: number, spots: [number, number][]): number[] {
  const vivos = slots.filter((s) => replay.tracks.has(s) && !deadAt(replay.deaths, s, t));
  if (vivos.length === 0) return [];
  if (spots.length > 0) {
    let best: number[] = [];
    for (const spot of spots) {
      const near = nearSpot(replay, vivos, spot, t);
      if (near.length > best.length) best = near;
    }
    if (best.length > 0) return best;
  } else {
    const pos = vivos.map((s) => ({ s, q: posAt(replay.tracks.get(s)!, replay.interval, t) }));
    let best: number[] = [];
    for (const a of pos) {
      const grupo = pos.filter((b) => Math.hypot(a.q.x - b.q.x, a.q.y - b.q.y) <= OBJECTIVE_RADIUS).map((b) => b.s);
      if (grupo.length > best.length) best = grupo;
    }
    if (best.length > 1) return best;
  }
  return vivos;
}

/**
 * El libro del impacto de la partida.
 *
 * - Cada muerte vale `deathPts(d)` puntos de chance: los pierde la víctima y
 *   los gana el equipo que mató, la mitad para quien dio el golpe y la otra
 *   mitad repartida entre las asistencias (todo para él si no hubo).
 * - Cada estructura vale `objectivePts(o)` y se reparte entre los rivales que
 *   estaban cerca (ver `participants`); los seis dueños pierden lo mismo.
 * - Cada Mid Boss vale `bossPts(b)` para los del equipo que se lo quedó y
 *   estaban en el medio; los seis del otro equipo pierden lo mismo.
 *
 * Toda jugada suma a un lado lo que resta al otro: el total de los dos equipos
 * da cero y el del ganador suele ser positivo.
 */
export function impactLedger(replay: Replay, teamOf: (slot: number) => number, opts: LedgerOptions): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  const slots = [...replay.tracks.keys()];
  for (const d of replay.deaths) {
    const v = opts.deathPts(d);
    out.push({ t: d.t, slot: d.victim, kind: "death", value: -v, death: d });
    if (!d.killer || !replay.tracks.has(d.killer)) continue;
    const helpers = assistsOf(replay, d, teamOf);
    const own = helpers.length ? v * KILLER_SHARE : v;
    out.push({ t: d.t, slot: d.killer, kind: "kill", value: own, death: d });
    for (const s of helpers) out.push({ t: d.t, slot: s, kind: "assist", value: (v - own) / helpers.length, death: d });
  }
  for (const o of replay.objectives) {
    const v = opts.objectivePts(o);
    if (v <= 0) continue;
    // El Patrón es el empuje final de todo el equipo: va para todos los vivos.
    const atacantes = slots.filter((s) => teamOf(s) !== o.team);
    const quienes =
      o.id === 9 || o.id === 0
        ? atacantes.filter((s) => !deadAt(replay.deaths, s, o.t))
        : participants(replay, atacantes, o.t, opts.objectiveSpots?.(o) ?? []);
    for (const s of quienes) out.push({ t: o.t, slot: s, kind: "objective", value: v / quienes.length, objective: o });
    // Lo que gana uno lo pierde el otro: la estructura era de los seis.
    const duenos = slots.filter((s) => teamOf(s) === o.team);
    for (const s of duenos) out.push({ t: o.t, slot: s, kind: "objectiveLost", value: -v / duenos.length, objective: o });
  }
  for (const b of opts.midBoss ?? []) {
    if (b.team !== 0 && b.team !== 1) continue;
    const v = opts.bossPts?.(b) ?? 0;
    if (v <= 0) continue;
    const quienes = participants(
      replay,
      slots.filter((s) => teamOf(s) === b.team),
      b.t,
      opts.bossSpot ? [opts.bossSpot] : [],
    );
    for (const s of quienes) out.push({ t: b.t, slot: s, kind: "boss", value: v / quienes.length });
    const rivales = slots.filter((s) => teamOf(s) !== b.team);
    for (const s of rivales) out.push({ t: b.t, slot: s, kind: "bossLost", value: -v / rivales.length });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** El total de cada jugador, redondeado a un decimal. */
export function ledgerTotals(ledger: LedgerEntry[], slots: Iterable<number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of slots) out.set(s, 0);
  for (const e of ledger) if (out.has(e.slot)) out.set(e.slot, (out.get(e.slot) ?? 0) + e.value);
  for (const [k, v] of out) out.set(k, Math.round(v * 10) / 10);
  return out;
}

/* ── Todo junto para una partida ─────────────────────────────────────────── */

/**
 * Dónde está cada estructura, en el encuadre del mapa (0..1000), por equipo
 * dueño (0 = Hidden King, abajo). Copiado de `games/deadlock/data/map.json`
 * (`points`, código de equipo 2 = Hidden King, 3 = Archmother) para no traer
 * sus 68 KB a la ficha; un test chequea que sigan iguales. Los guardianes de
 * línea no están en el mapa: para ésos manda el grupo más grande de atacantes.
 */
export type StructureKind = "guardian" | "walker" | "baseGuardian" | "shrine" | "patron";

/**
 * `[x, y, equipo, carril]`. El carril es el de la API (1 izquierda, 3 medio,
 * 4 derecha; el 2 no se usa) y 0 donde no aplica. Los guardianes de línea no
 * están en `map.json`: salen de dónde estaban los atacantes cuando cayeron, en
 * 6 partidas reales (2026-11-20), corrido el sesgo hacia el lado de los
 * atacantes (~15 unidades, medido con los caminantes, que sí están) y
 * promediado con el lado opuesto, porque el mapa es simétrico girado 180°.
 */
export const STRUCTURE_SPOTS: Record<StructureKind, [number, number, number, number][]> = {
  guardian: [[140, 566, 0, 1], [499, 568, 0, 3], [826, 586, 0, 4], [174, 414, 1, 1], [501, 432, 1, 3], [860, 434, 1, 4]],
  walker: [[208, 720, 0, 1], [248, 266, 1, 1], [440, 662, 0, 3], [560, 339, 1, 3], [762, 735, 0, 4], [800, 278, 1, 4]],
  baseGuardian: [
    [359, 797, 0, 1], [359, 814, 0, 1], [431, 754, 0, 3], [450, 754, 0, 3], [478, 184, 1, 1], [478, 203, 1, 1],
    [522, 797, 0, 4], [522, 814, 0, 4], [550, 246, 1, 3], [570, 246, 1, 3], [641, 184, 1, 4], [641, 203, 1, 4],
  ],
  shrine: [[367, 850, 0, 0], [488, 150, 1, 0], [514, 850, 0, 0], [631, 150, 1, 0]],
  patron: [[441, 874, 0, 0], [560, 126, 1, 0]],
};

/** El carril de un objetivo de la API (`Tier1Lane3` → 3), o 0 si no tiene. */
export function laneOf(id: number): number {
  if (id >= 1 && id <= 8) return ((id - 1) % 4) + 1;
  if (id >= 12 && id <= 15) return id - 11;
  return 0;
}

/** El tipo de estructura que se dibuja para un objetivo, o `null`. */
export function structureKindOf(id: number): StructureKind | null {
  const play = objectivePlay(id);
  if (play && play !== "kill" && play !== "boss") return play;
  return id === 9 || id === 0 ? "patron" : null;
}
/** El Mid Boss, en el centro del mapa (`map.json`, `camps`). */
export const MIDBOSS_SPOT: [number, number] = [500, 500];

/** Los lugares posibles de una estructura que cayó: los de su carril si lo tiene. */
export function objectiveSpots(o: ReplayObjective): [number, number][] {
  const kind = structureKindOf(o.id);
  if (!kind) return [];
  const lane = laneOf(o.id);
  return STRUCTURE_SPOTS[kind].filter((s) => s[2] === o.team && (lane === 0 || s[3] === lane)).map((s) => [s[0], s[1]]);
}

export interface MatchImpact {
  ledger: LedgerEntry[];
  /** La chance de Hidden King con el modelo entero: salta con cada kill y estructura. */
  curve: { t: number; p: number }[];
  deathPts: Map<ReplayDeath, number>;
  objectivePts: Map<ReplayObjective, number>;
  bossPts: Map<{ t: number; team: number }, number>;
}

/** La chance en un segundo, interpolando una curva de `matchImpact`. */
export function curveAt(curve: { t: number; p: number }[], t: number): number {
  if (curve.length === 0) return 0.5;
  if (t <= curve[0].t) return curve[0].p;
  let lo = 0;
  let hi = curve.length - 1;
  if (t >= curve[hi].t) return curve[hi].p;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (curve[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = curve[lo];
  const b = curve[hi];
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
  return a.p + f * (b.p - a.p);
}

/**
 * La curva, el valor de cada jugada y el libro del impacto de una partida.
 * `souls(t)` da las almas de cada equipo en un segundo (las muestras de la
 * partida, interpoladas).
 */
export function matchImpact(
  model: ImpactModel,
  replay: Replay,
  teamOf: (slot: number) => number,
  midBoss: { t: number; team: number }[],
  souls: (t: number) => [number, number],
  duration: number,
  farm?: Map<number, { t: number; v: number }[]>,
): MatchImpact {
  // La curva: cada 5 s y, en cada jugada, un punto justo antes y otro justo
  // después, para que el salto se vea en el segundo en que pasó.
  const marks = new Set<number>();
  for (let t = 0; t <= duration; t += 5) marks.add(t);
  marks.add(duration);
  const events = [...replay.deaths.map((d) => d.t), ...replay.objectives.map((o) => o.t), ...midBoss.map((b) => b.t)];
  for (const t of events) {
    if (t <= 0 || t >= duration) continue;
    marks.add(t - 0.01);
    marks.add(t + 0.01);
  }
  const curve = [...marks]
    .sort((a, b) => a - b)
    .map((t) => ({ t, p: modelChance(model, stateAt(replay, teamOf, midBoss, t), souls(t), t) }));

  const deathPts = new Map<ReplayDeath, number>();
  for (const d of replay.deaths) {
    deathPts.set(d, playPts(model, curveAt(curve, d.t - 0.01), d.t, "kill", teamOf(d.victim) === 0 ? 1 : 0));
  }
  const objectivePts = new Map<ReplayObjective, number>();
  for (const o of replay.objectives) {
    const play = objectivePlay(o.id);
    const by = o.team === 0 ? 1 : 0;
    let v = 0;
    if (play) v = playPts(model, curveAt(curve, o.t - 0.01), o.t, play, by);
    else if (o.id === 9) {
      // El Patrón cierra la partida: vale lo que le faltaba al que lo rompió para ganar.
      const p = curveAt(curve, o.t - 1);
      v = (by === 0 ? 1 - p : p) * 100;
    }
    objectivePts.set(o, v);
  }
  const bossPts = new Map<{ t: number; team: number }, number>();
  for (const b of midBoss) {
    if (b.team !== 0 && b.team !== 1) continue;
    bossPts.set(b, playPts(model, curveAt(curve, b.t - 0.01), b.t, "boss", b.team));
  }
  const ledger = impactLedger(replay, teamOf, {
    deathPts: (d) => deathPts.get(d) ?? 0,
    objectivePts: (o) => objectivePts.get(o) ?? 0,
    objectiveSpots,
    midBoss,
    bossPts: (b) => bossPts.get(b) ?? 0,
    bossSpot: MIDBOSS_SPOT,
  });
  if (farm) ledger.push(...farmLedger(model, curve, teamOf, souls, farm));
  ledger.sort((a, b) => a.t - b.t);
  return { ledger, curve, deathPts, objectivePts, bossPts };
}

/**
 * El farmeo: las almas de creeps, jungla, orbes y tesoros (las de kills y
 * estructuras ya están en sus jugadas). En cada tramo entre dos muestras, cada
 * jugador suma o resta según lo que farmeó contra el promedio de los rivales,
 * pasado a puntos de chance con el peso de las almas del modelo en ese minuto:
 * 100 · p(1−p) · β_almas · (propias − promedio rival) / almas medias por equipo.
 * Sumado sobre un equipo da la diferencia de farmeo entre los dos, así que el
 * total de la partida sigue dando cero.
 */
export function farmLedger(
  model: ImpactModel,
  curve: { t: number; p: number }[],
  teamOf: (slot: number) => number,
  souls: (t: number) => [number, number],
  farm: Map<number, { t: number; v: number }[]>,
): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  const series = [...farm.entries()];
  if (series.length === 0) return out;
  const times = series[0][1].map((x) => x.t);
  const at = (slot: number, t: number) => farm.get(slot)?.find((x) => x.t === t)?.v ?? 0;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const tp = i === 0 ? 0 : times[i - 1];
    const gained = new Map(series.map(([slot]) => [slot, at(slot, t) - (i === 0 ? 0 : at(slot, tp))]));
    const [a, b] = souls(t);
    const mean = (a + b) / 2;
    if (mean <= 0) continue;
    const p = curveAt(curve, (t + tp) / 2);
    const beta = coefAt(model, t, "coef")[0] ?? 0;
    const k = (100 * p * (1 - p) * beta) / mean;
    for (const [slot, f] of gained) {
      const rivales = [...gained].filter(([s]) => teamOf(s) !== teamOf(slot)).map(([, v]) => v);
      if (rivales.length === 0) continue;
      const prom = rivales.reduce((x, y) => x + y, 0) / rivales.length;
      out.push({ t, slot, kind: "farm", value: k * (f - prom) });
    }
  }
  return out;
}

/** Las almas de farmeo acumuladas de una muestra de `stats`. */
export function farmSouls(sample: Record<string, number>): number {
  return (
    Number(sample.gold_lane_creep ?? 0) +
    Number(sample.gold_neutral_creep ?? 0) +
    Number(sample.gold_lane_creep_orbs ?? 0) +
    Number(sample.gold_neutral_creep_orbs ?? 0) +
    Number(sample.gold_treasure ?? 0)
  );
}

/* ── Estructuras sobre el mapa ───────────────────────────────────────────── */

export interface StructureMark {
  kind: StructureKind;
  x: number;
  y: number;
  /** Equipo dueño. */
  team: number;
  /** Carril (1, 3, 4) o 0. */
  lane: number;
  /** Cuándo cayó, o `null` si sigue en pie al final. */
  fell: number | null;
}

/**
 * Las estructuras que se pueden dibujar (las de `STRUCTURE_SPOTS`) con cuándo
 * cayó cada una. La API dice el tipo y el dueño, no el carril: cada una se
 * asigna al lugar de ese tipo más cerca de los atacantes cuando cayó, sin
 * repetir lugar. Los guardianes de línea no tienen lugar conocido y no van.
 */
export function structureMarks(replay: Replay, teamOf: (slot: number) => number): StructureMark[] {
  const marks: StructureMark[] = [];
  for (const kind of Object.keys(STRUCTURE_SPOTS) as StructureMark["kind"][])
    for (const [x, y, team, lane] of STRUCTURE_SPOTS[kind]) marks.push({ kind, x, y, team, lane, fell: null });
  for (const o of replay.objectives) {
    if (o.id === 0) continue; // el núcleo cae junto con el Patrón
    const kind = structureKindOf(o.id);
    if (!kind) continue;
    const lane = laneOf(o.id);
    if (lane !== 0) {
      // Con carril se sabe cuál fue: caen todas las de ese carril (los guardianes de base van de a dos).
      for (const m of marks) if (m.kind === kind && m.team === o.team && m.lane === lane && m.fell === null) m.fell = o.t;
      continue;
    }
    const libres = marks.filter((m) => m.kind === kind && m.team === o.team && m.fell === null);
    if (libres.length === 0) continue;
    const atacantes = [...replay.tracks.keys()].filter((s) => teamOf(s) !== o.team);
    const cerca = (m: StructureMark) => {
      let best = Infinity;
      for (const s of atacantes) {
        const tr = replay.tracks.get(s)!;
        for (let k = Math.max(0, o.t - OBJECTIVE_WINDOW); k <= o.t; k += replay.interval) {
          if (deadAt(replay.deaths, s, k)) continue;
          const q = posAt(tr, replay.interval, k);
          best = Math.min(best, Math.hypot(q.x - m.x, q.y - m.y));
        }
      }
      return best;
    };
    const elegida = libres.reduce((a, b) => (cerca(b) < cerca(a) ? b : a));
    elegida.fell = o.t;
  }
  return marks;
}
