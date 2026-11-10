import { describe, expect, it } from "vitest";
import { toRow } from "../src/proMatches";

describe("toRow", () => {
  const shop = new Set([10, 20, 30]);
  const abilities = new Set([1, 2]);
  const partida = {
    match_id: 5,
    start_time: "2026-11-10 16:00:00",
    winning_team: "Team1",
    duration_s: 1800,
    players: [],
  };
  const jugador = {
    account_id: 9,
    hero_id: 7,
    team: "Team1",
    kills: 3,
    deaths: 1,
    assists: 8,
    net_worth: 40000,
    player_rank_initial_display_rank: 112,
    assigned_lane: 4,
    items: [
      { game_time_s: 300, item_id: 20 },
      { game_time_s: 10, item_id: 1 },
      { game_time_s: 100, item_id: 10, sold_time_s: 900 },
      { game_time_s: 200, item_id: 2 },
      { game_time_s: 4294967290, item_id: 30 },
      { game_time_s: 400, item_id: 999 },
    ],
  };

  it("deja los objetos con que terminó, en orden de compra, y el orden de habilidades", () => {
    const r = toRow(partida, jugador, shop, abilities);
    expect(r.slice(0, 11)).toEqual([5, 9, Date.UTC(2026, 10, 10, 16) / 1000, 1800, 1, 3, 1, 8, 40000, 112, 4]);
    // El 10 se vendió, el 30 trae la hora envuelta y el 999 no es de la tienda.
    expect(r[11]).toEqual([20]);
    expect(r[12]).toEqual([1, 2]);
  });
});
