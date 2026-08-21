import { describe, it, expect } from "vitest";
import type { SummaryTables } from "../src/summaryStore";
import { summariesFromTables, totalBoardsFromRows } from "../src/summaryStore";
import { rowsFor, type LobbyWithDate, type SummaryRows } from "../src/summarize-run";
import { summarize } from "../src/aggregate/summary";
import { RANKED_QUEUE } from "../src/store";

const SET = 17;
const PATCH = "16.14";
const VERSION =
  "Linux Version 16.14.794.5912 (Jul 10 2026/14:56:00) [PUBLIC] <Releases/16.14>";
// GOLD IV cubre solo "platinum-gold" (ni "global", que arranca en platinum, ni
// "apex"), así que rowsFor produce filas para una única banda y los tests no
// tienen que lidiar con el solape a propósito de "global".
const BAND = "platinum-gold";

function board(
  placement: number,
  carryId = "TFT17_Zoe",
  items: string[] = ["Deathblade", "Deathblade"]
) {
  return {
    puuid: "p" + placement,
    placement,
    level: 8,
    goldLeft: 3,
    units: [
      { character_id: carryId, tier: 2, rarity: 2, items },
      { character_id: "TFT17_Ornn", tier: 1, rarity: 1, items: [] },
    ],
    traits: [{ name: "TFT17_Sorcerer", numUnits: 6, tierCurrent: 3, tierTotal: 4 }],
  };
}

function boardWithoutSignature(placement: number) {
  return { puuid: "p" + placement, placement, level: 8, goldLeft: 3, units: [], traits: [] };
}

function lobby(
  overrides: Partial<LobbyWithDate> & { matchId: string; gameDatetime: number }
): LobbyWithDate {
  return {
    set: SET,
    queueId: RANKED_QUEUE,
    gameType: "standard",
    gameVersion: VERSION,
    tier: "GOLD IV",
    boards: [board(1), board(2)],
    ...overrides,
  };
}

/** Las filas de una sola (banda, parche), como las devolvería fetchSummaryTables. */
function tablesFor(band: string, patch: string, rows: SummaryRows): SummaryTables {
  const pick = <T extends { band: string; patch: string }>(list: T[]): T[] =>
    list.filter((r) => r.band === band && r.patch === patch);
  return {
    compStats: pick(rows.compStats),
    compUnitStats: pick(rows.compUnitStats),
    compUnitItemStats: pick(rows.compUnitItemStats),
    compTraitStats: pick(rows.compTraitStats),
    compItemStats: pick(rows.compItemStats),
    bandStats: pick(rows.bandStats),
  };
}

