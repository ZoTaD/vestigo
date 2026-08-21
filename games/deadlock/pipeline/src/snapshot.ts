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

const BASE = "https://s3-cache.deadlock-api.com/db-snapshot";
const PUBLIC = `${BASE}/public`;

/**
 * Las particiones de `match_player`, de la más vieja a la más nueva.
 *
 * Están numeradas y son **cronológicas por `match_id`**: la 96 tiene los últimos
 * días y la 25 tiene 2025. Eso es lo que hace barata la ventana — se consultan
 * las últimas y no las 97.
 *
 * La lista se lee del bucket en vez de escribirse acá porque crece sola: aparece
 * una partición nueva cada pocos días. Un número fijo dejaría de ver lo nuevo sin
 * que nada fallara, que es la peor forma de romperse.
 */
export async function listPartitions(): Promise<number[]> {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) throw new Error(`el bucket del snapshot contestó ${res.status}`);
  const xml = await res.text();
  const nums = [...xml.matchAll(/match_player\/match_player_(\d+)\.parquet/g)].map((m) => Number(m[1]));
  if (nums.length === 0) {
    throw new Error(
      "no encontré ni una partición de match_player en el bucket. " +
        "O cambió la forma de las claves, o el snapshot dejó de publicarse."
    );
  }
  return [...new Set(nums)].sort((a, b) => a - b);
}

/** La URL de lectura de una partición. */
export const partitionUrl = (n: number): string => `${PUBLIC}/match_player/match_player_${n}.parquet`;

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
  count = 8
): Promise<PartitionRange[]> {
  const recientes = partitions.slice(-count);
  const sql = recientes
    .map(
      (n) => `select ${n} as n,
                     strftime(min(start_time), '%Y-%m-%dT%H:%M:%SZ') as "from",
                     strftime(max(start_time), '%Y-%m-%dT%H:%M:%SZ') as "to"
              from read_parquet('${partitionUrl(n)}')`
    )
    .join(" union all ");
  const filas = (await (await con.runAndReadAll(`${sql} order by n`)).getRowObjects()) as PartitionRange[];
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
    from read_parquet('${partitionUrl(n)}')
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
          `select count(*)::BIGINT as n from (describe select * from read_parquet('${partitionUrl(n)}'))
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
    console.log(`  particiones sin average_badge (esquema viejo, sin partidas ranked): ${fuera.join(", ")}`);
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
const FROZEN_AFTER_H = 6;

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
  return con;
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
 * El tronco común de las dos ventanas: mismas particiones, mismos filtros.
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
    from read_parquet('${partitionUrl(n)}')
    where match_mode = '${PLAYED_MODE}'
      and game_mode = '${PLAYED_GAME_MODE}'
      and ${BADGE} > 0
      and start_time >= TIMESTAMP '${from}'
      and start_time <  TIMESTAMP '${to}'
  `
    )
    .join(" union all ");
}
