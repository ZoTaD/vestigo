import { loadConfig } from "./config";
import { RiotClient } from "./riot/client";

// Loads .env via Node's built-in --env-file flag (see run command below).
async function main() {
  const client = new RiotClient(loadConfig());
  const league = await client.challenger();
  console.log(`challenger entries: ${league.entries.length}`);
  console.log("first entry:", JSON.stringify(league.entries[0], null, 2));

  const puuid = league.entries[0]?.puuid;
  if (!puuid) {
    console.warn("No puuid on the league entry — we will need a summoner lookup step. Inspect the entry above.");
    return;
  }
  const ids = await client.matchIdsByPuuid(puuid, 3);
  console.log("match ids:", ids);
  const match = await client.match(ids[0]);
  console.log("participants in first match:", match.info.participants.length);
  console.log("first unit of first participant:", match.info.participants[0]?.units[0]);
}

main().catch((e) => { console.error(e); process.exit(1); });
