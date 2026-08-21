import { RANKED_QUEUE, type LobbyRecord } from "./store";
import type { FetchRows, SqlQuery } from "./d1";
export type { FetchRows, SqlQuery } from "./d1";
import { toParticipants, type RawMatch } from "./riot/normalize";
import { patchOf, newestPatch, newestPatches } from "./patch";

/**
 * Las partidas, leídas de D1 en vez del disco.
 *
 * Todo lo que describe una partida sale del payload verbatim, igual que en
 * `store.loadLobbies` — set, cola, modo y versión se leen ahí y no de las columnas,
 * para que las dos fuentes no puedan divergir en silencio. Lo único que viene de una
 * columna es el `tier`, que Riot no manda y nosotros anotamos al bajarla.
 */

export interface PgRow {
  match_id: string;
  tier: string | null;
  payload: RawMatch;
}

/**
 * El filtro del parche va contra el marcador completo `<Releases/16.14>` y no
 * contra "16.14" suelto: un `like` por prefijo haría que "16.1" se trajera las de
 * "16.14".
 *
 * El `order by match_id` no es decorativo: sin un orden total, paginar con
 * `limit/offset` puede repetir o saltear filas, en SQLite igual que en Postgres.
 */
export function matchesQuery(set: number, patch: string, limit: number, offset: number): SqlQuery {
  const where = ["set_number = ?", "queue_id = ?"];
  const params: unknown[] = [set, RANKED_QUEUE];
  if (patch) {
    where.push("game_version like ?");
    params.push(`%<Releases/${patch}>%`);
  }
  return {
    sql:
      `select match_id, tier, payload from matches where ${where.join(" and ")} ` +
      "order by match_id limit ? offset ?",
    params: [...params, limit, offset],
  };
}

/**
 * D1 devuelve `payload` como TEXT (SQLite no tiene jsonb), así que se parsea acá
 * — un solo lugar, en vez de que cada llamador se acuerde.
 */
export function lobbiesFromRows(rows: PgRow[]): LobbyRecord[] {
  const parsed = rows.map((r) => ({
    ...r,
    payload: (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) as RawMatch,
  }));
  return desdeFilas(parsed);
}

function desdeFilas(rows: PgRow[]): LobbyRecord[] {
  return rows.map((row) => {
    const info = (
      row.payload as {
        info?: {
          tft_set_number?: number;
          tft_game_type?: string;
          game_version?: string;
          queue_id?: number;
          queueId?: number;
        };
      }
    ).info;
    return {
      matchId: row.match_id,
      set: info?.tft_set_number ?? 0,
      queueId: info?.queue_id ?? info?.queueId ?? 0,
      gameType: info?.tft_game_type ?? "",
      gameVersion: info?.game_version ?? "",
      tier: row.tier ?? "",
      boards: toParticipants(row.payload),
    };
  });
}

/**
 * Cuántas filas por página. D1 no impone el tope de 1000 que imponía PostgREST,
 * pero el tamaño de la respuesta sí importa: una página de partidas son payloads
 * de ~20 KB cada uno, así que 1000 son ~20 MB por request. Se mantiene el número
 * y, sobre todo, se mantiene la regla que lo acompañaba: **paginar avanzando por
 * las filas que VINIERON y cortar sólo en cero**, nunca por "vino menos de lo
 * pedido".
 */
const PG_MAX_ROWS = 1000;

/** Payloads de ~20 KB: 200 por request son unos 4 MB, que es una respuesta cómoda. */
const PAGE = 200;

export async function loadLobbiesFromPg(
  fetchRows: FetchRows,
  set: number,
  patch: string,
  page = PAGE
): Promise<LobbyRecord[]> {
  const out: LobbyRecord[] = [];
  // El avance es por lo que VINO, no por lo que se pidió. PostgREST puede devolver
  // menos filas que el `limit` (ver PG_MAX_ROWS), y avanzar por el pedido saltearía
  // en silencio las que no vinieron.
  let offset = 0;
  for (;;) {
    const rows = (await fetchRows(matchesQuery(set, patch, page, offset))) as PgRow[];
    out.push(...lobbiesFromRows(rows));
    if (rows.length === 0) return out;
    offset += rows.length;
  }
}

/**
 * Cadenas de ~80 bytes cada una: 1000 por página son unos 80 KB, una respuesta
 * cómoda — y, ver PG_MAX_ROWS arriba, el tope real que PostgREST va a imponer
 * de todos modos.
 */
const PATCH_PAGE = PG_MAX_ROWS;

/**
 * Todos los parches de las partidas rankeadas del set, en el orden en que
 * llegaron — pidiendo solo la columna de versión: son unos cientos de KB
 * contra los ~145 MB que pesan los payloads.
 *
 * Pagina hasta que una página viene vacía, nunca por "vino menos de lo
 * pedido" — eso confundiría el tope de 1000 filas de PostgREST (ver
 * PG_MAX_ROWS) con el fin de los datos, y quien llame se quedaría con los
 * parches de la primera página, que es siempre la de match_id más bajo por
 * el `order` de abajo (o sea los más viejos). El `order` es necesario para
 * que paginar con `offset` no repita ni salte filas.
 *
 * Compartida por `newestPatchFromPg` (el más nuevo) y `newestPatchesFromPg`
 * (los N más nuevos): las dos necesitan exactamente esta misma lista, la
 * paginación no cambia según cuántos parches quiera el que llama.
 */
async function allPatchesFromPg(
  fetchRows: FetchRows,
  set: number,
  page: number
): Promise<string[]> {
  const patches: string[] = [];
  let offset = 0;
  for (;;) {
    const rows = (await fetchRows({
      sql:
        "select game_version from matches where set_number = ? and queue_id = ? " +
        "order by match_id limit ? offset ?",
      params: [set, RANKED_QUEUE, page, offset],
    })) as { game_version: string | null }[];
    patches.push(...rows.map((r) => patchOf(r.game_version ?? "")));
    if (rows.length === 0) return patches;
    offset += rows.length;
  }
}

/** El parche más nuevo que hay en la base. Ver allPatchesFromPg para la paginación. */
export async function newestPatchFromPg(
  fetchRows: FetchRows,
  set: number,
  page = PATCH_PAGE
): Promise<string> {
  return newestPatch(await allPatchesFromPg(fetchRows, set, page));
}

/**
 * Los N parches más nuevos que hay en la base, newest primero — el "parche
 * vigente y el anterior" que summarize-run.ts necesita para no contar lo que
 * ninguna tier list lee. Misma paginación que newestPatchFromPg, mismo motivo.
 */
export async function newestPatchesFromPg(
  fetchRows: FetchRows,
  set: number,
  n: number,
  page = PATCH_PAGE
): Promise<string[]> {
  return newestPatches(await allPatchesFromPg(fetchRows, set, page), n);
}
