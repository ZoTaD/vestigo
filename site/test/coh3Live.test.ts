import { describe, expect, it } from "vitest";
import {
  agoParts,
  clock,
  eloSeries,
  eloSeriesKeys,
  eloTicks,
  ladderQuery,
  nemesis,
  normalizeQuery,
  pageCount,
  pageStart,
  parseLadderQuery,
  withKnownElo,
  prettyMap,
  recentSummary,
  standingsTotals,
  winRate,
} from "../src/coh3/live/logic";
import type { MatchSummary, Standing } from "../src/coh3/api/relic";

const ME = 871;
type P = MatchSummary["players"][number];
const pl = (profileId: number, team: number, result: P["result"], faction: P["faction"] = "german", elo: [number, number] | null = [2000, 2010]): P => ({
  profileId,
  alias: `p${profileId}`,
  country: "ar",
  faction,
  team,
  result,
  eloBefore: elo?.[0] ?? null,
  eloAfter: elo?.[1] ?? null,
});
const match = (id: number, start: number, mode: MatchSummary["mode"], players: P[], duration = 1200): MatchSummary => ({
  id,
  map: "desert_village_2p_mkiii",
  mode,
  ranked: false,
  matchType: 20,
  start,
  duration,
  players,
});

describe("normalizeQuery", () => {
  it("lee links de coh3stats y de esta pestaña", () => {
    expect(normalizeQuery("https://coh3stats.com/players/871-rei")).toEqual({ kind: "profile", id: 871, alias: null });
    expect(normalizeQuery("coh3stats.com/players/871")).toEqual({ kind: "profile", id: 871, alias: null });
    expect(normalizeQuery("https://vestigo.gg/es/coh3/jugadores/1234?x=1")).toEqual({ kind: "profile", id: 1234, alias: null });
  });
  it("reconoce SteamID64 y links de Steam", () => {
    expect(normalizeQuery(" 76561198404414770 ")).toEqual({ kind: "steam", steamId: "76561198404414770" });
    expect(normalizeQuery("https://steamcommunity.com/profiles/76561198404414770/")).toEqual({ kind: "steam", steamId: "76561198404414770" });
  });
  it("un número corto es perfil, pero se busca también como alias", () => {
    expect(normalizeQuery("871")).toEqual({ kind: "profile", id: 871, alias: "871" });
  });
  it("el resto es alias exacto, con espacios normalizados y sin cambiar mayúsculas", () => {
    expect(normalizeQuery("  Drink||Scotch ")).toEqual({ kind: "alias", alias: "Drink||Scotch" });
    expect(normalizeQuery("El   Campo")).toEqual({ kind: "alias", alias: "El Campo" });
    expect(normalizeQuery("Rei")).toEqual({ kind: "alias", alias: "Rei" });
    expect(normalizeQuery("   ")).toEqual({ kind: "empty" });
    expect(normalizeQuery("0")).toEqual({ kind: "alias", alias: "0" });
  });
});

describe("estado del ranking en la query", () => {
  const regions = [2074389, 2074390];
  it("ida y vuelta", () => {
    const s = parseLadderQuery("?m=2v2&f=german&p=3&r=2074389", regions);
    expect(s).toEqual({ mode: "2v2", faction: "german", page: 3, region: 2074389 });
    expect(ladderQuery(s)).toBe("?m=2v2&f=german&p=3&r=2074389");
  });
  it("lo inválido vuelve al valor de siempre y no se escribe", () => {
    const s = parseLadderQuery("?m=9v9&f=soviet&p=-1&r=123", regions);
    expect(s).toEqual({ mode: "1v1", faction: "american", page: 1, region: null });
    expect(ladderQuery(s)).toBe("");
  });
  it("CoH2: facciones propias; la de siempre es la primera del juego", () => {
    const f2 = ["wehrmacht", "soviet", "okw", "usf", "british"];
    const s = parseLadderQuery("?m=3v3&f=okw", [], f2);
    expect(s).toEqual({ mode: "3v3", faction: "okw", page: 1, region: null });
    expect(ladderQuery(s, f2)).toBe("?m=3v3&f=okw");
    expect(parseLadderQuery("?f=american", [], f2).faction).toBe("wehrmacht");
    expect(ladderQuery(parseLadderQuery("", [], f2), f2)).toBe("");
  });
  it("ELO de la memoria diaria para las filas sin ELO", () => {
    const rows = [
      { statGroup: 10, elo: null },
      { statGroup: 11, elo: null },
      { statGroup: 12, elo: 1400 },
    ];
    const out = withKnownElo(rows, { "10": [1816, 1] });
    expect(out.map((r) => r.elo)).toEqual([1816, null, 1400]);
  });
  it("páginas de 50", () => {
    expect(pageStart(1)).toBe(1);
    expect(pageStart(3)).toBe(101);
    expect(pageCount(1905)).toBe(39);
    expect(pageCount(0)).toBe(1);
  });
});

