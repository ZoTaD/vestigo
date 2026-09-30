import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error: módulo .mjs sin tipos
import { computeAll } from "../src/shopFilters.mjs";

/**
 * Los filtros de la tienda nueva (City Never Sleeps) sobre recortes reales de
 * /v1/assets/items del 2026-09-29. Los esperados son los del juego para esos
 * objetos.
 */
const api = JSON.parse(readFileSync(new URL("./fixtures/shop-filter-items.json", import.meta.url), "utf8")) as {
  id: number;
  name: string;
}[];
const { items } = computeAll(api) as { items: Record<string, string[]> };
const filtros = (name: string): string[] => {
  const it = api.find((i) => i.name === name);
  if (!it) throw new Error(`falta ${name} en el recorte`);
  return items[String(it.id)] ?? [];
};

describe("los filtros de la tienda", () => {
  it("Toxic Bullets: daño de % de vida y anticuración", () => {
    expect(filtros("Toxic Bullets")).toEqual(expect.arrayContaining(["EShopFilterSpiritAdditionalDamagePct", "EShopFilterAntiHeal"]));
  });

  it("Sprint Boots: esprint y regeneración fuera de combate", () => {
    expect(filtros("Sprint Boots")).toEqual(expect.arrayContaining(["EShopFilterSprint", "EShopFilterOutOfCombatRegen"]));
  });

  it("Silence Wave: silencio y activo", () => {
    expect(filtros("Silence Wave")).toEqual(expect.arrayContaining(["EShopFilterStatus_Silence", "EShopFilterActive"]));
  });
});
