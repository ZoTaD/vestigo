import { gzipSync, gunzipSync } from "node:zlib";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { contentHashFor, R2_BUCKET, type PutObject } from "./r2Archive";
import { newestPatch, comparePatches } from "./patch";
import type { SummaryRows, SummaryPartition, CompUnitStatsRow, CompUnitItemStatsRow } from "./summarize-run";
type ConSet = SummaryRows & { set?: number };
import { summariesFromTables, totalBoardsFromRows, type SummaryTables, type BandSummary } from "./summaryStore";
import type { ItemFilter } from "./aggregate/summary";

/**
 * El resumen de TFT, en Cloudflare R2. **Es la única copia**: desde el corte, las
 * seis tablas de Postgres no existen y el build lee de acá (ver mainFromSummary en
 * build.ts).
 *
 * **Un objeto por (parche, banda)**, en `summary/patch=<parche>/pg-<banda>.json.gz`,
 * y cada corrida lo lee, le suma lo suyo y lo vuelve a subir — el
 * `on conflict do update` que hacía `summarize_batch`, hecho por el pipeline porque
 * un bucket no tiene upsert. Leer un parche es sumar todos los objetos bajo su
 * prefijo, así que ninguna función de agregación es nueva: sólo cambia de dónde
 * vienen las filas (`summariesFromTables`, de summaryStore.ts, es la misma).
 *
 * Por qué no un archivo por corrida, que sería más simple de escribir: son 306
 * filas por partida, así que un parche acumularía ~14 veces las que Postgres tenía
 * deduplicadas, y el build baja todo eso cada dos horas.
 *
 * **El bucket todavía tiene objetos del formato viejo** —`day=<fecha>/<hash>.json.gz`,
 * los deltas por corrida de la primera etapa— y se siguen leyendo: son aditivos,
 * así que sumarlos con los de ahora da lo mismo. Por eso `summaryPath` y
 * `summaryObjectKeyFor` siguen acá aunque ya nada escriba con ese formato.
 */

/** La ruta estilo Hive de una partición del resumen. */
export function summaryPath(patch: string, day: string, objectName: string): string {
  return `summary/patch=${patch}/day=${day}/${objectName}`;
}

/**
 * Nombre determinista del objeto: el mismo criterio que objectKeyFor en
 * r2Archive.ts (hash de los match_id ordenados) pero con `.json.gz`, porque acá
 * el contenido es un único objeto JSON (el delta agregado), no NDJSON de
 * partidas una por línea. Compartir contentHashFor en vez de copiarla asegura
 * que "de qué match_id sale el nombre" es una sola definición para los dos
 * archivos que este pipeline sube a R2.
 */
export function summaryObjectKeyFor(matchIds: string[]): string {
  return `${contentHashFor(matchIds)}.json.gz`;
}

/** Comprime un delta de resumen a JSON+gzip — un objeto entero, no NDJSON. */
export function toJsonGz(delta: SummaryRows): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(delta), "utf8"));
}

/** El inverso de toJsonGz — para el round trip, y para leer lo archivado. */
export function fromJsonGz(gz: Buffer | Uint8Array): ConSet {
  return JSON.parse(gunzipSync(gz).toString("utf8")) as SummaryRows;
}

/**
 * Sube cada partición de esta corrida como su propio objeto JSON.gz, y devuelve
 * cuántas se subieron bien y cuántas fallaron — NUNCA tira.
 *
 * A diferencia de archiveGroups (r2Archive.ts), acá no hay ningún borrado que
 * dependa de la confirmación: en esta etapa Postgres sigue siendo la fuente de
 * verdad (summarize_batch ya escribió los mismos contadores antes de que se
 * llegue acá), así que un fallo de R2 se loguea fuerte y no debe cortar la
 * corrida. Que cada grupo se intente de forma independiente (un fallo no aborta
 * los demás) es el mismo criterio que archiveGroups, por la misma razón.
 */
export async function archiveSummaryPartitions(
  partitions: SummaryPartition[],
  put: PutObject
): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0;
  let failed = 0;
  for (const partition of partitions) {
    const key = summaryPath(partition.key.patch, partition.key.day, summaryObjectKeyFor(partition.matchIds));
    const body = toJsonGz(partition.rows);
    try {
      await put(key, body);
      uploaded += 1;
    } catch (e) {
      failed += 1;
      console.error(
        `R2: no se pudo subir el resumen ${key} (${partition.matchIds.length} partidas): ` +
          `${(e as Error).message} — Postgres ya tiene estos contadores; sigue sin ellos en R2 ` +
          "hasta que una corrida futura reintente esta misma partición"
      );
    }
  }
  return { uploaded, failed };
}

