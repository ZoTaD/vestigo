/**
 * La API pública de Vestigo: la única pieza que habla con Riot desde el servidor.
 *
 * Portada de `supabase/functions/tft-api`. La key de Riot vive en los secrets del
 * Worker y nunca sale de acá: el navegador le pega a esto, no a Riot.
 *
 * Deliberadamente tonta: trae partidas, las persiste y las devuelve crudas. El
 * análisis se calcula en el navegador con games/tft/analysis.
 *
 * Rutas:
 *   POST /search  { gameName, tagLine, region } -> { player, matchIds, cached }
 *   POST /match   { matchId, region }           -> { match }
 *   POST /ladder  { region }                    -> { region, entries }
 */
import type { Env } from "./pull";

/** Plataforma -> routing regional. */
const PLATFORM_TO_REGION: Record<string, string> = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
  kr: "asia", jp1: "asia",
  oc1: "sea", ph2: "sea", sg2: "sea", th2: "sea", tw2: "sea", vn2: "sea",
};

const DEFAULT_REGION = "na1";
/** Cuántas partidas trae una búsqueda. Más que esto y la primera carga se arrastra. */
const MATCH_COUNT = 20;
/** Un Riot ID resuelto se recicla por este tiempo antes de volver a preguntar. */
const PLAYER_TTL_MS = 24 * 60 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Errores tipados: la UI tiene que poder decir QUÉ pasó, no "algo salió mal". */
type ErrorCode =
  | "BAD_REQUEST"
  | "RIOT_KEY_INVALID"
  | "PLAYER_NOT_FOUND"
  | "RATE_LIMITED"
  | "TOO_MANY_REQUESTS"
  | "UPSTREAM_ERROR"
  | "NOT_CONFIGURED";

class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// El límite por visitante
// ---------------------------------------------------------------------------

/**
 * Dos límites, porque las rutas cuestan muy distinto. `search` siempre llega a
 * Riot, así que unas pocas por minuto están bien y un scraper recorriendo un
 * ladder no. El límite general tiene que quedar bastante más arriba: una sola
 * búsqueda real dispara ~20 llamadas a `match` en segundos, y cortar a alguien a
 * la mitad de su historial sería peor que el abuso.
 */
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_TOTAL = 120;
const RATE_MAX_SEARCH = 12;

/**
 * Una clave estable por visitante, sin guardar su dirección.
 *
 * Contar peticiones necesita algo que se repita durante un minuto para el mismo
 * cliente; NO necesita la IP en sí, y una IP es dato personal bajo el RGPD. Así
 * que lo único que llega a la base es un SHA-256 truncado: sirve igual para
 * contar y deja de ser un dato que haya que declarar, resguardar y borrar.
 *
 * En Workers la IP viene en `cf-connecting-ip`, que la pone Cloudflare y **el
 * cliente no puede falsificar** — a diferencia de `x-forwarded-for`, que sí.
 * Esa es una mejora real de seguridad respecto de la versión anterior: acá el
 * contador no se puede evadir mandando una cabecera distinta en cada request.
 */
