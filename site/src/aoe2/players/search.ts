/**
 * Los pedidos del buscador y de los seguidos de AoE2 (2026-11-21), separados de la vista para distinguir "no hay" de
 * "la API no contesta". Tests en `test/aoe2Search.test.ts`.
 */
import type { SearchResult } from "../api/wel";

type Fetch = (url: string) => Promise<Response>;
export type Seguido = { id: number; alias: string; elo: number | null };

/** Los perfiles con ese nombre exacto o SteamID64; `[]` si no hay (o si el texto no vale), `null` si la API está caída. */
export async function buscarPerfiles(q: string, f: Fetch = fetch): Promise<SearchResult[] | null> {
  try {
    const r = await f(`/api/aoe2/search?q=${encodeURIComponent(q)}`);
    if (r.status === 400) return [];
    if (!r.ok) return null;
    return ((await r.json()) as { results: SearchResult[] }).results;
  } catch {
    return null;
  }
}

/** Alias y ELO de 1v1 de unos perfiles (`ids` separados por coma); `null` si la API está caída. */
export async function pedirSeguidos(ids: string, f: Fetch = fetch): Promise<Seguido[] | null> {
  try {
    const r = await f(`/api/aoe2/players?ids=${ids}`);
    if (!r.ok) return null;
    return ((await r.json()) as { players: Seguido[] }).players;
  } catch {
    return null;
  }
}