describe("resumen del jugador", () => {
  const ms = [
    match(1, 100, "1v1", [pl(ME, 0, "win", "german", [2000, 2012]), pl(5, 1, "loss", "american")], 600),
    match(2, 200, "1v1", [pl(ME, 0, "loss", "german", [2012, 2000]), pl(5, 1, "win", "american")], 1200),
    match(3, 300, "2v2", [pl(ME, 1, "loss", "dak", [1800, 1790]), pl(9, 1, "loss"), pl(5, 0, "win", "british"), pl(6, 0, "win", "british")], 1800),
    match(4, 400, "custom", [pl(ME, 0, "win", "german", null), pl(7, 1, "loss", "american", null)], 900),
  ];
  it("partidas, victorias, duración media, facción y cambio de ELO", () => {
    const r = recentSummary(ms, ME);
    expect(r.games).toBe(4);
    expect(r.wins).toBe(2);
    expect(r.losses).toBe(2);
    expect(r.winRate).toBe(50);
    expect(r.avgDuration).toBe(1125);
    expect(r.topFaction).toEqual({ faction: "german", games: 3 });
    expect(r.eloDelta).toBe(12 - 12 - 10);
  });
  it("némesis: el que más veces le ganó (cada rival del equipo ganador suma)", () => {
    const n = nemesis(ms, ME);
    expect(n).toMatchObject({ profileId: 5, beats: 2, games: 3 });
  });
  it("sin derrotas no hay némesis", () => {
    expect(nemesis([ms[0]], ME)).toBeNull();
    expect(nemesis([], ME)).toBeNull();
  });
  it("totales del ranking", () => {
    const st = (mode: Standing["mode"], faction: Standing["faction"], rank: number, wins: number, losses: number, ranked = false): Standing => ({
      leaderboardId: 1, mode, faction, ranked, rank, total: 100, elo: 1500, best: 1600, tier: 1, wins, losses, streak: 0, lastMatch: 0,
    });
    const tot = standingsTotals([st("1v1", "german", 5, 30, 10), st("2v2", "american", -1, 50, 10), st("1v1", "dak", 2, 5, 5), st("1v1", "british", 1, 99, 0, true)]);
    expect(tot.games).toBe(110);
    expect(tot.wins).toBe(85);
    expect(tot.topFaction).toEqual({ faction: "american", games: 60 });
    expect(tot.best?.rank).toBe(2);
    expect(winRate(0, 0)).toBeNull();
  });
});

describe("serie de ELO", () => {
  const ms = [
    match(3, 300, "1v1", [pl(ME, 0, "win", "german", [2010, 2020]), pl(5, 1, "loss")]),
    match(1, 100, "1v1", [pl(ME, 0, "loss", "german", [2005, 2000]), pl(5, 1, "win")]),
    match(2, 200, "1v1", [pl(ME, 0, "win", "german", [2000, 2010]), pl(5, 1, "loss")]),
    match(4, 400, "1v1", [pl(ME, 0, "win", "american", [1900, 1910]), pl(5, 1, "loss")]),
    match(5, 500, "custom", [pl(ME, 0, "win", "german", null), pl(5, 1, "loss")]),
  ];
  it("ordenada de la más vieja a la más nueva, sólo el modo y la facción pedidos", () => {
    const s = eloSeries(ms, ME, "1v1", "german");
    expect(s.map((p) => p.elo)).toEqual([2000, 2010, 2020]);
    expect(s.map((p) => p.delta)).toEqual([-5, 10, 10]);
    expect(s[0].result).toBe("loss");
  });
  it("las series disponibles, las de más partidas primero; las personalizadas no cuentan", () => {
    expect(eloSeriesKeys(ms, ME).map((k) => [k.key, k.n])).toEqual([
      ["1v1:german", 3],
      ["1v1:american", 1],
    ]);
  });
  it("marcas redondas en el eje", () => {
    expect(eloTicks(1985, 2035)).toEqual([1990, 2000, 2010, 2020, 2030]);
    const t = eloTicks(1200, 2300);
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(t.length).toBeLessThanOrEqual(6);
    expect(t.every((v) => v % 250 === 0)).toBe(true);
  });
});

describe("textos chicos", () => {
  it("nombre de mapa de respaldo", () => {
    expect(prettyMap("desert_village_2p_mkiii")).toBe("Desert Village");
    expect(prettyMap("mp_2p_piani_falliti")).toBe("Piani Falliti");
    expect(prettyMap("(2) catanian crossroads")).toBe("Catanian Crossroads");
    expect(prettyMap("eindhoven")).toBe("Eindhoven");
  });
  it("duración", () => {
    expect(clock(1802)).toBe("30:02");
    expect(clock(59)).toBe("0:59");
    expect(clock(3725)).toBe("1:02:05");
  });
  it("tiempo relativo", () => {
    const now = 1_000_000 * 1000;
    expect(agoParts(1_000_000 - 30, now)).toEqual([0, "minute"]);
    expect(agoParts(1_000_000 - 7200, now)).toEqual([-2, "hour"]);
    expect(agoParts(1_000_000 - 86400 * 3, now)).toEqual([-3, "day"]);
  });
});
