/**
 * El cliente de Cloudflare D1 para el pipeline, que corre en GitHub Actions y no
 * adentro de un Worker — así que habla por la API HTTP, no por un binding.
 *
 * Reemplaza a `pgFetcher` de pgStore.ts. La forma es la misma a propósito (una
 * función que recibe una consulta y devuelve filas), así que todo lo que estaba
 * armado alrededor —la paginación por cursor, los lotes, los loops— no cambió: lo
 * único distinto es el dialecto y que ahora los valores van **atados**, no
 * interpolados en la URL.
 *
 * Atarlos no es cosmético. Con PostgREST cada valor viajaba dentro del query
 * string y había que acordarse de `encodeURIComponent` en cada lugar; acá el
 * valor nunca toca la cadena de SQL, así que una comilla en un nombre de invocador
 * o un id raro no pueden romper (ni torcer) la consulta.
 */

export interface SqlQuery {
  sql: string;
  params?: unknown[];
}

/** Lee filas. Inyectable, igual que antes, para que los tests no toquen la red. */
export type FetchRows = (q: SqlQuery) => Promise<unknown[]>;

/** Escribe. Devuelve cuántas filas cambió — el equivalente a `Content-Range` de PostgREST. */
export type RunSql = (q: SqlQuery) => Promise<number>;

export interface D1Config {
  accountId: string;
  databaseId: string;
  token: string;
}

/**
 * La base de Vestigo. El id no es secreto (identifica, no autoriza) y por eso
 * puede vivir acá: lo que autoriza es CLOUDFLARE_API_TOKEN, que sale del entorno.
 */
export const VESTIGO_DB = {
  accountId: "9e77bb35030829527c93a25408c5ec90",
  databaseId: "8c28d04f-e915-4da9-b32d-7ecf60ddb743",
};

export function d1Config(env: Record<string, string | undefined> = process.env): D1Config {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error(
      "Falta CLOUDFLARE_API_TOKEN.\n" +
        "En local va en games/tft/pipeline/.env; en CI, en los secrets del repo.\n" +
        "Se crea en el dashboard con permisos de cuenta D1 Read + D1 Write."
    );
  }
  return { ...VESTIGO_DB, token };
}

interface D1Response {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: { results?: unknown[]; meta?: { changes?: number } }[];
}

async function ejecutar(cfg: D1Config, q: SqlQuery): Promise<D1Response["result"]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/d1/database/${cfg.databaseId}/query`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
      body: JSON.stringify({ sql: q.sql, params: q.params ?? [] }),
    }
  );
  const json = (await res.json()) as D1Response;
  if (!res.ok || !json.success) {
    const motivo = json.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") ?? `HTTP ${res.status}`;
    // La consulta entera en el mensaje, recortada: sin eso, un error de sintaxis
    // en una de las diez consultas del build no dice cuál fue.
    throw new Error(`D1 falló (${motivo}) en: ${q.sql.slice(0, 200)}`);
  }
  return json.result ?? [];
}

export function d1Fetcher(cfg: D1Config = d1Config()): FetchRows {
  return async (q) => {
    const r = await ejecutar(cfg, q);
    return (r && r[0] && r[0].results ? r[0].results : []) as unknown[];
  };
}

export function d1Runner(cfg: D1Config = d1Config()): RunSql {
  return async (q) => {
    const r = await ejecutar(cfg, q);
    return (r && r[0] && r[0].meta && r[0].meta.changes) || 0;
  };
}

/**
 * Trocea una lista de ids en grupos, para las consultas con `in (...)`.
 *
 * **Cincuenta, no cien, y el número es de D1, no de SQLite.** SQLite admite 999
 * parámetros por declaración, pero D1 corta en **100**, y eso no está en el error
 * hasta que pasa: con 100 ids más el timestamp del `update` son 101 y la corrida
 * murió en producción con "too many SQL variables". Cincuenta deja margen para
 * cualquier consulta que ate algo más que los ids.
 */
export function enGrupos<T>(items: T[], tamaño = 50): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < items.length; i += tamaño) grupos.push(items.slice(i, i + tamaño));
  return grupos;
}

/** `?, ?, ?` para atar una lista — nunca los valores concatenados. */
export function marcadores(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}
