import { describe, it, expect } from "vitest";
import { banRatesFor, bansSql, splitBanRows, MIN_BAN_MATCHES } from "../src/bans";

describe("banRatesFor", () => {
  it("pesa cada rango por las partidas jugadas, no por las analizadas", () => {
    // Rango 10: 1.000 jugadas, 300 analizadas. Rango 11: 100 jugadas, 100
    // analizadas. El héroe 7 se banea en la mitad de las del 11 y en ninguna
    // del 10. Contando crudo daría 50/400 = 12,5%; pesado, 100/1.100 × 50% =
    // 4,5%, que es lo que se ve jugando en esa banda.
    const r = banRatesFor(
      [9, 10, 11],
      [
        { tier: 10, matches: 1000, banned: 300 },
        { tier: 11, matches: 100, banned: 100 },
        { tier: 5, matches: 9000, banned: 90 },
      ],
      [
        { tier: 11, hero_id: 7, bans: 50 },
        { tier: 10, hero_id: 8, bans: 150 },
        { tier: 5, hero_id: 7, bans: 90 },
      ]
    )!;
    expect(r.matches).toBe(400);
    expect(r.rates.get(7)).toBeCloseTo((100 / 1100) * 0.5, 6);
    expect(r.rates.get(8)).toBeCloseTo((1000 / 1100) * 0.5, 6);
  });

  it("un rango sin partidas analizadas no aporta ni pesa", () => {
    const r = banRatesFor(
      [9, 10],
      [
        { tier: 9, matches: 5000, banned: 0 },
        { tier: 10, matches: 1000, banned: 300 },
      ],
      [{ tier: 10, hero_id: 7, bans: 30 }]
    )!;
    expect(r.rates.get(7)).toBeCloseTo(0.1, 6);
  });

  it("no publica una banda con muestra fina", () => {
    const r = banRatesFor([5, 6], [{ tier: 5, matches: 9000, banned: MIN_BAN_MATCHES - 1 }], []);
    expect(r).toBeNull();
  });
});

describe("bansSql", () => {
  it("reduce a una fila por partida antes de contar, y lee la ventana una vez", () => {
    const sql = bansSql([107], "2026-09-10T00:00:00", "2026-09-24T00:00:00");
    expect(sql).toContain("group by match_id");
    expect(sql).toContain("as materialized");
    expect(sql).toContain("banned_hero_ids");
    expect(sql).toContain("match_mode = 'Ranked'");
  });
});

describe("splitBanRows", () => {
  it("separa los totales por rango de las cuentas por héroe", () => {
    const { tiers, heroes } = splitBanRows([
      { tier: 10n, hero_id: null, n: 1000n, banned: 300n },
      { tier: 10n, hero_id: 81, n: 120n, banned: 0n },
    ]);
    expect(tiers).toEqual([{ tier: 10, matches: 1000, banned: 300 }]);
    expect(heroes).toEqual([{ tier: 10, hero_id: 81, bans: 120 }]);
  });
});
