import { describe, expect, it } from "vitest";
import { COH_GAMES, GAMES, gameOf } from "../src/coh3/games";

describe("configuración por juego", () => {
  it("leaderboards de CoH2 y CoH1 por modo y facción", () => {
    expect(GAMES.coh2.leaderboardOf("1v1", "okw")).toBe(6);
    expect(GAMES.coh2.leaderboardOf("3v3", "british")).toBe(53);
    expect(GAMES.coh1.leaderboardOf("4v4", "panzer_elite")).toBe(19);
    expect(GAMES.coh3.leaderboardOf("1v1", "american")).toBe(2130255);
  });

  it("insignias de rango de CoH1 por facción y nivel", () => {
    expect(GAMES.coh1.rankIcon?.("british", 20)).toBe("/coh1/r/british-20.webp");
    expect(GAMES.coh1.rankIcon?.("panzer_elite", 1)).toBe("/coh1/r/panzer_elite-1.webp");
    expect(GAMES.coh1.rankIcon?.("british", 0)).toBeNull();
    expect(GAMES.coh1.rankIcon?.("british", 21)).toBeNull();
    expect(GAMES.coh2.rankIcon).toBeUndefined();
  });

  it("razas y tipos de partida", () => {
    expect(GAMES.coh1.raceToFaction[3]).toBe("panzer_elite");
    expect(GAMES.coh2.raceToFaction[2]).toBe("okw");
    expect(GAMES.coh2.modeOf(22)).toBeNull();
    expect(GAMES.coh2.modeOf(2)).toBe("2v2");
    expect(GAMES.coh1.modeOf(5)).toBeNull();
    expect(GAMES.coh3.modeOf(20)).toBe("1v1");
  });

  it("cada facción tiene nombre en los dos idiomas, ícono y está en algún leaderboard", () => {
    for (const g of COH_GAMES) {
      const c = GAMES[g];
      for (const f of c.factions) {
        expect(c.factionName.en[f], `${g} ${f}`).toBeTruthy();
        expect(c.factionName.es[f], `${g} ${f}`).toBeTruthy();
        expect(c.factionIcon[f], `${g} ${f}`).toBeTruthy();
        expect(c.leaderboards.some((l) => l.faction === f)).toBe(true);
      }
      for (const a of c.axis) expect(c.factions).toContain(a);
    }
  });

  it("gameOf sin juego es CoH3", () => {
    expect(gameOf(undefined).game).toBe("coh3");
    expect(gameOf("coh1").title).toBe("coh1");
  });
});

describe("nombre de una facción por juego", () => {
  it("cada juego con sus textos, nunca la clave cruda", async () => {
    const { factionLabel } = await import("../src/coh3/games");
    expect(factionLabel("coh2", "es", "okw", true)).toBe("OKW");
    expect(factionLabel("coh2", "en", "soviet", false)).toBe("Soviet Union");
    expect(factionLabel("coh1", "en", "american", true)).toBe("Americans");
    expect(factionLabel("coh3", "en", "american", true)).toBe("USF");
  });
});
