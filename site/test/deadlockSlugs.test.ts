import { describe, expect, it } from "vitest";
import { heroes, items } from "../src/deadlockSlugs";

describe("deadlockSlugs", () => {
  it("arma un slug por cada héroe con datos en la banda por defecto", () => {
    expect(heroes.toId.size).toBeGreaterThan(0);
    expect(heroes.toSlug.size).toBe(heroes.toId.size);
  });

  it("arma un slug por cada ítem con datos en la banda por defecto", () => {
    expect(items.toId.size).toBeGreaterThan(0);
    expect(items.toSlug.size).toBe(items.toId.size);
  });

  it("los slugs de héroe van y vuelven", () => {
    for (const [slug, id] of heroes.toId) {
      expect(heroes.toSlug.get(id)).toBe(slug);
    }
  });

  it("los slugs de ítem van y vuelven", () => {
    for (const [slug, id] of items.toId) {
      expect(items.toSlug.get(id)).toBe(slug);
    }
  });

  it("los slugs son minúsculas y con guiones, sin espacios", () => {
    for (const slug of heroes.toId.keys()) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
