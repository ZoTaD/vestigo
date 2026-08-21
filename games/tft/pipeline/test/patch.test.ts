import { describe, it, expect } from "vitest";
import { patchOf, patchLabel, comparePatches, newestPatch, newestPatches } from "../src/patch";

describe("patchOf", () => {
  it("reads the client version out of what Riot stamps on a match", () => {
    expect(patchOf("Linux Version 16.14.794.5912 (Jul 10 2026/14:56:00) [PUBLIC] <Releases/16.14>"))
      .toBe("16.14");
  });

  it("returns nothing when the field is missing or unrecognised", () => {
    expect(patchOf("")).toBe("");
    expect(patchOf("something else entirely")).toBe("");
  });
});

describe("comparePatches", () => {
  // "16.9" > "16.10" under string comparison, which would pick the wrong patch
  // as the newest one for a whole month every time the minor rolls past nine.
  it("orders by number, not alphabetically", () => {
    expect(comparePatches("16.9", "16.10")).toBeLessThan(0);
    expect(comparePatches("16.14", "16.9")).toBeGreaterThan(0);
    expect(comparePatches("16.13", "16.13")).toBe(0);
  });

  it("orders across a major version", () => {
    expect(comparePatches("16.24", "17.1")).toBeLessThan(0);
  });
});

describe("newestPatch", () => {
  it("picks the highest, whatever order they arrive in", () => {
    expect(newestPatch(["16.9", "16.14", "16.8", "16.13"])).toBe("16.14");
  });

  it("has no answer for an empty store", () => {
    expect(newestPatch([])).toBe("");
  });
});

describe("newestPatches", () => {
  it("picks the top N distinct patches, newest first, whatever order they arrive in", () => {
    expect(newestPatches(["16.9", "16.14", "16.8", "16.13"], 2)).toEqual(["16.14", "16.13"]);
  });

  it("collapses duplicates before picking: a patch with a thousand matches still counts once", () => {
    expect(newestPatches(["16.14", "16.14", "16.14", "16.13"], 2)).toEqual(["16.14", "16.13"]);
  });

  it("returns fewer than N when there are not that many distinct patches", () => {
    expect(newestPatches(["16.14"], 2)).toEqual(["16.14"]);
  });

  it("has no answer for an empty list", () => {
    expect(newestPatches([], 2)).toEqual([]);
  });

  it("ignores blank entries, same as newestPatch", () => {
    expect(newestPatches(["", "16.14", ""], 2)).toEqual(["16.14"]);
  });
});

describe("patchLabel", () => {
  // Riot's client version is 16.x; players and every competitor say "17.7",
  // meaning the seventh patch of Set 17. Verified against our own data: Set 17
  // starts at client 16.8, and MetaTFT and tactics.tools both call 16.14 "17.7".
  it("names the patch the way players do", () => {
    expect(patchLabel(17, "16.8")).toBe("17.1");
    expect(patchLabel(17, "16.14")).toBe("17.7");
  });

  it("falls back to the raw version for a set it has no start for", () => {
    expect(patchLabel(99, "16.14")).toBe("16.14");
  });

  it("falls back rather than invent a number for a patch before the set began", () => {
    expect(patchLabel(17, "16.7")).toBe("16.7");
  });
});
