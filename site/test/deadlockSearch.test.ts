import { describe, it, expect } from "vitest";
import { nameMatch, rankAccounts, type SteamAccount } from "../src/deadlockMatch";

const acc = (name: string, recent: number, accountId = recent): SteamAccount => ({
  accountId,
  name,
  avatar: null,
  country: null,
  recent,
  steamUrl: null,
});

describe("nameMatch", () => {
  it("separa idéntico, mayúsculas, prefijo, contiene y parecido", () => {
    expect(nameMatch("ZoTaD", "ZoTaD")).toBe(0);
    expect(nameMatch("zotad", "ZoTaD")).toBe(1);
    expect(nameMatch("ZoTaD_tv", "zotad")).toBe(2);
    expect(nameMatch("Sr_Zotac", "zota")).toBe(3);
    expect(nameMatch("Lotad", "ZoTaD")).toBe(4);
    expect(nameMatch("ZoTaD", "  ZoTaD ")).toBe(0);
  });
});

describe("rankAccounts", () => {
  // Lo que devolvió steam-search para "ZoTaD" el 12/11, en parte.
  const api = [
    acc("ZoTaD", 13, 1),
    acc("zota", 18, 2),
    acc("Zotan_", 62, 3),
    acc("Zobad", 36, 4),
    acc("Lotad", 71, 5),
    acc("Lotad", 69, 6),
    acc("TT_Zotac", 48, 7),
  ];

  it("el nombre exacto va primero aunque juegue menos", () => {
    expect(rankAccounts(api, "ZoTaD")[0].accountId).toBe(1);
  });

  it("dentro de cada nivel desempatan las partidas", () => {
    const r = rankAccounts(api, "ZoTaD").map((a) => a.accountId);
    expect(r).toEqual([1, 5, 6, 3, 7, 4, 2]);
    const z = rankAccounts(api, "zota").map((a) => a.accountId);
    // "zota" idéntico, después los que empiezan con zota, después los que la contienen.
    expect(z.slice(0, 4)).toEqual([2, 3, 1, 7]);
  });
});
