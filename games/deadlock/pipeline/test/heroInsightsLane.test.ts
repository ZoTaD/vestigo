import { describe, expect, it } from "vitest";
import { buildInsights, laneOf, MIN_PAIR, type LaneRow } from "../src/heroInsights";

const fila = (a: number[], b: number[], n: number, w: number, souls: number | null): LaneRow => ({
  hero_ids: a,
  enemy_hero_ids: b,
  wins: w,
  matches_played: n,
  net_worth_diff: souls,
  sample_matches: souls === null ? 0 : n,
});

describe("cruces de línea", () => {
  it("reparte cada dúo a sus dos héroes contra los dos rivales", () => {
    const l = laneOf([fila([1, 2], [3, 4], MIN_PAIR, 60, 500)], [1, 2, 3, 4]);
    expect(l.get(1)).toEqual([
      [3, MIN_PAIR, 60, 500],
      [4, MIN_PAIR, 60, 500],
    ]);
    expect(l.get(2)?.length).toBe(2);
  });

  it("promedia las almas pesando por las partidas que llegaron al minuto 10", () => {
    const l = laneOf([fila([1, 2], [3, 5], 60, 30, 300), fila([1, 6], [3, 7], 40, 10, -200)], [1, 2, 3, 5, 6, 7]);
    const contra3 = l.get(1)!.find((p) => p[0] === 3)!;
    expect(contra3).toEqual([3, 100, 40, 100]);
  });

  it("deja afuera los cruces con poca muestra, sin almas o con héroes que no se publican", () => {
    const l = laneOf(
      [fila([1, 2], [3, 4], MIN_PAIR - 1, 50, 100), fila([1, 2], [9, 4], 500, 250, null), fila([1, 99], [3, 4], 500, 250, 10)],
      [1, 2, 3, 4, 9]
    );
    expect(l.get(1)?.some((p) => p[0] === 9)).toBeFalsy();
    expect(l.has(99)).toBe(false);
  });

  it("ordena de la línea que más gana a la que más pierde", () => {
    const l = laneOf([fila([1, 2], [3, 4], 200, 100, -50), fila([1, 2], [5, 6], 200, 100, 400)], [1, 2, 3, 4, 5, 6]);
    expect(l.get(1)!.map((p) => p[3])).toEqual([400, 400, -50, -50]);
  });

  it("buildInsights la guarda en cada héroe", () => {
    const lane = laneOf([fila([1, 2], [3, 4], 200, 120, 250)], [1, 2, 3, 4]);
    const f = buildInsights("phantom-above", [1, 2, 3, 4], { from: "a", to: "b" }, [], [], [], [], "", lane);
    expect(f.heroes["1"].lane?.[0]).toEqual([3, 200, 120, 250]);
    // La API trae cada cruce dos veces, una por lado; acá vino sólo el de 1 y 2.
    expect(f.heroes["3"].lane).toBeUndefined();
  });
});
