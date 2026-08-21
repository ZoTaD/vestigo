import { describe, it, expect } from "vitest";
import {
  BANDS,
  EXCLUSIVE,
  DEFAULT_BAND,
  BAND_LADDER,
  bandAbove,
  bandForTier,
  isBandId,
  bandDataPath,
} from "../src/bands";
import global from "@data/comps.json";
import apex from "@data/comps.apex.json";
import diamond from "@data/comps.diamond-emerald.json";
import platinum from "@data/comps.platinum-gold.json";
import silver from "@data/comps.silver-below.json";

describe("bandForTier", () => {
  it("maps the rank Riot reports to the band whose meta applies", () => {
    // Riot answers with the tier alone ("GOLD") and the division separately.
    expect(bandForTier("GOLD")).toBe("platinum-gold");
    expect(bandForTier("DIAMOND")).toBe("diamond-emerald");
    expect(bandForTier("CHALLENGER")).toBe("apex");
    expect(bandForTier("IRON")).toBe("silver-below");
  });

  it("accepts a tier with its division attached, as the store writes it", () => {
    expect(bandForTier("GOLD IV")).toBe("platinum-gold");
  });

  it("has no band for an unranked player, who must be told so", () => {
    expect(bandForTier("")).toBeNull();
    expect(bandForTier("UNRANKED")).toBeNull();
  });
});

describe("isBandId", () => {
  it("accepts the published bands and nothing else", () => {
    expect(isBandId("global")).toBe(true);
    expect(isBandId("apex")).toBe(true);
    expect(isBandId("silver-below")).toBe(true);
    expect(isBandId("diamante")).toBe(false);
    expect(isBandId("jinx")).toBe(false);
  });
});

describe("the default band", () => {
  // Every competitor opens on a cumulative cut — MetaTFT on Platinum+,
  // tactics.tools on Diamond+ — and it is by far our largest sample.
  it("is the overlapping Platinum+ cut", () => {
    expect(DEFAULT_BAND).toBe("global");
    expect(BANDS[0].id).toBe("global");
  });

  it("never claims a player, so 'the band above yours' stays well defined", () => {
    expect(EXCLUSIVE.map((b) => b.id)).not.toContain("global");
    expect(bandForTier("PLATINUM")).toBe("platinum-gold");
    expect(bandForTier("CHALLENGER")).toBe("apex");
  });
});

// The pipeline owns the band table; this file restates it for the browser. A
// mismatch would silently serve one band's numbers under another's name, so the
// files themselves are the referee.
describe("the band table matches the files the pipeline wrote", () => {
  const files: Record<string, { band?: string; sampleSize: number; patchLabel?: string }> = {
    global,
    apex,
    "diamond-emerald": diamond,
    "platinum-gold": platinum,
    "silver-below": silver,
  };

  it("covers exactly the bands that exist on disk", () => {
    expect(BANDS.map((b) => b.id).sort()).toEqual(Object.keys(files).sort());
  });

  it("reads each band from the file that says it is that band", () => {
    for (const band of BANDS) {
      expect(files[band.id].band, `${band.id} data file`).toBe(band.id);
    }
  });

  // Every band is built from one patch, and they must all be the same one or
  // the picker would be silently comparing different games.
  it("builds every band from the same patch", () => {
    const labels = new Set(BANDS.map((b) => files[b.id].patchLabel));
    expect(labels.size, `patch labels: ${[...labels].join(", ")}`).toBe(1);
  });

  it("keeps the default band on the plain filename the bundle imports", () => {
    expect(bandDataPath(DEFAULT_BAND)).toBe("comps.json");
    expect(bandDataPath("apex")).toBe("comps.apex.json");
    expect(bandDataPath("silver-below")).toBe("comps.silver-below.json");
  });
});

describe("the band ladder", () => {
  it("orders the exclusive bands from the bottom of the ladder up", () => {
    expect(BAND_LADDER).toEqual([
      "silver-below",
      "platinum-gold",
      "diamond-emerald",
      "apex",
    ]);
  });

  // The coach compares against one step up, never against the ceiling: advice
  // drawn from apex handed to a Silver player describes a different game.
  it("names the next step up, and nothing above apex", () => {
    expect(bandAbove("silver-below")).toBe("platinum-gold");
    expect(bandAbove("platinum-gold")).toBe("diamond-emerald");
    expect(bandAbove("diamond-emerald")).toBe("apex");
    expect(bandAbove("apex")).toBeNull();
  });

  // The overlapping default band claims no player, so it has no step above it.
  it("has no rung for the overlapping default band", () => {
    expect(BAND_LADDER).not.toContain("global");
    expect(bandAbove("global")).toBeNull();
  });

  it("holds exactly the bands that partition the ladder", () => {
    expect([...BAND_LADDER].sort()).toEqual(EXCLUSIVE.map((b) => b.id).sort());
  });
});
