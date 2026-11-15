import { isOffensive } from "../../../games/deadlock/pipeline/src/communityBuildsCore";
import type { BuildStore } from "./store";

/**
 * Las builds subidas a Vestigo (`/api/builds*`), 2026-11-15. Plan:
 * `docs/plans/2026-11-15-builds-comunidad-plan.md`.
 *
 * La build vive en el juego: Valve no deja publicar desde afuera. Acá se
 * guarda quién la subió y lo que suma Vestigo (etiquetas y una nota). **La
 * autoría se comprueba en el servidor**: al subir se piden las builds de la
 * cuenta de la sesión al juego, y sólo entra una que sea de esa cuenta. Lo que
 * mande la página sobre el autor no cuenta.
 */

/** Una build del juego, lo justo para listar las tuyas y comprobar el autor. */
export interface GameBuild {
  buildId: number;
  heroId: number;
  author: number;
  name: string;
  version: number;
  updated: number;
}

export interface BuildsDeps {
  store: BuildStore;
  /** La cuenta de Deadlock de la sesión (SteamID64 − base), o null sin sesión. */
  accountId: number | null;
  /** Las builds publicadas en el juego por esa cuenta. */
  gameBuilds: (accountId: number) => Promise<GameBuild[]>;
  now: number;
  siteOrigin: string;
  /** false si hay que frenar (Workers Rate Limiting). */
  limit?: (key: string) => Promise<boolean>;
}

/** Las etiquetas que suma Vestigo: lo que el juego no dice de una build. */
export const TAGS = ["beginner", "lane", "aggressive", "tank", "support", "late", "anti-spirit", "anti-gun", "fun"] as const;
export const MAX_TAGS = 4;
export const NOTE_MAX = 200;
/** Cuántas builds puede tener subidas una cuenta: frena el spam, no a la gente. */
export const MAX_PER_ACCOUNT = 30;
const HERO_LIST_MAX = 60;

function json(body: unknown, status = 200, cache = "no-store"): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": cache } });
}

/** Texto plano de una línea o dos: sin HTML ni caracteres de control. */
export function cleanNote(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, NOTE_MAX);
}

export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((t): t is string => typeof t === "string" && (TAGS as readonly string[]).includes(t)))].slice(0, MAX_TAGS);
}

const isId = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0 && n < 2 ** 31;

export async function handleBuilds(req: Request, url: URL, deps: BuildsDeps): Promise<Response | null> {
  const p = url.pathname;
  if (p !== "/api/builds" && !p.startsWith("/api/builds/")) return null;
  const rest = p.slice("/api/builds".length).replace(/^\//, "");

  if (req.method === "GET" && rest === "") return byHero(url, deps);
  if (req.method === "GET" && rest === "published") return published(deps);
  if (req.method === "GET" && rest === "mine") return mine(deps);
  if (req.method === "POST" && rest === "") return publish(req, deps);
  if (req.method === "DELETE" && /^\d+$/.test(rest)) return remove(req, Number(rest), deps);
  return json({ error: "not_found" }, 404);
}

async function byHero(url: URL, deps: BuildsDeps): Promise<Response> {
  const hero = Number(url.searchParams.get("hero"));
  if (!isId(hero)) return json({ error: "hero" }, 400);
  const rows = await deps.store.byHero(hero, HERO_LIST_MAX);
  // Cinco minutos en el borde: una subida aparece enseguida sin pegarle a D1 en cada visita.
  return json(
    {
      builds: rows.map((r) => ({
        id: r.buildId,
        hero: r.heroId,
        author: r.accountId,
        authorName: r.authorName,
        authorAvatar: r.authorAvatar,
        name: r.name,
        tags: r.tags,
        note: r.note,
        created: r.createdAt,
        updated: r.updatedAt,
      })),
    },
    200,
    "public, max-age=300",
  );
}

async function published(deps: BuildsDeps): Promise<Response> {
  const rows = await deps.store.all();
  return json({ builds: rows.map((r) => ({ hero: r.heroId, id: r.buildId })) }, 200, "public, max-age=600");
}

async function mine(deps: BuildsDeps): Promise<Response> {
  if (deps.accountId === null) return json({ error: "signed_out" }, 401);
  const [game, subidas] = await Promise.all([gameBuildsOf(deps), deps.store.byAccount(deps.accountId)]);
  if (game === null) return json({ error: "game_unavailable", published: subidas.map(view) }, 503);
  return json({ game, published: subidas.map(view) });
}

const view = (r: { buildId: number; heroId: number; name: string; tags: string[]; note: string; createdAt: number; updatedAt: number }) => ({
  id: r.buildId,
  hero: r.heroId,
  name: r.name,
  tags: r.tags,
  note: r.note,
  created: r.createdAt,
  updated: r.updatedAt,
});

/** null si el juego no contesta: no es lo mismo que "no tenés builds". */
async function gameBuildsOf(deps: BuildsDeps): Promise<GameBuild[] | null> {
  try {
    return (await deps.gameBuilds(deps.accountId!)).filter((b) => b.author === deps.accountId);
  } catch (err) {
    console.error("gameBuilds", err);
    return null;
  }
}

/** SameSite=Lax ya frena el POST de otro sitio; esto es la segunda llave. */
const sameOrigin = (req: Request, deps: BuildsDeps) => req.headers.get("origin") === deps.siteOrigin;

async function publish(req: Request, deps: BuildsDeps): Promise<Response> {
  if (deps.accountId === null) return json({ error: "signed_out" }, 401);
  if (!sameOrigin(req, deps)) return json({ error: "origin" }, 403);
  if (deps.limit && !(await deps.limit(`builds:${deps.accountId}`))) return json({ error: "slow_down" }, 429);
  let body: { id?: unknown; tags?: unknown; note?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "body" }, 400);
  }
  if (!isId(body.id)) return json({ error: "id" }, 400);
  const note = cleanNote(body.note);
  // La nota se ve en una página pública que se promociona: con insultos no entra.
  if (isOffensive(note)) return json({ error: "note" }, 400);

  const game = await gameBuildsOf(deps);
  if (game === null) return json({ error: "game_unavailable" }, 503);
  const build = game.find((b) => b.buildId === body.id);
  // Puede no ser tuya o ser tan nueva que el juego todavía no la muestra.
  if (!build) return json({ error: "not_yours" }, 403);

  const prev = await deps.store.get(build.buildId);
  if (prev && prev.accountId !== deps.accountId) return json({ error: "not_yours" }, 403);
  if (!prev && (await deps.store.byAccount(deps.accountId)).length >= MAX_PER_ACCOUNT) return json({ error: "too_many" }, 409);

  const saved = await deps.store.save({
    buildId: build.buildId,
    heroId: build.heroId,
    accountId: deps.accountId,
    name: build.name.slice(0, 80),
    tags: cleanTags(body.tags),
    note,
    createdAt: deps.now,
    updatedAt: deps.now,
  });
  return json({ ok: true, build: view(saved) }, prev ? 200 : 201);
}

