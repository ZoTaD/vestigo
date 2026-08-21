import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BANDS, bandPath, publishedDefaultBand } from "./bands";
import {
  BADGE,
  MAX_WINDOW_DAYS,
  PLAYED_GAME_MODE,
  PLAYED_MODE,
  bandablePartitions,
  connect,
  listPartitions,
  partitionRanges,
  partitionUrl,
  partitionsCovering,
  retryingOnRewrite,
  windowEnd,
} from "./snapshot";

/**
 * La curva de maestría: cuánto rinde un héroe cuando quien lo juega ya lo jugó.
 *
 * **La confusión que hay que sacarle antes de creerle una sola cifra:** "el que
 * juega más un héroe gana más" no prueba que el héroe premie la práctica, porque
 * quien acumula 250 partidas con alguien también es, en promedio, mejor jugador.
 * Sin controlar eso, la curva mide **quién lo juega** y no **qué se aprende** —
 * que es exactamente el error por el que ya se sacaron KDA y almas de la tier
 * list, y por el que se retiró la brecha por rango de los ítems.
 *
 * Por eso se mide **dentro de una banda**: con el nivel de juego fijo, el que
 * jugó 250 partidas y el que jugó 10 están jugando contra rivales equivalentes,
 * así que lo que queda es del héroe. No lo elimina del todo —adentro de una banda
 * todavía hay rango de habilidad— pero es la misma herramienta que usa el resto
 * del sitio, y es honesta sobre lo que hace.
 *
 * **Si la curva sale plana adentro de la banda, no se publica.** Que un número
 * tenga señal estadística no alcanza: hay que poder decir qué la causa.
 *
 * Cuesta ~12-15 minutos porque cuenta la historia entera del snapshot (97
 * particiones), así que corre **una vez por día** y no con la corrida horaria: la
 * respuesta no cambia de una hora a la otra.
 *
 * Diseño en `docs/design/2026-08-01-escalera-lados-maestria-y-parche-design.md`.
 */

