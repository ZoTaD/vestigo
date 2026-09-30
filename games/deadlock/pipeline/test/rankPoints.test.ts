import { describe, it, expect } from "vitest";
import { DuckDBInstance } from "@duckdb/node-api";
import { rankPointsFile, rankPointsSql, STREAK_CAP, type RankRow } from "../src/rankPoints";

describe("la cuenta en DuckDB", () => {
  it("agrupa por resultado, racha (con tope), calibración y escudo", async () => {
    const con = await (await DuckDBInstance.create(":memory:")).connect();
    await con.run(`create table t as select * from (values
      (true, 300, 0, 0, false, 1000, 1300),
      (true, 370, 2, 0, false, 1000, 1370),
      (true, 430, 9, 0, false, 1000, 1430),
      (false, -300, 3, 0, false, 1000, 700),
      (false, -300, 0, 0, true, 1000, 1000),
      (true, 150, 0, 4, false, 1000, 1150),
      (false, null, 0, 0, false, 1000, 1000)
    ) v(won, d, ws, cal, used, f0, f1)`);
    const filas = (await con.runAndReadAll(rankPointsSql("select * from t"))).getRowObjects();
    const topes = filas.filter((r) => r.won === true && r.calibrating === false).map((r) => Number(r.streak));
    expect(topes).toEqual([0, 2, STREAK_CAP]);
    expect(filas.find((r) => r.shieldUsed === true)).toMatchObject({ n: 1, typical: -300 });
    // La fila sin cambio de puntos no cuenta.
    expect(filas.reduce((s, r) => s + Number(r.n), 0)).toBe(6);
  });
});

describe("el archivo", () => {
  const rows: RankRow[] = [
    { won: true, streak: 0, calibrating: false, shieldUsed: false, n: 10, points: 3000, flat: 3000, typical: 300 },
    { won: true, streak: 2, calibrating: false, shieldUsed: false, n: 4, points: 1480, flat: 1480, typical: 370 },
    { won: true, streak: 5, calibrating: false, shieldUsed: false, n: 2, points: 860, flat: 860, typical: 430 },
    { won: false, streak: 1, calibrating: false, shieldUsed: false, n: 8, points: -2400, flat: -2400, typical: -300 },
    { won: false, streak: 0, calibrating: false, shieldUsed: true, n: 5, points: -1500, flat: -50, typical: -300 },
    { won: true, streak: 0, calibrating: true, shieldUsed: false, n: 3, points: 450, flat: 450, typical: 150 },
    { won: false, streak: 0, calibrating: true, shieldUsed: false, n: 1, points: -150, flat: -20, typical: -150 },
  ];
  const f = rankPointsFile(rows, { from: "2026-09-23", to: "2026-09-30", generatedAt: "x" });

  it("da el promedio de puntos por racha previa", () => {
    expect(f.wins).toHaveLength(STREAK_CAP + 1);
    expect(f.wins[0]).toEqual({ streak: 0, n: 10, points: 300, typical: 300 });
    expect(f.wins[2]).toEqual({ streak: 2, n: 4, points: 370, typical: 370 });
    expect(f.wins[5]).toEqual({ streak: 5, n: 2, points: 430, typical: 430 });
    expect(f.wins[1]).toEqual({ streak: 1, n: 0, points: 0, typical: 0 });
  });

  it("separa la derrota con escudo, con lo que se perdió de verdad", () => {
    expect(f.loss).toEqual({ n: 8, points: -300, typical: -300 });
    expect(f.shield).toEqual({ n: 5, points: -300, flat: -10 });
  });

  it("aparta la calibración", () => {
    expect(f.calibration).toEqual({ win: 150, loss: -150, n: 4 });
    expect(f.matches).toBe(33);
  });
});
