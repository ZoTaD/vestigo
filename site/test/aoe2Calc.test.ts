import { describe, expect, it } from "vitest";
import { aplicar, claseValor, danio, duelo, type Combatiente } from "../src/aoe2/encyclopedia/calc";

const caballero: Combatiente = {
  id: 38, cls: 12, hp: 100, attacks: { 4: 10, 15: 0 }, armors: { 4: 2, 3: 2, 8: 0 }, reload: 1.8, accuracy: 100, range: 0, speed: 1.35, los: 4,
};
const lancero: Combatiente = {
  id: 93, cls: 6, hp: 45, attacks: { 4: 3, 8: 15, 30: 12 }, armors: { 4: 0, 3: 0, 1: 0, 27: 0 }, reload: 3, accuracy: 100, range: 0, speed: 1, los: 4,
};

describe("calculadora de AoE2", () => {
  it("clase y valor de un efecto de ataque o armadura", () => {
    expect(claseValor(21 * 256 + 1)).toEqual([21, 1]);
    expect(claseValor(3 * 256 - 1)).toEqual([3, -1]);
  });
  it("daño: suma por clase compartida, mínimo 1", () => {
    expect(danio(caballero, lancero)).toBe(10);
    expect(danio(lancero, caballero)).toBe(1 + 15);
    expect(danio({ ...lancero, attacks: { 4: 1 } }, { ...caballero, armors: { 4: 5 } })).toBe(1);
  });
  it("efectos: sumar ataque a una clase, multiplicar vida y fijar por unidad", () => {
    const forja: [number, number, number, number, number][] = [[4, -1, 12, 9, 4 * 256 + 1]];
    expect(aplicar(caballero, forja).attacks[4]).toBe(11);
    // Otra clase: no toca.
    expect(aplicar(lancero, forja).attacks[4]).toBe(3);
    expect(aplicar(caballero, [[5, -1, 12, 0, 1.2]]).hp).toBe(120);
    expect(aplicar(caballero, [[0, 38, -1, 10, 1.5]]).reload).toBe(1.5);
    expect(aplicar(lancero, [[4, 93, -1, 8, 3 * 256 + 1]]).armors[3]).toBe(1);
    // Armadura a una clase que no tenía: aparece.
    expect(aplicar(caballero, [[4, 38, -1, 8, 15 * 256 + 2]]).armors[15]).toBe(2);
  });
  it("duelo: golpes y segundos para matar (el primer golpe sale al empezar)", () => {
    const d = duelo(lancero, caballero);
    expect(d.dano).toBe(16);
    expect(d.golpes).toBe(Math.ceil(100 / 16));
    expect(d.segundos).toBeCloseTo((7 - 1) * 3);
  });
  it("con precisión menor a 100 los golpes esperados suben", () => {
    const arquero: Combatiente = { ...lancero, attacks: { 3: 4 }, accuracy: 80, reload: 2, range: 4 };
    const d = duelo(arquero, caballero);
    expect(d.golpes).toBe(50);
    expect(d.esperados).toBeCloseTo(50 / 0.8);
  });
});
