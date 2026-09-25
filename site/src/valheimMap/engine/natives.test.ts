// Portado de Valheim-SeedLab (MIT, © 2026 DoomMachine) — tests/SeedLab.Tests/NativesGoldens.cs y docs/specs/03-unity-natives.md §6.2, 06-seed-space.md §1.1
/**
 * Los vectores de las funciones nativas que SeedLab transcribió del binario:
 * `Mathf.PerlinNoise`, `UnityEngine.Random` y `GetStableHashCode`.
 *
 * Los corpus grandes que SeedLab compara (262.780 muestras de Perlin, 276
 * trazas de Random, 429 hashes, `natives-*.json`) NO están en su repositorio
 * (viven en `groundtruth\natives`, fuera de él); acá van los vectores que sí
 * están escritos en su documentación, que son los mismos que esos corpus
 * confirmaron dentro del juego. Todo se compara por bits, no con tolerancia.
 */
import { describe, expect, it } from "vitest";
import { noise, perlinNoise } from "./unityPerlin";
import { UnityRandom } from "./unityRandom";
import { stableHashCode, stableHashLanes, stableSeed } from "./stableHash";

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
/** Los bits IEEE-754 de un float. */
const bits = (v: number): number => {
  f32[0] = v;
  return u32[0];
};
const hex = (v: number): string => "0x" + bits(v).toString(16).toUpperCase().padStart(8, "0");

describe("Mathf.PerlinNoise (spec 03 §6.2, D1)", () => {
  // x, y, bits de Noise, bits de PerlinNoise.
  const cases: [number, number, number, number][] = [
    [0, 0, 0x00000000, 0x3eee3846],
    [0.5, 0.5, 0xbe800000, 0x3e97e886],
    [-0.5, 0.5, 0xbe800000, 0x3e97e886],
    [0.5, -0.5, 0xbe800000, 0x3e97e886],
    [1, 1, 0x00000000, 0x3eee3846],
    [2, 3, 0x00000000, 0x3eee3846],
    [5, 7, 0x00000000, 0x3eee3846],
    [255, 255, 0x00000000, 0x3eee3846],
    [256, 256, 0x00000000, 0x3eee3846],
    [0.25, 0.75, 0xbd9f0000, 0x3ed36a82],
    [123.456, 789.012, 0x3e8555fb, 0x3f24108f],
    [-123.456, -789.012, 0x3e8555fb, 0x3f24108f],
    [257, 1.5, 0x3e800000, 0x3f224403],
    [255.99998, 0, 0xb7800000, 0x3eee36ed],
    [1e-7, 1e-7, 0x33d6bf95, 0x3eee3849],
    [44000, -44000, 0x00000000, 0x3eee3846],
    [100000, 100000, 0x00000000, 0x3eee3846],
    [119999, 0.5, 0x00000000, 0x3eee3846],
    [16777216, 0.5, 0xbe800000, 0x3e97e886],
    [16777218, 3.25, 0x00000000, 0x3eee3846],
    [-16.08, -6.08, 0x3d99cba5, 0x3f0412b8],
    [-20.5, 20.499, 0xbe8059f0, 0x3e97abe0],
    [110.00001, 90.00001, 0xa79fff38, 0x3eee3846],
    [4.2, -4.2, 0x3dadbbe5, 0x3f05c0f3],
  ];
  it.each(cases)("(%f, %f)", (x, y, nb, pb) => {
    const fx = Math.fround(x), fy = Math.fround(y);
    expect(hex(noise(fx, fy))).toBe(hex(new Float32Array(new Uint32Array([nb]).buffer)[0]));
    expect(hex(perlinNoise(fx, fy))).toBe(hex(new Float32Array(new Uint32Array([pb]).buffer)[0]));
  });
});

