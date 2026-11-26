import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { connect, listPartitions, partitionRanges, partitionsCovering, partitionSource, PLAYED_GAME_MODE, PLAYED_MODE } from "./snapshot";

/**
 * El modelo del Impacto de la Repetición (2026-11-20).
 *
 *   npm run build:impact
 *   IMPACT_PARQUET="C:/ruta/*.parquet" npm run build:impact   (archivos del lake ya bajados)
 *
 * La pregunta: en el minuto m, ¿cuánto sube la chance de ganar de un equipo
 * una kill más, un guardián rival roto, un caminante, un santuario, un Mid Boss
 * o ir un 10 % arriba en almas? Se contesta con una regresión logística por
 * minuto sobre partidas rankeadas reales: para cada partida y cada muestra de
 * `stats` (cada 3 minutos hasta el 15, después cada 5) se cuentan, del lado de
 * Hidden King, las diferencias de almas, kills, estructuras y Mid Boss hasta
 * ese segundo, y si ganó.
 *
 * La Repetición usa los coeficientes para dos cosas: la curva de chance (que
 * ahora salta con cada kill y cada estructura, no sólo con las almas) y el
 * valor de cada jugada: lo que vale una kill es cuánto mueve esa curva.
 *
 * **Sin término independiente y con cada partida dada vuelta también**: el
 * mapa es simétrico, así que la chance con todo parejo es 50 % y la fórmula
 * vale igual desde los dos lados.
 */

/** Las variables, en el orden de los coeficientes. */
export const FEATURES = ["soul", "kill", "guardian", "walker", "shrine", "baseGuardian", "boss"] as const;
export type Feature = (typeof FEATURES)[number];

/** Las jugadas, en el orden de `play` (las variables de `FEATURES` sin las almas). */
export const PLAYS = FEATURES.slice(1);

/** Una fila agrupada de la consulta: un minuto, un estado y cuántas lo tuvieron. */
export interface ImpactRow {
  minute: number;
  /** El estado en esta muestra, en el orden de `FEATURES`. */
  x: number[];
  /** El estado en la muestra anterior, en el mismo orden (las almas de entonces primero). */
  prev: number[];
  n: number;
  /** Cuántas de esas ganó Hidden King. */
  wins: number;
}

export interface ImpactModelFile {
  generatedAt: string;
  from: string;
  to: string;
  matches: number;
  features: readonly Feature[];
  /**
   * Una fila por minuto medido:
   * - `coef`, en el orden de `features`: el modelo entero, la curva de chance.
   * - `play`, en el orden de `PLAYS`: lo que mueve la chance (en log-odds) cada
   *   jugada **con las almas que trae**, descontado cómo venía la partida. Sale
   *   de un segundo ajuste con el estado de la muestra anterior (almas, kills,
   *   estructuras) más las jugadas que pasaron entre las dos muestras: así una
   *   estructura no se lleva el mérito de la ventaja que ya traía quien la rompió.
   */
  minutes: { minute: number; n: number; coef: number[]; play: number[] }[];
}

/**
 * La consulta: una fila por minuto y estado (las almas en tramos de 2 %), con
 * cuántas partidas y cuántas ganó Hidden King. `source` es lo que va en el `from`.
 */
/** Las columnas del lake que usa la consulta: cada parte de la unión elige sólo éstas. */
const COLS = [
  "match_id", "team", "won", "player_slot", "duration_s", "match_mode", "game_mode", "start_time",
  '"stats.time_stamp_s"', '"stats.net_worth"', '"death_details.game_time_s"',
  '"objectives.destroyed_time_s"', '"objectives.team_objective"', '"objectives.team"',
  '"mid_boss.team_claimed"', '"mid_boss.destroyed_time_s"',
].join(", ");

/**
 * La fuente: la unión de las lecturas, cada una con sus columnas y la ventana.
 * Elegir columnas (y no `select *`) es lo que deja unir las bases con los
 * deltas, que pueden traer columnas de más o de menos.
 */
export function impactSourceSql(reads: string[], from: string): string {
  return `(${reads.map((r) => `select ${COLS} from ${r} where start_time >= TIMESTAMP '${from}'`).join(" union all ")})`;
}

