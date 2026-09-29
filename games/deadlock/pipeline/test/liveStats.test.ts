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

  /**
   * Con `bucket=start_time_hour` la API devuelve una fila por héroe y por hora.
   * Sin bucket redondea la ventana al día entero (medido el 2026-09-29: pedir
   * desde las 20:25 daba las 243.324 filas de todo el día).
   */
  it("suma las horas de cada héroe y sólo cuenta las horas enteras de la ventana", () => {
    const h = (iso: string) => Date.parse(iso) / 1000;
    const c = countsFrom(
      [
        // 20:00–21:00 mezcla 25 minutos del parche anterior: afuera.
        { hero_id: 1, matches: 99, wins: 50, bucket: h("2026-09-29T20:00:00Z") },
        { hero_id: 1, matches: 10, wins: 6, bucket: h("2026-09-29T21:00:00Z") },
        { hero_id: 1, matches: 5, wins: 2, bucket: h("2026-09-29T22:00:00Z") },
        { hero_id: 2, matches: 7, wins: 1, bucket: h("2026-09-29T22:00:00Z") },
        // 23:00–24:00 todavía no terminó a las 23:30: afuera.
        { hero_id: 2, matches: 40, wins: 20, bucket: h("2026-09-29T23:00:00Z") },
      ],
      "2026-09-29T20:25:11Z",
      "2026-09-29T23:30:00Z",
      1
    );
    expect(c.rows).toEqual([
      { hero_id: 1, matches: 15, wins: 8 },
      { hero_id: 2, matches: 7, wins: 1 },
    ]);
    expect(c.boards).toBe(22);
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
