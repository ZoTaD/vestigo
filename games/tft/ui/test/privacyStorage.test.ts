import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The privacy policy states how many things the site keeps in the visitor's
 * browser. That sentence drifted once already — it said "two" for weeks after
 * the rank filter shipped a third — and nothing failed, because prose does not
 * compile.
 *
 * So the source is the referee. Add a localStorage key without saying so in the
 * policy and this test is what stops it.
 */

const SRC = join(__dirname, "..", "src");

/** Every distinct localStorage key written anywhere in the app. */
function storageKeys(): string[] {
  const keys = new Set<string>();
  for (const file of readdirSync(SRC)) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
    const source = readFileSync(join(SRC, file), "utf-8");
    if (!source.includes("localStorage")) continue;
    // Both spellings in use: a named constant, and the literal passed inline.
    for (const m of source.matchAll(/(?:STORAGE_KEY|CONSENT_KEY)\s*=\s*"([^"]+)"/g)) {
      keys.add(m[1]);
    }
    for (const m of source.matchAll(/localStorage\.(?:get|set|remove)Item\("([^"]+)"/g)) {
      keys.add(m[1]);
    }
  }
  return [...keys].sort();
}

const NUMBER_WORDS: Record<number, string> = {
  1: "One",
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
};

describe("the privacy policy's account of local storage", () => {
  it("finds every key the app actually writes", () => {
    // Fails loudly if a key is added, so the list below has to be revisited
    // rather than silently outgrown.
    expect(storageKeys()).toEqual([
      "vestigo.band",
      "vestigo.consent",
      "vestigo.lang",
      "vestigo.lastPlayer",
    ]);
  });

  it("states the same number of items the code stores", () => {
    const policy = readFileSync(join(SRC, "Privacy.tsx"), "utf-8");
    const expected = NUMBER_WORDS[storageKeys().length];
    expect(expected, "no word for that many keys — extend NUMBER_WORDS").toBeDefined();
    expect(policy).toContain(`${expected} items of local storage`);
  });

  // The claim that matters most to a reader: none of it leaves their machine.
  it("still promises the stored items are not sent to us", () => {
    const policy = readFileSync(join(SRC, "Privacy.tsx"), "utf-8");
    expect(policy.replace(/\s+/g, " ")).toContain("None of them is sent to us");
  });
});
