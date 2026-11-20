import { describe, expect, it } from "vitest";
import history from "./fixtures/aoe2/history.json";
import { normalizeHistory, type RawAoe2History } from "../src/aoe2/api/wel";
import { decodeOptions, namedOptions } from "../src/aoe2/matches/options";
import { filterHistory } from "../src/aoe2/players/history";

const ms = normalizeHistory(history as unknown as RawAoe2History);
const YO = 9423131;

describe("opciones de la partida", () => {
  it("decodifica los pares clave:valor de la partida real", () => {
    const o = decodeOptions(ms.find((m) => m.id === 521941306)!.options!);
    expect(o[8]).toBe("120");
    expect(o[10]).toBe("11026");
    expect(o[93]).toBe("6");
  });
  it("tamaño del mapa en casillas y build del juego", () => {
    expect(namedOptions(decodeOptions(ms.find((m) => m.id === 493244815)!.options!))).toEqual({ mapSize: 220, build: 10895 });
  });
  it("unas opciones rotas dan vacío sin tirar", () => {
    expect(decodeOptions("no-es-base64!!")).toEqual({});
    expect(decodeOptions("")).toEqual({});
  });
});

describe("filtros del historial", () => {
  it("por modo", () => {
    expect(filterHistory(ms, YO, { mode: "rmteam" }).every((m) => m.mode === "rmteam")).toBe(true);
    expect(filterHistory(ms, YO, { mode: "rmteam" })).toHaveLength(3);
  });
  it("por civ y resultado del dueño del perfil", () => {
    const r = filterHistory(ms, YO, { result: "win" });
    expect(r.every((m) => m.players.find((p) => p.profileId === YO)!.result === "win")).toBe(true);
    const civ = ms[0].players.find((p) => p.profileId === YO)!.civ;
    expect(filterHistory(ms, YO, { civ }).every((m) => m.players.find((p) => p.profileId === YO)!.civ === civ)).toBe(true);
  });
  it("por mapa, combinado", () => {
    expect(filterHistory(ms, YO, { map: "arena", mode: "rmteam" }).map((m) => m.id)).toEqual([493244815]);
  });
});