/** `put` real: sube un objeto JSON.gz al bucket de Vestigo. */
export function putSummaryToR2(client: S3Client): PutObject {
  return async (key, body) => {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: "application/json",
        ContentEncoding: "gzip",
      })
    );
  };
}

/** Atajo para el caso real: arma el `put` contra R2 y sube todas las particiones. */
export async function archiveSummaryToR2(
  partitions: SummaryPartition[],
  client: S3Client
): Promise<{ uploaded: number; failed: number }> {
  return archiveSummaryPartitions(partitions, putSummaryToR2(client));
}

// ---------------------------------------------------------------------------
// El backfill: lo que Postgres YA tenía contado antes de que existiera nada de
// esto. Sin él, R2 arranca vacío el día que se prende la doble escritura y el
// build leería solo lo que entró después.
// ---------------------------------------------------------------------------

/**
 * La clave del snapshot de una banda. Un objeto por (parche, banda), no por día
 * como los deltas de cada corrida, y la razón es del esquema, no de gusto:
 * **cuatro de las seis tablas de Postgres no tienen columna `day`**
 * (`comp_unit_stats`, `comp_unit_item_stats`, `comp_trait_stats` y
 * `comp_item_stats` llevan la clave (banda, parche, firma, …) y nada más), así
 * que sus filas ya vienen fusionadas sobre todos los días y **no hay forma de
 * repartirlas por día al exportarlas**. Inventar un día sería mentir; meterlas
 * todas en un día real le sumaría a ese día lo que pasó en otros.
 *
 * Cortar por banda y no subir el parche entero en un solo objeto es lo que
 * acota la memoria: cada banda son ~200.000 filas en vez del millón del parche,
 * y el lector ya filtra por banda igual.
 *
 * La clave es fija a propósito (no lleva hash de contenido como los deltas):
 * correr el backfill de nuevo tiene que PISAR el snapshot anterior, nunca
 * agregar un segundo objeto que sumaría los mismos contadores dos veces.
 */
export function snapshotPath(patch: string, band: string): string {
  return `summary/patch=${patch}/pg-${band}.json.gz`;
}

/**
 * Un objeto de resumen en R2: las seis tablas más **qué partidas ya contabilizó**.
 *
 * `absorbed` es lo que reemplaza a la transacción que Postgres daba gratis.
 * Escribir en R2 y marcar `summarized_at` en Postgres no pueden ser atómicos
 * entre sí, así que una corrida que muere en el medio deja partidas contadas
 * pero sin marcar, y la corrida siguiente las vuelve a procesar. Con la lista
 * adentro del objeto, esa segunda vuelta se reconoce y no suma de nuevo. Es el
 * mismo agujero que 0008_summarize_batch.sql cerró con una transacción, cerrado
 * de la única forma que se puede cerrar contra un bucket.
 */
export interface SummaryObject extends SummaryRows {
  absorbed: string[];
  /**
   * De qué set son estos contadores. Desde que la tier list se corta por SET y
   * no por parche (ver fetchSetRowsFromR2), es lo único que separa un meta de
   * otro: sin esto, el día que salga el Set 18 sus partidas se sumarían a las
   * del 17 y la tier list mezclaría dos juegos.
   */
  set?: number;
}

/** Qué pasó al intentar meter un lote de partidas en el objeto de una banda. */
/**
 * `partial` es el caso raro y el que más importa: parte del lote ya estaba
 * contada. No se suma nada, y las que ya estaban viajan en `known` para que se
 * las marque (ver el comentario largo en `absorbBand`).
 */
export type AbsorbOutcome = "merged" | "already" | "empty" | "partial";

/**
 * Mete las filas de una banda en su objeto, o reconoce que ya estaban.
 *
 * Los tres casos, y por qué el tercero tira en vez de arreglárselas:
 * - ninguna de las partidas está en `absorbed` → fusiona y las anota;
 * - **todas** están → esta corrida es un reintento de una que murió antes de
 *   marcar; no toca nada;
 * - **algunas sí y otras no** → imposible por construcción (subir un objeto a R2
 *   es atómico: o quedó con el lote entero o sin nada), así que si pasa hay algo
 *   que no entendemos y sumar sería corromper contadores para siempre en
 *   silencio. Falla ruidoso.
 */
