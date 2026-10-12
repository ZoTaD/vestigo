import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { moodOf, type NpcData } from "../src/terraria/npcs/happiness";

const data: NpcData = JSON.parse(readFileSync(new URL("../../games/terraria/data/npcs.json", import.meta.url), "utf-8"));
const id = (en: string) => data.npcs.find((n) => n.name[0] === en)!.id;

describe("felicidad de los NPC de Terraria", () => {
  it("las constantes son las que se midieron en el juego", () => {
    expect(data.consts).toEqual({ love: 0.88, like: 0.94, dislike: 1.06, hate: 1.12, min: 0.75, max: 1.5, solitude: 0.95, solitudeUpTo: 2, crowdFrom: 3, crowdStep: 1.05 });
    expect(data.npcs).toHaveLength(25);
  });

  it("solo, en un bioma que le da igual, paga el descuento por pocos vecinos", () => {
    const m = moodOf(data, id("Merchant"), "Ocean", [id("Merchant")]);
    expect(m.price).toBe(0.95);
    expect(m.factors).toEqual([{ kind: "solitude" }]);
    expect(m.pylon).toBe(false);
  });

  it("el Mercader en el Bosque con el Golfista: bioma y vecino que le gustan, y vende el pilón", () => {
    const m = moodOf(data, id("Merchant"), "Forest", [id("Merchant"), id("Golfer")]);
    // 0,95 × 0,94 × 0,94 = 0,839 → 0,84
    expect(m.price).toBe(0.84);
    expect(m.factors).toEqual([{ kind: "solitude" }, { kind: "biome", level: "like" }, { kind: "npc", level: "like", npc: id("Golfer") }]);
    expect(m.pylon).toBe(true);
  });

  it("con alguien que odia, el precio sube; el pilón lo vende igual (desde la 1.4.5 no depende del precio)", () => {
    const m = moodOf(data, id("Merchant"), "Ocean", [id("Merchant"), id("Angler")]);
    expect(m.price).toBe(1.06); // 0,95 × 1,12
    expect(m.pylon).toBe(true);
  });

  it("el Tabernero no vende pilones", () => {
    expect(moodOf(data, id("Tavernkeep"), "Forest", [id("Tavernkeep"), id("Merchant")]).pylon).toBe(false);
  });

  it("en la Mazmorra, la Corrupción y el Carmesí todo cuesta el máximo", () => {
    for (const biome of ["Dungeon", "Corruption", "Crimson"]) {
      const m = moodOf(data, id("Merchant"), biome, [id("Merchant"), id("Golfer")]);
      expect(m).toEqual({ price: 1.5, factors: [{ kind: "ruined" }], pylon: false });
    }
  });

  it("amontonados: a partir del cuarto vecino, 5 % más por cada uno", () => {
    const neutral = data.npcs.filter((n) => n.id !== id("Guide") && !data.npcs.find((g) => g.id === id("Guide"))!.likes[String(n.id)]).map((n) => n.id);
    const price = (k: number) => moodOf(data, id("Guide"), "Ocean", [id("Guide"), ...neutral.slice(0, k)]).price;
    // El Guía no quiere el Océano (×1,06): se compara contra tres vecinos, que es el punto neutro.
    expect(price(2) / price(3)).toBeCloseTo(0.95, 1);
    expect(price(4) / price(3)).toBeCloseTo(1.05, 1);
    expect(price(6) / price(3)).toBeCloseTo(1.16, 1);
  });

  it("el precio no sale de los topes del juego, ni con los 25 amontonados", () => {
    const all = data.npcs.map((n) => n.id);
    for (const n of data.npcs) {
      expect(moodOf(data, n.id, "Dungeon", all).pylon).toBe(false);
      const m = moodOf(data, n.id, "NormalUnderground", all);
      expect(m.price).toBeLessThanOrEqual(1.5);
      expect(m.price).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("un NPC que no existe no rompe", () => {
    expect(moodOf(data, 99999, "Forest", [])).toEqual({ price: 1, factors: [], pylon: false });
  });
});
