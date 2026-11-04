import { compare, dayNumber, findByName, HINT_AT, hintsUnlocked, pickAnswer, utcDate } from "./logic";
import { PoolUnavailable } from "./pool";
import type { DayRow, Store } from "./store";
import { COLUMNS, MODES, type Entry, type Mode, type Pool } from "./types";

/**
 * Los endpoints del Deadlockdle (`/api/dle/*`). La respuesta del día no sale
 * del Worker hasta que alguien la acierta: la página sólo recibe colores.
 */

export interface DleDeps {
  store: Store;
  pool: () => Promise<Pool>;
  secret: string;
  now: number;
  steamId: string | null;
  /** false si hay que frenar (Workers Rate Limiting). */
  limit?: (key: string) => Promise<boolean>;
  /** Para el límite cuando no hay cuenta. */
  ip?: string;
  /** Trae un archivo del sitio (el arte de la pista borrosa). */
  asset?: (path: string) => Promise<Response>;
}

/** Un secreto corto o vacío dejaría adivinar la respuesta de mañana. */
const MIN_SECRET = 16;

const RANKING_TOP = 10;
const isMode = (m: string): m is Mode => (MODES as string[]).includes(m);
const prevDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export async function ensureDay(store: Store, pool: Pool, mode: Mode, date: string, secret: string): Promise<DayRow> {
  const have = await store.day(date, mode);
  if (have) return have;
  const answer = await pickAnswer(pool[mode], await store.lastSeen(mode, date), date, mode, secret);
  return store.saveDay({ date, mode, answer });
}

/** El cron de las 00:00 UTC: deja listas las tres respuestas del día. */
export async function runDaily(store: Store, pool: Pool, secret: string, now: number): Promise<void> {
  const date = utcDate(now);
  for (const mode of MODES) await ensureDay(store, pool, mode, date, secret);
}

const brief = (e: Entry) => ({ id: e.id, name: e.name, img: e.img });
const reveal = (e: Entry) => ({ id: e.id, name: e.name, img: e.img, link: e.link });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function handleDle(req: Request, url: URL, deps: DleDeps): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/dle/")) return null;
  const parts = url.pathname.slice("/api/dle/".length).split("/");
  if (deps.secret.length < MIN_SECRET) return json({ error: "not_configured" }, 503);
  try {
    if (req.method === "GET" && parts.length === 1 && parts[0] === "ranking") return await ranking(deps);
    if (req.method === "GET" && parts.length === 1 && parts[0] === "me") return await me(deps);
    if (parts.length === 2 && isMode(parts[0])) {
      if (req.method === "GET" && parts[1] === "today") return await today(parts[0], url, deps);
      if (req.method === "GET" && parts[1] === "hint") return await hintImage(parts[0], url, deps);
      if (req.method === "POST" && parts[1] === "guess") return await guess(parts[0], req, deps);
    }
    return json({ error: "not_found" }, 404);
  } catch (err) {
    if (err instanceof PoolUnavailable) return json({ error: "pool_unavailable" }, 503);
    throw err;
  }
}

/**
 * El día de la partida. Hoy, salvo que la página siga mostrando la de ayer
 * (`requested`) y esa partida exista sin terminar: así quien empezó a las 23:59
 * UTC la termina, y una abandonada no le tapa el día de hoy a nadie.
 */
async function playDate(mode: Mode, deps: DleDeps, requested: unknown): Promise<string> {
  const today = utcDate(deps.now);
  const yesterday = prevDay(today);
  if (requested !== yesterday) return today;
  if (!deps.steamId) return yesterday;
  const play = await deps.store.play(deps.steamId, mode, yesterday);
  return play && !play.finishedAt ? yesterday : today;
}

const hintSrc = (mode: Mode, date: string) => `/api/dle/${mode}/hint?d=${date}`;

/** Intentos hechos: de D1 con cuenta; sin cuenta, los que dice la página. */
function anonCount(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) ? Math.min(Math.max(0, Math.floor(n)), 1000) : 0;
}