export function absorbBand(
  existing: SummaryObject | null,
  delta: SummaryRows,
  band: string,
  matchIds: string[],
  set?: number
): { object: SummaryObject; outcome: AbsorbOutcome; known?: string[] } {
  const base: SummaryObject = existing ?? { ...emptyTables(), discardedMatches: 0, absorbed: [] };
  const incoming = tablesForBandRaw(delta, band);
  if (countTableRows(incoming) === 0) return { object: base, outcome: "empty" };

  const seen = new Set(base.absorbed);
  const conocidas = matchIds.filter((id) => seen.has(id));
  if (conocidas.length === matchIds.length && matchIds.length > 0) {
    return { object: base, outcome: "already" };
  }
  /**
   * Solapamiento PARCIAL: algunas del lote ya están contadas y otras no.
   *
   * Esto tiraba, con el argumento de que subir un objeto es atómico y por lo
   * tanto no debería poder pasar. **Pasa, y el 2026-07-29 dejó la publicación de
   * TFT caída seis corridas seguidas.** El agujero no está en la subida sino en
   * la marca: `markSummarized` actualiza D1 **en grupos** —D1 no acepta más de
   * 100 parámetros atados— así que son decenas de UPDATEs sueltos. Una corrida
   * que muere en el medio deja partidas escritas en R2 y sin marcar, y el lote
   * siguiente las mezcla con nuevas.
   *
   * Y no se cura solo: cada corrida rearma el mismo lote mezclado y vuelve a
   * tirar, para siempre.
   *
   * Sumar el lote sigue estando mal —inflaría los contadores de las que ya
   * estaban—, así que no se suma. Se devuelven las que ya estaban para que quien
   * llama las marque: están contadas, sólo les falta el papel. Con eso el lote
   * siguiente sale limpio y la corrida que viene avanza sola.
   */
  if (conocidas.length > 0) {
    return { object: base, outcome: "partial", known: conocidas };
  }

  const merged = mergeRows({
    ...base,
    compStats: [...base.compStats, ...incoming.compStats],
    compUnitStats: [...base.compUnitStats, ...incoming.compUnitStats],
    compUnitItemStats: [...base.compUnitItemStats, ...incoming.compUnitItemStats],
    compTraitStats: [...base.compTraitStats, ...incoming.compTraitStats],
    compItemStats: [...base.compItemStats, ...incoming.compItemStats],
    bandStats: [...base.bandStats, ...incoming.bandStats],
  });
  return {
    object: { ...merged, absorbed: [...base.absorbed, ...matchIds], set: set ?? base.set },
    outcome: "merged",
  };
}

/** Como tablesForBand pero sin fusionar: la fusión la hace absorbBand sobre el total. */
function tablesForBandRaw(rows: SummaryRows, band: string): SummaryTables {
  return {
    compStats: rows.compStats.filter((r) => r.band === band),
    compUnitStats: rows.compUnitStats.filter((r) => r.band === band),
    compUnitItemStats: rows.compUnitItemStats.filter((r) => r.band === band),
    compTraitStats: rows.compTraitStats.filter((r) => r.band === band),
    compItemStats: rows.compItemStats.filter((r) => r.band === band),
    bandStats: rows.bandStats.filter((r) => r.band === band),
  };
}

function countTableRows(t: SummaryTables): number {
  return (
    t.compStats.length +
    t.compUnitStats.length +
    t.compUnitItemStats.length +
    t.compTraitStats.length +
    t.compItemStats.length +
    t.bandStats.length
  );
}

/**
 * Lee el objeto de una banda, le mete el lote y lo vuelve a subir — para las
 * cinco bandas. Un objeto por (parche, banda) y nada más: el parche entero se
 * mantiene en cinco archivos, no en uno por corrida.
 */
