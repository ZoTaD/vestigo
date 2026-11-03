import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compact, inventoryUrl, merge, parseProfile, parseVanityXml, skinSlugOf } from "../src/cs2/inventory/steam";

const raw = JSON.parse(readFileSync(new URL("./fixtures/cs2-inventory.json", import.meta.url), "utf-8"));

describe("leer el perfil que se pega", () => {
  it("SteamID64, URL de perfil (con o sin barra, con /inventory) y nombre", () => {
    expect(parseProfile(" 76561198000000001 ")).toEqual({ kind: "id", value: "76561198000000001" });
    expect(parseProfile("https://steamcommunity.com/profiles/76561198000000001/inventory/#730")).toEqual({ kind: "id", value: "76561198000000001" });
    expect(parseProfile("steamcommunity.com/id/zotad/")).toEqual({ kind: "vanity", value: "zotad" });
    expect(parseProfile("zotad")).toEqual({ kind: "vanity", value: "zotad" });
  });
  it("lo que no es un perfil da null", () => {
    expect(parseProfile("")).toBeNull();
    expect(parseProfile("https://example.com/x")).toBeNull();
    expect(parseProfile("1234567890123456")).toBeNull();
    expect(parseProfile("no vale con espacios")).toBeNull();
  });
  it("el XML del perfil da el SteamID64", () => {
    expect(parseVanityXml("<profile><steamID64>76561198000000001</steamID64></profile>")).toBe("76561198000000001");
    expect(parseVanityXml("<response><error>The specified profile could not be found.</error></response>")).toBeNull();
  });
  it("la dirección de Steam pide de a 2000 y sigue desde el último objeto", () => {
    expect(inventoryUrl("76561198000000001")).toBe("https://steamcommunity.com/inventory/76561198000000001/730/2?l=english&count=2000");
    expect(inventoryUrl("76561198000000001", "99")).toContain("&start_assetid=99");
  });
});

describe("armar la lista del inventario", () => {
  it("junta los objetos iguales y cuenta cuántos hay", () => {
    const r = compact(raw);
    if ("error" in r) throw new Error(r.error);
    const caja = r.items.find((x) => x.name === "Operation Breakout Weapon Case")!;
    expect(caja.n).toBe(4);
    expect(caja.type).toBe("Container");
    expect(r.items.find((x) => x.name.startsWith("StatTrak™ MAC-10"))!.rarity).toBe("Restricted");
    expect(r.items.reduce((s, x) => s + x.n, 0)).toBe(6);
  });
  it("lo que no es un inventario da un error, no rompe", () => {
    expect(compact({ success: false })).toEqual({ error: "bad" });
    expect(compact("<html>Steam error</html>")).toEqual({ error: "bad" });
    expect(compact(null)).toEqual({ error: "bad" });
  });
  it("un inventario vacío es una lista vacía", () => {
    expect(compact({ success: 1, total_inventory_count: 0 })).toEqual({ items: [], more: false, lastAssetId: null });
  });
  it("junta páginas sumando los repetidos", () => {
    const a = compact(raw);
    if ("error" in a) throw new Error(a.error);
    const m = merge([a.items, a.items]);
    expect(m.find((x) => x.name === "Operation Breakout Weapon Case")!.n).toBe(8);
  });
});

describe("de un objeto del inventario a nuestra ficha", () => {
  it("saca StatTrak, Souvenir y el desgaste", () => {
    expect(skinSlugOf("StatTrak™ MAC-10 | Heat (Field-Tested)")).toBe("mac-10-heat");
    expect(skinSlugOf("Souvenir AWP | Dragon Lore (Factory New)")).toBe("awp-dragon-lore");
    expect(skinSlugOf("★ StatTrak™ Karambit | Fade (Minimal Wear)")).toBe("karambit-fade");
    expect(skinSlugOf("Operation Breakout Weapon Case")).toBe("operation-breakout-weapon-case");
  });
});