async function today(mode: Mode, url: URL, deps: DleDeps): Promise<Response> {
  const pool = await deps.pool();
  const date = await playDate(mode, deps, url.searchParams.get("date"));
  const day = await ensureDay(deps.store, pool, mode, date, deps.secret);
  const play = deps.steamId ? await deps.store.play(deps.steamId, mode, date) : null;
  const byId = new Map(pool[mode].map((e) => [e.id, e]));
  const rows = (play?.guesses ?? [])
    .map((id) => (id === day.answer.id ? day.answer : byId.get(id)))
    .filter((e): e is Entry => Boolean(e))
    .map((e) => ({ guess: brief(e), cells: compare(e, day.answer, mode) }))
    .reverse();
  const solved = Boolean(play?.finishedAt);
  return json({
    number: dayNumber(date),
    date,
    mode,
    columns: COLUMNS[mode],
    rows,
    hints: hintsUnlocked(day.answer, play?.guesses.length ?? 0, hintSrc(mode, date)),
    solved,
    ...(solved ? { answer: reveal(day.answer) } : {}),
  });
}

async function guess(mode: Mode, req: Request, deps: DleDeps): Promise<Response> {
  if (deps.limit && !(await deps.limit(deps.steamId ?? deps.ip ?? "anon"))) return json({ error: "too_many" }, 429);
  const body = (await req.json().catch(() => null)) as { name?: unknown; date?: unknown; n?: unknown } | null;
  if (typeof body?.name !== "string") return json({ error: "bad_request" }, 400);
  const pool = await deps.pool();
  const entry = findByName(pool[mode], body.name);
  if (!entry) return json({ error: "unknown_name" }, 400);

  const date = await playDate(mode, deps, body.date);

  const day = await ensureDay(deps.store, pool, mode, date, deps.secret);
  const solved = entry.id === day.answer.id;
  let count: number;
  if (deps.steamId) {
    if ((await deps.store.addGuess(deps.steamId, mode, date, entry.id, deps.now, solved)) === "duplicate") return json({ error: "duplicate" }, 409);
    count = (await deps.store.play(deps.steamId, mode, date))?.guesses.length ?? 1;
  } else {
    count = anonCount(body.n) + 1;
  }
  return json({
    date,
    row: { guess: brief(entry), cells: compare(entry, day.answer, mode) },
    hints: hintsUnlocked(day.answer, count, hintSrc(mode, date)),
    solved,
    ...(solved ? { answer: reveal(day.answer) } : {}),
  });
}

/**
 * El arte de la respuesta para la pista borrosa, por una ruta que no dice cuál
 * es. Sólo con los intentos que abren esa pista; el borroso lo pone la página.
 */
async function hintImage(mode: Mode, url: URL, deps: DleDeps): Promise<Response> {
  const date = url.searchParams.get("d") ?? "";
  const today = utcDate(deps.now);
  if (date !== today && date !== prevDay(today)) return json({ error: "not_found" }, 404);
  const day = await deps.store.day(date, mode);
  if (!day || !deps.asset) return json({ error: "not_found" }, 404);
  const count = deps.steamId ? ((await deps.store.play(deps.steamId, mode, date))?.guesses.length ?? 0) : anonCount(url.searchParams.get("n"));
  if (count < HINT_AT[0]) return json({ error: "locked" }, 403);
  const res = await deps.asset(day.answer.img);
  if (!res.ok) return json({ error: "not_found" }, 404);
  return new Response(res.body, { headers: { "content-type": "image/webp", "cache-control": "private, no-store" } });
}

async function ranking(deps: DleDeps): Promise<Response> {
  const date = utcDate(deps.now);
  const modes: Record<string, unknown> = {};
  for (const mode of MODES) {
    const top = await deps.store.ranking(date, mode, RANKING_TOP);
    let mine = null;
    if (deps.steamId) {
      const pos = await deps.store.myRank(deps.steamId, date, mode);
      const play = pos ? await deps.store.play(deps.steamId, mode, date) : null;
      if (pos && play?.finishedAt) mine = { pos, guesses: play.guesses.length, ms: play.finishedAt - play.startedAt };
    }
    modes[mode] = {
      players: await deps.store.playerCount(date, mode),
      top: top.map((r, i) => ({ pos: i + 1, name: r.name, avatar: r.avatar, guesses: r.guesses, ms: r.ms })),
      me: mine,
    };
  }
  return json({ date, number: dayNumber(date), modes });
}

async function me(deps: DleDeps): Promise<Response> {
  if (!deps.steamId) return json({ error: "signed_out" }, 401);
  const date = utcDate(deps.now);
  const out: Record<string, unknown> = {};
  for (const mode of MODES) {
    const stats = await deps.store.myStats(deps.steamId, mode, date);
    const play = await deps.store.play(deps.steamId, mode, date);
    out[mode] = { ...stats, today: play ? (play.finishedAt ? "solved" : "playing") : "none" };
  }
  return json(out);
}
