import { describe, expect, it } from "vitest";
import { AOE2_OCULTO, GAME_GROUPS } from "../src/gameGroups";
import { isHiddenPath } from "../src/sitemap";

describe("AoE2 oculto", () => {
  it.runIf(AOE2_OCULTO)("no está en el menú ni en ningún sitemap", () => {
    expect(GAME_GROUPS.flatMap((g) => g.games)).not.toContain("aoe2");
    expect(isHiddenPath("/en/aoe2")).toBe(true);
    expect(isHiddenPath("/es/aoe2/civilizaciones/franks")).toBe(true);
    expect(isHiddenPath("/en/coh3")).toBe(false);
  });
});
