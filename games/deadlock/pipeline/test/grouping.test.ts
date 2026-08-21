import { describe, it, expect } from "vitest";
import { archetypesForHero, CORE_PREVALENCIA, MAX_ARQUETIPOS } from "../src/grouping";
import { parseCore } from "../src/buildCard";
import type { ItemMeta, PlayerRow } from "../src/features";

const meta = new Map<number, ItemMeta>([
  [1, { cost: 800, slot: "weapon" }],
  [2, { cost: 3200, slot: "weapon" }],
  [3, { cost: 6400, slot: "weapon" }],
  [4, { cost: 800, slot: "spirit" }],
  [5, { cost: 6400, slot: "spirit" }],
  [6, { cost: 1600, slot: "vitality" }],
]);

const j = (p: Partial<PlayerRow>): PlayerRow => ({
  heroId: 8, won: true, items: [1, 2], abilities: [{ id: 100, levels: 4 }], imbued: 0, ...p,
});

const rep = (n: number, p: Partial<PlayerRow>) => Array.from({ length: n }, () => j(p));

describe("archetypesForHero", () => {
  it("no publica nada por debajo de la muestra mínima", () => {
    expect(archetypesForHero(rep(20, {}), meta, { minGroup: 150 })).toEqual([]);
  });

  it("un héroe que se juega de una forma publica una sola build", () => {
    const g = archetypesForHero(rep(400, { items: [1, 2, 6] }), meta, { minGroup: 150 });
    expect(g).toHaveLength(1);
    expect(g[0].matches).toBe(400);
  });

  it("separa arma de espíritu y le pone el tipo de daño por almas", () => {
    const jugadores = [
      ...rep(300, { items: [1, 2, 3], abilities: [{ id: 100, levels: 4 }] }),
      ...rep(300, { items: [4, 5], abilities: [{ id: 100, levels: 4 }] }),
    ];
    const g = archetypesForHero(jugadores, meta, { minGroup: 150 });
    expect(g).toHaveLength(2);
    expect(new Set(g.map((x) => x.damage))).toEqual(new Set(["weapon", "spirit"]));
  });

  it("separa por lo que MAXEA aunque los objetos sean idénticos", () => {
    // El caso que motivó todo esto: mismo build, distinta habilidad.
    const jugadores = [
      ...rep(300, { items: [1, 2, 6], abilities: [{ id: 100, levels: 4 }, { id: 200, levels: 1 }] }),
      ...rep(300, { items: [1, 2, 6], abilities: [{ id: 100, levels: 1 }, { id: 200, levels: 4 }] }),
    ];
    const g = archetypesForHero(jugadores, meta, { minGroup: 150 });
    expect(g).toHaveLength(2);
  });

  it("no le inventa una build a una minoría", () => {
    // 10% hace algo distinto. Es extremo, y AA lo encontraría; la cuota mínima
    // es la que decide que cuarenta personas no son una forma de jugar.
    const jugadores = [
      ...rep(360, { items: [1, 2, 6] }),
      ...rep(40, { items: [4, 5], abilities: [{ id: 200, levels: 4 }] }),
    ];
    expect(archetypesForHero(jugadores, meta, { minGroup: 150 })).toHaveLength(1);
  });

  it("nunca publica más de tres", () => {
    const jugadores = [
      ...rep(300, { items: [1], abilities: [{ id: 100, levels: 4 }] }),
      ...rep(300, { items: [2], abilities: [{ id: 200, levels: 4 }] }),
      ...rep(300, { items: [3], abilities: [{ id: 300, levels: 4 }] }),
      ...rep(300, { items: [5], abilities: [{ id: 400, levels: 4 }] }),
    ];
    const g = archetypesForHero(jugadores, meta, { minGroup: 150 });
    expect(g.length).toBeLessThanOrEqual(MAX_ARQUETIPOS);
    expect(MAX_ARQUETIPOS).toBe(3);
  });

  it("el núcleo sale en el formato que el resto del pipeline ya sabía leer", () => {
    const g = archetypesForHero(rep(300, { items: [1, 2] }), meta, { minGroup: 150 });
    const core = parseCore(g[0].core);
    expect(core.length).toBeGreaterThan(0);
    for (const c of core) {
      expect(Number.isFinite(c.itemId)).toBe(true);
      expect(c.prevalence).toBeGreaterThanOrEqual(CORE_PREVALENCIA);
      expect(c.prevalence).toBeLessThanOrEqual(1);
    }
  });

  it("deja afuera del núcleo lo que casi nadie de esa build lleva", () => {
    const jugadores = [
      ...rep(380, { items: [1, 2] }),
      ...rep(20, { items: [1, 2, 3] }), // el 3 lo lleva el 5%
    ];
    const g = archetypesForHero(jugadores, meta, { minGroup: 150 });
    const ids = parseCore(g[0].core).map((c) => c.itemId);
    expect(ids).toContain(1);
    expect(ids).not.toContain(3);
  });

  it("el winRate es el de los suyos, no el del héroe", () => {
    const jugadores = [
      ...rep(300, { items: [1, 2, 3], won: true }),
      ...rep(300, { items: [4, 5], won: false }),
    ];
    const g = archetypesForHero(jugadores, meta, { minGroup: 150 });
    const arma = g.find((x) => x.damage === "weapon")!;
    const esp = g.find((x) => x.damage === "spirit")!;
    expect(arma.winRate).toBeCloseTo(1, 6);
    expect(esp.winRate).toBeCloseTo(0, 6);
  });

  it("publica cuán comprometida está su gente", () => {
    const g = archetypesForHero(rep(300, { items: [1, 2] }), meta, { minGroup: 150 });
    expect(g[0].commitment).toBeGreaterThan(0);
    expect(g[0].commitment).toBeLessThanOrEqual(1);
  });

  it("sale ordenado por partidas, la más jugada primero", () => {
    const jugadores = [
      ...rep(200, { items: [1, 2, 3], abilities: [{ id: 100, levels: 4 }] }),
      ...rep(500, { items: [4, 5], abilities: [{ id: 200, levels: 4 }] }),
    ];
    const g = archetypesForHero(jugadores, meta, { minGroup: 150 });
    expect(g).toHaveLength(2);
    expect(g[0].matches).toBeGreaterThan(g[1].matches);
  });

  it("es determinista", () => {
    const jugadores = [
      ...rep(300, { items: [1, 2, 3], abilities: [{ id: 100, levels: 4 }] }),
      ...rep(300, { items: [4, 5], abilities: [{ id: 200, levels: 4 }] }),
    ];
    const a = archetypesForHero(jugadores, meta, { minGroup: 150 });
    const b = archetypesForHero(jugadores, meta, { minGroup: 150 });
    expect(a).toEqual(b);
  });
});
