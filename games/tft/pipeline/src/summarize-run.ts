import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { lobbiesFromRows, newestPatchesFromPg, type PgRow } from "./pgStore";
import {
  d1Config,
  d1Fetcher,
  d1Runner,
  enGrupos,
  marcadores,
  type FetchRows,
  type RunSql,
  type SqlQuery,
} from "./d1";
import { isComparable, type LobbyRecord } from "./store";
import { summarize, mergeSummaries, type SignatureSummary, type ItemFilter } from "./aggregate/summary";
import { BANDS, bandCovers } from "./bands";
import { patchOf } from "./patch";
import { currentSet, setFromEnv } from "./sets";
// Reused, not copied (Arreglo 3): build.ts is the one place that already loads
// the catalog and builds the item filter. Importing it here is safe even
// though summaryStore.ts imports types FROM this file — that edge is
// `import type`, erased at compile time, so there is no real runtime cycle.
import { loadCatalog, knownItemFilter, type Catalog } from "./build";
import { archiveToR2, r2Client, r2Config, type ArchivableMatch, type PutObject } from "./r2Archive";
import {
  absorbIntoPatchObjects,
  deleteKeysFromR2,
  patchPrefix,
  getObjectFromR2,
  listKeysFromR2,
  putSummaryToR2,
  snapshotPath,
} from "./r2Summary";

/**
 * Convierte partidas ya guardadas en Postgres en los contadores que alimentan la
 * tier list, sin necesitar los tableros crudos después de esta corrida.
 *
 * Corre por lotes, así que puede pedirse un pedazo chico (SUMMARIZE_LIMIT) para
 * probar contra la base real sin tocar las 13.491 partidas pendientes de una
 * sola vez — eso es el backfill, y es la tarea siguiente.
 */

/**
 * Qué set cuenta el resumidor.
 *
 * `currentSet` y NO `publishedSet`, que es lo contrario de lo que hace build.ts,
 * y la diferencia es el motivo de que existan los dos relojes. El resumidor
 * procesa lo que ACABA de entrar: desde el minuto en que abre un set nuevo, todo
 * lo que llega es de ese set, y contarlo contra el set que el sitio todavía
 * publica descartaría el 100% de cada lote marcando las partidas como vistas.
 * Cuando llegue el día de congelar el set viejo, sus contadores ya no crecen
 * —el juego no lo juega más— y los del nuevo ya están armados.
 *
 * `TFT_SET` sigue funcionando como override para rehacer un set puntual.
 */
const SET = setFromEnv(process.env.TFT_SET) ?? currentSet();

/**
 * Cuántas partidas pendientes procesa una corrida.
 *
 * Chico a propósito. Hoy hay miles de partidas sin resumir, y tirarlas todas de
 * una es el backfill — trabajo aparte. Este número alcanza para no quedar atrás
 * del ritmo diario de partidas nuevas sin gastar los 30 minutos del job de
 * publicación resumiendo el historial entero antes de construir nada.
 */
const LIMIT = Number(process.env.SUMMARIZE_LIMIT ?? "2000");

/**
 * Sin esto, un `TFT_SET` mal tipeado (o vacío) hace que `Number(...)` dé `NaN`.
 * `isComparable` compara `lobby.set === set`, y nada es `=== NaN`, así que
 * `rowsFor` descarta el 100% de cada lote sin escribir una sola fila — y antes
 * de este fix las partidas se marcaban igual, así que nunca se volvían a pedir.
 * El log dice "listo, 2000 partidas resumidas" con cero contadores nuevos, y
 * nada lo distingue de una corrida sana hasta que alguien mira los números.
 *
 * El mismo camino se dispara SIN ningún typo cuando el set cambia: si `TFT_SET`
 * pasa a 18 antes de drenar el backlog del 17, esas partidas pendientes también
 * quedarían marcadas sin haber aportado nada. Fallar de entrada convierte ambos
 * casos en un error visible en vez de un descarte silencioso.
 */
export function assertValidSet(set: number, raw: string | undefined): void {
  if (!Number.isInteger(set)) {
    throw new Error(
      `TFT_SET inválido: "${raw}" no da un entero (Number(...) = ${set}). ` +
        "Con un set roto, isComparable() descarta el 100% de cada lote y las " +
        "partidas se marcarían igual, sin haber sumado nada."
    );
  }
}

/**
 * Mismo problema que TFT_SET, con otra consecuencia: un `SUMMARIZE_LIMIT` mal
 * tipeado da `NaN`, `processed < LIMIT` es `0 < NaN` — siempre `false` — y el
 * bucle principal no llega a correr ni una vuelta. El script imprime "nada
 * pendiente de resumir" y termina con éxito (código 0) sin haber mirado la
 * base.
 */
export function assertValidLimit(limit: number, raw: string | undefined): void {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(
      `SUMMARIZE_LIMIT inválido: "${raw}" no da un entero >= 0 (Number(...) = ${limit}). ` +
        'Con NaN, el bucle nunca corre y el script sale diciendo "nada pendiente de resumir".'
    );
  }
}

/**
 * Arreglo 3: sin catálogo, build.ts sigue construyendo con un filtro inerte
 * ("todo pasa") y sólo avisa por qué. Acá eso no alcanza: un contador que
 * `summarize_batch` ya sumó no se puede des-sumar (son sumas, no snapshots),
 * así que resumir aunque sea una corrida con el filtro equivocado deja ese
 * error horneado para siempre en las seis tablas, en las cinco bandas. Mejor
 * no resumir nada esta corrida que resumir con un filtro que build.ts no usa.
 */
export function assertCatalogPresent(catalog: Catalog | null): asserts catalog is Catalog {
  if (!catalog) {
    throw new Error(
      "no se encontró el catálogo (games/tft/data/catalog.json) — summarize-run.ts " +
        "no puede resumir sin él. Sin catálogo, knownItemFilter() no tiene con qué " +
        "filtrar ítems, y escribir comp_unit_stats/comp_unit_item_stats con un " +
        "filtro distinto al de build.ts (o sin filtro) mueve itemizedRate, que es lo " +
        "que decide el carry de una comp (CARRY_ITEMIZED en aggregate/group.ts) — y " +
        "ese contador no se puede corregir después. Correr `npm run catalog` primero."
    );
  }
}

/**
 * Cuántas partidas entran en un lote — y por lo tanto en una sola llamada a
 * `summarize_batch` (ver esa función en 0008_summarize_batch.sql), que hace todo el
 * lote en una única transacción. El lote entero tiene que entrar en un solo cuerpo
 * de request, así que este número sale de medir cuántas filas produce un lote real
 * contra la base, no de estimarlo.
 *
 * El plan (`docs/plans/2026-07-26-resumen-incremental-plan.md`) estimaba "unas
 * 50-100 partidas dan ~5.000 filas" a partir de la densidad del PARCHE VIGENTE
 * (4.175 firmas / 7.253 partidas). Medido de verdad contra el backlog pendiente
 * real —que mezcla decenas de parches viejos, cada uno con pocas partidas y por lo
 * tanto casi sin repetición de firma— la densidad es 5-10 veces mayor: un lote de
 * apenas 20 partidas ya daba hasta 8.426 filas según en qué parte del backlog
 * caía (offsets 0/2000/5000/8000/11000/13000 sobre las ~13.500 partidas
 * pendientes). Con 8 partidas por lote, el peor caso medido en ese mismo barrido
 * fue 4.226 filas — cómodo dentro de un solo request — mientras que 10 partidas ya
 * llegaban a 5.213 en la zona más densa. Medido con
 * `node --env-file=.env node_modules/tsx/dist/cli.mjs` corriendo `rowsFor` sobre
 * páginas reales de `pendingMatchesQuery` en distintos offsets.
 */
const BATCH = 8;

/**
 * Cuántos parches, contando desde el más nuevo, siguen alimentando el resumen
 * (Cambio 1 de inc-task-7).
 *
 * Dos, no uno: con solo el vigente no se puede responder "qué cambió entre
 * parches" — que es exactamente el motivo por el que las claves llevan el día
 * adentro (ver docs/design/2026-07-26-tier-list-incremental-design.md). Un
 * parche viejo no aporta nada más: ninguna tier list publicada lee otra cosa
 * que el parche vigente (comps.json) o el par vigente/anterior para comparar,
 * y measured contra el parche vigente real, un parche viejo pesa 79 filas por
 * partida contra 57 del vigente — más densidad de firmas distintas, no más
 * partidas — y hoy sumaban la mitad del peso del resumen sin que nada los lea.
 */
const PATCHES_KEPT = 2;

/**
 * Una partida, con lo mismo que ya usa el resto del pipeline (LobbyRecord) más
 * el único campo que ninguno de esos consumidores necesita: cuándo se jugó.
 *
 * Se define acá y no se agrega a LobbyRecord en store.ts: ese tipo lo consumen
 * build.ts, calibrate.ts y sus tests, y ninguno necesita la fecha — agregarles
 * un campo que no usan es hacer que ese cambio les repique para nada.
 */
export interface LobbyWithDate extends LobbyRecord {
  /**
   * Epoch milliseconds del game_datetime de Riot. Nunca 0: `lobbiesWithDate`
   * descarta las partidas sin fecha antes de construir esto, así que si hay un
   * `LobbyWithDate` es porque tiene una fecha real.
   */
  gameDatetime: number;
}