export async function absorbIntoPatchObjects(
  listKeys: ListObjectKeys,
  getObject: GetObjectBody,
  put: PutObject,
  patch: string,
  bands: string[],
  delta: SummaryRows,
  matchIds: string[],
  set?: number
): Promise<{
  merged: number;
  already: number;
  empty: number;
  partial: number;
  /** Las que ya estaban contadas en R2 y sólo les falta la marca en la base. */
  alreadyCounted: string[];
}> {
  const present = new Set(await listKeys(patchPrefix(patch)));
  const counts = { merged: 0, already: 0, empty: 0, partial: 0 };

  /**
   * **Dos pasadas, y la separación es el punto.** Antes se leía y escribía banda
   * por banda en el mismo bucle, así que un problema en la cuarta dejaba las tres
   * primeras ya escritas — un lote contado a medias, que es exactamente el estado
   * que después no se puede deshacer.
   *
   * Ahora la primera pasada sólo decide y la segunda sólo escribe: si alguna
   * banda dice `partial`, no se escribe **ninguna**. Un lote se cuenta entero o
   * no se cuenta.
   */
  const planned: { key: string; object: SummaryObject }[] = [];
  const alreadyCounted = new Set<string>();

  for (const band of bands) {
    const key = snapshotPath(patch, band);
    const existing = present.has(key) ? (fromJsonGz(await getObject(key)) as SummaryObject) : null;
    if (existing && !Array.isArray(existing.absorbed)) existing.absorbed = [];

    const { object, outcome, known } = absorbBand(existing, delta, band, matchIds, set);
    counts[outcome] += 1;
    if (outcome === "partial") for (const id of known ?? []) alreadyCounted.add(id);
    if (outcome === "merged") planned.push({ key, object });
  }

  if (alreadyCounted.size > 0) {
    console.warn(
      `${patch}: ${alreadyCounted.size} de ${matchIds.length} partidas del lote ya estaban ` +
        "contadas en R2 pero sin marcar en la base. No se suma nada (inflaría los contadores); " +
        "se marcan esas y la corrida siguiente procesa el resto con un lote limpio."
    );
    return { ...counts, alreadyCounted: [...alreadyCounted] };
  }

  for (const { key, object } of planned) await put(key, toJsonGz(object));
  return { ...counts, alreadyCounted: [] };
}

// ---------------------------------------------------------------------------
// La lectura: sumar todas las particiones de un parche reconstruye lo mismo
// que summaryStore.ts arma leyendo Postgres. Inyectable (ListObjectKeys,
// GetObjectBody), mismo patrón que FetchRows en pgStore.ts, para poder probar
// sin red.
// ---------------------------------------------------------------------------

/** Lista TODAS las claves bajo un prefijo — inyectable para no tocar la red en los tests. */
export type ListObjectKeys = (prefix: string) => Promise<string[]>;

/** Baja el cuerpo (ya gzipeado) de un objeto — inyectable, mismo motivo. */
export type GetObjectBody = (key: string) => Promise<Buffer>;

/** El prefijo de un parche entero: todas sus particiones de día, de todas las corridas. */
export function patchPrefix(patch: string): string {
  return `summary/patch=${patch}/`;
}

/** El listador real, paginando con ContinuationToken — S3 (y R2) no devuelven más de 1000 claves por página. */
export function listKeysFromR2(client: S3Client): ListObjectKeys {
  return async (prefix) => {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token })
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  };
}

/**
 * Borra objetos por clave — lo único que necesita `--reset-summary`, que ahora
 * tira el resumen de un parche de R2 en vez de borrar filas de seis tablas.
 *
 * De a 1000 por request, que es el tope de `DeleteObjects` en S3 y en R2.
 */
export function deleteKeysFromR2(client: S3Client): (keys: string[]) => Promise<void> {
  return async (keys) => {
    for (let i = 0; i < keys.length; i += 1000) {
      const slice = keys.slice(i, i + 1000);
      if (slice.length === 0) continue;
      await client.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: { Objects: slice.map((Key) => ({ Key })) },
        })
      );
    }
  };
}

/** El lector real de un objeto. */
export function getObjectFromR2(client: S3Client): GetObjectBody {
  return async (key) => {
    const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  };
}

/**
 * `summariesFromTables` (summaryStore.ts) asume A LO SUMO una fila por clave en
 * `comp_unit_stats` y `comp_unit_item_stats` — cierto en Postgres, donde el
 * upsert de `summarize_batch` ya sumó ahí antes de que la fila llegue a
 * leerse (ver el comentario de `summariesFromTables`: "ya fusionada sobre los
 * días, una fila por (firma, unidad)"). Por eso esas dos tablas se LEEN con
 * `=` (asignación), no con `+=`: no hace falta sumar lo que Postgres ya sumó.
 *
 * Leyendo de R2 esa garantía NO existe: cada archivo es el delta crudo de UNA
 * corrida (ver el comentario grande arriba de este módulo), así que la MISMA
 * clave (banda, parche, firma, unidad[, ítem]) aparece en tantas filas como
 * corridas hayan tocado esa firma — el caso normal, no uno raro, en cuanto una
 * comp sigue jugándose más de una corrida. Sin fusionar ACÁ, antes de pasarle
 * las filas a `summariesFromTables`, esa función se quedaría con la ÚLTIMA
 * fila procesada para cada clave y subcontaría todo lo anterior.
 *
 * `comp_stats`, `comp_trait_stats`, `comp_item_stats` y `band_stats` no
 * necesitan esto: `summariesFromTables` (y `totalBoardsFromRows`) ya sólo
 * hacen acumulación real (`+=`, o `(prev ?? 0) + row.x`) en esas cuatro, así
 * que sobreviven filas repetidas de la misma clave sin ayuda — verificado
 * leyendo esa función línea por línea, no asumido.
 */
