/**
 * El rango de una cuenta a lo largo de la temporada: el par de "LP en el
 * tiempo" de TFT, con una diferencia que lo hace más simple. Riot no publica
 * el LP de cada partida y TFT tuvo que grabarlo desde el día que empezó a
 * mirar; **deadlock-api sí publica el rango después de cada clasificatoria**,
 * en `players/{id}/mmr-history`, así que la historia entera de la temporada
 * está a un pedido y no hay nada que guardar.
 *
 * Es el mismo pedido que ya marcaba los ascensos en el historial. Este archivo
 * es aritmética pura sobre esa serie —el escalón, los pasos, el recorrido— sin
 * prosa: la copia vive en i18n.ts, como toda la del producto.
 */

/** Un punto de la serie: el rango que quedó después de esa clasificatoria. */
export interface RankPoint {
  matchId: number;
  /** Epoch en segundos, el de la partida. */
  startTime: number;
  /** `rango*10 + subnivel`, tal como lo usa el resto del sitio. */
  badge: number;
  /** El escalón de la escalera, ver `scoreOf`. */
  score: number;
}

/** Subniveles por división: I a VI. */
const PER_DIVISION = 6;

/**
 * El rango como un solo número comparable: **el escalón de la escalera**.
 *
 * Restar badges miente apenas alguien cambia de división: subir de Arconte VI
 * (76) a Oráculo I (81) es un subnivel, y la resta a secas da cinco. Esta
 * escala existe para que la resta sea la verdad.
 *
 * No es una invención nuestra: medido en vivo el 2026-09-07 sobre tres cuentas
 * (14, 164 y 241 partidas), el `player_score` que devuelve la API es
 * exactamente `(división − 1) × 6 + subnivel`. Se recalcula acá desde el badge
 * y no se lee del campo para que el gráfico no dependa de un número que la
 * API podría dejar de mandar (el endpoint figura "Deprecated" en su OpenAPI).
 *
 * Arriba de Eternus VI el badge sigue (121, 122…) y el escalón también: el
 * juego los dibuja todos como Eternus, pero el orden entre ellos es real.
 */
export function scoreOf(badge: number): number {
  const division = Math.floor(badge / 10);
  const sub = badge % 10;
  return (division - 1) * PER_DIVISION + sub;
}

/** El rango partida por partida, para marcar en cuál se ascendió. */
export interface RankStep {
  matchId: number;
  /** El badge después de esa partida. */
  badge: number;
  /** El badge que traía antes. 0 si es la primera con rango. */
  previo: number;
  /** Cuánto se movió respecto de la partida anterior, en badges. */
  delta: number;
}

/**
 * Los pasos de la serie, por partida: lo que el historial usa para dibujar la
 * flecha del ascenso. La serie tiene que venir en orden cronológico, que es
 * como la manda la API y como la deja `fetchMmrHistory`.
 */
export function rankSteps(points: RankPoint[]): Map<number, RankStep> {
  const out = new Map<number, RankStep>();
  let previo: number | null = null;
  for (const p of points) {
    if (p.badge <= 0) continue;
    out.set(p.matchId, {
      matchId: p.matchId,
      badge: p.badge,
      previo: previo ?? 0,
      delta: previo === null ? 0 : p.badge - previo,
    });
    previo = p.badge;
  }
  return out;
}

/** Un corte de división dentro del recorrido, y el badge del rango que empieza ahí. */
export interface Boundary {
  /** Entre el último subnivel de una división y el primero de la siguiente. */
  score: number;
  badge: number;
}

/** El recorrido listo para dibujar. */
export interface RankTrail {
  /** Con rango, en orden cronológico. */
  points: RankPoint[];
  first: RankPoint;
  last: RankPoint;
  /** El punto más alto, sólo si la última no lo es: si estás en el pico, el pico ya se ve. */
  peak: RankPoint | null;
  /** Subniveles ganados (o perdidos) entre la primera y la última. */
  net: number;
  /** Cuántas clasificatorias abarca. */
  matches: number;
  /** El piso y el techo de la escala vertical, con aire. */
  lo: number;
  hi: number;
  boundaries: Boundary[];
}

/** Cuánto aire deja la escala arriba y abajo del recorrido, en escalones. */
const AIR = 0.5;
/** La escala nunca es más angosta que esto: una línea plana va al centro, no al borde. */
const MIN_SPAN = 2;

/**
 * El recorrido de una serie, o null cuando no hay recorrido que dibujar: con
 * un solo punto no hay línea, y una línea a través de un punto es peor que
 * ninguna.
 */
export function trailOf(raw: RankPoint[]): RankTrail | null {
  const points = raw.filter((p) => p.badge > 0).sort((a, b) => a.startTime - b.startTime);
  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  let top = first;
  let min = first.score;
  let max = first.score;
  for (const p of points) {
    if (p.score > top.score) top = p;
    if (p.score < min) min = p.score;
    if (p.score > max) max = p.score;
  }

  let lo = min - AIR;
  let hi = max + AIR;
  if (hi - lo < MIN_SPAN) {
    const mid = (min + max) / 2;
    lo = mid - MIN_SPAN / 2;
    hi = mid + MIN_SPAN / 2;
  }

  const boundaries: Boundary[] = [];
  // El corte entre la división d y la d+1 está entre los escalones 6d y 6d+1.
  // Sólo los que el recorrido cruza de verdad: los dos lados adentro.
  for (let d = Math.floor(min / PER_DIVISION); d * PER_DIVISION + 1 <= max; d++) {
    const below = d * PER_DIVISION;
    if (below < min) continue;
    boundaries.push({ score: below + 0.5, badge: (d + 1) * 10 + 1 });
  }

  return {
    points,
    first,
    last,
    peak: top.score > last.score ? top : null,
    net: last.score - first.score,
    matches: points.length,
    lo,
    hi,
    boundaries,
  };
}