/**
 * La fila de Postgres que hace falta para resumir: todo lo que ya trae PgRow más
 * game_datetime, que matchesQuery (la consulta que usa build.ts) no pide porque
 * el build nunca necesitó saber qué día se jugó cada partida.
 */
export interface PendingRow extends PgRow {
  game_datetime: number | null;
}

/**
 * Todo lo que `matches` no tiene resumido todavía, sin filtrar por cola ni por
 * set. Filtrar acá dejaría afuera para siempre las partidas de otra cola o de
 * un set viejo — nunca las pediría, así que tampoco las marcaría, y
 * `matches_pending_summary` jamás bajaría a cero aunque no falte nada por
 * contar de verdad. La que decide qué cuenta es `isComparable`, adentro de
 * `rowsFor`, partida por partida; esta consulta solo decide qué falta MIRAR.
 *
 * `afterMatchId` (Arreglo 2): sin esto, la única forma de avanzar de página era
 * que las filas de la anterior dejaran de matchear `summarized_at=is.null` — o
 * sea, que se hubieran marcado. Una partida sin `game_datetime` NUNCA se marca
 * (ver `lobbiesWithDate`), así que si llegan a juntarse `BATCH` de esas
 * consecutivas por `match_id`, cada página vuelve a traer exactamente las
 * mismas para siempre: el backlog real que sigue detrás queda bloqueado,
 * aunque `summarizeLoop` no se cuelgue (`processed` sigue sumando y la corrida
 * igual termina al llegar a `LIMIT`, sólo que sin haber tocado nada nuevo).
 *
 * Se eligió un cursor sobre `match_id` — el mismo campo del `order` — en vez de
 * la alternativa (marcar las partidas sin fecha con algo distinto de
 * `summarized_at`, para sacarlas de la cola sin contarlas): un cursor no
 * necesita una columna ni una migración nueva, y no le pide nada a la fila más
 * que lo que `order=match_id.asc` ya garantiza — que cada página siguiente
 * empieza estrictamente después de la última fila VISTA, se haya marcado o no.
 * No hace falta persistirlo entre corridas: cada corrida nueva vuelve a
 * arrancar desde el principio, así que si una partida sin fecha se completa
 * después (por ejemplo con un repair), la próxima corrida la va a volver a ver
 * y a marcar entonces.
 */
export function pendingMatchesQuery(limit: number, afterMatchId = ""): SqlQuery {
  const where = ["summarized_at is null"];
  const params: unknown[] = [];
  if (afterMatchId) {
    where.push("match_id > ?");
    params.push(afterMatchId);
  }
  return {
    sql:
      `select match_id, tier, payload, game_datetime from matches where ${where.join(" and ")} ` +
      "order by match_id limit ?",
    params: [...params, limit],
  };
}

/**
 * Junta lo que ya arma `lobbiesFromRows` con `game_datetime`, por posición: las
 * dos vienen de la misma lista de filas, en el mismo orden, así que no hace
 * falta un segundo mapa por match_id.
 *
 * Descarta las filas sin `game_datetime` en vez de inventarles la fecha 0
 * (1970-01-01): ese balde es imborrable en dos tablas con día en la clave
 * (`comp_stats`, `band_stats`), y los tres caminos de ingesta escriben
 * `game_datetime` como nullable, así que es alcanzable de verdad, no solo en
 * teoría. Quien llama tiene que notar la diferencia entre `rows.length` y el
 * largo de lo que devuelve esto para NO marcar esas partidas — game_datetime
 * puede completarse más adelante (por ejemplo con un repair, como
 * `--repair-tiers` en migrate-to-postgres.ts), y una partida marcada nunca se
 * vuelve a pedir.
 */
export function lobbiesWithDate(rows: PendingRow[]): LobbyWithDate[] {
  const dated = rows.filter((r) => r.game_datetime !== null);
  return lobbiesFromRows(dated).map((lobby, i) => ({
    ...lobby,
    gameDatetime: dated[i].game_datetime as number,
  }));
}

/**
 * El día calendario (UTC) en que se jugó la partida, a partir de los
 * milisegundos de `game_datetime` de Riot — nunca de la fecha de hoy. Una
 * partida que se resume tres días tarde cae en el balde de su propio día, que
 * es lo único que hace que "esta comp subió o bajó" compare el juego real y no
 * el cron.
 */
export function dayOf(gameDatetimeMs: number): string {
  return new Date(gameDatetimeMs).toISOString().slice(0, 10);
}

export interface CompStatsRow {
  band: string;
  patch: string;
  day: string;
  signature: string;
  boards: number;
  sum_placement: number;
  sum_placement_sq: number;
  top4: number;
  wins: number;
  sum_level: number;
  winner_boards: number;
  winner_sum_placement: number;
  winner_sum_level: number;
  winner_sum_gold: number;
  loser_boards: number;
  loser_sum_placement: number;
  loser_sum_level: number;
  loser_sum_gold: number;
}

export interface CompUnitStatsRow {
  band: string;
  patch: string;
  signature: string;
  unit_id: string;
  boards: number;
  sum_stars: number;
  three_star: number;
  sum_items: number;
  itemized: number;
  winner_boards: number;
  loser_boards: number;
  sum_placement: number;
}

export interface CompUnitItemStatsRow {
  band: string;
  patch: string;
  signature: string;
  unit_id: string;
  item_id: string;
  boards: number;
  winner_boards: number;
  instances: number;
}

export interface CompTraitStatsRow {
  band: string;
  patch: string;
  signature: string;
  trait_id: string;
  num_units: number;
  boards: number;
}

export interface CompItemStatsRow {
  band: string;
  patch: string;
  signature: string;
  item_id: string;
  instances: number;
}

export interface BandStatsRow {
  band: string;
  patch: string;
  day: string;
  boards: number;
  matches: number;
}

export interface SummaryRows {
  compStats: CompStatsRow[];
  compUnitStats: CompUnitStatsRow[];
  compUnitItemStats: CompUnitItemStatsRow[];
  compTraitStats: CompTraitStatsRow[];
  compItemStats: CompItemStatsRow[];
  bandStats: BandStatsRow[];
  /**
   * De las partidas recibidas, cuántas descartó `isComparable` (otra cola, otro
   * set, o menos de 2 tableros). Un `TFT_SET` roto (o un set que cambió antes de
   * drenar el backlog del anterior) hace que esto sea el 100% del lote sin que
   * ninguna de las seis tablas cambie: sin este número a la vista, ese descarte
   * total es indistinguible de "este lote no tenía nada nuevo" y las partidas se
   * marcaban igual sin haber aportado un solo contador.
   */
  discardedMatches: number;
}

function emptyRows(): SummaryRows {
  return {
    compStats: [],
    compUnitStats: [],
    compUnitItemStats: [],
    compTraitStats: [],
    compItemStats: [],
    bandStats: [],
    discardedMatches: 0,
  };
}

function compStatsRow(band: string, patch: string, day: string, s: SignatureSummary): CompStatsRow {
  return {
    band,
    patch,
    day,
    signature: s.signature,
    boards: s.boards,
    sum_placement: s.sumPlacement,
    sum_placement_sq: s.sumPlacementSq,
    top4: s.top4,
    wins: s.wins,
    sum_level: s.sumLevel,
    winner_boards: s.winner.boards,
    winner_sum_placement: s.winner.sumPlacement,
    winner_sum_level: s.winner.sumLevel,
    winner_sum_gold: s.winner.sumGoldLeft,
    loser_boards: s.loser.boards,
    loser_sum_placement: s.loser.sumPlacement,
    loser_sum_level: s.loser.sumLevel,
    loser_sum_gold: s.loser.sumGoldLeft,
  };
}

/**
 * Las filas de detalle (unidad, unidad-ítem, trait, prioridad de ítem) de una
 * firma ya fusionada — nunca llevan día, así que reciben un único resumen por
 * (banda, parche, firma), ya sumado sobre todos los días del lote.
 */
function pushDetailRows(band: string, patch: string, s: SignatureSummary, out: SummaryRows): void {
  for (const [unitId, u] of Object.entries(s.units)) {
    out.compUnitStats.push({
      band,
      patch,
      signature: s.signature,
      unit_id: unitId,
      boards: u.boards,
      sum_stars: u.sumStars,
      three_star: u.threeStar,
      sum_items: u.sumItems,
      itemized: u.itemized,
      winner_boards: u.winnerBoards,
      loser_boards: u.loserBoards,
      sum_placement: u.sumPlacement,
    });

    for (const [itemId, ic] of Object.entries(u.items)) {
      out.compUnitItemStats.push({
        band,
        patch,
        signature: s.signature,
        unit_id: unitId,
        item_id: itemId,
        boards: ic.boards,
        winner_boards: ic.winnerBoards,
        instances: ic.instances,
      });
    }
  }

  for (const [traitId, t] of Object.entries(s.traits)) {
    for (const [numUnitsKey, boards] of Object.entries(t.units)) {
      out.compTraitStats.push({
        band,
        patch,
        signature: s.signature,
        trait_id: traitId,
        num_units: Number(numUnitsKey),
        boards,
      });
    }
  }

  for (const [itemId, instances] of Object.entries(s.itemInstances)) {
    out.compItemStats.push({ band, patch, signature: s.signature, item_id: itemId, instances });
  }
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return groups;
}

