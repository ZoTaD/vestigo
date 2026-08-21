import { useEffect, useState } from "react";
import { gradeOf, type ReportFile } from "./deadlockAdvice";
import type { MatchPlayer, ParsedMatch } from "./deadlockMatch";
import { loadReport, report } from "./deadlockReportData";

/**
 * La nota de cada partida del historial, sin bajar la partida entera.
 *
 * **Un pedido para toda la página visible, y sin los ítems.** La nota sólo mira
 * almas, daño a héroes y muertes como cuota del propio equipo, así que del
 * endpoint masivo alcanza con `include_info + include_player_kda +
 * include_player_final_stats`. Medido el 2026-08-13: **204 KB para 15 partidas**,
 * contra 1,46 MB si se pidieran también los ítems y 18 MB si se pidiera cada
 * partida por separado.
 *
 * Es la MISMA `gradeOf` que usa el informe de partida. Si se calculara distinto,
 * una partida podría decir B+ en la lista y B− al abrirla, que es la clase de
 * contradicción que hace desconfiar del resto de los números.
 */

const API = "https://api.deadlock-api.com/v1";

interface RawPlayer {
  account_id: number;
  hero_id: number;
  team: number;
  player_slot: number;
  final_stats?: Record<string, number>;
}

interface RawMatch {
  match_id: number;
  duration_s: number;
  winning_team: number;
  players: RawPlayer[];
}

/**
 * Arma el mínimo `ParsedMatch` que `gradeOf` necesita.
 *
 * Los campos que la nota no mira quedan en cero a propósito: rellenarlos con
 * inventos sería peor que dejarlos vacíos, porque alguien podría leerlos después
 * creyendo que son datos.
 */
function toMatch(raw: RawMatch): ParsedMatch {
  const players: MatchPlayer[] = raw.players.map((p) => ({
    accountId: p.account_id,
    slot: p.player_slot,
    heroId: p.hero_id,
    team: p.team,
    won: p.team === raw.winning_team,
    kills: 0,
    deaths: Number(p.final_stats?.deaths ?? 0),
    assists: 0,
    netWorth: Number(p.final_stats?.net_worth ?? 0),
    level: 0,
    damage: Number(p.final_stats?.player_damage ?? 0),
    boss: 0,
    healing: 0,
    abilityPoints: 0,
    lane: 0,
    purchases: [],
    souls: [],
    damageFrom: new Map(),
  }));
  return {
    matchId: raw.match_id,
    durationS: raw.duration_s,
    startTime: 0,
    winningTeam: raw.winning_team,
    badge: 0,
    players,
  };
}

/**
 * Las notas de un puñado de partidas, para una cuenta.
 *
 * Devuelve un mapa `matchId → letra`. Las partidas sin muestra suficiente para
 * ese héroe **no entran**: `gradeOf` devuelve `null` y un hueco es honesto.
 */
export async function fetchGrades(
  accountId: number,
  matchIds: number[]
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (matchIds.length === 0) return out;

  await loadReport();
  const ref: ReportFile | null = report();
  if (!ref) return out;

  const q = new URLSearchParams({
    match_ids: matchIds.join(","),
    include_info: "true",
    include_player_kda: "true",
    include_player_final_stats: "true",
  });
  const res = await fetch(`${API}/matches/metadata?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as { match_info?: RawMatch }[] | RawMatch[];

  for (const item of raw) {
    // El endpoint devuelve las partidas envueltas en `match_info` o planas
    // según los `include_*`; se aceptan las dos formas en vez de apostar a una.
    const mi = (item as { match_info?: RawMatch }).match_info ?? (item as RawMatch);
    if (!mi?.players) continue;
    const match = toMatch(mi);
    const yo = match.players.find((p) => p.accountId === accountId);
    if (!yo) continue;
    const g = gradeOf(yo, match, ref);
    if (g) out.set(match.matchId, g.letter);
  }
  return out;
}

/**
 * Carga las notas de las partidas visibles.
 *
 * **Se pide cuando la lista cambia**, no una vez: al apretar "mostrar más" o al
 * filtrar por héroe aparecen partidas nuevas que todavía no tienen nota. El
 * mapa se acumula, así que las que ya se calcularon no se vuelven a pedir.
 */
export function useGrades(accountId: number | null, matchIds: number[]): Map<number, string> {
  const [grades, setGrades] = useState<Map<number, string>>(new Map());

  // La clave de la dependencia es la lista de ids, no el array: un array nuevo
  // con los mismos ids no tiene que disparar otro pedido.
  const clave = matchIds.join(",");

  useEffect(() => {
    if (accountId === null || matchIds.length === 0) return;
    let vivo = true;
    const faltan = matchIds.filter((id) => !grades.has(id));
    if (faltan.length === 0) return;
    fetchGrades(accountId, faltan).then(
      (nuevas) => {
        if (!vivo || nuevas.size === 0) return;
        setGrades((antes) => new Map([...antes, ...nuevas]));
      },
      () => {
        /* sin notas, pero con historial */
      }
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, clave]);

  return grades;
}
