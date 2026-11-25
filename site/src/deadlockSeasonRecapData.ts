import type { HistoryRow } from "./deadlockMatch";
import type { RankPoint } from "./deadlockRankHistory";
import type { Achievement } from "./deadlockAchievements";

/**
 * El resumen de temporada del perfil (2026-11-25): lo que una persona quiere
 * mostrar de su temporada, en una tarjeta para compartir. Sale de lo que el
 * perfil ya bajó (historial, serie de rango y logros): no pide nada.
 */

export interface SeasonRecap {
  season: number;
  matches: number;
  wins: number;
  /** Horas jugadas en la temporada, de la duración de cada partida. */
  hours: number;
  heroesPlayed: number;
  /** El héroe con más partidas (a igualdad, el de más victorias). */
  topHero: { heroId: number; matches: number; wins: number } | null;
  /** La racha de victorias más larga, en orden de juego. */
  bestStreak: number;
  /** La partida con más kills (a igualdad, más asistencias y menos muertes). */
  bestGame: HistoryRow | null;
  /** El logro más raro de la temporada (el de menor % de jugadores). */
  rarest: Achievement | null;
  /** Primer rango, último y el más alto de la temporada. `null` sin clasificatorias con rango. */
  rank: { from: number; to: number; peak: number } | null;
}

export function seasonRecap(season: number, rows: HistoryRow[], series: RankPoint[], earned: Achievement[]): SeasonRecap | null {
  if (rows.length === 0) return null;
  const porHeroe = new Map<number, { matches: number; wins: number }>();
  let wins = 0;
  let segundos = 0;
  for (const r of rows) {
    const h = porHeroe.get(r.heroId) ?? { matches: 0, wins: 0 };
    h.matches++;
    if (r.won) {
      h.wins++;
      wins++;
    }
    segundos += r.durationS;
    porHeroe.set(r.heroId, h);
  }
  const top = [...porHeroe.entries()].sort((a, b) => b[1].matches - a[1].matches || b[1].wins - a[1].wins || a[0] - b[0])[0];

  let racha = 0;
  let mejor = 0;
  for (const r of [...rows].sort((a, b) => a.startTime - b.startTime)) {
    racha = r.won ? racha + 1 : 0;
    mejor = Math.max(mejor, racha);
  }

  const bestGame = [...rows].sort((a, b) => b.kills - a.kills || b.assists - a.assists || a.deaths - b.deaths || a.matchId - b.matchId)[0] ?? null;
  const rarest = [...earned].filter((a) => a.rarity != null).sort((a, b) => a.rarity! - b.rarity!)[0] ?? null;

  const conRango = series.filter((p) => p.badge > 0).sort((a, b) => a.startTime - b.startTime);
  const rank =
    conRango.length > 0
      ? { from: conRango[0].badge, to: conRango[conRango.length - 1].badge, peak: conRango.reduce((m, p) => (p.score > m.score ? p : m)).badge }
      : null;

  return {
    season,
    matches: rows.length,
    wins,
    hours: segundos / 3600,
    heroesPlayed: porHeroe.size,
    topHero: top ? { heroId: top[0], ...top[1] } : null,
    bestStreak: mejor,
    bestGame,
    rarest,
    rank,
  };
}
