import { readFileSync, existsSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";

/**
 * Development stand-in for the Supabase Edge Function.
 *
 * It speaks the SAME contract (POST /api/search, POST /api/match, the same
 * response and error shapes), so the UI never knows which one it is talking to
 * and switching to production is a base-URL change, not a rewrite.
 *
 * Backed by the local match store plus the pipeline's Riot key. Every match it
 * fetches is written into the store, so browsing the UI grows the dataset the
 * same way the Edge Function will grow Postgres.
 */

const here = dirname(fileURLToPath(import.meta.url));
const STORE = join(here, "..", "data", "matches");
const ENV_FILE = join(here, "..", "pipeline", ".env");

const PLATFORM_TO_REGION: Record<string, string> = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
  kr: "asia", jp1: "asia",
  oc1: "sea", ph2: "sea", sg2: "sea", th2: "sea", tw2: "sea", vn2: "sea",
};

const MATCH_COUNT = 20;

function envVar(name: string): string {
  if (!existsSync(ENV_FILE)) return "";
  for (const line of readFileSync(ENV_FILE, "utf-8").split(/\r?\n/)) {
    const m = new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`).exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return "";
}

const riotKey = () => envVar("RIOT_API_KEY");

interface ApiFailure {
  code: string;
  status: number;
  message: string;
}

function fail(code: string, status: number, message: string): ApiFailure {
  return { code, status, message };
}

async function riot<T>(url: string, key: string): Promise<T> {
  if (!key) {
    throw fail("NOT_CONFIGURED", 500, "No hay RIOT_API_KEY en games/tft/pipeline/.env.");
  }
  const res = await fetch(url, { headers: { "X-Riot-Token": key } });
  if (res.status === 401 || res.status === 403) {
    throw fail("RIOT_KEY_INVALID", 503, "La key de Riot venció o no es válida. Las dev keys duran ~24h.");
  }
  if (res.status === 404) throw fail("PLAYER_NOT_FOUND", 404, "Riot no conoce ese Riot ID.");
  if (res.status === 429) {
    throw fail("RATE_LIMITED", 429, `Riot pidió esperar ${res.headers.get("retry-after") ?? "10"} segundos.`);
  }
  if (!res.ok) throw fail("UPSTREAM_ERROR", 502, `Riot respondió ${res.status}.`);
  return (await res.json()) as T;
}

const storePath = (id: string) => join(STORE, `${id}.json`);

function storedMatch(matchId: string): unknown | null {
  const p = storePath(matchId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")).match;
  } catch {
    return null;
  }
}

function saveMatch(matchId: string, match: unknown): void {
  try {
    mkdirSync(STORE, { recursive: true });
    writeFileSync(
      storePath(matchId),
      JSON.stringify({ matchId, fetchedAt: new Date().toISOString(), match }),
      "utf-8"
    );
  } catch {
    // Seeing the match matters more than caching it.
  }
}

function cachedIds(ids: string[]): string[] {
  return ids.filter((id) => existsSync(storePath(id)));
}

/**
 * Which set these matches belong to, read off the newest one we hold.
 *
 * The deployed function takes it from the same query it already runs against
 * the matches table; here the local store plays that part. Null when we hold
 * none of them, and a snapshot with a null set never joins a series.
 */
function setOfMatches(ids: string[]): number | null {
  let set: number | null = null;
  for (const id of ids) {
    const m = storedMatch(id) as { info?: { tft_set_number?: number } } | null;
    const n = m?.info?.tft_set_number;
    if (typeof n === "number") set = Math.max(set ?? 0, n);
  }
  return set;
}

/**
 * Find a player in the local store by Riot ID. Lets the analyzer be used with
 * no network at all, which is how it stays testable when the key expires.
 */
function localPlayer(gameName: string, tagLine: string) {
  if (!existsSync(STORE)) return null;
  const wantName = gameName.toLowerCase();
  const wantTag = tagLine.toLowerCase();
  for (const file of readdirSync(STORE)) {
    if (!file.endsWith(".json")) continue;
    try {
      const match = JSON.parse(readFileSync(join(STORE, file), "utf-8")).match;
      for (const p of match?.info?.participants ?? []) {
        if (
          String(p.riotIdGameName ?? "").toLowerCase() === wantName &&
          String(p.riotIdTagline ?? "").toLowerCase() === wantTag
        ) {
          return { puuid: p.puuid as string, gameName: p.riotIdGameName, tagLine: p.riotIdTagline };
        }
      }
    } catch {
      // A corrupt file should never break the search.
    }
  }
  return null;
}

/** Every stored match a puuid appears in, newest first. */
function localHistory(puuid: string): string[] {
  if (!existsSync(STORE)) return [];
  const found: { id: string; at: number }[] = [];
  for (const file of readdirSync(STORE)) {
    if (!file.endsWith(".json")) continue;
    try {
      const stored = JSON.parse(readFileSync(join(STORE, file), "utf-8"));
      const ids: string[] = stored.match?.metadata?.participants ?? [];
      if (ids.includes(puuid)) {
        found.push({ id: stored.matchId, at: stored.match?.info?.game_datetime ?? 0 });
      }
    } catch {
      // ignore
    }
  }
  return found.sort((a, b) => b.at - a.at).map((f) => f.id);
}

async function handleSearch(body: Record<string, unknown>) {
  const gameName = String(body.gameName ?? "").trim();
  const tagLine = String(body.tagLine ?? "").trim().replace(/^#/, "");
  if (!gameName || !tagLine) {
    throw fail("BAD_REQUEST", 400, 'Hace falta un Riot ID con la forma "Nombre#TAG".');
  }
  const platform = String(body.region ?? "na1").toLowerCase();
  const routing = PLATFORM_TO_REGION[platform];
  if (!routing) throw fail("BAD_REQUEST", 400, `Región desconocida: ${platform}`);

  const key = riotKey();
  // Offline first: if the store already knows this player, no key is needed.
  const local = localPlayer(gameName, tagLine);

  if (!key && local) {
    const ids = localHistory(local.puuid);
    return {
      player: { ...local, region: platform },
      matchIds: ids,
      cached: ids,
      offline: true,
      // Lo juntado antes sobrevive a que Riot no conteste.
      lpHistory: await readLpHistory(local.puuid),
    };
  }

  let account: { puuid: string; gameName: string; tagLine: string };
  try {
    account = await riot(
      `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
        `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      key
    );
  } catch (e) {
    // A dead key should not hide a player we already have on disk.
    if (local) {
      const ids = localHistory(local.puuid);
      return {
      player: { ...local, region: platform },
      matchIds: ids,
      cached: ids,
      offline: true,
      // Lo juntado antes sobrevive a que Riot no conteste.
      lpHistory: await readLpHistory(local.puuid),
    };
    }
    throw e;
  }

  const matchIds = await riot<string[]>(
    `https://${routing}.api.riotgames.com/tft/match/v1/matches/by-puuid/` +
      `${account.puuid}/ids?count=${MATCH_COUNT}`,
    key
  );
  // In parallel and both optional, exactly as the deployed function does it.
  // This file is the local stand-in for that function, so a difference between
  // the two shows up as a feature that works in dev and not in production, or
  // the other way round — which is worse than either.
  const [rank, summoner] = await Promise.all([
    playerRank(account.puuid, platform, key),
    playerAccount(account.puuid, platform, key),
  ]);

  const cached = cachedIds(matchIds);
  // Write before reading, so the series that goes back includes this search.
  if (rank) await saveSnapshot(account.puuid, platform, rank, setOfMatches(cached));
  const lpHistory = await readLpHistory(account.puuid);

  return {
    player: { ...account, region: platform, rank, summoner },
    matchIds,
    cached,
    offline: false,
    lpHistory,
  };
}

