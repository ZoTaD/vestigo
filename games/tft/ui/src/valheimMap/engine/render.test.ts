// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — src/SeedLab.Render/MapRenderer.cs y MapPalette.cs
/** El color de un píxel, contra las cuentas de SeedLab hechas a mano. */
import { describe, expect, it } from "vitest";
import { BIOME } from "./contract";
import { DEFAULT_PAINT, MAP_COLORS, gameColor, lavaByte, lerpColor, paintGrid, paintPixel, waterColor } from "./render";

const px = (biome: number, h: number, n: [number, number, number, number] = [h, h, h, h], outside = false, lava = 0, opts = DEFAULT_PAINT) => {
  const out = new Uint8ClampedArray(4);
  paintPixel(out, 0, biome, h, n[0], n[1], n[2], n[3], 12, outside, lava, opts);
  return Array.from(out);
};

describe("paleta", () => {
  it("colores del minimapa del juego (prefab), Océano/Montaña/Norte en blanco", () => {
    expect(gameColor(BIOME.Meadows)).toBe(0x92a75c); // 146,167,92
    expect(gameColor(BIOME.Mistlands)).toBe(0x333333);
    expect(gameColor(BIOME.AshLands)).toBe(0x7b2020);
    for (const b of [BIOME.Ocean, BIOME.Mountain, BIOME.DeepNorth]) expect(gameColor(b)).toBe(0xffffff);
  });

  it("agua: #3E6E8C en la orilla, #10203A desde 120 m abajo, redondeo al par", () => {
    expect(waterColor(30)).toBe(MAP_COLORS.waterShallow);
    expect(waterColor(-90)).toBe(MAP_COLORS.waterDeep);
    expect(waterColor(-400)).toBe(MAP_COLORS.waterDeep);
    // t = 0.5: 0x3E + (0x10-0x3E)/2 = 39 exacto; 0x6E→0x20: 71; 0x8C→0x3A: 99.
    expect(waterColor(-30)).toBe((39 << 16) | (71 << 8) | 99);
    // Mitad exacta: Math.Round(x.5) de .NET va al par.
    expect(lerpColor(0x000000, 0x010101, 0.5)).toBe(0x000000);
    expect(lerpColor(0x010101, 0x020202, 0.5)).toBe(0x020202);
  });

  it("lava: byte = Math.Round(a·255f)", () => {
    expect(lavaByte(0)).toBe(0);
    expect(lavaByte(1)).toBe(255);
    expect(lavaByte(0.5)).toBe(128); // 127.5 → 128 (par)
    expect(lavaByte(2)).toBe(255);
  });
});

describe("paintPixel", () => {
  it("terreno llano: el color del bioma sin cambios", () => {
    expect(px(BIOME.Meadows, 50)).toEqual([146, 167, 92, 255]);
    expect(px(BIOME.DeepNorth, 50)).toEqual([232, 240, 255, 255]);
  });

  it("fuera del borde: el vacío, sin relieve", () => {
    expect(px(BIOME.Ocean, -400, [0, 500, 0, 500], true)).toEqual([8, 13, 20, 255]);
  });

  it("ladera al noroeste más clara, al sudeste más oscura", () => {
    // Vecinos [oeste, este, sur, norte]. Más alto al sudeste: la ladera mira al noroeste (a la luz).
    const light = px(BIOME.Plains, 50, [40, 60, 60, 40]);
    const dark = px(BIOME.Plains, 50, [60, 40, 40, 60]);
    // Más alto al sudoeste: mira al noreste, de costado a la luz → un poco más oscuro que llano (Lambert).
    const side = px(BIOME.Plains, 50, [60, 40, 60, 40]);
    expect(side[0]).toBeLessThan(231);
    expect(side[0]).toBeGreaterThan(dark[0]);
    expect(dark[0]).toBeLessThan(231);
    expect(light[0]).toBeGreaterThan(231);
  });

  it("lava sobre 0.6 mezcla hacia #FF5A1E", () => {
    expect(px(BIOME.AshLands, 50, undefined, false, 255)).toEqual([255, 90, 30, 255]);
    expect(px(BIOME.AshLands, 50, undefined, false, 150)).toEqual([123, 32, 32, 255]);
  });

  it("paintGrid pinta igual que paintPixel con vecinos repetidos en el borde", () => {
    const out = new Uint8ClampedArray(4 * 4);
    paintGrid(out, [BIOME.Meadows, BIOME.Meadows, BIOME.Ocean, BIOME.Ocean], [50, 50, 10, 10], 2, 2, 12);
    expect(Array.from(out.subarray(0, 4))).toEqual(px(BIOME.Meadows, 50, [50, 50, 10, 50]));
    expect(Array.from(out.subarray(8, 12))).toEqual(px(BIOME.Ocean, 10, [10, 10, 10, 50]));
  });
});
