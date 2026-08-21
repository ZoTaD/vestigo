import { describe, it, expect } from "vitest";
import { platformToRegion, platformHost, regionHost } from "../src/riot/routing";

describe("routing", () => {
  it("maps a platform to its regional routing value", () => {
    expect(platformToRegion("na1")).toBe("americas");
    expect(platformToRegion("euw1")).toBe("europe");
    expect(platformToRegion("kr")).toBe("asia");
  });

  it("throws on an unknown platform", () => {
    expect(() => platformToRegion("zz9")).toThrow(/Unknown platform/);
  });

  it("builds hosts", () => {
    expect(platformHost("na1")).toBe("https://na1.api.riotgames.com");
    expect(regionHost("americas")).toBe("https://americas.api.riotgames.com");
  });
});
