import { describe, it, expect } from "vitest";
import { units, items, comps, detailPaths } from "../src/slugs";

/**
 * These run against the real catalog, so they also act as a check on the data:
 * a set change that broke naming would fail here rather than ship a sitemap
 * full of empty or colliding URLs.
 */

const maps = [
  ["units", units],
  ["items", items],
  ["comps", comps],
] as const;

describe.each(maps)("%s slugs", (name, map) => {
  it("has an entry for everything", () => {
    expect(map.toSlug.size).toBeGreaterThan(0);
    expect(map.toId.size).toBe(map.toSlug.size);
  });

  it("round-trips id → slug → id", () => {
    for (const [id, slug] of map.toSlug) {
      expect(map.toId.get(slug)).toBe(id);
    }
  });

  it("produces no empty slugs", () => {
    for (const slug of map.toSlug.values()) expect(slug).not.toBe("");
  });

  it("produces URL-safe slugs only", () => {
    for (const slug of map.toSlug.values()) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it(`gives every ${name} a distinct address`, () => {
    const all = [...map.toSlug.values()];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("detailPaths", () => {
  it("covers all three kinds", () => {
    const paths = detailPaths();
    const kinds = new Set(paths.map((p) => p.section));
    expect(kinds).toEqual(new Set(["units", "items", "meta"]));
    expect(paths.length).toBe(units.toSlug.size + items.toSlug.size + comps.toSlug.size);
  });
});
