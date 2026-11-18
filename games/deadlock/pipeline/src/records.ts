import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  connect,
  listPartitions,
  partitionRanges,
  partitionsCovering,
  partitionSource,
  PLAYED_GAME_MODE,
  PLAYED_MODE,
  runSnapshotBuild,
} from "./snapshot";
import { currentSeason } from "./seasons";

/**
 * Los récords de una sola partida de la temporada (2026-11-18): la partida con
 * más kills, más daño, más almas… del mundo y de cada héroe, con el enlace a la
 * partida y quién la jugó.
 *
 * **Es distinto de `hero-records.json`**, que guarda quiénes suman más en toda
 * la temporada (para los logros del perfil). Acá cuenta una partida.
 *
 * **Se suma de a poco.** Un récord sólo puede mejorar, así que cada corrida lee
 * nada más los días nuevos (desde la corrida anterior, con dos días de margen
 * para las partidas que el lake procesa tarde) y los mezcla con lo publicado. La
 * primera corrida de una temporada lee la temporada entera. Una temporada nueva
 * empieza de cero.
 *
 * Sólo clasificatorias normales: en las otras se juega con bots o se tira la
 * partida, y un récord de ahí no dice nada.
 */

/** Las métricas, en el orden de la página. `sql` sale de una fila del lake. */
export const METRICS = [
  { id: "kills", sql: "kills" },
  { id: "assists", sql: "assists" },
  { id: "player_damage", sql: `list_last("stats.player_damage")` },
  { id: "net_worth", sql: "net_worth" },
  { id: "last_hits", sql: "last_hits" },
  { id: "player_healing", sql: `list_last("stats.player_healing")` },
  { id: "boss_damage", sql: `list_last("stats.boss_damage")` },
  { id: "damage_taken", sql: `list_last("stats.player_damage_taken")` },
] as const;
export type MetricId = (typeof METRICS)[number]["id"];

/** Cuántos puestos por héroe y del mundo. */
export const TOP_HERO = 3;
export const TOP_WORLD = 10;
/** Partidas más cortas no cuentan: abandonos y rendiciones tempranas. */
const MIN_DURATION_S = 15 * 60;
/** El margen hacia atrás de cada corrida, por las partidas que llegan tarde. */
const OVERLAP_S = 2 * 86400;
/** El tamaño de cada tanda de lectura. */
const CHUNK_S = 2 * 86400;

/** Un récord: la partida, el jugador, el héroe y el número. Claves cortas: van muchos. */
export interface Rec {
  /** match_id */
  m: number;
  /** account_id */
  a: number;
  /** hero_id */
  h: number;
  /** el valor */
  v: number;
  /** inicio de la partida, unix */
  t: number;
  /** duración en segundos */
  d: number;
  /** ganó */
  w: boolean;
}

export interface RecordsFile {
  generatedAt: string;
  season: number;
  /** Hasta dónde se leyó, unix: la próxima corrida arranca de acá menos el margen. */
  readTo: number;
  metrics: MetricId[];
  world: Record<MetricId, Rec[]>;
  heroes: Record<string, Record<MetricId, Rec[]>>;
  /** Nombre de Steam de cada cuenta que aparece. */
  names: Record<string, string>;
}

/** El orden de un récord: el número más alto; si empatan, el que llegó primero. */
const better = (x: Rec, y: Rec) => y.v - x.v || x.t - y.t || x.m - y.m;

