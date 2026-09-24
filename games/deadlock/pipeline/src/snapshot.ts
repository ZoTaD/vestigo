import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

/**
 * El snapshot público de deadlock-api, leído donde está.
 *
 * **Acá no hay ingesta, y esa es la diferencia entera con TFT.** El pipeline de
 * TFT existe porque Riot sólo contesta partida por partida: hay un cron cada dos
 * minutos, una base, un bucket, retención y un cierre de set, todo para juntar
 * 28.512 tableros. Deadlock publica **la base completa en Parquet todos los días**
 * (~313 GB, sin autenticación), así que la misma pregunta se contesta con una
 * consulta de segundos y sin guardar nada nuestro.
 *
 * Medido el 2026-07-29 contra el snapshot real: 419.297 partidas en la ventana de
 * quince días, y la consulta del winrate por héroe tardó **3,9 segundos**. No se
 * baja el archivo: DuckDB pide por HTTP sólo las columnas y los grupos de filas
 * que la consulta toca.
 *
 * Lo que se paga a cambio es depender de que ese snapshot siga existiendo, y el
 * que lo publica es también un competidor. Por eso todo lo que se calcula es
 * nuestro: de acá sale el dato crudo, nunca su lectura del juego.
 */

/**
 * **El lake de datos de deadlock-api, que reemplazó al snapshot el 2026-09-17.**
 *
 * Hasta esa fecha el snapshot era un archivo Parquet por partición en
 * `s3-cache.deadlock-api.com/db-snapshot`. Ese host dejó de traer partidas con
 * rango el 17/9 a las 13:00 UTC y el 19/9 desapareció del DNS: deadlock-api lo
 * retiró al pasar a un **lake en R2** (`data.deadlock-api.com`) que su propia API
 * usa, descripto por un `manifest.json`. Nadie lo anunció; se encontró leyendo
 * su código (`services/data_dump`, 2026-09-20).
 *
 * La forma nueva, para `match_player`:
 * - un archivo **base** por partición (`intDiv(match_id, 1000000)`), reconstruido
 *   cada tanto;
 * - **deltas** horarios con las filas que llegaron en esa hora, y
 *   **residuales** que los juntan. Cubren cualquier partición, así que una
 *   ventana reciente tiene que leer las bases que toca **más los deltas**,
 *   menos lo que una base ya consolidó (ver `lakeFrom`).
 * Los nombres de archivo llevan la hora de creación: nunca se reescriben, así
 * que el reintento por ETag de `retryingOnRewrite` ya no debería dispararse.
 *
 * Las columnas son las mismas que antes (mismo ClickHouse detrás): verificado
 * el 2026-09-20 sobre un delta real, `average_badge`, `items.item_id`,
 * `stats.time_stamp_s` y compañía con los mismos tipos. `start_time` viene
 * como TIMESTAMP WITH TIME ZONE, por eso `connect` fija la zona en UTC.
 */
const MANIFEST_URL = "https://data.deadlock-api.com/v1/manifest.json";

/** El número de partición con el que se nombran los deltas y residuales juntos. */
export const EXTRAS = -1;

export interface ManifestFile {
  key: string;
  kind: "base" | "delta" | "residual" | "snapshot";
  generation?: number;
  partition?: number;
  /** Marca de agua (unix, segundos): la base tiene las filas con marca ≤ `hi`. */
  hi?: number;
  /** Deltas y residuales: cuántas filas trae de cada partición. */
  rows_by_partition?: Record<string, number>;
  rows: number;
  bytes: number;
  built_at: string;
}

/** Un delta o residual, con las particiones cuyas filas ya están en su base. */
export interface ExtraFile {
  url: string;
  /** Particiones de este archivo que su base ya consolidó: se descartan al leer. */
  covered: number[];
}

interface Lake {
  publicUrl: string;
  /** Partición → archivos base (normalmente uno). */
  bases: Map<number, string[]>;
  /** Deltas y residuales que todavía aportan alguna fila. */
  extras: ExtraFile[];
}

let lake: Lake | null = null;