function mergeUnitStats(rows: CompUnitStatsRow[]): CompUnitStatsRow[] {
  const byKey = new Map<string, CompUnitStatsRow>();
  for (const row of rows) {
    // SIN el parche en la clave, y esto no es un detalle: desde que el corte es
    // por set (2026-07-29) esta función recibe las filas de varios parches, y
    // `summariesFromTables` lee esta tabla **asignando** (`s.units[id] = …`), no
    // sumando. Con el parche adentro de la clave, la misma unidad de la misma
    // comp queda en dos filas y la segunda pisa a la primera: la unidad conserva
    // los tableros de UN parche mientras la comp tiene los de todos, su
    // frecuencia cae por debajo del 50% que la hace "core", y `selectRoster`
    // dibuja comps de dos campeones. Pasó en producción.
    const key = `${row.band}|${row.signature}|${row.unit_id}`;
    const prev = byKey.get(key);
    byKey.set(
      key,
      prev
        ? {
            ...prev,
            boards: prev.boards + row.boards,
            sum_stars: prev.sum_stars + row.sum_stars,
            three_star: prev.three_star + row.three_star,
            sum_items: prev.sum_items + row.sum_items,
            itemized: prev.itemized + row.itemized,
            winner_boards: prev.winner_boards + row.winner_boards,
            loser_boards: prev.loser_boards + row.loser_boards,
            sum_placement: prev.sum_placement + row.sum_placement,
          }
        : row
    );
  }
  return [...byKey.values()];
}

/** Mismo motivo que mergeUnitStats, para comp_unit_item_stats. */
function mergeUnitItemStats(rows: CompUnitItemStatsRow[]): CompUnitItemStatsRow[] {
  const byKey = new Map<string, CompUnitItemStatsRow>();
  for (const row of rows) {
    // Sin el parche, mismo motivo que en mergeUnitStats: `summariesFromTables`
    // resuelve `sumItems` e `itemInstances` a partir de estas filas, y dos filas
    // de la misma (firma, unidad, ítem) en parches distintos daban la mitad de
    // los ítems — que es lo que decide quién es el carry de la comp.
    const key = `${row.band}|${row.signature}|${row.unit_id}|${row.item_id}`;
    const prev = byKey.get(key);
    byKey.set(
      key,
      prev
        ? {
            ...prev,
            boards: prev.boards + row.boards,
            winner_boards: prev.winner_boards + row.winner_boards,
            instances: prev.instances + row.instances,
          }
        : row
    );
  }
  return [...byKey.values()];
}

/**
 * Baja y suma TODAS las particiones de un parche (todas las corridas, todos los
 * días), filtrando por banda — el espejo de fetchSummaryTables en
 * summaryStore.ts, leyendo R2 en vez de Postgres.
 *
 * Cada archivo bajo `summary/patch=<parche>/` es un delta aditivo con filas de
 * TODAS las bandas adentro (la partición de R2 es por parche y día, no por
 * banda — ver el comentario grande arriba de este archivo); filtrar por banda
 * acá es lo que en Postgres hace `band=eq.<banda>` en cada query de
 * summaryStore.ts.
 */
export async function fetchSummaryTablesFromR2(
  listKeys: ListObjectKeys,
  getObject: GetObjectBody,
  band: string,
  patch: string
): Promise<SummaryTables> {
  return tablesForBand(await fetchPatchRowsFromR2(listKeys, getObject, patch), band);
}

/**
 * Baja TODAS las particiones de un parche UNA sola vez, sin filtrar: las filas
 * de las cinco bandas juntas, tal como están en los objetos.
 *
 * Existe separada de `tablesForBand` por el build: publicar es construir las
 * cinco bandas del mismo parche, y hacerlo con `fetchSummaryTablesFromR2` por
 * banda bajaría y descomprimiría los mismos ~1,2 millones de filas cinco veces.
 * Leyendo Postgres eso no se notaba (cada query ya venía filtrada por
 * `band=eq.`, y el trabajo lo hacía el servidor); leyendo objetos, el filtro es
 * nuestro y el costo también.
 */
