import { describe, expect, it } from "vitest";
import { localFollows, mergeFollows, resolveFollows, saveLocalFollows, toggle } from "../src/aoe2/players/me";

/** Un localStorage de mentira. */
const fakeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), dump: m };
};

describe("seguidos y soy yo", () => {
  it("sin nada guardado: vacío", () => {
    expect(localFollows(fakeStorage())).toEqual({ me: null, follows: [] });
  });
  it("guarda en el navegador y lo vuelve a leer", () => {
    const s = fakeStorage();
    saveLocalFollows(s, { me: 9, follows: [1, 2] });
    expect(localFollows(s)).toEqual({ me: 9, follows: [1, 2] });
  });
  it("un valor roto en el navegador no rompe", () => {
    const s = fakeStorage();
    s.setItem("vg_aoe2_follows", "{no json");
    expect(localFollows(s)).toEqual({ me: null, follows: [] });
  });
  it("al iniciar sesión junta lo local con lo de la cuenta, sin repetidos; manda el 'soy yo' de la cuenta", () => {
    expect(mergeFollows({ me: 5, follows: [1, 2] }, { me: 9, follows: [2, 3] })).toEqual({ me: 9, follows: [2, 3, 1] });
    expect(mergeFollows({ me: 5, follows: [] }, { me: null, follows: [] })).toEqual({ me: 5, follows: [] });
  });
  it("la estrella agrega o saca", () => {
    expect(toggle([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggle([1, 2], 1)).toEqual([2]);
  });
  it("con sesión, lo del navegador se junta sólo la primera vez; después manda la cuenta", () => {
    const local = { me: 5, follows: [1, 2] };
    const cuenta = { me: null, follows: [2, 3] };
    expect(resolveFollows(local, cuenta, false)).toEqual({ me: 5, follows: [2, 3, 1] });
    // Ya se juntó antes en este navegador: lo que se dejó de seguir en otro equipo no vuelve.
    expect(resolveFollows(local, cuenta, true)).toEqual(cuenta);
  });
});
