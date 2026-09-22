import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { badgeRange } from "./abilities";
import { BANDS, type BandId } from "./bands";

/**
 * Lo que la página de un héroe cuenta además de su kit, medido en la API en vivo
 * de deadlock-api, por banda:
 *
 *   npm run build:hero-insights
 *
 * - **La curva diaria** de winrate de los últimos 30 días.
 * - **Los promedios por partida** (bajas, daño, almas…) de cada héroe, para
 *   ubicarlo contra los otros 37.
 * - **Los enfrentamientos**: su winrate contra cada rival y junto a cada aliado.
 *
 * Todo sale de tres endpoints (`hero-stats`, `hero-counter-stats`,
 * `hero-synergy-stats`) filtrados por la misma insignia que la banda, igual que
 * `liveStats.ts` y `abilities.ts`. **La ventana de los promedios y de los
 * enfrentamientos es la de la tier list publicada** (`from`/`to` de
 * `heroes.<banda>.json`): la página de un héroe no puede decir que gana 53 % en
 * la cabecera y medir sus rivales sobre otras partidas.
 *
 * Si la API no contesta, la banda se saltea y queda el archivo que había: de la
 * API en vivo no depende que se publique la tier list.
 */

const API = "https://api.deadlock-api.com/v1/analytics";
const OUT_DIR = "../data";
const DAYS = 30;

/**
 * Cuántas partidas hacen falta para publicar un cruce.
 *
 * En Fantasma+ un héroe juega unas 2.000 partidas en la ventana; repartidas
 * entre 37 rivales son ~300 por rival, y los héroes menos jugados quedan en
 * ~100. Debajo de 100 el error estándar de un winrate pasa los 5 puntos, que es
 * más que la diferencia que se quiere mostrar.
 */
export const MIN_PAIR = 100;

export const METRICS = [
  "kills",
  "deaths",
  "assists",
  "netWorth",
  "playerDamage",
  "damageTaken",
  "objectiveDamage",
  "lastHits",
  "accuracy",
] as const;
export type Metric = (typeof METRICS)[number];

/** [día ISO, partidas, victorias] */
export type DayPoint = [string, number, number];
/** [id del otro héroe, partidas, victorias] */
export type PairPoint = [number, number, number];

export interface HeroInsight {
  daily: DayPoint[];
  perMatch: Partial<Record<Metric, number>>;
  /** Contra cada rival con muestra suficiente, de peor a mejor. */
  vs: PairPoint[];
  /** Junto a cada aliado con muestra suficiente, de mejor a peor. */
  with: PairPoint[];
}

export interface HeroInsightsFile {
  generatedAt: string;
  band: BandId;
  /** La ventana de los promedios y los cruces: la de la tier list. */
  from: string;
  to: string;
  /** El parche vigente, para marcarlo en la curva. */
  patch?: string;
  minPair: number;
  heroes: Record<string, HeroInsight>;
}

export interface StatsRow {
  hero_id: number;
  bucket?: number;
  wins: number;
  matches: number;
  total_kills?: number;
  total_deaths?: number;
  total_assists?: number;
  total_net_worth?: number;
  total_player_damage?: number;
  total_player_damage_taken?: number;
  total_boss_damage?: number;
  total_last_hits?: number;
  total_shots_hit?: number;
  total_shots_missed?: number;
}

export interface CounterRow {
  hero_id: number;
  enemy_hero_id: number;
  wins: number;
  matches_played: number;
}

export interface SynergyRow {
  hero_id1: number;
  hero_id2: number;
  wins: number;
  matches_played: number;
}