export async function fetchPatchRowsFromR2(
  listKeys: ListObjectKeys,
  getObject: GetObjectBody,
  patch: string
): Promise<SummaryRows> {
  return fetchRowsUnderPrefix(listKeys, getObject, patchPrefix(patch));
}

/**
 * Lo mismo pero sumando **todos los parches**, que es como se publica desde el
 * 2026-07-29: el corte deja de ser el parche y pasa a ser el SET.
 *
 * Por qué cambió, y qué se paga: entre 16.13 y 16.14 se midió que 14 de 30 comps
 * compartidas cambian de letra, así que juntar parches mezcla dos metas que de
 * verdad son distintos. Lo que lo justifica igual es lo que pasaba en cada
 * transición: el parche nuevo arranca en cero y la tier list quedaba **vacía en
 * las cinco bandas** hasta juntar muestra — un día entero de sitio inútil, cada
 * dos semanas. Decisión de ZoTaD: sólo separar por set.
 *
 * El corte por set no se pierde: cada objeto lleva `set` adentro desde este
 * cambio y acá se filtra por él. Los objetos escritos antes no lo tienen, y se
 * cuentan igual porque no hay ninguno de otro set — el resumidor siempre escribió
 * filtrando por `TFT_SET`.
 */
export async function fetchSetRowsFromR2(
  listKeys: ListObjectKeys,
  getObject: GetObjectBody,
  set: number
): Promise<SummaryRows> {
  return fetchRowsUnderPrefix(listKeys, getObject, "summary/patch=", set);
}

/**
 * Los objetos de resumen escritos antes de que existiera el campo `set`
 * pertenecen al Set 17: el campo se agregó el 2026-07-29 y hasta ese día era el
 * único set que este proyecto había visto.
 *
 * Existe como constante y no como comentario porque de esto depende un borrado.
 * `fetchSetRowsFromR2` puede permitirse tratar un objeto sin `set` como "de
 * cualquier set" —a lo sumo suma de más en una lectura—, pero decidir que un
 * parche es del Set 17 y borrarlo no se deshace.
 */
const SET_BEFORE_THE_FIELD_EXISTED = 17;

/**
 * Qué parches compusieron un set, según lo que hay en R2.
 *
 * Es la única fuente posible para esto. D1 no sirve: la ventana de crudas guarda
 * las 14.000 partidas más nuevas, así que de un set de cuatro meses conoce el
 * último día y nada más. R2, en cambio, tiene un objeto por (parche, banda)
 * desde el primer día del set.
 *
 * Lee **un objeto por parche**, no todos: el parche está en la clave y lo único
 * que hay que ir a buscar adentro es de qué set es. Un set son unos ocho
 * parches, así que son ocho descargas chicas en vez de las cuarenta que serían
 * todas las bandas.
 */
export async function patchesForSetFromR2(
  listKeys: ListObjectKeys,
  getObject: GetObjectBody,
  set: number
): Promise<string[]> {
  const keys = await listKeys("summary/patch=");
  const porParche = new Map<string, string>();
  for (const key of keys) {
    if (!key.endsWith(".json.gz")) continue;
    const patch = /^summary\/patch=([^/]+)\//.exec(key)?.[1];
    if (patch && !porParche.has(patch)) porParche.set(patch, key);
  }

  const parches: string[] = [];
  for (const [patch, key] of porParche) {
    const delta = fromJsonGz(await getObject(key)) as { set?: number };
    const suyo = delta.set ?? SET_BEFORE_THE_FIELD_EXISTED;
    if (suyo === set) parches.push(patch);
  }
  return parches.sort(comparePatches);
}

async function fetchRowsUnderPrefix(
  listKeys: ListObjectKeys,
  getObject: GetObjectBody,
  prefix: string,
  set?: number
): Promise<SummaryRows> {
  const keys = await listKeys(prefix);
  const all: SummaryRows = { ...emptyTables(), discardedMatches: 0 };
  for (const key of keys) {
    if (!key.endsWith(".json.gz")) continue; // ignora cualquier objeto que no sea un delta de resumen
    const delta = fromJsonGz(await getObject(key));
    // Un objeto sin `set` es anterior a que se guardara, y no puede ser de otro
    // set: el resumidor siempre escribió filtrando por TFT_SET.
    if (set !== undefined && delta.set !== undefined && delta.set !== set) continue;
    appendAll(all.compStats, delta.compStats);
    appendAll(all.compUnitStats, delta.compUnitStats);
    appendAll(all.compUnitItemStats, delta.compUnitItemStats);
    appendAll(all.compTraitStats, delta.compTraitStats);
    appendAll(all.compItemStats, delta.compItemStats);
    appendAll(all.bandStats, delta.bandStats);
  }
  return all;
}