/** Mezcla dos listas y deja las `n` mejores, sin repetir jugador en una misma partida. */
export function mergeTop(a: Rec[], b: Rec[], n: number): Rec[] {
  const seen = new Set<string>();
  const out: Rec[] = [];
  for (const r of [...a, ...b].sort(better)) {
    const k = `${r.m}:${r.a}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length === n) break;
  }
  return out;
}

/** Las filas de la ventana: un jugador por fila, con todas las métricas. */
export function windowRowsSql(
  partitions: number[],
  from: number,
  to: number,
): string {
  const cols = METRICS.map((m) => `${m.sql}::DOUBLE as ${m.id}`).join(", ");
  return partitions
    .map(
      (
        n,
      ) => `select match_id, account_id, hero_id, epoch(start_time)::BIGINT as t, duration_s, won, ${cols}
    from ${partitionSource(n)}
    where match_mode = '${PLAYED_MODE}' and game_mode = '${PLAYED_GAME_MODE}'
      and duration_s >= ${MIN_DURATION_S} and account_id > 0
      and start_time >= to_timestamp(${from}) and start_time < to_timestamp(${to})`,
    )
    .join(" union all ");
}

/** El top de una métrica, por héroe (`perHero`) o del mundo. */
export function topSql(metric: MetricId, perHero: boolean): string {
  const n = perHero ? TOP_HERO : TOP_WORLD;
  const part = perHero ? "partition by hero_id " : "";
  return `select match_id as m, account_id as a, hero_id as h, ${metric} as v, t, duration_s as d, won as w
    from rows where ${metric} is not null and ${metric} > 0
    qualify row_number() over (${part}order by ${metric} desc, t, match_id) <= ${n}`;
}

const toRec = (r: Record<string, unknown>): Rec => ({
  m: Number(r.m),
  a: Number(r.a),
  h: Number(r.h),
  v: Math.round(Number(r.v)),
  t: Number(r.t),
  d: Number(r.d),
  w: Boolean(r.w),
});

/** Junta lo publicado con lo nuevo. Si cambió la temporada, lo publicado no cuenta. */
export function mergeFiles(
  prev: RecordsFile | null,
  fresh: Omit<RecordsFile, "names">,
): Omit<RecordsFile, "names"> {
  if (!prev || prev.season !== fresh.season) return fresh;
  const world = {} as RecordsFile["world"];
  for (const m of fresh.metrics)
    world[m] = mergeTop(prev.world[m] ?? [], fresh.world[m] ?? [], TOP_WORLD);
  const heroes: RecordsFile["heroes"] = {};
  for (const h of new Set([
    ...Object.keys(prev.heroes),
    ...Object.keys(fresh.heroes),
  ])) {
    heroes[h] = {} as RecordsFile["heroes"][string];
    for (const m of fresh.metrics) {
      heroes[h][m] = mergeTop(
        prev.heroes[h]?.[m] ?? [],
        fresh.heroes[h]?.[m] ?? [],
        TOP_HERO,
      );
    }
  }
  return { ...fresh, world, heroes };
}

const API = "https://api.deadlock-api.com/v1";
const OUT = "../data/records.json";

async function steamNames(ids: number[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    const q = part.map((a) => `account_ids=${a}`).join("&");
    try {
      const r = await fetch(`${API}/players/steam?${q}`, {
        headers: { "user-agent": "vestigo.gg pipeline" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      for (const s of (await r.json()) as {
        account_id: number;
        personaname?: string;
      }[]) {
        if (s.personaname) names[s.account_id] = s.personaname;
      }
    } catch (e) {
      console.warn(`  steam: ${(e as Error).message}`);
    }
    await new Promise((res) => setTimeout(res, 450));
  }
  return names;
}

async function main() {
  const t0 = Date.now();
  const season = currentSeason();
  const prev: RecordsFile | null = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : null;
  const ahora = Math.floor(Date.now() / 1000);
  // Para probar en la PC sin bajar la temporada entera: RECORDS_DAYS=1.
  const dias = Number(process.env.RECORDS_DAYS ?? 0);
  let desde =
    prev && prev.season === season.id
      ? Math.max(season.start, prev.readTo - OVERLAP_S)
      : season.start;
  if (dias > 0) desde = Math.max(desde, ahora - dias * 86400);

  const parts = await listPartitions();
  const con = await connect(":memory:");
  if (process.env.RECORDS_MEMORY)
    await con.run(
      `set memory_limit = '${process.env.RECORDS_MEMORY.replace(/[^0-9A-Za-z]/g, "")}';`,
    );
  if (process.env.RECORDS_THREADS)
    await con.run(`set threads = ${Number(process.env.RECORDS_THREADS) || 4};`);
  // RECORDS_FILES: archivos sueltos del lake en vez de las particiones enteras.
  // Sólo para la PC: en Windows DuckDB corta al leer las 20 partes de una
  // partición juntas ("Failed to read connection"); en Actions no pasa.
  const sueltos = (process.env.RECORDS_FILES ?? "")
    .split(",")
    .filter((u) => u.startsWith("https://data.deadlock-api.com/"));
  const iso = (s: number) =>
    new Date(s * 1000).toISOString().slice(0, 19) + "Z";
  const ranges = sueltos.length ? [] : await partitionRanges(con, parts, 10);

  // **De a dos días** (`CHUNK_S`): la primera corrida de una temporada lee semanas,
  // y una tabla con todas esas filas no entra holgada en el runner. Cada tanda
  // deja sus mejores y se mezcla con lo que ya había, igual que con lo publicado.
  let acc: Omit<RecordsFile, "names"> | null = null;
  let total = 0;
  for (let a = desde; a < ahora; a += CHUNK_S) {
    const b = Math.min(ahora, a + CHUNK_S);
    const fuente = sueltos.length
      ? windowRowsSql([0], a, b).replace(
          /from \S+\(.*?\)\s*\n/s,
          `from read_parquet([${sueltos.map((u) => `'${u.replace(/'/g, "")}'`).join(", ")}])\n`,
        )
      : windowRowsSql(partitionsCovering(ranges, iso(a), iso(b)), a, b);
    await con.run(`create or replace temp table rows as ${fuente}`);
    total += Number(
      (
        await (
          await con.runAndReadAll(
            "select count(distinct match_id) as n from rows",
          )
        ).getRowObjects()
      )[0].n,
    );
    const world = {} as RecordsFile["world"];
    const heroes: RecordsFile["heroes"] = {};
    for (const { id } of METRICS) {
      world[id] = (
        (await (
          await con.runAndReadAll(topSql(id, false))
        ).getRowObjects()) as Record<string, unknown>[]
      ).map(toRec);
      for (const r of (
        (await (
          await con.runAndReadAll(topSql(id, true))
        ).getRowObjects()) as Record<string, unknown>[]
      ).map(toRec)) {
        (heroes[r.h] ??= {} as RecordsFile["heroes"][string])[id] ??= [];
        heroes[r.h][id].push(r);
      }
    }
    const tanda = {
      generatedAt: "",
      season: season.id,
      readTo: b,
      metrics: METRICS.map((m) => m.id),
      world,
      heroes,
    };
    acc = mergeFiles(acc as RecordsFile | null, tanda);
    console.log(
      `  ${iso(a).slice(0, 16)} → ${iso(b).slice(0, 16)}: ${total.toLocaleString("es")} partidas hasta acá`,
    );
  }
  await con.run("drop table if exists rows");
  const nuevo = acc ?? {
    generatedAt: "",
    season: season.id,
    readTo: ahora,
    metrics: METRICS.map((m) => m.id),
    world: {} as RecordsFile["world"],
    heroes: {},
  };
  const fresh = mergeFiles(prev, {
    ...nuevo,
    generatedAt: new Date().toISOString(),
    // Una muestra no leyó la temporada entera: la próxima corrida completa arranca del principio.
    readTo: sueltos.length ? season.start : ahora,
  });

  const cuentas = new Set<number>();
  for (const l of Object.values(fresh.world))
    for (const r of l) cuentas.add(r.a);
  for (const h of Object.values(fresh.heroes))
    for (const l of Object.values(h)) for (const r of l) cuentas.add(r.a);
  const names = await steamNames([...cuentas]);
  // Si Steam no contestó por alguien, queda el nombre que ya teníamos.
  for (const a of cuentas)
    if (!names[a] && prev?.names[a]) names[a] = prev.names[a];

  mkdirSync("../data", { recursive: true });
  writeFileSync(OUT, JSON.stringify({ ...fresh, names } satisfies RecordsFile));
  console.log(
    `récords T${season.id}: ${total.toLocaleString("es")} partidas nuevas desde ${new Date(desde * 1000).toISOString().slice(0, 16)}, ` +
      `${Object.keys(fresh.heroes).length} héroes, ${cuentas.size} jugadores (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSnapshotBuild("records", main).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
