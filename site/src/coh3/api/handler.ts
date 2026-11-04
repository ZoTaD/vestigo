/**
 * El intermediario de CoH3 (2026-11-04): `/api/coh3/*` le pide a la API de Relic (que no manda CORS) y devuelve JSON
 * chico. La función de Netlify (`netlify/functions/coh3.mts`) y el plugin de dev de Vite llaman a `handleCoh3`.
 *
 * - `leaderboard?id=<leaderboard>&start=1&count=50[&region=<id>]` → `{total, rows}`.
 * - `player?id=<profile>` → `{profile, standings, matches}` (historial reciente recortado: de ~1,8 MB a decenas de KB).
 * - `match?id=<partida>&player=<profile>` → la partida del historial de ese jugador, con todos los counters.
 * - `search?q=<alias>` → `{results}`: Relic busca por alias exacto (con mayúsculas), no por prefijo. Un SteamID64
 *   (`7656…`, 17 cifras) se busca como perfil de Steam.
 *
 * Errores: 400 parámetros, 404 no existe, 502 si Relic falla (`upstream` = estado HTTP o `result.code` de Relic).
 * La CDN guarda las respuestas; no se registra nada (ni alias ni ids).
 */
import { leaderboardById, REGIONS } from "./leaderboards";
import {
  findByAlias,
  findBySteamId,
  getLeaderboard,
  getPersonalStat,
  getRecentMatches,
  normalizeHistory,
  normalizeLeaderboard,
  normalizeMatch,
  normalizePersonal,
  normalizeSearch,
  RELIC_UNKNOWN_ALIASES,
  RELIC_UNKNOWN_PROFILE_IDS,
  RelicError,
} from "./relic";

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });

/** Navegador `max-age` segundos; la CDN, `cdn` segundos con una sola copia (`durable`) y algo de margen viejo. */
const cache = (max: number, cdn: number) => ({
  "Cache-Control": `public, max-age=${max}`,
  "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${cdn}, stale-while-revalidate=${cdn * 2}`,
});

const bad = (why: string) => json({ error: "bad", why }, 400, { "Cache-Control": "public, max-age=300" });
const notFound = () => json({ error: "notfound" }, 404, cache(60, 60));
/** Una falla también queda un rato en la CDN: si no, con Relic caído cada visita le volvería a pedir. */
const fail = (upstream: number) =>
  json({ error: "upstream", upstream }, 502, { "Cache-Control": "no-store", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=30" });

/** Un entero en [min, max], o null. Sin parámetro, `def`. */
function entero(v: string | null, def: number | null, min: number, max: number): number | null {
  if (v == null || v === "") return def;
  if (!/^\d{1,12}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

const ID_MAX = 1e10;

async function leaderboard(p: URLSearchParams, f: typeof fetch) {
  const id = entero(p.get("id"), null, 1, ID_MAX);
  if (id == null || !leaderboardById(id)) return bad("id");
  const start = entero(p.get("start"), 1, 1, 100_000);
  if (start == null) return bad("start");
  const count = entero(p.get("count"), 50, 1, 200);
  if (count == null) return bad("count");
  const region = entero(p.get("region"), null, 1, ID_MAX);
  if (p.get("region") && (region == null || !REGIONS[region])) return bad("region");
  const raw = await getLeaderboard(f, id, start, count, region ?? undefined);
  return json({ id, start, ...normalizeLeaderboard(raw, region != null) }, 200, cache(60, 60));
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
  const jugador = entero(p.get("player"), null, 1, ID_MAX);
  if (jugador == null) return bad("player");
  const m = normalizeMatch(await getRecentMatches(f, jugador), id);
  // Una partida terminada no cambia: se guarda una hora (si ya salió del historial, el 404 se guarda poco).
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

export async function handleCoh3(url: URL, fetcher: typeof fetch = fetch, method = "GET"): Promise<Response> {
  if (method !== "GET" && method !== "HEAD") return json({ error: "method" }, 405, { Allow: "GET, HEAD" });
  const ruta = /^\/api\/coh3\/([a-z]+)\/?$/.exec(url.pathname)?.[1];
  const fn = ruta && Object.hasOwn(RUTAS, ruta) ? RUTAS[ruta] : undefined;
  if (!fn) return notFound();
  try {
    return await fn(url.searchParams, fetcher);
  } catch (e) {
    if (e instanceof RelicError) return e.upstream === RELIC_UNKNOWN_PROFILE_IDS ? notFound() : fail(e.upstream);
    return fail(0);
  }
}
