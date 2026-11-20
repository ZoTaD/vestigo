import { describe, expect, it } from "vitest";
import { parseRoute, routePath } from "../src/route";

describe("rutas de AoE2", () => {
  it("lee una pestaña en español", () => {
    expect(parseRoute("/es/aoe2/civilizaciones")).toMatchObject({ lang: "es", view: "aoe2", a2Section: "civilizations" });
  });
  it("el perfil lleva el número del jugador", () => {
    const r = parseRoute("/en/aoe2/players/9423131");
    expect(r).toMatchObject({ view: "aoe2", a2Section: "players", detail: "9423131" });
    expect(routePath({ ...r, lang: "es" })).toBe("/es/aoe2/jugadores/9423131");
  });
  it("arma la dirección de una pestaña", () => {
    expect(routePath({ lang: "es", view: "aoe2", a2Section: "matchups" })).toBe("/es/aoe2/matchups");
    expect(routePath({ lang: "en", view: "aoe2", a2Section: "leaderboards" })).toBe("/en/aoe2/leaderboards");
  });
  it("una pestaña desconocida es la portada", () => {
    expect(parseRoute("/en/aoe2/xyz")).toMatchObject({ view: "aoe2", a2Section: "home" });
    expect(routePath(parseRoute("/en/aoe2"))).toBe("/en/aoe2");
  });
  it("las pestañas sin ficha ignoran lo que sigue", () => {
    expect(parseRoute("/en/aoe2/matchups/algo").detail).toBeUndefined();
  });
});
