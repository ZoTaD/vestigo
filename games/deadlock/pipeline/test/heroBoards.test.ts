import { describe, expect, it } from "vitest";
import { pickRows, regionOf, residuals, scorePool, zScores, type HeroStatsRow, type PoolEntry } from "../src/heroBoards";

const stats = (o: Partial<HeroStatsRow> & { account_id: number }): HeroStatsRow => ({
  hero_id: 1,
  matches_played: 40,
  wins: 20,
  kills_per_min: 0.3,
  deaths_per_min: 0.2,
  assists_per_min: 0.4,
  networth_per_min: 1200,
  damage_per_min: 1000,
  obj_damage_per_min: 300,
  accuracy: 0.6,
  mvp_rank_counts: [2, 2, 2],
  mvp_rated_matches: 40,
  ...o,
});

describe("regionOf", () => {
  it("agrupa los servidores en cinco regiones", () => {
    expect(regionOf("us_north_central")).toBe("NA");
    expect(regionOf("dpkt-frankfurt")).toBe("EU");
    expect(regionOf("london")).toBe("EU");
    expect(regionOf("eu_west")).toBe("EU");
    expect(regionOf("argentina")).toBe("SA");
    expect(regionOf("south_america")).toBe("SA");
    expect(regionOf("hong_kong")).toBe("AS");
    expect(regionOf("australia")).toBe("OC");
    expect(regionOf(null)).toBeNull();
    expect(regionOf("algo_nuevo")).toBeNull();
  });
});

describe("zScores y residuals", () => {
  it("centra en cero", () => {
    const z = zScores([1, 2, 3]);
    expect(z[1]).toBeCloseTo(0);
    expect(z[0]).toBeCloseTo(-z[2]);
  });
  it("una recta perfecta no deja residuo", () => {
    for (const r of residuals([1, 2, 3, 4], [10, 20, 30, 40])) expect(r).toBeCloseTo(0);
  });
});

describe("scorePool", () => {
  it("un rango bajo con winrate inflado no le gana a un rango alto parejo", () => {
    // Diez jugadores donde el winrate baja con el rango (le ganan a gente peor)…
    const pool: PoolEntry[] = Array.from({ length: 10 }, (_, i) => ({
      accountId: i + 1,
      progress: 100_000 - i * 5_000,
      stats: stats({ account_id: i + 1, wins: 18 + i }),
    }));
    // …y un Ritualist con 85% en 20 partidas.
    pool.push({ accountId: 99, progress: 40_000, stats: stats({ account_id: 99, matches_played: 20, wins: 17 }) });
    const s = scorePool(pool);
    const top = s.find((x) => x.scorePlace === 1)!;
    expect(top.accountId).toBe(1);
    expect(s.find((x) => x.accountId === 99)!.scorePlace).toBeGreaterThan(5);
  });

  it("a igual rango, el que rinde más va primero", () => {
    const pool: PoolEntry[] = [
      { accountId: 1, progress: 90_000, stats: stats({ account_id: 1, wins: 20 }) },
      { accountId: 2, progress: 90_000, stats: stats({ account_id: 2, wins: 30, kills_per_min: 0.5 }) },
      { accountId: 3, progress: 50_000, stats: stats({ account_id: 3 }) },
    ];
    const s = scorePool(pool);
    expect(s.find((x) => x.accountId === 2)!.scorePlace).toBe(1);
    expect(s.find((x) => x.accountId === 2)!.score).toBe(100);
    expect(s.find((x) => x.accountId === 3)!.score).toBe(0);
  });

  it("publica la unión de los dos tops", () => {
    const pool: PoolEntry[] = Array.from({ length: 5 }, (_, i) => ({
      accountId: i + 1,
      progress: 100 - i,
      stats: stats({ account_id: i + 1, wins: 10 + 5 * i }),
    }));
    const keep = pickRows(scorePool(pool), new Map(), 2);
    expect(keep.has(1)).toBe(true);
    expect(keep.size).toBeGreaterThanOrEqual(2);
    expect(keep.size).toBeLessThanOrEqual(4);
  });

  it("suma el top de cada región aunque no entre al del mundo", () => {
    const pool: PoolEntry[] = Array.from({ length: 6 }, (_, i) => ({
      accountId: i + 1,
      progress: 100 - i,
      stats: stats({ account_id: i + 1 }),
    }));
    const reg = new Map<number, "NA" | "SA">([1, 2, 3, 4, 5].map((a) => [a, "NA"] as [number, "NA"]));
    reg.set(6, "SA");
    const keep = pickRows(scorePool(pool), reg, 1, 1);
    expect(keep.has(6)).toBe(true);
  });
});
