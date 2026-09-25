// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — tools/SeedLab.GoldenCheck/README.md, docs/specs/03-unity-natives.md §6.1, docs/studies/goal-model.md §1.6
/**
 * Pruebas del generador contra lo que el juego mismo generó, según quedó
 * escrito en el repositorio de SeedLab:
 *
 * - los siete sorteos del constructor de "MWd8eV6svz" (recuperados del minimapa
 *   del juego por fuerza bruta, spec 03 §6.1);
 * - el estado privado de tres mundos que SeedLab leyó DENTRO del juego
 *   (GoldenCheck): cantidad de lagos, ríos, arroyos, celdas y puntos de río.
 *   Es un golden durísimo: un solo ULP distinto en una altura de la
 *   pregeneración cambia qué ríos existen y cuántos puntos tienen.
 * - la proporción de tierra y de biomas en la grilla del minimapa (2048² a
 *   12 m), medida por SeedLab en tres semillas (5 decimales).
 *
 * Las grillas de bioma/altura del juego (`groundtruth\decoded\*.biome.u8`,
 * `*.height.f32`) y los 12.228 GetHeight de GoldenCheck no están en el repo.
 */
import { describe, expect, it } from "vitest";
import { BIOME } from "./contract";
import { BIOME_AREA, WorldGenerator } from "./generator";
import { UnityRandom } from "./unityRandom";
import { createWorld, createWorldFromSeed } from "./index";
import { stableSeed } from "./stableHash";
import { F } from "./unityMath";
import { length } from "./dUtils";

describe("constructor: los siete sorteos", () => {
  it("MWd8eV6svz (-1772362158), spec 03 §6.1", () => {
    const g = new WorldGenerator(-1772362158, { deferPregeneration: true });
    expect([g.offset0, g.offset1, g.offset2, g.offset3, g.riverSeed, g.streamSeed, g.offset4])
      .toEqual([-6080, 4986, -7704, -59, 744350289, 952983356, 718]);
  });
});

/** Cuenta celdas y puntos de la grilla de ríos (un punto se repite en cada celda que toca). */
function riverTotals(g: WorldGenerator): { cells: number; points: number } {
  let points = 0;
  for (const c of g.getRiverPoints().values()) points += c.length / 4;
  return { cells: g.getRiverPoints().size, points };
}

describe("pregeneración contra el estado privado del juego (GoldenCheck, 2026-09-23)", () => {
  // semilla, lagos, ríos, arroyos, celdas de ríos, puntos de río.
  const goldens: [number, number, number, number, number, number][] = [
    [75539276, 126, 183, 2162, 26079, 764577],
    [319486907, 119, 161, 2059, 23262, 677094],
    [-1772362158, 111, 140, 2135, 23380, 675579],
  ];
  it.each(goldens)("semilla %i", (seed, lakes, rivers, streams, cells, points) => {
    const g = new WorldGenerator(seed);
    expect(g.getLakes().length).toBe(lakes);
    expect(g.getRivers().length).toBe(rivers);
    expect(g.getStreams().length).toBe(streams);
    expect(riverTotals(g)).toEqual({ cells, points });
  }, 60_000);

  it("postergar la pregeneración da el mismo mundo", () => {
    const eager = new WorldGenerator(319486907);
    const lazy = new WorldGenerator(319486907, { deferPregeneration: true });
    expect(lazy.pregenerationPending).toBe(true);
    // Una altura dispara la pregeneración; después todo coincide.
    const pts = [[123.5, -456.25], [2000, 3000], [-7000, 1500], [500, 9000], [-3100, -8800]];
    for (const [x, z] of pts) expect(lazy.getHeight(F(x), F(z))).toBe(eager.getHeight(F(x), F(z)));
    expect(lazy.pregenerationPending).toBe(false);
    expect(riverTotals(lazy)).toEqual(riverTotals(eager));
  }, 60_000);

  it("exportar/importar la pregeneración conserva alturas y caché", () => {
    const a = new WorldGenerator(75539276);
    const b = WorldGenerator.fromPregeneration(75539276, a.exportPregeneration());
    for (let i = 0; i < 400; i++) {
      const x = F(-9000 + i * 45.25), z = F(8000 - i * 40.5);
      expect(b.getHeight(x, z)).toBe(a.getHeight(x, z));
    }
  }, 60_000);
});

/** La grilla del minimapa (G12): 2048², puntos en (j - 1024)·12 + 6, como `Minimap.GenerateWorldMap`. */
function g12Coord(j: number): number {
  return F((j - 1024) * 12 + 6);
}

interface Shares {
  land: number;
  biome: Map<number, number>;
  ms: number;
}

/** Proporciones como `WorldMeasurement`: dentro del mundo = DUtils.Length <= 10.500; tierra = altura >= 30. */
function measureG12(seed: number): Shares {
  const w = createWorldFromSeed(seed);
  const t0 = performance.now();
  let inWorld = 0;
  let land = 0;
  const biome = new Map<number, number>();
  for (let row = 0; row < 2048; row++) {
    const z = g12Coord(row);
    for (let col = 0; col < 2048; col++) {
      const x = g12Coord(col);
      if (length(x, z) > 10500) continue;
      const b = w.biome(x, z);
      const h = w.height(x, z);
      inWorld++;
      biome.set(b, (biome.get(b) ?? 0) + 1);
      if (h >= 30) land++;
    }
  }
  const ms = performance.now() - t0;
  for (const [k, v] of biome) biome.set(k, v / inWorld);
  return { land: land / inWorld, biome, ms };
}

const round5 = (v: number): number => Math.round(v * 1e5) / 1e5;

