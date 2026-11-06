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

export interface SeasonRecords {
  /** `true` = la temporada cerró y esto ya no cambia. */
  final: boolean;
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
