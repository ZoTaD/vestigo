import { afterEach, describe, expect, it, vi } from "vitest";
import { CALIBRATION_MATCHES, fetchRank } from "../src/deadlockMatch";

/**
 * La calibración de Deadlock, que se leyó mal dos veces seguidas.
 *
 * `players/{id}/rank` devuelve `player_rank_initial_calibration_games`, y ese
 * `initial` es literal: es cuántas faltaban **al empezar** la última partida, no
 * cuántas faltan ahora ni cuántas lleva. Los números de acá son los medidos el
 * 2026-08-13 sobre cuentas reales, y fijan las dos lecturas que fallaron:
 *
 * 1. tomarlo como "jugadas" → una cuenta con 7 de 8 mostraba "2 de 8, faltan 6";
 * 2. tomarlo como "faltan ahora" → el total daba 9 en vez de 8.
 */
function responder(last: Record<string, number> | null, badge = 0) {
  vi.stubGlobal("fetch", async () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ badge, last_match: last }),
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("la calibración", () => {
  it("son ocho partidas", () => {
    expect(CALIBRATION_MATCHES).toBe(8);
  });

  /**
   * El caso más limpio de la medición: quien lleva UNA sola calibración trae el
   * campo en 8, porque antes de jugarla le faltaban las ocho. Si se leyera como
   * "faltan ahora", el total daría 9.
   */
  it("con una jugada, el campo vale 8 y quedan siete", async () => {
    responder({ player_rank_initial_calibration_games: 8 });
    const r = await fetchRank(1);
    expect(r.calibrationPlayed).toBe(1);
    expect(r.calibrationLeft).toBe(7);
    expect(r.calibrationPlayed + r.calibrationLeft).toBe(CALIBRATION_MATCHES);
    expect(r.calibrating).toBe(true);
  });

  /** La cuenta de ZoTaD el día del arreglo: contador 7, campo 2. */
  it("con el campo en 2 lleva siete y le falta una", async () => {
    responder({ player_rank_initial_calibration_games: 2 });
    const r = await fetchRank(1);
    expect(r.calibrationPlayed).toBe(7);
    expect(r.calibrationLeft).toBe(1);
  });

  /**
   * Terminó las ocho y el juego todavía no destapó la insignia: **sigue
   * calibrando con cero por delante**. Si "calibrando" se dedujera de que falten
   * partidas, esta persona vería "todavía sin clasificatorias" justo el día que
   * terminó de jugarlas.
   */
  it("con el campo en 1 terminó las ocho y sigue calibrando", async () => {
    responder({ player_rank_initial_calibration_games: 1 });
    const r = await fetchRank(1);
    expect(r.calibrationPlayed).toBe(8);
    expect(r.calibrationLeft).toBe(0);
    expect(r.calibrating).toBe(true);
  });

  it("sin partidas clasificatorias no está calibrando", async () => {
    responder(null);
    const r = await fetchRank(1);
    expect(r.calibrating).toBe(false);
    expect(r.badge).toBe(0);
  });

  /** Las cuentas ya rankeadas traen el campo en 0: no puede dar "faltan −1". */
  it("una cuenta con rango no produce números negativos", async () => {
    responder({ player_rank_initial_calibration_games: 0 }, 114);
    const r = await fetchRank(1);
    expect(r.badge).toBe(114);
    expect(r.calibrationLeft).toBe(0);
    expect(r.calibrating).toBe(false);
  });
});
