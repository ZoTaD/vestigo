import { describe, expect, it } from "vitest";
import tree from "@aoe2/encyclopedia/tree.json";
import units from "@aoe2/encyclopedia/units.json";
import techs from "@aoe2/encyclopedia/techs.json";
import civfx from "@aoe2/encyclopedia/civfx.json";
import { bonosDe, fxCorto, mejoresUnidades, pesa } from "../src/aoe2/encyclopedia/identidad";
import type { Arbol, CivFx, Tecnologia, Unidad, Unidades } from "../src/aoe2/encyclopedia/data";

const a = tree as unknown as Arbol;
const U = units as unknown as Unidades;
const T = techs as unknown as Tecnologia[];
const F = civfx as unknown as CivFx;
const mejores = (civ: string) => mejoresUnidades(civ, a, U.units, T, F, "es", U.classes);
const nombres = (civ: string) => mejores(civ).map((m) => `${m.tier} ${m.unidad.name.es} ${m.fuerza.toFixed(2)}`);

describe("identidad de cada civ", () => {
  it("efectos en pocas palabras", () => {
    expect(fxCorto([5, -1, 12, 0, 1.2], "es")).toBe("+20% PV");
    expect(fxCorto([5, 82, -1, 100, 0.85], "es")).toBe("-15% costo");
    expect(fxCorto([4, -1, 12, 9, 4 * 256 + 1], "en")).toBe("+1 attack");
    expect(fxCorto([0, -1, 12, 11, 100], "es")).toBeNull();
  });
  it("francos: el Paladín arriba, con su +20% de PV, y su única en la lista", () => {
    const m = mejores("franks");
    expect(m[0].unidad.slug).toBe("paladin");
    expect(m[0].tier).toBe("S");
    expect(m[0].bonos).toContain("+20% PV");
    expect(m.some((x) => x.unica)).toBe(true);
    expect(m.length).toBeLessThanOrEqual(5);
  });
  it("cada civ tiene al menos 3 unidades y su única", () => {
    for (const civ of Object.keys(a.civs)) {
      const m = mejores(civ);
      expect(m.length, civ).toBeGreaterThanOrEqual(3);
      expect(m.some((x) => x.unica), civ).toBe(true);
    }
  });
  it("lo que pesa: la última de una línea o una mejora de muchas unidades", () => {
    const us = new Map(U.units.map((u) => [u.id, u]));
    const ts = new Map(T.map((t) => [t.id, t]));
    expect(pesa("u", 492, us, ts)).toBe(true); // Arbalestero
    expect(pesa("t", 435, us, ts)).toBe(true); // Pureza de sangre
    expect(pesa("t", 380, us, ts)).toBe(false); // Bala roja
  });
  it("muestra (para revisar a ojo)", () => {
    for (const c of ["franks", "britons", "mongols", "byzantines", "aztecs", "vikings", "teutons", "mayans", "maya", "chinese"]) if (a.civs[c]) console.log(c, nombres(c).join(" | "), "·", bonosDe(U.units.find((u) => u.slug === "paladin")!, c, F, "es").join(","));
  });
});

describe("bonos que se juntan", () => {
  it("britanos: +2 de alcance al Arquero de tiro largo y nada de alcance al Guerrillero", () => {
    const u = (slug: string) => U.units.find((x) => x.slug === slug)!;
    expect(bonosDe(u("elite-longbowman"), "britons", F, "es")).toContain("+2 alcance");
    expect(bonosDe(u("elite-skirmisher"), "britons", F, "es").some((b) => b.includes("alcance"))).toBe(false);
  });
});
