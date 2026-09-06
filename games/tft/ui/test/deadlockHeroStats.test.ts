import { describe, it, expect } from "vitest";
import { heroStatsOf, HERO_STATS_MIN, type RawHeroStat } from "../src/deadlockHeroStats";

/** Una fila cruda de `players/hero-stats`, con lo mínimo y lo que cada prueba pida. */
function crudo(over: Partial<RawHeroStat> = {}): RawHeroStat {
  return {
    hero_id: 1,
    matches_played: 10,
    wins: 5,
    kills: 50,
    deaths: 50,
    assists: 50,
    accuracy: 0.6,
    crit_shot_rate: 0.15,
    networth_per_min: 1000,
    ...over,
  };
}

describe("heroStatsOf", () => {
  it("deriva el winrate de las partidas ganadas, no lo copia de ningún campo", () => {
    const [h] = heroStatsOf([crudo({ matches_played: 20, wins: 13 })]);
    expect(h.winRate).toBeCloseTo(0.65, 6);
  });

  /**
   * La misma convención que `summarize`: las muertes en cero se tratan como una.
   * Sin eso, una carrera perfecta con un héroe devuelve `Infinity` y la tarjeta
   * dibuja el símbolo de infinito donde tendría que ir un número.
   */
  it("sin muertes el KDA no es infinito", () => {
    const [h] = heroStatsOf([crudo({ kills: 8, assists: 4, deaths: 0 })]);
    expect(h.kda).toBe(12);
    expect(Number.isFinite(h.kda)).toBe(true);
  });

  it("ordena por partidas jugadas, de mayor a menor", () => {
    const stats = heroStatsOf([
      crudo({ hero_id: 1, matches_played: 8 }),
      crudo({ hero_id: 2, matches_played: 31 }),
      crudo({ hero_id: 3, matches_played: 16 }),
    ]);
    expect(stats.map((h) => h.heroId)).toEqual([2, 3, 1]);
  });

  /**
   * El piso existe para que el winrate signifique algo: "100% con Lash" sobre
   * una partida es la partida, no el héroe.
   */
  it("deja afuera a los héroes que no llegan al piso de partidas", () => {
    const stats = heroStatsOf(
      [crudo({ hero_id: 1, matches_played: 1 }), crudo({ hero_id: 2, matches_played: 9 })],
      3
    );
    expect(stats.map((h) => h.heroId)).toEqual([2]);
    expect(HERO_STATS_MIN).toBeGreaterThanOrEqual(2);
  });

  /**
   * La precisión viaja como fracción, igual que llega de la API. Convertirla a
   * porcentaje acá obligaría a la tarjeta a saber si el número ya viene
   * multiplicado, que es de donde salen los "6350%".
   */
  it("la precisión pasa como fracción, sin convertir a porcentaje", () => {
    const [h] = heroStatsOf([crudo({ accuracy: 0.635, crit_shot_rate: 0.144 })]);
    expect(h.accuracy).toBeCloseTo(0.635, 6);
    expect(h.critRate).toBeCloseTo(0.144, 6);
  });

  /**
   * Los campos que la API puede no mandar quedan en `null`, no en cero: un cero
   * de precisión diría "nunca acertó un tiro". Es la misma regla de los huecos
   * que ya rige la tabla de héroes.
   */
  it("una precisión ausente es un hueco, no un cero", () => {
    const [h] = heroStatsOf([crudo({ accuracy: undefined, crit_shot_rate: undefined })]);
    expect(h.accuracy).toBeNull();
    expect(h.critRate).toBeNull();
  });

  it("sin héroes no hay tabla, y no revienta", () => {
    expect(heroStatsOf([])).toEqual([]);
  });
});
