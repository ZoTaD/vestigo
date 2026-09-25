import { describe, it, expect } from "vitest";
import { peersInScope, PEER_MIN, type PeerRaw } from "../src/deadlockPeers";
import { RANKED_MODE, RANKED_SINCE, type HistoryRow } from "../src/deadlockMatch";

/** Una fila de historial de mentira, con lo mínimo y lo que cada prueba pida encima. */
function fila(over: Partial<HistoryRow> = {}): HistoryRow {
  return {
    matchId: 1,
    heroId: 2,
    won: true,
    kills: 5,
    deaths: 5,
    assists: 5,
    netWorth: 40_000,
    durationS: 2_400,
    startTime: RANKED_SINCE,
    badge: 0,
    lastHits: 150,
    denies: 4,
    mode: RANKED_MODE,
    gameMode: 1,
    ...over,
  };
}

describe("peersInScope", () => {
  /**
   * El corazón del asunto: la API cuenta las victorias sobre el historial ENTERO
   * y la tarjeta habla del modo que el visitante eligió. Si se copiara `wins`
   * del crudo, un dúo con 60-60 de siempre diría "60-60" también dentro de una
   * pestaña de clasificatorias donde jugaron tres partidas.
   */
  it("recalcula las victorias sobre las filas del modo, no las copia del crudo", () => {
    const rows = [
      fila({ matchId: 10, won: true }),
      fila({ matchId: 11, won: false }),
      fila({ matchId: 12, won: true }),
    ];
    const peers: PeerRaw[] = [{ accountId: 7, matches: [10, 11, 12] }];
    expect(peersInScope(peers, rows)).toEqual([{ accountId: 7, matches: 3, wins: 2, losses: 1 }]);
  });

  /**
   * Un compañero que no jugó ninguna partida del modo elegido **desaparece**, no
   * aparece en cero. Es la regla que el proyecto ya usa para los huecos: un cero
   * diría "jugaron y no ganaron", la ausencia dice "acá no hay nada que contar".
   */
  it("el que no tiene partidas en el modo no aparece", () => {
    const rows = [fila({ matchId: 10 })];
    const peers: PeerRaw[] = [
      { accountId: 7, matches: [10, 11] },
      { accountId: 8, matches: [99, 98] },
    ];
    expect(peersInScope(peers, rows, 1).map((p) => p.accountId)).toEqual([7]);
  });

  /**
   * Los ids que la API trae y el historial no tiene se ignoran sin romper nada.
   * Medido el 2026-08-25: hoy el cruce da 100%, pero eso es una propiedad de los
   * datos de hoy y no una garantía del contrato.
   */
  it("ignora las partidas que el historial no trae", () => {
    const rows = [fila({ matchId: 10, won: true })];
    const peers: PeerRaw[] = [{ accountId: 7, matches: [10, 404, 405] }];
    expect(peersInScope(peers, rows, 1)).toEqual([{ accountId: 7, matches: 1, wins: 1, losses: 0 }]);
  });

  it("ordena por partidas juntas, de mayor a menor", () => {
    const rows = [10, 11, 12, 13].map((matchId) => fila({ matchId }));
    const peers: PeerRaw[] = [
      { accountId: 7, matches: [10] },
      { accountId: 8, matches: [10, 11, 12, 13] },
      { accountId: 9, matches: [10, 11] },
    ];
    expect(peersInScope(peers, rows, 1).map((p) => p.accountId)).toEqual([8, 9, 7]);
  });

  /**
   * El piso existe para que la lista signifique algo: cruzarse una vez con
   * alguien no es "tu némesis", es el matchmaking.
   */
  it("deja afuera a los que no llegan al piso de partidas", () => {
    const rows = [10, 11, 12].map((matchId) => fila({ matchId }));
    const peers: PeerRaw[] = [
      { accountId: 7, matches: [10] },
      { accountId: 8, matches: [10, 11] },
    ];
    expect(peersInScope(peers, rows, 2).map((p) => p.accountId)).toEqual([8]);
    expect(PEER_MIN).toBeGreaterThanOrEqual(2);
  });

  it("sin historial no hay con quién, y no revienta", () => {
    expect(peersInScope([{ accountId: 7, matches: [10] }], [])).toEqual([]);
  });
});
