import type { Pool } from "./types";

/**
 * El pozo del Deadlockdle vive en el sitio (`/deadlock/dle-pool.json`, lo arma
 * el build) y el Worker lo pide de ahí: así se actualiza solo con cada
 * publicación diaria, sin volver a publicar el Worker.
 *
 * Se guarda una hora en memoria y, cada vez que llega uno bueno, en la base
 * (`backup`). Si vestigo.gg no contesta (o tarda más de 5 s), se sigue con la
 * última copia: la de memoria o, en un isolate recién arrancado, la de la base.
 */

/** Dónde queda la última copia buena fuera de la memoria del isolate. */
export interface PoolBackup {
  get(): Promise<Pool | null>;
  put(pool: Pool): Promise<void>;
}

const TIMEOUT_MS = 5000;

export class PoolUnavailable extends Error {
  constructor() {
    super("dle: no hay pozo");
  }
}

const TTL_MS = 3_600_000;
let cached: { pool: Pool; at: number } | null = null;

/** Para los tests. */
export function resetPoolCache(): void {
  cached = null;
}

export async function loadPool(
  url: string,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  now = Date.now(),
  backup?: PoolBackup,
): Promise<Pool> {
  if (cached && now - cached.at < TTL_MS) return cached.pool;
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) {
      const pool = (await res.json()) as Pool;
      if (pool.heroes?.length && pool.items?.length && pool.abilities?.length) {
        cached = { pool, at: now };
        await backup?.put(pool).catch((err) => console.error("dle: respaldo del pozo", err));
        return pool;
      }
    }
  } catch (err) {
    console.error("dle: pozo", err);
  }
  if (cached) return cached.pool;
  const saved = await backup?.get().catch(() => null);
  if (saved) {
    cached = { pool: saved, at: now };
    return saved;
  }
  throw new PoolUnavailable();
}

/** El respaldo en D1: una sola fila con el último pozo bueno. */
export function d1PoolBackup(db: D1Database): PoolBackup {
  return {
    async get() {
      const r = await db.prepare("select json from dle_pool where id = 1").first<{ json: string }>();
      return r ? (JSON.parse(r.json) as Pool) : null;
    },
    async put(pool) {
      await db
        .prepare("insert into dle_pool (id, json, at) values (1, ?1, ?2) on conflict (id) do update set json = excluded.json, at = excluded.at")
        .bind(JSON.stringify(pool), Date.now())
        .run();
    },
  };
}
