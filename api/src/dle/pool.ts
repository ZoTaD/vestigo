import type { Pool } from "./types";

/**
 * El pozo del Deadlockdle vive en el sitio (`/deadlock/dle-pool.json`, lo arma
 * el build) y el Worker lo pide de ahí: así se actualiza solo con cada
 * publicación diaria, sin volver a publicar el Worker.
 *
 * Se guarda una hora en memoria. Si vestigo.gg no contesta, se sigue con la
 * última copia buena; sólo sin ninguna copia el juego no puede andar.
 */

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

export async function loadPool(url: string, fetcher: (url: string) => Promise<Response> = fetch, now = Date.now()): Promise<Pool> {
  if (cached && now - cached.at < TTL_MS) return cached.pool;
  try {
    const res = await fetcher(url);
    if (res.ok) {
      const pool = (await res.json()) as Pool;
      if (pool.heroes?.length && pool.items?.length && pool.abilities?.length) {
        cached = { pool, at: now };
        return pool;
      }
    }
  } catch (err) {
    console.error("dle: pozo", err);
  }
  if (cached) return cached.pool;
  throw new PoolUnavailable();
}
