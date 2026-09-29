import { describe, it, expect } from "vitest";
import { DuckDBInstance } from "@duckdb/node-api";
import { uncorruptedItems, CORRUPTED_BIT } from "../src/snapshot";

/**
 * Los objetos Corruptos del Broker (City Never Sleeps, 2026-09-29) no cuentan
 * como el objeto normal: decisión de ZoTaD, igual que el `include_corrupted_items`
 * de deadlock-api.
 *
 * Así lo guarda el lake, medido ese día: al corromper, la entrada original queda
 * con `sold_time_s` en el momento del cambio y aparece otra entrada del mismo
 * `item_id` con `upgrade_info = 0x810000`. Sacar esa segunda entrada deja la
 * compra verdadera y no cuenta dos veces el objeto.
 */
describe("las compras corruptas", () => {
  it("la marca es el bit 0x800000 de upgrade_info", () => {
    expect(CORRUPTED_BIT).toBe(0x800000);
    expect((0x810000 & CORRUPTED_BIT) !== 0).toBe(true);
    expect((0x10000 & CORRUPTED_BIT) !== 0).toBe(false);
  });

  it("salen de las listas de objetos y de sus minutos", async () => {
    const con = await (await DuckDBInstance.create(":memory:")).connect();
    await con.run(`create table t as select
      [10, 20, 20]::UBIGINT[] as "items.item_id",
      [100, 200, 900]::INTEGER[] as "items.game_time_s",
      [65536, 65536, 8454144]::UINTEGER[] as "items.upgrade_info"`);
    const r = (
      await con.runAndReadAll(
        `select ${uncorruptedItems("item_id")} as ids, ${uncorruptedItems("game_time_s")} as ts from t`
      )
    ).getRowObjectsJson();
    expect(r[0].ids).toEqual(["10", "20"]);
    expect(r[0].ts).toEqual([100, 200]);
  });

  it("una partida sin upgrade_info no pierde nada", async () => {
    const con = await (await DuckDBInstance.create(":memory:")).connect();
    await con.run(`create table t as select [10]::UBIGINT[] as "items.item_id",
      [NULL]::UINTEGER[] as "items.upgrade_info"`);
    const r = (await con.runAndReadAll(`select ${uncorruptedItems("item_id")} as ids from t`)).getRowObjectsJson();
    expect(r[0].ids).toEqual(["10"]);
  });
});