/**
 * La parte pura: convierte lobbies en las filas listas para el upsert que suma.
 *
 * `keepItem` (Arreglo 3) tiene que ser EXACTAMENTE el mismo filtro que usa
 * build.ts (`knownItemFilter(loadCatalog())`) — no una copia, la misma
 * función importada de `./build`. Antes de este fix, acá se contaba sin
 * filtro: `sumItems`, `itemized` y las filas de unidad-ítem incluían ítems que
 * el catálogo no sabe nombrar (placeholders de Riot como `TFT_Item_EmptyBag`,
 * restos de sets viejos), y eso movía `itemizedRate` — el número que decide
 * quién es el carry de una comp (`CARRY_ITEMIZED = 0.8` en `aggregate/group.ts`)
 * — de forma distinta a como lo ve el build. `main()` exige el catálogo antes
 * de llamar acá (ver `assertCatalogPresent`): un contador que `summarize_batch`
 * ya sumó no se puede des-sumar, así que resumir aunque sea una vez con el
 * filtro equivocado lo hornea para siempre en las seis tablas.
 *
 * Consecuencia que esto acepta, a propósito: el catálogo puede crecer entre
 * parches (`catalog.ts` ya excluye a propósito ítems Radiant/Ornn/Shimmerscale
 * de sets viejos que un augment del set vigente sí puede otorgar — ver el
 * comentario de `summariesFromTables` en summaryStore.ts). Si esa lista
 * cambia, los contadores YA ESCRITOS quedan con el filtro con el que se
 * escribieron — no hay forma de reabrirlos y re-filtrar de otra manera, porque
 * son sumas, no snapshots — y sólo se pueden rehacer para las partidas que
 * todavía estén dentro de la ventana móvil (ver `--reset-summary`).
 *
 * `keepItem` tiene un default de "todo pasa" para que la función siga siendo
 * fácil de probar con datos que no involucran ningún catálogo real; `main()`
 * nunca usa ese default, siempre pasa el filtro real o falla antes de llegar
 * acá.
 *
 * `currentPatches` (Cambio 1 de inc-task-7): sólo los parches de esta lista
 * suman contadores. Medido contra el parche vigente: un parche viejo pesa 79
 * filas por partida contra 57 del vigente — mayor densidad de firmas
 * distintas, no más partidas — y sumaban la mitad del peso del resumen sin que
 * ninguna tier list los lea (comps.json sólo publica un parche a la vez, y
 * `--from=summary` sólo puede pedir uno). Una partida de un parche fuera de la
 * lista se trata IGUAL que una de otra cola o de otro set: no genera filas y
 * cuenta en `discardedMatches`, sin un tercer contador aparte. Que esa partida
 * de todas formas quede MARCADA (`summarized_at`) no es cosa de acá — sale
 * gratis de que `summarizeLoop` marca por `lobbies` (todo lo que tiene fecha),
 * nunca por lo que `rowsFor` produjo.
 *
 * Quién decide la lista y con qué criterio es responsabilidad de quien llama
 * (`main()`, con `newestPatchesFromPg` — ver pgStore.ts), nunca de acá: esta
 * función sólo filtra contra lo que le pasan, así que se puede probar con
 * cualquier lista sin hablarle a Postgres. El default (`undefined`) no filtra
 * ningún parche, para no romper el resto de los tests de este archivo, que no
 * ejercitan este filtro — `main()` nunca usa ese default, siempre calcula la
 * lista real primero.
 */
export function rowsFor(
  lobbies: LobbyWithDate[],
  set: number,
  keepItem: ItemFilter = () => true,
  currentPatches?: string[]
): SummaryRows {
  const usable = lobbies.filter((l) => isComparable(l, set));
  const relevant = currentPatches
    ? usable.filter((l) => currentPatches.includes(patchOf(l.gameVersion)))
    : usable;
  const out = emptyRows();
  out.discardedMatches = lobbies.length - relevant.length;

  for (const band of BANDS) {
    const covered = relevant.filter((l) => bandCovers(band.id, l.tier));
    if (covered.length === 0) continue;

    const byPatch = groupBy(covered, (l) => patchOf(l.gameVersion));
    for (const [patch, patchLobbies] of byPatch) {
      // Un resumen por firma y por día, para comp_stats y band_stats — las
      // únicas tablas que llevan el día en la clave (ver 0006_comp_summary.sql).
      // Y, aparte, uno por firma fusionado sobre TODOS los días del lote, para
      // las tablas de detalle: si emitieran una fila por día, la misma clave
      // (banda, parche, firma, unidad) llegaría dos veces en un solo upsert, y
      // Postgres rechaza un ON CONFLICT DO UPDATE que toque la misma fila dos
      // veces en la misma sentencia.
      const bySignatureAcrossDays = new Map<string, SignatureSummary[]>();

      const byDay = groupBy(patchLobbies, (l) => dayOf(l.gameDatetime));
      for (const [day, dayLobbies] of byDay) {
        const boards = dayLobbies.flatMap((l) => l.boards);
        const { bySignature, totalBoards } = summarize(boards, keepItem);

        // totalBoards, no la suma de bySignature: ese total incluye los
        // tableros sin firma (0,3-0,5% de los reales, medido — el brief
        // original asumía ~10%), que son parte del denominador de playRate
        // aunque no tengan fila propia en comp_stats.
        out.bandStats.push({ band: band.id, patch, day, boards: totalBoards, matches: dayLobbies.length });

        for (const [signature, s] of bySignature) {
          out.compStats.push(compStatsRow(band.id, patch, day, s));
          const list = bySignatureAcrossDays.get(signature) ?? [];
          list.push(s);
          bySignatureAcrossDays.set(signature, list);
        }
      }

      for (const [signature, list] of bySignatureAcrossDays) {
        const merged = list.length === 1 ? list[0] : mergeSummaries(list, signature);
        pushDetailRows(band.id, patch, merged, out);
      }
    }
  }

  return out;
}

/** Qué partición de R2 (parche + día) describe un `SummaryPartition`. */
export interface SummaryPartitionKey {
  patch: string;
  day: string;
}

/**
 * Un delta de resumen para UNA partición (parche, día) — lo que r2Summary.ts sube
 * como un solo archivo. `matchIds` son los que este delta contabiliza (de
 * cualquier banda: la partición no separa por banda, `rows` sí lleva `band` en
 * cada fila) — ordenados, listos para el hash determinista de contentHashFor.
 */
export interface SummaryPartition {
  key: SummaryPartitionKey;
  matchIds: string[];
  rows: SummaryRows;
}

/**
 * Los mismos contadores que `rowsFor`, particionados por (parche, día) en vez de
 * fusionados por parche — la forma que summarize-run.ts sube a R2 (ver
 * r2Summary.ts para el porqué del particionado: las partidas llegan tarde, y un
 * archivo por partición evita reescribir uno por día).
 *
 * Comparte `compStatsRow`, `pushDetailRows`, `groupBy`, `summarize`,
 * `isComparable` y `bandCovers` con `rowsFor` — la única diferencia real es
 * CUÁNDO se llama a `pushDetailRows`. `rowsFor` la llama una vez por (banda,
 * parche), sobre el `SignatureSummary` YA FUSIONADO de todos los días del lote,
 * porque Postgres no puede escribir dos filas con la misma clave (banda, parche,
 * firma, unidad) en un solo upsert (ver el comentario de `summarize_batch` en
 * 0008_summarize_batch.sql: "ON CONFLICT DO UPDATE... no puede tocar la misma fila
 * dos veces"). Acá no hay upsert — cada partición es su propio archivo — así que
 * NO hace falta fusionar entre días; de hecho, fusionar sería incorrecto, porque
 * cada día es justamente su propia partición.
 *
 * Que no se fusione acá no cambia el total: `pushDetailRows` sólo copia campos
 * ADITIVOS de un `SignatureSummary` a filas, así que
 * `pushDetailRows(día1) + pushDetailRows(día2)`, sumados después (que es
 * exactamente lo que hace `summariesFromTables` al leer), da lo mismo que
 * `pushDetailRows(fusión(día1, día2))` — la propiedad que hace que sumar TODAS
 * las particiones de un parche reproduzca `rowsFor` sobre esos mismos lobbies.
 */
export function partitionedRowsFor(
  lobbies: LobbyWithDate[],
  set: number,
  keepItem: ItemFilter = () => true,
  currentPatches?: string[]
): SummaryPartition[] {
  const usable = lobbies.filter((l) => isComparable(l, set));
  const relevant = currentPatches
    ? usable.filter((l) => currentPatches.includes(patchOf(l.gameVersion)))
    : usable;

  const partitions = new Map<string, { rows: SummaryRows; matchIds: Set<string> }>();
  const partitionFor = (patch: string, day: string) => {
    const key = `${patch}|${day}`;
    let p = partitions.get(key);
    if (!p) {
      p = { rows: emptyRows(), matchIds: new Set() };
      partitions.set(key, p);
    }
    return p;
  };

  for (const band of BANDS) {
    const covered = relevant.filter((l) => bandCovers(band.id, l.tier));
    if (covered.length === 0) continue;

    const byPatch = groupBy(covered, (l) => patchOf(l.gameVersion));
    for (const [patch, patchLobbies] of byPatch) {
      const byDay = groupBy(patchLobbies, (l) => dayOf(l.gameDatetime));
      for (const [day, dayLobbies] of byDay) {
        const boards = dayLobbies.flatMap((l) => l.boards);
        const { bySignature, totalBoards } = summarize(boards, keepItem);
        const partition = partitionFor(patch, day);

        partition.rows.bandStats.push({
          band: band.id,
          patch,
          day,
          boards: totalBoards,
          matches: dayLobbies.length,
        });
        for (const l of dayLobbies) partition.matchIds.add(l.matchId);

        for (const [signature, s] of bySignature) {
          partition.rows.compStats.push(compStatsRow(band.id, patch, day, s));
          pushDetailRows(band.id, patch, s, partition.rows);
        }
      }
    }
  }

  return [...partitions.entries()].map(([key, p]) => {
    const [patch, day] = key.split("|");
    return { key: { patch, day }, matchIds: [...p.matchIds].sort(), rows: p.rows };
  });
}

