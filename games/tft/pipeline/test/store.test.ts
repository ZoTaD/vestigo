import { describe, it, expect, afterAll } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { ensureStore, hasMatch, saveMatch, loadAllBoards, loadRawMatches, countMatches, isComparable } from "../src/store";
import type { RawMatch } from "../src/riot/normalize";

const root = "test/.tmpstore";
afterAll(() => { if (existsSync(root)) rmSync(root, { recursive: true, force: true }); });

function rawMatch(placements: number[]): RawMatch {
  return {
    info: {
      participants: placements.map((placement) => ({
        puuid: "p" + placement,
        placement,
        level: 8,
        units: [{ character_id: "TFT17_Zoe", tier: 2, rarity: 2, itemNames: ["TFT_Item_Deathblade"] }],
        traits: [{ name: "TFT17_Sorcerer", num_units: 6, tier_current: 3, tier_total: 4 }],
      })),
    },
  } as RawMatch;
}

describe("store", () => {
  it("reports a match absent before saving and present after", () => {
    const dir = `${root}/a`;
    ensureStore(dir);
    expect(countMatches(dir)).toBe(0);
    expect(hasMatch(dir, "NA1_1")).toBe(false);

    saveMatch(dir, "NA1_1", "2026-07-22T00:00:00.000Z", rawMatch([1, 2]));

    expect(hasMatch(dir, "NA1_1")).toBe(true);
    expect(countMatches(dir)).toBe(1);
  });

  it("keeps the raw payload verbatim so new fields survive", () => {
    const dir = `${root}/raw`;
    saveMatch(dir, "NA1_9", "2026-07-22T00:00:00.000Z", rawMatch([1]));

    const stored = loadRawMatches(dir);
    expect(stored).toHaveLength(1);
    expect(stored[0].matchId).toBe("NA1_9");
    // `level` is not part of our normalized shape, but must still be on disk.
    expect((stored[0].match.info.participants[0] as unknown as { level: number }).level).toBe(8);
  });

  it("normalizes boards on read, accumulating across matches", () => {
    const dir = `${root}/b`;
    saveMatch(dir, "NA1_1", "2026-07-22T00:00:00.000Z", rawMatch([1, 2]));
    saveMatch(dir, "NA1_2", "2026-07-22T00:00:00.000Z", rawMatch([3]));

    expect(countMatches(dir)).toBe(2);
    const boards = loadAllBoards(dir);
    expect(boards).toHaveLength(3);
    expect(boards.map((b) => b.placement).sort()).toEqual([1, 2, 3]);
    expect(boards[0].units[0].items).toEqual(["TFT_Item_Deathblade"]);
  });

  it("treats a missing directory as empty rather than failing", () => {
    expect(loadAllBoards(`${root}/nope`)).toEqual([]);
    expect(loadRawMatches(`${root}/nope`)).toEqual([]);
    expect(countMatches(`${root}/nope`)).toBe(0);
    expect(hasMatch(`${root}/nope`, "NA1_1")).toBe(false);
  });
});

describe("isComparable", () => {
  const lobby = (
    over: Partial<import("../src/store").LobbyRecord> = {}
  ): import("../src/store").LobbyRecord => ({
    matchId: "M1",
    set: 17,
    queueId: 1100,
    gameType: "standard",
    gameVersion: "Linux Version 16.14.794.5912 [PUBLIC] <Releases/16.14>",
    tier: "challenger",
    boards: [{}, {}] as never[],
    ...over,
  });

  it("accepts a ranked lobby of the current set", () => {
    expect(isComparable(lobby(), 17)).toBe(true);
  });

  it("rejects Double Up, whose players share an economy", () => {
    expect(isComparable(lobby({ queueId: 1160, gameType: "pairs" }), 17)).toBe(false);
  });

  it("rejects PvE, which has no opponents", () => {
    expect(
      isComparable(lobby({ queueId: 1220, gameType: "pve", boards: [{}] as never[] }), 17)
    ).toBe(false);
  });

  // These three all report tft_game_type "standard" and eight boards, so the
  // old gameType check let every one of them into the published meta.
  it("rejects normal games, which are standard but not ranked", () => {
    expect(isComparable(lobby({ queueId: 1090 }), 17)).toBe(false);
  });

  it("rejects the event modes that call themselves standard", () => {
    // 1210 is Choncc's Treasure, named that way in Riot's queues.json.
    expect(isComparable(lobby({ queueId: 1210 }), 17)).toBe(false);
    // 6120 ran from 10 June to 14 July and died the day patch 16.14 landed.
    expect(isComparable(lobby({ queueId: 6120 }), 17)).toBe(false);
  });

  it("rejects a lobby whose payload never said which queue it was", () => {
    expect(isComparable(lobby({ queueId: 0 }), 17)).toBe(false);
  });

  it("rejects an older set, which is a different game", () => {
    expect(isComparable(lobby({ set: 16 }), 17)).toBe(false);
  });

  it("rejects a lobby with nobody to compare against", () => {
    expect(isComparable(lobby({ boards: [{}] as never[] }), 17)).toBe(false);
  });
});
