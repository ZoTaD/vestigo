import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { BANDS, type BandId } from "./bands";
import {
  BADGE,
  connect,
  listPartitions,
  partitionRanges,
  partitionsCovering,
  partitionSource,
  PLAYED_GAME_MODE,
  PLAYED_MODE,
} from "./snapshot";

/**
 * Remontadas: cuánto vale ir adelante (o atrás) en almas en cada minuto.
 *
 *   npm run build:comebacks
 *
 * La pregunta que más se repite en los foros después del parche del 16/9 (que
 * recortó las mecánicas de remontada) es "si perdés la línea, ¿perdiste?", y
 * nadie la contesta con datos. El lake guarda, para cada jugador, sus almas
 * (`stats.net_worth`) en muestras cada 3 minutos hasta el 15 y cada 5 después
 * (`stats.time_stamp_s`). Sumadas por equipo dan la ventaja de un equipo sobre
 * el otro en cada muestra, y con el resultado de la partida, el % de victorias
 * de quien iba adelante o atrás por tanto.
 *
 * **La ventaja es relativa**: (almas propias − almas rivales) / promedio de los
 * dos. 5.000 almas de diferencia no significan lo mismo al minuto 6 que al 35.
 *
 * Cada partida entra dos veces, una por equipo: la tabla es simétrica (ir 10%
 * abajo gana lo que ir 10% arriba pierde), y así se lee desde cualquiera de los
 * dos lados sin elegir uno.
 */

/** Los minutos en que el juego guarda las almas de todos. */
export const MINUTES = [6, 9, 12, 15, 20, 25, 30, 35] as const;

/** Los cortes de la ventaja relativa, de más atrás a más adelante. */
export const EDGES = [-0.3, -0.2, -0.1, -0.05, 0.05, 0.1, 0.2, 0.3] as const;

/** El tramo de una ventaja: 0 es "más de 30% abajo", 8 es "más de 30% arriba". */
export function bucketOf(adv: number): number {
  let b = 0;
  while (b < EDGES.length && adv >= EDGES[b]) b++;
  return b;
}

/** Los mismos tramos en SQL, para que la cuenta la haga DuckDB. */
export const bucketSql = (col: string): string =>
  `(${EDGES.map((e) => `(${col} >= ${e})::INT`).join(" + ")})`;

/** Una celda: partidas (lados de partida) y cuántas ganó ese lado. */
export interface Cell {
  n: number;
  wins: number;
}

/** Lo que devuelve la consulta: una fila por banda de rango, minuto y tramo. */
export interface AggRow {
  tier: number;
  minute: number;
  bucket: number;
  n: number;
  wins: number;
}

/**
 * La cuenta, sobre una fuente con `match_id, team, won, tier, ts, nw` (las dos
 * listas del lake). Sólo cuentan las muestras donde los seis de cada equipo
 * tienen dato: una partida con alguien desconectado no dice cuánto vale una
 * ventaja.
 */
export function comebackAggSql(source: string): string {
  const segundos = MINUTES.map((m) => m * 60).join(", ");
  return `
    with s as (
      select match_id, team, won, tier, unnest(ts) as t, unnest(nw) as w from (${source})
    ),
    tm as (
      select match_id, team, any_value(won) as won, any_value(tier) as tier, t, sum(w) as w, count(*) as k
      from s where t in (${segundos}) group by match_id, team, t
    ),
    d as (
      select a.tier, a.t, a.won, (a.w - b.w) / ((a.w + b.w) / 2.0) as adv
      from tm a join tm b on a.match_id = b.match_id and a.t = b.t and a.team <> b.team
      where a.k = 6 and b.k = 6 and a.w + b.w > 0
    )
    select tier::INT as tier, (t // 60)::INT as minute, ${bucketSql("adv")}::INT as bucket,
           count(*)::INT as n, sum(won::INT)::INT as wins
    from d group by all order by all`;
}

