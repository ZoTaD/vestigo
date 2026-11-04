/**
 * Saca (o completa) la foto del top 100 de la temporada que está por cerrar.
 *
 * `npm run snapshot:season` — la corre `snapshot-season.yml` varias veces el
 * día del cierre. Ver `seasonSnapshot.ts` para por qué combina corridas.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { SEASONS } from "./seasons";
import {
  keepBest,
  pickRank,
  rankTop,
  type PoolRow,
  type RankRead,
  type SeasonRanksFile,
  type SeasonSnapshotFile,
} from "./seasonSnapshot";

const API = "https://api.deadlock-api.com/v1";
/** La temporada de la foto. Cuando cierre la 2, se cambia acá. */
const SEASON = 1;
const MIN_MATCHES = 50;
const TOP = 100;
const OUT = `../data/season${SEASON}Top100.json`;
const RANKS = `../data/season${SEASON}Ranks.json`;
/**
 * Pasados estos días del cierre la corrida no hace nada: el rango final ya no
 * se puede leer y las partidas no cambian. Evita que el cron del año que viene
 * (no lleva año) toque la foto.
 */
const STALE_DAYS = 3;
/** `/v1/players/rank`: 20 pedidos por minuto por IP. */
const RANK_GAP_MS = 3100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T> {
  for (let intento = 0; ; intento++) {
    const res = await fetch(url);
    if (res.status === 429 && intento < 5) {
      const espera = Number(res.headers.get("retry-after") ?? 0) * 1000 || 4000 * 2 ** intento;
      console.log(`  429, esperando ${Math.round(espera / 1000)}s`);
      await sleep(espera);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url.slice(0, 90)}`);
    return (await res.json()) as T;
  }
}

async function poolOf(start: number, end: number): Promise<PoolRow[]> {
  const out: PoolRow[] = [];
  for (let from = 0; ; from += 10_000) {
    const q = new URLSearchParams({
      sort_by: "winrate",
      sort_direction: "desc",
      min_matches: String(MIN_MATCHES),
      limit: "10000",
      start: String(from),
      match_mode: "Ranked",
      min_unix_timestamp: String(start),
      max_unix_timestamp: String(end),
    });
    const page = await getJson<{ account_id: number; value: number; matches: number }[]>(
      `${API}/analytics/scoreboards/players?${q}`
    );
    for (const r of page) {
      out.push({ accountId: r.account_id, wins: Math.round(r.value * r.matches), matches: r.matches });
    }
    if (page.length < 10_000) break;
  }
  // Entre páginas el scoreboard repite cuentas (72 de 135.891 el 4/11): una
  // cuenta repetida podría ocupar dos puestos del top.
  const vistos = new Set<number>();
  return out.filter((p) => !vistos.has(p.accountId) && vistos.add(p.accountId));
}

interface RawRank {
  account_id: number;
  badge?: number;
  last_match?: { start_time?: number; player_rank_final_flat_progress?: number } | null;
}

async function ranksOf(ids: number[]): Promise<Map<number, RankRead>> {
  const out = new Map<number, RankRead>();
  for (let i = 0; i < ids.length; i += 1000) {
    if (i > 0) await sleep(RANK_GAP_MS);
    const q = ids.slice(i, i + 1000).map((id) => `account_ids=${id}`).join("&");
    for (const r of await getJson<RawRank[]>(`${API}/players/rank?${q}`)) {
      out.set(r.account_id, {
        badge: r.badge ?? 0,
        progress: r.last_match?.player_rank_final_flat_progress ?? 0,
        at: r.last_match?.start_time ?? 0,
      });
    }
  }
  return out;
}

async function main() {
  const season = SEASONS.find((s) => s.id === SEASON);
  if (!season?.end) throw new Error(`la temporada ${SEASON} no tiene fin en seasons.ts`);
  const now = Date.now() / 1000;
  if (now > season.end + STALE_DAYS * 86400) {
    console.log(`la temporada ${SEASON} cerró hace más de ${STALE_DAYS} días: la foto queda como está`);
    return;
  }

  const prev: SeasonSnapshotFile | null = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : null;
  const prevRanks: SeasonRanksFile = existsSync(RANKS) ? JSON.parse(readFileSync(RANKS, "utf8")) : {};

  const pool = await poolOf(season.start, season.end);
  console.log(`temporada ${SEASON}: ${pool.length} jugadores con ${MIN_MATCHES}+ clasificatorias`);

  const fresh = await ranksOf(pool.map((p) => p.accountId));
  const ranks = new Map<number, RankRead>();
  let nuevos = 0;
  let deLaSiguiente = 0;
  for (const p of pool) {
    const f = fresh.get(p.accountId);
    if (f && f.at >= season.end) deLaSiguiente++;
    const r = pickRank(prevRanks[p.accountId], f, season.end);
    if (r) ranks.set(p.accountId, r);
    if (r && r === f) nuevos++;
  }
  console.log(
    `  ${ranks.size} con rango de la temporada (${nuevos} leídos ahora, ` +
      `${deLaSiguiente} ya jugaron la siguiente y se usa lo guardado)`
  );

  const top = rankTop(pool, ranks, TOP);
  const steam = await getJson<{ account_id: number; personaname?: string; countrycode?: string }[]>(
    `${API}/players/steam?${top.map((r) => `account_ids=${r.accountId}`).join("&")}`
  ).catch(() => []);
  const byId = new Map(steam.map((s) => [s.account_id, s]));
  const prevTop = new Map(prev?.top.map((r) => [r.accountId, r]) ?? []);

  const file: SeasonSnapshotFile = {
    season: SEASON,
    start: season.start,
    end: season.end,
    generatedAt: new Date().toISOString(),
    minMatches: MIN_MATCHES,
    eligible: pool.length,
    top: top.map((r) => {
      const s = byId.get(r.accountId);
      const viejo = prevTop.get(r.accountId);
      const name = s?.personaname ?? viejo?.name;
      const country = s?.countrycode ?? viejo?.country;
      return { ...r, ...(name ? { name } : {}), ...(country ? { country } : {}) };
    }),
  };
  writeFileSync(OUT, JSON.stringify(file));
  writeFileSync(RANKS, JSON.stringify(keepBest(ranks)));
  const kb = (readFileSync(OUT).length / 1024).toFixed(1);
  console.log(`  top ${file.top.length} guardado en ${OUT} (${kb} KB); #1 ${file.top[0]?.name ?? file.top[0]?.accountId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
