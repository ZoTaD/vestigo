import { describe, expect, it } from "vitest";
import { clave, consulta, filtrar, palabras } from "../src/aoe2/players/names";

describe("índice de nombres de AoE2", () => {
  it("las palabras son las mismas que arma names.py", () => {
    expect(palabras("wR.Lucho")).toEqual(new Set(["wrlucho", "wr", "w", "r", "lucho"]));
    expect(palabras("TheViper")).toEqual(new Set(["theviper", "the", "viper"]));
    expect(palabras("VIT Liereyy")).toEqual(new Set(["vitliereyy", "vit", "liereyy"]));
    expect(palabras("Ñandú_99")).toEqual(new Set(["nandu99", "nandu", "99"]));
  });
  it("la clave es de 2 letras y lo raro cuenta como _", () => {
    expect(clave("lucho")).toBe("lu");
    expect(clave("w")).toBe("w_");
    expect(clave("日本")).toBe("__");
  });
  it("lo escrito se compara sin mayúsculas, acentos ni separadores", () => {
    expect(consulta("  Ñandú ar ")).toBe("nanduar");
  });
  it("primero la palabra entera (por ELO), después las que empiezan así", () => {
    const filas: [number, string, string, number][] = [
      [1, "wR.Lucho", "ar", 3000],
      [2, "luchito", "", 1500],
      [3, "lucho", "ar", 1200],
      [4, "lucas", "", 1000],
    ];
    expect(filtrar(filas, "Lucho", 10).map((x) => x.id)).toEqual([1, 3]);
    expect(filtrar(filas, "luch", 10).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(filtrar(filas, "lu", 2).map((x) => x.id)).toEqual([1, 2]);
    expect(filtrar(filas, "l", 10)).toEqual([]);
  });
});
