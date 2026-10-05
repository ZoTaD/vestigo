import { describe, expect, it } from "vitest";
import {
  cheapestMix, EXPLOSIVES, explosiveById, formatSelection, hitsFor, parseSelection, selectionCost, selectionMix, TARGETS, targetForItem,
} from "../src/rust/raid/model";

const t = (id: string) => TARGETS.find((x) => x.id === id)!;

describe("el modelo de la calculadora de raideo", () => {
  it("divide la vida por el daño, redondeando para arriba", () => {
    expect(hitsFor(t("building.stone"), "explosive.timed")).toBe(2);
    expect(hitsFor(t("building.stone"), "ammo.rocket.basic")).toBe(4);
    expect(hitsFor(t("building.toptier"), "explosive.timed")).toBe(8);
    expect(hitsFor(t("door.hinged.metal"), "explosive.satchel")).toBe(4);
  });

  it("un explosivo que no le hace nada da null", () => {
    expect(hitsFor(t("building.stone"), "no-existe")).toBeNull();
  });

  it("la mezcla más barata rompe el objetivo y no cuesta más que el mejor explosivo solo", () => {
    for (const target of TARGETS) {
      const mix = cheapestMix(target);
      if (!mix) continue;
      const dealt = Object.entries(mix.counts).reduce((s, [id, n]) => s + n * target.dmg[id], 0);
      expect(dealt).toBeGreaterThanOrEqual(target.hp - 1e-6);
      const single = EXPLOSIVES.filter((e) => e.cost && target.dmg[e.id]).map((e) => hitsFor(target, e.id)! * e.cost!.sulfur);
      expect(mix.sulfur).toBeLessThanOrEqual(Math.min(...single) + 1e-6);
    }
  });

  it("la pared de piedra sale más barata mezclando que con 2 C4 (4.400 de azufre)", () => {
    expect(cheapestMix(t("building.stone"))!.sulfur).toBeLessThan(4400);
  });

  it("suma la selección: 2 paredes de piedra y 1 puerta de chapa con C4", () => {
    const got = selectionCost({ "building.stone": 2, "door.hinged.metal": 1 }, "explosive.timed")!;
    expect(got.count).toBe(5);
    expect(got.sulfur).toBe(5 * 2200);
  });

  it("si algún objetivo no se rompe con ese explosivo, la suma no existe", () => {
    expect(selectionCost({ "building.stone": 1 }, "no-existe")).toBeNull();
  });

  it("la mezcla de la selección suma la de cada objetivo por su cantidad", () => {
    const one = cheapestMix(t("building.stone"))!;
    expect(selectionMix({ "building.stone": 3 })!.sulfur).toBe(3 * one.sulfur);
  });

  it("la selección va y vuelve por la URL, sin objetivos desconocidos ni cantidades raras", () => {
    const sel = { "building.stone": 2, "door.hinged.metal": 1 };
    const s = formatSelection(sel);
    expect(s).toBe("?o=building.stone:2,door.hinged.metal");
    expect(parseSelection(s)).toEqual(sel);
    expect(parseSelection("?o=no.existe:3,building.wood:0,building.metal:abc,building.stone:999")).toEqual({ "building.stone": 99 });
    expect(formatSelection({})).toBe("");
  });

  it("encuentra el objetivo de un objeto y el explosivo por id", () => {
    expect(targetForItem("door.hinged.metal")?.hp).toBe(250);
    expect(targetForItem("rifle.ak")).toBeUndefined();
    expect(explosiveById("explosive.timed")?.cost?.sulfur).toBe(2200);
  });
});
