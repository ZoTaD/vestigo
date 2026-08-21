const PLATFORM_TO_REGION: Record<string, string> = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
  kr: "asia", jp1: "asia",
  oc1: "sea", ph2: "sea", sg2: "sea", th2: "sea", tw2: "sea", vn2: "sea",
};

export function platformToRegion(platform: string): string {
  const region = PLATFORM_TO_REGION[platform.toLowerCase()];
  if (!region) throw new Error(`Unknown platform: ${platform}`);
  return region;
}

export function platformHost(platform: string): string {
  return `https://${platform}.api.riotgames.com`;
}

export function regionHost(region: string): string {
  return `https://${region}.api.riotgames.com`;
}
