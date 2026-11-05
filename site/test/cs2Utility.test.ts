/**
 * Miras de CS2 (2026-11-04): el conversor de sensibilidad y la lectura de códigos de mira.
 */
import { describe, expect, it } from "vitest";
import { encodeCrosshair } from "csgo-sharecode";
import { fromCode, toV1 } from "../src/cs2/crosshairs/Cs2Crosshairs";
import { cm360, convert, edpiCs2, GAMES } from "../src/cs2/crosshairs/sens";

describe("el conversor de sensibilidad", () => {
  const [cs2, valorant, deadlock] = GAMES;
  it("una vuelta de CS2 a 1,25 y 800 DPI son 41,6 cm", () => {
    expect(cm360(1.25, 800, cs2.yaw)).toBeCloseTo(41.56, 2);
  });
  it("pasa entre juegos con la misma vuelta", () => {
    expect(convert(1, cs2, valorant)).toBeCloseTo(0.3143, 4);
    expect(convert(2, cs2, deadlock)).toBeCloseTo(1, 6);
    const v = convert(1.5, cs2, valorant);
    expect(cm360(v, 800, valorant.yaw)).toBeCloseTo(cm360(1.5, 800, cs2.yaw), 6);
  });
  it("el eDPI se mide en sensibilidad de CS2", () => {
    expect(edpiCs2(1.25, 800, cs2)).toBeCloseTo(1000, 6);
    expect(edpiCs2(0.4, 800, valorant)).toBeCloseTo(1018.18, 1);
  });
});

describe("los códigos de mira", () => {
  it("un código de CS2 se lee y se vuelve a armar igual", () => {
    const xh = { length: 3, gap: -2, thickness: 1, outline: 1, alpha: 200, color: [0, 255, 255] as [number, number, number], dot: true, tStyle: false, sh: 1440 };
    const code = encodeCrosshair(toV1(xh));
    expect(code.startsWith("CS")).toBe(true);
    const r = fromCode(code)!;
    expect(r.old).toBe(false);
    expect(r.xh).toEqual(xh);
    expect(encodeCrosshair(toV1(r.xh))).toBe(code);
  });
  it("un CSGO- de la época de CS:GO se pasa aproximado y avisa", () => {
    const r = fromCode("CSGO-kM6Tw-TY67b-6dF3W-Hutjm-Sr8rN")!;
    expect(r.old).toBe(true);
    expect(r.approx).toBe(true);
  });
  it("lo que no es un código no se lee", () => {
    expect(fromCode("hola")).toBeNull();
  });
});