describe("proporciones en la grilla del minimapa (goal-model §1.6, columna 12 m)", () => {
  it("-1772362158: tierra 0.33954, Pantano 0.02603, Llanura 0.13615, Océano 0.28287", () => {
    const s = measureG12(-1772362158);
    console.log(`G12 2048² bioma + altura, un hilo: ${(s.ms / 1000).toFixed(2)} s`);
    expect(round5(s.land)).toBe(0.33954);
    expect(round5(s.biome.get(BIOME.Swamp)!)).toBe(0.02603);
    expect(round5(s.biome.get(BIOME.Plains)!)).toBe(0.13615);
    expect(round5(s.biome.get(BIOME.Ocean)!)).toBe(0.28287);
  }, 300_000);

  it.each([
    [75539276, 0.34584],
    [-2028901234, 0.35096],
  ])("%i: tierra %f", (seed, landShare) => {
    expect(round5(measureG12(seed).land)).toBe(landShare);
  }, 300_000);
});

describe("semilla del dueño: r495Ztbtx6", () => {
  it("hash y muestreo grueso de biomas", () => {
    const seed = stableSeed("r495Ztbtx6");
    const w = createWorld("r495Ztbtx6");
    expect(w.seed).toBe(seed);
    const letter: Record<number, string> = {
      [BIOME.Meadows]: "P", [BIOME.BlackForest]: "B", [BIOME.Swamp]: "S", [BIOME.Mountain]: "M",
      [BIOME.Plains]: "L", [BIOME.Mistlands]: "N", [BIOME.AshLands]: "C", [BIOME.DeepNorth]: "D",
      [BIOME.Ocean]: "~",
    };
    // 41 × 41 puntos cada 500 m; fila de arriba = norte.
    const rows: string[] = [];
    const counts = new Map<number, number>();
    for (let j = 20; j >= -20; j--) {
      let line = "";
      for (let i = -20; i <= 20; i++) {
        const x = i * 500, z = j * 500;
        if (x * x + z * z > 10500 * 10500) {
          line += " ";
          continue;
        }
        const b = w.biome(x, z);
        counts.set(b, (counts.get(b) ?? 0) + 1);
        line += letter[b] ?? "?";
      }
      rows.push(line);
    }
    console.log(`r495Ztbtx6 -> stableSeed ${seed}\n${rows.join("\n")}\n` +
      [...counts].map(([b, n]) => `${letter[b]}=${n}`).join(" "));
    expect(w.biome(0, 0)).toBe(BIOME.Meadows); // el centro siempre es Pradera
    expect(counts.size).toBeGreaterThanOrEqual(8);
  });
});

describe("piezas para portar SeedLab.Locations", () => {
  const g = new WorldGenerator(75539276);

  it("fork(): mismo mundo, otra caché", () => {
    const warm = g.fork(true);
    const cold = g.fork();
    for (let i = 0; i < 300; i++) {
      const x = F(-6000 + i * 37.75), z = F(5000 - i * 29.5);
      const h = g.getHeight(x, z);
      expect(warm.getHeight(x, z)).toBe(h);
      expect(cold.getHeight(x, z)).toBe(h);
    }
  }, 60_000);

  it("getTerrainDelta consume exactamente 20 sorteos y deja delta y pendiente", () => {
    const rnd = new UnityRandom(1234);
    const ref = new UnityRandom(1234);
    const d = g.getTerrainDelta(rnd, F(812.5), 40, F(-1333.25), 8);
    for (let i = 0; i < 20; i++) ref.next();
    expect(rnd.getState()).toEqual(ref.getState());
    expect(d).toBe(g.terrainDelta);
    expect(d).toBeGreaterThanOrEqual(0);
    const mag = Math.hypot(g.slopeX, g.slopeY, g.slopeZ);
    expect(d === 0 ? mag : Math.abs(mag - 1)).toBeLessThan(1e-6);
  });

  it("getBiomeArea: Median sólo si los ocho vecinos a 64 m coinciden", () => {
    for (const [sx, sy] of [[0, 0], [1000, -2000], [3200, 3200], [-4500, 700]]) {
      const b = g.getBiome(sx, sy);
      const offs = [[-64, -64], [64, -64], [64, 64], [-64, 64], [-64, 0], [64, 0], [0, -64], [0, 64]];
      const same = offs.every(([dx, dy]) => g.getBiome(sx - dx, sy - dy) === b);
      expect(g.getBiomeArea(sx, sy)).toBe(same ? BIOME_AREA.Median : BIOME_AREA.Edge);
    }
  });

  it("getHeight deja la máscara: Niebla (a), Norte profundo (g), Ceniza (a = lava)", () => {
    const w = createWorldFromSeed(75539276, g);
    let seen = 0;
    for (let i = 0; i < 4000 && seen !== 7; i++) {
      const x = F(-10000 + (i % 80) * 250), z = F(-10000 + Math.floor(i / 80) * 400);
      const b = w.biome(x, z);
      g.getHeight(x, z);
      if (b === BIOME.Mistlands) { seen |= 1; expect(g.maskA).toBeLessThanOrEqual(1); }
      if (b === BIOME.DeepNorth) { seen |= 2; expect(g.maskG).toBeGreaterThanOrEqual(F(0.3)); expect(g.maskA).toBe(0); }
      if (b === BIOME.AshLands) { seen |= 4; expect(g.maskA).toBeGreaterThanOrEqual(0); }
      if (b === BIOME.Meadows) expect([g.maskR, g.maskG, g.maskB, g.maskA]).toEqual([0, 0, 0, 1]);
    }
    expect(seen).toBe(7);
  }, 60_000);
});
