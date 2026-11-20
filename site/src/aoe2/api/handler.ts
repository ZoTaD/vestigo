/**
 * El intermediario de Age of Empires II (2026-11-20): `/api/aoe2/*` le pide a la API de World's Edge (que no manda
 * CORS) y devuelve JSON chico. Lo llaman la función de Netlify (`netlify/functions/aoe2.mts`) y el plugin de dev de Vite.
 *
 * - `leaderboard?id=<ranking>&start=1&count=50` → `{ id, start, total, rows }`.
 * - `player?id=<perfil>` → `{ profile, standings, matches }`.
 * - `match?id=<partida>&p=<perfil>` → la partida, buscada en el historial de ese jugador (la API no tiene "partida por id").
 * - `search?q=<alias exacto o SteamID64>` → `{ q, results }`.
 *
 * Errores: 400 parámetros, 404 no existe, 502 si la API falla o no contesta en 7 s. No registra nada.
 */
import { bad, cache, entero, fail, json, notFound } from "../../coh3/api/handler";
import { RELIC_UNKNOWN_ALIASES, RELIC_UNKNOWN_PROFILE_IDS, RelicError } from "../../coh3/api/relic";
import {
  findByAlias,
  findBySteamId,
  getLeaderboard,
  getPersonalStat,
  getRecentMatches,
  isLeaderboard,
  normalizeHistory,
  normalizeLeaderboard,
  normalizeMatch,
  normalizePersonal,
  normalizeSearch,
} from "./wel";

const ID_MAX = 1e10;
/** "Perfil desconocido": 6 en `GetPersonalStat` y 7 en `getRecentMatchHistory` (los dos dicen UNKNOWN_PROFILE_IDS, 20/11). */
const DESCONOCIDO = new Set([RELIC_UNKNOWN_PROFILE_IDS, 7]);

async function leaderboard(p: URLSearchParams, f: typeof fetch) {
  const id = entero(p.get("id"), null, 1, 1000);
  if (id == null || !isLeaderboard(id)) return bad("id");
  const start = entero(p.get("start"), 1, 1, 200_000);
  if (start == null) return bad("start");
  const count = entero(p.get("count"), 50, 1, 200);
  if (count == null) return bad("count");
  return json({ id, start, ...normalizeLeaderboard(await getLeaderboard(f, id, start, count)) }, 200, cache(60, 60));
}

async function player(p: URLSearchParams, f: typeof fetch) {
  const id = entero(p.get("id"), null, 1, ID_MAX);
  if (id == null) return bad("id");
  const [stat, hist] = await Promise.all([getPersonalStat(f, id), getRecentMatches(f, id)]);
  const personal = normalizePersonal(stat, id);
  if (!personal) return notFound();
  return json({ ...personal, matches: normalizeHistory(hist) }, 200, cache(60, 60));
}

async function match(p: URLSearchParams, f: typeof fetch) {
  const id = entero(p.get("id"), null, 1, ID_MAX);
  if (id == null) return bad("id");
  const jugador = entero(p.get("p"), null, 1, ID_MAX);
  if (jugador == null) return bad("p");
  const m = normalizeMatch(await getRecentMatches(f, jugador), id);
  // Una partida terminada no cambia: se guarda una hora.
  return m ? json(m, 200, cache(3600, 3600)) : notFound();
}

async function search(p: URLSearchParams, f: typeof fetch) {
  const q = (p.get("q") ?? "").trim();
  if (!q || q.length > 64 || /[\u0000-\u001f]/.test(q)) return bad("q");
  try {
    const raw = /^7656\d{13}$/.test(q) ? await findBySteamId(f, q) : await findByAlias(f, q);
    return json({ q, results: normalizeSearch(raw) }, 200, cache(300, 300));
  } catch (e) {
    if (e instanceof RelicError && e.upstream === RELIC_UNKNOWN_ALIASES) return json({ q, results: [] }, 200, cache(300, 300));
    throw e;
  }
}

const RUTAS: Record<string, (p: URLSearchParams, f: typeof fetch) => Promise<Response>> = { leaderboard, player, match, search };

export async function handleAoe2(url: URL, fetcher: typeof fetch = fetch, method = "GET"): Promise<Response> {
  if (method !== "GET" && method !== "HEAD") return json({ error: "method" }, 405, { Allow: "GET, HEAD" });
  const ruta = /^\/api\/aoe2\/([a-z]+)\/?$/.exec(url.pathname)?.[1];
  const fn = ruta && Object.hasOwn(RUTAS, ruta) ? RUTAS[ruta] : undefined;
  if (!fn) return notFound();
  try {
    return await fn(url.searchParams, fetcher);
  } catch (e) {
    if (e instanceof RelicError) return DESCONOCIDO.has(e.upstream) ? notFound() : fail(e.upstream);
    return fail(0);
  }
}