/** La fuente del lake para una ventana: rankeadas normales con insignia. */
export function comebackSourceSql(partitions: number[], from: string, to: string): string {
  return partitions
    .map(
      (n) => `select match_id, team, won, ${BADGE} // 10 as tier, "stats.time_stamp_s" as ts, "stats.net_worth" as nw
    from ${partitionSource(n)}
    where match_mode = '${PLAYED_MODE}' and game_mode = '${PLAYED_GAME_MODE}' and ${BADGE} > 0
      and start_time >= TIMESTAMP '${from}' and start_time < TIMESTAMP '${to}'`
    )
    .join(" union all ");
}

export type BandKey = "all" | BandId;

export interface ComebacksFile {
  generatedAt: string;
  from: string;
  to: string;
  /** Partidas (no lados) en la ventana, contadas al minuto 6. */
  matches: number;
  minutes: number[];
  edges: number[];
  /** Por banda: `cells[i][j]` es el minuto `minutes[i]` y el tramo `j`. */
  bands: Record<BandKey, { matches: number; cells: Cell[][] }>;
}

/** Arma el archivo: suma las filas por banda (y todas juntas). */
export function comebacksFile(rows: AggRow[], meta: { from: string; to: string; generatedAt: string }): ComebacksFile {
  const vacia = (): Cell[][] => MINUTES.map(() => Array.from({ length: EDGES.length + 1 }, () => ({ n: 0, wins: 0 })));
  const bands = { all: { matches: 0, cells: vacia() } } as ComebacksFile["bands"];
  for (const b of BANDS) bands[b.id] = { matches: 0, cells: vacia() };
  const bandaDe = new Map<number, BandId>();
  for (const b of BANDS) for (const t of b.tiers) bandaDe.set(t, b.id);

  for (const r of rows) {
    const i = MINUTES.indexOf(r.minute as (typeof MINUTES)[number]);
    if (i < 0 || r.bucket < 0 || r.bucket > EDGES.length) continue;
    for (const key of ["all", bandaDe.get(r.tier)] as (BandKey | undefined)[]) {
      if (!key) continue;
      const c = bands[key].cells[i][r.bucket];
      c.n += r.n;
      c.wins += r.wins;
    }
  }
  // Cada partida entra una vez por lado: al minuto 6 casi todas siguen vivas.
  for (const key of Object.keys(bands) as BandKey[]) {
    bands[key].matches = Math.round(bands[key].cells[0].reduce((s, c) => s + c.n, 0) / 2);
  }
  return {
    generatedAt: meta.generatedAt,
    from: meta.from,
    to: meta.to,
    matches: bands.all.matches,
    minutes: [...MINUTES],
    edges: [...EDGES],
    bands,
  };
}

const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/comebacks.json`;
/** Quince días: las remontadas cambian con los parches que las tocan, no día a día. */
const WINDOW_DAYS = 15;

async function main() {
  const t0 = Date.now();
  const ahora = new Date();
  const hasta = ahora.toISOString().slice(0, 19);
  const desde = new Date(ahora.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 19);
  const parts = await listPartitions();
  const con = await connect(":memory:");
  const ranges = await partitionRanges(con, parts, 8);
  const cubren = partitionsCovering(ranges, desde + "Z", hasta + "Z");
  const filas = (await (await con.runAndReadAll(comebackAggSql(comebackSourceSql(cubren, desde, hasta)))).getRowObjects()) as unknown as AggRow[];
  const file = comebacksFile(
    filas.map((r) => ({ tier: Number(r.tier), minute: Number(r.minute), bucket: Number(r.bucket), n: Number(r.n), wins: Number(r.wins) })),
    { from: desde.slice(0, 10), to: hasta.slice(0, 10), generatedAt: ahora.toISOString() }
  );
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(file));
  console.log(
    `remontadas: ${file.matches.toLocaleString("es")} partidas, ${file.from} → ${file.to} ` +
      `(${((Date.now() - t0) / 1000).toFixed(0)}s)`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