// ---------------------------------------------------------------------------
// La fusión: mantener UN objeto por (parche, banda) en vez de uno por corrida.
//
// Sin esto, cada corrida deja su delta y el parche acumula ~14 veces las filas
// que Postgres tenía deduplicadas — medido: 306 filas por partida contra las
// 1,06 millones que las seis tablas guardaban para 48.000 partidas. El build
// tendría que bajar y parsear todo eso cada dos horas. Fusionar al escribir es
// lo que hacía el `on conflict do update` de summarize_batch; acá lo hace el
// pipeline, porque un bucket de objetos no tiene upsert.
// ---------------------------------------------------------------------------

/**
 * La clave primaria de cada tabla, la misma que declara su `create table` (ver
 * 0006_comp_summary.sql). Todo campo que NO esté acá es un acumulador y se suma.
 *
 * `num_units` es numérico y aun así es clave, no acumulador: "cuántas unidades
 * activaban el trait" identifica la fila, sumarlo daría un nivel de trait que
 * nadie jugó. Es exactamente el campo que una regla del tipo "los números se
 * suman" arruinaría en silencio, y por eso las claves se escriben a mano.
 */
const ROW_KEYS = {
  compStats: ["band", "patch", "day", "signature"],
  compUnitStats: ["band", "patch", "signature", "unit_id"],
  compUnitItemStats: ["band", "patch", "signature", "unit_id", "item_id"],
  compTraitStats: ["band", "patch", "signature", "trait_id", "num_units"],
  compItemStats: ["band", "patch", "signature", "item_id"],
  bandStats: ["band", "patch", "day"],
} as const;

/**
 * Fusiona filas de una tabla por su clave, sumando todo lo demás. El resultado
 * es fila por fila lo mismo que tenía Postgres después del upsert — que es la
 * propiedad que prueba el test contra `rowsFor` de la unión de los lobbies.
 */
function mergeTable<T extends object>(rows: T[], keyFields: readonly string[]): T[] {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const fields = row as Record<string, unknown>;
    const key = keyFields.map((f) => String(fields[f])).join(" ");
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...fields });
      continue;
    }
    for (const [field, value] of Object.entries(fields)) {
      if (keyFields.includes(field)) continue;
      if (typeof value === "number") prev[field] = (prev[field] as number) + value;
    }
  }
  return [...byKey.values()] as T[];
}

/** Las seis tablas de un objeto, fusionadas cada una por su clave. */
export function mergeRows(rows: SummaryRows): SummaryRows {
  return {
    compStats: mergeTable(rows.compStats, ROW_KEYS.compStats),
    compUnitStats: mergeTable(rows.compUnitStats, ROW_KEYS.compUnitStats),
    compUnitItemStats: mergeTable(rows.compUnitItemStats, ROW_KEYS.compUnitItemStats),
    compTraitStats: mergeTable(rows.compTraitStats, ROW_KEYS.compTraitStats),
    compItemStats: mergeTable(rows.compItemStats, ROW_KEYS.compItemStats),
    bandStats: mergeTable(rows.bandStats, ROW_KEYS.bandStats),
    discardedMatches: 0,
  };
}

/**
 * `into.push(...from)` con un `for`, y no es estilo: **el spread pasa cada
 * elemento como un argumento**, así que un objeto de esta escala lo revienta.
 * El snapshot de `global` del parche vigente son 339.090 filas y el límite real
 * de argumentos de V8 está en el orden de las 100.000: `Maximum call stack size
 * exceeded`, no un error de memoria, y sólo aparece con datos de producción —
 * los tests con dos lobbies pasaban perfecto.
 */
function appendAll<T>(into: T[], from: T[]): void {
  for (const row of from) into.push(row);
}

function emptyTables(): SummaryTables {
  return {
    compStats: [],
    compUnitStats: [],
    compUnitItemStats: [],
    compTraitStats: [],
    compItemStats: [],
    bandStats: [],
  };
}

