import { describe, it, expect } from "vitest";
import { DuckDBInstance } from "@duckdb/node-api";
import { bucketOf, comebackAggSql, comebacksFile, EDGES, MINUTES, type AggRow } from "../src/comebacks";

describe("el tramo de una ventaja", () => {
  it("va de 0 (más de 30% abajo) a 8 (más de 30% arriba)", () => {
    expect(bucketOf(-0.5)).toBe(0);
    expect(bucketOf(-0.3)).toBe(1);
    expect(bucketOf(-0.12)).toBe(2);
    expect(bucketOf(-0.07)).toBe(3);
    expect(bucketOf(0)).toBe(4);
    expect(bucketOf(0.05)).toBe(5);
    expect(bucketOf(0.15)).toBe(6);
    expect(bucketOf(0.25)).toBe(7);
    expect(bucketOf(0.9)).toBe(EDGES.length);
  });
});

describe("la cuenta en DuckDB", () => {
  /**
   * Partidas de 6 contra 6 con muestras a los 6 y 20 minutos:
   * - la 1: el equipo 0 va 25% arriba al 6 y 24% al 20, y gana;
   * - la 2: el equipo 0 va parejo al 6 y 12% abajo al 20, y gana igual.
   * Más una muestra de fin de partida (t = 1234) que no cuenta, y un jugador
   * sin la muestra del 20 en una tercera partida, que la deja afuera.
   */
  const leer = async (): Promise<AggRow[]> => {
    const con = await (await DuckDBInstance.create(":memory:")).connect();
    await con.run(`create table t as
      select match_id, team, won, 10 as tier, ts, nw from (
        select m as match_id, p // 6 as team, (p // 6 = 0) as won,
          case when m = 3 and p = 0 then [360]::UINTEGER[] else [360, 1200, 1234]::UINTEGER[] end as ts,
          case
            when m = 1 then (case when p // 6 = 0 then [1125, 5600, 6000] else [875, 4400, 5000] end)::UINTEGER[]
            when m = 2 then (case when p // 6 = 0 then [1000, 4700, 6000] else [1000, 5300, 5000] end)::UINTEGER[]
            else (case when p // 6 = 0 then [1000, 5000, 6000] else [1000, 5000, 5000] end)::UINTEGER[]
          end as nw
        from range(1, 4) a(m), range(12) b(p)
      )`);
    const filas = (await con.runAndReadAll(comebackAggSql("select * from t"))).getRowObjects();
    return filas.map((r) => ({
      tier: Number(r.tier),
      minute: Number(r.minute),
      bucket: Number(r.bucket),
      n: Number(r.n),
      wins: Number(r.wins),
    }));
  };

  it("cuenta cada lado de cada partida en su minuto y su tramo", async () => {
    const filas = await leer();
    const en = (minute: number, bucket: number) => filas.find((f) => f.minute === minute && f.bucket === bucket);
    // Minuto 6: la 1 va +25% / −25% (tramos 7 y 1); la 2 y la 3 van parejas (tramo 4).
    expect(en(6, 7)).toMatchObject({ n: 1, wins: 1 });
    expect(en(6, 1)).toMatchObject({ n: 1, wins: 0 });
    expect(en(6, 4)).toMatchObject({ n: 4, wins: 2 });
    // Minuto 20: la 1 va ±24% (7 y 1); en la 2, el que ganó iba 12% abajo
    // (tramo 2) y el otro 12% arriba (6). La 3 no entra: le falta la muestra
    // de un jugador.
    expect(en(20, 7)).toMatchObject({ n: 1, wins: 1 });
    expect(en(20, 1)).toMatchObject({ n: 1, wins: 0 });
    expect(en(20, 2)).toMatchObject({ n: 1, wins: 1 });
    expect(en(20, 6)).toMatchObject({ n: 1, wins: 0 });
    expect(filas.filter((f) => f.minute === 20).reduce((s, f) => s + f.n, 0)).toBe(4);
  });

  it("no cuenta la muestra de fin de partida", async () => {
    const filas = await leer();
    expect(filas.every((f) => (MINUTES as readonly number[]).includes(f.minute))).toBe(true);
  });
});

describe("el archivo", () => {
  it("suma por banda y en total, y cuenta partidas al minuto 6", () => {
    const rows: AggRow[] = [
      { tier: 10, minute: 6, bucket: 4, n: 10, wins: 5 },
      { tier: 10, minute: 20, bucket: 2, n: 4, wins: 1 },
      { tier: 3, minute: 6, bucket: 4, n: 6, wins: 3 },
      { tier: 3, minute: 99, bucket: 4, n: 6, wins: 3 },
    ];
    const f = comebacksFile(rows, { from: "2026-09-15", to: "2026-09-30", generatedAt: "x" });
    expect(f.matches).toBe(8);
    expect(f.bands["phantom-above"].matches).toBe(5);
    expect(f.bands["arcanist-below"].matches).toBe(3);
    expect(f.bands.all.cells[MINUTES.indexOf(20)][2]).toEqual({ n: 4, wins: 1 });
    expect(f.bands.all.cells[0]).toHaveLength(EDGES.length + 1);
  });
});
