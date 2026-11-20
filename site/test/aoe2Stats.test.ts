import { describe, expect, it } from "vitest";
import { civTable, mapTable, matchup, mapsByGames, type Summary } from "../src/aoe2/stats/data";

const W = (civ: Record<string, [number, number]>, map: Record<string, [number, number]> = {}, vs: Record<string, [number, number]> = {}) => ({
  games: 0, days: 14, civ, map, vs, dur: {},
});
const S: Summary = {
  generatedAt: "2026-11-20T08:00:00Z",
  patch: { name: "188329", since: "2026-10-28" },
  windows: {
    "14": W(
      {
        "rm1v1|1400-1800|franks": [300, 180],
        "rm1v1|1800+|franks": [100, 40],
        "rm1v1|1400-1800|mongols": [100, 50],
        "rmteam|1400-1800|franks": [50, 25],
      },
      { "rm1v1|arabia|franks": [250, 150], "rm1v1|arabia|mongols": [150, 70], "rm1v1|arena|franks": [10, 5] },
      { "1400-1800|franks|mongols": [80, 50] },
    ),
  },
  prev: { "14": { games: 0, civ: { "rm1v1|1400-1800|franks": [200, 100] } } },
};

describe("estadísticas de civs de AoE2", () => {
  it("una banda: % de victorias, elección y tendencia", () => {
    const t = civTable(S, { mode: "rm1v1", band: "1400-1800", window: "14" });
    const f = t.find((r) => r.civ === "franks")!;
    expect(f.games).toBe(300);
    expect(f.wr).toBeCloseTo(0.6);
    // 1v1: cada partida tiene dos civs → elección = partidas de la civ / (total de civs / 2).
    expect(f.pick).toBeCloseTo(300 / (400 / 2));
    expect(f.trend).toBeCloseTo(0.1);
    expect(f.small).toBe(false);
    expect(t.find((r) => r.civ === "mongols")!.small).toBe(true);
  });
  it("todas las bandas suman", () => {
    const f = civTable(S, { mode: "rm1v1", band: "all", window: "14" }).find((r) => r.civ === "franks")!;
    expect(f.games).toBe(400);
    expect(f.wr).toBeCloseTo(220 / 400);
  });
  it("ordenada por % de victorias", () => {
    expect(civTable(S, { mode: "rm1v1", band: "1400-1800", window: "14" }).map((r) => r.civ)).toEqual(["franks", "mongols"]);
  });
  it("una ventana que no existe da vacío", () => {
    expect(civTable(S, { mode: "rm1v1", band: "all", window: "patch" })).toEqual([]);
  });
  it("matchups complementarios", () => {
    const a = matchup(S, "14", "1400-1800", "franks", "mongols");
    const b = matchup(S, "14", "1400-1800", "mongols", "franks");
    expect(a).toEqual({ games: 80, wr: 50 / 80, small: true });
    expect(b.wr).toBeCloseTo(1 - 50 / 80);
    expect(matchup(S, "14", "1400-1800", "franks", "franks")).toEqual({ games: 0, wr: null, small: true });
  });
  it("por mapa", () => {
    const t = mapTable(S, "14", "rm1v1", "arabia");
    expect(t.map((r) => [r.civ, r.games])).toEqual([["franks", 250], ["mongols", 150]]);
    expect(mapsByGames(S, "14", "rm1v1")).toEqual([{ map: "arabia", games: 200 }, { map: "arena", games: 5 }]);
  });
});
