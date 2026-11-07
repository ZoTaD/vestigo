import { soulsAt, type ParsedMatch } from "./deadlockMatch";

/**
 * Probabilidad de ganar minuto a minuto, peleas y momentos clave de una partida.
 *
 * **La probabilidad no es un modelo inventado**: sale de la tabla de
 * Remontadas (`comebacks.json`), que cuenta, en cientos de miles de partidas
 * del parche, cuántas ganó el equipo que iba X % adelante en almas en el minuto
 * M. Para un punto de esta partida se busca su minuto y su ventaja en esa
 * tabla, interpolando entre los minutos medidos (6, 9, 12, 15, 20, 25, 30, 35)
 * y entre los tramos de ventaja. Es "de las partidas que estaban así, ganó el
 * N %", que es exactamente lo que se dice en pantalla.
 *
 * Mira sólo las almas: no sabe de objetivos ni de quién tiene la Urna. Por eso
 * la página lo dice, y las peleas van marcadas aparte con lo que pasó.
 */

export interface ComebackCell {
  n: number;
  wins: number;
}

export interface ComebackBand {
  matches: number;
  /** `cells[minuto][tramo]`. */
  cells: ComebackCell[][];
}

export interface ComebackTable {
  minutes: number[];
  edges: number[];
  bands: Record<string, ComebackBand>;
}

/**
 * El valor que representa a cada tramo de ventaja. Los del medio son el punto
 * medio de sus cortes; los de las puntas ("más de 30 %") se ponen un poco más
 * afuera, donde cae la mayoría de esas partidas.
 */
export function bucketCenters(edges: number[]): number[] {
  const out: number[] = [];
  const first = edges[0];
  const lastE = edges[edges.length - 1];
  out.push(first - (edges[1] - first) / 2);
  for (let i = 0; i < edges.length - 1; i++) out.push((edges[i] + edges[i + 1]) / 2);
  out.push(lastE + (lastE - edges[edges.length - 2]) / 2);
  return out;
}

/** El % de victorias de una fila (un minuto) para una ventaja, interpolando entre tramos. */
function rowChance(row: ComebackCell[], centers: number[], adv: number): number {
  const wr = row.map((c) => (c.n > 0 ? c.wins / c.n : NaN));
  // Un tramo sin partidas toma el valor de su vecino más cercano hacia el medio.
  const mid = Math.floor(wr.length / 2);
  for (let i = mid - 1; i >= 0; i--) if (!Number.isFinite(wr[i])) wr[i] = wr[i + 1];
  for (let i = mid + 1; i < wr.length; i++) if (!Number.isFinite(wr[i])) wr[i] = wr[i - 1];
  if (adv <= centers[0]) return wr[0];
  if (adv >= centers[centers.length - 1]) return wr[wr.length - 1];
  for (let i = 1; i < centers.length; i++) {
    if (adv <= centers[i]) {
      const f = (adv - centers[i - 1]) / (centers[i] - centers[i - 1]);
      return wr[i - 1] + f * (wr[i] - wr[i - 1]);
    }
  }
  return wr[wr.length - 1];
}

/**
 * La chance de ganar del equipo que lleva `adv` de ventaja relativa en el
 * minuto `minute`. Antes del primer minuto medido se lee el primero; después
 * del último, el último.
 */
export function chanceAt(band: ComebackBand, table: Pick<ComebackTable, "minutes" | "edges">, minute: number, adv: number): number {
  const centers = bucketCenters(table.edges);
  const ms = table.minutes;
  if (minute <= ms[0]) return rowChance(band.cells[0], centers, adv);
  if (minute >= ms[ms.length - 1]) return rowChance(band.cells[ms.length - 1], centers, adv);
  for (let i = 1; i < ms.length; i++) {
    if (minute <= ms[i]) {
      const f = (minute - ms[i - 1]) / (ms[i] - ms[i - 1]);
      const a = rowChance(band.cells[i - 1], centers, adv);
      const b = rowChance(band.cells[i], centers, adv);
      return a + f * (b - a);
    }
  }
  return 0.5;
}

/** La ventaja relativa del equipo 0: (propias − rivales) / promedio de las dos. */
export function relativeLead(a: number, b: number): number {
  const mean = (a + b) / 2;
  return mean > 0 ? (a - b) / mean : 0;
}

export interface ChancePoint {
  t: number;
  /** Probabilidad de que gane Hidden King (equipo 0), de 0 a 1. */
  p: number;
  /** Almas de cada equipo en ese segundo. */
  souls: [number, number];
}

/** Cada cuántos segundos se evalúa la curva. Entre muestras las almas se interpolan en línea recta. */
const STEP = 30;

/**
 * La curva de la partida. Arranca en 50 % y se apaga en la duración: no se
 * fuerza al 100 % al final, porque lo que se muestra es lo que decían las
 * almas, no el resultado.
 */
