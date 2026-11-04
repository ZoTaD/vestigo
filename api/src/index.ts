import { accountIdOf, checkAuthBody, claimedSteamId, isValidResponse, loginUrl, safeReturn, STEAM_OPENID } from "./steam";

/**
 * La API de vestigo.gg: por ahora, sólo el login con Steam.
 *
 * Netlify le reenvía `vestigo.gg/api/*` (ver `netlify.toml`), así que para el
 * navegador todo pasa en nuestro dominio: la cookie es nuestra y no hay CORS.
 * Por eso las direcciones se arman con `SITE_ORIGIN` y no con la del pedido,
 * que llega con el `*.workers.dev` del Worker.
 */

export interface Env {
  DB: D1Database;
  SITE_ORIGIN: string;
  STEAM_API_KEY: string;
}

const SESSION_COOKIE = "vg_session";
/** Legible por la página: sólo dice "hay sesión", para no preguntar /api/me en cada visita. */
const HINT_COOKIE = "vg_in";
const SESSION_DAYS = 30;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (req.method === "GET" && url.pathname === "/api/auth/steam") {
        return redirect(loginUrl(env.SITE_ORIGIN, url.searchParams.get("return") ?? "/"));
      }
      if (req.method === "GET" && url.pathname === "/api/auth/steam/callback") return await callback(url, env);
      if (req.method === "GET" && url.pathname === "/api/me") return await me(req, env);
      if (req.method === "POST" && url.pathname === "/api/auth/logout") return await logout(req, env);
      return json({ error: "not_found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "server" }, 500);
    }
  },
};

async function callback(url: URL, env: Env): Promise<Response> {
  const back = safeReturn(url.searchParams.get("r"));
  const fail = () => redirect(`${env.SITE_ORIGIN}${back}`, clearCookies());

  const steamId = claimedSteamId(url.searchParams, env.SITE_ORIGIN);
  if (!steamId) return fail();

  // La firma la confirma Steam: sin esto, cualquiera podría inventar un claimed_id.
  const check = await fetch(STEAM_OPENID, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: checkAuthBody(url.searchParams),
  });
  if (!check.ok || !isValidResponse(await check.text())) return fail();

  const profile = await steamProfile(steamId, env.STEAM_API_KEY);
  const now = Date.now();
  await env.DB.prepare(
    `insert into users (steam_id, name, avatar, created_at, seen_at) values (?1, ?2, ?3, ?4, ?4)
     on conflict(steam_id) do update set name = ?2, avatar = ?3, seen_at = ?4`,
  )
    .bind(steamId, profile.name, profile.avatar, now)
    .run();

  const token = randomToken();
  const expires = now + SESSION_DAYS * 86_400_000;
  await env.DB.batch([
    env.DB.prepare("delete from sessions where expires_at < ?1").bind(now),
    env.DB.prepare("insert into sessions (token_hash, steam_id, expires_at) values (?1, ?2, ?3)").bind(
      await sha256(token),
      steamId,
      expires,
    ),
  ]);

  const maxAge = SESSION_DAYS * 86_400;
  return redirect(`${env.SITE_ORIGIN}${back}`, [
    cookie(SESSION_COOKIE, token, { maxAge, httpOnly: true, path: "/api" }),
    cookie(HINT_COOKIE, "1", { maxAge, httpOnly: false, path: "/" }),
  ]);
}

async function me(req: Request, env: Env): Promise<Response> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return json({ error: "signed_out" }, 401, clearCookies());
  const row = await env.DB.prepare(
    `select u.steam_id, u.name, u.avatar from sessions s join users u on u.steam_id = s.steam_id
     where s.token_hash = ?1 and s.expires_at > ?2`,
  )
    .bind(await sha256(token), Date.now())
    .first<{ steam_id: string; name: string; avatar: string }>();
  if (!row) return json({ error: "signed_out" }, 401, clearCookies());
  return json({ steamId: row.steam_id, accountId: accountIdOf(row.steam_id), name: row.name, avatar: row.avatar }, 200);
}

async function logout(req: Request, env: Env): Promise<Response> {
  // SameSite=Lax ya frena el POST de otro sitio; esto es la segunda llave.
  if (req.headers.get("origin") !== env.SITE_ORIGIN) return json({ error: "origin" }, 403);
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await env.DB.prepare("delete from sessions where token_hash = ?1").bind(await sha256(token)).run();
  return json({ ok: true }, 200, clearCookies());
}

/**
 * Nombre y foto, de la API de Steam. Si falla, se entra igual con lo mínimo:
 * el ID ya está confirmado y la foto se corrige en el próximo login.
 */
async function steamProfile(steamId: string, key: string): Promise<{ name: string; avatar: string }> {
  try {
    const q = new URLSearchParams({ key, steamids: steamId });
    const res = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?${q}`);
    if (res.ok) {
      const data = (await res.json()) as { response?: { players?: { personaname?: string; avatarfull?: string }[] } };
      const p = data.response?.players?.[0];
      const avatar = p?.avatarfull ?? "";
      if (p?.personaname) {
        return { name: p.personaname.slice(0, 64), avatar: /^https:\/\/avatars\.steamstatic\.com\//.test(avatar) ? avatar : "" };
      }
    }
  } catch (err) {
    console.error("GetPlayerSummaries", err);
  }
  return { name: "Steam user", avatar: "" };
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}

function cookie(name: string, value: string, o: { maxAge: number; httpOnly: boolean; path: string }): string {
  return `${name}=${value}; Path=${o.path}; Max-Age=${o.maxAge}; Secure; SameSite=Lax${o.httpOnly ? "; HttpOnly" : ""}`;
}

function clearCookies(): string[] {
  return [
    cookie(SESSION_COOKIE, "", { maxAge: 0, httpOnly: true, path: "/api" }),
    cookie(HINT_COOKIE, "", { maxAge: 0, httpOnly: false, path: "/" }),
  ];
}

function redirect(to: string, cookies: string[] = []): Response {
  const headers = new Headers({ location: to, "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
}

function json(body: unknown, status: number, cookies: string[] = []): Response {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
}
