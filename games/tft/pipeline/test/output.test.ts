import { describe, it, expect, afterAll } from "vitest";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { writeComps } from "../src/output";

const tmp = "test/.tmp/comps.json";
afterAll(() => { if (existsSync("test/.tmp")) rmSync("test/.tmp", { recursive: true, force: true }); });

const comp = {
  signature: "T|C", signatures: ["T|C"], trait: "T", carry: "C", count: 25,
  rerollTarget: "", archetype: "standard" as const, avgLevel: 8,
  avgPlacement: 4, placementVar: 4, top4Rate: 0.5, winRate: 0.2, playRate: 0.1,
  units: [], traits: [], itemPriority: [], carries: [], starTargets: [],
  winners: { boards: 0, avgPlacement: 0, avgLevel: 0, avgGoldLeft: 0 },
  losers: { boards: 0, avgPlacement: 0, avgLevel: 0, avgGoldLeft: 0 },
  tier: "S", adjustedPlacement: 4.0,
};

describe("writeComps", () => {
  it("writes a JSON dataset to disk, creating folders", () => {
    writeComps(tmp, {
      generatedAt: "2026-07-22T00:00:00.000Z",
      patch: "test",
      sampleSize: 1,
      comps: [{
        signature: "T|C", signatures: ["T|C"], trait: "T", carry: "C", count: 25,
        rerollTarget: "", archetype: "standard" as const, avgLevel: 8,
        avgPlacement: 4, placementVar: 4, top4Rate: 0.5, winRate: 0.2, playRate: 0.1,
        units: [], traits: [], itemPriority: [], carries: [], starTargets: [],
        winners: { boards: 0, avgPlacement: 0, avgLevel: 0, avgGoldLeft: 0 },
        losers: { boards: 0, avgPlacement: 0, avgLevel: 0, avgGoldLeft: 0 }, tier: "S", adjustedPlacement: 4.0,
      }],
    });
    const parsed = JSON.parse(readFileSync(tmp, "utf-8"));
    expect(parsed.comps[0].tier).toBe("S");
    expect(parsed.comps[0].carry).toBe("C");
    expect(parsed.sampleSize).toBe(1);
  });

  // Four bands ship instead of one, and pretty-printing costs 46% of the file
  // for whitespace no human reads.
  it("writes without indentation, which nothing downstream needs", () => {
    writeComps(tmp, {
      generatedAt: "2026-07-22T00:00:00.000Z",
      patch: "test",
      sampleSize: 1,
      comps: [comp],
    });
    const raw = readFileSync(tmp, "utf-8");
    expect(raw).not.toContain("\n");
  });

  it("records which band it holds, so a file can say what it is", () => {
    writeComps(tmp, {
      generatedAt: "2026-07-22T00:00:00.000Z",
      patch: "test",
      band: "diamond-emerald",
      sampleSize: 1,
      comps: [comp],
    });
    expect(JSON.parse(readFileSync(tmp, "utf-8")).band).toBe("diamond-emerald");
  });
});
