/**
 * Las temporadas clasificatorias de Deadlock.
 *
 * Las fechas salen de `/v1/assets/ranked-seasons`, que las lee de los archivos
 * del juego: la temporada 1 corre del 30/7 al **5/11/2026 22:00 UTC** (Valve la
 * estiró del 7/10 en el post de Baba) y la siguiente arranca en el mismo
 * instante. El asset trae la 2 como un intervalo sin fin real (termina en
 * 2028): `end: null` hasta que Valve publique la fecha. **Cuando salga una
 * temporada nueva se suma acá una línea**; la copia del pipeline vive en
 * `games/deadlock/pipeline/src/seasons.ts` y tiene que decir lo mismo.
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

export const SEASONS: Season[] = [
  { id: 1, start: S1_START, end: S2_START },
  { id: 2, start: S2_START, end: null },
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

/** Qué temporada mira el perfil: una puntual o la carrera entera. */
export type SeasonPick = number | "all";

export function inSeason(t: number, pick: SeasonPick): boolean {
  if (pick === "all") return true;
  const s = SEASONS.find((x) => x.id === pick);
  return !!s && t >= s.start && (s.end == null || t < s.end);
}

/** Cuántas partidas hay en cada temporada. Las de antes del reset no cuentan en ninguna. */
export function seasonCounts(times: number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const t of times) {
    const s = seasonAt(t);
    if (s) out.set(s.id, (out.get(s.id) ?? 0) + 1);
  }
  return out;
}

/**
 * Mínimo de partidas para que el perfil abra en una temporada.
 *
 * El día del reset cualquiera tiene una o dos partidas de la temporada nueva, y
 * abrir ahí dejaría todas las tarjetas vacías; con cinco ya hay de qué hablar.
 */
export const SEASON_OPEN_MIN = 5;

/**
 * Con qué temporada abre un perfil: la más nueva con `SEASON_OPEN_MIN`
 * partidas, si no la más nueva con alguna, si no la carrera entera.
 */
export function defaultSeason(times: number[]): SeasonPick {
  const n = seasonCounts(times);
  const desc = [...SEASONS].reverse();
  const full = desc.find((s) => (n.get(s.id) ?? 0) >= SEASON_OPEN_MIN);
  if (full) return full.id;
  const any = desc.find((s) => (n.get(s.id) ?? 0) > 0);
  return any ? any.id : "all";
}