// ---------------------------------------------------------------------------
// Lo que sigue habla con D1. rowsFor arriba es lo que se prueba; esto es la
// orquestación alrededor.
// ---------------------------------------------------------------------------

/** Cliente de D1 — el token sale del entorno, ver d1Config. */
type Cfg = { fetchRows: FetchRows; run: RunSql };

function config(): Cfg {
  const cfg = d1Config();
  return { fetchRows: d1Fetcher(cfg), run: d1Runner(cfg) };
}

/**
 * Cuánto dura el lock sin refrescar. Una corrida viva lo renueva en cada vuelta
 * (ver refreshLock); si el proceso muere, vence solo y la corrida siguiente lo
 * toma — sin eso, un corte dejaría la ingesta trabada para siempre.
 */
const LOCK_TTL_MS = 15 * 60 * 1000;
const LOCK_NAME = "summarize";

/**
 * Toma el lock de aplicación (ver 0009_summarize_lock.sql) antes de tocar nada.
 * `pendingMatchesQuery` no reclama filas — dos corridas a la vez pedirían la
 * misma primera página y sumarían lo mismo dos veces — y el `concurrency` de
 * publish.yml solo serializa ese workflow, no un `summarize` local corriendo al
 * lado, ni el backfill que está pensado para correr en paralelo al cron.
 *
 * No es un lock de sesión (pg_try_advisory_lock): es una fila, identificada por
 * un token random que esta función devuelve (o `null` si no se consiguió).
 * `releaseLock` necesita ese mismo token — ver por qué en 0009_summarize_lock.sql,
 * verificado en vivo reproduciendo el lock trabado que dio la alternativa de
 * sesión bajo concurrencia real.
 */
async function acquireLock(cfg: Cfg): Promise<string | null> {
  const token = randomUUID();
  const vencido = new Date(Date.now() - LOCK_TTL_MS).toISOString();
  // El INSERT crea la fila la primera vez; el ON CONFLICT es el intento real de
  // tomarlo, y sólo prospera si nadie lo tiene o si el que lo tenía se murió. Esa
  // condición en el `where` es lo que resuelve la carrera: dos corridas ejecutan
  // el mismo UPDATE y sólo una ve `changes = 1`.
  const changes = await cfg.run({
    sql:
      "insert into pipeline_locks (name, locked_at, holder) values (?, ?, ?) " +
      "on conflict(name) do update set locked_at = excluded.locked_at, holder = excluded.holder " +
      "where pipeline_locks.locked_at is null or pipeline_locks.locked_at < ?",
    params: [LOCK_NAME, new Date().toISOString(), token, vencido],
  });
  return changes > 0 ? token : null;
}

/** Libera el lock al terminar, se haya conseguido llegar al final o no (ver main). */
async function releaseLock(token: string, cfg: Cfg): Promise<boolean> {
  const changes = await cfg.run({
    sql: "update pipeline_locks set locked_at = null, holder = null where name = ? and holder = ?",
    params: [LOCK_NAME, token],
  });
  return changes > 0;
}

/**
 * El heartbeat (ver 0011_refresh_summarize_lock.sql): pisa `locked_at` SOLO si el
 * lock sigue siendo nuestro (mismo token). Antes de este fix, `acquireLock` se
 * llamaba una vez antes del loop y `releaseLock` una vez al final, y `locked_at`
 * nunca se tocaba en el medio — una corrida más larga que los 30 minutos de
 * vencimiento (el backfill, por diseño) quedaba con el lock "vencido" en la tabla
 * mientras seguía procesando, y `try_acquire_summarize_lock` se lo prestaba a otra
 * corrida: las dos terminaban sumando el mismo lote, doble conteo permanente porque
 * los seis contadores solo suman.
 *
 * `false` significa que el lock ya no es nuestro — otra corrida lo tomó — y quien
 * llama (`summarizeLoop`) tiene que abortar ruidosamente en vez de seguir
 * escribiendo.
 */
async function refreshLock(token: string, cfg: Cfg): Promise<boolean> {
  const changes = await cfg.run({
    sql: "update pipeline_locks set locked_at = ? where name = ? and holder = ?",
    params: [new Date().toISOString(), LOCK_NAME, token],
  });
  return changes > 0;
}

/**
 * Marca un conjunto de partidas como resumidas. Es TODO lo que le queda por
 * escribir a Postgres del resumen: los contadores viven en R2.
 *
 * **Se llama después de que R2 confirmó**, nunca antes, y ese orden es el punto.
 * `summarize_batch` (0008) metía los seis acumulados y la marca en una sola
 * transacción justamente para que no existiera un estado "contado pero sin marcar"
 * ni al revés. Contra un bucket esa transacción no se puede tener, así que hay que
 * elegir de qué lado caer: si esto falla después de escribir R2, las partidas
 * quedan sin marcar y la corrida siguiente las reprocesa — y `absorbed` adentro del
 * objeto reconoce ese reintento y no suma dos veces (ver absorbBand en
 * r2Summary.ts). Al revés, marcando primero, la pérdida sería definitiva.
 *
 * Trocea de a 100 ids por la misma razón que `deleteByIds`: un `in.(...)` con miles
 * de ids arma una URL que cualquier proxy delante de PostgREST corta.
 */
async function markSummarized(matchIds: string[], cfg: Cfg): Promise<number> {
  let marked = 0;
  for (const grupo of enGrupos(matchIds, DELETE_ID_BATCH)) {
    marked += await cfg.run({
      sql:
        `update matches set summarized_at = ? where summarized_at is null ` +
        `and match_id in (${marcadores(grupo.length)})`,
      params: [new Date().toISOString(), ...grupo],
    });
  }
  return marked;
}

/**
 * Cuántos días de partidas crudas conservar después de resumirlas, antes de
 * borrarlas.
 *
 * Arreglo 4: la ventana móvil real, prendida. Nacía en 0 (nunca borrar)
 * mientras la restricción de espacio era la única razón para no hacerlo — pero
 * un resumen no se puede des-resumir, y el criterio de agrupamiento de esta
 * misma tier list cambió dos veces en la semana en que se construyó este
 * pipeline, las dos veces reconstruyendo las cuatro bandas desde las partidas
 * crudas (ver docs/design). Con el filtro de ítems ahora igualado al build
 * (Arreglo 3), esa clase de cambio se puede volver a necesitar, así que la
 * ventana existe para poder reconstruir sin backfill: hoy son cuatro días.
 *
 * **El número sale de medir la ventana, no de dividir el total.** Es la cuenta
 * que hay que hacer y es fácil hacerla al revés: las bandas no se reparten
 * parejo. Medido contra la base el 2026-07-26, tableros dentro de la ventana:
 *
 *   días │ partidas │ platinum-gold │ silver-below │ diamond-emerald
 *      4 │    2.151 │         2.816 │        *392* │           7.776
 *      7 │    4.913 │         6.040 │          840 │          16.672
 *     10 │    6.953 │         7.800 │        1.296 │          22.856
 *
 * `silver-below` es apenas el 2,3% de lo que entra, así que con cuatro días
 * junta 392 tableros — **debajo de los 500 de `MIN_HABIT_BOARDS`**, y el
 * cerebro de coaching dejaría de hablarle a Plata, que es exactamente para lo
 * que se separaron las bandas (ver docs/design/2026-07-24-cerebro-coaching).
 * Siete días ya lo salvan; diez dan margen.
 *
 * **Bajado de 10 a 3 el 2026-07-27, y no es un recorte: es la contracara de subir
 * la ingesta.** Lo que llena una banda no son los días sino los tableros, y los dos
 * se compensan. Con el cron cada 30 minutos hacían falta diez días para juntar 1.296
 * tableros de `silver-below`; con el cron cada 5 minutos entran ~4.800 partidas por
 * día y **tres días dan ~2.650 tableros de esa misma banda** — el doble, en la
 * décima parte del calendario. La ventana se mide en tableros; los días son solo
 * cómo la consulta sabe expresarla.
 *
 * El que manda es el espacio: a 4.800 por día, diez días serían 48.000 partidas y
 * ~540 MB, y el plan gratuito son 500. Tres días son ~14.400 partidas y ~163 MB, que
 * con los ~185 del resumen dejan la base cerca de 350 MB, debajo de los 400 en que
 * `prune_matches` empieza a borrar.
 *
 * **Y por eso la ventana dejó de medirse en días.** Contar días obliga a adivinar el
 * ritmo de ingesta, y adivinar mal rompe de los dos lados: con el ritmo viejo, tres
 * días borran 5.500 partidas y dejan a Unidades y al coaching con menos datos que
 * antes; con el ritmo nuevo, diez días no entran en el plan gratuito. Un número fijo
 * de partidas se regula solo — si entran más, la ventana abarca menos días; si entran
 * menos, más — y el espacio queda acotado en los dos casos, que es lo único que la
 * base necesita que sea cierto.
 *
 * 14.000 partidas son ~158 MB a 11,3 KB cada una; con los ~185 del resumen la base
 * queda cerca de 343 MB, debajo de los 400 en que `prune_matches` empieza a borrar. Y
 * le dan a `silver-below` —el 2,3% de lo que entra— unos 2.576 tableros, arriba de
 * `MIN_BAND_BOARDS` y muy arriba de `MIN_HABIT_BOARDS`, sin importar a qué velocidad
 * hayan llegado.
 *
 * Se puede bajar por entorno (`RAW_RETENTION_MATCHES`) sin desplegar. Existe por una
 * razón concreta: mientras la base tenga menos partidas que la ventana, el camino de
 * archivar-y-borrar **nunca se ejecuta**, así que no hay forma de saber si escribe de
 * verdad en R2 hasta el día en que empiece a borrar — y ese es el peor momento para
 * enterarse. Bajándola un rato se fuerza a que archive un puñado y se puede mirar el
 * bucket. Como borrar exige que R2 haya confirmado, forzarlo no arriesga nada.
 */
