import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ladderSeason, seasonParams } from "./seasons";

/**
 * El leaderboard completo de cada héroe, con su puntaje de rendimiento
 * (2026-11-17).
 *
 * `ladder.ts` publica sólo los `account_id` del top 100 por rango, para las
 * medallas del perfil. Esto publica **la tabla entera para mirar**: nombre,
 * país, región del servidor, rango, partidas, winrate, sus números por minuto
 * con el héroe, sus tres héroes más jugados y el puntaje.
 *
 * Un archivo por héroe (`hero-boards/<id>.json`): la página de un héroe baja
 * sólo el suyo.
 *
 * **Se corre una vez por día**, no cada dos horas: son ~15 pedidos por héroe y
 * `hero-stats` tarda varios segundos por tanda.
 */

const API = "https://api.deadlock-api.com/v1";
const OUT_DIR = "../data/hero-boards";
const CATALOG = "../data/catalog.json";

/** El piso de partidas con el héroe: el mismo de `ladder.ts` y del juego. */
export const MIN_MATCHES = 20;
/** Cuántos de la población se miden. Con más, la regresión no cambia y tarda el doble. */
const POOL = 1000;
/** Cuántos se publican por cada orden (rango y puntaje); la unión va al archivo. */
const TOP = 100;
/**
 * `hero-stats` devuelve 500 con 200 cuentas por pedido y anda con 150
 * (medido el 2026-11-17); 100 deja margen.
 */
const BATCH = 100;
const RANKED = "Ranked";

const LADDER = ladderSeason();
const SEASON_Q = seasonParams(LADDER.season);

// ─── Regiones ────────────────────────────────────────────────────────────────

export type Region = "NA" | "EU" | "SA" | "AS" | "OC";

/**
 * La región del servidor, de los nombres que da `/v1/players/region`.
 *
 * **Tiene que decir lo mismo que `regionOf` de `site/src/deadlockRegions.ts`**:
 * las tablas por héroe salen de acá y las de estadísticas se arman en vivo con
 * la del sitio. Valores vistos el 2026-11-17 sobre el top 1.000: `eu_west`,
 * `eu_north`, `dpkt-frankfurt`, `dpkt-stockholm`, `london`, `helsinki`,
 * `falkenstein`, `poland`, `us_*`, `australia`, `hong_kong`, `argentina`,
 * `south_america`.
 */
export function regionOf(server: string | null | undefined): Region | null {
  if (!server) return null;
  const s = server.toLowerCase();
  if (/^(us_|usa|canada)/.test(s)) return "NA";
  if (/(south_america|argentina|brazil|sao_paulo|chile|santiago|peru|lima|colombia|bogota)/.test(s)) return "SA";
  if (/(australia|sydney|oceania|new_zealand|auckland)/.test(s)) return "OC";
  if (/(hong_kong|singapore|japan|tokyo|korea|seoul|china|shanghai|guangzhou|taiwan|india|mumbai|chennai|asia|dubai|bahrain)/.test(s)) return "AS";
  if (/^(eu_|dpkt-|europe)|london|helsinki|falkenstein|poland|warsaw|stockholm|frankfurt|amsterdam|paris|madrid|vienna|luxembourg/.test(s)) return "EU";
  return null;
}

// ─── El puntaje ──────────────────────────────────────────────────────────────

/** Lo que `/v1/players/hero-stats` devuelve por cuenta y héroe (lo que se usa). */
export interface HeroStatsRow {
  account_id: number;
  hero_id: number;
  matches_played: number;
  wins: number;
  kills_per_min: number;
  deaths_per_min: number;
  assists_per_min: number;
  networth_per_min: number;
  damage_per_min: number;
  obj_damage_per_min: number;
  accuracy: number;
  mvp_rank_counts?: number[];
  mvp_rated_matches?: number;
}

export interface PoolEntry {
  accountId: number;
  /** Progreso plano del rango: crece mil por subnivel (`sort_by=rank`). */
  progress: number;
  badge?: number;
  stats: HeroStatsRow;
}

/**
 * Los pesos del puntaje. Suman 1.
 *
 * **El rango pesa más que todo lo demás junto, y es a propósito**: el winrate
 * y los números por minuto dependen de contra quién se juega (ver el
 * comentario de `topOf` en `ladder.ts`). Medido el 2026-11-17 con Abrams: sin
 * corregir por rango, los dos primeros eran un Ritualist y un Arcanist con
 * 78–85% de victorias en 20 partidas.
 */
export const WEIGHTS = { rank: 0.55, win: 0.2, stats: 0.15, mvp: 0.1 } as const;