export function impactSql(source: string): string {
  return `
with p as (
  select match_id, team::VARCHAR as team, won, player_slot,
         "stats.time_stamp_s" as ts, "stats.net_worth" as nw, "death_details.game_time_s" as dt,
         "objectives.destroyed_time_s" as ot, "objectives.team_objective"::VARCHAR[] as ok, "objectives.team"::VARCHAR[] as oteam,
         "mid_boss.team_claimed"::VARCHAR[] as bc, "mid_boss.destroyed_time_s" as bt
  from ${source}
  where match_mode = '${PLAYED_MODE}' and game_mode = '${PLAYED_GAME_MODE}' and duration_s >= 600
),
d as (select * from p qualify row_number() over (partition by match_id, player_slot order by player_slot) = 1),
ok as (select match_id from d group by match_id having count(*) = 12 and count(distinct team) = 2),
dd as (select d.* from d semi join ok using (match_id)),
samples as (select match_id, team, won, unnest(ts) as t, unnest(nw) as w from dd),
souls as (
  select match_id, t,
         sum(case when team = 'Team0' then w else 0 end) as s0,
         sum(case when team = 'Team1' then w else 0 end) as s1,
         bool_or(team = 'Team0' and won) as won0,
         count(*) as k
  from samples where t > 0 group by all having k = 12
),
sl as (
  select *, (s0 - s1) / ((s0 + s1) / 2.0) as rel,
         lag(t, 1, 0) over (partition by match_id order by t) as tp
  from souls where s0 + s1 > 0
),
sl2 as (select *, lag(rel, 1, 0) over (partition by match_id order by t) as relp from sl),
deaths as (select match_id, team, unnest(dt) as x from dd),
m as (select match_id, any_value(ot) as ot, any_value(ok) as ok, any_value(oteam) as oteam, any_value(bc) as bc, any_value(bt) as bt from dd group by match_id),
obj as (select * from (select match_id, unnest(ot) as x, unnest(ok) as kind, unnest(oteam) as owner from m) where x > 0),
boss as (select match_id, unnest(bc) as claimed, unnest(bt) as x from m),
${["t", "tp"]
  .map(
    (col) => `c_${col} as (
  select s.match_id, s.t,
         coalesce((select sum(case when de.team = 'Team1' then 1 else -1 end) from deaths de where de.match_id = s.match_id and de.x < s.${col}), 0) as kill,
         coalesce((select sum(case when o.owner = 'Team1' then 1 else -1 end) from obj o where o.match_id = s.match_id and o.x < s.${col} and o.kind like 'Tier1%'), 0) as guardian,
         coalesce((select sum(case when o.owner = 'Team1' then 1 else -1 end) from obj o where o.match_id = s.match_id and o.x < s.${col} and o.kind like 'Tier2%'), 0) as walker,
         coalesce((select sum(case when o.owner = 'Team1' then 1 else -1 end) from obj o where o.match_id = s.match_id and o.x < s.${col} and o.kind like 'TitanShield%'), 0) as shrine,
         coalesce((select sum(case when o.owner = 'Team1' then 1 else -1 end) from obj o where o.match_id = s.match_id and o.x < s.${col} and o.kind like 'BarrackBoss%'), 0) as baseGuardian,
         coalesce((select sum(case when b.claimed = 'Team0' then 1 when b.claimed = 'Team1' then -1 else 0 end) from boss b where b.match_id = s.match_id and b.x > 0 and b.x < s.${col}), 0) as boss
  from sl2 s
)`,
  )
  .join(",\n")}
select (s.t // 60)::INT as minute, s.won0,
       round(s.rel * 50) / 50 as soul, round(s.relp * 50) / 50 as soulPrev,
       greatest(-15, least(15, a.kill)) as kill, a.guardian, a.walker, a.shrine, a.baseGuardian, a.boss,
       greatest(-15, least(15, b.kill)) as killPrev, b.guardian as guardianPrev, b.walker as walkerPrev,
       b.shrine as shrinePrev, b.baseGuardian as baseGuardianPrev, b.boss as bossPrev,
       count(*)::INT as n, sum(s.won0::INT)::INT as wins
from sl2 s join c_t a using (match_id, t) join c_tp b using (match_id, t)
group by all order by all`;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * Regresión logística sin término independiente sobre filas agrupadas
 * (Newton–Raphson con un poco de ridge para que una variable rara no se
 * dispare). Cada fila entra también dada vuelta: features negadas y las
 * victorias del otro lado.
 */
export function fitLogistic(rows: { x: number[]; n: number; wins: number }[], ridge = 1, iters = 30): number[] {
  const k = rows[0]?.x.length ?? 0;
  const data = rows.flatMap((r) => [r, { x: r.x.map((v) => -v), n: r.n, wins: r.n - r.wins }]);
  let b = new Array(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const g = new Array(k).fill(0);
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (const r of data) {
      const p = sigmoid(r.x.reduce((s, v, i) => s + v * b[i], 0));
      const resid = r.wins - r.n * p;
      const w = r.n * p * (1 - p);
      for (let i = 0; i < k; i++) {
        g[i] += r.x[i] * resid;
        for (let j = 0; j < k; j++) H[i][j] += w * r.x[i] * r.x[j];
      }
    }
    for (let i = 0; i < k; i++) {
      g[i] -= ridge * b[i];
      H[i][i] += ridge;
    }
    const step = solve(H, g);
    b = b.map((v, i) => v + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) break;
  }
  return b;
}

/** Resuelve A·x = y por eliminación de Gauss (las matrices son de 7×7). */
function solve(A: number[][], y: number[]): number[] {
  const n = y.length;
  const M = A.map((row, i) => [...row, y[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

/** Debajo de esto un minuto no se ajusta: quedan pocas partidas tan largas. */
export const MIN_ROWS = 3000;

export function impactModel(rows: ImpactRow[], meta: { from: string; to: string; generatedAt: string; matches: number }): ImpactModelFile {
  const minutes = [...new Set(rows.map((r) => r.minute))].sort((a, b) => a - b);
  const raw: ImpactModelFile["minutes"] = [];
  for (const minute of minutes) {
    const rs = rows.filter((r) => r.minute === minute);
    const n = rs.reduce((s, r) => s + r.n, 0);
    if (n < MIN_ROWS) continue;
    // Estado previo (7) + jugadas entre muestras (6): las últimas seis son `play`.
    const jugadas = rs.map((r) => ({ ...r, x: [...r.prev, ...r.x.slice(1).map((v, i) => v - r.prev[i + 1])] }));
    raw.push({ minute, n, coef: fitLogistic(rs), play: fitLogistic(jugadas).slice(FEATURES.length) });
  }
  return { ...meta, features: FEATURES, minutes: smooth(raw) };
}

/**
 * Ningún valor negativo (romper una estructura o matar no puede bajar la
 * chance: si sale negativo es ruido de pocos casos) y cada minuto promediado
 * con sus vecinos, pesado por cuántas partidas tiene cada uno.
 */
export function smooth(ms: ImpactModelFile["minutes"]): ImpactModelFile["minutes"] {
  const clamp = (v: number[]) => v.map((x) => Math.max(0, x));
  const base = ms.map((m) => ({ ...m, coef: clamp(m.coef), play: clamp(m.play) }));
  const r4 = (x: number) => Math.round(x * 10000) / 10000;
  return base.map((m, i) => {
    const vecinos = [base[i - 1], m, base[i + 1]].filter(Boolean) as typeof base;
    const pesos = vecinos.map((v) => (v === m ? 2 * v.n : v.n));
    const tot = pesos.reduce((a, b) => a + b, 0);
    const mix = (key: "coef" | "play") => m[key].map((_, j) => r4(vecinos.reduce((s, v, k) => s + v[key][j] * pesos[k], 0) / tot));
    return { minute: m.minute, n: m.n, coef: mix("coef"), play: mix("play") };
  });
}

/** Lo mínimo para publicar un modelo: si no, queda el anterior. */
export const MIN_MATCHES = 5000;
export const MIN_MINUTES = 8;

export function modelIsUsable(f: ImpactModelFile): boolean {
  return f.matches >= MIN_MATCHES && f.minutes.length >= MIN_MINUTES;
}

const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/impact-model.json`;
const WINDOW_DAYS = 7;

async function main() {
  const t0 = Date.now();
  const ahora = new Date();
  const hasta = ahora.toISOString().slice(0, 19);
  const desde = new Date(ahora.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 19);
  const con = await connect(":memory:");
  // Con IMPACT_PARQUET lee archivos del lake ya bajados (y toma todo lo que
  // traen); si no, el lake, con la copia local de los deltas en CI.
  const local = process.env.IMPACT_PARQUET;
  let source: string;
  if (local) {
    source = impactSourceSql([`read_parquet('${local.replace(/'/g, "''")}', union_by_name=true)`], "2000-01-01T00:00:00");
  } else {
    const parts = await listPartitions();
    const ranges = await partitionRanges(con, parts, 10);
    source = impactSourceSql(
      partitionsCovering(ranges, desde + "Z", hasta + "Z").map((n) => partitionSource(n)),
      desde,
    );
  }
  const raw = (await (await con.runAndReadAll(impactSql(source))).getRowObjects()) as Record<string, unknown>[];
  const rows: ImpactRow[] = raw.map((r) => ({
    minute: Number(r.minute),
    x: FEATURES.map((f) => Number(r[f])),
    prev: FEATURES.map((f) => Number(r[f + "Prev"])),
    n: Number(r.n),
    wins: Number(r.wins),
  }));
  // Cada partida aporta una fila por muestra; la primera muestra (minuto 3) la cuenta una vez.
  const matches = rows.filter((r) => r.minute === 3).reduce((s, r) => s + r.n, 0);
  const file = impactModel(rows, { from: local ? "local" : desde.slice(0, 10), to: hasta.slice(0, 10), generatedAt: ahora.toISOString(), matches });
  // Un modelo con pocas partidas o pocos minutos rompería el Impacto del sitio:
  // mejor no escribir nada y que quede el commiteado.
  if (!modelIsUsable(file)) {
    throw new Error(`impacto: modelo con ${matches} partidas y ${file.minutes.length} minutos; se mantiene el publicado`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(file));
  console.log(`impacto: ${matches.toLocaleString("es")} partidas, ${file.minutes.length} minutos (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  for (const m of file.minutes) {
    console.log(`  min ${m.minute} (${m.n}) curva: ${FEATURES.map((f, i) => `${f} ${m.coef[i]}`).join(", ")}`);
    console.log(`  min ${m.minute} jugadas: ${PLAYS.map((f, i) => `${f} ${m.play[i]}`).join(", ")}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