export const DEFAULT_RAW_RETENTION_MATCHES = 14_000;

/**
 * El valor por defecto cuando la variable no viene, y un error cuando viene mal.
 *
 * La distinción no es cosmética. Un `workflow_dispatch` sin input pasa la variable
 * como **cadena vacía**, no como ausente, y `Number("")` es **0** — o sea "no
 * conservar ninguna partida". Un `?? "14000"` no lo atrapa, porque `""` no es
 * `undefined`. Sin esta función, cada corrida programada del workflow habría entrado
 * con retención cero y habría archivado y borrado la base entera.
 *
 * Vacío o ausente cae al default; cualquier otra cosa que no sea un entero >= 0
 * revienta, porque un número mal tipeado a mano es un error del que hay que
 * enterarse, no algo que corregir en silencio.
 */
export function retentionFromEnv(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_RAW_RETENTION_MATCHES;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(
      `RAW_RETENTION_MATCHES inválido: "${raw}" no da un entero >= 0. ` +
        "Dejalo vacío para usar el valor por defecto."
    );
  }
  return n;
}

export const RAW_RETENTION_MATCHES = retentionFromEnv(process.env.RAW_RETENTION_MATCHES);

/**
 * Tope de partidas que borra una sola corrida.
 *
 * Mismo motivo que `prune_matches` (0005_prune_matches.sql): una corrida no
 * puede quedarse borrando indefinidamente y bloqueando la tabla — mejor tardar
 * varias corridas en vaciar un backlog grande (por ejemplo, la primera vez que
 * se prende esta ventana sobre partidas viejas) que hacerlo todo de una.
 * 2.000 es del mismo orden que `LIMIT`: a ~800 partidas/día, cubre más de dos
 * días de ingesta por corrida, así que en régimen (una corrida diaria) nunca
 * se acumula backlog de borrado.
 */
const DELETE_BATCH = 2000;

/**
 * La parte pura del Arreglo 4: qué partidas entran en el borrado, dado un
 * conjunto con distintas fechas y estados de marcado.
 *
 * Dos condiciones, las dos necesarias:
 * - `summarizedAt !== null` — YA CONTABILIZADA. Borrar algo que todavía no
 *   aportó a los seis contadores sería perder esa partida sin haberla sumado
 *   nunca; no hay forma de recuperarla después.
 * - `gameDatetime` más viejo que `cutoffMs` — por cuándo se JUGÓ, nunca por
 *   cuándo se bajó ni por cuándo se resumió (`summarizedAt`). Riot devuelve
 *   las últimas veinte partidas DE CADA JUGADOR, no las últimas veinte
 *   recientes del servidor: una partida bajada hoy puede haberse jugado hace
 *   meses, y borrar por la fecha de descarga tiraría partidas recientes que
 *   todavía deberían estar dentro de la ventana.
 *
 * Esta función documenta y prueba la regla. `delete_summarized_raw` (ver la
 * migración 0012) aplica el mismo predicado a escala en Postgres — sigue
 * existiendo, pero `deleteOldRaw` más abajo ya no la llama: desde que borrar
 * exige haber archivado antes en R2 (ver el comentario de `deleteOldRaw`),
 * hace falta traer las partidas elegibles a Node de todos modos, para poder
 * subir su payload — así que el mismo predicado se aplica ahora también como
 * filtro REST en `eligibleForDeletion`, más abajo.
 */
export interface RawMatchState {
  matchId: string;
  summarizedAt: string | null;
  gameDatetime: number | null;
}

export function matchesToDelete(matches: RawMatchState[], cutoffMs: number): string[] {
  return matches
    .filter((m) => m.summarizedAt !== null && m.gameDatetime !== null && m.gameDatetime < cutoffMs)
    .map((m) => m.matchId);
}

/**
 * Cuándo se jugó la partida número `RAW_RETENTION_MATCHES` contando desde la más
 * nueva. Todo lo anterior a eso sobra.
 *
 * `null` cuando hay menos partidas que la ventana: ahí no sobra ninguna y no hay que
 * borrar nada. Devolver 0 en vez de null sería un corte en 1970 que no borra nada
 * igual, pero por accidente y no por decisión.
 */
async function retentionCutoff(cfg: Cfg): Promise<number | null> {
  const rows = (await cfg.fetchRows({
    sql:
      "select game_datetime from matches where game_datetime is not null " +
      "order by game_datetime desc limit 1 offset ?",
    params: [RAW_RETENTION_MATCHES - 1],
  })) as { game_datetime: number | null }[];
  return rows[0]?.game_datetime ?? null;
}

/**
 * Las partidas elegibles para borrar (ya resumidas, fuera de la ventana), con
 * lo que hace falta para archivarlas: el payload crudo tal cual, y de qué
 * versión/fecha sale su partición en R2 (ver `ArchivableMatch` en
 * r2Archive.ts). Mismo predicado que `matchesToDelete` documenta y prueba —
 * `summarized_at` no nulo y `game_datetime` anterior al corte — aplicado acá
 * como filtro REST directamente contra Postgres, con el mismo tope
 * `DELETE_BATCH` por corrida que usaba la RPC vieja (mismo motivo: no
 * quedarse borrando/archivando indefinidamente en una sola corrida).
 *
 * A diferencia de la versión anterior (que dejaba que `delete_summarized_raw`
 * decidiera y borrara en un solo paso, sin traer nada a Node), ahora SÍ hace
 * falta traer las filas: no se puede archivar en R2 un payload que nunca se
 * leyó.
 */
async function eligibleForDeletion(cutoffMs: number, cfg: Cfg): Promise<ArchivableMatch[]> {
  const rows = (await cfg.fetchRows({
    sql:
      "select match_id, payload, game_version, game_datetime from matches " +
      "where summarized_at is not null and game_datetime is not null and game_datetime < ? " +
      "order by game_datetime limit ?",
    params: [cutoffMs, DELETE_BATCH],
  })) as { match_id: string; payload: unknown; game_version: string | null; game_datetime: number | null }[];
  return rows.map((r) => ({
    matchId: r.match_id,
    gameVersion: r.game_version ?? "",
    // El `as number` es seguro: `game_datetime=not.is.null` en la query de arriba
    // ya descartó las filas sin fecha.
    gameDatetime: r.game_datetime as number,
    payload: r.payload,
  }));
}

/**
 * Cuántos `match_id` entran en un solo `in.(...)`, mismo motivo y mismo valor
 * El límite ya no es el largo de la URL sino los parámetros atados de D1 (100 por
 * declaración): `DELETE_BATCH` (2000) ids enteros
 * en una sola URL son ~30-40 KB, más de lo que muchos proxies delante de
 * PostgREST toleran en una URL — trocear evita un 414 a mitad de borrado.
 */
const DELETE_ID_BATCH = 50;

/**
 * Borra en Postgres SOLO los `match_id` que se pasan — nunca un corte por
 * fecha a ciegas. Quien llama (`deleteOldRaw`) ya filtró esta lista para que
 * sean exactamente las que R2 confirmó; el `summarized_at=not.is.null` del
 * WHERE es una segunda guarda, no la primera — si por lo que sea llegara acá
 * un id de una partida recién marcada por otra corrida en paralelo, tampoco se
 * borraría por accidente antes de tiempo.
 */
async function deleteMatchesByIds(matchIds: string[], cfg: Cfg): Promise<number> {
  let deleted = 0;
  for (const grupo of enGrupos(matchIds, DELETE_ID_BATCH)) {
    // `match_players` se va sola: la clave foránea del esquema de D1 lleva
    // `on delete cascade` (en Postgres el borrado en cascada lo hacía la misma
    // restricción). El `summarized_at is not null` sigue acá por lo mismo de
    // siempre: nunca borrar una cruda que todavía no fue contabilizada.
    deleted += await cfg.run({
      sql:
        `delete from matches where summarized_at is not null ` +
        `and match_id in (${marcadores(grupo.length)})`,
      params: grupo,
    });
  }
  return deleted;
}

