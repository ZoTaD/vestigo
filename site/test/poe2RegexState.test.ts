import { describe, expect, it } from "vitest";
import { cleanState } from "../src/poe2Regex/Poe2Regex";

/**
 * El estado del Regex viaja en el link (`?r=`) y el link lo puede armar
 * cualquiera. Lo que no tiene la forma esperada se descarta en vez de tirar la
 * pestaña (auditoría de seguridad, 2026-09-28).
 */
const base = {
  mode: "waystone" as const,
  game: "en" as const,
  match: "any" as const,
  sel: {},
  tier: [1, 16] as [number, number],
  corr: "any" as const,
  rar: [],
  head: {},
};

describe("cleanState", () => {
  it("conserva un estado bien formado", () => {
    const s = { mode: "gear", game: "es", match: "all", sel: { "gear:3": { w: true, min: 20 } }, tier: [5, 12], corr: "no", rar: ["Rare"], head: { pack: 30 } };
    expect(cleanState(s, base)).toEqual(s);
  });

  it("descarta modos, formas y tipos que no existen", () => {
    const s = cleanState(
      { mode: "__proto__", game: "xx", match: 1, sel: { "gear:1": "x", malo: { w: true }, "tablet:2": { w: "si" } }, tier: [0, 1e9], corr: {}, rar: ["Unique", "Magic"], head: { pack: "30", otro: 1 } },
      base
    );
    expect(s).toEqual({ ...base, tier: [1, 16], rar: ["Magic"] });
  });

  it("algo que no es un objeto vuelve al estado de siempre", () => {
    for (const raw of [null, 3, "x", [1, 2]]) expect(cleanState(raw, base)).toEqual(base);
  });
});
