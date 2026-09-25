/// <reference types="node" />
// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — docs/locations.md, src/SeedLab.Locations/AltBiomes.cs y LocationPlacementEngine.cs (resultados medidos)
/**
 * La ubicación de lugares contra mundos reales:
 *
 * - Un mundo real propio (opcional, el repo es público): con
 *   VALHEIM_TEST_SEED y VALHEIM_TEST_PLAYER_LOG (el Player.log de alguien que
 *   entró a ese mundo), cada "Minimap: Adding unique location (x, y, z)" del
 *   log tiene que estar entre los lugares ubicados. Con el mundo del server de
 *   ZoTaD dio las cuatro posiciones a menos de 6 mm (2026-09-25).
 * - 75539276, el mundo recién creado que SeedLab volcó del juego: 12.228
 *   lugares de 178 prefabs.
 * - 319486907 (hnBd9gJf2G): los contadores "placed N out of M" de su log de
 *   creación que cita SeedLab, el aviso de Fortress Mountain y los 12.287
 *   lugares de su partida.
 * - -1772362158 (MWd8eV6svz): los 12.314 lugares de su partida.
 *
 * Los JSON son los del pipeline (`games/valheim/data/map/`).
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WorldGenerator } from "../generator";
import { stableSeed } from "../stableHash";
import locations from "../../../../../../valheim/data/map/locations.json";
import altbiomes from "../../../../../../valheim/data/map/altbiomes.json";
import meta from "../../../../../../valheim/data/map/meta.json";
import {
  assembleGrid, computeGridBand, parseTables, placeDetailedFromGrid, prepareWorldLocations, toPlacedLocations,
  type BiomeGrid, type LocationTables, type PlacementResult,
} from "./index";

const tables: LocationTables = { locations, altbiomes, meta };

interface Run {
  grid: BiomeGrid;
  result: PlacementResult;
  fortressSectors: number;
  fortressCombos: number;
  ms: { grid: number; placement: number };
}

const runs = new Map<number, Run>();

/** Grilla (en bandas desparejas y desordenadas, para probar que se pueden juntar) + colocación. */
function run(seed: number): Run {
  const hit = runs.get(seed);
  if (hit) return hit;
  const gen = new WorldGenerator(seed);
  const t0 = performance.now();
  const bands = [[1500, 2048], [0, 700], [700, 1500]].map(([a, b]) => computeGridBand(gen, a, b));
  const grid = assembleGrid(seed, bands);
  const t1 = performance.now();
  const result = placeDetailedFromGrid(gen, grid, tables);
  const t2 = performance.now();
  const parsed = parseTables(tables);
  const alts = prepareWorldLocations(grid, parsed.altBiomes).alts;
  const fm = parsed.altBiomes.findIndex((a) => a.name === "Fortress Mountain");
  const r: Run = {
    grid, result,
    fortressSectors: alts.sectorsOf[fm].length,
    fortressCombos: alts.validPlacementSectorCombos[fm],
    ms: { grid: t1 - t0, placement: t2 - t1 },
  };
  runs.set(seed, r);
  return r;
}

const placedOf = (r: PlacementResult, prefab: string) => r.types.find((t) => t.entry.prefabName === prefab)!.placed;

describe("tablas", () => {
  it("el orden de colocación coincide con `orderedIndex` del pipeline (183 tipos, 12.939 pedidos)", () => {
    const { table } = parseTables(tables);
    expect(table.ordered.length).toBe(183);
    expect(table.ordered.reduce((s, e) => s + e.quantity, 0)).toBe(12939);
    const defs = (locations as { locations: { index: number; orderedIndex: number }[] }).locations;
    for (const d of defs) {
      const oi = table.ordered.findIndex((e) => e.index === d.index);
      expect(oi).toBe(d.orderedIndex);
    }
  });
});

const ENV = (k: string) => (typeof process !== "undefined" ? process.env[k] ?? "" : "");
const LOG_SEED = ENV("VALHEIM_TEST_SEED");
const LOG_PATH = ENV("VALHEIM_TEST_PLAYER_LOG");