/**
 * Se queda con las filas de una banda — lo que en Postgres hace `band=eq.<banda>`
 * en cada query de summaryStore.ts — y fusiona las dos tablas que lo necesitan.
 *
 * Ver el comentario grande de mergeUnitStats para por qué esa fusión no es
 * opcional: cada objeto es el delta de una corrida (o el snapshot del backfill),
 * así que la misma (firma, unidad[, ítem]) aparece en tantos objetos como
 * corridas la hayan tocado.
 */
export function tablesForBand(rows: SummaryRows, band: string): SummaryTables {
  const of = band;
  return {
    compStats: rows.compStats.filter((r) => r.band === of),
    compUnitStats: mergeUnitStats(rows.compUnitStats.filter((r) => r.band === of)),
    compUnitItemStats: mergeUnitItemStats(rows.compUnitItemStats.filter((r) => r.band === of)),
    compTraitStats: rows.compTraitStats.filter((r) => r.band === of),
    compItemStats: rows.compItemStats.filter((r) => r.band === of),
    bandStats: rows.bandStats.filter((r) => r.band === of),
  };
}

/**
 * Todo lo que build.ts necesitaría de una banda y un parche, leyendo R2 — la
 * MISMA firma que loadBandSummary en summaryStore.ts (BandSummary), a
 * propósito: quien consuma esto no se tiene que enterar de dónde salieron los
 * números. Esta etapa no cablea esto en build.ts todavía — eso es el corte,
 * tarea aparte — pero la función ya existe con la forma correcta para cuando
 * llegue.
 */
export async function loadBandSummaryFromR2(
  listKeys: ListObjectKeys,
  getObject: GetObjectBody,
  band: string,
  patch: string,
  keepItem: ItemFilter = () => true
): Promise<BandSummary> {
  const tables = await fetchSummaryTablesFromR2(listKeys, getObject, band, patch);
  return {
    summaries: summariesFromTables(tables, keepItem),
    totalBoards: totalBoardsFromRows(tables.bandStats),
  };
}

/**
 * Las cinco bandas de un parche bajando los objetos UNA sola vez — lo que el
 * build necesita, y la única forma de que leer de R2 no cueste cinco veces lo
 * que costaba leer de Postgres (ver `fetchPatchRowsFromR2`).
 */
export async function loadBandSummariesFromR2(
  listKeys: ListObjectKeys,
  getObject: GetObjectBody,
  bands: string[],
  patch: string,
  keepItem: ItemFilter = () => true
): Promise<Map<string, BandSummary>> {
  const rows = await fetchPatchRowsFromR2(listKeys, getObject, patch);
  const out = new Map<string, BandSummary>();
  for (const band of bands) {
    const tables = tablesForBand(rows, band);
    out.set(band, {
      summaries: summariesFromTables(tables, keepItem),
      totalBoards: totalBoardsFromRows(tables.bandStats),
    });
  }
  return out;
}

/**
 * Las cinco bandas del SET entero con una sola bajada — lo que publica el build
 * desde que el corte es por set y no por parche (ver fetchSetRowsFromR2).
 */
export async function loadBandSummariesForSet(
  listKeys: ListObjectKeys,
  getObject: GetObjectBody,
  bands: string[],
  set: number,
  keepItem: ItemFilter = () => true
): Promise<Map<string, BandSummary>> {
  const rows = await fetchSetRowsFromR2(listKeys, getObject, set);
  const out = new Map<string, BandSummary>();
  for (const band of bands) {
    const tables = tablesForBand(rows, band);
    out.set(band, {
      summaries: summariesFromTables(tables, keepItem),
      totalBoards: totalBoardsFromRows(tables.bandStats),
    });
  }
  return out;
}

/**
 * El parche más nuevo que tiene algo en R2, sacado de los nombres de las claves
 * — el espejo de `newestPatchFromSummary` (summaryStore.ts), que lo saca de
 * `band_stats`. Hace falta porque después del corte el build ya no puede
 * preguntarle eso a Postgres: las seis tablas no existen más.
 *
 * Lista sólo el prefijo `summary/` con un delimitador implícito por parseo: se
 * queda con lo que hay entre `patch=` y la barra siguiente. Elige por número
 * (`newestPatch`), no alfabéticamente — "16.9" es más nuevo que "16.14" para
 * `localeCompare` y no lo es.
 */
export async function newestPatchFromR2(listKeys: ListObjectKeys): Promise<string> {
  const keys = await listKeys("summary/patch=");
  const patches = new Set<string>();
  for (const key of keys) {
    const match = /^summary\/patch=([^/]+)\//.exec(key);
    if (match) patches.add(match[1]);
  }
  return newestPatch([...patches]);
}
