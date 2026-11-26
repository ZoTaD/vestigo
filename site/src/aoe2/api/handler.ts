/**
 * El intermediario de Age of Empires II (2026-11-20): `/api/aoe2/*` le pide a la API de World's Edge (que no manda
 * CORS) y devuelve JSON chico. Lo llaman la función de Netlify (`netlify/functions/aoe2.mts`) y el plugin de dev de Vite.
 *
 * - `leaderboard?id=<ranking>&start=1&count=50` → `{ id, start, total, rows }`.
 * - `player?id=<perfil>` → `{ profile, standings, matches }`.
 * - `match?id=<partida>&p=<perfil>` → la partida, buscada en el historial de ese jugador (la API no tiene "partida por id").
 * - `search?q=<alias exacto o SteamID64>` → `{ q, results }`.
 * - `players?ids=<id,id,…>` (hasta 50) → `{ players: [{ id, alias, country, elo }] }`, para los seguidos.
 * - `opening?id=<partida>&p=<perfil>` → `{ id, players: { <perfil>: <apertura> } }`: baja la grabación (≤ 32 MB, 8 s) y
 *   lee las aperturas; se guarda 30 días porque no cambia.
 * - `analysis?id=<partida>&p=<perfil>` → `{ id, players: { <perfil>: Analisis } }`: apertura, APM, clics de edad y unidades
 *   (`analysis.ts`), de la grabación entera; también 30 días.
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
  getPersonalStats,
  getRecentMatches,
  isLeaderboard,
  normalizeHistory,
  normalizeLeaderboard,
  normalizeMatch,
  normalizePersonal,
  normalizeFichas,
  normalizeSearch,
  type Aoe2Match,
} from "./wel";
import { decodeOptions, namedOptions } from "../matches/options";
import { readActions } from "./replay";
import { openings } from "./openings";
import { analizarGrabacion } from "./analysis";
import { slotsOf } from "./slots";
import { MAX_GRABACION, unzipFirst } from "./zip";

/** Las opciones decodificadas en lugar del base64 crudo. */
const conOpciones = (m: Aoe2Match): Aoe2Match => ({ ...m, ...namedOptions(decodeOptions(m.options ?? "")), options: null });

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
  return json({ ...personal, matches: normalizeHistory(hist).map(conOpciones) }, 200, cache(60, 60));
}

async function match(p: URLSearchParams, f: typeof fetch) {
  const id = entero(p.get("id"), null, 1, ID_MAX);
  if (id == null) return bad("id");
  const jugador = entero(p.get("p"), null, 1, ID_MAX);
  if (jugador == null) return bad("p");
  const m = normalizeMatch(await getRecentMatches(f, jugador), id);
  // Una partida terminada no cambia: se guarda una hora.
  return m ? json(conOpciones(m), 200, cache(3600, 3600)) : notFound();
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

/**
 * La apertura de cada jugador de una partida: baja la grabación (la sube el juego; puede tardar unos minutos en estar o
 * haber vencido), lee las acciones y clasifica. El número de jugador de la grabación se cruza con el perfil por el
 * `slotinfo` del historial de `p`. La respuesta no cambia nunca: se guarda 30 días.
 */
async function opening(p: URLSearchParams, f: typeof fetch) {
  const r = await grabacion(p, f);
  if (r instanceof Response) return r;
  const porLugar = openings(readActions(r.datos));
  const players = Object.fromEntries(Object.entries(r.lugares).filter(([, lugar]) => porLugar[lugar]).map(([perfil, lugar]) => [perfil, porLugar[lugar]]));
  return json({ id: r.id, players }, 200, cache(86400 * 30, 86400 * 30));
}

/**
 * `analysis?id=<partida>&p=<perfil>` (2026-11-26): lo mismo que `opening` más APM, clics de edad y unidades entrenadas de
 * cada jugador (`analysis.ts`), leyendo la grabación entera. `{ id, players: { <perfil>: Analisis } }`, guardado 30 días.
 */
async function analysis(p: URLSearchParams, f: typeof fetch) {
  const r = await grabacion(p, f);
  if (r instanceof Response) return r;
  const porLugar = analizarGrabacion(r.datos);
  const players = Object.fromEntries(Object.entries(r.lugares).filter(([, lugar]) => porLugar[lugar]).map(([perfil, lugar]) => [perfil, porLugar[lugar]]));
  return json({ id: r.id, players }, 200, cache(86400 * 30, 86400 * 30));
}

/** La grabación de una partida y qué lugar ocupa cada perfil, o la respuesta de error que corresponde. */
async function grabacion(p: URLSearchParams, f: typeof fetch): Promise<Response | { id: number; datos: Uint8Array; lugares: Record<string, number> }> {
  // Sólo `id` y `p`: otro parámetro haría una dirección nueva para la CDN y una bajada de ~1 MB más.
  if ([...p.keys()].some((k) => k !== "id" && k !== "p")) return bad("params");
  const id = entero(p.get("id"), null, 1, ID_MAX);
  const jugador = entero(p.get("p"), null, 1, ID_MAX);
  if (id == null || jugador == null) return bad("id");
  const [hist, rec] = await Promise.all([
    getRecentMatches(f, jugador).catch(() => null),
    f(`https://aoe.ms/replay/?gameId=${id}&profileId=${jugador}`, { signal: AbortSignal.timeout(8000), redirect: "follow" }).catch(() => null),
  ]);
  // Sin historial no se sabe quién es quién: falla corta, no un resultado vacío guardado un mes.
  if (!hist) return fail(0);
  const slot = hist.matchHistoryStats.find((m) => m.id === id)?.slotinfo;
  if (!slot) return notFound();
  // El servidor de grabaciones corta con 429 si se le pide mucho seguido (medido el 26/11): eso, o que no conteste, es
  // una falla pasajera, no "no hay grabación" (el 404 la página no lo vuelve a pedir).
  if (!rec || rec.status === 429 || rec.status >= 500) return fail(rec?.status ?? 0);
  if (!rec.ok) return notFound();
  if (Number(rec.headers.get("content-length") ?? 0) > MAX_GRABACION) return notFound();
  const datos = unzipFirst(new Uint8Array(await rec.arrayBuffer()));
  if (!datos) return notFound();
  return { id, datos, lugares: slotsOf(slot) };
}

/** `players?ids=1,2,3` (hasta 50): alias, país, ratings y última partida de cada uno (los seguidos de la portada y los
 * resultados del buscador). `elo` es el de mapa aleatorio 1v1. */
async function players(p: URLSearchParams, f: typeof fetch) {
  const ids = (p.get("ids") ?? "").split(",").filter(Boolean);
  if (!ids.length || ids.length > 50 || !ids.every((x) => /^\d{1,12}$/.test(x))) return bad("ids");
  const out = normalizeFichas(await getPersonalStats(f, ids.map(Number)), ids.map(Number)).map((x) => ({
    ...x,
    elo: x.ratings.find((r) => r.leaderboard === 3)?.elo ?? null,
  }));
  return json({ players: out }, 200, cache(300, 300));
}

const RUTAS: Record<string, (p: URLSearchParams, f: typeof fetch) => Promise<Response>> = { leaderboard, player, players, match, search, opening, analysis };

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
