import { describe, expect, it } from "vitest";
import { BUCKETS, MIN_PER_BUCKET, bucketOf, bucketSql, masteryFrom } from "../src/mastery";

describe("bucketOf", () => {
  it("mete cada cantidad de partidas previas en su tramo", () => {
    expect(bucketOf(0)).toBe(0);
    expect(bucketOf(9)).toBe(0);
    expect(bucketOf(10)).toBe(10);
    expect(bucketOf(49)).toBe(10);
    expect(bucketOf(50)).toBe(50);
    expect(bucketOf(249)).toBe(100);
    expect(bucketOf(250)).toBe(250);
    expect(bucketOf(5_000)).toBe(250);
  });
});

describe("bucketSql", () => {
  it("evalúa los tramos de mayor a menor", () => {
    // Escrito al derecho, el primer `when` que da verdadero sería `>= 0` y todo
    // caería en el tramo cero: la curva saldría plana y parecería un hallazgo.
    const sql = bucketSql("previas");
    const orden = [...sql.matchAll(/>= (\d+)/g)].map((m) => Number(m[1]));
    expect(orden).toEqual([...BUCKETS].sort((a, b) => b - a));
  });
});

describe("masteryFrom", () => {
  const fila = (from: number, matches: number, wins: number) => ({ heroId: 1, from, matches, wins });

  it("descarta el tramo sin muestra suficiente en vez de publicarlo con ruido", () => {
    const [hero] = masteryFrom([fila(0, MIN_PER_BUCKET, MIN_PER_BUCKET / 2), fila(250, 5, 5)]);
    expect(hero.buckets.map((b) => b.from)).toEqual([0]);
  });

  it("calcula el boost entre el tramo más alto y el más bajo con muestra", () => {
    const [hero] = masteryFrom([fila(0, 1_000, 480), fila(250, 1_000, 530)]);
    expect(hero.boost).toBeCloseTo(5, 6); // 53,0% − 48,0%
  });

  it("omite el boost si queda un solo tramo, en vez de decir cero", () => {
    // Cero significaría "la experiencia no ayuda", que es una afirmación.
    // La ausencia dice "no sé", que es la verdad. Misma regla que skillGap y trend.
    const [hero] = masteryFrom([fila(0, 1_000, 500)]);
    expect(hero.boost).toBeUndefined();
  });

  it("ordena los tramos de menor a mayor aunque lleguen mezclados", () => {
    const [hero] = masteryFrom([fila(250, 1_000, 500), fila(0, 1_000, 500), fila(50, 1_000, 500)]);
    expect(hero.buckets.map((b) => b.from)).toEqual([0, 50, 250]);
  });

  it("deja afuera al héroe que se queda sin ningún tramo", () => {
    expect(masteryFrom([fila(0, 10, 5)])).toEqual([]);
  });

  it("ordena los héroes por boost, y los que no tienen quedan al final", () => {
    const out = masteryFrom([
      { heroId: 7, from: 0, matches: 1_000, wins: 500 },
      { heroId: 1, from: 0, matches: 1_000, wins: 480 },
      { heroId: 1, from: 250, matches: 1_000, wins: 530 },
    ]);
    expect(out.map((h) => h.heroId)).toEqual([1, 7]);
    expect(out[1].boost).toBeUndefined();
  });
});
