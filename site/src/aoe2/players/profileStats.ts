/**
 * Los cálculos del perfil de AoE2 (2026-11-20), sin React: todo sale del historial (`Aoe2Match[]`, la más nueva
 * primero) y del `profileId` dueño. Las partidas personalizadas y las de otros modos no cuentan para forma ni civs;
 * un resultado "other" (abandono, sin reportar) no es victoria ni derrota. Tests en `test/aoe2Profile.test.ts`.
 */
import type { Aoe2Match, Aoe2Mode, Aoe2Player, Aoe2Result } from "../api/wel";

const RANKED = new Set(["rm1v1", "rmteam", "ew1v1", "ewteam", "dm1v1", "dmteam"]);
const esRanked = (m: Aoe2Match) => RANKED.has(m.mode);
const yo = (m: Aoe2Match, id: number): Aoe2Player | undefined => m.players.find((p) => p.profileId === id);
/** Un jugador de verdad: la IA y los lugares vacíos vienen con perfil ≤ 0. */
const humano = (p: Aoe2Player) => p.profileId > 0;

/** Los resultados de las últimas `n` partidas de ranking, de la más nueva a la más vieja. */
export function form(matches: readonly Aoe2Match[], id: number, n = 10): Aoe2Result[] {
  return matches
    .filter(esRanked)
    .map((m) => yo(m, id)?.result)
    .filter((r): r is Aoe2Result => !!r)
    .slice(0, n);
}

type Cuenta = { games: number; wins: number };
function contar<K>(matches: readonly Aoe2Match[], id: number, clave: (m: Aoe2Match, p: Aoe2Player) => K) {
  const out = new Map<K, Cuenta & { elos: number[] }>();
  for (const m of matches) {
    if (!esRanked(m)) continue;
    const p = yo(m, id);
    if (!p || p.result === "other") continue;
    const k = clave(m, p);
    const c = out.get(k) ?? { games: 0, wins: 0, elos: [] };
    c.games++;
    if (p.result === "win") c.wins++;
    if (p.oldElo != null) c.elos.push(p.oldElo);
    out.set(k, c);
  }
  return out;
}

/** Partidas, victorias y ELO promedio con cada civ, de la más jugada a la menos. */
export function byCiv(matches: readonly Aoe2Match[], id: number): { civ: number; games: number; wins: number; avgElo: number | null }[] {
  return [...contar(matches, id, (_m, p) => p.civ)]
    .map(([civ, c]) => ({ civ, games: c.games, wins: c.wins, avgElo: c.elos.length ? Math.round(c.elos.reduce((a, b) => a + b, 0) / c.elos.length) : null }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins);
}

export function byMap(matches: readonly Aoe2Match[], id: number): { map: string; games: number; wins: number }[] {
  return [...contar(matches, id, (m) => m.map)].map(([map, c]) => ({ map, games: c.games, wins: c.wins })).sort((a, b) => b.games - a.games);
}

type Cruce = { profileId: number; alias: string; wins: number; losses: number };
function cruces(matches: readonly Aoe2Match[], id: number, mismoEquipo: boolean, n: number): Cruce[] {
  const out = new Map<number, Cruce>();
  for (const m of matches) {
    const p = yo(m, id);
    if (!p || p.result === "other") continue;
    for (const o of m.players) {
      if (o.profileId === id || !humano(o) || (o.team === p.team) !== mismoEquipo) continue;
      // El alias más nuevo (el historial viene de la más nueva a la más vieja).
      const c = out.get(o.profileId) ?? { profileId: o.profileId, alias: o.alias, wins: 0, losses: 0 };
      if (p.result === "win") c.wins++;
      else c.losses++;
      out.set(o.profileId, c);
    }
  }
  return [...out.values()].sort((a, b) => b.wins + b.losses - (a.wins + a.losses) || a.alias.localeCompare(b.alias)).slice(0, n);
}

/** Contra quién jugó más (rivales directos), con sus victorias y derrotas contra cada uno. */
export const rivals = (matches: readonly Aoe2Match[], id: number, n = 10): Cruce[] => cruces(matches, id, false, n);
/** Con quién jugó más en el mismo equipo. */
export const mates = (matches: readonly Aoe2Match[], id: number, n = 10): Cruce[] => cruces(matches, id, true, n);

/** Partidas por día de la semana (0 = lunes) y hora local, con `tzOffsetMin` minutos respecto de UTC (UTC−3 = −180). */
export function activity(matches: readonly Aoe2Match[], id: number, tzOffsetMin: number): number[][] {
  const g = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const m of matches) {
    if (!yo(m, id)) continue;
    const d = new Date((m.start + tzOffsetMin * 60) * 1000);
    g[(d.getUTCDay() + 6) % 7][d.getUTCHours()]++;
  }
  return g;
}

/** La duración promedio de sus partidas, en segundos (null sin partidas). */
export function avgDuration(matches: readonly Aoe2Match[], id: number): number | null {
  const ds = matches.filter((m) => yo(m, id) && m.end > m.start).map((m) => m.end - m.start);
  return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
}

/**
 * La curva de ELO de un modo: `[fin de la partida, ELO nuevo]` del más viejo al más nuevo. `memory` es la memoria
 * diaria del colector (`[ts, elo]`), que va más atrás que el historial; de los días con partidas manda el historial.
 */
export function eloSeries(matches: readonly Aoe2Match[], id: number, mode: Aoe2Mode, memory: readonly [number, number][] = []): [number, number][] {
  const propios = matches
    .filter((m) => m.mode === mode)
    .map((m) => [m.end, yo(m, id)?.newElo] as const)
    .filter((x): x is readonly [number, number] => x[1] != null)
    .map(([t, e]) => [t, e] as [number, number]);
  // Un día (UTC) con partidas en el historial ya está dicho por ellas: el punto de la memoria de ese día sobra.
  const dia = (t: number) => Math.floor(t / 86400);
  const dias = new Set(propios.map(([t]) => dia(t)));
  return [...memory.filter(([t]) => !dias.has(dia(t))).map(([t, e]) => [t, e] as [number, number]), ...propios].sort((a, b) => a[0] - b[0]);
}

/** Las partidas donde están los dos jugadores. */
export const headToHead = (matches: readonly Aoe2Match[], a: number, b: number): Aoe2Match[] => matches.filter((m) => yo(m, a) && yo(m, b));