describe.skipIf(!LOG_SEED || !LOG_PATH || !existsSync(LOG_PATH))("un mundo real y su Player.log", () => {
  const seed = stableSeed(LOG_SEED);

  it("cada posición única del log está entre los lugares ubicados", () => {
    const r = run(seed);
    console.log(`grilla ${(r.ms.grid / 1000).toFixed(1)} s, colocación ${(r.ms.placement / 1000).toFixed(1)} s, `
      + `${r.result.instances.length} lugares`);
    // (x, y, z) tal como los escribe el log, con dos decimales.
    const logged = [...readFileSync(LOG_PATH, "utf-8").matchAll(/Adding unique location \((-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\)/g)]
      .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
    expect(logged.length).toBeGreaterThan(0);
    for (const [x, y, z] of logged) {
      const m = r.result.instances.filter((i) => Math.abs(i.x - x) <= 0.006 && Math.abs(i.z - z) <= 0.006);
      expect(m).toHaveLength(1);
      expect(Math.abs(m[0].y - y)).toBeLessThanOrEqual(0.006);
    }
  }, 300_000);
});

// 319486907 (hnBd9gJf2G, de SeedLab) registra lo mismo que el mundo del server
// de ZoTaD: la variante Fortress Mountain no entra (Placed 0/1-2, sectors 0, combos 2).
describe("319486907: Fortress Mountain sin sectores y candidatos", () => {
  const seed = 319486907;

  it("no asigna la variante Fortress Mountain (log: Placed 0/1-2, sectors 0, combos 2)", () => {
    const r = run(seed);
    expect(r.fortressSectors).toBe(0);
    expect(r.fortressCombos).toBe(2);
    // Sin la variante no hay torres "leet" (sólo existen dentro de ella).
    expect(placedOf(r.result, "StoneTowerRuins05_leet")).toBe(0);
  }, 300_000);

  it("PlacedLocation: los únicos con varias posiciones van como candidatos", () => {
    const placed = toPlacedLocations(run(seed).result);
    const of = (p: string) => placed.filter((l) => l.prefab === p);
    for (const p of ["Vendor_BlackForest", "Hildir_camp", "BogWitch_Camp"]) {
      expect(of(p).length).toBe(10);
      expect(of(p).every((l) => l.candidate === true)).toBe(true);
    }
    expect(of("StartTemple").length).toBe(1);
    expect(of("StartTemple")[0].candidate).toBeUndefined();
    expect(of("Eikthyrnir").every((l) => l.candidate === undefined)).toBe(true);
  }, 300_000);

  it("la grilla por bandas es la misma que calculada de corrido", () => {
    const gen = new WorldGenerator(seed, { deferPregeneration: true });
    const g = run(seed).grid;
    const band = computeGridBand(gen, 690, 710);
    expect(band.biomes).toEqual(g.biomes.subarray(690 * 2048, 710 * 2048));
    expect(band.heights).toEqual(g.heights.subarray(690 * 2048, 710 * 2048));
  }, 300_000);
});

describe("mundos que SeedLab comparó con el juego", () => {
  it("75539276 (recién creado): 12.228 lugares de 178 prefabs", () => {
    const r = run(75539276).result;
    expect(r.instances.length).toBe(12228);
    expect(new Set(r.instances.map((i) => i.prefab)).size).toBe(178);
    runs.delete(75539276);
  }, 300_000);

  it("319486907: los contadores del log de creación, Fortress Mountain y 12.287 lugares", () => {
    const r = run(319486907);
    const counters: [string, number][] = [
      ["Crypt4", 170], ["TarPit1", 91], ["NorthVillage", 53],
      ["SwampHut1_1", 33], ["SwampHut2_1", 2], ["GoblinCamp2_1", 0], ["TarPit1_1", 0],
    ];
    for (const [prefab, n] of counters) expect([prefab, placedOf(r.result, prefab)]).toEqual([prefab, n]);
    expect(r.fortressSectors).toBe(0);
    expect(r.fortressCombos).toBe(2);
    expect(r.result.instances.length).toBe(12287);
    runs.delete(319486907);
  }, 300_000);

  it("-1772362158: 12.314 lugares", () => {
    expect(run(-1772362158).result.instances.length).toBe(12314);
    runs.delete(-1772362158);
  }, 300_000);
});