const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Promedios por partida de una fila de `hero-stats`. */
export function perMatchOf(row: StatsRow): Partial<Record<Metric, number>> {
  const m = row.matches;
  if (!m) return {};
  const por = (v: number | undefined) => (v === undefined ? undefined : r(v / m, 2));
  const tiros = (row.total_shots_hit ?? 0) + (row.total_shots_missed ?? 0);
  const out: Partial<Record<Metric, number | undefined>> = {
    kills: por(row.total_kills),
    deaths: por(row.total_deaths),
    assists: por(row.total_assists),
    netWorth: por(row.total_net_worth),
    playerDamage: por(row.total_player_damage),
    damageTaken: por(row.total_player_damage_taken),
    objectiveDamage: por(row.total_boss_damage),
    lastHits: por(row.total_last_hits),
    accuracy: tiros > 0 ? r((row.total_shots_hit ?? 0) / tiros, 4) : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Partial<Record<Metric, number>>;
}

const dia = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

/**
 * Arma el archivo de una banda con las cuatro respuestas.
 *
 * Separado del `main` para probarlo sin red. `heroIds` son los héroes que el
 * sitio publica: la API también contesta por héroes de prueba.
 */
export function buildInsights(
  band: BandId,
  heroIds: number[],
  window: { from: string; to: string; patch?: string },
  totals: StatsRow[],
  daily: StatsRow[],
  counters: CounterRow[],
  synergies: SynergyRow[],
  generatedAt: string
): HeroInsightsFile {
  const publicados = new Set(heroIds);
  const heroes: Record<string, HeroInsight> = {};
  for (const id of heroIds) heroes[String(id)] = { daily: [], perMatch: {}, vs: [], with: [] };

  for (const row of totals) {
    if (publicados.has(row.hero_id)) heroes[String(row.hero_id)].perMatch = perMatchOf(row);
  }
  for (const row of [...daily].sort((a, b) => (a.bucket ?? 0) - (b.bucket ?? 0))) {
    if (!publicados.has(row.hero_id) || row.bucket === undefined || row.matches === 0) continue;
    heroes[String(row.hero_id)].daily.push([dia(row.bucket), row.matches, row.wins]);
  }
  for (const c of counters) {
    if (c.hero_id === c.enemy_hero_id || c.matches_played < MIN_PAIR) continue;
    if (!publicados.has(c.hero_id) || !publicados.has(c.enemy_hero_id)) continue;
    heroes[String(c.hero_id)].vs.push([c.enemy_hero_id, c.matches_played, c.wins]);
  }
  for (const s of synergies) {
    if (s.hero_id1 === s.hero_id2 || s.matches_played < MIN_PAIR) continue;
    if (!publicados.has(s.hero_id1) || !publicados.has(s.hero_id2)) continue;
    // Un par cuenta para los dos: la victoria es del equipo.
    heroes[String(s.hero_id1)].with.push([s.hero_id2, s.matches_played, s.wins]);
    heroes[String(s.hero_id2)].with.push([s.hero_id1, s.matches_played, s.wins]);
  }
  const wr = (p: PairPoint) => p[2] / p[1];
  for (const h of Object.values(heroes)) {
    h.vs.sort((a, b) => wr(a) - wr(b));
    h.with.sort((a, b) => wr(b) - wr(a));
  }

  return {
    generatedAt,
    band,
    from: window.from,
    to: window.to,
    ...(window.patch ? { patch: window.patch } : {}),
    minPair: MIN_PAIR,
    heroes,
  };
}

async function traer<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`${path.split("?")[0]} contestó ${res.status}`);
  return (await res.json()) as T;
}

interface TierListFile {
  from?: string;
  to?: string;
  patch?: { date?: string };
  heroes?: { heroId: number }[];
}

async function main() {
  const now = new Date();
  const unix = (d: Date | string) => Math.floor((typeof d === "string" ? Date.parse(d) : d.getTime()) / 1000);
  const hace30 = new Date(now.getTime() - DAYS * 86_400_000);

  for (const band of BANDS) {
    const tierList = `${OUT_DIR}/heroes.${band.id}.json`;
    if (!existsSync(tierList)) {
      console.log(`  ${band.id}: no hay ${tierList}, la salteo`);
      continue;
    }
    const tl = JSON.parse(readFileSync(tierList, "utf8")) as TierListFile;
    const heroIds = (tl.heroes ?? []).map((h) => h.heroId);
    // `to` es el último día medido: la ventana lo incluye entero.
    const from = tl.from ?? hace30.toISOString().slice(0, 10);
    const to = tl.to ?? now.toISOString().slice(0, 10);
    const hasta = unix(`${to}T23:59:59Z`);
    const badge = badgeRange(band.tiers);
    const q = `min_average_badge=${badge.min}&max_average_badge=${badge.max}`;

    try {
      const [totals, daily, counters, synergies] = await Promise.all([
        traer<StatsRow[]>(`hero-stats?${q}&min_unix_timestamp=${unix(from)}&max_unix_timestamp=${hasta}`),
        traer<StatsRow[]>(`hero-stats?${q}&min_unix_timestamp=${unix(hace30)}&bucket=start_time_day`),
        traer<CounterRow[]>(`hero-counter-stats?${q}&min_unix_timestamp=${unix(from)}&max_unix_timestamp=${hasta}`),
        traer<SynergyRow[]>(`hero-synergy-stats?${q}&min_unix_timestamp=${unix(from)}&max_unix_timestamp=${hasta}`),
      ]);
      const file = buildInsights(
        band.id,
        heroIds,
        { from, to, ...(tl.patch?.date ? { patch: tl.patch.date } : {}) },
        totals,
        daily,
        counters,
        synergies,
        now.toISOString()
      );
      writeFileSync(`${OUT_DIR}/hero-insights.${band.id}.json`, JSON.stringify(file));
      const cruces = Object.values(file.heroes).reduce((n, h) => n + h.vs.length, 0);
      console.log(`  ${band.id}: ${heroIds.length} héroes, ${cruces} cruces con ${MIN_PAIR}+ partidas (${from} a ${to})`);
    } catch (e) {
      console.log(`  ${band.id}: la API no contestó (${e instanceof Error ? e.message : e}); queda el archivo anterior`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