/** Account level and icon. Decoration: never throws, returns null on any failure. */
async function playerAccount(
  puuid: string,
  platform: string,
  key: string
): Promise<{ level: number; iconId: number } | null> {
  try {
    const s = await riot<{ profileIconId: number; summonerLevel: number }>(
      `https://${platform}.api.riotgames.com/tft/summoner/v1/summoners/by-puuid/${puuid}`,
      key
    );
    if (typeof s?.summonerLevel !== "number") return null;
    return { level: s.summonerLevel, iconId: s.profileIconId ?? 0 };
  } catch {
    return null;
  }
}

/**
 * The player's rank, which picks the meta band their report is measured against.
 *
 * Hits the PLATFORM host (la2, euw1…), not the regional routing one — verified
 * against the live API: la2 answers for a LAS player and americas returns an
 * empty list. Null on unranked, on a dead key, or on any failure at all: losing
 * the rank costs a comparison, while throwing here would cost the whole search.
 */
async function playerRank(
  puuid: string,
  platform: string,
  key: string
): Promise<{ tier: string; division: string; leaguePoints: number; games: number } | null> {
  try {
    const entries = await riot<
      {
        queueType: string;
        tier: string;
        rank: string;
        leaguePoints: number;
        wins: number;
        losses: number;
      }[]
    >(`https://${platform}.api.riotgames.com/tft/league/v1/by-puuid/${puuid}`, key);
    // Hyper Roll and Double Up carry their own ranks, which say nothing about
    // the elo of the standard games being analyzed.
    const ranked = entries.find((e) => e.queueType === "RANKED_TFT");
    if (!ranked?.tier) return null;
    return {
      tier: ranked.tier,
      division: ranked.rank ?? "",
      leaguePoints: ranked.leaguePoints ?? 0,
      // wins + losses: how many ranked games this account has played. Between
      // two snapshots it says exactly how many happened in between.
      games: (ranked.wins ?? 0) + (ranked.losses ?? 0),
    };
  } catch {
    return null;
  }
}

