import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SEASONS, seasonParams, type Season } from "./seasons";

/**
 * Los récords del mundo por héroe y por métrica, para los logros del perfil.
 *
 * **Contesta "¿soy el #1 del mundo en kills con Graves?"** sin que el perfil le
 * pida nada a deadlock-api: el scoreboard ordena por 70 métricas y acá se baja
 * el top 10 de cada héroe en las que importan, más el top 100 del mundo entero.
 * Son ~450 pedidos, una vez por día en CI (el límite es 200 por minuto).
 *
 * **Una temporada terminada se congela.** El logro dice "Season 1" y tiene que
 * seguir diciendo lo mismo dentro de un año: cuando la temporada cerró hace más
 * de dos días (para que entren las partidas que la API procesa tarde) se baja
 * una última vez con `final: true` y ya no se vuelve a pedir.
 */

const API = "https://api.deadlock-api.com/v1";
const OUT = "../data/hero-records.json";
const CATALOG = "../data/catalog.json";

/** Las métricas, en el orden en que se muestran. Son nombres de `sort_by`. */
export const METRICS = [
  // El rango: la escalera por héroe y la del mundo, congeladas por temporada.
  "rank",
  "kills",
  "assists",
  "player_damage",
  "net_worth",
  "last_hits",
  "wins",
  "matches",
  "max_kills_per_match",
  "boss_damage",
  "hero_bullets_hit_crit",
] as const;

/** Cuántos puestos por héroe y métrica. Top 10: lo raro es lo que vale. */
const TOP_HERO = 10;
/** Cuántos puestos del mundo entero por métrica. */
const TOP_WORLD = 100;
/** Partidas clasificatorias mínimas con el héroe: el piso de la escalera. */
const MIN_HERO = 20;
/** Partidas clasificatorias mínimas en total: el piso del mundo. */
const MIN_WORLD = 50;
/** Cuánto se espera después del cierre antes de congelar. */
const FREEZE_AFTER_S = 2 * 86400;
/** Una temporada que empezó hace menos que esto no tiene récords que valgan. */
const MIN_AGE_S = 86400;
/** Entre pedido y pedido: 200 por minuto es el tope, esto deja margen. */
const PAUSE_MS = 340;

/**
 * Cuántos jugadores tienen cada logro de temporada, para decir "lo tiene el
 * 0,5 %". Se cuenta sobre las clasificatorias de la temporada, que es lo que
 * mide el scoreboard; los umbrales son los mismos que usa el sitio
 * (`deadlockAchievements.ts`). La racha y las victorias sin morir no tienen
 * métrica en la API y quedan sin porcentaje.
 */
export const SEASON_STEPS = {
  max_kills_per_match: [15, 20, 25, 30],
  max_net_worth_per_match: [65_000, 80_000, 100_000, 120_000],
  matches: [100, 300, 600, 1000],
} as const;
/** Partidas con un héroe en la temporada. */
export const HERO_STEPS = [25, 75, 200, 400];
/** Divisiones del pico de rango: Emissary, Archon, Phantom, Eternus. */
export const PEAK_TIERS = [6, 7, 9, 11];
/** Puntos del último subnivel por temporada, para pasar una división a progreso plano. */
const LAST_SUB: Record<number, number> = { 1: 2000, 2: 1500 };

export interface SeasonRarity {
  /** Jugadores con al menos una clasificatoria en la temporada: el denominador. */
  players: number;
  /** Por métrica, cuántos llegan a cada umbral. */
  feats: Record<string, Record<string, number>>;
  /** Por división, cuántos tuvieron ese pico o más. */
  peak: Record<string, number>;
  /** Por héroe, cuántos llegan a cada umbral de partidas; `players` = los que lo jugaron. */
  heroes: Record<string, Record<string, number>>;
}

export interface SeasonRecords {
  /** `true` = la temporada cerró y esto ya no cambia. */
  final: boolean;
  rarity?: SeasonRarity;
  /** Por héroe, por métrica, los `account_id` en orden. La posición es el puesto. */
  heroes: Record<string, Record<string, number[]>>;
  /** Por métrica, el mundo entero. */
  world: Record<string, number[]>;
}

export interface RecordsFile {
  generatedAt: string;
  metrics: string[];
  seasons: Record<string, SeasonRecords>;
}

/**
 * Qué temporadas hay que bajar en esta corrida.
 *
 * Las congeladas se saltean, las que todavía no empezaron (o empezaron hace
 * menos de un día) también. Todo lo demás se baja, y se marca `final` si ya
 * pasó el margen del cierre.
 */
export function seasonsToBuild(
  seasons: Season[],
  prev: RecordsFile | null,
  now: number
): { season: Season; final: boolean }[] {
  const out: { season: Season; final: boolean }[] = [];
  for (const s of seasons) {
    if (now - s.start < MIN_AGE_S) continue;
    if (prev?.seasons[String(s.id)]?.final) continue;
    out.push({ season: s, final: s.end != null && now - s.end >= FREEZE_AFTER_S });
  }
  return out;
}