describe("summariesFromTables", () => {
  // El punto de todo el módulo: reconstruir desde las seis tablas tiene que dar
  // EXACTAMENTE lo mismo que summarize() sobre los tableros crudos que las
  // llenaron — es la propiedad que hace que build.ts pueda leer de acá.
  it("da lo mismo que summarize() sobre los mismos tableros, sumando dos días distintos", () => {
    const lobbies: LobbyWithDate[] = [
      lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) }),
      lobby({ matchId: "LA2_2", gameDatetime: Date.UTC(2026, 6, 21) }),
    ];
    const rows = rowsFor(lobbies, SET);
    const tables = tablesFor(BAND, PATCH, rows);

    const rebuilt = summariesFromTables(tables);
    const boards = lobbies.flatMap((l) => l.boards);
    const { bySignature } = summarize(boards);

    expect(rebuilt.length).toBeGreaterThan(0);
    expect(rebuilt).toHaveLength(bySignature.size);
    for (const summary of rebuilt) {
      expect(summary).toEqual(bySignature.get(summary.signature));
    }
  });

  // summarize-run.ts guarda los ítems SIN el filtro de catálogo (ver el
  // comentario de rowsFor): keepItem tiene que aplicarse acá, al leer, para que
  // el resultado coincida con lo que build.ts calcularía filtrando en el camino
  // de tableros.
  it("filtra los ítems con keepItem, igual que summarize(boards, keepItem)", () => {
    const lob = lobby({
      matchId: "LA2_1",
      gameDatetime: Date.UTC(2026, 6, 20),
      boards: [
        board(1, "TFT17_Zoe", ["Deathblade", "TFT_Item_EmptyBag"]),
        board(2, "TFT17_Zoe", ["Deathblade", "TFT_Item_EmptyBag"]),
      ],
    });
    const rows = rowsFor([lob], SET);
    const tables = tablesFor(BAND, PATCH, rows);
    const keepReal = (id: string) => id !== "TFT_Item_EmptyBag";

    const rebuilt = summariesFromTables(tables, keepReal);
    const { bySignature } = summarize(lob.boards, keepReal);

    expect(rebuilt).toHaveLength(bySignature.size);
    for (const summary of rebuilt) {
      expect(summary).toEqual(bySignature.get(summary.signature));
      const zoe = summary.units["TFT17_Zoe"];
      expect(zoe.items).not.toHaveProperty("TFT_Item_EmptyBag");
      expect(zoe.items["Deathblade"].instances).toBe(2);
      // sumItems se recalcula a partir de las instancias filtradas: 1 ítem real
      // por tablero (Deathblade), no 2 (Deathblade + el placeholder).
      expect(zoe.sumItems).toBe(2);
    }
  });

  // El límite documentado del módulo: `itemized` sale de la columna guardada tal
  // cual, sin filtrar, porque la tabla no guarda qué ítems compartían tablero.
  // Diverge de la cuenta exactamente filtrada solo si TODOS los ítems de una
  // unidad en un tablero fallan el filtro — acá, a propósito, para dejarlo
  // documentado en vez de que sea una sorpresa.
  it("itemized no se ajusta por keepItem: puede sobrecontar si TODOS los ítems de un tablero se filtran", () => {
    const lob = lobby({
      matchId: "LA2_1",
      gameDatetime: Date.UTC(2026, 6, 20),
      boards: [board(1, "TFT17_Zoe", ["TFT_Item_EmptyBag"]), board(2, "TFT17_Zoe", ["TFT_Item_EmptyBag"])],
    });
    const rows = rowsFor([lob], SET);
    const tables = tablesFor(BAND, PATCH, rows);
    const keepReal = (id: string) => id !== "TFT_Item_EmptyBag";

    const rebuilt = summariesFromTables(tables, keepReal);
    const { bySignature } = summarize(lob.boards, keepReal);
    const zoeRebuilt = [...rebuilt.values()][0].units["TFT17_Zoe"];
    const zoeReal = [...bySignature.values()][0].units["TFT17_Zoe"];

    // La reconstrucción sobrecuenta: cree que la unidad tuvo ítem en los 2
    // tableros (raw, sin filtrar), cuando en realidad summarize() filtrado dice 0.
    expect(zoeRebuilt.itemized).toBe(2);
    expect(zoeReal.itemized).toBe(0);
    // sumItems, en cambio, sigue siendo exacto: 0 instancias sobreviven al filtro.
    expect(zoeRebuilt.sumItems).toBe(0);
    expect(zoeReal.sumItems).toBe(0);
  });

  it("descarta el tablero sin firma, igual que summarize()", () => {
    const lob = lobby({
      matchId: "LA2_1",
      gameDatetime: Date.UTC(2026, 6, 20),
      boards: [board(1), boardWithoutSignature(2)],
    });
    const rows = rowsFor([lob], SET);
    const tables = tablesFor(BAND, PATCH, rows);

    const rebuilt = summariesFromTables(tables);
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].boards).toBe(1);
  });
});

describe("totalBoardsFromRows", () => {
  it("suma los tableros de band_stats sobre todos los días del parche", () => {
    const rows = rowsFor(
      [
        lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) }),
        lobby({ matchId: "LA2_2", gameDatetime: Date.UTC(2026, 6, 21) }),
      ],
      SET
    );
    const tables = tablesFor(BAND, PATCH, rows);
    expect(totalBoardsFromRows(tables.bandStats)).toBe(4); // 2 tableros x 2 partidas
  });

  // El punto entero de band_stats: el denominador de playRate cuenta los
  // tableros sin firma, aunque summariesFromTables ni se entere de que existieron.
  it("cuenta los tableros sin firma, que summariesFromTables no ve", () => {
    const lob = lobby({
      matchId: "LA2_1",
      gameDatetime: Date.UTC(2026, 6, 20),
      boards: [board(1), boardWithoutSignature(2)],
    });
    const rows = rowsFor([lob], SET);
    const tables = tablesFor(BAND, PATCH, rows);

    const rebuilt = summariesFromTables(tables);
    const fromSignatures = rebuilt.reduce((sum, s) => sum + s.boards, 0);
    expect(fromSignatures).toBe(1); // solo el tablero con firma
    expect(totalBoardsFromRows(tables.bandStats)).toBe(2); // los dos, con o sin firma
  });
});