/** Los números de juego y cuánto pesan dentro de `stats`. Morir resta. */
const STATS: [(h: HeroStatsRow) => number, number][] = [
  [(h) => h.kills_per_min, 1],
  [(h) => -h.deaths_per_min, 1],
  [(h) => h.assists_per_min, 0.5],
  [(h) => h.networth_per_min, 1],
  [(h) => h.damage_per_min, 1],
  [(h) => h.obj_damage_per_min, 0.5],
];

/** Partidas "de más" que achican a la mitad lo que dice una muestra chica. */
const SHRINK = 20;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

/** Cada valor en desvíos estándar respecto de la población. */
export function zScores(xs: number[]): number[] {
  const m = mean(xs);
  const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1;
  return xs.map((x) => (x - m) / sd);
}

/**
 * Lo que queda de `y` después de sacarle lo que explica el rango: una recta de
 * mínimos cuadrados contra el progreso. Positivo = rinde más que lo esperable
 * para alguien de su rango.
 */
export function residuals(x: number[], y: number[]): number[] {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  x.forEach((xi, i) => {
    sxy += (xi - mx) * (y[i] - my);
    sxx += (xi - mx) ** 2;
  });
  const b = sxx > 0 ? sxy / sxx : 0;
  return y.map((yi, i) => yi - (my + b * (x[i] - mx)));
}

/** La tasa de MVP: primero vale 1, segundo 0,6, tercero 0,3. */
export function mvpRate(h: HeroStatsRow): number {
  const c = h.mvp_rank_counts ?? [];
  const n = h.mvp_rated_matches ?? 0;
  if (n <= 0) return 0;
  return ((c[0] ?? 0) + 0.6 * (c[1] ?? 0) + 0.3 * (c[2] ?? 0)) / n;
}

export interface Scored {
  accountId: number;
  /** El puntaje compuesto, en desvíos estándar. */
  raw: number;
  /** De 0 a 100: qué parte de la población queda por debajo. */
  score: number;
  /** El puesto por rango (1 = el de más progreso). */
  rankPlace: number;
  /** El puesto por puntaje. */
  scorePlace: number;
}

/**
 * El puntaje de rendimiento de cada uno en la población de un héroe.
 *
 * Rango (z del progreso) + victorias, números y MVP **medidos contra lo
 * esperable para su rango** (residuos) y **achicados por muestra chica**
 * (`n / (n + 20)`): con 20 partidas lo que digan pesa la mitad.
 */
export function scorePool(pool: PoolEntry[]): Scored[] {
  if (pool.length === 0) return [];
  const prog = pool.map((p) => p.progress);
  const shrink = (z: number[]) =>
    z.map((v, i) => (v * pool[i].stats.matches_played) / (pool[i].stats.matches_played + SHRINK));

  const statSum = pool.map(() => 0);
  let wsum = 0;
  for (const [f, w] of STATS) {
    zScores(residuals(prog, pool.map((p) => f(p.stats)))).forEach((z, i) => (statSum[i] += w * z));
    wsum += w;
  }
  const statZ = shrink(zScores(statSum.map((s) => s / wsum)));
  const winZ = shrink(zScores(residuals(prog, pool.map((p) => p.stats.wins / Math.max(1, p.stats.matches_played)))));
  const mvpZ = shrink(zScores(residuals(prog, pool.map((p) => mvpRate(p.stats)))));
  const rankZ = zScores(prog);

  const raw = pool.map(
    (_, i) => WEIGHTS.rank * rankZ[i] + WEIGHTS.win * winZ[i] + WEIGHTS.stats * statZ[i] + WEIGHTS.mvp * mvpZ[i]
  );

  const byRank = pool
    .map((p, i) => ({ i, v: p.progress, m: p.stats.matches_played }))
    .sort((a, b) => b.v - a.v || b.m - a.m);
  const rankPlace = new Map(byRank.map((x, k) => [x.i, k + 1]));
  const byScore = raw.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
  const n = pool.length;

  const out: Scored[] = pool.map((p, i) => ({
    accountId: p.accountId,
    raw: raw[i],
    score: 0,
    rankPlace: rankPlace.get(i)!,
    scorePlace: 0,
  }));
  byScore.forEach(({ i }, k) => {
    out[i].scorePlace = k + 1;
    // El primero es 100 y el último roza 0: la parte de la población que queda debajo.
    out[i].score = Math.round(((n - k - 1) / Math.max(1, n - 1)) * 1000) / 10;
  });
  return out;
}

// ─── El archivo ──────────────────────────────────────────────────────────────

/** Una fila de la tabla. */
export interface BoardRow {
  id: number;
  name?: string;
  cc?: string;
  reg?: Region;
  badge?: number;
  /** Partidas y ganadas con el héroe. */
  m: number;
  w: number;
  /** Por minuto con el héroe: kills, muertes, asistencias, almas y daño. */
  kpm: number;
  dpm: number;
  apm: number;
  nw: number;
  dmg: number;
  score: number;
  rp: number;
  sp: number;
  /** Sus héroes más jugados en la temporada, de más a menos. */
  top: number[];
}