/**
 * El lake a partir del manifiesto: las bases de la generación vigente y los
 * deltas y residuales **sin lo que las bases ya consolidaron**.
 *
 * **Los deltas no se borran cuando su contenido entra a una base**, y hasta el
 * 2026-09-24 se leían enteros: medido ese día sobre tres días de partidas, el
 * 30% de las rankeadas (28.810 de ~95.000) y el 27% de las de Street Brawl
 * estaban dos veces, una en la base y otra en un delta. El winrate casi no se
 * mueve —el duplicado pesa igual a ganadores y perdedores—, pero cada conteo de
 * filas salía inflado: el uso de cada héroe, las partidas de cada banda, las
 * compras.
 *
 * La regla es la del propio lake (`services/data_dump/compaction.rs` en el repo
 * de deadlock-api): una fila de la partición `p` con marca `t` está en la base
 * de `p` si `t ≤ base(p).hi`, y si no en exactamente un delta o residual. Los
 * archivos no traen la marca por fila, pero no hace falta: las bases se
 * reconstruyen en el borde de un delta horario, así que las filas de `p` en un
 * archivo están todas en la base cuando `base(p).hi ≥ archivo.hi`, y ninguna
 * cuando no. Un archivo con todas sus particiones consolidadas ni se lee.
 */
export function lakeFrom(manifest: {
  public_url: string;
  tables: Record<string, { generation?: number; files: ManifestFile[] }>;
}): Lake {
  const table = manifest.tables?.match_player;
  if (!table || !table.files?.length) {
    throw new SnapshotUnavailable("el manifiesto del lake no trae match_player.");
  }
  const publicUrl = manifest.public_url.replace(/\/$/, "");
  const url = (k: string) => `${publicUrl}/${k}`;
  const basesAll = table.files.filter((f) => f.kind === "base" && f.partition !== undefined);
  // Sólo la generación vigente: una base vieja de la misma partición duplicaría filas.
  const gen = table.generation ?? Math.max(...basesAll.map((f) => f.generation ?? 0));
  const bases = new Map<number, string[]>();
  const baseHi = new Map<number, number>();
  for (const f of basesAll.filter((f) => (f.generation ?? gen) === gen)) {
    bases.set(f.partition!, [...(bases.get(f.partition!) ?? []), url(f.key)]);
    if (f.hi !== undefined) baseHi.set(f.partition!, Math.max(f.hi, baseHi.get(f.partition!) ?? 0));
  }
  if (bases.size === 0) throw new SnapshotUnavailable("el manifiesto del lake no trae ninguna base de match_player.");
  const extras: ExtraFile[] = [];
  for (const f of table.files) {
    if (f.kind !== "delta" && f.kind !== "residual") continue;
    if ((f.generation ?? gen) !== gen) continue;
    const parts = Object.keys(f.rows_by_partition ?? {}).map(Number);
    // Sin `hi` o sin el reparto por partición no hay cómo saber qué está
    // consolidado: se lee entero, que es como se leía antes.
    const covered =
      f.hi === undefined ? [] : parts.filter((p) => (baseHi.get(p) ?? -Infinity) >= f.hi!).sort((a, b) => a - b);
    if (parts.length > 0 && covered.length === parts.length) continue;
    extras.push({ url: url(f.key), covered });
  }
  return { publicUrl, bases, extras };
}

/**
 * La lectura de los deltas y residuales, descartando de cada archivo las
 * particiones que su base ya tiene (ver `lakeFrom`). `filename=true` es lo que
 * deja saber de qué archivo vino cada fila; se saca antes de devolver.
 */
export function extrasSource(extras: ExtraFile[]): string {
  if (extras.length === 0) return `read_parquet('lake://match_player/vacio-${EXTRAS}')`;
  const files = extras.map((f) => `'${f.url}'`).join(", ");
  const read = `read_parquet([${files}], union_by_name=true, filename=true)`;
  const skip = extras
    .filter((f) => f.covered.length > 0)
    .map((f) => `(filename = '${f.url}' and match_id // 1000000 in (${f.covered.join(", ")}))`);
  const where = skip.length > 0 ? ` where not (${skip.join(" or ")})` : "";
  return `(select * exclude (filename) from ${read}${where})`;
}

/**
 * Las particiones de `match_player`, de la más vieja a la más nueva, leídas del
 * manifiesto del lake. Guarda el manifiesto para que `partitionSource` arme las
 * lecturas: **una corrida entera lee la misma versión**, aunque el lake publique
 * otra en el medio.
 *
 * Son cronológicas por `match_id`, así que las últimas cubren los últimos días
 * y la ventana sigue siendo barata.
 */
