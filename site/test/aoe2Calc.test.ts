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
  it("multiplicar el ataque de una clase (bono de pólvora de los borgoñones: +25 %)", () => {
    const canonero: Combatiente = { ...lancero, id: 5, cls: 44, attacks: { 3: 17, 1: 10 } };
    // 7037 = 27 × 256 + 125: clase 27, ×1,25. Toca a la unidad 5; la clase que no tiene no aparece.
    const c = aplicar(canonero, [[5, 5, -1, 9, 27 * 256 + 125], [5, 5, -1, 9, 3 * 256 + 125]]);
    expect(c.attacks[3]).toBe(21);
    expect(c.attacks[27]).toBeUndefined();
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

describe("casos del juego con los datos reales (2026-11-26)", async () => {
  const tree = (await import("@aoe2/encyclopedia/tree.json")).default as any;
  const U = ((await import("@aoe2/encyclopedia/units.json")).default as any).units;
  const T = (await import("@aoe2/encyclopedia/techs.json")).default as any[];
  const F = (await import("@aoe2/encyclopedia/civfx.json")).default as any;
  const { armar, mejorasPara } = await import("../src/aoe2/encyclopedia/armar");
  const u = (s: string) => U.find((x: any) => x.slug === s);
  const pelado = (s: string, civ = "britons") => armar(u(s), civ, 4, {}, []);
  const conTodo = (s: string, civ: string) => armar(u(s), civ, 4, F, mejorasPara(T, tree, civ, u(s), 4));
  it("un Caballero mata a un Arquero en 3 golpes", () => {
    expect(duelo(pelado("knight"), pelado("archer")).golpes).toBe(3);
  });
  it("Alabardero contra Paladín, sin mejoras: 6 + 32 contra caballería − 2 de armadura = 36; 5 golpes", () => {
    const d = duelo(pelado("halberdier"), pelado("paladin", "franks"));
    expect(d.dano).toBe(36);
    expect(d.golpes).toBe(5);
  });
  it("Paladín franco con todo: 192 de vida; contra un Alabardero con todo pega 15 y lo mata en 4", () => {
    const pal = conTodo("paladin", "franks");
    expect(pal.hp).toBe(192);
    const d = duelo(pal, conTodo("halberdier", "britons"));
    expect(d.dano).toBe(15);
    expect(d.golpes).toBe(4);
  });
  it("la Mangonela mata a un Arquero de un golpe", () => {
    expect(duelo(pelado("mangonel"), pelado("archer")).golpes).toBe(1);
  });
  it("los soldados sicilianos reciben 40% menos de daño de bonificación", () => {
    const sic = conTodo("cavalier", "sicilians");
    expect(sic.bonusRes).toBeCloseTo(0.4);
    const contraSic = duelo(pelado("halberdier"), sic).dano;
    const contraOtro = duelo(pelado("halberdier"), { ...sic, bonusRes: 0 }).dano;
    // El bonus contra caballería (32) baja a 19,2; el ataque base no cambia.
    expect(contraOtro - contraSic).toBeCloseTo(32 * 0.4, 5);
  });
});

describe("unidad según civ y edad", async () => {
  const tree = (await import("@aoe2/encyclopedia/tree.json")).default as any;
  const U = ((await import("@aoe2/encyclopedia/units.json")).default as any).units;
  const { unidadPara } = await import("../src/aoe2/encyclopedia/armar");
  it("en Castillos, el Alabardero pasa a Piquero y el Paladín a Jinete", () => {
    expect(unidadPara("halberdier", "britons", 3, U, tree)).toBe("pikeman");
    expect(unidadPara("paladin", "franks", 3, U, tree)).toBe("knight");
  });
  it("una civ sin la unidad toma la mejor de su línea que tiene, o algo del mismo edificio", () => {
    expect(unidadPara("paladin", "britons", 4, U, tree)).toBe("cavalier");
    const azteca = unidadPara("cavalier", "aztecs", 4, U, tree);
    expect(U.find((x: any) => x.slug === azteca).building).not.toBe(101);
  });
});