/** Los ids en orden, sin repetidos: entre páginas el scoreboard repite alguno. */
export function uniqueIds(rows: { account_id: number }[]): number[] {
  const vistos = new Set<number>();
  const out: number[] = [];
  for (const r of rows) {
    if (vistos.has(r.account_id)) continue;
    vistos.add(r.account_id);
    out.push(r.account_id);
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function top(metric: string, season: Season, heroId: number | null): Promise<number[]> {
  const q = new URLSearchParams({
    sort_by: metric,
    sort_direction: "desc",
    min_matches: String(heroId == null ? MIN_WORLD : MIN_HERO),
    limit: String(heroId == null ? TOP_WORLD : TOP_HERO),
    match_mode: "Ranked",
    ...seasonParams(season),
  });
  if (heroId != null) q.set("hero_id", String(heroId));
  for (let intento = 0; ; intento++) {
    await sleep(PAUSE_MS);
    const res = await fetch(`${API}/analytics/scoreboards/players?${q}`);
    if (res.ok) return uniqueIds((await res.json()) as { account_id: number }[]);
    if (res.status === 429 && intento < 4) {
      await sleep(30_000);
      continue;
    }
    throw new Error(`HTTP ${res.status} en ${metric} / héroe ${heroId ?? "mundo"}`);
  }
}

interface Row {
  rank: number;
  value: number;
  matches: number;
}

async function board(params: Record<string, string>): Promise<Row[]> {
  const q = new URLSearchParams({ match_mode: "Ranked", sort_direction: "desc", ...params });
  for (let intento = 0; ; intento++) {
    await sleep(PAUSE_MS);
    const res = await fetch(`${API}/analytics/scoreboards/players?${q}`);
    if (res.ok) return (await res.json()) as Row[];
    if (res.status === 429 && intento < 4) {
      await sleep(30_000);
      continue;
    }
    throw new Error(`HTTP ${res.status} en el scoreboard (${q.get("sort_by")})`);
  }
}

/**
 * Cuántos jugadores tienen `sort_by` ≥ `min`, sin bajarlos a todos: la lista
 * viene ordenada de mayor a menor, así que se busca con saltos el último
 * puesto que todavía llega (≈ 2·log₂ N pedidos de una fila).
 */
export async function countAtLeast(
  fetchAt: (start: number) => Promise<Row | null>,
  min: number
): Promise<number> {
  const ok = async (i: number) => {
    const r = await fetchAt(i);
    return r != null && r.value >= min;
  };
  if (!(await ok(0))) return 0;
  let lo = 0;
  let hi = 1;
  while (await ok(hi)) {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (await ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo + 1;
}

async function rarityOf(season: Season, heroIds: number[]): Promise<SeasonRarity> {
  const sp = seasonParams(season);
  const at = (sortBy: string) => async (start: number) =>
    (await board({ sort_by: sortBy, min_matches: "1", limit: "1", start: String(start + 1), ...sp }))[0] ?? null;

  const players = await countAtLeast(at("matches"), 1);
  const feats: SeasonRarity["feats"] = {};
  for (const [metric, steps] of Object.entries(SEASON_STEPS)) {
    feats[metric] = {};
    for (const v of steps) feats[metric][String(v)] = await countAtLeast(at(metric), v);
  }
  const tierPts = 5 * 1000 + (LAST_SUB[season.id] ?? 1500);
  const peak: SeasonRarity["peak"] = {};
  for (const t of PEAK_TIERS) peak[String(t)] = await countAtLeast(at("peak_rank"), (t - 1) * tierPts);

  // Por héroe alcanza con bajar a los que pasan el primer umbral y contar.
  const heroes: SeasonRarity["heroes"] = {};
  for (const h of heroIds) {
    const vals: number[] = [];
    for (let start = 0; ; start += 10_000) {
      const page = await board({
        sort_by: "matches",
        hero_id: String(h),
        min_matches: String(HERO_STEPS[0]),
        limit: "10000",
        start: String(start),
        ...sp,
      });
      vals.push(...page.map((r) => r.value));
      if (page.length < 10_000) break;
    }
    if (vals.length === 0) continue;
    // El denominador de la maestría: cuántos jugaron ese héroe en la temporada.
    const atHero = async (start: number) =>
      (await board({ sort_by: "matches", hero_id: String(h), min_matches: "1", limit: "1", start: String(start + 1), ...sp }))[0] ?? null;
    heroes[String(h)] = {
      players: await countAtLeast(atHero, 1),
      ...Object.fromEntries(HERO_STEPS.map((v) => [String(v), vals.filter((x) => x >= v).length])),
    };
  }
  return { players, feats, peak, heroes };
}

async function main() {
  const now = Date.now() / 1000;
  const prev: RecordsFile | null = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as { heroes: Record<string, unknown> };
  const heroIds = Object.keys(catalog.heroes).map(Number);

  const out: RecordsFile = {
    generatedAt: new Date().toISOString(),
    metrics: [...METRICS],
    seasons: { ...(prev?.seasons ?? {}) },
  };

  for (const { season, final } of seasonsToBuild(SEASONS, prev, now)) {
    const rec: SeasonRecords = { final, heroes: {}, world: {} };
    for (const m of METRICS) rec.world[m] = await top(m, season, null);
    for (const h of heroIds) {
      const porMetrica: Record<string, number[]> = {};
      for (const m of METRICS) {
        const ids = await top(m, season, h);
        if (ids.length > 0) porMetrica[m] = ids;
      }
      if (Object.keys(porMetrica).length > 0) rec.heroes[String(h)] = porMetrica;
    }
    rec.rarity = await rarityOf(season, heroIds);
    out.seasons[String(season.id)] = rec;
    console.log(`temporada ${season.id}: ${Object.keys(rec.heroes).length} héroes${final ? " (congelada)" : ""}`);
  }

  writeFileSync(OUT, JSON.stringify(out));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
