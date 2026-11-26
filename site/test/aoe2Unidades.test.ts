import { describe, expect, it } from "vitest";
import { masUsada, promedios, tierDe, unitByCiv, unitTable, type Summary } from "../src/aoe2/stats/data";

const s = {
  generatedAt: "",
  patch: null,
  prev: {},
  windows: {
    "28": {
      games: 0, days: 28, civ: {}, map: {}, vs: {}, dur: {},
      rec: { "1800+|britons": [100, 50], "1800+|franks": [100, 50] },
      units: { "1800+|britons|4": [40, 26], "1800+|franks|38": [50, 25], "1800+|franks|4": [30, 12], "1800+|franks|13": [60, 40], "1800+|britons|7": [5, 5] },
      apm: { "1800+": [40, 6000], "<1000": [5, 100] },
      age: {},
    },
  },
} as unknown as Summary;

describe("tier list de unidades de AoE2", () => {
  it("por línea, sin barcos pesqueros, con la nota relativa y las de pocas partidas al final", () => {
    const filas = unitTable(s, "28", "all", () => []);
    expect(filas.map((r) => r.line)).toEqual([4, 38, 7]); // arquero 54,3%, caballero 50%; hostigador con 5 partidas
    expect(filas[0]).toMatchObject({ games: 70, wins: 38, tier: "S", small: false });
    expect(filas[1].tier).toBe("D");
    expect(filas[2].small).toBe(true);
  });
  it("`pick` cuenta sólo los jugadores de las civs que tienen la unidad", () => {
    const filas = unitTable(s, "28", "all", (l) => (l === 38 ? ["franks"] : []));
    expect(filas.find((r) => r.line === 38)!.pick).toBe(0.5);
    expect(filas.find((r) => r.line === 4)!.pick).toBe(0.35);
  });
  it("la nota es por puesto", () => {
    expect([0, 1, 4, 8, 9].map((i) => tierDe(i, 10))).toEqual(["S", "A", "B", "C", "D"]);
  });
  it("civs con una unidad, promedios con muestra y la más usada", () => {
    expect(unitByCiv(s, "28", "all", 4)).toEqual([
      { civ: "britons", games: 40, wr: 0.65 },
      { civ: "franks", games: 30, wr: 0.4 },
    ]);
    expect(promedios(s, "28", "apm")).toEqual([{ band: "1800+", avg: 150, n: 40 }]);
    expect(masUsada(s, "28")).toEqual({ line: 4, share: 0.35 });
  });
});
