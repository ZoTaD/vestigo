import { describe, expect, it, vi } from "vitest";
import { buscarPerfiles, pedirSeguidos } from "../src/aoe2/players/search";

const res = (status: number, body: unknown = {}) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("buscador de AoE2", () => {
  it("devuelve los resultados", async () => {
    const f = vi.fn(() => res(200, { results: [{ id: 1, alias: "Hera" }] }));
    expect(await buscarPerfiles("Hera", f)).toEqual([{ id: 1, alias: "Hera" }]);
  });
  it("un texto que la función rechaza (400) es 'sin resultados', no la API caída", async () => {
    expect(await buscarPerfiles("x".repeat(80), () => res(400))).toEqual([]);
  });
  it("502 o sin red: null (API caída)", async () => {
    expect(await buscarPerfiles("Hera", () => res(502))).toBeNull();
    expect(await buscarPerfiles("Hera", () => Promise.reject(new Error("red")))).toBeNull();
  });
  it("seguidos: la API caída da null", async () => {
    expect(await pedirSeguidos("1,2", () => res(502))).toBeNull();
    expect(await pedirSeguidos("1,2", () => res(200, { players: [{ id: 1, alias: "a", elo: 1 }] }))).toEqual([{ id: 1, alias: "a", elo: 1 }]);
  });
});