/**
 * Cuántas partidas siguen cumpliendo el criterio de borrado después de esta
 * corrida — incluye tanto lo que quedó por fuera de `DELETE_BATCH` como lo que
 * no se pudo archivar en R2 (y por lo tanto no se borró). Sin este número, un
 * backlog de borrado que no baja es indistinguible de uno que ya se vació.
 */
async function countEligibleForDeletion(cutoffMs: number, cfg: Cfg): Promise<number> {
  // Un `count(*)` de verdad: PostgREST obligaba a pedir una fila y leer el total
  // del header `Content-Range`, que es de donde salía `countFromContentRange`.
  const rows = (await cfg.fetchRows({
    sql:
      "select count(*) as total from matches where summarized_at is not null " +
      "and game_datetime is not null and game_datetime < ?",
    params: [cutoffMs],
  })) as { total: number }[];
  return rows[0]?.total ?? 0;
}

/** Lo que `deleteOldRaw` necesita, inyectado — mismo patrón que `SummarizeLoopDeps`,
 * para poder probar el invariante (una subida fallida no borra) sin tocar la red. */
export interface DeleteOldRawDeps {
  /** `null` = la ventana todavía no se llenó, no hay nada que sobre. */
  retentionCutoff: () => Promise<number | null>;
  fetchEligible: (cutoffMs: number) => Promise<ArchivableMatch[]>;
  /** Sube a R2 y devuelve qué `matchId` quedaron CONFIRMADOS — acá vive el invariante. */
  archive: (matches: ArchivableMatch[]) => Promise<Set<string>>;
  deleteMatches: (matchIds: string[]) => Promise<number>;
  countEligible: (cutoffMs: number) => Promise<number>;
}

/**
 * Borra las partidas crudas ya resumidas y fuera de la ventana — pero, a
 * diferencia de antes, nunca a ciegas por fecha.
 *
 * **El invariante que esta función existe para no romper, bajo ninguna
 * circunstancia: una partida se borra de Postgres si y sólo si su payload ya
 * quedó CONFIRMADO en R2** (confirmado = `archive` la devolvió en el `Set` —
 * ver `archiveGroups` en r2Archive.ts, donde "confirmado" significa que la
 * subida no tiró). Si `archive` no confirma una partida (la subida falló, R2
 * estaba caído, lo que sea), esa partida NO entra en `deleteMatches`, así que
 * sigue en Postgres — y como sigue cumpliendo exactamente el mismo criterio de
 * "elegible para borrar" (`summarized_at` no nulo, `game_datetime` antes del
 * corte), la corrida siguiente la vuelve a traer y la vuelve a intentar sola,
 * sin que nadie tenga que acordarse de reintentarla a mano.
 *
 * Por qué importa tanto: el resumen (comp_stats y compañía) no se puede
 * des-resumir, pero al menos describe lo que la tier list necesita. El
 * payload crudo es la única copia de todo lo demás — posiciones, daño, orden
 * de ítems, la partida ronda a ronda — y análisis futuros (minado de reglas de
 * asociación, entre otros) lo van a necesitar. Que la base tarde un día más en
 * achicarse porque R2 estuvo caído es recuperable con la corrida de mañana;
 * que una partida se borre sin haber quedado archivada no lo es — no hay
 * corrida de mañana que la traiga de vuelta.
 */
export async function deleteOldRaw(
  deps: DeleteOldRawDeps
): Promise<{ deleted: number; remaining: number; archiveFailed: number }> {
  const cutoffMs = await deps.retentionCutoff();
  if (cutoffMs === null) return { deleted: 0, remaining: 0, archiveFailed: 0 };

  const eligible = await deps.fetchEligible(cutoffMs);
  if (eligible.length === 0) return { deleted: 0, remaining: 0, archiveFailed: 0 };

  const archived = await deps.archive(eligible);
  const toDelete = eligible.filter((m) => archived.has(m.matchId)).map((m) => m.matchId);
  const archiveFailed = eligible.length - toDelete.length;

  const deleted = await deps.deleteMatches(toDelete);
  const remaining = await deps.countEligible(cutoffMs);
  return { deleted, remaining, archiveFailed };
}

/**
 * El armado real de `DeleteOldRawDeps`: habla con Postgres por REST y con R2
 * por el SDK de S3. El cliente de R2 (`r2Client(r2Config())`) se arma DENTRO
 * de `archive`, no acá arriba — así, si esta corrida no tiene ninguna partida
 * elegible (`eligible.length === 0` en `deleteOldRaw`), nunca se llega a pedir
 * `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, y una corrida local sin esas
 * variables configuradas no falla por credenciales que ni siquiera iba a usar.
 */
function realDeleteOldRawDeps(cfg: Cfg): DeleteOldRawDeps {
  return {
    retentionCutoff: () => retentionCutoff(cfg),
    fetchEligible: (cutoffMs) => eligibleForDeletion(cutoffMs, cfg),
    archive: (matches) => archiveToR2(matches, r2Client(r2Config())),
    deleteMatches: (matchIds) => deleteMatchesByIds(matchIds, cfg),
    countEligible: (cutoffMs) => countEligibleForDeletion(cutoffMs, cfg),
  };
}

/**
 * El escritor real de `SummarizeLoopDeps.writeSummaryToR2`: fusiona los
 * contadores de esta corrida en el objeto de cada banda (ver absorbIntoPatchObjects
 * en r2Summary.ts). `r2Client(r2Config())` se arma DENTRO, no afuera — mismo
 * motivo que en `realDeleteOldRawDeps`: una corrida sin nada para escribir nunca
 * llega a pedir R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY.
 *
 * **Tira si algo falla, y ese cambio es el corazón del corte.** Mientras Postgres
 * tenía los mismos contadores, un problema de R2 se logueaba y la ingesta seguía;
 * ahora R2 es la única copia, así que tragarse el error significaría marcar como
 * resumidas partidas que no quedaron contadas en ningún lado. Que falle la corrida
 * cuesta esperar a la siguiente; que no falle cuesta perder los datos.
 */
function realWriteSummaryToR2(): (partitions: SummaryPartition[]) => Promise<string[]> {
  return async (partitions) => {
    const client = r2Client(r2Config());
    const listKeys = listKeysFromR2(client);
    const getObject = getObjectFromR2(client);
    const put = putSummaryToR2(client);

    // Las particiones vienen por (parche, día) y los objetos son por (parche,
    // banda), así que los días de un mismo parche se juntan acá. El día no se
    // pierde: viaja adentro de cada fila de comp_stats y band_stats, que son
    // las dos tablas que lo tienen.
    const byPatch = new Map<string, { rows: SummaryRows; matchIds: Set<string> }>();
    for (const partition of partitions) {
      let bucket = byPatch.get(partition.key.patch);
      if (!bucket) {
        bucket = { rows: emptyRows(), matchIds: new Set() };
        byPatch.set(partition.key.patch, bucket);
      }
      for (const row of partition.rows.compStats) bucket.rows.compStats.push(row);
      for (const row of partition.rows.compUnitStats) bucket.rows.compUnitStats.push(row);
      for (const row of partition.rows.compUnitItemStats) bucket.rows.compUnitItemStats.push(row);
      for (const row of partition.rows.compTraitStats) bucket.rows.compTraitStats.push(row);
      for (const row of partition.rows.compItemStats) bucket.rows.compItemStats.push(row);
      for (const row of partition.rows.bandStats) bucket.rows.bandStats.push(row);
      for (const id of partition.matchIds) bucket.matchIds.add(id);
    }

    const bands = BANDS.map((b) => b.id);
    const yaContadas = new Set<string>();
    for (const [patch, bucket] of byPatch) {
      const { merged, already, empty, alreadyCounted } = await absorbIntoPatchObjects(
        listKeys,
        getObject,
        put,
        patch,
        bands,
        bucket.rows,
        [...bucket.matchIds].sort()
      );
      for (const id of alreadyCounted) yaContadas.add(id);
      console.log(
        `R2 resumen ${patch}: ${merged} banda(s) fusionadas` +
          (already > 0 ? `, ${already} ya tenían este lote (reintento)` : "") +
          (empty > 0 ? `, ${empty} sin filas en este lote` : "") +
          (alreadyCounted.length > 0 ? `, ${alreadyCounted.length} ya contadas sin marcar` : "")
      );
    }
    return [...yaContadas];
  };
}

/** Lo que `summarizeLoop` necesita de Postgres, inyectado — mismo patrón que
 * `FetchRows` en pgStore.ts, para poder probar el heartbeat y el loop de
 * paginación sin tocar la red. */
