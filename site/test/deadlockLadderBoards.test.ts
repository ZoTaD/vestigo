import { describe, expect, it } from "vitest";
import { orderRows, unpackBoard, type BoardRow } from "../src/deadlockHeroBoards";
import { regionOf } from "../src/deadlockRegions";
import { parseAccount } from "../src/DeadlockLadderCheck";
import { ladderTabOf } from "../src/DeadlockPlayerLadder";
import { parseRoute, routePath } from "../src/route";

const row = (o: Partial<BoardRow> & { id: number; rp: number; sp: number }): BoardRow => ({
  m: 30,
  w: 15,
  kpm: 0.3,
  dpm: 0.2,
  apm: 0.4,
  nw: 1200,
  dmg: 1000,
  score: 50,
  top: [],
  ...o,
});

describe("unpackBoard", () => {
  it("convierte cada fila de lista a objeto y saca los vacíos", () => {
    const f = unpackBoard({
      generatedAt: "2026-11-17T00:00:00Z",
      heroId: 1,
      season: 2,
      seasonFinal: false,
      minMatches: 20,
      pool: 2,
      cols: ["id", "name", "reg", "rp", "sp", "top"],
      rows: [
        [10, "uno", "NA", 1, 2, [1, 2]],
        [11, null, null, 2, 1, []],
      ],
    });
    expect(f.rows[0]).toEqual({ id: 10, name: "uno", reg: "NA", rp: 1, sp: 2, top: [1, 2] });
    expect(f.rows[1]).toEqual({ id: 11, rp: 2, sp: 1, top: [] });
  });
});

describe("orderRows", () => {
  const rows = [row({ id: 1, rp: 1, sp: 3, reg: "NA" }), row({ id: 2, rp: 2, sp: 1, reg: "EU" }), row({ id: 3, rp: 3, sp: 2, reg: "NA" })];
  it("ordena por rango o por puntaje", () => {
    expect(orderRows(rows, "rank", null).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(orderRows(rows, "score", null).map((r) => r.id)).toEqual([2, 3, 1]);
  });
  it("filtra por región y renumera desde 1", () => {
    const na = orderRows(rows, "score", "NA");
    expect(na.map((r) => [r.id, r.place])).toEqual([
      [3, 1],
      [1, 2],
    ]);
  });
});

describe("regionOf (sitio)", () => {
  it("dice lo mismo que el pipeline en los casos vistos", () => {
    expect(regionOf("dpkt-stockholm")).toBe("EU");
    expect(regionOf("us_southwest")).toBe("NA");
    expect(regionOf("hong_kong")).toBe("AS");
    expect(regionOf("argentina")).toBe("SA");
    expect(regionOf("australia")).toBe("OC");
  });
});

describe("parseAccount", () => {
  it("acepta id de cuenta, SteamID64 y enlace /profiles/", () => {
    expect(parseAccount("158644762")).toBe(158644762);
    expect(parseAccount("76561198118910490")).toBe(158644762);
    expect(parseAccount("https://steamcommunity.com/profiles/76561198118910490/")).toBe(158644762);
  });
  it("un nombre no es una cuenta", () => {
    expect(parseAccount("Gator")).toBeNull();
    expect(parseAccount("https://steamcommunity.com/id/gator")).toBeNull();
  });
});

describe("rutas del ranking", () => {
  it("cada sub-pestaña y cada héroe tienen su dirección", () => {
    for (const detail of ["stats", "one-tricks", "check", "abrams"]) {
      const path = `/en/deadlock/ladder/${detail}`;
      const r = parseRoute(path);
      expect(r.dlSection).toBe("ladder");
      expect(r.detail).toBe(detail);
      expect(routePath(r)).toBe(path);
    }
  });
  it("ladderTabOf lee la sub-pestaña", () => {
    expect(ladderTabOf(undefined)).toEqual({ tab: "world", heroId: null });
    expect(ladderTabOf("stats").tab).toBe("stats");
    expect(ladderTabOf("abrams")).toEqual({ tab: "hero", heroId: 6 });
    expect(ladderTabOf("no-existe").tab).toBe("world");
  });
});
