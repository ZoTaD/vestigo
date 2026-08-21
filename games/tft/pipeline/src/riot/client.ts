import type { Config } from "../config";
import { platformHost, regionHost } from "./routing";
import type { RawMatch } from "./normalize";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface LeagueEntry { puuid?: string; summonerId?: string; }
export interface LeagueList { entries: LeagueEntry[]; }
export interface RiotAccount { puuid: string; gameName: string; tagLine: string; }

export interface RiotClientOptions {
  minIntervalMs?: number;
  /** How many times to retry a throttle or gateway error before giving up. */
  maxRetries?: number;
  /** Base for the exponential backoff when Riot gives no retry-after. */
  backoffBaseMs?: number;
}

/**
 * Statuses worth retrying: 429 is throttling, and 5xx/52x are Riot's edge
 * (Cloudflare) failing to reach its origin — an outage on their side, not a bad
 * request on ours. Both clear on their own, so a puller meant to run all day has
 * to wait them out rather than die. A 404 or 403 is an answer and is never
 * retried.
 */
const RETRYABLE = new Set([429, 500, 502, 503, 504, 520, 522, 524]);

export class RiotClient {
  private last = 0;
  private minIntervalMs: number;
  private maxRetries: number;
  private backoffBaseMs: number;

  constructor(private cfg: Config, opts: RiotClientOptions = {}) {
    this.minIntervalMs = opts.minIntervalMs ?? 1300;
    this.maxRetries = opts.maxRetries ?? 6;
    this.backoffBaseMs = opts.backoffBaseMs ?? 2000;
  }

  private async throttle() {
    const wait = this.minIntervalMs - (Date.now() - this.last);
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
  }

  private async get<T>(url: string, attempt = 0): Promise<T> {
    await this.throttle();
    const res = await fetch(url, { headers: { "X-Riot-Token": this.cfg.riotApiKey } });

    if (RETRYABLE.has(res.status) && attempt < this.maxRetries) {
      // 429 tells us how long to wait; a gateway error does not, so back off
      // exponentially, capped, so a long outage neither hammers Riot nor spins.
      const retryAfter = Number(res.headers.get("retry-after") ?? 0);
      const wait =
        retryAfter > 0
          ? (retryAfter + 1) * 1000
          : Math.min(30000, this.backoffBaseMs * 2 ** attempt);
      await sleep(wait);
      return this.get<T>(url, attempt + 1);
    }

    if (!res.ok) throw new Error(`Riot API ${res.status} for ${url}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  challenger(): Promise<LeagueList> {
    return this.get<LeagueList>(`${platformHost(this.cfg.region)}/tft/league/v1/challenger`);
  }

  /**
   * PUUIDs from any rank.
   *
   * Riot splits this across two endpoint shapes: the three apex tiers are single
   * leagues with an `entries` array, while everything below is paginated by
   * division. Both hand back puuids directly, so no summoner lookup is needed.
   */
  async puuidsByTier(tier: string, division = "I", page = 1): Promise<string[]> {
    const host = platformHost(this.cfg.region);
    const apex = ["challenger", "grandmaster", "master"];
    const t = tier.toLowerCase();

    if (apex.includes(t)) {
      const league = await this.get<LeagueList>(`${host}/tft/league/v1/${t}`);
      return league.entries.map((e) => e.puuid).filter((p): p is string => Boolean(p));
    }

    const entries = await this.get<LeagueEntry[]>(
      `${host}/tft/league/v1/entries/${tier.toUpperCase()}/${division.toUpperCase()}?page=${page}`
    );
    return entries.map((e) => e.puuid).filter((p): p is string => Boolean(p));
  }

  /**
   * Riot ID to PUUID. Account routing is global, so any regional host answers
   * for any player. Both parts must be encoded: real names carry spaces and
   * non-latin characters ("who is khu", "大狗叫叫叫").
   */
  accountByRiotId(gameName: string, tagLine: string): Promise<RiotAccount> {
    const name = encodeURIComponent(gameName);
    const tag = encodeURIComponent(tagLine);
    return this.get<RiotAccount>(
      `${regionHost(this.cfg.routingRegion)}/riot/account/v1/accounts/by-riot-id/${name}/${tag}`
    );
  }

  /**
   * A player's match ids, newest first.
   *
   * `startTime` is epoch **seconds**, not milliseconds, and Riot applies it
   * server-side. That is the difference between downloading a patch's worth of
   * matches and downloading a year's: before this existed, more than half of
   * everything the store held was earlier patches, fetched in full and then
   * dropped by the build.
   *
   * Verified against the live API rather than the docs: a one-hour window
   * returns 0 ids, twenty-four hours returns 7, ninety days returns 100, and a
   * window in the future returns 0 — so the filter is real, not ignored. The
   * same probe showed `count` is not capped at 20; 200 was accepted.
   */
  matchIdsByPuuid(puuid: string, count = 20, startTime?: number): Promise<string[]> {
    const query = new URLSearchParams({ count: String(count) });
    if (startTime !== undefined) query.set("startTime", String(startTime));
    return this.get<string[]>(
      `${regionHost(this.cfg.routingRegion)}/tft/match/v1/matches/by-puuid/${puuid}/ids?${query}`
    );
  }

  match(matchId: string): Promise<RawMatch> {
    return this.get<RawMatch>(`${regionHost(this.cfg.routingRegion)}/tft/match/v1/matches/${matchId}`);
  }
}