/**
 * Las columnas del archivo, en orden. **Cada fila va como lista y no como
 * objeto**: son ~300 filas por héroe y 38 archivos que cambian todos los días;
 * repetir los nombres de los campos en cada fila duplicaba el peso.
 * `site/src/deadlockHeroBoards.ts` las lee con esta misma lista.
 */
export const COLS = ["id", "name", "cc", "reg", "badge", "m", "w", "kpm", "dpm", "apm", "nw", "dmg", "score", "rp", "sp", "top"] as const;

export type PackedRow = (string | number | number[] | null)[];

export function packRow(r: BoardRow): PackedRow {
  return COLS.map((k) => (r[k] ?? null) as string | number | number[] | null);
}

export interface HeroBoardFile {
  generatedAt: string;
  heroId: number;
  season: number;
  seasonFinal: boolean;
  minMatches: number;
  /** Cuántos tienen el piso con el héroe (sobre esos se mide el puntaje). */
  pool: number;
  cols: readonly string[];
  rows: PackedRow[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r0 = (x: number) => Math.round(x);

/** Cuántos se publican por región y por orden, además del top del mundo. */
const TOP_REGION = 50;

/**
 * Las filas que se publican: el top del mundo por rango y por puntaje, y el de
 * cada región por los dos órdenes. **Sin el de cada región, filtrar por
 * Sudamérica sobre el top 100 del mundo dejaba tres filas.**
 */
export function pickRows(
  scored: Scored[],
  regionBy: Map<number, Region | null> = new Map(),
  top = TOP,
  topRegion = TOP_REGION
): Set<number> {
  const keep = new Set<number>();
  for (const s of scored) if (s.rankPlace <= top || s.scorePlace <= top) keep.add(s.accountId);
  for (const key of ["rankPlace", "scorePlace"] as const) {
    const cuenta = new Map<Region, number>();
    for (const s of [...scored].sort((a, b) => a[key] - b[key])) {
      const reg = regionBy.get(s.accountId);
      if (!reg) continue;
      const n = cuenta.get(reg) ?? 0;
      if (n >= topRegion) continue;
      cuenta.set(reg, n + 1);
      keep.add(s.accountId);
    }
  }
  return keep;
}

// ─── Los pedidos ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get<T>(url: string, tries = 3): Promise<T> {
  for (let k = 1; ; k++) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as T;
    if (k >= tries) throw new Error(`HTTP ${res.status} en ${url.slice(0, 90)}…`);
    await sleep(5000 * k);
  }
}

const ids = (xs: number[]) => xs.map((x) => `account_ids=${x}`).join("&");

function seasonQ(): string {
  return new URLSearchParams({ match_mode: RANKED, ...SEASON_Q }).toString();
}

interface RawRankRow {
  account_id: number;
  value: number;
  matches: number;
  badge?: number;
}

async function heroStats(accounts: number[], heroId?: number): Promise<HeroStatsRow[]> {
  const out: HeroStatsRow[] = [];
  for (let k = 0; k < accounts.length; k += BATCH) {
    const part = accounts.slice(k, k + BATCH);
    const hero = heroId ? `&hero_ids=${heroId}` : "";
    out.push(...(await get<HeroStatsRow[]>(`${API}/players/hero-stats?${ids(part)}${hero}&${seasonQ()}`)));
    await sleep(500);
  }
  return out;
}

/** Caches entre héroes: el mismo jugador aparece en varias tablas. */
const topHeroes = new Map<number, number[]>();
const regions = new Map<number, Region | null>();
const steam = new Map<number, { name?: string; cc?: string }>();

async function fillTopHeroes(accounts: number[]) {
  const faltan = accounts.filter((a) => !topHeroes.has(a));
  if (faltan.length === 0) return;
  const rows = await heroStats(faltan);
  const por = new Map<number, HeroStatsRow[]>();
  for (const r of rows) (por.get(r.account_id) ?? por.set(r.account_id, []).get(r.account_id)!).push(r);
  for (const a of faltan) {
    const hs = (por.get(a) ?? []).sort((x, y) => y.matches_played - x.matches_played);
    topHeroes.set(a, hs.slice(0, 3).map((h) => h.hero_id));
  }
}

async function fillRegions(accounts: number[]) {
  const faltan = accounts.filter((a) => !regions.has(a));
  for (let k = 0; k < faltan.length; k += 500) {
    const part = faltan.slice(k, k + 500);
    try {
      const r = await get<{ account_id: number; region: string | null }[]>(`${API}/players/region?${ids(part)}`);
      for (const x of r) regions.set(x.account_id, regionOf(x.region));
    } catch (e) {
      console.warn(`  región: ${(e as Error).message}`);
    }
    for (const a of part) if (!regions.has(a)) regions.set(a, null);
  }
}

