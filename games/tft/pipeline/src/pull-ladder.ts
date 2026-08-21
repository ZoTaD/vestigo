import { platformToRegion, platformHost, regionHost } from "./riot/routing";

/**
 * Pull the Challenger ladder for a set of regions into Postgres.
 *
 * Run by hand for now — the ladder changes slowly enough that a manual refresh
 * is fine until a production key earns a cron:
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs src/pull-ladder.ts
 *
 * The league endpoint returns puuids but no names, so each unknown player costs
 * one account lookup. Names already in public.players (filled by the search) are
 * reused, which on a region we have pulled before is most of them.
 */

const KEY = process.env.RIOT_API_KEY;
const SB_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REGIONS = (process.env.TFT_LADDER_REGIONS ?? "na1,euw1,kr,la2")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (!KEY || !SB_URL || !SB_KEY) {
  throw new Error("Need RIOT_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Entry {
  puuid?: string;
  leaguePoints: number;
  wins?: number;
  losses?: number;
}
interface Account {
  puuid: string;
  gameName: string;
  tagLine: string;
}

let last = 0;
async function riot<T>(url: string): Promise<T> {
  const wait = 1300 - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const res = await fetch(url, { headers: { "X-Riot-Token": KEY! } });
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after") ?? "5");
    await sleep((retry + 1) * 1000);
    return riot<T>(url);
  }
  if (!res.ok) throw new Error(`Riot ${res.status} ${url}: ${await res.text()}`);
  return (await res.json()) as T;
}

function db(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY!,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/** Names we already hold, looked up in bulk so a known region costs no Riot calls. */
async function knownNames(puuids: string[]): Promise<Map<string, Account>> {
  const map = new Map<string, Account>();
  const safe = puuids.filter((p) => /^[A-Za-z0-9_-]+$/.test(p));
  const CHUNK = 50;
  for (let i = 0; i < safe.length; i += CHUNK) {
    const list = safe.slice(i, i + CHUNK).join(",");
    const res = await db(`players?select=puuid,game_name,tag_line&puuid=in.(${list})`);
    if (!res.ok) continue;
    for (const r of (await res.json()) as { puuid: string; game_name: string; tag_line: string }[]) {
      map.set(r.puuid, { puuid: r.puuid, gameName: r.game_name, tagLine: r.tag_line });
    }
  }
  return map;
}

async function pullRegion(platform: string): Promise<void> {
  const routing = platformToRegion(platform);
  const league = await riot<{ entries: Entry[] }>(
    `${platformHost(platform)}/tft/league/v1/challenger`
  );
  const entries = league.entries.filter((e): e is Entry & { puuid: string } => Boolean(e.puuid));

  const names = await knownNames(entries.map((e) => e.puuid!));
  const fresh: Account[] = [];
  for (const e of entries) {
    if (names.has(e.puuid!)) continue;
    try {
      const acc = await riot<Account>(
        `${regionHost(routing)}/riot/account/v1/accounts/by-puuid/${e.puuid}`
      );
      names.set(acc.puuid, acc);
      fresh.push(acc);
    } catch {
      // A name we cannot resolve just shows as unknown; it should not stop the pull.
    }
  }

  // Enrich players with the names we had to resolve, so the next pull is cheaper.
  if (fresh.length > 0) {
    const now = new Date().toISOString();
    await db("players?on_conflict=puuid", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(
        fresh.map((a) => ({
          puuid: a.puuid,
          game_name: a.gameName,
          tag_line: a.tagLine,
          region: platform,
          updated_at: now,
        }))
      ),
    });
  }

  // Replace the region's ladder wholesale, so players who fell out of Challenger
  // are gone rather than lingering at a stale LP.
  const rows = entries.map((e) => ({
    region: platform,
    puuid: e.puuid,
    league_points: e.leaguePoints,
    wins: e.wins ?? 0,
    losses: e.losses ?? 0,
    fetched_at: new Date().toISOString(),
  }));
  await db(`ladder?region=eq.${platform}`, { method: "DELETE" });
  await db("ladder", { method: "POST", body: JSON.stringify(rows) });

  console.log(`${platform}: ${rows.length} challenger, ${fresh.length} names resolved`);
}

async function main() {
  for (const platform of REGIONS) {
    try {
      await pullRegion(platform);
    } catch (e) {
      console.error(`${platform} failed: ${(e as Error).message}`);
    }
  }
  console.log("done");
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
