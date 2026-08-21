import { loadConfig } from "./config";
import { RiotClient } from "./riot/client";
import { ensureStore, hasMatch, saveMatch, countMatches } from "./store";

/**
 * Fill the match store from one or more rank bands.
 *
 * TIERS is a comma-separated list. Apex tiers are single leagues; everything
 * below is paginated by division, written as "GOLD IV". Each match is stamped
 * with the band it came from, which is what lets the pipeline later ask what
 * the top of the ladder does that the rest does not.
 *
 *   npm run pull                          — challenger only
 *   npm run pull:all                      — the whole ladder
 *   TIERS="GOLD IV,SILVER II" npm run pull
 *
 * Re-running is cheap: matches already on disk are skipped before any request.
 */
/**
 * The whole ladder, apex first. Ordered that way on purpose: if the key expires
 * or the run is cut short, the bands that matter most are already on disk.
 */
const LADDER = [
  "challenger",
  "grandmaster",
  "master",
  "DIAMOND I",
  "DIAMOND IV",
  "EMERALD II",
  "PLATINUM II",
  "GOLD IV",
  "SILVER II",
  "BRONZE III",
  "IRON IV",
];

/**
 * Bands come from the command line rather than an env var: npm scripts cannot
 * set env vars the same way on PowerShell and bash, and this project runs on
 * both. `all` expands to the ladder above.
 */
const requested = process.argv[2] ?? process.env.TIERS ?? process.env.TIER ?? "challenger";
const TIERS =
  requested.toLowerCase() === "all"
    ? LADDER
    : requested
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
const PLAYERS = Number(process.env.PLAYERS ?? "20");
const MATCHES_PER_PLAYER = Number(process.env.MATCHES ?? "10");
const PAGE = Number(process.env.PAGE ?? "1");

/**
 * Only fetch matches played after this moment — an ISO date or epoch seconds.
 *
 *   SINCE=2026-07-15 npm run pull:all
 *
 * Riot filters server-side, so this saves quota rather than disk. It is the
 * single biggest lever the puller has: measured over the store, more than half
 * of everything downloaded was earlier patches that the build then dropped. Set
 * it to the day the current patch or set opened and none of that is fetched.
 *
 * Note it bounds by when the match was PLAYED, which is not the same as the
 * patch it was played on — a patch lands at different times per region. Give it
 * a day of slack and let the build's patch filter do the exact cut.
 */
const SINCE = parseSince(process.env.SINCE);

function parseSince(raw?: string): number | undefined {
  if (!raw) return undefined;
  const epoch = Number(raw);
  // Milliseconds are the easy mistake to make here, and Riot would silently
  // answer with an empty list rather than complain, so catch it loudly.
  if (Number.isFinite(epoch) && epoch > 0) {
    if (epoch > 1e12) {
      console.warn(`SINCE=${raw} looks like milliseconds; Riot wants seconds. Dividing by 1000.`);
      return Math.floor(epoch / 1000);
    }
    return Math.floor(epoch);
  }
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    console.warn(`SINCE="${raw}" is neither epoch seconds nor a date — ignoring it`);
    return undefined;
  }
  return Math.floor(parsed / 1000);
}
const STORE = "../data/matches";

const APEX = ["challenger", "grandmaster", "master"];

/** "GOLD IV" splits into tier and division; apex bands have no division. */
function parseBand(raw: string): { tier: string; division: string; label: string } {
  const [tier, division = "I"] = raw.split(/\s+/);
  const apex = APEX.includes(tier.toLowerCase());
  return {
    tier,
    division,
    label: apex ? tier.toLowerCase() : `${tier.toUpperCase()} ${division.toUpperCase()}`,
  };
}

async function pullBand(client: RiotClient, raw: string): Promise<number> {
  const { tier, division, label } = parseBand(raw);
  console.log(`\n=== ${label} ===`);

  let puuids: string[];
  try {
    puuids = (await client.puuidsByTier(tier, division, PAGE)).slice(0, PLAYERS);
  } catch (e) {
    console.warn(`could not list ${label}: ${(e as Error).message}`);
    return 0;
  }
  if (puuids.length === 0) {
    console.warn(`${label}: no players returned, skipping`);
    return 0;
  }
  console.log(`${puuids.length} players`);

  const matchIds = new Set<string>();
  for (const puuid of puuids) {
    try {
      const ids = await client.matchIdsByPuuid(puuid, MATCHES_PER_PLAYER, SINCE);
      ids.forEach((id) => matchIds.add(id));
    } catch (e) {
      console.warn(`skip player: ${(e as Error).message}`);
    }
  }

  const fresh = [...matchIds].filter((id) => !hasMatch(STORE, id));
  console.log(`${matchIds.size} ids seen, ${fresh.length} new`);

  let saved = 0;
  for (const id of fresh) {
    try {
      const match = await client.match(id);
      saveMatch(STORE, id, new Date().toISOString(), match, label);
      saved++;
      if (saved % 25 === 0) console.log(`  saved ${saved}/${fresh.length}`);
    } catch (e) {
      console.warn(`  skip ${id}: ${(e as Error).message}`);
    }
  }
  console.log(`${label}: saved ${saved}`);
  return saved;
}

async function main() {
  const client = new RiotClient(loadConfig());
  ensureStore(STORE);
  console.log(`store holds ${countMatches(STORE)} matches`);
  console.log(`bands: ${TIERS.join(", ")}`);
  console.log(
    SINCE
      ? `only matches played since ${new Date(SINCE * 1000).toISOString()}`
      : `no SINCE set — fetching every player's whole recent history, most of ` +
          `which the build will drop as older patches`
  );

  let total = 0;
  for (const band of TIERS) {
    // One band failing must not cost the bands after it.
    try {
      total += await pullBand(client, band);
    } catch (e) {
      console.warn(`band ${band} aborted: ${(e as Error).message}`);
    }
  }

  console.log(`\ndone. ${total} new matches. store now holds ${countMatches(STORE)}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
