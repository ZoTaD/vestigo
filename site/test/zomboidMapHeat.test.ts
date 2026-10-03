import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DensityHeader } from "../src/zomboid/map/data";
import { densityPyramid, heatLevel, heatTileCells, heatWindow, HEAT_LEVELS, inflateDensity } from "../src/zomboid/map/heat";
import { HEAT_KEY, heatAlpha, layerCount } from "../src/zomboid/map/layerMeta";
import { MAP_H, MAP_W } from "../src/zomboid/map/url";

/**
 * La capa de densidad de zombis del Mapa (2026-10-01): la grilla que escribe `map.py` (`web/zombies.bin`, deflate crudo,
 * un byte por chunk de 8×8 casillas) y cómo se pinta. Con el archivo real: si un parche lo cambia de forma, salta acá.
 */
const WEB = join(__dirname, "..", "..", "games", "zomboid", "data", "map", "web");
const head = (JSON.parse(readFileSync(join(WEB, "common.json"), "utf-8")) as { zombies: DensityHeader }).zombies;

describe("la grilla de densidad", () => {
  it("cubre el mapa de las teselas y se abre con DecompressionStream", async () => {
    expect(head.w * head.cell).toBe(MAP_W);
    expect(head.h * head.cell).toBe(MAP_H);
    const v = await inflateDensity(new Uint8Array(readFileSync(join(WEB, "zombies.bin"))), head.w * head.h);
    expect(v.length).toBe(head.w * head.h);
    // El mismo chunk que fija el test de Python (Muldraugh, casillas 10592–10599 × 9600–9607), y su traspuesto.
    expect(v[1200 * head.w + 1324]).toBe(3);
    expect(v[1196 * head.w + 1328]).toBe(1);
    // Con un bucle: `Math.max(...v)` con 5 millones de argumentos revienta la pila.
    let top = 0;
    for (const x of v) if (x > top) top = x;
    expect(top).toBe(head.max);
  });

  afterEach(() => vi.unstubAllGlobals());
  it("sin DecompressionStream (Safari antes de la 16.4) el inflador propio da lo mismo", async () => {
    const packed = new Uint8Array(readFileSync(join(WEB, "zombies.bin")));
    const native = await inflateDensity(packed, head.w * head.h);
    vi.stubGlobal("DecompressionStream", undefined);
    const own = await inflateDensity(packed, head.w * head.h);
    expect(own.length).toBe(native.length);
    expect(Buffer.compare(own, native)).toBe(0);
  });

  it("si el tamaño no coincide, corta", async () => {
    await expect(inflateDensity(new Uint8Array(readFileSync(join(WEB, "zombies.bin"))), 10)).rejects.toThrow(/densidad/);
  });
});

describe("la pirámide y la ventana", () => {
  // 4×3, con un 7 aislado: el máximo de cada bloque de 2×2 no lo pierde.
  const v = Uint8Array.from([0, 0, 0, 7, 1, 0, 0, 0, 0, 2, 0, 0]);
  it("cada nivel es el máximo de 2×2 del anterior, redondeando para arriba", () => {
    const p = densityPyramid(v, 4, 3, 3);
    expect(p.map((l) => [l.w, l.h])).toEqual([[4, 3], [2, 2], [1, 1]]);
    expect([...p[1].v]).toEqual([1, 7, 2, 0]);
    expect([...p[2].v]).toEqual([7]);
  });

  it("el nivel da al menos un píxel por celda", () => {
    expect([6, 4, 2, 1, 0, -1, -2].map((z) => heatLevel(z))).toEqual([0, 0, 0, 0, 1, 2, 3]);
    expect(heatLevel(-5)).toBe(HEAT_LEVELS - 1);
  });

  it("los ceros y lo de afuera van transparentes; más densidad, más lápiz", () => {
    const px = heatWindow({ w: 4, h: 3, v }, 2, 0, 3, 7);
    const a = (x: number, y: number) => px[(y * 3 + x) * 4 + 3];
    expect(a(0, 0)).toBe(0); // (2, 0) = 0
    expect(a(1, 0)).toBe(Math.round(heatAlpha(7, 7) * 255)); // (3, 0) = 7
    expect(a(2, 0)).toBe(0); // x = 4, afuera
    expect(a(1, 2)).toBe(0); // (3, 2) = 0
    expect([...px.subarray(4, 7)]).toEqual([179, 38, 30]);
  });

  it("la ventana de una tesela cae justo sobre celdas enteras en todos los zooms", () => {
    // Zoom 4: 1 píxel por casilla, la tesela de 256 mide 256 casillas = 32 chunks, nivel 0.
    expect(heatTileCells(3, 5, 4, 256)).toEqual({ k: 0, x0: 96, y0: 160, n: 32 });
    // Zoom 6: 4 píxeles por casilla, 64 casillas = 8 chunks.
    expect(heatTileCells(1, 2, 6, 256)).toEqual({ k: 0, x0: 8, y0: 16, n: 8 });
    // Zoom −2: 1/64 de píxel por casilla, la tesela abarca 16.384 casillas; el nivel 3 junta 8×8 chunks (64 casillas):
    // un píxel por celda y 256 celdas por lado.
    expect(heatTileCells(0, 1, -2, 256)).toEqual({ k: 3, x0: 0, y0: 256, n: 256 });
    // Para todo zoom del visor la ventana es entera: ni celdas partidas ni tamaño cero.
    for (let z = -2; z <= 6; z++) {
      const w = heatTileCells(2, 3, z, 256);
      expect(Number.isInteger(w.n) && w.n >= 1).toBe(true);
      expect(w.k).toBe(heatLevel(z));
    }
  });

  it("la opacidad sube con el valor y la clave va de menos a más", () => {
    const steps = [0, 1, 2, 3, 5, 10].map((n) => heatAlpha(n, 10));
    expect(steps[0]).toBe(0);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    expect(steps[5]).toBeLessThanOrEqual(0.9); // el satélite se sigue viendo debajo
    expect(HEAT_KEY).toHaveLength(5);
  });

  it("la capa no tiene cifra en la leyenda", () => {
    expect(layerCount("densidad", { zones: {}, spawns: 0, stashes: 0 })).toBeNull();
  });
});
