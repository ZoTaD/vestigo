import { describe, it, expect } from "vitest";
import { toParticipants } from "../src/riot/normalize";
import { sampleMatch } from "./fixtures/match.sample";

describe("toParticipants", () => {
  it("extracts puuid, placement, units with items, and traits", () => {
    const result = toParticipants(sampleMatch);
    expect(result).toHaveLength(2);
    expect(result[0].puuid).toBe("p1");
    expect(result[0].placement).toBe(1);
    expect(result[0].level).toBe(8);
    expect(result[0].units[0]).toEqual({
      character_id: "TFT17_Zoe",
      tier: 3,
      rarity: 2,
      items: ["TFT_Item_Deathblade"],
    });
    expect(result[0].traits[1]).toEqual({
      name: "TFT17_Sorcerer",
      numUnits: 6,
      tierCurrent: 3,
      tierTotal: 4,
    });
  });
});
