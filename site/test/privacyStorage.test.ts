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
 * policy and this test is what stops it. Since 2026-10-23 the policy lists the
 * keys without a number (the game tools kept adding them).
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
    // Only the files that touch localStorage count, so a sessionStorage key in
    // another file (pendingSearch, staleChunks) is not mistaken for one.
    for (const m of source.matchAll(/const\s+([A-Z_]+)\s*=\s*"(vestigo[.:][^"]+)"/g)) {
      // Sólo si esa constante se usa con localStorage en el mismo archivo: un
      // nombre de evento o una clave de sessionStorage no cuentan.
      if (new RegExp(`localStorage\\.(?:get|set|remove)Item\\(${m[1]}\\b`).test(source)) keys.add(m[2]);
    }
    for (const m of source.matchAll(/localStorage\.(?:get|set|remove)Item\("([^"]+)"/g)) {
      keys.add(m[1]);
    }
  }
  return [...keys].sort();
}

describe("the privacy policy's account of local storage", () => {
  it("finds every key the app actually writes", () => {
    // Fails loudly if a key is added, so the list below has to be revisited
    // rather than silently outgrown.
    expect(storageKeys()).toEqual([
      "vestigo.consent",
      "vestigo.dlItemsView",
      "vestigo.lang",
      "vestigo.lastProfile",
      "vestigo:valheim:planner",
      "vestigo:valheim:planner:have",
    ]);
  });

  // La política ya no dice cuántas son (2026-10-23): las herramientas de cada juego sumaban claves (el checklist y el
  // lector de partida de Stardew, entre otras) y el número quedaba viejo. Que no vuelva un número, y que nombre lo de
  // Stardew.
  it("doesn't state a count that can drift, and names what Stardew keeps", () => {
    const policy = readFileSync(join(SRC, "Privacy.tsx"), "utf-8").replace(/\s+/g, " ");
    expect(policy).not.toMatch(/(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve) items of local storage/);
    expect(policy).toContain("Community Center bundles you tick");
    expect(policy).toContain("save reader, what the page shows of it (never the file itself)");
  });

  // The claim that matters most to a reader: none of it leaves their machine.
  it("still promises the stored items are not sent to us", () => {
    const policy = readFileSync(join(SRC, "Privacy.tsx"), "utf-8");
    expect(policy.replace(/\s+/g, " ")).toContain("None of them is sent to us");
  });
});
