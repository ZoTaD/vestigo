import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  connect,
  listPartitions,
  partitionRanges,
  partitionsCovering,
  partitionSource,
  PLAYED_GAME_MODE,
  PLAYED_MODE,
} from "./snapshot";

/**
 * Cuántos puntos de rango da cada partida, medido.
 *
 *   npm run build:rank-points
 *
 * Desde el rework del 30/7 los puntos ya no son fijos y Valve no publicó la
 * fórmula: la queja más repetida de los foros es "¿por qué me dieron +430?".
 * El lake guarda, por jugador, el cambio de puntos de la partida
 * (`player_rank_desired_progress_change`), la racha con la que llegó
 * (`player_rank_initial_win_streak`), si estaba calibrando y si la derrota se
 * comió un escudo de descenso (`player_rank_consumed_demotion_protection`), con
 * el progreso real antes y después (`player_rank_*_flat_progress`).
 *
 * Medido el 2026-09-30 sobre 1.047.125 partidas-jugador: ganar da +300, y la
 * racha suma de a 20 desde la tercera seguida (+370, +390, +410, tope +430);
 * perder da −300 salvo que se gaste un escudo.
 */

/** Rachas previas que se muestran sueltas; de acá para arriba van juntas. */
export const STREAK_CAP = 5;

export interface RankRow {
  won: boolean;
  /** La racha de victorias con la que llegó a la partida (tope `STREAK_CAP`). */
  streak: number;
  calibrating: boolean;
  shieldUsed: boolean;
  n: number;
  /** Suma del cambio de puntos que da la partida. */
  points: number;
  /** Suma del cambio real del progreso (después de escudos). */
  flat: number;
  /** El cambio más frecuente del grupo: el que ve en pantalla la mayoría. */
  typical: number;
}

/** La cuenta, sobre una fuente con las columnas del lake ya renombradas. */
export function rankPointsSql(source: string): string {
  return `
    select won,
           least(coalesce(ws, 0), ${STREAK_CAP})::INT as streak,
           coalesce(cal, 0) > 0 as calibrating,
           coalesce(used, false) as shieldUsed,
           count(*)::INT as n,
           sum(d)::BIGINT as points,
           sum(f1::BIGINT - f0::BIGINT)::BIGINT as flat,
           mode(d)::INT as typical
    from (${source})
    where d is not null
    group by all order by all`;
}

/** La fuente del lake para una ventana: clasificatorias normales. */
export function rankSourceSql(partitions: number[], from: string, to: string): string {
  return partitions
    .map(
      (n) => `select won, player_rank_desired_progress_change as d, player_rank_initial_win_streak as ws,
        player_rank_initial_calibration_games as cal, player_rank_consumed_demotion_protection as used,
        player_rank_initial_flat_progress as f0, player_rank_final_flat_progress as f1
      from ${partitionSource(n)}
      where match_mode = '${PLAYED_MODE}' and game_mode = '${PLAYED_GAME_MODE}'
        and start_time >= TIMESTAMP '${from}' and start_time < TIMESTAMP '${to}'`
    )
    .join(" union all ");
}

export interface RankPointsFile {
  generatedAt: string;
  from: string;
  to: string;
  matches: number;
  /**
   * Victorias fuera de calibración, por racha previa (0 … STREAK_CAP): el
   * promedio y el valor típico (el más frecuente, el que ve la mayoría).
   */
  wins: { streak: number; n: number; points: number; typical: number }[];
  /** Derrotas fuera de calibración sin escudo, y las que se comieron uno. */
  loss: { n: number; points: number; typical: number };
  shield: { n: number; points: number; flat: number };
  /** En calibración: cuánto se mueve por partida. */
  calibration: { win: number; loss: number; n: number };
}

const avg = (sum: number, n: number) => (n > 0 ? Math.round(sum / n) : 0);

/** Arma el archivo desde las filas agrupadas. */
export function rankPointsFile(rows: RankRow[], meta: { from: string; to: string; generatedAt: string }): RankPointsFile {
  const suma = (f: (r: RankRow) => boolean) =>
    rows.filter(f).reduce((s, r) => ({ n: s.n + r.n, points: s.points + r.points, flat: s.flat + r.flat }), { n: 0, points: 0, flat: 0 });
  /** El típico de un conjunto de grupos: el del grupo con más partidas. */
  const tipico = (f: (r: RankRow) => boolean) =>
    rows.filter(f).reduce<RankRow | null>((m, r) => (!m || r.n > m.n ? r : m), null)?.typical ?? 0;
  const wins = Array.from({ length: STREAK_CAP + 1 }, (_, k) => {
    const f = (r: RankRow) => r.won && !r.calibrating && r.streak === k;
    const s = suma(f);
    return { streak: k, n: s.n, points: avg(s.points, s.n), typical: tipico(f) };
  });
  const loss = suma((r) => !r.won && !r.calibrating && !r.shieldUsed);
  const shield = suma((r) => !r.won && !r.calibrating && r.shieldUsed);
  const calW = suma((r) => r.won && r.calibrating);
  const calL = suma((r) => !r.won && r.calibrating);
  return {
    generatedAt: meta.generatedAt,
    from: meta.from,
    to: meta.to,
    matches: rows.reduce((s, r) => s + r.n, 0),
    wins,
    loss: { n: loss.n, points: avg(loss.points, loss.n), typical: tipico((r) => !r.won && !r.calibrating && !r.shieldUsed) },
    shield: { n: shield.n, points: avg(shield.points, shield.n), flat: avg(shield.flat, shield.n) },
    calibration: { win: avg(calW.points, calW.n), loss: avg(calL.points, calL.n), n: calW.n + calL.n },
  };
}

const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/rank-points.json`;
/** Una semana alcanza de sobra: son un millón de partidas-jugador. */
const WINDOW_DAYS = 7;

async function main() {
  const t0 = Date.now();
  const ahora = new Date();
  const hasta = ahora.toISOString().slice(0, 19);
  const desde = new Date(ahora.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 19);
  const parts = await listPartitions();
  const con = await connect(":memory:");
  const ranges = await partitionRanges(con, parts, 4);
  const cubren = partitionsCovering(ranges, desde + "Z", hasta + "Z");
  const filas = (await (await con.runAndReadAll(rankPointsSql(rankSourceSql(cubren, desde, hasta)))).getRowObjects()) as Record<string, unknown>[];
  const file = rankPointsFile(
    filas.map((r) => ({
      won: Boolean(r.won),
      streak: Number(r.streak),
      calibrating: Boolean(r.calibrating),
      shieldUsed: Boolean(r.shieldUsed),
      n: Number(r.n),
      points: Number(r.points),
      flat: Number(r.flat),
      typical: Number(r.typical),
    })),
    { from: desde.slice(0, 10), to: hasta.slice(0, 10), generatedAt: ahora.toISOString() }
  );
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(file));
  console.log(
    `puntos de rango: ${file.matches.toLocaleString("es")} partidas-jugador, ${file.from} → ${file.to}; ` +
      `victoria ${file.wins.map((w) => `+${w.typical}`).join(" ")}, derrota ${file.loss.typical}, ` +
      `con escudo ${file.shield.flat} (${((Date.now() - t0) / 1000).toFixed(0)}s)`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
