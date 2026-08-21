import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("throws when RIOT_API_KEY is missing", () => {
    expect(() => loadConfig({})).toThrow(/RIOT_API_KEY/);
  });

  it("returns config with defaults when key is present", () => {
    const cfg = loadConfig({ RIOT_API_KEY: "abc" });
    expect(cfg.riotApiKey).toBe("abc");
    expect(cfg.region).toBe("na1");
    expect(cfg.routingRegion).toBe("americas");
  });
});