export interface SummarizeLoopDeps {
  fetchRows: FetchRows;
  /** El heartbeat (ver refreshLock arriba). `false` = el lock ya no es nuestro. */
  refreshLock: () => Promise<boolean>;
  /**
   * Escribe en R2 los contadores de ESTA corrida entera, fusionándolos en el
   * objeto de cada banda. Se llama UNA sola vez, al final del loop, con las
   * particiones de todos los lotes ya acumuladas.
   *
   * **Tiene que tirar si no pudo escribir.** Es la única copia: si esto se
   * tragara el error, el paso siguiente marcaría como resumidas partidas que no
   * contó nadie. Cuando Postgres tenía los contadores podía tragárselo, y lo
   * hacía; ahora no.
   */
  /**
   * Escribe los contadores en R2 y devuelve las partidas que **ya estaban
   * contadas ahí y sin marcar en la base**, para que el loop les ponga la marca.
   * Vacío en el caso normal.
   */
  writeSummaryToR2: (partitions: SummaryPartition[]) => Promise<string[] | void>;
  /**
   * Marca las partidas de la corrida como resumidas — DESPUÉS de que R2
   * confirmó. Ver el comentario de `markSummarized` para por qué ese orden y no
   * el contrario.
   */
  markSummarized: (matchIds: string[]) => Promise<number>;
}

/**
 * Suma las particiones de UN lote al acumulador de la corrida entera.
 *
 * Concatena arrays, nunca fusiona por clave: quien lee después
 * (`summariesFromTables`, en summaryStore.ts y en r2Summary.ts) ya suma filas
 * repetidas de la misma clave, así que dos filas de dos lotes distintos con la
 * misma clave (banda, parche, firma, unidad) conviven bien adentro del mismo
 * archivo — no hace falta fusionarlas acá para que el total salga bien.
 */
function accumulatePartitions(
  acc: Map<string, { rows: SummaryRows; matchIds: Set<string> }>,
  batch: SummaryPartition[]
): void {
  for (const partition of batch) {
    const key = `${partition.key.patch}|${partition.key.day}`;
    let bucket = acc.get(key);
    if (!bucket) {
      bucket = { rows: emptyRows(), matchIds: new Set() };
      acc.set(key, bucket);
    }
    bucket.rows.compStats.push(...partition.rows.compStats);
    bucket.rows.compUnitStats.push(...partition.rows.compUnitStats);
    bucket.rows.compUnitItemStats.push(...partition.rows.compUnitItemStats);
    bucket.rows.compTraitStats.push(...partition.rows.compTraitStats);
    bucket.rows.compItemStats.push(...partition.rows.compItemStats);
    bucket.rows.bandStats.push(...partition.rows.bandStats);
    for (const id of partition.matchIds) bucket.matchIds.add(id);
  }
}

/**
 * El loop principal: pide páginas de partidas pendientes, las resume y las marca,
 * hasta agotar `limit` o quedarse sin pendientes.
 *
 * El heartbeat corre al PRINCIPIO de cada vuelta, antes de pedir la página y de
 * escribir nada: si el lock ya no es nuestro, la corrida tiene que abortar ANTES
 * de sumar otro lote, no después — sumar con un lock robado es exactamente el
 * doble conteo que el heartbeat existe para evitar (ver refreshLock arriba y
 * 0011_refresh_summarize_lock.sql).
 *
 * `currentPatches` (Cambio 1): calculada UNA vez por corrida en `main()` — no
 * por vuelta ni por lote — y pasada tal cual a `rowsFor` en cada vuelta. Tiene
 * que ser fija durante toda la corrida: un lote de 8 partidas es demasiado
 * poco para decidir por sí solo "cuáles son los dos parches más nuevos" (un
 * backlog viejo de un backfill puede traer ocho partidas seguidas sin ninguna
 * del parche vigente), así que la lista se decide mirando TODA la tabla una
 * vez (`newestPatchesFromPg`), no lote a lote.
 */
export async function summarizeLoop(
  deps: SummarizeLoopDeps,
  set: number,
  limit: number,
  batch: number,
  keepItem: ItemFilter = () => true,
  currentPatches?: string[]
): Promise<number> {
  let processed = 0;
  // El cursor de paginación (Arreglo 2, ver el comentario de pendingMatchesQuery):
  // avanza por TODAS las filas que vinieron, se hayan marcado o no. Si avanzara
  // sólo con las marcadas, una tanda de partidas sin game_datetime (que nunca se
  // marcan) volvería en cada página para siempre.
  let cursor = "";
  // El acumulador de particiones de R2 de TODA la corrida (ver
  // accumulatePartitions y SummarizeLoopDeps.writeSummaryToR2 arriba).
  const partitionAcc = new Map<string, { rows: SummaryRows; matchIds: Set<string> }>();
  // Las partidas a marcar cuando R2 haya confirmado. Salen de `lobbies`, no de
  // `rows`: son exactamente las que tienen game_datetime real, sean o no
  // comparables — una sin fecha no se marca porque la fecha puede completarse
  // después, y una partida marcada no se vuelve a pedir nunca.
  const pendingIds: string[] = [];
  while (processed < limit) {
    const stillMine = await deps.refreshLock();
    if (!stillMine) {
      throw new Error(
        "el lock de summarize_run ya no es nuestro: otra corrida lo tomó mientras " +
          "esta seguía procesando (locked_at venció y try_acquire_summarize_lock se lo " +
          "prestó). Abortando ruidosamente antes de escribir, para no sumar el mismo " +
          "lote de partidas dos veces."
      );
    }

    const pageSize = Math.min(batch, limit - processed);
    const rows = (await deps.fetchRows(pendingMatchesQuery(pageSize, cursor))) as PendingRow[];
    if (rows.length === 0) break;

    // Ver el comentario de la declaración de `cursor` arriba: se toma de `rows`
    // (todo lo que vino), no de `lobbies` (lo que además tiene fecha), para que
    // una página 100% sin game_datetime igual empuje el cursor de la próxima.
    cursor = rows[rows.length - 1].match_id;

    // lobbiesWithDate descarta las partidas sin game_datetime (ver el
    // comentario ahí y Arreglo 6): esas NO se marcan, porque la fecha puede
    // completarse más adelante y una partida marcada nunca se vuelve a
    // pedir. Se cuentan como descarte igual que las no comparables — la
    // diferencia entre las dos es si `match_id` entra en la lista que se
    // marca al final.
    const lobbies = lobbiesWithDate(rows);
    const noDate = rows.length - lobbies.length;
    const rowsOut = rowsFor(lobbies, set, keepItem, currentPatches);
    const totalDiscarded = noDate + rowsOut.discardedMatches;

    accumulatePartitions(partitionAcc, partitionedRowsFor(lobbies, set, keepItem, currentPatches));
    for (const l of lobbies) pendingIds.push(l.matchId);

    // Un descarte parcial es normal (Double Up, partidas de otro set todavía
    // en el backlog, alguna sin fecha). Uno del 100% no lo es: si isComparable
    // tira TODO un lote, eso puede ser un TFT_SET roto o un set que cambió
    // antes de drenar el backlog anterior — así que tiene que ser imposible
    // de no ver.
    if (totalDiscarded > 0) {
      const allDiscarded = totalDiscarded === rows.length;
      const log = allDiscarded ? console.error : console.log;
      log(
        `${allDiscarded ? "ALERTA: lote 100% descartado — " : ""}` +
          `${totalDiscarded}/${rows.length} partidas de este lote descartadas ` +
          `(${noDate} sin game_datetime, no marcadas; ${rowsOut.discardedMatches} no comparables ` +
          `— cola, set o menos de 2 tableros — para TFT_SET=${set})`
      );
    }

    processed += rows.length;
    console.log(
      `leídas ${processed} partidas — ` +
        `${rowsOut.compStats.length} filas de comp, ${rowsOut.compUnitStats.length} de unidad, ` +
        `${rowsOut.compUnitItemStats.length} de unidad-ítem, ${rowsOut.compTraitStats.length} de trait, ` +
        `${rowsOut.compItemStats.length} de ítem`
    );
  }

  // Ojo con la asimetría: hay partidas que se MARCAN sin escribir nada en R2 —
  // las no comparables (Double Up, otro set, menos de 2 tableros). Si no se
  // marcaran, volverían en cada corrida para siempre. Por eso la marca no cuelga
  // de que haya particiones: cuelga de que R2 no haya fallado.
  if (pendingIds.length === 0) return processed;

  // El orden de estas dos llamadas ES el diseño, no una preferencia.
  //
  // Cuando los contadores vivían en Postgres, `summarize_batch` metía las seis
  // acumulaciones y la marca de `summarized_at` en una sola transacción, así que
  // "contado" y "marcado" no podían separarse (ver 0008_summarize_batch.sql).
  // Con los contadores en R2 esa transacción no existe: son dos sistemas. Así que
  // se escribe R2 PRIMERO y se marca DESPUÉS, y las dos fallas posibles quedan
  // del lado recuperable:
  //
  // - si R2 falla, `writeSummaryToR2` tira y no se marca nada: la corrida
  //   siguiente reprocesa exactamente lo mismo;
  // - si la marca falla después de que R2 escribió, la corrida siguiente también
  //   reprocesa, y `absorbed` adentro de cada objeto reconoce el reintento y NO
  //   suma dos veces (ver absorbBand en r2Summary.ts).
  //
  // Marcar primero sería la única variante con pérdida definitiva: partidas
  // marcadas que nadie contó, invisibles para siempre.
  let yaContadas: string[] = [];
  if (partitionAcc.size > 0) {
    const partitions: SummaryPartition[] = [...partitionAcc.entries()].map(([key, bucket]) => {
      const [patch, day] = key.split("|");
      return { key: { patch, day }, matchIds: [...bucket.matchIds].sort(), rows: bucket.rows };
    });
    yaContadas = (await deps.writeSummaryToR2(partitions)) ?? [];
  }

  /**
   * El lote traía partidas que R2 ya tenía contadas y la base no tenía marcadas,
   * así que no se sumó nada. Lo único que corresponde es ponerles la marca que
   * les falta: están contadas, y sin la marca vuelven en cada lote y lo ensucian
   * para siempre (fue lo que dejó la publicación caída seis corridas seguidas el
   * 2026-07-29).
   *
   * Se marcan SÓLO ésas y no `pendingIds`: las demás del lote no se contaron en
   * esta corrida, así que marcarlas las perdería.
   */
  if (yaContadas.length > 0) {
    const reparadas = await deps.markSummarized(yaContadas);
    console.log(
      `reparadas ${reparadas} partidas que ya estaban contadas en R2 y sin marcar. ` +
        "Nada se sumó en esta corrida; la próxima procesa el resto con un lote limpio."
    );
    return 0;
  }

  const marked = await deps.markSummarized(pendingIds);
  console.log(`resumidas ${processed} partidas (${marked} marcadas)`);

  return processed;
}

