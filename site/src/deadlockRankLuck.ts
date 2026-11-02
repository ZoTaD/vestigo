import { useEffect, useState } from "react";
import { scoreOf } from "./deadlockRankHistory";

/**
 * "Suerte de rango": en tus últimas clasificatorias, ¿te tocaron compañeros de
 * rango más bajo que los rivales?
 *
 * **Sale del rango de cada jugador, no del promedio de la sala**: medido el
 * 2/11, `average_badge_team0/1` de `matches/metadata` viene en 0 en todas las
 * partidas, clasificatorias incluidas. Así que son dos pedidos: la lista de
 * jugadores de cada partida (`matches/metadata` con `include_player_info`) y el
 * rango de todos ellos en una tanda (`players/rank`, hasta 250 cuentas en
 * medio segundo).
 *
 * **Es el rango de HOY de cada uno**, no el que tenía esa partida: la API no
 * guarda el de cada jugador en cada partida. Sobre 20 partidas recientes la
 * diferencia es chica, y la tarjeta lo dice.
 *
 * Los promedios se hacen en escalones (`scoreOf`), no en badges: restar badges
 * miente apenas alguien cambia de rango (Arconte VI → Oráculo I es un paso, no
 * cinco).
 */

const API = "https://api.deadlock-api.com/v1";

/** Cuántas clasificatorias recientes se miran. */
export const LUCK_MATCHES = 20;
/** De los otros 11, cuántos tienen que tener rango para que la partida cuente. */
export const LUCK_MIN_RANKED = 8;
/** Partidas medibles mínimas para decir algo. */
export const LUCK_MIN_MATCHES = 5;

export interface LuckMatch {
  matchId: number;
  won: boolean;
  /** Escalón medio de tus 5 compañeros con rango. */
  mates: number;
  /** Escalón medio de los 6 rivales con rango. */
  enemies: number;
}

export interface Luck {
  matches: LuckMatch[];
  /** Escalón medio de compañeros y rivales sobre todas las partidas. */
  mates: number;
  enemies: number;
  /** Partidas en que tu equipo era el de rango más bajo (por medio subnivel o más). */
  lower: number;
  lowerWon: number;
  higher: number;
  higherWon: number;
}

/** De escalón a badge, redondeando al subnivel más cercano. */
export function badgeOfScore(score: number): number {
  const s = Math.max(1, Math.round(score));
  const division = Math.floor((s - 1) / 6) + 1;
  return division * 10 + (s - (division - 1) * 6);
}

interface RawPlayer {
  account_id: number;
  team: number | string;
}

interface RawMatch {
  match_id: number;
  winning_team: number | string;
  players?: RawPlayer[];
}

/** Lo puro: partidas + rangos → suerte. Separado para probarlo sin red. */
export function luckOf(accountId: number, matches: RawMatch[], badges: Map<number, number>): Luck | null {
  const filas: LuckMatch[] = [];
  for (const m of matches) {
    const yo = m.players?.find((p) => p.account_id === accountId);
    if (!yo || !m.players) continue;
    const mates: number[] = [];
    const enemies: number[] = [];
    for (const p of m.players) {
      if (p.account_id === accountId) continue;
      const b = badges.get(p.account_id) ?? 0;
      if (b <= 0) continue;
      (String(p.team) === String(yo.team) ? mates : enemies).push(scoreOf(b));
    }
    if (mates.length + enemies.length < LUCK_MIN_RANKED || mates.length === 0 || enemies.length === 0) continue;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    filas.push({
      matchId: m.match_id,
      won: String(m.winning_team) === String(yo.team),
      mates: avg(mates),
      enemies: avg(enemies),
    });
  }
  if (filas.length < LUCK_MIN_MATCHES) return null;
  const avg = (k: "mates" | "enemies") => filas.reduce((a, f) => a + f[k], 0) / filas.length;
  const lower = filas.filter((f) => f.mates <= f.enemies - 0.5);
  const higher = filas.filter((f) => f.mates >= f.enemies + 0.5);
  return {
    matches: filas,
    mates: avg("mates"),
    enemies: avg("enemies"),
    lower: lower.length,
    lowerWon: lower.filter((f) => f.won).length,
    higher: higher.length,
    higherWon: higher.filter((f) => f.won).length,
  };
}

async function fetchLuck(accountId: number, matchIds: number[]): Promise<Luck | null> {
  const q = new URLSearchParams({
    match_ids: matchIds.join(","),
    include_info: "true",
    include_player_info: "true",
  });
  const res = await fetch(`${API}/matches/metadata?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as ({ match_info?: RawMatch } | RawMatch)[];
  const matches = raw.map((x) => (x as { match_info?: RawMatch }).match_info ?? (x as RawMatch));
  const ids = new Set<number>();
  for (const m of matches) for (const p of m.players ?? []) if (p.account_id !== accountId) ids.add(p.account_id);
  if (ids.size === 0) return null;
  const r = await fetch(`${API}/players/rank?account_ids=${[...ids].join(",")}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ranks = (await r.json()) as { account_id: number; badge?: number }[];
  const badges = new Map(ranks.map((x) => [x.account_id, x.badge ?? 0]));
  return luckOf(accountId, matches, badges);
}

export type LuckState = { status: "idle" | "loading" | "failed" } | { status: "ready"; luck: Luck | null };

/** La suerte sobre estas partidas (las últimas `LUCK_MATCHES` clasificatorias de la temporada). */
export function useRankLuck(accountId: number | null, matchIds: number[]): LuckState {
  const [state, setState] = useState<LuckState>({ status: "idle" });
  const clave = matchIds.join(",");
  useEffect(() => {
    if (accountId == null || matchIds.length < LUCK_MIN_MATCHES) {
      setState({ status: "idle" });
      return;
    }
    let vivo = true;
    setState({ status: "loading" });
    fetchLuck(accountId, matchIds).then(
      (luck) => vivo && setState({ status: "ready", luck }),
      () => vivo && setState({ status: "failed" })
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, clave]);
  return state;
}