async function fillSteam(accounts: number[]) {
  const faltan = accounts.filter((a) => !steam.has(a));
  for (let k = 0; k < faltan.length; k += 100) {
    const part = faltan.slice(k, k + 100);
    try {
      const r = await get<{ account_id: number; personaname?: string; countrycode?: string }[]>(
        `${API}/players/steam?${ids(part)}`
      );
      for (const s of r) steam.set(s.account_id, { name: s.personaname, cc: s.countrycode });
    } catch (e) {
      console.warn(`  steam: ${(e as Error).message}`);
    }
    for (const a of part) if (!steam.has(a)) steam.set(a, {});
  }
}

async function boardOf(heroId: number): Promise<HeroBoardFile | null> {
  const q = new URLSearchParams({
    sort_by: "rank",
    sort_direction: "desc",
    min_matches: String(MIN_MATCHES),
    limit: String(POOL),
    hero_id: String(heroId),
    match_mode: RANKED,
    ...SEASON_Q,
  });
  const rank = await get<RawRankRow[]>(`${API}/analytics/scoreboards/players?${q}`);
  // Sin repetidos: entre páginas el scoreboard repite alguna cuenta (ver `byProgress`).
  const vistos = new Set<number>();
  const unicos = rank.filter((r) => !vistos.has(r.account_id) && vistos.add(r.account_id));
  if (unicos.length === 0) return null;

  const stats = await heroStats(unicos.map((r) => r.account_id), heroId);
  const byAcc = new Map(stats.map((s) => [s.account_id, s]));
  const pool: PoolEntry[] = unicos
    .filter((r) => (byAcc.get(r.account_id)?.matches_played ?? 0) >= MIN_MATCHES)
    .map((r) => ({ accountId: r.account_id, progress: r.value, badge: r.badge, stats: byAcc.get(r.account_id)! }));

  const scored = scorePool(pool);
  // La región de toda la población, antes de elegir: decide quién entra al top de cada una.
  await fillRegions(pool.map((p) => p.accountId));
  const keep = pickRows(scored, regions);
  const accounts = [...keep];
  await fillTopHeroes(accounts);
  await fillSteam(accounts);

  const poolBy = new Map(pool.map((p) => [p.accountId, p]));
  const rows: BoardRow[] = scored
    .filter((s) => keep.has(s.accountId))
    .sort((a, b) => a.rankPlace - b.rankPlace)
    .map((s) => {
      const p = poolBy.get(s.accountId)!;
      const h = p.stats;
      const st = steam.get(s.accountId) ?? {};
      const reg = regions.get(s.accountId);
      return {
        id: s.accountId,
        ...(st.name ? { name: st.name } : {}),
        ...(st.cc ? { cc: st.cc } : {}),
        ...(reg ? { reg } : {}),
        ...(p.badge ? { badge: p.badge } : {}),
        m: h.matches_played,
        w: h.wins,
        kpm: r2(h.kills_per_min),
        dpm: r2(h.deaths_per_min),
        apm: r2(h.assists_per_min),
        nw: r0(h.networth_per_min),
        dmg: r0(h.damage_per_min),
        score: s.score,
        rp: s.rankPlace,
        sp: s.scorePlace,
        top: topHeroes.get(s.accountId) ?? [],
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    heroId,
    season: LADDER.season.id,
    seasonFinal: LADDER.final,
    minMatches: MIN_MATCHES,
    pool: pool.length,
    cols: COLS,
    rows: rows.map(packRow),
  };
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as { heroes: Record<string, unknown> };
  const only = process.argv.slice(2).map(Number).filter(Boolean);
  const heroIds = only.length ? only : Object.keys(catalog.heroes).map(Number).sort((a, b) => a - b);
  console.log(`tablas por héroe: ${heroIds.length} héroes, temporada ${LADDER.season.id}`);
  mkdirSync(OUT_DIR, { recursive: true });

  let hechos = 0;
  for (const id of heroIds) {
    const t = Date.now();
    try {
      const board = await boardOf(id);
      if (!board) {
        console.log(`  héroe ${id}: nadie con ${MIN_MATCHES}+ partidas`);
        continue;
      }
      writeFileSync(`${OUT_DIR}/${id}.json`, JSON.stringify(board));
      hechos++;
      const kb = (JSON.stringify(board).length / 1024).toFixed(1);
      console.log(`  héroe ${id}: ${board.pool} medidos, ${board.rows.length} filas, ${kb} KB, ${((Date.now() - t) / 1000).toFixed(0)} s`);
    } catch (e) {
      // Un héroe que falla no se lleva al resto: queda el archivo de la corrida anterior.
      console.warn(`  héroe ${id}: ${(e as Error).message}`);
    }
    await sleep(1000);
  }
  console.log(`listo: ${hechos} tablas`);
  if (hechos === 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
