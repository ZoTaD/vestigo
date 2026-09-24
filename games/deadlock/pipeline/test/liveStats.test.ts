import { describe, it, expect } from "vitest";
import { countsFrom } from "../src/liveStats";

describe("countsFrom", () => {
  it("convierte las filas de hero-stats en lo que consume la mezcla", () => {
    const c = countsFrom(
      [
        { hero_id: 81, wins: 154, matches: 300 },
        { hero_id: 2, wins: 0, matches: 0 },
        { hero_id: 6, wins: 500, matches: 900 },
      ],
      "2026-09-16T22:41:46.000Z",
      "2026-09-19T20:00:00.000Z"
    );
    expect(c.rows).toEqual([
      { hero_id: 81, matches: 300, wins: 154 },
      { hero_id: 6, matches: 900, wins: 500 },
    ]);
    // 1.200 filas jugador-partida son 100 partidas de 12.
    expect(c.boards).toBe(1200);
    expect(c.matches).toBe(100);
    expect(c.from).toBe("2026-09-16");
    expect(c.to).toBe("2026-09-19");
  });
});

describe("countsFrom en Street Brawl", () => {
  it("cuenta partidas de 8 jugadores, no de 12", async () => {
    const { BRAWL_PLAYERS_PER_MATCH } = await import("../src/liveStats");
    const c = countsFrom([{ hero_id: 1, wins: 400, matches: 800 }], "2026-09-20T00:00:00Z", "2026-09-21T00:00:00Z", BRAWL_PLAYERS_PER_MATCH);
    expect(c.matches).toBe(100);
    expect(c.boards).toBe(800);
  });
});
