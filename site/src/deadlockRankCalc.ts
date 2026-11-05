/**
 * "¿Cuántas victorias me faltan?": aritmética del progreso de rango.
 *
 * Medido en `players/{id}/rank` el 2/11: el progreso es un solo número que
 * crece de a 1.000 por subnivel, con el sexto de cada rango más caro — así que
 * en la Temporada 1 cada rango eran 7.000 y 44.370 es el subnivel 73 con 370
 * adentro. **Desde la Temporada 2 el sexto cuesta 1.500 y no 2.000** (anuncio
 * de Valve del 5/11), así que todo recibe las reglas de la temporada: el
 * progreso de una partida de la 1 se lee con las de la 1.
 *
 * **Eternus no se calcula**: sus subniveles son cortes de percentil que Valve
 * recalcula cada día, así que el techo de la calculadora es entrar a Eternus I.
 */

import { rulesAt, type RankRules } from "./deadlockSeasons";

export const SUB_POINTS = 1000;
const tierPoints = (r: RankRules) => 5 * SUB_POINTS + r.lastSubPoints;
/** El primer rango con insignia (Iniciado) y Eternus, que es el techo. */
export const FIRST_TIER = 1;
export const ETERNUS = 11;
/** Más victorias que esto no es una meta: es otra temporada. */
export const MAX_WINS = 200;

/** Dónde arranca un badge (`rango*10 + subnivel`), en puntos. */
export function badgeStart(badge: number, r: RankRules = rulesAt(0)): number {
  const tier = Math.floor(badge / 10);
  const sub = Math.min(6, Math.max(1, badge % 10));
  return (tier - FIRST_TIER) * tierPoints(r) + (sub - 1) * SUB_POINTS;
}

/** Cuántos puntos abarca un subnivel. */
export function subSpan(badge: number, r: RankRules = rulesAt(0)): number {
  return badge % 10 === 6 ? r.lastSubPoints : SUB_POINTS;
}

/** El badge de un progreso. Arriba de Eternus I se queda en 111. */
export function badgeAt(progress: number, r: RankRules = rulesAt(0)): number {
  const p = Math.max(0, progress);
  const tier = Math.min(ETERNUS, FIRST_TIER + Math.floor(p / tierPoints(r)));
  if (tier === ETERNUS) return ETERNUS * 10 + 1;
  const inTier = p - (tier - FIRST_TIER) * tierPoints(r);
  const sub = Math.min(6, Math.floor(inTier / SUB_POINTS) + 1);
  return tier * 10 + sub;
}

/** El badge siguiente, o `null` si ya está en Eternus. */
export function nextBadge(badge: number): number | null {
  const tier = Math.floor(badge / 10);
  if (tier >= ETERNUS) return null;
  return badge % 10 >= 6 ? (tier + 1) * 10 + 1 : badge + 1;
}

/** El subnivel I del rango siguiente, o `null` en Eternus. */
export function nextTier(badge: number): number | null {
  const tier = Math.floor(badge / 10);
  return tier >= ETERNUS ? null : (tier + 1) * 10 + 1;
}

/**
 * Victorias seguidas para llegar a `target` desde `progress`, con `streak`
 * victorias seguidas encima. `points[k]` es lo que da ganar con `k` seguidas
 * previas (la última vale para todas las de más arriba).
 */
export function winsTo(
  progress: number,
  streak: number,
  target: number,
  points: number[],
  r: RankRules = rulesAt(0)
): number | null {
  const goal = badgeStart(target, r);
  if (progress >= goal) return 0;
  if (points.length === 0) return null;
  let p = progress;
  let s = streak;
  for (let n = 1; n <= MAX_WINS; n++) {
    p += points[Math.min(s, points.length - 1)];
    s++;
    if (p >= goal) return n;
  }
  return null;
}

/**
 * La escalera de puntos por victoria de una temporada: la base de sus reglas
 * más el extra por racha medido (`typical[k] − typical[0]` de `rank-points.json`).
 * Así, apenas arranca una temporada nueva y todavía no hay partidas para medir,
 * la base ya es la nueva (350 en la 2) y la racha suma lo que sumaba.
 */
export function streakPoints(measured: number[], r: RankRules): number[] {
  if (measured.length === 0) return [r.winPoints];
  return measured.map((v) => r.winPoints + (v - measured[0]));
}

/** Derrotas al hilo que aguanta antes de bajar de subnivel (sin escudos). */
export function lossesToDrop(progress: number, loss: number, r: RankRules = rulesAt(0)): number {
  const floor = badgeStart(badgeAt(progress, r), r);
  if (loss >= 0) return Infinity;
  return Math.floor((progress - floor) / -loss) + 1;
}
