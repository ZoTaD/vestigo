/**
 * Seguidos (2026-11-20): `GET/PUT /api/follows?game=aoe2`. El "Soy yo" a mano salió el 2026-11-26: el perfil propio
 * sale del SteamID de la sesión, así nadie puede decir que es otro. Con sesión de Steam; sin ella, 401 (el sitio
 * guarda en el navegador). El PUT reemplaza todo y sólo se acepta desde nuestro origen.
 */
import type { FollowStore, Follows } from "./store";

export const MAX_FOLLOWS = 200;
/** 200 ids de 12 cifras entran holgados en 4 KB; más que 16 KB no es un cuerpo nuestro. */
const MAX_CUERPO = 16 * 1024;
const GAMES = new Set(["aoe2"]);

export interface FollowsDeps {
  store: FollowStore;
  steamId: string | null;
  siteOrigin: string;
  now?: number;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const id = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v < 1e12;

/** Valida el cuerpo del PUT: `follows` (ids, sin repetidos, hasta el tope). */
function limpiar(body: unknown): Follows | null {
  if (!body || typeof body !== "object") return null;
  const { follows } = body as { follows?: unknown };
  if (!Array.isArray(follows) || !follows.every(id)) return null;
  const unicos = [...new Set(follows)];
  if (unicos.length > MAX_FOLLOWS) return null;
  return { follows: unicos };
}

export async function handleFollows(req: Request, url: URL, deps: FollowsDeps): Promise<Response | null> {
  if (url.pathname !== "/api/follows") return null;
  const game = url.searchParams.get("game") ?? "";
  if (!GAMES.has(game)) return json({ error: "game" }, 400);
  if (!deps.steamId) return json({ error: "auth" }, 401);
  if (req.method === "GET") return json(await deps.store.get(deps.steamId, game));
  if (req.method === "PUT") {
    if (req.headers.get("origin") !== deps.siteOrigin) return json({ error: "origin" }, 403);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_CUERPO) return json({ error: "size" }, 413);
    let body: unknown;
    try {
      const texto = await req.text();
      if (texto.length > MAX_CUERPO) return json({ error: "size" }, 413);
      body = JSON.parse(texto);
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
