import { ladderSeason, seasonParams } from "./deadlockSeasons";
import { fetchRegions, type Region } from "./deadlockRegions";

/**
 * Los leaderboards por estadística (2026-11-17): quién mata más, quién muere
 * menos, quién más partidas jugó…
 *
 * **Se piden en vivo**, no en el pipeline: cada combinación de estadística,
 * héroe y región es un pedido distinto, y publicarlas todas serían miles de
 * tablas que casi nadie abre. Son tres pedidos por vista: el scoreboard, la
 * región y los nombres.
 */

const API = "https://api.deadlock-api.com/v1";

export type StatKey =
  | "matches"
  | "wins"
  | "winrate"
  | "avg_kills_per_match"
  | "avg_deaths_per_match"
  | "avg_assists_per_match"
  | "avg_player_damage_per_match"
  | "avg_net_worth_per_match"
  | "avg_last_hits_per_match"
  | "avg_denies_per_match"
  | "avg_boss_damage_per_match"
  | "max_kills_per_match"
  | "max_player_damage_per_match"
  | "max_net_worth_per_match";

export interface StatDef {
  key: StatKey;
  /** Morir menos es mejor: esa tabla va de menor a mayor. */
  asc?: boolean;
  /** Cómo se escribe el valor. */
  kind: "int" | "dec" | "pct";
  /** Los récords de una partida no necesitan piso alto: es un pico, no un promedio. */
  record?: boolean;
}

export const STATS: StatDef[] = [
  { key: "matches", kind: "int" },
  { key: "wins", kind: "int" },
  { key: "winrate", kind: "pct" },
  { key: "avg_kills_per_match", kind: "dec" },
  { key: "avg_deaths_per_match", kind: "dec", asc: true },
  { key: "avg_assists_per_match", kind: "dec" },
  { key: "avg_player_damage_per_match", kind: "int" },
  { key: "avg_net_worth_per_match", kind: "int" },
  { key: "avg_last_hits_per_match", kind: "dec" },
  { key: "avg_denies_per_match", kind: "dec" },
  { key: "avg_boss_damage_per_match", kind: "int" },
  { key: "max_kills_per_match", kind: "int", record: true },
  { key: "max_player_damage_per_match", kind: "int", record: true },
  { key: "max_net_worth_per_match", kind: "int", record: true },
];

/**
 * El piso de partidas. Con héroe, 20 (el del juego para sus tablas por héroe);
 * sin héroe, 50 (el de su tabla global). Sin piso, un promedio de dos partidas
 * encabeza todo.
 */
export const floorFor = (hero: number | null) => (hero ? 20 : 50);

export interface StatRow {
  place: number;
  accountId: number;
  value: number;
  matches: number;
  name?: string;
  cc?: string;
  reg?: Region | null;
}

/** Cuántas se muestran. */
export const SHOW = 100;
/**
 * Cuántas se piden cuando hay región: el filtro es de este lado, y de las 100
 * primeras del mundo quedarían pocas de Oceanía.
 */
const POOL_REGION = 1000;

export async function fetchStatBoard(opts: { stat: StatKey; hero: number | null; region: Region | null }): Promise<StatRow[]> {
  const def = STATS.find((s) => s.key === opts.stat)!;
  const q = new URLSearchParams({
    sort_by: opts.stat,
    sort_direction: def.asc ? "asc" : "desc",
    min_matches: String(floorFor(opts.hero)),
    match_mode: "Ranked",
    limit: String(opts.region ? POOL_REGION : SHOW),
    ...seasonParams(ladderSeason().season),
  });
  if (opts.hero) q.set("hero_id", String(opts.hero));
  const res = await fetch(`${API}/analytics/scoreboards/players?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as { account_id: number; value: number; matches: number }[];

  const vistos = new Set<number>();
  let rows: StatRow[] = raw
    .filter((r) => !vistos.has(r.account_id) && vistos.add(r.account_id))
    .map((r) => ({ place: 0, accountId: r.account_id, value: r.value, matches: r.matches }));

  const regiones = await fetchRegions(rows.map((r) => r.accountId));
  for (const r of rows) r.reg = regiones.get(r.accountId) ?? null;
  if (opts.region) rows = rows.filter((r) => r.reg === opts.region);
  rows = rows.slice(0, SHOW).map((r, i) => ({ ...r, place: i + 1 }));

  if (rows.length > 0) {
    try {
      const s = await fetch(`${API}/players/steam?${rows.map((r) => `account_ids=${r.accountId}`).join("&")}`);
      if (s.ok) {
        const by = new Map(((await s.json()) as { account_id: number; personaname?: string; countrycode?: string }[]).map((x) => [x.account_id, x]));
        for (const r of rows) {
          const x = by.get(r.accountId);
          if (x?.personaname) r.name = x.personaname;
          if (x?.countrycode) r.cc = x.countrycode;
        }
      }
    } catch {
      /* sin nombres, pero con tabla */
    }
  }
  return rows;
}

export function formatStat(def: StatDef, v: number, locale: string): string {
  if (def.kind === "pct") return `${(v * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
  if (def.kind === "dec") return v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return Math.round(v).toLocaleString(locale);
}