export function chanceCurve(match: ParsedMatch, band: ComebackBand, table: Pick<ComebackTable, "minutes" | "edges">): ChancePoint[] {
  const team = (n: number) => match.players.filter((p) => p.team === n);
  const t0 = team(0);
  const t1 = team(1);
  const lastSample = Math.max(0, ...match.players.flatMap((p) => p.souls.map((s) => s.t)));
  const end = Math.min(match.durationS, lastSample || match.durationS);
  const out: ChancePoint[] = [{ t: 0, p: 0.5, souls: [0, 0] }];
  for (let t = STEP; t <= end; t += STEP) {
    const a = t0.reduce((s, p) => s + soulsAt(p, t), 0);
    const b = t1.reduce((s, p) => s + soulsAt(p, t), 0);
    // Los primeros minutos el % sale de la fila del minuto 6 con la ventaja de
    // ese momento, mezclado con el 50 % del arranque: a los 30 s una ventaja de
    // 200 almas no dice nada todavía.
    const raw = chanceAt(band, table, t / 60, relativeLead(a, b));
    const w = Math.min(1, t / (table.minutes[0] * 60));
    out.push({ t, p: 0.5 + w * (raw - 0.5), souls: [a, b] });
  }
  if (out[out.length - 1].t < end) {
    const a = t0.reduce((s, p) => s + soulsAt(p, end), 0);
    const b = t1.reduce((s, p) => s + soulsAt(p, end), 0);
    out.push({ t: end, p: chanceAt(band, table, end / 60, relativeLead(a, b)), souls: [a, b] });
  }
  return out;
}

/** La probabilidad en un segundo cualquiera, interpolando la curva. */
export function chanceOn(curve: ChancePoint[], t: number): number {
  if (curve.length === 0) return 0.5;
  if (t <= curve[0].t) return curve[0].p;
  for (let i = 1; i < curve.length; i++) {
    if (t <= curve[i].t) {
      const f = (t - curve[i - 1].t) / (curve[i].t - curve[i - 1].t);
      return curve[i - 1].p + f * (curve[i].p - curve[i - 1].p);
    }
  }
  return curve[curve.length - 1].p;
}

export interface Fight {
  start: number;
  end: number;
  /** Muertes de cada equipo en la pelea: `[Hidden King, Archmother]`. */
  deaths: [number, number];
}

/**
 * Las peleas: muertes que caen a menos de `gap` segundos una de otra. Desde dos
 * muertes cuenta; una sola es un pick, no una pelea.
 */
export function fightsOf(match: ParsedMatch, gap = 25, min = 2): Fight[] {
  const todas = match.players
    .flatMap((p) => p.deathsAt.map((d) => ({ t: d.t, team: p.team })))
    .sort((a, b) => a.t - b.t);
  const out: Fight[] = [];
  let cur: Fight | null = null;
  for (const d of todas) {
    if (cur && d.t - cur.end <= gap) {
      cur.end = d.t;
      cur.deaths[d.team === 0 ? 0 : 1]++;
    } else {
      if (cur) out.push(cur);
      cur = { start: d.t, end: d.t, deaths: d.team === 0 ? [1, 0] : [0, 1] };
    }
  }
  if (cur) out.push(cur);
  return out.filter((f) => f.deaths[0] + f.deaths[1] >= min);
}

export type Moment =
  | { kind: "fight"; t: number; fight: Fight; winner: 0 | 1 | null; swing: number }
  | { kind: "flip"; t: number; leader: 0 | 1 }
  | { kind: "midboss"; t: number; team: number };

/**
 * Los momentos que se cuentan en palabras: las peleas grandes (las 4 con más
 * muertes), cada vez que cambió quién era favorito, y los jefes del medio.
 * `swing` es cuánto se movió la chance de Hidden King del principio de la
 * pelea a un minuto después.
 */
export function keyMoments(match: ParsedMatch, curve: ChancePoint[]): Moment[] {
  const peleas = fightsOf(match)
    .filter((f) => f.deaths[0] + f.deaths[1] >= 3)
    .sort((a, b) => b.deaths[0] + b.deaths[1] - (a.deaths[0] + a.deaths[1]) || a.start - b.start)
    .slice(0, 4)
    .map((f): Moment => {
      const winner = f.deaths[0] < f.deaths[1] ? 0 : f.deaths[1] < f.deaths[0] ? 1 : null;
      const swing = chanceOn(curve, f.end + 60) - chanceOn(curve, f.start);
      return { kind: "fight", t: f.start, fight: f, winner, swing };
    });

  const giros: Moment[] = [];
  let lider: 0 | 1 | null = null;
  for (const pt of curve) {
    // Con un margen de 5 puntos: rozar el 50 % no es cambiar de favorito.
    const ahora: 0 | 1 | null = pt.p >= 0.55 ? 0 : pt.p <= 0.45 ? 1 : lider;
    if (ahora !== null && lider !== null && ahora !== lider) giros.push({ kind: "flip", t: pt.t, leader: ahora });
    lider = ahora;
  }

  const jefes: Moment[] = match.midBoss.map((b) => ({ kind: "midboss", t: b.t, team: b.team }));
  return [...peleas, ...giros, ...jefes].sort((a, b) => a.t - b.t);
}

/** La muestra de `stats` más cercana a un segundo, sin pasarse de `max`. */
export function sampleNear(samples: Record<string, number>[], t: number, max = Infinity): Record<string, number> | null {
  let best: Record<string, number> | null = null;
  let dist = Infinity;
  for (const s of samples) {
    const ts = Number(s.time_stamp_s ?? 0);
    if (ts > max) continue;
    const d = Math.abs(ts - t);
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  return best;
}
