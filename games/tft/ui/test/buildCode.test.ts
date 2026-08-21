import { describe, it, expect } from "vitest";
import { buildCode, hasBuildCode } from "../src/buildCode";

const SUFFIX = "TFTSet17";
const EMPTY = "02" + "000".repeat(10) + SUFFIX;

describe("buildCode", () => {
  // The proof this whole feature rests on: encoding a comp must reproduce the
  // exact string the game itself prints. This comp's real in-game code is known.
  it("reproduces a real in-game code for a known comp", () => {
    expect(
      buildCode([
        "TFT17_Akali",
        "TFT17_Kindred",
        "TFT17_Morgana",
        "TFT17_Jax",
        "TFT17_Maokai",
        "TFT17_Urgot",
        "TFT17_Aatrox",
        "TFT17_Caitlyn",
      ])
    ).toBe("0200d01f05802c01e02401d01b000000TFTSet17");
  });

  it("pads the ten slots and always ends with the set suffix", () => {
    const code = buildCode(["TFT17_Akali"]);
    expect(code.endsWith(SUFFIX)).toBe(true);
    expect(code).toHaveLength(2 + 30 + SUFFIX.length);
  });

  it("skips a champion with no team id instead of emitting a broken slot", () => {
    // Summoned units (a golem) have no teamId and must simply be left out.
    expect(buildCode(["TFT17_Akali", "TFT_BlueGolem"])).toBe(buildCode(["TFT17_Akali"]));
  });

  it("never emits more than the ten slots the planner has", () => {
    const many = Array.from({ length: 15 }, () => "TFT17_Akali");
    expect(buildCode(many)).toHaveLength(2 + 30 + SUFFIX.length);
  });
});

describe("hasBuildCode", () => {
  it("is true when at least one champion can be encoded", () => {
    expect(hasBuildCode(["TFT17_Akali"])).toBe(true);
  });

  it("is false when nothing maps to a code, so the button can hide", () => {
    expect(hasBuildCode(["TFT_BlueGolem"])).toBe(false);
    expect(hasBuildCode([])).toBe(false);
    expect(buildCode([])).toBe(EMPTY);
  });
});
