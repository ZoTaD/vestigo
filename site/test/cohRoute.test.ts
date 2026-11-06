import { describe, expect, it } from "vitest";
import { cohTabs, parseRoute, routePath, switchGame } from "../src/route";

describe("rutas de Company of Heroes con tres juegos", () => {
  it("CoH2 en español", () => {
    const r = parseRoute("/es/coh2/ranking");
    expect(r).toMatchObject({ lang: "es", view: "coh3", cohGame: "coh2", c3Section: "leaderboards" });
    expect(routePath(r)).toBe("/es/coh2/ranking");
    expect(routePath({ ...r, lang: "en" })).toBe("/en/coh2/leaderboards");
  });
  it("portada de CoH1", () => {
    const r = parseRoute("/en/coh1");
    expect(r).toMatchObject({ view: "coh3", cohGame: "coh1", c3Section: "home" });
    expect(routePath(r)).toBe("/en/coh1");
  });
  it("CoH3 no cambia ni una dirección", () => {
    const r = parseRoute("/es/coh3/unidades/riflemen_us");
    expect(r).toMatchObject({ view: "coh3", c3Section: "units", detail: "riflemen_us" });
    expect(r.cohGame ?? "coh3").toBe("coh3");
    expect(routePath(r)).toBe("/es/coh3/unidades/riflemen_us");
    expect(routePath(parseRoute("/en/coh3/leaderboards"))).toBe("/en/coh3/leaderboards");
  });
  it("una pestaña que CoH2 no tiene es su portada", () => {
    expect(parseRoute("/es/coh2/desafios")).toMatchObject({ cohGame: "coh2", c3Section: "home" });
    expect(cohTabs("coh2")).not.toContain("challenges");
    expect(cohTabs("coh2")).toContain("achievements");
    // El CoH1 relanzado no tiene logros de Steam.
    expect(cohTabs("coh1")).not.toContain("achievements");
    expect(parseRoute("/es/coh1/logros")).toMatchObject({ cohGame: "coh1", c3Section: "home" });
  });
  it("jugador y partida de CoH2 llevan el número", () => {
    const r = parseRoute("/en/coh2/players/4623580");
    expect(r).toMatchObject({ cohGame: "coh2", c3Section: "players", detail: "4623580" });
    expect(routePath({ ...r, lang: "es" })).toBe("/es/coh2/jugadores/4623580");
  });
  it("cambiar de juego: misma pestaña si existe, si no la portada; nunca la ficha", () => {
    const desafios = parseRoute("/en/coh3/challenges");
    expect(switchGame(desafios, "coh2")).toMatchObject({ cohGame: "coh2", c3Section: "home", detail: undefined });
    expect(switchGame(parseRoute("/en/coh3/units/riflemen_us"), "coh2")).toMatchObject({ cohGame: "coh2", c3Section: "units", detail: undefined });
    const lb = { ...parseRoute("/en/coh3/leaderboards"), detail: "x" };
    expect(switchGame(lb, "coh1")).toMatchObject({ cohGame: "coh1", c3Section: "leaderboards", detail: undefined });
    expect(routePath(switchGame(parseRoute("/es/coh2/rangos"), "coh3"))).toBe("/es/coh3/rangos");
  });
});

describe("enciclopedia de CoH2", () => {
  it("unidades, comandantes y boletines con sus direcciones", () => {
    const r = parseRoute("/es/coh2/unidades/conscript_squad_mp");
    expect(r).toMatchObject({ cohGame: "coh2", c3Section: "units", detail: "conscript_squad_mp" });
    expect(routePath({ ...parseRoute("/es/coh2/comandantes/advanced_warfare_tactics"), lang: "en" })).toBe("/en/coh2/commanders/advanced_warfare_tactics");
    expect(parseRoute("/en/coh2/bulletins")).toMatchObject({ cohGame: "coh2", c3Section: "bulletins" });
    expect(routePath(parseRoute("/es/coh2/boletines"))).toBe("/es/coh2/boletines");
    expect(cohTabs("coh2")).toEqual(expect.arrayContaining(["units", "weapons", "commanders", "bulletins", "penetration", "dps", "maps"]));
    // CoH3 no tiene comandantes ni boletines; CoH1 todavía no tiene enciclopedia.
    expect(parseRoute("/es/coh3/comandantes")).toMatchObject({ c3Section: "home" });
    expect(cohTabs("coh1")).not.toContain("units");
  });
  it("battlegroups de CoH3 ↔ comandantes de CoH2", () => {
    expect(switchGame(parseRoute("/en/coh3/battlegroups"), "coh2")).toMatchObject({ cohGame: "coh2", c3Section: "commanders" });
    expect(switchGame(parseRoute("/en/coh2/commanders"), "coh3")).toMatchObject({ c3Section: "battlegroups" });
  });
});