async function remove(req: Request, id: number, deps: BuildsDeps): Promise<Response> {
  if (deps.accountId === null) return json({ error: "signed_out" }, 401);
  if (!sameOrigin(req, deps)) return json({ error: "origin" }, 403);
  const ok = await deps.store.remove(id, deps.accountId);
  return ok ? json({ ok: true }) : json({ error: "not_found" }, 404);
}

/* ── El juego, por deadlock-api ─────────────────────────────────────── */

interface RawGameBuild {
  hero_build: {
    hero_id: number;
    hero_build_id: number;
    author_account_id: number;
    name: string;
    version: number;
    last_updated_timestamp: number;
  };
}

const toGame = (r: RawGameBuild): GameBuild => ({
  buildId: r.hero_build.hero_build_id,
  heroId: r.hero_build.hero_id,
  author: r.hero_build.author_account_id,
  name: (r.hero_build.name ?? "").trim(),
  version: r.hero_build.version,
  updated: r.hero_build.last_updated_timestamp,
});

/**
 * Las builds de una cuenta: primero en vivo del juego (`by-author`, trae las
 * recién publicadas) y, si no contesta o viene vacía, las que deadlock-api ya
 * tiene guardadas. Sólo la última versión de cada una.
 */
export function deadlockApiGameBuilds(fetcher: typeof fetch = fetch, base = "https://api.deadlock-api.com/v1") {
  return async (accountId: number): Promise<GameBuild[]> => {
    const pedir = async (path: string) => {
      const res = await fetcher(`${base}/${path}`, { headers: { "user-agent": "vestigo.gg" } });
      if (!res.ok) throw new Error(`${path.split("?")[0]} ${res.status}`);
      return ((await res.json()) as RawGameBuild[]).filter((r) => r?.hero_build);
    };
    let rows: RawGameBuild[] = [];
    try {
      rows = await pedir(`builds/by-author/${accountId}`);
    } catch (err) {
      console.error("by-author", err);
    }
    if (rows.length === 0) rows = await pedir(`builds?author_id=${accountId}&only_latest=true&limit=100`);
    const ultima = new Map<number, GameBuild>();
    for (const b of rows.map(toGame)) {
      const prev = ultima.get(b.buildId);
      if (!prev || b.version > prev.version) ultima.set(b.buildId, b);
    }
    return [...ultima.values()].sort((a, b) => b.updated - a.updated);
  };
}
