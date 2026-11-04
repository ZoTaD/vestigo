/**
 * El cálculo de combate de CoH3 (2026-11-04): penetración por lado, daño esperado, ciclo de disparo, disparos y segundos
 * para matar, y DPS a cada distancia. Lógica pura (sin React), probada en `test/coh3Combat.test.ts`, para la calculadora
 * de Penetración, el comparador de DPS y los counters de las fichas.
 *
 * El modelo, declarado en la página tal cual:
 * - Lo que cambia con la distancia (penetración, precisión, multiplicador de recarga…) se interpola en línea recta
 *   entre cerca–medio y medio–lejos, a las distancias del arma; antes de "cerca" vale lo de cerca, después de "lejos" lo
 *   de lejos.
 * - Probabilidad de penetrar = mín(1, penetración / blindaje del lado). Sin penetrar, un impacto no hace daño.
 * - Daño esperado por disparo = precisión × probabilidad de penetrar × daño medio × (modificador del blanco).
 * - Ciclo = apuntar + (ráfaga) + enfriamiento; cada `clip` disparos, se suma la recarga. Se promedian los mínimos y los
 *   máximos.
 *
 * Pensado para reutilizarse en los otros RTS: sólo depende de los números del arma y del blanco.
 */

/** Tres valores: cerca, medio y lejos. */
export type Trio = [near: number, mid: number, far: number];

export interface WeaponStats {
  pen: Trio;
  /** A qué distancia (m) vale cada uno de los tres valores. */
  dist: Trio;
  acc: Trio;
  dmg: [min: number, max: number];
  /** Alcance máximo (m). */
  range: number;
  /** Segundos: apuntar, enfriamiento entre disparos y recarga (mín, máx). */
  aim?: [number, number];
  cooldown?: [number, number];
  reload?: [number, number];
  /** Disparos por cargador (1 en un cañón). */
  clip?: number;
  /** Duración de una ráfaga (s) y disparos por segundo dentro de ella; sin ráfaga, un disparo por ciclo. */
  burst?: { dur: [number, number]; rate: [number, number] } | null;
  /** Multiplicador de la precisión contra un blanco en movimiento, si el arma lo trae. */
  moving?: number;
}

export interface TargetStats {
  hp: number;
  /** Frente, lateral y trasero. Infantería: [1, 1, 1]. */
  armor: [number, number, number];
  /** Multiplicadores que recibe el blanco (veteranía, cobertura). */
  receivedAccuracy?: number;
  receivedDamage?: number;
  /** Modelos del escuadrón (la vida es por modelo). */
  models?: number;
}

export type Side = 0 | 1 | 2;

const mean = (p: [number, number] | undefined, d = 0) => (p ? (p[0] + p[1]) / 2 : d);

/** El valor a una distancia, en línea recta entre los tres puntos del arma. */
export function at(v: Trio, dist: Trio, d: number): number {
  const [n, m, f] = v, [dn, dm, df] = dist;
  if (!(dm > dn) || !(df > dm)) return d <= dn ? n : d <= df ? m : f;
  if (d <= dn) return n;
  if (d <= dm) return n + ((m - n) * (d - dn)) / (dm - dn);
  if (d <= df) return m + ((f - m) * (d - dm)) / (df - dm);
  return f;
}

export const penChance = (pen: number, armor: number): number => (armor <= 0 ? 1 : Math.min(1, pen / armor));

/** Segundos por ciclo de disparo (sin la recarga) y disparos que salen en ese ciclo. */
export function cycle(w: WeaponStats): { secs: number; shots: number } {
  const aim = mean(w.aim), cd = mean(w.cooldown);
  if (w.burst) {
    const dur = mean(w.burst.dur), rate = mean(w.burst.rate);
    return { secs: aim + dur + cd, shots: Math.max(1, dur * rate) };
  }
  return { secs: Math.max(0.1, aim + cd), shots: 1 };
}

/** Disparos por segundo sostenidos, con la recarga cada `clip` disparos. */
export function shotsPerSecond(w: WeaponStats): number {
  const c = cycle(w);
  const clip = Math.max(1, w.clip ?? 1);
  const cyclesPerClip = Math.max(1, clip / c.shots);
  const secs = cyclesPerClip * c.secs + mean(w.reload);
  return (cyclesPerClip * c.shots) / Math.max(0.1, secs);
}

export interface Hit {
  /** Distancia usada (recortada al alcance). */
  d: number;
  inRange: boolean;
  pen: number;
  chance: number;
  acc: number;
  dmg: number;
  /** Daño esperado por disparo. */
  expected: number;
  /** Disparos que penetran necesarios para matar un modelo. */
  shotsToKill: number;
  /** Disparos esperados (contando fallos y rebotes) para matar un modelo, o Infinity. */
  expectedShots: number;
  /** Segundos esperados para matar un modelo, o Infinity. */
  seconds: number;
  dps: number;
}

/** Un arma contra un lado de un blanco a una distancia. */
export function hit(w: WeaponStats, t: TargetStats, side: Side, d: number): Hit {
  const inRange = d <= w.range;
  const pen = at(w.pen, w.dist, d);
  const chance = penChance(pen, t.armor[side]);
  const acc = Math.min(1, at(w.acc, w.dist, d) * (t.receivedAccuracy ?? 1));
  const dmg = mean(w.dmg) * (t.receivedDamage ?? 1);
  const expected = inRange ? acc * chance * dmg : 0;
  const shotsToKill = dmg > 0 ? Math.ceil(t.hp / dmg) : Infinity;
  const pHit = inRange ? acc * chance : 0;
  const expectedShots = pHit > 0 ? shotsToKill / pHit : Infinity;
  const sps = shotsPerSecond(w);
  const dps = expected * sps;
  return { d, inRange, pen, chance, acc, dmg, expected, shotsToKill, expectedShots, seconds: dps > 0 ? t.hp / dps : Infinity, dps };
}

/** La curva de una magnitud de 0 al alcance, metro a metro (para los gráficos). */
export function curve(w: WeaponStats, t: TargetStats, side: Side, pick: (h: Hit) => number, step = 1): [number, number][] {
  const out: [number, number][] = [];
  for (let d = 0; d <= w.range + 1e-9; d += step) out.push([d, pick(hit(w, t, side, d))]);
  return out;
}

/** El DPS de una unidad entera: la suma de sus armas (cada una con su cantidad) contra un blanco a una distancia. */
export function unitDps(weapons: { w: WeaponStats; n: number }[], t: TargetStats, side: Side, d: number): number {
  return weapons.reduce((a, { w, n }) => a + n * hit(w, t, side, d).dps, 0);
}

/** Un blanco de infantería genérico: vida por modelo y sin blindaje. */
export const INFANTRY = (hp = 80, models = 4): TargetStats => ({ hp, armor: [1, 1, 1], models });
