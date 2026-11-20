import { describe, expect, it } from "vitest";
import type { Aoe2Match, Aoe2Player } from "../src/aoe2/api/wel";
import { activity, avgDuration, byCiv, byMap, eloSeries, form, headToHead, mates, rivals } from "../src/aoe2/players/profileStats";

const YO = 100;
const p = (profileId: number, team: number, result: Aoe2Player["result"], civ: number, oldElo: number | null = 1000, newElo: number | null = 1010, alias = `j${profileId}`): Aoe2Player => ({
  profileId, alias, country: null, civ, team, color: null, oldElo, newElo, result,
});
const M = (id: number, start: number, mode: Aoe2Match["mode"], map: string, players: Aoe2Player[], dur = 1800): Aoe2Match => ({
  id, start, end: start + dur, map, matchType: 6, mode, observers: 0, options: null, players,
});
// Más nueva primero, como las devuelve la API.
const H: Aoe2Match[] = [
  M(6, 6000, "rm1v1", "arabia", [p(YO, 0, "win", 2, 1040, 1050), p(7, 1, "loss", 12, 1100, 1090, "Hera")]),
  M(5, 5000, "rmteam", "arena", [p(YO, 0, "loss", 2), p(8, 0, "loss", 4), p(7, 1, "win", 12, 1100, 1105, "Hera nuevo"), p(-1, 1, "win", 5)]),
  M(4, 4000, "rm1v1", "arabia", [p(YO, 0, "other", 12, 1040, 1040), p(9, 1, "other", 2)]),
  M(3, 3000, "rm1v1", "arena", [p(YO, 0, "loss", 12, 1050, 1040), p(7, 1, "win", 2, 1090, 1100)]),
  M(2, 2000, "custom", "arabia", [p(YO, 0, "win", 2, null, null), p(10, 1, "loss", 2)]),
  M(1, 1000, "rm1v1", "arabia", [p(YO, 0, "win", 2, 1030, 1050), p(9, 1, "loss", 4)], 1200),
];

describe("perfil de AoE2: cálculos", () => {
  it("forma: últimas partidas de ranking en orden, sin las personalizadas", () => {
    expect(form(H, YO, 10)).toEqual(["win", "loss", "other", "loss", "win"]);
  });

  it("por civ: 'other' no suma victorias ni cuenta como partida", () => {
    const franks = byCiv(H, YO).find((c) => c.civ === 2)!;
    expect(franks).toMatchObject({ civ: 2, games: 3, wins: 2 });
    expect(byCiv(H, YO).find((c) => c.civ === 12)).toMatchObject({ games: 1, wins: 0 });
  });

  it("por mapa", () => {
    expect(byMap(H, YO)).toEqual(expect.arrayContaining([{ map: "arabia", games: 2, wins: 2 }, { map: "arena", games: 2, wins: 0 }]));
  });

  it("rivales: agrupa por perfil aunque cambie el alias y descarta la IA", () => {
    const r = rivals(H, YO);
    expect(r[0]).toMatchObject({ profileId: 7, wins: 1, losses: 2, alias: "Hera" });
    expect(r.some((x) => x.profileId <= 0)).toBe(false);
  });

  it("rivales: las personalizadas no cuentan", () => {
    expect(rivals(H, YO).some((x) => x.profileId === 10)).toBe(false);
  });

  it("compañeros: sólo los del mismo equipo", () => {
    expect(mates(H, YO)).toEqual([{ profileId: 8, alias: "j8", wins: 0, losses: 1 }]);
  });

  it("actividad: corre la hora según la zona horaria", () => {
    const una = [M(1, Date.UTC(2026, 10, 16, 12) / 1000, "rm1v1", "arabia", [p(YO, 0, "win", 2), p(9, 1, "loss", 2)])];
    const g = activity(una, YO, -180);
    // 16/11/2026 fue lunes; 12 UTC = 9 en UTC−3. Semana desde el lunes (0).
    expect(g[0][9]).toBe(1);
    expect(g.flat().reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("duración promedio en segundos", () => {
    expect(avgDuration([H[5], H[0]], YO)).toBe(1500);
    expect(avgDuration([], YO)).toBeNull();
  });

  it("curva de ELO: el ELO nuevo del modo pedido, del más viejo al más nuevo, con la memoria antes", () => {
    // Cada punto es [fin de la partida, ELO nuevo]: partidas 1, 3, 4 y 6.
    expect(eloSeries(H, YO, "rm1v1")).toEqual([
      [2200, 1050],
      [4800, 1040],
      [5800, 1040],
      [7800, 1050],
    ]);
    expect(eloSeries(H, YO, "rm1v1", [[-86400, 990]])[0]).toEqual([-86400, 990]);
  });

  it("curva de ELO: no repite un punto de la memoria que ya trae el historial", () => {
    expect(eloSeries(H, YO, "rm1v1", [[2200, 1050]]).filter(([t]) => t === 2200)).toHaveLength(1);
  });

  it("curva de ELO: un día con partidas en el historial no repite el punto de la memoria de ese día", () => {
    const DIA = 86400;
    const hist = [M(9, 10 * DIA + 3600, "rm1v1", "arabia", [p(YO, 0, "win", 2, 1000, 1010), p(7, 1, "loss", 2)])];
    // La memoria tiene un punto el día 10 (otra hora) y otro el día 8: sólo queda el del 8.
    const serie = eloSeries(hist, YO, "rm1v1", [[10 * DIA + 7 * 3600, 990], [8 * DIA + 7 * 3600, 980]]);
    expect(serie).toEqual([[8 * DIA + 7 * 3600, 980], [10 * DIA + 3600 + 1800, 1010]]);
  });

  it("cara a cara: sólo partidas donde están los dos", () => {
    expect(headToHead(H, YO, 7).map((m) => m.id)).toEqual([6, 5, 3]);
  });
});
