import { describe, expect, it } from "vitest";
import {
  BRAWL_GAME_MODE,
  RANKED_MODE,
  RANKED_SINCE,
  MATCH_SCOPES,
  inScope,
  rankedCorpus,
  scopeCounts,
  scopeRows,
  type HistoryRow,
} from "../src/deadlockMatch";

/**
 * El filtro de modo del perfil.
 *
 * **Lo que estos tests protegen es que los tres modos PARTAN el historial**: sin
 * eso, la tarjeta del jugador diría "475 partidas" y la suma de las pastillas
 * daría otra cosa, que es exactamente el par de números contradictorios que el
 * proyecto ya arregló una vez en esta misma página.
 */
function fila(over: Partial<HistoryRow> = {}): HistoryRow {
  return {
    matchId: 1,
    heroId: 1,
    won: true,
    kills: 0,
    deaths: 0,
    assists: 0,
    netWorth: 0,
    durationS: 1800,
    startTime: RANKED_SINCE + 3600,
    badge: 0,
    lastHits: 0,
    denies: 0,
    mode: 1,
    gameMode: 1,
    ...over,
  };
}

const clasificatoria = (over: Partial<HistoryRow> = {}) =>
  fila({ mode: RANKED_MODE, startTime: RANKED_SINCE + 3600, ...over });
const callejera = (over: Partial<HistoryRow> = {}) => fila({ gameMode: BRAWL_GAME_MODE, ...over });
const normal = (over: Partial<HistoryRow> = {}) => fila({ mode: 1, gameMode: 1, ...over });

describe("los modos del perfil", () => {
  it("reparte cada partida en un modo y sólo uno", () => {
    const filas = [clasificatoria(), callejera(), normal(), normal()];
    for (const f of filas) {
      const cuantos = MATCH_SCOPES.filter((s) => s !== "all" && inScope(f, s)).length;
      expect(cuantos).toBe(1);
    }
  });

  it("las cuentas de los tres modos suman el total", () => {
    const filas = [clasificatoria(), clasificatoria(), callejera(), normal(), normal(), normal()];
    const n = scopeCounts(filas);
    expect(n.all).toBe(6);
    expect(n.ranked + n.normal + n.brawl).toBe(n.all);
    expect(n).toEqual({ all: 6, ranked: 2, normal: 3, brawl: 1 });
  });

  /**
   * **El modo 4 anterior al reset NO es una clasificatoria.** Medido sobre una
   * cuenta real: 40 filas de hasta 632 días antes, de una época en la que ese
   * modo significaba otra cosa. No dan insignia ni cuentan para el rango de hoy,
   * así que caen en "normales" y no en un cuarto grupo invisible.
   */
  it("no cuenta como clasificatoria el modo 4 anterior al reset", () => {
    const vieja = fila({ mode: RANKED_MODE, startTime: RANKED_SINCE - 86_400 });
    expect(inScope(vieja, "ranked")).toBe(false);
    expect(inScope(vieja, "normal")).toBe(true);
    expect(scopeCounts([vieja])).toEqual({ all: 1, ranked: 0, normal: 1, brawl: 0 });
  });

  /**
   * La pelea callejera se pregunta primero. Si alguna vez el juego publicara una
   * callejera con `match_mode` clasificatorio, tiene que seguir siendo callejera
   * en vez de aparecer en los dos lados y romper la suma.
   */
  it("la pelea callejera gana sobre el modo de la partida", () => {
    const rara = fila({ mode: RANKED_MODE, gameMode: BRAWL_GAME_MODE });
    expect(inScope(rara, "brawl")).toBe(true);
    expect(inScope(rara, "ranked")).toBe(false);
    expect(inScope(rara, "normal")).toBe(false);
  });

  it("'todas' no filtra nada", () => {
    const filas = [clasificatoria(), callejera(), normal()];
    expect(scopeRows(filas, "all")).toHaveLength(3);
    expect(scopeRows(filas, "brawl")).toHaveLength(1);
  });
});

describe("el corpus de la forma reciente", () => {
  /**
   * Con un modo elegido a mano no hay elección que hacer: manda el modo. El
   * respaldo automático existe para cuando nadie dijo nada, y aplicarlo igual
   * contestaría otra pregunta — "todas porque tenés pocas clasificatorias"
   * mientras el visitante pidió ver pelea callejera.
   */
  it("con un modo elegido mide ese modo, sin respaldo automático", () => {
    const filas = [callejera(), callejera(), ...Array.from({ length: 30 }, () => normal())];
    const c = rankedCorpus(filas, "brawl");
    expect(c.rows).toHaveLength(2);
    expect(c.fallback).toBe(false);
    expect(c.scope).toBe("brawl");
  });

  it("con 'todas' y pocas clasificatorias sigue cayendo al historial entero", () => {
    const filas = [clasificatoria(), normal(), normal()];
    const c = rankedCorpus(filas, "all");
    expect(c.fallback).toBe(true);
    expect(c.rows).toHaveLength(3);
    expect(c.ranked).toBe(1);
  });

  it("con 'todas' y clasificatorias de sobra mide sólo esas", () => {
    const filas = [...Array.from({ length: 12 }, () => clasificatoria()), normal()];
    const c = rankedCorpus(filas, "all");
    expect(c.fallback).toBe(false);
    expect(c.rows).toHaveLength(12);
  });
});
