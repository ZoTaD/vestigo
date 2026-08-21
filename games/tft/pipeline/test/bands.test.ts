import { describe, it, expect } from "vitest";
import { BANDS, EXCLUSIVE, DEFAULT_BAND, bandOf, bandPath, bandCovers } from "../src/bands";

/** Every ranked tier Riot fields. If TFT adds one, this list is where it lands. */
const LADDER = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];

describe("bandOf", () => {
  it("ignores the division, which does not change which comps win", () => {
    expect(bandOf("DIAMOND II")?.id).toBe("diamond-emerald");
    expect(bandOf("DIAMOND IV")?.id).toBe("diamond-emerald");
  });

  it("reads apex tiers, which the puller writes lowercase and without division", () => {
    expect(bandOf("challenger")?.id).toBe("apex");
    expect(bandOf("grandmaster")?.id).toBe("apex");
    expect(bandOf("master")?.id).toBe("apex");
  });

  it("groups the ladder below diamond into two bands", () => {
    expect(bandOf("PLATINUM II")?.id).toBe("platinum-gold");
    expect(bandOf("GOLD IV")?.id).toBe("platinum-gold");
    expect(bandOf("SILVER II")?.id).toBe("silver-below");
    expect(bandOf("BRONZE III")?.id).toBe("silver-below");
    expect(bandOf("IRON IV")?.id).toBe("silver-below");
  });

  it("counts untagged matches as apex, since they predate tier tagging", () => {
    expect(bandOf("")?.id).toBe("apex");
  });

  it("returns nothing for a tier it does not know, rather than guessing", () => {
    expect(bandOf("SUPERMASTER I")).toBeUndefined();
  });
});

describe("the band table", () => {
  it("places every ranked tier in exactly one of the exclusive bands", () => {
    for (const tier of LADDER) {
      const hits = EXCLUSIVE.filter((b) => b.tiers.includes(tier.toLowerCase()));
      expect(hits.map((b) => b.id), `${tier} should belong to one band`).toHaveLength(1);
    }
  });

  it("covers no tier that does not exist, so a typo cannot hide a whole band", () => {
    const known = new Set(LADDER.map((t) => t.toLowerCase()));
    for (const band of BANDS) {
      for (const tier of band.tiers) expect(known, `${band.id} lists ${tier}`).toContain(tier);
    }
  });

  it("starts at the default band, the one the bundle ships with", () => {
    expect(BANDS[0].id).toBe(DEFAULT_BAND);
    expect(DEFAULT_BAND).toBe("global");
  });
});

describe("the global band", () => {
  // The default cut every competitor uses: MetaTFT opens on Platinum+ and
  // tactics.tools on Diamond+. It deliberately overlaps the exclusive bands.
  it("covers platinum and everything above it", () => {
    for (const tier of ["PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"]) {
      expect(bandCovers("global", tier), `global should cover ${tier}`).toBe(true);
    }
  });

  it("stops at gold, so it stays the cut it claims to be", () => {
    for (const tier of ["GOLD", "SILVER", "BRONZE", "IRON"]) {
      expect(bandCovers("global", tier), `global should not cover ${tier}`).toBe(false);
    }
  });

  it("is never used to classify a match, only to publish one", () => {
    expect(EXCLUSIVE.map((b) => b.id)).not.toContain("global");
    // A diamond match still belongs to its own band, not to the overlay.
    expect(bandOf("DIAMOND II")?.id).toBe("diamond-emerald");
  });
});

describe("bandPath", () => {
  it("leaves the default band on the plain filename the bundle imports", () => {
    expect(bandPath("../data/comps.json", "global")).toBe("../data/comps.json");
  });

  it("suffixes every other band before the extension", () => {
    expect(bandPath("../data/comps.json", "apex")).toBe("../data/comps.apex.json");
    expect(bandPath("../data/comps.json", "diamond-emerald")).toBe(
      "../data/comps.diamond-emerald.json"
    );
    expect(bandPath("../data/units.json", "silver-below")).toBe("../data/units.silver-below.json");
  });
});
