import { describe, it, expect } from "vitest";
import { toLobby, RARITY_TO_COST } from "../src/normalize";

// Fixtures are unmodified matches copied out of the real store, so the parser
// meets the actual quirks rather than tidy invented ones.
import contested from "./fixtures/NA1_5605803885.json";
import partial from "./fixtures/NA1_5601977115.json";
import duplicated from "./fixtures/NA1_5592994086.json";

const raw = (f: unknown) => (f as { match: unknown }).match;

describe("RARITY_TO_COST", () => {
  // Measured across all 3758 stored boards: rarity is not cost-1, it skips.
  it("maps Riot's rarity index to real gold cost", () => {
    expect(RARITY_TO_COST[0]).toBe(1);
    expect(RARITY_TO_COST[2]).toBe(3);
    expect(RARITY_TO_COST[4]).toBe(4);
    expect(RARITY_TO_COST[6]).toBe(5);
  });
});

describe("toLobby", () => {
  it("reads match metadata and every board", () => {
    const lobby = toLobby(raw(contested));
    expect(lobby.matchId).toBe("NA1_5605803885");
    expect(lobby.set).toBe(17);
    expect(lobby.boards).toHaveLength(8);
    expect(lobby.boards.map((b) => b.placement).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it("carries the Riot ID through, so the lobby is nameable without extra calls", () => {
    const lobby = toLobby(raw(contested));
    for (const board of lobby.boards) {
      expect(board.gameName.length).toBeGreaterThan(0);
      expect(board.tagLine.length).toBeGreaterThan(0);
    }
  });

  it("resolves unit cost through the rarity table, not rarity+1", () => {
    const lobby = toLobby(raw(contested));
    const costs = lobby.boards.flatMap((b) => b.units.map((u) => u.cost));
    // A 4-cost carries rarity 4; rarity+1 would wrongly report cost 5.
    expect(costs.every((c) => c >= 0 && c <= 5)).toBe(true);
    expect(costs.some((c) => c === 4)).toBe(true);
  });

  it("collapses a champion listed twice down to the most-invested copy", () => {
    const lobby = toLobby(raw(duplicated));
    for (const board of lobby.boards) {
      const ids = board.units.map((u) => u.id);
      expect(new Set(ids).size, `board ${board.gameName}`).toBe(ids.length);
    }
  });

  it("survives a lobby with fewer than eight players", () => {
    const lobby = toLobby(raw(partial));
    expect(lobby.boards.length).toBeGreaterThan(0);
    expect(lobby.boards.length).toBeLessThan(8);
  });

  it("keeps only traits that are actually active", () => {
    const lobby = toLobby(raw(contested));
    for (const board of lobby.boards) {
      for (const trait of board.traits) expect(trait.tier).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not throw on a payload missing its participants", () => {
    expect(() => toLobby({ metadata: { match_id: "X" }, info: {} })).not.toThrow();
    expect(toLobby({ metadata: { match_id: "X" }, info: {} }).boards).toEqual([]);
  });
});

/**
 * Fields Riot reports that nothing reads yet. They are captured because the raw
 * payload is already stored: taking them now is free, and wanting them later
 * would mean re-downloading the whole store.
 */
describe("the supplementary participant fields", () => {
  const match = (over: Record<string, unknown> = {}) => ({
    metadata: { match_id: "LA2_1" },
    info: {
      tft_set_number: 17,
      tft_game_type: "standard",
      participants: [
        {
          puuid: "p1",
          placement: 3,
          level: 8,
          gold_left: 4,
          last_round: 30,
          units: [],
          traits: [{ name: "Conduit", num_units: 4, tier_current: 2, tier_total: 4, style: 3 }],
          ...over,
        },
      ],
    },
  });

  it("carries eliminations, time survived and damage through", () => {
    const board = toLobby(
      match({ players_eliminated: 2, time_eliminated: 1834.5, total_damage_to_players: 91 })
    ).boards[0];
    expect(board.eliminations).toBe(2);
    expect(board.survivedFor).toBe(1834.5);
    expect(board.damageDealt).toBe(91);
  });

  it("keeps a trait's style, which is not its breakpoint", () => {
    const trait = toLobby(match()).boards[0].traits[0];
    expect(trait.tier).toBe(2);
    expect(trait.style).toBe(3);
  });

  // Zero eliminations is the most common real answer there is, so a defaulted
  // zero would erase the difference between that and a silent payload.
  it("leaves an absent field absent rather than defaulting it to zero", () => {
    const board = toLobby(match()).boards[0];
    expect(board.eliminations).toBeUndefined();
    expect(board.survivedFor).toBeUndefined();
    expect(board.damageDealt).toBeUndefined();
  });

  it("keeps a real zero", () => {
    const board = toLobby(match({ players_eliminated: 0 })).boards[0];
    expect(board.eliminations).toBe(0);
  });
});
