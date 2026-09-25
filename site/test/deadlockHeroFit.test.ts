import { describe, expect, it } from "vitest";
import { heroFit, FIT_MIN_MATCHES } from "../src/deadlockHeroFit";
import type { HeroStat } from "../src/deadlockHeroStats";

const stat = (heroId: number, matches: number, wins: number): HeroStat => ({
  heroId,
  matches,
  wins,
  winRate: wins / matches,
  kda: 0,
  accuracy: null,
  critRate: null,
  soulsPerMin: null,
});

/** Los números reales de la cuenta de prueba (107253473) contra Arconte+ el 2026-09-22. */
const band = new Map([
  [7, 0.482], // Holliday
  [6, 0.478], // Warden
  [12, 0.519], // Lash
  [3, 0.473], // Infernus
]);

describe("heroFit", () => {
  it("elige los héroes donde te va mejor que a tu rango, el más claro primero", () => {
    const out = heroFit([stat(12, 32, 17), stat(7, 16, 10), stat(6, 11, 6), stat(3, 27, 12)], band);
    expect(out.map((f) => f.heroId)).toEqual([7, 6]);
    expect(out[0].bandWinRate).toBeCloseTo(0.482);
    expect(out[0].winRate).toBeCloseTo(10 / 16);
  });

  it("un 5-0 no le gana a una ventaja sostenida en muchas partidas", () => {
    // 5 de 5 contra 48%, y 30 de 45 (67%) contra 48%.
    const out = heroFit([stat(7, 5, 5), stat(6, 45, 30)], new Map([[7, 0.48], [6, 0.48]]), 3);
    expect(out[0].heroId).toBe(6);
  });

  it("deja afuera a los que no llegan al piso de partidas", () => {
    const pocas = stat(7, FIT_MIN_MATCHES - 1, FIT_MIN_MATCHES - 1);
    expect(heroFit([pocas], band)).toEqual([]);
  });

  it("deja afuera a los que están parejos con su rango", () => {
    // Lash: 53% contra 51,9% — casi lo mismo, no es una recomendación.
    expect(heroFit([stat(12, 32, 17)], band)).toEqual([]);
  });

  it("ignora héroes que la tier list de la banda no tiene", () => {
    expect(heroFit([stat(99, 40, 30)], band)).toEqual([]);
  });

  it("devuelve como mucho tres", () => {
    const muchos = [1, 2, 3, 4, 5].map((id) => stat(id, 40, 30));
    const todos = new Map([1, 2, 3, 4, 5].map((id) => [id, 0.5]));
    expect(heroFit(muchos, todos)).toHaveLength(3);
  });
});