export async function listPartitions(): Promise<number[]> {
  let res: Response;
  try {
    res = await fetch(MANIFEST_URL);
  } catch (e) {
    throw new SnapshotUnavailable(`el lake no responde (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!res.ok) throw new SnapshotUnavailable(`el manifiesto del lake contestó ${res.status}`);
  lake = lakeFrom(await res.json());
  return [...lake.bases.keys()].sort((a, b) => a - b);
}

/**
 * De dónde lee una partición: sus archivos base, o —para `EXTRAS`— los deltas
 * y residuales sin lo ya consolidado (`extrasSource`). Es una expresión lista
 * para un `from`. `union_by_name` porque los deltas pueden tener columnas de más o de
 * menos entre sí, y `select *` sobre eso fallaría.
 *
 * Sin manifiesto cargado (los tests de forma del SQL) devuelve una lectura
 * simbólica: lo que se prueba ahí son los filtros, no la dirección.
 */
export function partitionSource(n: number): string {
  if (lake && n === EXTRAS) return extrasSource(lake.extras);
  const files = lake ? (lake.bases.get(n) ?? []) : [`lake://match_player/${n}`];
  if (files.length === 0) return `read_parquet('lake://match_player/vacio-${n}')`;
  return `read_parquet([${files.map((f) => `'${f}'`).join(", ")}], union_by_name=true)`;
}

/**
 * El techo de la ventana, en días.
 *
 * La ventana real **arranca en el último parche** (ver patches.ts), no hace
 * quince días: medido sobre el parche del 2026-07-28, seis héroes se movieron 2+
 * puntos de winrate de un día para el otro, y promediar los dos lados publica un
 * número que no describe a ninguno de los dos juegos.
 *
 * Este número sólo actúa cuando el parche ya lleva mucho tiempo vivo: los
 * parches de Deadlock salen más o menos una vez por mes, y a los quince días la
 * muestra ya está asentada. Más allá de eso, seguir sumando días sólo hace la
 * lista menos reciente.
 */
export const MAX_WINDOW_DAYS = 15;

/**
 * Debajo de esto una banda se publica marcada como provisional.
 *
 * El día que sale un parche la ventana tiene horas de partidas, y ahí hay que
 * elegir entre publicar poco o publicar viejo. Se elige poco **y se avisa**: es
 * la misma decisión que el `provisional` de TFT, y por el mismo motivo — una
 * lista del parche anterior con cara de actual es peor que una lista fina que
 * dice que es fina.
 */
export const PROVISIONAL_MATCHES = 8_000;

/** Los límites de una partición, para saber si toca la ventana que se busca. */
export interface PartitionRange {
  n: number;
  from: string;
  to: string;
}

/**
 * Cuándo empieza y termina cada partición, de la más nueva hacia atrás.
 *
 * Sólo mira las `count` más nuevas: la ventana más larga que este pipeline pide
 * son treinta días (quince después del parche y quince antes) y cada partición
 * cubre unos cinco, así que ocho alcanzan con holgura. Preguntarle la fecha a las
 * 97 costaría 97 consultas para descartar 89.
 *
 * Es barato: la fecha sale de la metadata del Parquet, no de leer las filas.
 */
export async function partitionRanges(
  con: { runAndReadAll: (sql: string) => Promise<{ getRowObjects: () => unknown[] }> },
  partitions: number[],
  count = 10
): Promise<PartitionRange[]> {
  const recientes = partitions.filter((n) => n !== EXTRAS).slice(-count);
  const sql = recientes
    .map(
      (n) => `select ${n} as n,
                     strftime(min(start_time), '%Y-%m-%dT%H:%M:%SZ') as "from",
                     strftime(max(start_time), '%Y-%m-%dT%H:%M:%SZ') as "to"
              from ${partitionSource(n)}`
    )
    .join(" union all ");
  const filas = (await (await con.runAndReadAll(`${sql} order by n`)).getRowObjects()) as PartitionRange[];
  // Los deltas traen filas de cualquier época (partidas que llegaron tarde), así
  // que se cuentan como que tocan cualquier ventana: el filtro por start_time de
  // cada consulta se queda con lo que corresponde.
  if (lake && lake.extras.length > 0) filas.push({ n: EXTRAS, from: "0000-01-01T00:00:00Z", to: "9999-12-31T23:59:59Z" });
  return filas;
}

/**
 * Las particiones que se solapan con un rango de fechas.
 *
 * Se compara solapamiento y no pertenencia: una ventana que arranca a mitad de
 * una partición necesita esa partición entera, y el filtro por `start_time` de
 * la consulta se encarga de descartar las filas de más. Devolver de menos sería
 * perder partidas en silencio.
 */
export function partitionsCovering(ranges: PartitionRange[], from: string, to: string): number[] {
  return ranges.filter((r) => r.from <= to && r.to >= from).map((r) => r.n);
}

/**
 * El modo que cuenta.
 *
 * **Hasta el 2026-07-30 esto valía `Unranked`, porque Deadlock no tenía cola
 * rankeada.** Lo competitivo ERA el unranked y el filtro no era quedarse con lo
 * rankeado sino sacar lo que no es una partida de verdad. El "July 30, 2026
 * Update" abrió `Ranked` y el reparto quedó parejo de entrada: 12.481 ranked
 * contra 12.434 unranked normales en las primeras 16 horas.
 *
 * **Y no son el mismo juego.** Medido sobre esas mismas horas, 8 héroes de 38 se
 * separan más de dos errores estándar donde el azar daría 1,7 —Lady Geist −5,15
 * (z=−4,6), Infernus −3,62, Sinclair +5,13, Yamato +3,44—, moviéndose 4,8 puestos
 * en promedio y 18 en el peor caso. Tiene sentido por construcción: ranked pide
 * 60 victorias, 15 con el héroe, y es solo o dúo.
 *
 * Hay un segundo motivo, y hoy es el que manda: **después del reset el rango sólo
 * existe del lado rankeado**. La cobertura de badge por hora es del 70-79% en
 * ranked contra ~3% en standard. Medir unranked sería medir sin bandas.
 */
export const PLAYED_MODE = "Ranked";

/**
 * El modo de juego que cuenta, que **no** es lo mismo que el modo de partida.
 *
 * Descubierto el 2026-07-30, midiendo para la tier list de ítems: `match_mode` y
 * `game_mode` son columnas distintas, y adentro de `Unranked` conviven `Normal`
 * (38,4 minutos de duración media) y `StreetBrawl` (14,4). Son **3.712 de 29.914
 * partidas, el 12,4%** de la ventana. Filtrar sólo por `match_mode` mete un
 * segundo juego en el promedio sin que nada lo diga.
 *
 * **Para héroes el daño es menor y se midió antes de alarmar**: mueve el winrate
 * 0,2 puntos típicos y 1,0 en el peor caso, y ningún héroe se corre más de 3
 * puestos. **Para ítems es decisivo**: los 17 ítems de coste 9999 se compran
 * únicamente en Street Brawl y sin este filtro encabezan la lista cruda con
 * 61,9%. Con el filtro desaparecen solos, sin una lista negra que mantener.
 */
export const PLAYED_GAME_MODE = "Normal";

/**
 * Qué fracción de la hora tiene que traer rango para que la hora cuente.
 *
 * **Existe por cómo van a volver los rangos, no por cómo se fueron.** El
 * 2026-07-30 a las 16:19 UTC se cayeron de golpe: de 99,5% de cobertura a 0% en
 * dos horas. Pero vuelven de a poco —cada jugador destapa su rango al terminar
 * ocho partidas de calibración— así que un corte en "alguna partida tiene rango"
 * descongelaría la lista con la muestra de los que más juegan, que es justamente
 * el sesgo que las bandas existen para no tener.
 *
 * La mitad es el punto en que el promedio de la partida vuelve a describir a la
 * partida: con seis de doce jugadores calibrados, el promedio ya no es el de un
 * puñado de madrugadores.
 */
export const RANK_COVERAGE = 0.5;

/**
 * Cuántas partidas necesita una hora para que se le crea la cobertura.
 *
 * La hora que está a medio escribir en la partición viva trae siete partidas, y
 * las cuatro de la mañana traen unas 270 contra las 3.400 del pico. Sin este piso,
 * cuatro partidas de siete alcanzarían para descongelar la tier list entera.
 */
export const RANK_MIN_PER_HOUR = 100;

/** Cuántas partidas de una hora traen rango. */
export interface RankHour {
  hour: string;
  matches: number;
  ranked: number;
}

/**
 * Hasta cuándo el snapshot sabe a qué nivel se jugó.
 *
 * Es el final de la última hora con cobertura de rango, y es lo que se usa como
 * techo de la ventana en lugar de "ahora". **Congela solo y descongela solo**: el
 * día que Valve devuelva los rangos este número avanza por su cuenta y las cuatro
 * bandas vuelven a crecer sin que haya que acordarse de deployar nada.
 *
 * Devuelve `null` si no hay ni una hora con rangos, que es distinto de devolver
 * una fecha vieja: quien lo llama tiene que poder cortar con un mensaje en vez de
 * publicar una ventana vacía.
 */
export function horizonFrom(
  hours: RankHour[],
  coverage: number = RANK_COVERAGE,
  min: number = RANK_MIN_PER_HOUR
): string | null {
  const conRango = hours
    .filter((h) => h.matches >= min && h.ranked / h.matches >= coverage)
    .map((h) => new Date(h.hour).getTime());
  if (conRango.length === 0) return null;
  return new Date(Math.max(...conRango) + 3_600_000).toISOString();
}

/**
 * La cobertura de rango hora por hora, sobre las mismas partidas que se miden.
 *
 * Se cuenta sobre el mismo corpus que usa la ventana —mismo `match_mode`, mismo
 * `game_mode`— y no sobre el snapshot entero: la pregunta no es si Deadlock tiene
 * rangos en algún lado, es si **las partidas que publicamos** los tienen.
 *
 * **La hora sale formateada con `Z` y no como timestamp**, igual que en
 * `partitionRanges`. DuckDB devuelve un `DuckDBTimestampValue` sin huso, y
 * `new Date()` sobre eso lo lee como hora **local**: en esta máquina (UTC−3) el
 * horizonte salía tres horas adelantado y en el runner de CI (UTC) salía bien, que
 * es la forma más cara de estar roto.
 */
export function rankHoursSql(partitions: number[], from: string): string {
  return partitions
    .map(
      (n) => `
    select strftime(date_trunc('hour', start_time), '%Y-%m-%dT%H:%M:%SZ') as hour,
           count(distinct match_id)::BIGINT as matches,
           count(distinct case when ${BADGE} > 0
                          then match_id end)::BIGINT as ranked
    from ${partitionSource(n)}
    where match_mode = '${PLAYED_MODE}'
      and game_mode = '${PLAYED_GAME_MODE}'
      and start_time >= TIMESTAMP '${from}'
    group by 1
  `
    )
    .join(" union all ");
}

/**
 * El horizonte medido contra el snapshot. Tira si no encuentra ninguno: sin
 * rangos no hay bandas, y publicar cuatro archivos vacíos sería peor que fallar.
 */
export async function rankHorizon(
  con: { runAndReadAll: (sql: string) => Promise<{ getRowObjects: () => unknown[] }> },
  partitions: number[],
  from: string
): Promise<string> {
  const filas = (await (
    await con.runAndReadAll(`${rankHoursSql(partitions, from)} order by hour`)
  ).getRowObjects()) as { hour: unknown; matches: bigint; ranked: bigint }[];

  const horizonte = horizonFrom(
    filas.map((f) => ({
      hour: new Date(f.hour as string | number | Date).toISOString(),
      matches: Number(f.matches),
      ranked: Number(f.ranked),
    }))
  );

  if (horizonte === null) {
    throw new Error(
      `ninguna hora desde ${from.slice(0, 10)} llega al ${RANK_COVERAGE * 100}% de partidas con rango. ` +
        "O la calibración de Deadlock lleva más que la ventana entera, o el snapshot dejó de traer el badge."
    );
  }
  return horizonte;
}

/**
 * Cuáles de esas particiones tienen la columna que se va a pedir.
 *
 * El esquema del snapshot **crece con el tiempo** y las particiones no lo
 * comparten. Preguntar antes es más barato que fallar: la respuesta sale de la
 * metadata del Parquet, sin leer una fila.
 */
export async function partitionsWithColumn(
  con: { runAndReadAll: (sql: string) => Promise<{ getRowObjects: () => unknown[] }> },
  partitions: number[],
  column: string
): Promise<number[]> {
  const tiene = await Promise.all(
    partitions.map(async (n) => {
      const filas = (await (
        await con.runAndReadAll(
          `select count(*)::BIGINT as n from (describe select * from ${partitionSource(n)})
           where column_name = '${column}'`
        )
      ).getRowObjects()) as { n: bigint }[];
      return Number(filas[0].n) > 0 ? n : null;
    })
  );
  return tiene.filter((n): n is number => n !== null);
}

/**
 * La columna de la que sale la banda, y la que decide qué particiones sirven.
 *
 * Es el promedio de **la sala entera**, no el de un equipo. Verificado contra el
 * rango individual de la misma partida: correlación **1,000** y 0,1 de diferencia
 * media, así que es el ladder nuevo y no el viejo arrastrado.
 *
 * **Sobrevivió al reset del 2026-07-30, y las de equipo no.** Post-reset hay
 * 4.399 partidas con este valor contra 455 con `average_badge_team0/1`. Pre-reset
 * las dos fuentes dan la misma banda el **97,3%** de las veces, así que preferir
 * ésta no reescribe lo que ya se había publicado.
 */
export const BADGE = "coalesce(average_badge, average_badge_team0, average_badge_team1)";

/**
 * Las particiones que pueden aportar banda, de las que se le pasen.
 *
 * `average_badge` es parte del esquema nuevo: medido, la 95 y la 96 la traen (154
 * columnas) y la 92, 93 y 94 no (139). Pedírsela a una vieja no devuelve nulos,
 * **falla la consulta entera** con "Referenced column not found".
 *
 * Descartarlas no pierde nada mientras el corpus sea `Ranked`: la cola rankeada
 * abrió el 2026-07-30 16:19 UTC y ninguna partición vieja tiene una sola partida
 * de ésas. Igual se avisa por consola en vez de descartarlas en silencio, porque
 * el día que eso deje de ser cierto la diferencia va a estar en el log y no en un
 * número raro.
 */
export async function bandablePartitions(
  con: { runAndReadAll: (sql: string) => Promise<{ getRowObjects: () => unknown[] }> },
  partitions: number[]
): Promise<number[]> {
  const usables = await partitionsWithColumn(con, partitions, "average_badge");
  const fuera = partitions.filter((n) => !usables.includes(n));
  if (fuera.length > 0) {
    console.log(`  particiones sin average_badge (esquema viejo, sin partidas ranked; -1 son los deltas): ${fuera.join(", ")}`);
  }
  return usables;
}

/**
 * A partir de cuánto atraso el horizonte deja de ser "la última hora incompleta"
 * y pasa a ser una congelación que hay que avisar.
 *
 * En marcha normal el horizonte queda una hora o dos atrás de `now`, porque la
 * hora viva está a medio escribir y nunca llega a la cobertura. Eso no es una
 * anomalía y no merece un renglón en el log de cada corrida.
 */
export const FROZEN_AFTER_H = 6;

/**
 * El techo de la ventana: `now`, o el horizonte de rango si se quedó atrás.
 *
 * Los tres builds lo usan en lugar de `new Date()`. Es un solo lugar a propósito:
 * si `build:heroes` se congelara y `build:builds` no, la tarjeta de build mediría
 * un período que la tier list no, y nada lo diría.
 */
export async function windowEnd(
  con: { runAndReadAll: (sql: string) => Promise<{ getRowObjects: () => unknown[] }> },
  ranges: PartitionRange[]
): Promise<Date> {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - MAX_WINDOW_DAYS * 86_400_000).toISOString();
  const usables = await bandablePartitions(con, partitionsCovering(ranges, desde, ahora.toISOString()));
  const horizonte = new Date(await rankHorizon(con, usables, desde));
  if (horizonte.getTime() >= ahora.getTime()) return ahora;

  const atrasoH = (ahora.getTime() - horizonte.getTime()) / 3_600_000;
  if (atrasoH >= FROZEN_AFTER_H) {
    console.log(
      `⚠ CONGELADA: el snapshot trae rangos sólo hasta ${horizonte.toISOString().slice(0, 16)}Z ` +
        `(${Math.floor(atrasoH)} h atrás). La ventana se topa ahí y se descongela sola cuando vuelvan.`
    );
  }
  return horizonte;
}

/**
 * Una conexión a DuckDB lista para leer del bucket.
 *
 * En memoria salvo que se le pase un archivo, que es sólo para desarrollo:
 * cargar la ventana tarda varios minutos y afinar una fórmula no debería
 * volver a bajarla cada vez.
 */
export async function connect(path = ":memory:"): Promise<DuckDBConnection> {
  const db = await DuckDBInstance.create(path);
  const con = await db.connect();
  await con.run("install httpfs; load httpfs;");
  // `start_time` del lake es TIMESTAMPTZ y las ventanas se escriben como
  // TIMESTAMP en UTC: sin esto DuckDB compararía con la zona de la máquina
  // (UTC−3 acá, UTC en CI) y la ventana correría tres horas según dónde corra.
  await con.run("set TimeZone = 'UTC';");
  return con;
}

/**
 * El snapshot no está: DNS caído, bucket sin responder, 5xx.
 *
 * Es un error distinto de "la consulta falló" y se trata distinto: el
 * 2026-09-19 el host del snapshot dejó de resolver y `build:items` tumbó la
 * corrida entera, así que ni la tier list de héroes —que ya sabía medirse con
 * la API en vivo— ni el periódico llegaron al sitio durante un día. Un build
 * que depende del snapshot y no lo encuentra **mantiene lo publicado y deja
 * seguir la corrida** (ver `runSnapshotBuild`); cualquier otro error sigue
 * tumbándola, porque ése sí puede ser nuestro.
 */
export class SnapshotUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotUnavailable";
  }
}