const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/mastery.json`;

/** Los pisos de cada tramo, en partidas previas con ESE héroe. */
export const BUCKETS = [0, 10, 50, 100, 250] as const;

/**
 * Cuánta muestra necesita un tramo para dibujarse.
 *
 * Con 500 partidas el error estándar de un winrate es 2,2 pp y las diferencias
 * que buscamos van de 1 a 7 pp. Por debajo de eso el tramo diría cualquier cosa,
 * y encima diría la más llamativa: los tramos de mucha experiencia son los más
 * flacos, así que el ruido caería justo donde la página quiere una conclusión.
 */
export const MIN_PER_BUCKET = 500;

export const bucketOf = (previas: number): number => {
  let out: number = BUCKETS[0];
  for (const b of BUCKETS) if (previas >= b) out = b;
  return out;
};

/**
 * El mismo reparto, en SQL.
 *
 * **Los tramos se evalúan de mayor a menor y ése es todo el truco.** Un `case`
 * escrito al derecho encontraría `>= 0` primero y mandaría todo al tramo cero: la
 * curva saldría plana y parecería un hallazgo en vez de un bug.
 */
export const bucketSql = (col: string): string =>
  `case ${[...BUCKETS]
    .sort((a, b) => b - a)
    .map((b) => `when coalesce(${col}, 0) >= ${b} then ${b}`)
    .join(" ")} end`;

export interface MasteryRaw {
  heroId: number;
  from: number;
  matches: number;
  wins: number;
}

export interface MasteryBucket {
  from: number;
  matches: number;
  winRate: number;
}

export interface MasteryHero {
  heroId: number;
  buckets: MasteryBucket[];
  /** Puntos de winrate entre el tramo más alto con muestra y el más bajo. */
  boost?: number;
}

export interface MasteryFile {
  generatedAt: string;
  band: string;
  from: string;
  to: string;
  /** Pares (jugador, héroe) que se puntuaron. */
  pairs: number;
  heroes: MasteryHero[];
}

/**
 * De filas por (héroe, tramo) a la curva de cada héroe.
 *
 * **El boost se omite cuando queda un solo tramo.** Un cero diría "la experiencia
 * no cambia nada", que es una afirmación; la ausencia dice "no sé", que es lo que
 * pasa. Es la misma regla que ya siguen `skillGap` y `trend`.
 */
export function masteryFrom(raw: MasteryRaw[]): MasteryHero[] {
  const porHeroe = new Map<number, MasteryBucket[]>();
  for (const r of raw) {
    if (r.matches < MIN_PER_BUCKET) continue;
    const lista = porHeroe.get(r.heroId) ?? [];
    lista.push({ from: r.from, matches: r.matches, winRate: r.wins / r.matches });
    porHeroe.set(r.heroId, lista);
  }

  return [...porHeroe.entries()]
    .map(([heroId, buckets]) => {
      const ordenados = [...buckets].sort((a, b) => a.from - b.from);
      const boost =
        ordenados.length >= 2
          ? (ordenados[ordenados.length - 1].winRate - ordenados[0].winRate) * 100
          : undefined;
      return { heroId, buckets: ordenados, ...(boost !== undefined ? { boost } : {}) };
    })
    .sort((a, b) => (b.boost ?? -Infinity) - (a.boost ?? -Infinity));
}

/**
 * La ventana que se puntúa: como `windowSql`, pero trayendo `account_id`.
 *
 * Existe aparte en vez de sumarle la columna a `windowSql` porque **las columnas
 * cuestan**: DuckDB pide por HTTP sólo los pedazos del Parquet que la consulta
 * toca, y `build:heroes` corre cada hora sin necesitar quién jugó.
 */
const windowWithAccount = (parts: number[], from: string, to: string): string =>
  parts
    .map(
      (n) => `
    select account_id, hero_id, won, ${BADGE} // 10 as tier
    from read_parquet('${partitionUrl(n)}')
    where match_mode = '${PLAYED_MODE}' and game_mode = '${PLAYED_GAME_MODE}'
      and ${BADGE} > 0
      and start_time >= TIMESTAMP '${from}' and start_time < TIMESTAMP '${to}'`
    )
    .join(" union all ");

/**
 * La historia previa a la ventana, partición por partición.
 *
 * **Cuenta los dos modos a propósito.** La pregunta es cuántas veces esta persona
 * jugó este héroe, y una partida sin rankear también enseña. Ranked existe desde
 * hace tres días: exigirlo dejaría a todo el mundo en el tramo cero.
 *
 * Se excluye Street Brawl (`game_mode = 'Normal'`), que dura 14 minutos contra 38
 * y no es el mismo juego.
 */
const historyBefore = (parts: number[], before: string): string =>
  parts
    .map(
      (n) => `
    select account_id, hero_id
    from read_parquet('${partitionUrl(n)}')
    where game_mode = '${PLAYED_GAME_MODE}' and start_time < TIMESTAMP '${before}'`
    )
    .join(" union all ");

async function main() {
  const con = await connect();
  const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjects();

  const banda = publishedDefaultBand();
  const tiers = BANDS.find((b) => b.id === banda)!.tiers.join(", ");
  console.log(`maestría sobre la banda publicada: ${banda} (rangos ${tiers})`);

  const partitions = await listPartitions();
  const ranges = await partitionRanges(con, partitions);
  const hasta = await windowEnd(con, ranges);
  const desde = new Date(hasta.getTime() - MAX_WINDOW_DAYS * 86_400_000).toISOString();
  const parts = await bandablePartitions(con, partitionsCovering(ranges, desde, hasta.toISOString()));
  if (parts.length === 0) throw new Error("no hay ni una partición con rangos en la ventana");

  // 1. La ventana, ya filtrada por banda. Es chica y se usa tres veces.
  await con.run(`create or replace table v as
    select * from (${windowWithAccount(parts, desde, hasta.toISOString())}) where tier in (${tiers})`);
  const [{ filas }] = (await rows("select count(*)::BIGINT as filas from v")) as unknown as { filas: bigint }[];
  console.log(`  ventana: ${Number(filas).toLocaleString("es")} filas de jugador`);

  // 2. Los pares a puntuar. Sin este paso, el agregado de la historia son decenas
  //    de millones de filas que después se tiran casi enteras.
  await con.run("create or replace table pares as select distinct account_id, hero_id from v");
  const [{ n }] = (await rows("select count(*)::BIGINT as n from pares")) as unknown as { n: bigint }[];
  console.log(`  ${Number(n).toLocaleString("es")} pares (jugador, héroe) a puntuar`);

  // 3. La historia: 97 particiones, ~12-15 minutos. El `semi join` contra `pares`
  //    es lo que hace que el agregado entre en memoria.
  const t0 = Date.now();
  await con.run(`create or replace table previas as
    select h.account_id, h.hero_id, count(*)::BIGINT as previas
    from (${historyBefore(partitions, desde)}) h
    semi join pares p on p.account_id = h.account_id and p.hero_id = h.hero_id
    group by 1, 2`);
  console.log(`  historia escaneada en ${((Date.now() - t0) / 60_000).toFixed(1)} min`);

  const crudas = (await rows(`
    select hero_id as heroId, bucket as "from",
           count(*)::BIGINT as matches,
           sum(case when won then 1 else 0 end)::BIGINT as wins
    from (
      select v.hero_id, v.won, ${bucketSql("pr.previas")} as bucket
      from v left join previas pr
        on pr.account_id = v.account_id and pr.hero_id = v.hero_id
    ) t
    group by 1, 2`)) as unknown as { heroId: number; from: number; matches: bigint; wins: bigint }[];

  const heroes = masteryFrom(
    crudas.map((c) => ({
      heroId: Number(c.heroId),
      from: Number(c.from),
      matches: Number(c.matches),
      wins: Number(c.wins),
    }))
  );

  const file: MasteryFile = {
    generatedAt: new Date().toISOString(),
    band: banda,
    from: desde.slice(0, 10),
    to: hasta.toISOString().slice(0, 10),
    pairs: Number(n),
    heroes,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(bandPath(OUT, banda), JSON.stringify(file));
  writeFileSync(OUT, JSON.stringify(file));

  const conCurva = heroes.filter((h) => h.boost !== undefined);
  console.log(`  ${heroes.length} héroes, ${conCurva.length} con curva completa`);
  for (const h of conCurva.slice(0, 5)) {
    console.log(
      `    héroe ${h.heroId}: ${h.buckets.map((b) => `${b.from}+ ${(b.winRate * 100).toFixed(1)}%`).join("  ")}` +
        `  → ${h.boost!.toFixed(1)} pts`
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  retryingOnRewrite(main).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
