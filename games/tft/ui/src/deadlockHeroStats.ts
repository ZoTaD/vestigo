import { useEffect, useState } from "react";

/**
 * Tu carrera con cada héroe, del endpoint que la sabe.
 *
 * **Contesta otra pregunta que el resumen del perfil, y por eso convive con él.**
 * `summarize` describe *cómo venís* —el historial que la página bajó, filtrado al
 * modo elegido—; esto describe *cómo jugaste siempre* con cada héroe. Los dos
 * números pueden no coincidir y eso no es una contradicción: son dos ventanas
 * distintas. Lo que no se puede es dejarlo sin decir, así que la tarjeta declara
 * su ventana en el encabezado, igual que la columna de maestría declara su banda.
 *
 * Trae dos cosas que **ningún competidor publica por héroe en el perfil**:
 * precisión y tasa de críticos. Medido el 2026-08-25 sobre una cuenta real: 35
 * héroes en ~36 KB, con precisión en 35/35 y críticos en 34/35.
 */

const API = "https://api.deadlock-api.com/v1";

/** Una fila cruda, tal como la manda la API. */
export interface RawHeroStat {
  hero_id: number;
  matches_played: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  accuracy?: number;
  crit_shot_rate?: number;
  networth_per_min?: number;
}

/** Un héroe de la carrera del jugador, ya derivado. */
export interface HeroStat {
  heroId: number;
  matches: number;
  wins: number;
  winRate: number;
  kda: number;
  /** Fracción 0–1, o `null` si la API no la mandó. Nunca 0 por ausencia. */
  accuracy: number | null;
  critRate: number | null;
  soulsPerMin: number | null;
}

/**
 * Mínimo de partidas para que un héroe entre en la tabla.
 *
 * "100% con Lash" sobre una partida es la partida, no el héroe. Tres es el
 * mínimo con el que el winrate deja de ser un booleano disfrazado de porcentaje.
 */
export const HERO_STATS_MIN = 3;

/**
 * Deriva la carrera por héroe de las filas crudas.
 *
 * **El winrate se deriva, no se copia**: la API manda `wins` y `matches_played`
 * por separado y no un porcentaje, así que la única forma de tenerlo es
 * dividirlo acá — y de paso queda con la misma definición que el resto del
 * sitio.
 *
 * **Las muertes en cero se tratan como una**, la misma convención que
 * `summarize`: sin eso una carrera sin morir devuelve `Infinity` y la tarjeta
 * dibuja un símbolo de infinito donde va un número.
 */
export function heroStatsOf(raw: RawHeroStat[], min = HERO_STATS_MIN): HeroStat[] {
  // Un campo ausente es un hueco y no un cero: cero precisión diría "nunca
  // acertó un tiro", que es una afirmación, y la ausencia no afirma nada.
  const opcional = (x: number | undefined): number | null => (typeof x === "number" ? x : null);

  return raw
    .filter((r) => r.matches_played >= min)
    .map((r) => ({
      heroId: r.hero_id,
      matches: r.matches_played,
      wins: r.wins,
      winRate: r.wins / Math.max(1, r.matches_played),
      kda: (r.kills + r.assists) / Math.max(1, r.deaths),
      accuracy: opcional(r.accuracy),
      critRate: opcional(r.crit_shot_rate),
      soulsPerMin: opcional(r.networth_per_min),
    }))
    .sort((a, b) => b.matches - a.matches || b.wins - a.wins);
}

/**
 * La carrera por héroe de una cuenta: un pedido, ~36 KB.
 *
 * **No se vuelve a pedir al cambiar de modo**, porque no depende del modo: es la
 * carrera entera, y eso la tarjeta lo dice.
 *
 * Falla en silencio, como el rango y las notas: quedarse sin la tarjeta tiene
 * que costar la tarjeta, no el perfil.
 */
export async function fetchHeroStats(accountId: number): Promise<RawHeroStat[]> {
  const res = await fetch(`${API}/players/hero-stats?account_ids=${accountId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as RawHeroStat[];
}

export function useHeroStats(accountId: number | null): HeroStat[] {
  const [stats, setStats] = useState<HeroStat[]>([]);

  useEffect(() => {
    setStats([]);
    if (accountId === null || !Number.isFinite(accountId)) return;
    let vivo = true;
    fetchHeroStats(accountId).then(
      (raw) => vivo && setStats(heroStatsOf(raw)),
      () => undefined
    );
    return () => {
      vivo = false;
    };
  }, [accountId]);

  return stats;
}
