export interface Config {
  riotApiKey: string;
  region: string;        // platform routing, e.g. "na1"
  routingRegion: string; // regional routing, e.g. "americas"
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const riotApiKey = env.RIOT_API_KEY;
  if (!riotApiKey) {
    throw new Error("RIOT_API_KEY is not set. Copy .env.example to .env and add your key.");
  }
  return {
    riotApiKey,
    region: env.RIOT_REGION ?? "na1",
    routingRegion: env.RIOT_ROUTING ?? "americas",
  };
}
