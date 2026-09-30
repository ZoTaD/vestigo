import { describe, expect, it } from "vitest";
import { charmRoom, packCharms, resistances, validCharms } from "../src/d2r/D2rPlanner";

/** Lo que suma el equipo para cada stat, como lo lee el planificador. */
const gear = (m: Record<string, number>) => (stat: string) => m[stat] ?? 0;

describe("las resistencias del planificador, como en la hoja del personaje", () => {
  it("en Infierno arrancan en −100: +50 de fuego y +10 de lo demás dan −50 y −90", () => {
    const r = resistances(gear({ fireresist: 50, coldresist: 10, lightresist: 10, poisonresist: 10 }), 2);
    expect(r.map((x) => x.shown)).toEqual([-50, -90, -90, -90]);
    expect(r.map((x) => x.gear)).toEqual([50, 10, 10, 10]);
  });

  it("en Pesadilla restan 40", () => {
    expect(resistances(gear({ poisonresist: 40 }), 1)[3].shown).toBe(0);
  });

  it("en Normal no hay penalidad, y el tope es 75 más la resistencia máxima", () => {
    const r = resistances(gear({ fireresist: 50, coldresist: 120, maxcoldresist: 5 }), 0);
    expect(r[0].shown).toBe(50);
    expect(r[1]).toMatchObject({ raw: 120, cap: 80, shown: 80 });
  });
});

describe("los talismanes en la grilla de 10×4, como en el inventario del juego", () => {
  const u = (id: string) => ({ k: "u" as const, id });

  it("cada uno va al primer hueco donde entra su alto: diez grandiosos llenan tres filas y la cuarta queda libre", () => {
    const pos = packCharms(Array(10).fill(3));
    expect(pos.map((p) => p && p.col)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pos.every((p) => p?.row === 0)).toBe(true);
    expect(packCharms([...Array(10).fill(3), 3]).at(-1)).toBeNull();
    expect(packCharms([...Array(10).fill(3), 1]).at(-1)).toEqual({ col: 0, row: 3 });
  });

  it("entran 20 grandes y 40 chicos", () => {
    expect(packCharms(Array(20).fill(2)).every(Boolean)).toBe(true);
    expect(packCharms(Array(21).fill(2)).at(-1)).toBeNull();
    expect(packCharms(Array(40).fill(1)).every(Boolean)).toBe(true);
  });

  it("de los que el juego deja llevar uno solo (Annihilus, Antorcha, Fortuna de Gheed) queda uno", () => {
    expect(validCharms([u("gheeds-fortune"), u("gheeds-fortune"), u("annihilus"), u("annihilus"), u("hellfire-torch")])).toEqual([u("gheeds-fortune"), u("annihilus"), u("hellfire-torch")]);
  });

  it("con diez grandiosos ya no entra otro grandioso, pero sí el Annihilus en la fila de abajo", () => {
    const ten = Array.from({ length: 10 }, () => u("latent-cold-rupture"));
    expect(validCharms([...ten, u("latent-flame-rift")])).toHaveLength(10);
    const room = charmRoom(ten);
    expect(room.first).toEqual({ col: 0, row: 3 });
    expect(room.fits(u("latent-flame-rift"))).toBe(false);
    expect(room.fits(u("annihilus"))).toBe(true);
    expect(validCharms([...ten, u("annihilus")])).toHaveLength(11);
    expect(charmRoom([...ten, u("annihilus")]).fits(u("annihilus"))).toBe(false);
  });
});
