import { loadConfig } from "./config";
import { RiotClient } from "./riot/client";

/**
 * Manual smoke test for the player lookup path, following the same pattern as
 * smoke.ts: hit the real API once and look at the real response before building
 * anything on top of it.
 *
 * Run: node --env-file=.env node_modules/tsx/dist/cli.mjs src/smoke-player.ts "Nombre#TAG"
 */
async function main() {
  const arg = process.argv[2] ?? "who is khu#NA1";
  const hash = arg.lastIndexOf("#");
  if (hash < 1) throw new Error(`Riot ID must look like "Nombre#TAG", got: ${arg}`);
  const gameName = arg.slice(0, hash);
  const tagLine = arg.slice(hash + 1);

  const client = new RiotClient(loadConfig());
  console.log(`looking up "${gameName}" / "${tagLine}"...`);

  const account = await client.accountByRiotId(gameName, tagLine);
  console.log("account:", JSON.stringify(account));

  const ids = await client.matchIdsByPuuid(account.puuid, 5);
  console.log(`match ids (${ids.length}):`, ids);

  if (ids.length === 0) {
    console.warn("No matches on this routing region. The player may play elsewhere.");
    return;
  }

  const match = await client.match(ids[0]);
  const me = match.info.participants.find((p) => p.puuid === account.puuid);
  console.log(
    `first match: ${match.info.participants.length} players, ` +
      `this player placed ${me?.placement ?? "?"} with ${me?.units.length ?? 0} units`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
