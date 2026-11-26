import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpening } from "../src/aoe2/players/useOpening";

afterEach(() => vi.unstubAllGlobals());

describe("pedido de aperturas", () => {
  it("si la función falla, la próxima vez se vuelve a pedir", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("", { status: 502 })).mockResolvedValueOnce(new Response(JSON.stringify({ players: { 1: { opening: "scouts", apm: 90, ages: [500, null, null], units: [] } } }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await fetchOpening(1, 2)).toBeNull();
    expect(await fetchOpening(1, 2)).toEqual({ 1: "scouts" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[0][0])).toContain("/api/aoe2/analysis?");
  });
  it("sin grabación (404) no se vuelve a pedir", async () => {
    const f = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", f);
    expect(await fetchOpening(3, 4)).toBeNull();
    expect(await fetchOpening(3, 4)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("qué partidas tienen apertura", () => {
  it("sólo ranking RM y EW de más de 5 minutos", async () => {
    const { tieneApertura } = await import("../src/aoe2/players/useOpening");
    const m = (mode: string, dur: number) => ({ mode, start: 0, end: dur }) as never;
    expect(tieneApertura(m("rm1v1", 1200))).toBe(true);
    expect(tieneApertura(m("ewteam", 1200))).toBe(true);
    expect(tieneApertura(m("dm1v1", 1200))).toBe(false);
    expect(tieneApertura(m("custom", 1200))).toBe(false);
    expect(tieneApertura(m("rm1v1", 200))).toBe(false);
  });
});