async function handleMatch(body: Record<string, unknown>) {
  const matchId = String(body.matchId ?? "").trim();
  if (!matchId) throw fail("BAD_REQUEST", 400, "Hace falta matchId.");
  const platform = String(body.region ?? "na1").toLowerCase();
  const routing = PLATFORM_TO_REGION[platform];
  if (!routing) throw fail("BAD_REQUEST", 400, `Región desconocida: ${platform}`);

  const stored = storedMatch(matchId);
  if (stored) return { match: stored, cached: true };

  const match = await riot(
    `https://${routing}.api.riotgames.com/tft/match/v1/matches/${encodeURIComponent(matchId)}`,
    riotKey()
  );
  saveMatch(matchId, match);
  return { match, cached: false };
}

/** PostgREST with the pipeline's service key, or null when it is not configured. */
function pgRest(): { base: string; headers: Record<string, string> } | null {
  const base = envVar("SUPABASE_URL").replace(/\/$/, "");
  const key = envVar("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}` } };
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
 * The same snapshot write the deployed function does, against the same table.
 *
 * Dev writing to the production table is deliberate: these are real ranks of
 * real accounts, and a dev stand-in that skipped the write would let the
 * feature look finished here and be broken in production. Swallows everything,
 * for the same reason the deployed one does.
 */
async function saveSnapshot(
  puuid: string,
  region: string,
  rank: { tier: string; division: string; leaguePoints: number; games: number },
  setNumber: number | null
): Promise<void> {
  const pg = pgRest();
  if (!pg) return;
  try {
    const last = await fetch(
      `${pg.base}/rest/v1/rank_snapshots?select=tier,division,league_points,games` +
        `&puuid=eq.${encodeURIComponent(puuid)}&order=taken_at.desc&limit=1`,
      { headers: pg.headers }
    );
    if (last.ok) {
      const prev = ((await last.json()) as {
        tier: string;
        division: string;
        league_points: number;
        games: number;
      }[])[0];
      if (
        prev &&
        prev.tier === rank.tier &&
        prev.division === rank.division &&
        prev.league_points === rank.leaguePoints &&
        prev.games === rank.games
      ) {
        return;
      }
    }
    await fetch(`${pg.base}/rest/v1/rank_snapshots`, {
      method: "POST",
      headers: { ...pg.headers, "content-type": "application/json" },
      body: JSON.stringify({
        puuid,
        region,
        set_number: setNumber,
        tier: rank.tier,
        division: rank.division,
        league_points: rank.leaguePoints,
        games: rank.games,
      }),
    });
  } catch {
    // Un snapshot perdido no rompe una búsqueda.
  }
}

async function readLpHistory(puuid: string): Promise<LpSnapshot[]> {
  const pg = pgRest();
  if (!pg) return [];
  try {
    const res = await fetch(
      `${pg.base}/rest/v1/rank_snapshots?select=tier,division,league_points,games,set_number,taken_at` +
        `&puuid=eq.${encodeURIComponent(puuid)}&order=taken_at.desc&limit=120`,
      { headers: pg.headers }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as {
      tier: string;
      division: string;
      league_points: number;
      games: number;
      set_number: number | null;
      taken_at: string;
    }[];
    return rows.map((r) => ({
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

/**
 * The ladder lives in Postgres, not the local store, so this route reads it
 * straight from PostgREST with the pipeline's service key — the same rows the
 * Edge Function serves in production.
 */
async function handleLadder(body: Record<string, unknown>) {
  const platform = String(body.region ?? "na1").toLowerCase();
  if (!PLATFORM_TO_REGION[platform]) throw fail("BAD_REQUEST", 400, `Región desconocida: ${platform}`);

  const pg = pgRest();
  if (!pg) {
    throw fail("NOT_CONFIGURED", 500, "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en pipeline/.env.");
  }
  const { base, headers } = pg;

  const lr = await fetch(
    `${base}/rest/v1/ladder?select=puuid,league_points,wins,losses&region=eq.${platform}` +
      `&order=league_points.desc&limit=100`,
    { headers }
  );
  const rows = (lr.ok ? await lr.json() : []) as
    { puuid: string; league_points: number; wins: number; losses: number }[];

  const names = new Map<string, { game_name: string; tag_line: string }>();
  const safe = rows.map((r) => r.puuid).filter((p) => /^[A-Za-z0-9_-]+$/.test(p));
  if (safe.length > 0) {
    const nr = await fetch(
      `${base}/rest/v1/players?select=puuid,game_name,tag_line&puuid=in.(${safe.join(",")})`,
      { headers }
    );
    if (nr.ok) {
      for (const p of (await nr.json()) as { puuid: string; game_name: string; tag_line: string }[]) {
        names.set(p.puuid, p);
      }
    }
  }

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

  return { region: platform, entries };
}

export function devApi(): Plugin {
  return {
    name: "vestigo-dev-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) return next();

        const route = url.split("?")[0].replace(/^\/api\//, "");
        const send = (status: number, payload: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(payload));
        };

        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf-8")) : {};

          if (route === "search") return send(200, await handleSearch(body));
          if (route === "match") return send(200, await handleMatch(body));
          if (route === "ladder") return send(200, await handleLadder(body));
          return send(404, { error: { code: "BAD_REQUEST", message: `Ruta desconocida: ${route}` } });
        } catch (e) {
          const f = e as ApiFailure;
          if (f && typeof f.status === "number") {
            return send(f.status, { error: { code: f.code, message: f.message } });
          }
          return send(500, {
            error: { code: "UPSTREAM_ERROR", message: (e as Error).message ?? "Error inesperado" },
          });
        }
      });
    },
  };
}
