import { describe, it, expect } from "vitest";
import { matchedCells, MIN_TREATED, MIN_CONTROL, type StratumRow } from "../src/matching";

/** Un estrato con lo mínimo, para no repetir doce campos en cada caso. */
const stratum = (p: Partial<StratumRow>): StratumRow => ({
  heroId: 1,
  itemId: 10,
  cost: 3200,
  n: 50,
  wins: 25,
  damage: 0,
  deaths: 0,
  economy: 0,
  totalN: 100,
  totalWins: 50,
  totalDamage: 0,
  totalDeaths: 0,
  totalEconomy: 0,
  ...p,
});

describe("matchedCells", () => {
  it("desarma un confundido que el winrate crudo no ve", () => {
    // El ítem se compra sobre todo yendo ganando. Dentro de cada estrato NO
    // aporta nada: gana lo mismo que los controles. El crudo igual lo premia.
    const rows: StratumRow[] = [
      // Estrato "iba ganando": todos ganan el 80%.
      stratum({ n: 50, wins: 40, totalN: 100, totalWins: 80 }),
      // Estrato "iba perdiendo": todos ganan el 20%, y casi nadie lo compra.
      stratum({ n: 10, wins: 2, totalN: 100, totalWins: 20 }),
    ];

    // El crudo: 42 victorias en 60 compras (70%) contra una base de 50%.
    const crudo = (40 + 2) / (50 + 10) - (80 + 20) / (100 + 100);
    expect(crudo).toBeCloseTo(0.2, 10);

    // El pareado: cero, que es la verdad.
    const [cell] = matchedCells(rows);
    expect(cell.win).toBeCloseTo(0, 10);
    expect(cell.n).toBe(60);
  });

  it("pesa cada estrato por sus tratados, no por el estrato entero", () => {
    const rows: StratumRow[] = [
      // 90 compras con +10 puntos.
      stratum({ n: 90, wins: 54, totalN: 190, totalWins: 104 }),
      // 10 compras con −10 puntos.
      stratum({ n: 10, wins: 4, totalN: 110, totalWins: 54 }),
    ];
    const [cell] = matchedCells(rows);
    // (90·(+0,1) + 10·(−0,1)) / 100 = +0,08
    expect(cell.win).toBeCloseTo(0.08, 10);
  });

  it("descarta el estrato sin controles suficientes", () => {
    const rows: StratumRow[] = [
      stratum({ n: 50, wins: 50, totalN: 50 + MIN_CONTROL - 1, totalWins: 50 }),
    ];
    expect(matchedCells(rows)).toEqual([]);
  });

  it("descarta el estrato con un puñado de tratados", () => {
    // Sin este piso un estrato de una compra produce efectos de ±100 puntos y
    // domina el promedio. Ya pasó una vez.
    const rows: StratumRow[] = [
      stratum({ n: MIN_TREATED - 1, wins: 0, totalN: 500, totalWins: 400 }),
    ];
    expect(matchedCells(rows)).toEqual([]);
  });

  it("promedia el mecanismo con el mismo peso que la victoria", () => {
    const rows: StratumRow[] = [
      stratum({
        n: 10,
        wins: 5,
        damage: 10_000,
        deaths: 5,
        economy: 20_000,
        totalN: 110,
        totalWins: 55,
        totalDamage: 60_000,
        totalDeaths: 105,
        totalEconomy: 120_000,
      }),
    ];
    const [cell] = matchedCells(rows);
    // Tratados: 1.000 de daño por compra. Controles: 50.000/100 = 500.
    expect(cell.damage).toBeCloseTo(500, 6);
    expect(cell.damageControl).toBeCloseTo(500, 6);
    // Tratados: 0,5 muertes. Controles: 100/100 = 1.
    expect(cell.deaths).toBeCloseTo(-0.5, 6);
    // Tratados: 2.000. Controles: 100.000/100 = 1.000.
    expect(cell.economy).toBeCloseTo(1000, 6);
  });
});
