import type { HeroStat } from "./deadlockHeroStats";

/**
 * "¿Qué héroe te conviene jugar más?": los héroes con los que te va mejor que
 * a la gente de tu rango.
 *
 * **Se cruzan dos cosas que el perfil ya tiene, sin pedidos nuevos**: tu carrera
 * por héroe (`/players/hero-stats`, la misma de "Tus héroes") y el winrate de
 * cada héroe en la tier list de tu banda. Tu 63% con Holliday no dice nada
 * solo; contra el 48% que saca Holliday en salas como las tuyas, dice que ése
 * es tu héroe.
 *
 * **Se ordena con la ventaja encogida hacia tu rango**, no con la cruda: a tu
 * récord se le suman `FIT_PRIOR` partidas imaginarias jugadas al winrate de la
 * banda. Con 5 de 5 la ventaja cruda es +52 y la encogida +10; con 30 de 45
 * (67%) la cruda es +19 y la encogida +13. Sin esto, cualquier racha corta
 * encabeza la tarjeta. Lo que se MUESTRA sigue siendo tu winrate real y el de
 * tu rango: el encogido sólo decide el orden y quién entra.
 *
 * Medido el 2026-09-22 sobre la cuenta de prueba (107253473, Arconte): entran
 * Holliday (63% en 16 contra 48%) y Warden (55% en 11 contra 48%); Lash (53%
 * contra 52%) queda afuera por pareja.
 */

/** Partidas mínimas con un héroe. Con menos, el winrate es anécdota. */
export const FIT_MIN_MATCHES = 10;

/** Cuántas partidas "al promedio de tu rango" se le suman a tu récord. */
const FIT_PRIOR = 20;

/** Ventaja encogida mínima, en fracción, para llamarlo recomendación. */
const FIT_MIN_EDGE = 0.02;

/** Cuántos héroes se muestran. */
const FIT_TOP = 3;

export interface HeroFit {
  heroId: number;
  matches: number;
  wins: number;
  /** Tu winrate real con el héroe, en toda tu carrera. */
  winRate: number;
  /** El del héroe en la tier list de tu banda. */
  bandWinRate: number;
}

export function heroFit(
  stats: HeroStat[],
  bandWinRates: Map<number, number>,
  min = FIT_MIN_MATCHES
): HeroFit[] {
  return stats
    .filter((s) => s.matches >= min && bandWinRates.has(s.heroId))
    .map((s) => {
      const band = bandWinRates.get(s.heroId)!;
      const edge = (s.wins + FIT_PRIOR * band) / (s.matches + FIT_PRIOR) - band;
      return { fit: { heroId: s.heroId, matches: s.matches, wins: s.wins, winRate: s.winRate, bandWinRate: band }, edge };
    })
    .filter((x) => x.edge >= FIT_MIN_EDGE)
    .sort((a, b) => b.edge - a.edge)
    .slice(0, FIT_TOP)
    .map((x) => x.fit);
}
