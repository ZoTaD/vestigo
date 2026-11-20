/**
 * Seguidos y "Soy yo" (2026-11-20): `GET/PUT /api/follows?game=aoe2`. Con sesión de Steam; sin ella, 401 (el sitio
 * guarda en el navegador). El PUT reemplaza todo y sólo se acepta desde nuestro origen.
 */
import type { FollowStore, Follows } from "./store";

export const MAX_FOLLOWS = 200;
const GAMES = new Set(["aoe2"]);

export interface FollowsDeps {
  store: FollowStore;
  steamId: string | null;
  siteOrigin: string;
  now?: number;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const id = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v < 1e12;

/** Valida el cuerpo del PUT: `me` (id o null) y `follows` (ids, sin repetidos, hasta el tope). */
function limpiar(body: unknown): Follows | null {
  if (!body || typeof body !== "object") return null;
  const { me, follows } = body as { me?: unknown; follows?: unknown };
  if (me != null && !id(me)) return null;
  if (!Array.isArray(follows) || !follows.every(id)) return null;
  const unicos = [...new Set(follows)];
  if (unicos.length > MAX_FOLLOWS) return null;
  return { me: me ?? null, follows: unicos };
}

export async function handleFollows(req: Request, url: URL, deps: FollowsDeps): Promise<Response | null> {
  if (url.pathname !== "/api/follows") return null;
  const game = url.searchParams.get("game") ?? "";
  if (!GAMES.has(game)) return json({ error: "game" }, 400);
  if (!deps.steamId) return json({ error: "auth" }, 401);
  if (req.method === "GET") return json(await deps.store.get(deps.steamId, game));
  if (req.method === "PUT") {
    if (req.headers.get("origin") !== deps.siteOrigin) return json({ error: "origin" }, 403);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "body" }, 400);
    }
    const f = limpiar(body);
    if (!f) return json({ error: "body" }, 400);
    await deps.store.save(deps.steamId, game, f, deps.now ?? Date.now());
    return json(f);
  }
  return json({ error: "method" }, 405);
}