describe("UnityEngine.Random (spec 03 §6.2, D4-D10)", () => {
  it("D4: InitState deja el estado esperado", () => {
    const cases: [number, number[]][] = [
      [0, [0, 1, 1812433254, 1900727103]],
      [1, [1, 1812433254, 1900727103, -603986212]],
      [-1, [-1, -1812433252, 1724139405, 110473122]],
      [12345, [12345, 2003863422, 878305975, 684417332]],
      [-2147483648, [-2147483648, -2147483647, -335050394, -246756545]],
      [2147483647, [2147483647, 335050396, -423344243, -2037010526]],
      [-1772362158, [-1772362158, 1690419291, 383686376, 619426185]],
    ];
    for (const [seed, st] of cases) expect(new UnityRandom(seed).getState()).toEqual(st);
  });

  it("D10: 16 Range(-10000, 10000) y Range(int.Min, int.Max)", () => {
    const r = new UnityRandom(-1772362158);
    const got = Array.from({ length: 16 }, () => r.rangeInt(-10000, 10000));
    expect(got).toEqual([-6080, 4986, -7704, -59, 3937, -2996, 718, 4160, -6254, -5991, -2471, -4984, -9065, -2665, 2371, 2488]);
    expect(r.getState()).toEqual([679000935, -1675939961, -960914925, 903472488]);
    expect(new UnityRandom(7).rangeInt(-2147483648, 2147483647)).toBe(-599867598);
  });

  it("D7: Range(5, 5) devuelve 5 y NO consume sorteo", () => {
    const r = new UnityRandom(7);
    expect(r.getState()).toEqual([7, -197869116, -1864477099, 1547603082]);
    expect(r.rangeInt(5, 5)).toBe(5);
    expect(r.getState()).toEqual([7, -197869116, -1864477099, 1547603082]);
  });

  it("D5: 8 × Random.value", () => {
    const r = new UnityRandom(-1772362158);
    const got = Array.from({ length: 8 }, () => bits(r.value()).toString(16).toUpperCase());
    expect(got).toEqual(["3F175461", "3F44F996", "3F538632", "3F6E83AC", "3F3BC4A3", "3F1ABE79", "3E3DD1F1", "3F1150E1"]);
  });

  it("D6: Range(float, float), fórmula (1-f)*max + f*min", () => {
    const r = new UnityRandom(744350289);
    const a = r.rangeFloat(60, 100);
    expect(hex(a)).toBe("0x42BF3B2E");
    expect(hex(r.rangeFloat(60, a))).toBe("0x42A84292");
    expect(hex(r.rangeFloat(20, 20))).toBe("0x41A00000"); // SÍ consume sorteo
    expect(r.getState()).toEqual([453124588, -661780553, 908674882, -1218116351]);
    expect(hex(r.rangeFloat(-10000, 10000))).toBe("0xC5A7D51C");
    expect(hex(r.rangeFloat(-10000, 10000))).toBe("0xC60BD134");
    expect(hex(r.rangeFloat(0, Math.fround(6.2831854820251465)))).toBe("0x40A67D69");
    expect(hex(new UnityRandom(744350289).rangeFloat(100, 60))).toBe("0x4280C4D3");
  });

  it("D8: insideUnitCircle, dos sorteos por llamada", () => {
    const r = new UnityRandom(12345);
    const got: string[] = [];
    for (let i = 0; i < 4; i++) {
      r.insideUnitCircle();
      got.push(hex(r.circleX), hex(r.circleY));
    }
    expect(got).toEqual([
      "0xBE8AB290", "0x3E286F63", "0xBE91BFE2", "0x3D71976C",
      "0xBD16DC69", "0xBF41E1B3", "0xBF29BE2C", "0xBE57ECC2",
    ]);
    expect(r.getState()).toEqual([589364589, 1622567041, 1622784569, -1681782606]);
  });

  it("D9: 100.000 pasos sin deriva", () => {
    const r = new UnityRandom(0);
    for (let i = 0; i < 100000; i++) r.next();
    expect(r.getState()).toEqual([-578533609, 1716075846, 1054780398, 1693974205]);
    expect(hex(r.value())).toBe("0x3ED2C72E");
  });

  it("estado: setState restaura la secuencia", () => {
    const r = new UnityRandom(42);
    const st = r.getState();
    const a = [r.value(), r.value()];
    r.setState(st);
    expect([r.value(), r.value()]).toEqual(a);
  });
});

describe("GetStableHashCode (spec 06 §1.1 y spec 05 T0)", () => {
  const vectors: [string, number][] = [
    ["MWd8eV6svz", -1772362158],
    ["hnBd9gJf2G", 319486907],
    ["j", 372029384],
    ["StartTemple", -1544986047],
    ["Eikthyrnir", -316818231],
    ["", 371857150],
    ["a", 372029373],
    ["ab", 1093630535],
    ["abc", 1099313834],
    ["Abc", 1099314826],
    ["abc ", -1139976598],
    ["HHcLC5acQt", 298112588],
  ];
  it.each(vectors)("%j", (text, expected) => {
    expect(stableHashCode(text)).toBe(expected);
  });

  it("el texto vacío es el mundo 0 (regla de World..ctor), no su hash", () => {
    expect(stableSeed("")).toBe(0);
    expect(stableSeed("\0")).toBe(371857150);
  });

  it("hash == even + 1566083941 * odd", () => {
    for (const [text] of vectors) {
      const { even, odd } = stableHashLanes(text);
      expect((even + Math.imul(odd, 1566083941)) | 0).toBe(stableHashCode(text));
    }
  });
});
