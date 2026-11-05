/**
 * Las temporadas clasificatorias de Deadlock.
 *
 * Las fechas salen de `/v1/assets/ranked-seasons`, que las lee de los archivos
 * del juego: la temporada 1 corre del 30/7 al **5/11/2026 22:00 UTC** (Valve la
 * estiró del 7/10 en el post de Baba) y la siguiente arranca en el mismo
 * instante. El asset trae la 2 como un intervalo sin fin real (termina en
 * 2028): `end: null` hasta que Valve publique la fecha. **Cuando salga una
 * temporada nueva se suma acá una línea**; es copia de
 * `site/src/deadlockSeasons.ts` y tiene que decir lo mismo.
 *
 * Todo en segundos, como `start_time` de la API.
 */

export interface Season {
  id: number;
  /** Inicio, inclusive. */
  start: number;
  /** Fin, exclusivo. `null` = la vigente sin fecha de cierre. */
  end: number | null;
}

/** El reset de ranked del 30/7, 16:19 UTC: antes, `match_mode` 4 era otro modo. */
const S1_START = Date.UTC(2026, 6, 30, 16, 19, 0) / 1000;
const S2_START = Date.UTC(2026, 10, 5, 22, 0, 0) / 1000;
/** Valve dijo "jueves 11 de marzo de 2027", sin hora: se asume la misma que el cierre de la 1. */
const S2_END = Date.UTC(2027, 2, 11, 22, 0, 0) / 1000;

export const SEASONS: Season[] = [
  { id: 1, start: S1_START, end: S2_START },
  { id: 2, start: S2_START, end: S2_END },
];

/**
 * Días que la temporada nueva tiene que llevar antes de que la escalera la use.
 *
 * Con el reset todo el mundo recalibra: el primer día nadie llega a las 20
 * partidas con un héroe que pide la escalera por héroe, ni a las 50 del mundo,
 * y la tabla saldría vacía. Hasta entonces se muestra la temporada que terminó,
 * rotulada como final.
 */
export const LADDER_GRACE_DAYS = 7;

/** La temporada de un instante. `null` antes del reset de ranked. */
export function seasonAt(t: number): Season | null {
  for (const s of SEASONS) if (t >= s.start && (s.end == null || t < s.end)) return s;
  return null;
}

/** La vigente. Si el reloj está antes de todas (no debería), la primera. */
export function currentSeason(now = Date.now() / 1000): Season {
  return seasonAt(now) ?? SEASONS[0];
}

/** La que mide la escalera: la vigente después de la gracia, si no la anterior. */
export function ladderSeason(now = Date.now() / 1000): { season: Season; final: boolean } {
  const cur = currentSeason(now);
  const prev = SEASONS.find((s) => s.id === cur.id - 1);
  if (prev && now - cur.start < LADDER_GRACE_DAYS * 86400) return { season: prev, final: true };
  return { season: cur, final: false };
}

/** Los filtros de la API para una temporada: `max` sólo si ya cerró. */
export function seasonParams(s: Season): Record<string, string> {
  const p: Record<string, string> = { min_unix_timestamp: String(s.start) };
  if (s.end != null) p.max_unix_timestamp = String(s.end);
  return p;
}