async function callerKey(req: Request): Promise<string> {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * Cuenta esta petición y dice si hay que rechazarla.
 *
 * Todo en UNA declaración con `on conflict ... returning`, y eso es lo que la
 * hace correcta: leer-y-después-escribir dejaría una ventana entre las dos en la
 * que veinte peticiones simultáneas leen el mismo contador y ninguna se frena.
 * Cada isolate de Workers es independiente —igual que las Edge Functions— así
 * que un contador en memoria no serviría: la base es el único estado compartido.
 *
 * El `case when` reinicia la ventana cuando venció, en el mismo paso en que
 * incrementa, para no necesitar un borrado periódico de filas viejas.
 */
async function overLimit(env: Env, key: string, route: string): Promise<boolean> {
  // `ladder` sale de nuestra propia tabla y nunca toca Riot, así que cobrarle una
  // escritura por visita no compraría nada.
  if (route !== "search" && route !== "match") return false;

  const ahora = Date.now();
  const desde = new Date(ahora - RATE_WINDOW_SECONDS * 1000).toISOString();
  const esBusqueda = route === "search" ? 1 : 0;

  try {
    const fila = await env.DB.prepare(
      `insert into rate_limit (ip, window_start, total, search) values (?1, ?2, 1, ?3)
       on conflict(ip) do update set
         window_start = case when rate_limit.window_start < ?4 then ?2 else rate_limit.window_start end,
         total        = case when rate_limit.window_start < ?4 then 1 else rate_limit.total + 1 end,
         search       = case when rate_limit.window_start < ?4 then ?3 else rate_limit.search + ?3 end
       returning total, search`
    )
      .bind(key, new Date(ahora).toISOString(), esBusqueda, desde)
      .first<{ total: number; search: number }>();
    if (!fila) return false;
    return fila.total > RATE_MAX_TOTAL || fila.search > RATE_MAX_SEARCH;
  } catch {
    // Falla abierto a propósito: si el contador no responde, servir la página
    // importa más que aplicar un límite que existe para cuidar una cuota.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Riot
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

function regionOf(platform: string): { platform: string; routing: string } {
  const p = (platform || DEFAULT_REGION).toLowerCase();
  const routing = PLATFORM_TO_REGION[p];
  if (!routing) throw new ApiError("BAD_REQUEST", 400, `Región desconocida: ${platform}`);
  return { platform: p, routing };
}

async function riot<T>(env: Env, url: string): Promise<T> {
  if (!env.RIOT_API_KEY) {
    throw new ApiError("NOT_CONFIGURED", 500, "Falta RIOT_API_KEY en los secrets.");
  }
  const res = await fetch(url, { headers: { "X-Riot-Token": env.RIOT_API_KEY } });

  // Las dev keys mueren cada ~24h. Decirlo con todas las letras ahorra una hora
  // de debugging a quien lo use.
  if (res.status === 401 || res.status === 403) {
    throw new ApiError(
      "RIOT_KEY_INVALID",
      503,
      "La key de Riot venció o no es válida. Las dev keys duran ~24h."
    );
  }
  if (res.status === 404) throw new ApiError("PLAYER_NOT_FOUND", 404, "Riot no conoce ese Riot ID.");
  if (res.status === 429) {
    const retry = res.headers.get("retry-after") ?? "10";
    throw new ApiError("RATE_LIMITED", 429, `Riot pidió esperar ${retry} segundos.`);
  }
  if (!res.ok) throw new ApiError("UPSTREAM_ERROR", 502, `Riot respondió ${res.status}.`);
  return (await res.json()) as T;
}

interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

interface RiotLeagueEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface PlayerRank {
  tier: string;
  division: string;
  leaguePoints: number;
  /** wins + losses de la rankeada: entre dos snapshots dice cuántas partidas pasaron. */
  games: number;
}

/**
 * El rango del jugador, que decide contra qué meta se lo compara.
 *
 * Va al host de la PLATAFORMA (la2, euw1…), no al routing regional: verificado
 * contra la API, la2 contesta el rango de un jugador de LAS y americas no.
 * Nunca tira: quedarse sin el rango degrada el reporte a la banda por defecto,
 * romper acá dejaría a alguien sin sus partidas por un dato accesorio.
 */
async function playerRank(env: Env, puuid: string, platform: string): Promise<PlayerRank | null> {
  try {
    const entries = await riot<RiotLeagueEntry[]>(
      env,
      `https://${platform}.api.riotgames.com/tft/league/v1/by-puuid/${encodeURIComponent(puuid)}`
    );
    // Sólo la cola estándar: Hyper Roll y Double Up tienen rangos propios que no
    // describen el elo de las partidas que estamos analizando.
    const ranked = entries.find((e) => e.queueType === "RANKED_TFT");
    if (!ranked?.tier) return null;
    return {
      tier: ranked.tier,
      division: ranked.rank ?? "",
      leaguePoints: ranked.leaguePoints ?? 0,
      games: (ranked.wins ?? 0) + (ranked.losses ?? 0),
    };
  } catch {
    return null;
  }
}

export interface PlayerAccount {
  level: number;
  iconId: number;
}

/** Nivel de cuenta e ícono. Mismas reglas que playerRank: nunca tira. */
async function playerAccount(env: Env, puuid: string, platform: string): Promise<PlayerAccount | null> {
  try {
    const s = await riot<{ profileIconId: number; summonerLevel: number }>(
      env,
      `https://${platform}.api.riotgames.com/tft/summoner/v1/summoners/by-puuid/${encodeURIComponent(puuid)}`
    );
    if (typeof s?.summonerLevel !== "number") return null;
    return { level: s.summonerLevel, iconId: s.profileIconId ?? 0 };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// La base
// ---------------------------------------------------------------------------

/**
 * `collate nocase` es el `ilike` de Postgres: los Riot ID se escriben como uno
 * quiere y tienen que encontrarse igual. Ojo con el límite real: NOCASE de
 * SQLite sólo pliega ASCII, así que un nombre con acentos hay que escribirlo con
 * la misma caja. Postgres plegaba unicode entero.
 */
async function cachedPlayer(env: Env, gameName: string, tagLine: string): Promise<RiotAccount | null> {
  const row = await env.DB.prepare(
    "select puuid, game_name, tag_line, updated_at from players " +
      "where game_name = ? collate nocase and tag_line = ? collate nocase limit 1"
  )
    .bind(gameName, tagLine)
    .first<{ puuid: string; game_name: string; tag_line: string; updated_at: string }>();
  if (!row) return null;
  if (Date.now() - Date.parse(row.updated_at) > PLAYER_TTL_MS) return null;
  return { puuid: row.puuid, gameName: row.game_name, tagLine: row.tag_line };
}

/**
 * La misma búsqueda que cachedPlayer pero sin la regla de frescura.
 *
 * cachedPlayer vence una entrada al día para que una cuenta renombrada no quede
 * mal para siempre. Eso está bien mientras Riot conteste y mal cuando no: un
 * nombre de ayer vale incomparablemente más que una página de error. Acá sólo se
 * llega después de que una llamada a Riot ya falló.
 */
async function storedPlayer(env: Env, gameName: string, tagLine: string): Promise<RiotAccount | null> {
  const row = await env.DB.prepare(
    "select puuid, game_name, tag_line from players " +
      "where game_name = ? collate nocase and tag_line = ? collate nocase limit 1"
  )
    .bind(gameName, tagLine)
    .first<{ puuid: string; game_name: string; tag_line: string }>();
  return row ? { puuid: row.puuid, gameName: row.game_name, tagLine: row.tag_line } : null;
}

interface LpSnapshot {
  tier: string;
  division: string;
  leaguePoints: number;
  games: number;
  setNumber: number | null;
  takenAt: number;
}

/**
 * Deja anotado dónde estaba el jugador, si cambió algo desde la última vez.
 *
 * El dedup mira LP y partidas jugadas, no el reloj: buscarse cinco veces en un
 * minuto no tiene que dejar cinco puntos iguales en el gráfico. Se traga
 * cualquier error: un snapshot perdido es un punto menos en un gráfico.
 */
async function saveSnapshot(
  env: Env,
  puuid: string,
  region: string,
  rank: PlayerRank,
  setNumber: number | null
): Promise<void> {
  try {
    const prev = await env.DB.prepare(
      "select tier, division, league_points, games from rank_snapshots " +
        "where puuid = ? order by taken_at desc limit 1"
    )
      .bind(puuid)
      .first<{ tier: string; division: string; league_points: number; games: number }>();
    if (
      prev &&
      prev.tier === rank.tier &&
      prev.division === rank.division &&
      prev.league_points === rank.leaguePoints &&
      prev.games === rank.games
    ) {
      return;
    }
    await env.DB.prepare(
      "insert or replace into rank_snapshots " +
        "(puuid, region, set_number, tier, division, league_points, games, taken_at) " +
        "values (?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        puuid,
        region,
        setNumber,
        rank.tier,
        rank.division,
        rank.leaguePoints,
        rank.games,
        new Date().toISOString()
      )
      .run();
  } catch {
    // Ver arriba: nunca romper una búsqueda por esto.
  }
}

/** La serie del jugador. 120 puntos alcanzan para un set y acotan la respuesta. */
async function readLpHistory(env: Env, puuid: string): Promise<LpSnapshot[]> {
  try {
    const { results } = await env.DB.prepare(
      "select tier, division, league_points, games, set_number, taken_at from rank_snapshots " +
        "where puuid = ? order by taken_at desc limit 120"
    )
      .bind(puuid)
      .all<{
        tier: string;
        division: string;
        league_points: number;
        games: number;
        set_number: number | null;
        taken_at: string;
      }>();
    return results.map((r) => ({
      tier: r.tier,
      division: r.division,
      leaguePoints: r.league_points,
      games: r.games,
      setNumber: r.set_number,
      takenAt: Date.parse(r.taken_at),
    }));
  } catch {
    return [];
  }
}

/** Las partidas guardadas en las que aparece un puuid, la más nueva primero. */
async function storedHistory(env: Env, puuid: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "select m.match_id from matches m join match_players p on p.match_id = m.match_id " +
      "where p.puuid = ? order by m.game_datetime desc limit ?"
  )
    .bind(puuid, MATCH_COUNT)
    .all<{ match_id: string }>();
  return results.map((r) => r.match_id);
}

async function savePlayer(env: Env, account: RiotAccount, region: string): Promise<void> {
  await env.DB.prepare(
    "insert or replace into players (puuid, game_name, tag_line, region, updated_at, pulled_at) " +
      "values (?, ?, ?, ?, ?, (select pulled_at from players where puuid = ?))"
  )
    .bind(
      account.puuid,
      account.gameName,
      account.tagLine,
      region,
      new Date().toISOString(),
      account.puuid
    )
    .run();
}

async function storedMatch(env: Env, matchId: string): Promise<unknown | null> {
  const row = await env.DB.prepare("select payload from matches where match_id = ? limit 1")
    .bind(matchId)
    .first<{ payload: string }>();
  // D1 guarda el payload como TEXT: SQLite no tiene jsonb.
  return row ? JSON.parse(row.payload) : null;
}

interface RawMatch {
  metadata?: { match_id?: string };
  info?: {
    tft_set_number?: number;
    queueId?: number;
    queue_id?: number;
    game_datetime?: number;
    game_version?: string;
    participants?: { puuid?: string; placement?: number }[];
  };
}

/** Persistir es best-effort: si la base falla, el usuario igual ve su partida. */
async function saveMatch(env: Env, matchId: string, region: string, match: RawMatch): Promise<void> {
  const info = match.info ?? {};
  try {
    const filas = (info.participants ?? []).filter((p) => p.puuid);
    // La partida y sus tableros en un solo batch, que D1 corre como una
    // transacción: no puede quedar una partida sin sus participantes.
    await env.DB.batch([
      env.DB.prepare(
        "insert or replace into matches " +
          "(match_id, region, set_number, queue_id, game_datetime, game_version, payload, fetched_at, tier, summarized_at) " +
          "values (?, ?, ?, ?, ?, ?, ?, ?, coalesce((select tier from matches where match_id = ?), ''), " +
          "(select summarized_at from matches where match_id = ?))"
      ).bind(
        matchId,
        region,
        info.tft_set_number ?? null,
        info.queueId ?? info.queue_id ?? null,
        info.game_datetime ?? null,
        info.game_version ?? null,
        JSON.stringify(match),
        new Date().toISOString(),
        matchId,
        matchId
      ),
      ...filas.map((p) =>
        env.DB.prepare(
          "insert or replace into match_players (match_id, puuid, placement) values (?, ?, ?)"
        ).bind(matchId, p.puuid!, p.placement ?? null)
      ),
    ]);
  } catch {
    // Ver la partida importa más que guardarla.
  }
}

// ---------------------------------------------------------------------------
// Las rutas
// ---------------------------------------------------------------------------

async function handleSearch(env: Env, body: Record<string, unknown>): Promise<Response> {
  const gameName = String(body.gameName ?? "").trim();
  const tagLine = String(body.tagLine ?? "")
    .trim()
    .replace(/^#/, "");
  if (!gameName || !tagLine) {
    throw new ApiError("BAD_REQUEST", 400, 'Hace falta un Riot ID con la forma "Nombre#TAG".');
  }
  const { platform, routing } = regionOf(String(body.region ?? DEFAULT_REGION));

  // Si Riot no contesta, la respuesta sale de lo guardado. Una dev key vence cada
  // 24 horas, así que sin esta salida el sitio pasaría la mayor parte del tiempo
  // devolviendo un error en vez de las partidas que ya tenemos.
  const offlineAnswer = async (): Promise<Response | null> => {
    const stored = await storedPlayer(env, gameName, tagLine);
    if (!stored) return null;
    const ids = await storedHistory(env, stored.puuid);
    if (ids.length === 0) return null;
    const lpHistory = await readLpHistory(env, stored.puuid);
    return json({
      player: { ...stored, region: platform },
      matchIds: ids,
      cached: ids,
      offline: true,
      lpHistory,
    });
  };

  let account = await cachedPlayer(env, gameName, tagLine);
  const fromCache = account !== null;
  if (!account) {
    try {
      // Los nombres reales traen espacios y caracteres no latinos.
      account = await riot<RiotAccount>(
        env,
        `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
          `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
      );
      await savePlayer(env, account, platform);
    } catch (e) {
      const fallback = await offlineAnswer();
      if (fallback) return fallback;
      throw e;
    }
  }

  let matchIds: string[];
  try {
    matchIds = await riot<string[]>(
      env,
      `https://${routing}.api.riotgames.com/tft/match/v1/matches/by-puuid/` +
        `${account.puuid}/ids?count=${MATCH_COUNT}`
    );
  } catch (e) {
    const fallback = await offlineAnswer();
    if (fallback) return fallback;
    throw e;
  }

  // Cuáles ya tenemos: la UI pinta esas al instante y pide el resto por lotes.
  // De paso sale el set, que es con el que se guarda el snapshot del rango.
  let cached: string[] = [];
  let setNumber: number | null = null;
  const safeIds = matchIds.filter((id) => /^[A-Za-z0-9_]+$/.test(id));
  if (safeIds.length > 0) {
    const { results } = await env.DB.prepare(
      `select match_id, set_number from matches where match_id in (${safeIds.map(() => "?").join(",")})`
    )
      .bind(...safeIds)
      .all<{ match_id: string; set_number: number | null }>();
    cached = results.map((r) => r.match_id);
    for (const r of results) {
      if (typeof r.set_number === "number") setNumber = Math.max(setNumber ?? 0, r.set_number);
    }
  }

  // Los dos accesorios en paralelo: son dos llamadas a Riot que no dependen una
  // de otra, así que encadenarlas sólo sumaría latencia a cada búsqueda.
  const [rank, summoner] = await Promise.all([
    playerRank(env, account.puuid, platform),
    playerAccount(env, account.puuid, platform),
  ]);

  // Grabar antes de leer, para que la serie devuelta incluya el punto de esta
  // misma búsqueda.
  if (rank) await saveSnapshot(env, account.puuid, platform, rank, setNumber);
  const lpHistory = await readLpHistory(env, account.puuid);

  return json({
    player: { ...account, region: platform, rank, summoner },
    matchIds,
    cached,
    fromCache,
    lpHistory,
  });
}

async function handleMatch(env: Env, body: Record<string, unknown>): Promise<Response> {
  const matchId = String(body.matchId ?? "").trim();
  if (!matchId) throw new ApiError("BAD_REQUEST", 400, "Hace falta matchId.");
  const { platform, routing } = regionOf(String(body.region ?? DEFAULT_REGION));

  const stored = await storedMatch(env, matchId);
  if (stored) return json({ match: stored, cached: true });

  const match = await riot<RawMatch>(
    env,
    `https://${routing}.api.riotgames.com/tft/match/v1/matches/${encodeURIComponent(matchId)}`
  );
  await saveMatch(env, matchId, platform, match);
  return json({ match, cached: false });
}

/**
 * El ladder de Challenger de una región, servido desde nuestra base.
 *
 * No sale de Riot: lo llena `pull:ladder` cada tanto, así una dev key vencida no
 * lo tumba. Los nombres se juntan en memoria y no con un join obligatorio, para
 * que un nombre que no se pudo resolver no deje a ese jugador afuera de la tabla.
 */
async function handleLadder(env: Env, body: Record<string, unknown>): Promise<Response> {
  const { platform } = regionOf(String(body.region ?? DEFAULT_REGION));

  const { results: rows } = await env.DB.prepare(
    "select puuid, league_points, wins, losses from ladder where region = ? " +
      "order by league_points desc limit 100"
  )
    .bind(platform)
    .all<{ puuid: string; league_points: number; wins: number; losses: number }>();
  if (rows.length === 0) return json({ region: platform, entries: [] });

  const names = new Map<string, { game_name: string; tag_line: string }>();
  const puuids = rows.map((r) => r.puuid);
  const { results: nombres } = await env.DB.prepare(
    `select puuid, game_name, tag_line from players where puuid in (${puuids.map(() => "?").join(",")})`
  )
    .bind(...puuids)
    .all<{ puuid: string; game_name: string; tag_line: string }>();
  for (const p of nombres) names.set(p.puuid, p);

  const entries = rows.map((r, i) => {
    const n = names.get(r.puuid);
    const games = r.wins + r.losses;
    return {
      rank: i + 1,
      gameName: n?.game_name ?? null,
      tagLine: n?.tag_line ?? null,
      leaguePoints: r.league_points,
      wins: r.wins,
      losses: r.losses,
      winRate: games > 0 ? r.wins / games : 0,
    };
  });

  return json({ region: platform, entries });
}

/** El router de la API. Devuelve null si la ruta no es de acá. */
export async function handleApi(req: Request, env: Env, ruta: string): Promise<Response | null> {
  if (ruta !== "/search" && ruta !== "/match" && ruta !== "/ladder") return null;
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const route = ruta.slice(1);
  try {
    if (req.method !== "POST") throw new ApiError("BAD_REQUEST", 405, "Solo POST.");

    // Antes de leer el cuerpo y antes de tocar Riot, así una inundación no cuesta
    // más que el contador.
    if (await overLimit(env, await callerKey(req), route)) {
      throw new ApiError(
        "TOO_MANY_REQUESTS",
        429,
        "Demasiadas consultas seguidas desde esta conexión. Espera un minuto."
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (route === "search") return await handleSearch(env, body);
    if (route === "match") return await handleMatch(env, body);
    return await handleLadder(env, body);
  } catch (err) {
    if (err instanceof ApiError) {
      return json({ error: { code: err.code, message: err.message } }, err.status);
    }
    // Un error que no previmos se escribe entero en los logs, donde sólo lo ve
    // quien administra el proyecto; al navegador le llega únicamente que algo
    // falló. Los mensajes internos nombran hosts y rutas, y nada de eso le sirve
    // a quien está mirando la página.
    console.error("unhandled error", err);
    return json(
      { error: { code: "UPSTREAM_ERROR", message: "Error inesperado del servidor." } },
      500
    );
  }
}
