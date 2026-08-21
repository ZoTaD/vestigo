import { describe, expect, it } from "vitest";
import { byMerit, wilsonScore, type LadderRow } from "../src/deadlockLadder";

/**
 * El orden de la escalera, que se equivocó dos veces en dos días.
 *
 * 1. **2026-08-13**: el podio de la pestaña ordenaba por rango y el ranking del
 *    perfil por winrate, así que el mismo jugador salía 1.º en un lado y 32.º en
 *    el otro.
 * 2. **2026-08-14**: se unificaron por winrate, y el "mejor Abrams del mundo"
 *    pasó a ser un Mystic que juega dos partidas por día. Medido sobre ese
 *    top 5, el primero era **el peor de los cinco** según el juego.
 *
 * El arreglo no era elegir cuál de las dos vistas mandaba: era que **ninguna
 * ordenara por winrate**. El winrate es relativo al rival y no sabe contra quién
 * jugaste; el rango del juego sí.
 */
function fila(over: Partial<LadderRow> = {}): LadderRow {
  const wins = over.wins ?? 10;
  const matches = over.matches ?? 20;
  return {
    rank: 0,
    accountId: 1,
    wins,
    winRate: wins / matches,
    score: wilsonScore(wins, matches),
    gameScore: 0,
    matches,
    ...over,
  };
}

describe("el orden de mérito de la escalera", () => {
  /**
   * El caso exacto que reportó ZoTaD, con los números medidos de nuestro
   * propio top 5 de Abrams: un Mystic con winrate altísimo contra un Emissary
   * con winrate normal. **El Emissary tiene que ir primero.**
   */
  it("un rango más alto le gana a un winrate más alto", () => {
    const mystic = fila({ accountId: 1515002860, gameScore: 26, wins: 32, matches: 41 });
    const emissary = fila({ accountId: 1892018535, gameScore: 40, wins: 24, matches: 44 });

    expect(mystic.winRate).toBeGreaterThan(emissary.winRate);
    expect([mystic, emissary].sort(byMerit)[0].accountId).toBe(emissary.accountId);
  });

  /**
   * El rango del juego es GRUESO: 59 valores distintos entre 1.000 jugadores y
   * 51 comparten el máximo. Sin el desempate de Wilson, esos 51 quedarían todos
   * primeros en un orden arbitrario.
   */
  it("con el mismo rango desempata Wilson, no el winrate crudo", () => {
    const pocas = fila({ accountId: 1, gameScore: 40, wins: 10, matches: 10 });
    const muchas = fila({ accountId: 2, gameScore: 40, wins: 117, matches: 195 });

    expect(pocas.winRate).toBeGreaterThan(muchas.winRate);
    // 10-0 da 0,72 de piso y 117-195 da 0,53, así que acá Wilson todavía prefiere
    // al de diez. Lo que saca del ranking a una cuenta de diez partidas es el
    // PISO de partidas, no la fórmula — y por eso el piso existe.
    expect(pocas.score).toBeGreaterThan(muchas.score);
    expect([muchas, pocas].sort(byMerit)[0].accountId).toBe(pocas.accountId);
  });

  /**
   * **A igual winrate gana el que más jugó, y lo resuelve Wilson solo.** 60% en
   * 50 partidas da un piso de 0,462 y el mismo 60% en 25 da 0,407: el intervalo
   * se angosta con la muestra, que es justamente para lo que se eligió Wilson.
   * El desempate por `matches` casi nunca llega a usarse — está para el empate
   * exacto, no para esto.
   */
  it("a igual rango y winrate, el de más partidas queda primero", () => {
    const pocas = fila({ accountId: 1, gameScore: 30, wins: 15, matches: 25 });
    const muchas = fila({ accountId: 2, gameScore: 30, wins: 30, matches: 50 });
    expect(pocas.winRate).toBeCloseTo(muchas.winRate, 5);
    expect(muchas.score).toBeGreaterThan(pocas.score);
    expect([pocas, muchas].sort(byMerit)[0].accountId).toBe(muchas.accountId);
  });

  /**
   * Sin MMR la fila queda en `gameScore` 0 y **cae al final, no arriba**: es la
   * misma regla que el resto del sitio usa para los huecos. De alguien de quien
   * no sabemos el rango no podemos decir que es el mejor del mundo.
   */
  it("sin rango del juego cae al final por más que gane todo", () => {
    const sinRango = fila({ accountId: 1, gameScore: 0, wins: 40, matches: 40 });
    const conRango = fila({ accountId: 2, gameScore: 12, wins: 21, matches: 40 });
    expect([sinRango, conRango].sort(byMerit)[0].accountId).toBe(conRango.accountId);
  });
});
