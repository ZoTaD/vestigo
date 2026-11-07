import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { BANDS, type BandId } from "./bands";
import { badgeRange } from "./abilities";

/**
 * "Cómo juega" cada héroe y su tendencia de 8 semanas, para la ficha de Héroes.
 *
 *   npm run build:hero-playstyle
 *
 * **Cómo juega** sale de `/v1/matches/metadata` en lote, pidiendo sólo las
 * columnas que hacen falta (`extra_player_columns`): con las de siempre, mil
 * partidas pesan 88 MB; con éstas, ~15 MB. Las últimas `MATCHES` clasificatorias
 * de la semana, todos los rangos (la forma de jugar de un héroe cambia poco con
 * el rango y así cada héroe junta muestra). De cada jugador se lee la última
 * muestra de `stats` (el total al terminar) y, para las kills, la de los 15
 * minutos.
 *
 * **La tendencia** es `/v1/analytics/hero-stats?bucket=start_time_week`, un
 * pedido por banda: winrate y % de elección de cada héroe por semana.
 */

const API = "https://api.deadlock-api.com/v1";
const OUT = "../data/hero-playstyle.json";
const HEADERS = { "User-Agent": "vestigo.gg pipeline" };

/** Cuántas partidas se leen, en pedidos de `PAGE`. */
const MATCHES = 4000;
const PAGE = 2000;
/** Hasta este segundo una kill es "temprana". */
const EARLY_S = 900;
const WEEKS = 8;

const COLS = [
  "hero_id",
  "stats.time_stamp_s",
  "stats.kills",
  "stats.bullet_kills",
  "stats.ability_kills",
  "stats.melee_kills",
  "stats.headshot_kills",
  "stats.damage_mitigated",
  "stats.teammate_healing",
  "stats.teammate_barriering",
  "stats.heal_prevented",
  "stats.gold_player",
  "stats.gold_player_orbs",
  "stats.gold_lane_creep",
  "stats.gold_lane_creep_orbs",
  "stats.gold_neutral_creep",
  "stats.gold_neutral_creep_orbs",
  "stats.gold_boss",
  "stats.gold_boss_orb",
  "stats.gold_treasure",
];

type Series = number[] | undefined;

interface RawPlayer {
  hero_id: number;
  stats_time_stamp_s?: number[];
  [k: string]: unknown;
}

interface RawMatch {
  match_id: number;
  duration_s: number;
  players: RawPlayer[];
}

/** Lo que se suma por héroe; al final se divide. */
interface Acc {
  n: number;
  minutes: number;
  kills: number;
  gun: number;
  ability: number;
  melee: number;
  headshot: number;
  early: number;
  mitigated: number;
  allyHeal: number;
  healPrevented: number;
  souls: { heroes: number; lane: number; jungle: number; objectives: number; other: number };
}

const nuevo = (): Acc => ({
  n: 0,
  minutes: 0,
  kills: 0,
  gun: 0,
  ability: 0,
  melee: 0,
  headshot: 0,
  early: 0,
  mitigated: 0,
  allyHeal: 0,
  healPrevented: 0,
  souls: { heroes: 0, lane: 0, jungle: 0, objectives: 0, other: 0 },
});

const ultimo = (s: Series): number => (s && s.length > 0 ? Number(s[s.length - 1]) || 0 : 0);

/** El valor de una serie en la última muestra que no pasa de `t`. */
function hasta(ts: number[], s: Series, t: number): number {
  if (!s) return 0;
  let v = 0;
  for (let i = 0; i < ts.length && i < s.length; i++) {
    if (ts[i] > t) break;
    v = Number(s[i]) || 0;
  }
  return v;
}

export function accumulate(matches: RawMatch[], acc = new Map<number, Acc>()): Map<number, Acc> {
  for (const m of matches) {
    // Las partidas de menos de 15 minutos son abandonos o paliza: no dicen
    // cómo juega nadie y meterían ruido en "temprano o tarde".
    if (!m.duration_s || m.duration_s < 15 * 60) continue;
    for (const p of m.players ?? []) {
      const ts = p.stats_time_stamp_s;
      if (!ts || ts.length === 0) continue;
      const g = (k: string) => ultimo(p[`stats_${k}`] as Series);
      const a = acc.get(p.hero_id) ?? nuevo();
      a.n++;
      a.minutes += m.duration_s / 60;
      const kills = g("kills");
      a.kills += kills;
      a.gun += g("bullet_kills");
      a.ability += g("ability_kills");
      a.melee += g("melee_kills");
      a.headshot += g("headshot_kills");
      a.early += hasta(ts, p.stats_kills as Series, EARLY_S);
      a.mitigated += g("damage_mitigated");
      a.allyHeal += g("teammate_healing") + g("teammate_barriering");
      a.healPrevented += g("heal_prevented");
      a.souls.heroes += g("gold_player") + g("gold_player_orbs");
      a.souls.lane += g("gold_lane_creep") + g("gold_lane_creep_orbs");
      a.souls.jungle += g("gold_neutral_creep") + g("gold_neutral_creep_orbs");
      a.souls.objectives += g("gold_boss") + g("gold_boss_orb");
      a.souls.other += g("gold_treasure");
      acc.set(p.hero_id, a);
    }
  }
  return acc;
}

