import { badgeRange } from "./abilities";
import type { RawRow } from "./build";

/**
 * Las cuentas por héroe de una ventana, desde la **API en vivo** de deadlock-api.
 *
 * **Existe porque el snapshot se congela.** El 2026-09-17 a las 13:00 UTC el
 * snapshot dejó de traer partidas con rango y dos días después el host ni
 * resolvía; la tier list quedó clavada en el día del parche diciendo "el parche
 * pesa el 3%" mientras Celeste, recién nerfeada, ya jugaba al 51% en la API en
 * vivo. ZoTaD lo vio como la lista colgada, y tenía razón en lo que importa: la
 * página no se movía.
 *
 * `/v1/analytics/hero-stats` devuelve, por héroe y por ventana de tiempo y de
 * insignia, exactamente lo que la mezcla de la tier list necesita: partidas y
 * victorias. No sirve para builds ni maestría —no trae compras ni minutos—,
 * pero para héroes alcanza, y es el mismo endpoint que ya usa la pestaña
 * Jugador.
 *
 * **Lo que se aproxima:** la API cuenta filas jugador-partida por héroe, no
 * partidas distintas. Una partida tiene 12 jugadores, así que las partidas de
 * la banda son la suma dividida 12. Es lo que la tier list llama `matches`
 * (denominador del uso) y en el snapshot sale exacto; acá difiere en la
 * partida de más o de menos que quedó a medio escribir.
 */

const LIVE = "https://api.deadlock-api.com/v1/analytics/hero-stats";
const PLAYERS_PER_MATCH = 12;

export interface BandCounts {
  rows: RawRow[];
  /** Partidas distintas de la banda: el denominador del uso. */
  matches: number;
  /** Filas jugador-partida. */
  boards: number;
  from: string;
  to: string;
}

export interface LiveRow {
  hero_id: number;
  wins: number;
  matches: number;
}

const day = (iso: string) => iso.slice(0, 10);

/** Las cuentas de la API, en la forma que consume `blendRows`. */
export function countsFrom(rows: LiveRow[], from: string, to: string): BandCounts {
  const boards = rows.reduce((n, r) => n + r.matches, 0);
  return {
    rows: rows.filter((r) => r.matches > 0).map((r) => ({ hero_id: r.hero_id, matches: r.matches, wins: r.wins })),
    matches: Math.round(boards / PLAYERS_PER_MATCH),
    boards,
    from: day(from),
    to: day(to),
  };
}

/** Tira si la API no contesta: quien llama decide si hay otra fuente. */
export async function fetchLiveCounts(from: string, to: string, tiers: number[]): Promise<BandCounts> {
  const badge = badgeRange(tiers);
  const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  const url =
    `${LIVE}?min_unix_timestamp=${unix(from)}&max_unix_timestamp=${unix(to)}` +
    `&min_average_badge=${badge.min}&max_average_badge=${badge.max}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`hero-stats contestó ${res.status}`);
  return countsFrom((await res.json()) as LiveRow[], from, to);
}