/** También lo que DuckDB dice cuando no llega al bucket a través de httpfs. */
export const isSnapshotUnavailable = (e: unknown): boolean =>
  e instanceof SnapshotUnavailable ||
  (e instanceof Error &&
    /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|Could not establish connection|Connection error|Failed to (?:open|read) file.*deadlock-api|Unable to connect|HTTP GET error|Could not resolve/i.test(e.message));

/**
 * Corre un build que lee del snapshot, con la política de salida de todos:
 * reintenta si la partición se reescribió, **sale con 0 y avisa si el snapshot
 * no está** (lo publicado sigue siendo válido; la página dice hasta cuándo
 * llega), y sale con 1 ante cualquier otro error.
 */
export async function runSnapshotBuild(nombre: string, main: () => Promise<void>): Promise<void> {
  try {
    await retryingOnRewrite(main);
  } catch (e) {
    if (isSnapshotUnavailable(e)) {
      console.log(`⚠ ${nombre}: SNAPSHOT INACCESIBLE (${e instanceof Error ? e.message : String(e)}). Se mantiene lo publicado.`);
      return;
    }
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

/** La marca de que el snapshot cambió debajo de una consulta en curso. */
export const isEtagChange = (e: unknown): boolean =>
  e instanceof Error && /ETag on reading file/i.test(e.message);

/**
 * Corre algo contra el snapshot y **lo reintenta si la partición se reescribió
 * en el medio**.
 *
 * La partición viva se reescribe cada ~70 minutos, y `build:builds` tarda varios
 * minutos: tarde o temprano una consulta empieza con un archivo y termina con
 * otro. DuckDB lo detecta por ETag y aborta —bien hecho, porque seguir daría
 * datos mezclados de dos versiones— pero el pipeline moría con él. Pasó por
 * primera vez el 2026-07-31.
 *
 * **Se reintenta en vez de desactivar el chequeo.** `unsafe_disable_etag_checks`
 * haría que la consulta termine leyendo mitad de un archivo y mitad de otro sin
 * decir nada, que es exactamente el tipo de error que no se ve hasta que alguien
 * mira un número raro tres semanas después.
 *
 * Sólo reintenta ESE error. Cualquier otro sube, porque un fallo de verdad tiene
 * que romper la corrida.
 */
export async function retryingOnRewrite<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await fn();
    } catch (e) {
      if (!isEtagChange(e) || n >= intentos) throw e;
      console.log(`  el snapshot se reescribió durante la consulta; reintento ${n} de ${intentos - 1}`);
      // Un respiro para que termine de subirse antes de volver a leer.
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
}

/**
 * La ventana como una expresión SQL: las particiones dadas, recortadas al rango
 * de fechas, ya filtradas a partidas jugadas de verdad y con el rango resuelto.
 *
 * `coalesce` de los dos equipos y no sólo uno: el promedio de cada equipo puede
 * venir nulo por separado, y descartar la fila por eso perdería partidas enteras
 * cuando alcanza con el promedio del otro lado para saber a qué nivel se jugó.
 *
 * `won` en vez de comparar `team` con `winning_team`: la columna existe y dice lo
 * mismo con una comparación menos.
 */
export function windowSql(partitions: number[], from: string, to: string): string {
  return selectFrom(
    `start_time, hero_id, won, net_worth, match_id, duration_s,
     ${BADGE} // 10 as tier`,
    partitions,
    from,
    to
  );
}

/**
 * La misma ventana, pero trayendo las compras en vez de los números del jugador.
 *
 * Existe aparte y no como columnas de más en `windowSql` porque **las columnas
 * cuestan**: DuckDB pide por HTTP sólo los pedazos del Parquet que la consulta
 * toca, así que sumarle dos arrays a la consulta de héroes la haría más lenta
 * para nada.
 *
 * **Los nombres van entre comillas dobles y ésa es la parte que cuesta
 * descubrir.** En el Parquet la columna se llama literalmente `items.item_id`,
 * con el punto adentro del nombre; sin comillas DuckDB lee `items` como una tabla
 * y falla con "Referenced table items not found".
 */
export function itemsWindowSql(partitions: number[], from: string, to: string): string {
  return selectFrom(
    `start_time, won, match_id,
     ${BADGE} // 10 as tier,
     "items.item_id" as item_ids, "items.game_time_s" as item_times`,
    partitions,
    from,
    to
  );
}

/**
 * La misma ventana, con los baneos de cada partida (ver `bans.ts`). Una fila
 * por jugador, como las demás: quien la usa agrupa por `match_id`.
 */
export function bansWindowSql(partitions: number[], from: string, to: string): string {
  return selectFrom(`match_id, ${BADGE} // 10 as tier, banned_hero_ids`, partitions, from, to);
}

/**
 * El tronco común de las ventanas: mismas particiones, mismos filtros.
 *
 * **Cada partición nombra sus columnas en vez de pedir `*`, y eso no es estilo.**
 * Las particiones NO comparten esquema: medido el 2026-07-30, la 95 y la 96
 * traen 153 columnas y la 93 y la 94 traen 139 — deadlock-api sumó catorce
 * columnas de ranked (`ranked_type`, `rank_interval`,
 * `player_rank_initial_display_rank` y once más). Uniendo dos particiones de
 * distinto ancho con `select *`, DuckDB falla con "Set operations can only apply
 * to expressions with the same number of result columns", y eso **rompió
 * `build:heroes` en producción**: la brecha por rango abarca quince días, o sea
 * varias particiones.
 *
 * Nombrarlas lo vuelve inmune a que el snapshot crezca, y de paso es más barato:
 * DuckDB pide por HTTP sólo las columnas que la consulta toca.
 *
 * El filtro va adentro de cada rama y no una vez al final, para que se empuje a
 * cada archivo por separado.
 *
 * **El badge se exige `> 0` y no `is not null`.** El badge vale `rango*10 +
 * subnivel` con el subnivel arrancando en 1, así que un Obscurus real es 1..9 y
 * el 0 es "sin rango". Desde el reset del 2026-07-30 todas las partidas traen 0,
 * y con el filtro viejo entraban y se contaban como Obscurus: la banda de abajo
 * se llevó a todos los rangos del juego en una sola corrida.
 */
function selectFrom(columns: string, partitions: number[], from: string, to: string): string {
  return partitions
    .map(
      (n) => `
    select ${columns}
    from ${partitionSource(n)}
    where match_mode = '${PLAYED_MODE}'
      and game_mode = '${PLAYED_GAME_MODE}'
      and ${BADGE} > 0
      and start_time >= TIMESTAMP '${from}'
      and start_time <  TIMESTAMP '${to}'
  `
    )
    .join(" union all ");
}
