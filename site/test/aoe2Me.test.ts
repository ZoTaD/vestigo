import { describe, expect, it } from "vitest";
import { localFollows, mergeFollows, resolveFollows, saveLocalFollows, steamIdDeSesion, toggle } from "../src/aoe2/players/me";

/** Un localStorage de mentira. */
const fakeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), dump: m };
};

describe("seguidos y perfil propio", () => {
  it("sin nada guardado: vacío", () => {
    expect(localFollows(fakeStorage())).toEqual({ follows: [] });
  });
  it("guarda en el navegador y lo vuelve a leer", () => {
    const s = fakeStorage();
    saveLocalFollows(s, { follows: [1, 2] });
    expect(localFollows(s)).toEqual({ follows: [1, 2] });
  });
  it("un valor roto en el navegador no rompe", () => {
    const s = fakeStorage();
    s.setItem("vg_aoe2_follows", "{no json");
    expect(localFollows(s)).toEqual({ follows: [] });
  });
  it("lo guardado con el viejo 'soy yo' se lee sin él", () => {
    const s = fakeStorage();
    s.setItem("vg_aoe2_follows", JSON.stringify({ me: 9, follows: [1] }));
    expect(localFollows(s)).toEqual({ follows: [1] });
  });
  it("el perfil propio sale del SteamID de la sesión, y sin sesión no hay", () => {
    const s = fakeStorage();
    s.setItem("vg_account", JSON.stringify({ steamId: "76561198162711561", accountId: 1, name: "x", avatar: "" }));
    expect(steamIdDeSesion(s, true)).toBe("76561198162711561");
    expect(steamIdDeSesion(s, false)).toBeNull();
    s.setItem("vg_account", JSON.stringify({ steamId: "123" }));
    expect(steamIdDeSesion(s, true)).toBeNull();
  });
  it("al iniciar sesión junta lo local con lo de la cuenta, sin repetidos", () => {
    expect(mergeFollows({ follows: [1, 2] }, { follows: [2, 3] })).toEqual({ follows: [2, 3, 1] });
  });
  it("la estrella agrega o saca", () => {
    expect(toggle([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggle([1, 2], 1)).toEqual([2]);
  });
  it("con sesión, lo del navegador se junta sólo la primera vez; después manda la cuenta", () => {
    const local = { follows: [1, 2] };
    const cuenta = { follows: [2, 3] };
    expect(resolveFollows(local, cuenta, false)).toEqual({ follows: [2, 3, 1] });
    // Ya se juntó antes en este navegador: lo que se dejó de seguir en otro equipo no vuelve.
    expect(resolveFollows(local, cuenta, true)).toEqual(cuenta);
  });
});
