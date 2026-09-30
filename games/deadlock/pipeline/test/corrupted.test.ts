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
 * `item_id` con `upgrade_info = 0x810000`.
 *
 * **Salen las dos, no sólo la corrupta.** Hasta el 2026-09-29 se sacaba sólo la
 * segunda, y la original quedaba en la lista con su minuto de compra: el
 * resultado de una partida jugada con la versión corrupta se le cargaba al
 * objeto normal (medido post City Never Sleeps: el 12,7% de las compras de 6400
 * que contaba la tier list de objetos habían terminado corrompidas), y el
 * informe la contaba como una venta de verdad.
 */
describe("las compras corruptas", () => {
  it("la marca es el bit 0x800000 de upgrade_info", () => {
    expect(CORRUPTED_BIT).toBe(0x800000);
    expect((0x810000 & CORRUPTED_BIT) !== 0).toBe(true);
    expect((0x10000 & CORRUPTED_BIT) !== 0).toBe(false);
  });

  const leer = async (tabla: string, cols: string[]) => {
    const con = await (await DuckDBInstance.create(":memory:")).connect();
    await con.run(`create table t as select ${tabla}`);
    return (
      await con.runAndReadAll(`select ${cols.map((c) => `${uncorruptedItems(c)} as "${c}"`).join(", ")} from t`)
    ).getRowObjectsJson()[0];
  };

  it("se va el objeto entero: el original vendido al corromper y la corrupta", async () => {
    const r = await leer(
      `[20, 20]::UBIGINT[] as "items.item_id",
       [200, 900]::INTEGER[] as "items.game_time_s",
       [900, 0]::INTEGER[] as "items.sold_time_s",
       [65536, 8454144]::UINTEGER[] as "items.upgrade_info"`,
      ["item_id", "game_time_s", "sold_time_s"]
    );
    expect(r.item_id).toEqual([]);
    expect(r.game_time_s).toEqual([]);
    expect(r.sold_time_s).toEqual([]);
  });

  it("los demás objetos de la fila quedan, alineados con sus minutos", async () => {
    const r = await leer(
      `[10, 20, 30, 20]::UBIGINT[] as "items.item_id",
       [100, 200, 300, 900]::INTEGER[] as "items.game_time_s",
       [0, 900, 0, 0]::INTEGER[] as "items.sold_time_s",
       [65536, 65536, 65537, 8454144]::UINTEGER[] as "items.upgrade_info"`,
      ["item_id", "game_time_s", "sold_time_s"]
    );
    expect(r.item_id).toEqual(["10", "30"]);
    expect(r.game_time_s).toEqual([100, 300]);
    expect(r.sold_time_s).toEqual([0, 0]);
  });

  it("una partida sin upgrade_info no pierde nada", async () => {
    const con = await (await DuckDBInstance.create(":memory:")).connect();
    await con.run(`create table t as select [10]::UBIGINT[] as "items.item_id",
      [NULL]::UINTEGER[] as "items.upgrade_info"`);
    const r = (await con.runAndReadAll(`select ${uncorruptedItems("item_id")} as ids from t`)).getRowObjectsJson();
    expect(r[0].ids).toEqual(["10"]);
  });
});
