/**
 * La foto congelada del top 100 de una temporada clasificatoria.
 *
 * **Por qué hay que sacarla antes del cierre**: `/v1/players/rank` devuelve el
 * rango con que cada jugador cerró su ÚLTIMA clasificatoria. Apenas alguien
 * juega la temporada nueva, su rango final de la anterior deja de estar en la
 * API. Las victorias y partidas, en cambio, se pueden recalcular cuando sea
 * (el scoreboard filtra por fecha).
 *
 * Por eso cada corrida **combina** con la foto anterior: de cada jugador se
 * queda con el rango más nuevo que venga de una partida de ESA temporada, y
 * descarta los que ya salen de la siguiente. Así una corrida atrasada —GitHub
 * llega a demorar horas las programadas— no pisa nada bueno.
 *
 * Esta parte es pura (sin red) para poder probarla; la corrida está en
 * `seasonSnapshot-run.ts`.
 */

/** Un rango leído de la API, con la partida de donde sale. */
export interface RankRead {
  badge: number;
  /** `player_rank_final_flat_progress`: ordena, y distingue dos Eternus 2. */
  progress: number;
  /** `start_time` de la partida de donde sale el rango, en segundos. */
  at: number;
}

export interface PoolRow {
  accountId: number;
  wins: number;
  matches: number;
}

export interface SnapshotRow {
  /** El puesto, desde 1. */
  pos: number;
  accountId: number;
  name?: string;
  country?: string;
  badge: number;
  progress: number;
  wins: number;
  matches: number;
}

export interface SeasonSnapshotFile {
  season: number;
  /** Inicio y fin de la temporada, en segundos. */
  start: number;
  end: number;
  /** Cuándo se corrió por última vez. */
  generatedAt: string;
  /** Piso de partidas clasificatorias para entrar. */
  minMatches: number;
  /** Cuántos jugadores llegaron al piso. */
  eligible: number;
  top: SnapshotRow[];
}

/**
 * El último rango conocido de cada candidato, por `account_id`. Va en su propio
 * archivo: sólo sirve para combinar corridas, y la pestaña no tiene por qué
 * bajarlo.
 */
export type SeasonRanksFile = Record<string, RankRead>;

/**
 * Cuántos candidatos se recuerdan: los 1.000 de más progreso. Nadie sube desde
 * más abajo hasta el top 100 en el día que separa dos corridas.
 */
export const KEEP_RANKS = 1000;

/** Los `KEEP_RANKS` rangos de más progreso, para guardar. */
export function keepBest(ranks: Map<number, RankRead>, n = KEEP_RANKS): SeasonRanksFile {
  return Object.fromEntries(
    [...ranks]
      .sort((a, b) => b[1].progress - a[1].progress)
      .slice(0, n)
      .map(([id, r]) => [String(id), r])
  );
}

/**
 * El rango que vale para la temporada: el más nuevo de los dos que salga de
 * una partida anterior al cierre. Si ninguno, `undefined`.
 */
export function pickRank(
  prev: RankRead | undefined,
  fresh: RankRead | undefined,
  end: number
): RankRead | undefined {
  const ok = (r?: RankRead) => (r && r.badge > 0 && r.at > 0 && r.at < end ? r : undefined);
  const a = ok(prev);
  const b = ok(fresh);
  if (!a) return b;
  if (!b) return a;
  return b.at >= a.at ? b : a;
}

const Z = 1.96;

/** El piso de Wilson: el mismo desempate que la pestaña (`wilsonScore`). */
export function wilson(wins: number, matches: number): number {
  if (matches <= 0) return 0;
  const p = wins / matches;
  const z2 = Z * Z;
  return (
    (p + z2 / (2 * matches) - Z * Math.sqrt((p * (1 - p) + z2 / (4 * matches)) / matches)) /
    (1 + z2 / matches)
  );
}

/**
 * El top: **el mismo orden que la pestaña** —progreso del rango, después
 * Wilson, después partidas—. Quien no tiene rango de la temporada no entra.
 */
export function rankTop(
  pool: PoolRow[],
  ranks: Map<number, RankRead>,
  size: number
): Omit<SnapshotRow, "name" | "country">[] {
  return pool
    .flatMap((p) => {
      const r = ranks.get(p.accountId);
      return r ? [{ ...p, badge: r.badge, progress: r.progress, w: wilson(p.wins, p.matches) }] : [];
    })
    .sort((a, b) => b.progress - a.progress || b.w - a.w || b.matches - a.matches)
    .slice(0, size)
    .map(({ w: _w, ...r }, i) => ({ pos: i + 1, ...r }));
}