export interface PlaystyleHero {
  n: number;
  /** Parte de las kills con arma, habilidad y cuerpo a cuerpo (suman ~1). */
  gun: number;
  ability: number;
  melee: number;
  /** Kills con tiro a la cabeza sobre el total de kills. */
  headshot: number;
  /** Kills por partida antes del minuto 15, y después. */
  early: number;
  late: number;
  /** Daño mitigado por minuto. */
  mitigated: number;
  /** Curación y barreras a compañeros por minuto. */
  allyHeal: number;
  /** Curación evitada al rival por partida. */
  healPrevented: number;
  /** De dónde salen las almas: partes que suman 1. */
  souls: { heroes: number; lane: number; jungle: number; objectives: number; other: number };
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r1 = (x: number) => Math.round(x * 10) / 10;

export function finish(acc: Map<number, Acc>, minN = 60): Record<string, PlaystyleHero> {
  const out: Record<string, PlaystyleHero> = {};
  for (const [id, a] of acc) {
    if (a.n < minN) continue;
    const tipos = a.gun + a.ability + a.melee || 1;
    const almas = a.souls.heroes + a.souls.lane + a.souls.jungle + a.souls.objectives + a.souls.other || 1;
    out[String(id)] = {
      n: a.n,
      gun: r3(a.gun / tipos),
      ability: r3(a.ability / tipos),
      melee: r3(a.melee / tipos),
      headshot: r3(a.kills > 0 ? a.headshot / a.kills : 0),
      early: r1(a.early / a.n),
      late: r1((a.kills - a.early) / a.n),
      mitigated: Math.round(a.mitigated / a.minutes),
      allyHeal: Math.round(a.allyHeal / a.minutes),
      healPrevented: Math.round(a.healPrevented / a.n),
      souls: {
        heroes: r3(a.souls.heroes / almas),
        lane: r3(a.souls.lane / almas),
        jungle: r3(a.souls.jungle / almas),
        objectives: r3(a.souls.objectives / almas),
        other: r3(a.souls.other / almas),
      },
    };
  }
  return out;
}

interface HeroStatsRow {
  hero_id: number;
  bucket: number;
  wins: number;
  matches: number;
}

/** [winrate, % de elección, partidas] por semana; `null` sin muestra. */
export type TrendPoint = [number, number, number] | null;

export function trendOf(rows: HeroStatsRow[], weeks: number[], minN = 100): Record<string, TrendPoint[]> {
  const total = new Map<number, number>();
  for (const r of rows) total.set(r.bucket, (total.get(r.bucket) ?? 0) + r.matches);
  const out: Record<string, TrendPoint[]> = {};
  for (const r of rows) {
    const serie = (out[String(r.hero_id)] ??= weeks.map(() => null));
    const i = weeks.indexOf(r.bucket);
    if (i < 0 || r.matches < minN) continue;
    // Cada partida tiene 12 héroes: el % de elección es sobre partidas, no sobre picks.
    const partidas = (total.get(r.bucket) ?? 0) / 12;
    serie[i] = [r3(r.wins / r.matches), r3(partidas > 0 ? r.matches / partidas : 0), r.matches];
  }
  return out;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

async function main() {
  const ahora = Math.floor(Date.now() / 1000);
  const desde = ahora - 7 * 86400;

  // Cómo juega: las últimas partidas, de a páginas, bajando por match_id.
  const acc = new Map<number, Acc>();
  let antesDe: number | null = null;
  let leidas = 0;
  while (leidas < MATCHES) {
    const q = new URLSearchParams({
      match_mode: "Ranked",
      min_unix_timestamp: String(desde),
      limit: String(PAGE),
      order_by: "match_id",
      order_direction: "desc",
      extra_player_columns: COLS.join(","),
    });
    if (antesDe !== null) q.set("max_match_id", String(antesDe - 1));
    const page = await getJson<RawMatch[]>(`${API}/matches/metadata?${q}`);
    if (page.length === 0) break;
    accumulate(page, acc);
    leidas += page.length;
    antesDe = Math.min(...page.map((m) => m.match_id));
    console.log(`  cómo juega: ${leidas} partidas`);
  }
  const heroes = finish(acc);

  // La tendencia: un pedido por banda. Las semanas son las que devuelve la API
  // (sus cortes, no los nuestros), las últimas `WEEKS` de la primera respuesta.
  const desdeTendencia = ahora - (WEEKS + 1) * 604800;
  let weeks: number[] = [];
  const trend: Partial<Record<BandId, Record<string, TrendPoint[]>>> = {};
  for (const band of BANDS) {
    const b = badgeRange(band.tiers);
    const q = new URLSearchParams({
      bucket: "start_time_week",
      min_unix_timestamp: String(desdeTendencia),
      min_average_badge: String(b.min),
      max_average_badge: String(b.max),
    });
    try {
      const rows = await getJson<HeroStatsRow[]>(`${API}/analytics/hero-stats?${q}`);
      if (weeks.length === 0) weeks = [...new Set(rows.map((r) => r.bucket))].sort((a, c) => a - c).slice(-WEEKS);
      trend[band.id] = trendOf(rows, weeks);
      console.log(`  tendencia ${band.id}: ${rows.length} filas`);
    } catch (e) {
      console.log(`  tendencia ${band.id}: la API no contestó (${e instanceof Error ? e.message : e})`);
    }
  }

  const file = {
    generatedAt: new Date().toISOString(),
    from: new Date(desde * 1000).toISOString().slice(0, 10),
    to: new Date(ahora * 1000).toISOString().slice(0, 10),
    matches: leidas,
    heroes,
    weeks,
    trend,
  };
  writeFileSync(OUT, JSON.stringify(file));
  console.log(`hero-playstyle.json: ${Object.keys(heroes).length} héroes sobre ${leidas} partidas`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