/**
 * Arreglo 5: `--reset-summary=<patch>` en el argv pide deshacer lo ya escrito
 * para ese parche, para que la corrida siguiente lo vuelva a contar con el
 * filtro correcto (el Arreglo 3 invalidó lo que ya está en la base: un
 * contador escrito sin el filtro de catálogo, o con un catálogo viejo, no se
 * puede corregir en el lugar).
 *
 * El parche va pegado con `=`, no como argumento separado (`--reset-summary
 * 16.14`): así no hay ambigüedad sobre si un valor suelto en argv es el parche
 * o algo de otro flag, y el flag entero es una sola palabra para copiar y
 * pegar en el comando exacto que pide el reporte.
 */
export function parseResetArg(argv: string[]): string | null {
  const flag = argv.find((a) => a.startsWith("--reset-summary="));
  return flag ? flag.slice("--reset-summary=".length) : null;
}

/**
 * PostgREST devuelve el total real de una escritura en el header
 * `Content-Range` (con `Prefer: count=exact`) como "0-9/42" (42 filas) o con un
 * asterisco como total cuando no pudo calcularlo — nunca un cuerpo JSON con el
 * conteo, así que hace falta parsear el header. `null` (sin header, o formato
 * inesperado) cuenta como 0 en vez de tirar: un reset que no puede confirmar
 * cuántas filas tocó no es razón para fallar el borrado que sí hizo.
 */
export function countFromContentRange(header: string | null): number {
  if (!header) return 0;
  const total = header.split("/")[1];
  if (total === undefined || total === "*") return 0;
  const n = Number(total);
  return Number.isFinite(n) ? n : 0;
}


export interface ResetSummaryResult {
  deletedRows: number;
  unmarked: number;
}

/**
 * Deshace un parche del resumen: borra sus objetos de R2 y desmarca
 * (`summarized_at = null`) sus partidas, para que `summarizeLoop` las vuelva a
 * contar en la próxima corrida.
 *
 * Borraba filas de seis tablas de Postgres; ahora borra objetos, porque ahí es
 * donde vive el resumen. Lo que NO cambió es para qué existe: un contador escrito
 * con un catálogo viejo no se puede corregir en el lugar (los contadores sólo
 * suman), así que la única forma de rehacerlo es tirarlo y volver a contar.
 *
 * Ojo con lo que esto puede tirar: sólo se recupera lo que siga en la ventana de
 * partidas crudas. Un parche cuyas crudas ya se borraron NO se puede recontar —
 * `--reset-summary` sobre eso lo borra para siempre.
 *
 * Las partidas se identifican por `game_version like *<Releases/PATCH>*`, igual
 * que `matchesQuery` en pgStore.ts — `matches` no guarda el parche ya separado,
 * sólo la versión cruda de Riot.
 */
export async function resetSummary(patch: string, cfg: Cfg): Promise<ResetSummaryResult> {
  const client = r2Client(r2Config());
  const keys = await listKeysFromR2(client)(patchPrefix(patch));
  await deleteKeysFromR2(client)(keys);
  const deletedRows = keys.length;

  const unmarked = await cfg.run({
    sql: "update matches set summarized_at = null where summarized_at is not null and game_version like ?",
    params: [`%<Releases/${patch}>%`],
  });

  return { deletedRows, unmarked };
}

async function main(): Promise<void> {
  // --reset-summary=<patch>: un modo aparte, admin, que nunca corre en el cron
  // normal. Toma el mismo lock que summarizeLoop porque toca las mismas seis
  // tablas y las mismas marcas — sin eso, una corrida normal en paralelo
  // podría escribir contadores nuevos para el parche justo mientras el reset
  // los borra.
  const resetPatch = parseResetArg(process.argv.slice(2));
  if (resetPatch !== null) {
    const cfg = config();
    const token = await acquireLock(cfg);
    if (token === null) {
      console.log("ya hay otro resumidor corriendo — no se tomó el lock, no reseteo nada");
      return;
    }
    try {
      const { deletedRows, unmarked } = await resetSummary(resetPatch, cfg);
      console.log(
        `--reset-summary=${resetPatch}: ${deletedRows} filas borradas de las 6 tablas del ` +
          `resumen, ${unmarked} partidas desmarcadas — la próxima corrida las vuelve a contar`
      );
    } finally {
      await releaseLock(token, cfg);
    }
    return;
  }


  assertValidSet(SET, process.env.TFT_SET);
  assertValidLimit(LIMIT, process.env.SUMMARIZE_LIMIT);

  // Arreglo 3: el mismo catálogo y el mismo filtro que usa build.ts, exigido
  // ANTES de tocar Postgres — ver assertCatalogPresent para por qué esto no
  // puede degradar a "sin filtro" como hace build.ts.
  const catalog = loadCatalog();
  assertCatalogPresent(catalog);
  const keepItem = knownItemFilter(catalog);

  const cfg = config();

  // Si no se consigue, YA hay otro resumidor corriendo (ver 0009_summarize_lock.sql
  // para por qué hace falta). Salir con éxito y no como error: esto no es una
  // falla, es la corrida de al lado haciendo su trabajo.
  const token = await acquireLock(cfg);
  if (token === null) {
    console.log("ya hay otro resumidor corriendo — no se tomó el lock, salgo sin hacer nada");
    return;
  }

  try {
    const fetchRows = cfg.fetchRows;
    // Cambio 1: los dos parches más nuevos, calculados UNA vez sobre TODA la
    // tabla (ver el comentario de currentPatches en summarizeLoop) — nunca
    // lote a lote, y nunca hardcodeados.
    // Sin lista de parches: se cuenta todo lo del set. El corte por parche se
    // fue el 2026-07-29 (ver loadBandSummariesForSet en r2Summary.ts), así que
    // filtrar acá dejaría afuera partidas que el build igual va a querer sumar.
    const currentPatches = undefined;
    console.log(`resumiendo todos los parches del set ${SET}`);

    const processed = await summarizeLoop(
      {
        fetchRows,
        refreshLock: () => refreshLock(token, cfg),
        markSummarized: (matchIds) => markSummarized(matchIds, cfg),
        // Etapa 1 de la mudanza a R2 (ver r2Summary.ts): escribe en los dos lados
        // sin que un problema de R2 pueda tocar el resultado de esta corrida.
        writeSummaryToR2: realWriteSummaryToR2(),
      },
      SET,
      LIMIT,
      BATCH,
      keepItem,
      currentPatches
    );

    console.log(processed === 0 ? "nada pendiente de resumir" : `listo: ${processed} partidas resumidas`);

    // El borrado va DESPUÉS de resumir, en la misma corrida: sólo así una
    // partida recién contabilizada en este mismo run puede, si ya cayó fuera
    // de la ventana, borrarse sin esperar a la corrida siguiente. La guarda
    // explícita (además de la que ya hace la migración con el `where`) evita
    // depender de leer el cuerpo de deleteOldRaw para saber si esto borra algo.
    if (RAW_RETENTION_MATCHES > 0) {
      const { deleted, remaining, archiveFailed } = await deleteOldRaw(realDeleteOldRawDeps(cfg));
      const archiveNote =
        archiveFailed > 0
          ? ` — ${archiveFailed} no se pudieron archivar en R2 y NO se borraron, se reintentan la próxima corrida`
          : "";
      console.log(
        `borrado: ${deleted} partidas crudas ya archivadas en R2 y resumidas, fuera de la ` +
          `ventana de las ${RAW_RETENTION_MATCHES} más nuevas (tope ${DELETE_BATCH}/corrida)` +
          `${archiveNote} — ${remaining} siguen elegibles para la próxima corrida`
      );
    }
  } finally {
    // Pase lo que pase adentro del try —éxito, o una excepción que main().catch
    // va a loguear y convertir en exit 1—, el lock se libera acá. Si no,
    // cualquier corrida que falle deja el lock tomado hasta que venza solo (ver
    // 0009_summarize_lock.sql).
    await releaseLock(token, cfg);
  }
}

// Guardado igual que build.ts y migrate-to-postgres.ts: importar este archivo
// por rowsFor/dayOf/etc. (como hace summarizeRun.test.ts) no debe disparar una
// corrida real contra Postgres.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
