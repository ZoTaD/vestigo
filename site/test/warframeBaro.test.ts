import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBaro, parseBaro } from "../src/warframe/baro/baroLive";

/** La forma de `api.warframestat.us/pc/voidTrader` (respuesta real del 2026-10-27, con un inventario de ejemplo). */
const visit = (inventory: unknown[]) => ({
  id: "5d1e07a0a38e4a4fdd7cefca",
  activation: "2026-10-30T13:00:00.000Z",
  expiry: "2026-11-01T13:00:00.000Z",
  character: "Baro Ki'Teer",
  location: "Larunda Relay (Mercury)",
  inventory,
});
const ARRIVES = Date.parse("2026-10-30T13:00:00.000Z");
const LEAVES = Date.parse("2026-11-01T13:00:00.000Z");

describe("Baro Ki'Teer en vivo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ya llegó: el relé, cuándo se va y su inventario", () => {
    const json = visit([
      { uniqueName: "/Lotus/StoreItems/Upgrades/Mods/Rifle/Expert/PrimedRifleDamageMod", item: "Primed Serration", ducats: 400, credits: 200000 },
      { uniqueName: "/Lotus/StoreItems/Types/Items/ShipDecos/BaroDeco", item: "Baro Ki'Teer Statue", ducats: 100, credits: 50000 },
      { item: "" },
      null,
    ]);
    const b = parseBaro(json, ARRIVES + 3_600_000);
    expect(b).toMatchObject({ active: true, location: "Larunda Relay (Mercury)", startsAt: ARRIVES, endsAt: LEAVES });
    expect(b?.items).toEqual([
      { unique: "/Lotus/StoreItems/Upgrades/Mods/Rifle/Expert/PrimedRifleDamageMod", name: "Primed Serration", ducats: 400, credits: 200000 },
      { unique: "/Lotus/StoreItems/Types/Items/ShipDecos/BaroDeco", name: "Baro Ki'Teer Statue", ducats: 100, credits: 50000 },
    ]);
  });

  it("antes de llegar: dónde y cuándo llega, sin inventario", () => {
    const b = parseBaro(visit([]), ARRIVES - 86_400_000);
    expect(b).toEqual({ active: false, location: "Larunda Relay (Mercury)", startsAt: ARRIVES, endsAt: LEAVES, items: [] });
  });

  it("una visita vencida no se muestra", () => {
    expect(parseBaro(visit([]), LEAVES)).toBeNull();
    expect(parseBaro(visit([]), LEAVES + 1)).toBeNull();
  });

  it("una forma que no se entiende da null", () => {
    for (const bad of [null, undefined, "x", 3, [], {}, { activation: "ayer", expiry: "mañana" }, { activation: "2026-10-30T13:00:00.000Z" }]) {
      expect(parseBaro(bad, ARRIVES)).toBeNull();
    }
  });

  it("si la API falla, null sin tirar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await fetchBaro("en")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await fetchBaro("es")).toBeNull();
  });

  it("pide voidTrader en el idioma de la página", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => visit([]) });
    vi.stubGlobal("fetch", f);
    await fetchBaro("es");
    expect(f.mock.calls[0][0]).toBe("https://api.warframestat.us/pc/voidTrader?language=es");
  });
});
