import { describe, it, expect } from "vitest";
import type { SqlQuery } from "../src/d1";
import {
  retentionFromEnv,
  DEFAULT_RAW_RETENTION_MATCHES,
  rowsFor,
  partitionedRowsFor,
  dayOf,
  lobbiesWithDate,
  pendingMatchesQuery,
  assertValidSet,
  assertValidLimit,
  assertCatalogPresent,
  summarizeLoop,
  matchesToDelete,
  deleteOldRaw,
  parseResetArg,
  countFromContentRange,
  type LobbyWithDate,
  type PendingRow,
  type SummarizeLoopDeps,
  type RawMatchState,
  type SummaryRows,
  type SummaryPartition,
  type DeleteOldRawDeps,
} from "../src/summarize-run";
import { RANKED_QUEUE } from "../src/store";
import type { Catalog } from "../src/build";
import type { ArchivableMatch } from "../src/r2Archive";

const SET = 17;
const VERSION =
  "Linux Version 16.14.794.5912 (Jul 10 2026/14:56:00) [PUBLIC] <Releases/16.14>";
/** Mismo formato que VERSION, con el parche que haga falta — nada hardcodea un parche real. */
const versionFor = (patch: string) =>
  `Linux Version 16.14.794.5912 (Jul 10 2026/14:56:00) [PUBLIC] <Releases/${patch}>`;

/** Un tablero con firma: un trait multi-grada activo más una unidad con ítems. */
function board(placement: number, carryId = "TFT17_Zoe") {
  return {
    puuid: "p" + placement,
    placement,
    level: 8,
    goldLeft: 3,
    units: [{ character_id: carryId, tier: 2, rarity: 2, items: ["Deathblade"] }],
    traits: [{ name: "TFT17_Sorcerer", numUnits: 6, tierCurrent: 3, tierTotal: 4 }],
  };
}

/** Un tablero sin firma: sin unidades, así que primaryCarry (y por lo tanto compSignature) da "". */
function boardWithoutSignature(placement: number) {
  return { puuid: "p" + placement, placement, level: 8, goldLeft: 3, units: [], traits: [] };
}

function lobby(overrides: Partial<LobbyWithDate> & { gameDatetime: number }): LobbyWithDate {
  return {
    matchId: overrides.matchId ?? "LA2_1",
    set: overrides.set ?? SET,
    queueId: overrides.queueId ?? RANKED_QUEUE,
    gameType: overrides.gameType ?? "standard",
    gameVersion: overrides.gameVersion ?? VERSION,
    tier: overrides.tier ?? "CHALLENGER",
    boards: overrides.boards ?? [board(1), board(2)],
    gameDatetime: overrides.gameDatetime,
  };
}

describe("dayOf", () => {
  it("saca el día de game_datetime, no de la fecha de hoy", () => {
    // 2026-03-05T12:00:00.000Z en epoch ms.
    expect(dayOf(Date.UTC(2026, 2, 5, 12, 0, 0))).toBe("2026-03-05");
  });
});

describe("rowsFor", () => {
  it("una partida de otra cola no genera ninguna fila", () => {
    const rows = rowsFor(
      [lobby({ matchId: "LA2_1", queueId: 1090, gameDatetime: Date.UTC(2026, 6, 20) })],
      SET
    );
    expect(rows.compStats).toEqual([]);
    expect(rows.compUnitStats).toEqual([]);
    expect(rows.compUnitItemStats).toEqual([]);
    expect(rows.compTraitStats).toEqual([]);
    expect(rows.compItemStats).toEqual([]);
    expect(rows.bandStats).toEqual([]);
  });

  it("una partida de otro set tampoco genera filas", () => {
    const rows = rowsFor(
      [lobby({ matchId: "LA2_1", set: 16, gameDatetime: Date.UTC(2026, 6, 20) })],
      SET
    );
    expect(rows.compStats).toEqual([]);
    expect(rows.bandStats).toEqual([]);
  });

  it("una partida cuenta en todas las bandas que la cubren: global se solapa con apex", () => {
    // CHALLENGER está en "global" (aggregate) y en "apex" (exclusiva) a la vez.
    const rows = rowsFor(
      [lobby({ matchId: "LA2_1", tier: "CHALLENGER", gameDatetime: Date.UTC(2026, 6, 20) })],
      SET
    );
    const bandsWithComp = new Set(rows.compStats.map((r) => r.band));
    expect(bandsWithComp.has("global")).toBe(true);
    expect(bandsWithComp.has("apex")).toBe(true);
    // Ninguna banda de más abajo, que no cubre challenger.
    expect(bandsWithComp.has("diamond-emerald")).toBe(false);
    expect(bandsWithComp.has("platinum-gold")).toBe(false);
    expect(bandsWithComp.has("silver-below")).toBe(false);

    const globalRow = rows.compStats.find((r) => r.band === "global")!;
    const apexRow = rows.compStats.find((r) => r.band === "apex")!;
    // Los dos ven los mismos dos tableros de esta única partida.
    expect(globalRow.boards).toBe(2);
    expect(apexRow.boards).toBe(2);
  });

  it("una partida por debajo de apex NO cuenta en apex, pero sí en su propia banda", () => {
    const rows = rowsFor(
      [lobby({ matchId: "LA2_1", tier: "GOLD IV", gameDatetime: Date.UTC(2026, 6, 20) })],
      SET
    );
    const bandsWithComp = new Set(rows.compStats.map((r) => r.band));
    expect(bandsWithComp.has("apex")).toBe(false);
    expect(bandsWithComp.has("global")).toBe(false); // global empieza en platinum
    expect(bandsWithComp.has("platinum-gold")).toBe(true);
  });

  it("el día sale de game_datetime, no de la fecha de hoy", () => {
    const oldMs = Date.UTC(2023, 0, 15, 3, 0, 0); // una fecha bien vieja, no "hoy"
    const rows = rowsFor([lobby({ matchId: "LA2_1", gameDatetime: oldMs })], SET);
    expect(rows.compStats.length).toBeGreaterThan(0);
    for (const row of rows.compStats) expect(row.day).toBe("2023-01-15");
    for (const row of rows.bandStats) expect(row.day).toBe("2023-01-15");
  });

  it("band_stats cuenta los tableros sin firma en el denominador", () => {
    const rows = rowsFor(
      [
        lobby({
          matchId: "LA2_1",
          gameDatetime: Date.UTC(2026, 6, 20),
          boards: [board(1), boardWithoutSignature(2)],
        }),
      ],
      SET
    );
    // El tablero sin firma no genera fila de comp_stats...
    const globalComp = rows.compStats.filter((r) => r.band === "global");
    expect(globalComp).toHaveLength(1);
    expect(globalComp[0].boards).toBe(1);
    // ...pero band_stats sigue contando los dos tableros de la partida.
    const globalBand = rows.bandStats.find((r) => r.band === "global")!;
    expect(globalBand.boards).toBe(2);
    expect(globalBand.matches).toBe(1);
  });

  it("descarta la partida con un solo tablero, igual que isComparable", () => {
    const rows = rowsFor(
      [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20), boards: [board(1)] })],
      SET
    );
    expect(rows.bandStats).toEqual([]);
  });

  it("suma dos partidas del mismo día y firma en una sola fila de comp_stats", () => {
    const day = Date.UTC(2026, 6, 20);
    const rows = rowsFor(
      [
        lobby({ matchId: "LA2_1", gameDatetime: day }),
        lobby({ matchId: "LA2_2", gameDatetime: day }),
      ],
      SET
    );
    const globalComp = rows.compStats.filter((r) => r.band === "global");
    expect(globalComp).toHaveLength(1);
    expect(globalComp[0].boards).toBe(4); // 2 tableros x 2 partidas
  });

  it("separa comp_stats por día, pero NO duplica las claves de las tablas de detalle", () => {
    const rows = rowsFor(
      [
        lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) }),
        lobby({ matchId: "LA2_2", gameDatetime: Date.UTC(2026, 6, 21) }),
      ],
      SET
    );
    const globalComp = rows.compStats.filter((r) => r.band === "global");
    // Dos días distintos: dos filas de comp_stats para la misma firma.
    expect(globalComp).toHaveLength(2);
    expect(new Set(globalComp.map((r) => r.day))).toEqual(new Set(["2026-07-20", "2026-07-21"]));

    // comp_unit_stats no lleva día: las dos partidas se fusionan en una sola fila
    // por (banda, parche, firma, unidad), o el upsert mandaría la misma clave dos
    // veces en un solo INSERT y Postgres lo rechaza.
    const globalUnits = rows.compUnitStats.filter(
      (r) => r.band === "global" && r.unit_id === "TFT17_Zoe"
    );
    expect(globalUnits).toHaveLength(1);
    expect(globalUnits[0].boards).toBe(4); // 2 tableros x 2 partidas, los dos días juntos
  });

  it("compUnitItemStats, compTraitStats y compItemStats reflejan lo que summarize() contó", () => {
    const rows = rowsFor(
      [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })],
      SET
    );
    const globalItem = rows.compUnitItemStats.find(
      (r) => r.band === "global" && r.unit_id === "TFT17_Zoe" && r.item_id === "Deathblade"
    )!;
    expect(globalItem.boards).toBe(2);

    const globalTrait = rows.compTraitStats.find(
      (r) => r.band === "global" && r.trait_id === "TFT17_Sorcerer"
    )!;
    expect(globalTrait.num_units).toBe(6);
    expect(globalTrait.boards).toBe(2);

    const globalPriority = rows.compItemStats.find(
      (r) => r.band === "global" && r.item_id === "Deathblade"
    )!;
    expect(globalPriority.instances).toBe(2);
  });

  it("informa cuántas partidas descartó isComparable, para que un lote 100% descartado no se pueda no ver", () => {
    const rows = rowsFor(
      [
        lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) }), // comparable
        lobby({ matchId: "LA2_2", queueId: 1090, gameDatetime: Date.UTC(2026, 6, 20) }), // otra cola
        lobby({ matchId: "LA2_3", set: 16, gameDatetime: Date.UTC(2026, 6, 20) }), // otro set
      ],
      SET
    );
    expect(rows.discardedMatches).toBe(2);
  });

  it("un TFT_SET inválido (NaN) descarta el 100% del lote, y discardedMatches lo delata", () => {
    // Number(process.env.TFT_SET) con un valor mal tipeado da NaN; nada es === NaN.
    const rows = rowsFor(
      [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })],
      Number("no-es-un-numero")
    );
    expect(rows.discardedMatches).toBe(1);
    expect(rows.compStats).toEqual([]);
  });

  // Arreglo 3: rowsFor tiene que aplicar EXACTAMENTE el keepItem que se le pasa,
  // igual que build.ts hace con knownItemFilter — ver el comentario de rowsFor.
  it("aplica el keepItem que se le pasa, igual que summarize()", () => {
    const withFilter = rowsFor(
      [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })],
      SET,
      (id) => id !== "Deathblade" // el catálogo "no conoce" Deathblade
    );
    const globalUnit = withFilter.compUnitStats.find(
      (r) => r.band === "global" && r.unit_id === "TFT17_Zoe"
    )!;
    // sumItems/itemized no cuentan el ítem filtrado, y no aparece ninguna fila
    // de unidad-ítem ni de prioridad de ítem para él.
    expect(globalUnit.sum_items).toBe(0);
    expect(globalUnit.itemized).toBe(0);
    expect(
      withFilter.compUnitItemStats.some((r) => r.item_id === "Deathblade")
    ).toBe(false);
    expect(withFilter.compItemStats.some((r) => r.item_id === "Deathblade")).toBe(false);

    // Sin filtro (el default), el mismo ítem sí se cuenta — es el contraste que
    // prueba que el filtro de arriba hizo algo, no que rowsFor ignora el ítem.
    const withoutFilter = rowsFor(
      [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })],
      SET
    );
    const globalUnitNoFilter = withoutFilter.compUnitStats.find(
      (r) => r.band === "global" && r.unit_id === "TFT17_Zoe"
    )!;
    expect(globalUnitNoFilter.sum_items).toBeGreaterThan(0);
    expect(globalUnitNoFilter.itemized).toBeGreaterThan(0);
  });
});

describe("rowsFor — currentPatches limita a los parches que importan (Cambio 1)", () => {
  // A rowsFor no le importa CÓMO se calcularon "los dos más nuevos" — eso lo
  // decide quien llama (newestPatchesFromPg en pgStore.ts, sobre parches
  // presentes de verdad). Acá se le pasa cualquier lista, para probar el
  // filtro en sí sin acoplar el test a esa cuenta.
  const CURRENT = ["16.13", "16.14"];

  it("sin currentPatches (el default), sigue contando todos los parches — no rompe el comportamiento previo", () => {
    const rows = rowsFor(
      [lobby({ matchId: "LA2_old", gameVersion: versionFor("16.9"), gameDatetime: Date.UTC(2026, 6, 20) })],
      SET
    );
    expect(rows.compStats.length).toBeGreaterThan(0);
  });

  it("una partida de un parche fuera de currentPatches no genera ninguna fila", () => {
    const rows = rowsFor(
      [lobby({ matchId: "LA2_old", gameVersion: versionFor("16.9"), gameDatetime: Date.UTC(2026, 6, 20) })],
      SET,
      () => true,
      CURRENT
    );
    expect(rows.compStats).toEqual([]);
    expect(rows.compUnitStats).toEqual([]);
    expect(rows.compUnitItemStats).toEqual([]);
    expect(rows.compTraitStats).toEqual([]);
    expect(rows.compItemStats).toEqual([]);
    expect(rows.bandStats).toEqual([]);
  });

  // Se descarta igual que una partida de otra cola: discardedMatches la cuenta,
  // no hay un tercer contador aparte. "Se marca sin contarla" es Arreglo 6 de
  // este mismo archivo (lobbiesWithDate no filtra por parche), no algo de acá.
  it("se cuenta como descartada, igual que las que no son de cola rankeada", () => {
    const rows = rowsFor(
      [lobby({ matchId: "LA2_old", gameVersion: versionFor("16.9"), gameDatetime: Date.UTC(2026, 6, 20) })],
      SET,
      () => true,
      CURRENT
    );
    expect(rows.discardedMatches).toBe(1);
  });

  it("las partidas de los dos parches más nuevos sí suman, cada una bajo su propio parche", () => {
    const rows = rowsFor(
      [
        lobby({ matchId: "LA2_mid", gameVersion: versionFor("16.13"), gameDatetime: Date.UTC(2026, 6, 19) }),
        lobby({ matchId: "LA2_new", gameVersion: versionFor("16.14"), gameDatetime: Date.UTC(2026, 6, 20) }),
      ],
      SET,
      () => true,
      CURRENT
    );
    const patches = new Set(rows.compStats.map((r) => r.patch));
    expect(patches).toEqual(new Set(["16.13", "16.14"]));
    expect(rows.discardedMatches).toBe(0);
  });

  it("un lote mixto: la vieja se descarta y las dos nuevas suman, sin mezclarse", () => {
    const rows = rowsFor(
      [
        lobby({ matchId: "LA2_old", gameVersion: versionFor("16.9"), gameDatetime: Date.UTC(2026, 6, 18) }),
        lobby({ matchId: "LA2_mid", gameVersion: versionFor("16.13"), gameDatetime: Date.UTC(2026, 6, 19) }),
        lobby({ matchId: "LA2_new", gameVersion: versionFor("16.14"), gameDatetime: Date.UTC(2026, 6, 20) }),
      ],
      SET,
      () => true,
      CURRENT
    );
    expect(rows.discardedMatches).toBe(1);
    const patches = new Set(rows.compStats.map((r) => r.patch));
    expect(patches).toEqual(new Set(["16.13", "16.14"]));
  });
});

/**
 * partitionedRowsFor es la forma que summarize-run.ts sube a R2 (ver
 * r2Summary.ts): particionada por (parche, día) en vez de fusionada por
 * parche. El punto entero de estos tests es la propiedad que hace que R2 y
 * Postgres puedan dar lo mismo: sumar TODAS las particiones de un parche tiene
 * que reproducir exactamente lo que rowsFor calcula sobre los mismos lobbies.
 */
describe("partitionedRowsFor", () => {
  it("con un solo día, da las mismas filas que rowsFor para esa (banda, parche, día)", () => {
    const lobbies = [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })];
    const rows = rowsFor(lobbies, SET);
    const partitions = partitionedRowsFor(lobbies, SET);

    expect(partitions).toHaveLength(1);
    expect(partitions[0].key).toEqual({ patch: "16.14", day: "2026-07-20" });
    expect(partitions[0].matchIds).toEqual(["LA2_1"]);
    // Un solo día: nada que fusionar, así que las filas coinciden 1 a 1 (orden
    // incluido, porque las dos recorren las mismas bandas en el mismo orden).
    expect(partitions[0].rows.compStats).toEqual(rows.compStats);
    expect(partitions[0].rows.compUnitStats).toEqual(rows.compUnitStats);
    expect(partitions[0].rows.compUnitItemStats).toEqual(rows.compUnitItemStats);
    expect(partitions[0].rows.compTraitStats).toEqual(rows.compTraitStats);
    expect(partitions[0].rows.compItemStats).toEqual(rows.compItemStats);
    expect(partitions[0].rows.bandStats).toEqual(rows.bandStats);
  });

  it("separa por (parche, día): dos días de la misma firma dan dos particiones", () => {
    const lobbies = [
      lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) }),
      lobby({ matchId: "LA2_2", gameDatetime: Date.UTC(2026, 6, 21) }),
    ];
    const partitions = partitionedRowsFor(lobbies, SET);
    expect(partitions).toHaveLength(2);
    expect(new Set(partitions.map((p) => p.key.day))).toEqual(new Set(["2026-07-20", "2026-07-21"]));
    // A diferencia de rowsFor (que fusiona comp_unit_stats sobre los días para
    // no mandar la misma clave dos veces en un upsert), acá CADA partición
    // tiene su propia fila de comp_unit_stats sin fusionar: fusionar acá sería
    // incorrecto, porque cada día es su propia partición.
    for (const p of partitions) {
      const globalUnit = p.rows.compUnitStats.find((r) => r.band === "global" && r.unit_id === "TFT17_Zoe")!;
      expect(globalUnit.boards).toBe(2); // sólo ESE día: 2 tableros de 1 partida
    }
  });

  it("cada partición sólo lista los match_id que le corresponden a ese (parche, día)", () => {
    const lobbies = [
      lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) }),
      lobby({ matchId: "LA2_2", gameDatetime: Date.UTC(2026, 6, 20) }),
      lobby({ matchId: "LA2_3", gameDatetime: Date.UTC(2026, 6, 21) }),
    ];
    const partitions = partitionedRowsFor(lobbies, SET);
    const day20 = partitions.find((p) => p.key.day === "2026-07-20")!;
    const day21 = partitions.find((p) => p.key.day === "2026-07-21")!;
    expect(day20.matchIds).toEqual(["LA2_1", "LA2_2"]);
    expect(day21.matchIds).toEqual(["LA2_3"]);
  });

  it("una partida jugada hace tres días entra hoy y cae en la partición de su propio día, no la de hoy", () => {
    const oldDay = Date.UTC(2023, 0, 15); // bien vieja, no "hoy"
    const partitions = partitionedRowsFor([lobby({ matchId: "LA2_1", gameDatetime: oldDay })], SET);
    expect(partitions).toHaveLength(1);
    expect(partitions[0].key.day).toBe("2023-01-15");
  });

  it("respeta currentPatches, igual que rowsFor", () => {
    const lobbies = [
      lobby({ matchId: "LA2_old", gameVersion: versionFor("16.9"), gameDatetime: Date.UTC(2026, 6, 18) }),
      lobby({ matchId: "LA2_new", gameDatetime: Date.UTC(2026, 6, 20) }),
    ];
    const partitions = partitionedRowsFor(lobbies, SET, () => true, ["16.13", "16.14"]);
    expect(partitions).toHaveLength(1);
    expect(partitions[0].key.patch).toBe("16.14");
    expect(partitions[0].matchIds).toEqual(["LA2_new"]);
  });

  it("respeta keepItem, igual que rowsFor", () => {
    const lobbies = [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })];
    const partitions = partitionedRowsFor(lobbies, SET, (id) => id !== "Deathblade");
    const globalUnit = partitions[0].rows.compUnitStats.find(
      (r) => r.band === "global" && r.unit_id === "TFT17_Zoe"
    )!;
    expect(globalUnit.sum_items).toBe(0);
    expect(globalUnit.itemized).toBe(0);
  });

  it("sin lobbies comparables, no produce ninguna partición", () => {
    expect(
      partitionedRowsFor([lobby({ matchId: "LA2_1", queueId: 1090, gameDatetime: Date.UTC(2026, 6, 20) })], SET)
    ).toEqual([]);
  });

  // La propiedad central: sumar TODAS las particiones tiene que reproducir
  // rowsFor exactamente — es lo que hace que R2 (particionado) y Postgres
  // (fusionado) puedan dar el mismo SignatureSummary[] al leer.
  it("sumar boards de comp_stats y band_stats sobre todas las particiones da lo mismo que rowsFor", () => {
    const lobbies = [
      lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) }),
      lobby({ matchId: "LA2_2", gameDatetime: Date.UTC(2026, 6, 21) }),
      lobby({ matchId: "LA2_3", tier: "CHALLENGER", gameDatetime: Date.UTC(2026, 6, 22) }),
    ];
    const rows = rowsFor(lobbies, SET);
    const partitions = partitionedRowsFor(lobbies, SET);

    const sumBoards = (band: string) =>
      partitions.flatMap((p) => p.rows.bandStats).filter((r) => r.band === band).reduce((s, r) => s + r.boards, 0);
    const rowsBoards = (band: string) =>
      rows.bandStats.filter((r) => r.band === band).reduce((s, r) => s + r.boards, 0);
    for (const band of ["global", "apex", "platinum-gold"]) {
      expect(sumBoards(band)).toBe(rowsBoards(band));
    }

    // comp_unit_stats: rowsFor fusiona sobre los días; particionado no. Sumar
    // "boards" de todas las particiones para esa (banda, unidad) tiene que dar
    // lo mismo que la fila ya fusionada de rowsFor.
    const sumUnitBoards = (band: string, unitId: string) =>
      partitions
        .flatMap((p) => p.rows.compUnitStats)
        .filter((r) => r.band === band && r.unit_id === unitId)
        .reduce((s, r) => s + r.boards, 0);
    const rowsUnit = rows.compUnitStats.find((r) => r.band === "global" && r.unit_id === "TFT17_Zoe")!;
    expect(sumUnitBoards("global", "TFT17_Zoe")).toBe(rowsUnit.boards);
  });
});

describe("assertValidSet", () => {
  it("no tira con un entero válido", () => {
    expect(() => assertValidSet(17, "17")).not.toThrow();
  });

  it("tira si TFT_SET no parsea a un entero (típicamente NaN por un typo)", () => {
    expect(() => assertValidSet(Number("diecisiete"), "diecisiete")).toThrow(/TFT_SET/);
  });

  it("tira con un número no entero", () => {
    expect(() => assertValidSet(17.5, "17.5")).toThrow(/TFT_SET/);
  });
});

describe("assertValidLimit", () => {
  it("no tira con un entero >= 0", () => {
    expect(() => assertValidLimit(2000, "2000")).not.toThrow();
    expect(() => assertValidLimit(0, "0")).not.toThrow();
  });

  it("tira si SUMMARIZE_LIMIT no parsea a un entero (típicamente NaN por un typo)", () => {
    expect(() => assertValidLimit(Number("mil"), "mil")).toThrow(/SUMMARIZE_LIMIT/);
  });

  it("tira con un número negativo", () => {
    expect(() => assertValidLimit(-1, "-1")).toThrow(/SUMMARIZE_LIMIT/);
  });
});

describe("assertCatalogPresent", () => {
  it("no tira con un catálogo presente", () => {
    const catalog: Catalog = { champions: {}, items: {} };
    expect(() => assertCatalogPresent(catalog)).not.toThrow();
  });

  it("tira si no hay catálogo, explicando por qué no se puede resumir sin uno", () => {
    expect(() => assertCatalogPresent(null)).toThrow(/catálogo/i);
  });
});

describe("lobbiesWithDate", () => {
  it("junta game_datetime con lo que ya arma lobbiesFromRows, en el mismo orden", () => {
    const rows: PendingRow[] = [
      {
        match_id: "LA2_1",
        tier: "GOLD IV",
        game_datetime: 1_700_000_000_000,
        payload: {
          info: {
            tft_set_number: SET,
            queue_id: RANKED_QUEUE,
            game_version: VERSION,
            participants: [board(1), board(2)].map((b) => ({
              puuid: b.puuid,
              placement: b.placement,
              level: b.level,
              gold_left: b.goldLeft,
              units: b.units.map((u) => ({
                character_id: u.character_id,
                tier: u.tier,
                rarity: u.rarity,
                itemNames: u.items,
              })),
              traits: b.traits.map((t) => ({
                name: t.name,
                num_units: t.numUnits,
                tier_current: t.tierCurrent,
                tier_total: t.tierTotal,
              })),
            })),
          },
        } as unknown as PendingRow["payload"],
      },
    ];
    const [out] = lobbiesWithDate(rows);
    expect(out.matchId).toBe("LA2_1");
    expect(out.tier).toBe("GOLD IV");
    expect(out.gameDatetime).toBe(1_700_000_000_000);
    expect(out.boards).toHaveLength(2);
  });

  it("descarta la partida sin game_datetime en vez de inventarle la fecha 1970-01-01", () => {
    // Antes de este fix, `?? 0` convertía esto en gameDatetime=0, que dayOf()
    // manda a un balde "1970-01-01" imborrable en comp_stats y band_stats. Sin
    // fecha real, la partida tiene que desaparecer de la salida — no marcarse
    // (ver Arreglo 6) es responsabilidad de quien llama, comparando match_id
    // contra las filas de entrada.
    const rows: PendingRow[] = [
      {
        match_id: "LA2_2",
        tier: null,
        game_datetime: null,
        payload: { info: { participants: [] } } as unknown as PendingRow["payload"],
      },
    ];
    expect(lobbiesWithDate(rows)).toEqual([]);
  });

  it("de un lote mixto, conserva solo las partidas con game_datetime real", () => {
    const dated: PendingRow = {
      match_id: "LA2_1",
      tier: "GOLD IV",
      game_datetime: 1_700_000_000_000,
      payload: { info: { participants: [] } } as unknown as PendingRow["payload"],
    };
    const noDate: PendingRow = {
      match_id: "LA2_2",
      tier: "GOLD IV",
      game_datetime: null,
      payload: { info: { participants: [] } } as unknown as PendingRow["payload"],
    };
    const out = lobbiesWithDate([dated, noDate]);
    expect(out).toHaveLength(1);
    expect(out[0].matchId).toBe("LA2_1");
    expect(out[0].gameDatetime).toBe(1_700_000_000_000);
  });
});

describe("pendingMatchesQuery", () => {
  it("filtra por summarized_at nulo, sin filtrar por cola ni set", () => {
    const q = pendingMatchesQuery(500);
    expect(q.sql).toContain("summarized_at is null");
    expect(q.sql).not.toContain("queue_id");
    expect(q.sql).not.toContain("set_number");
    expect(q.params).toEqual([500]);
  });

  it("pide game_datetime, que matchesQuery (la de build.ts) no pide", () => {
    expect(pendingMatchesQuery(500).sql).toContain("game_datetime");
  });

  it("sin cursor, no agrega ningún filtro de match_id", () => {
    expect(pendingMatchesQuery(500).sql).not.toContain("match_id >");
  });

  it("con cursor, pide sólo lo que viene después (Arreglo 2)", () => {
    const q = pendingMatchesQuery(500, "LA2_123");
    expect(q.sql).toContain("match_id > ?");
    // Atado, no interpolado: un id con comillas no puede romper la consulta.
    expect(q.params).toEqual(["LA2_123", 500]);
  });
});


/** Una PendingRow mínima: alcanza para atravesar lobbiesWithDate/rowsFor sin tirar. */
function pendingRow(matchId: string, gameDatetime: number | null): PendingRow {
  return {
    match_id: matchId,
    tier: "GOLD IV",
    game_datetime: gameDatetime,
    payload: { info: { participants: [] } } as unknown as PendingRow["payload"],
  };
}

/**
 * Una PendingRow con un tablero real (mismo `board()` de arriba), para probar
 * currentPatches de punta a punta en summarizeLoop: a diferencia de
 * `pendingRow`, ésta SÍ produce filas en rowsOut cuando su parche entra en el
 * filtro, así que se puede comprobar que efectivamente NO las produce cuando
 * su parche queda afuera.
 */
function pendingRowWithBoard(matchId: string, gameVersion: string, gameDatetime: number): PendingRow {
  return {
    match_id: matchId,
    tier: "CHALLENGER",
    game_datetime: gameDatetime,
    payload: {
      info: {
        tft_set_number: SET,
        queue_id: RANKED_QUEUE,
        tft_game_type: "standard",
        game_version: gameVersion,
        participants: [board(1), board(2)].map((b) => ({
          puuid: b.puuid,
          placement: b.placement,
          level: b.level,
          gold_left: b.goldLeft,
          units: b.units.map((u) => ({
            character_id: u.character_id,
            tier: u.tier,
            rarity: u.rarity,
            itemNames: u.items,
          })),
          traits: b.traits.map((t) => ({
            name: t.name,
            num_units: t.numUnits,
            tier_current: t.tierCurrent,
            tier_total: t.tierTotal,
          })),
        })),
      },
    } as unknown as PendingRow["payload"],
  };
}

/**
 * Deps falsas para summarizeLoop: `pages` son las páginas que devuelve fetchRows,
 * en orden (una por llamada); `refreshResults` son los valores que devuelve
 * refreshLock, en orden de llamada (por defecto `true`, así que sólo hace falta
 * listar el valor que se quiere que difiera).
 *
 * `markedCalls` registra los match_id marcados y `r2Calls` las particiones escritas
 * en R2. Los dos importan por separado, y en ese orden: la corrida escribe R2 y
 * recién después marca, así que una corrida que aborta puede tener r2Calls sin
 * markedCalls, nunca al revés.
 */
function fakeLoopDeps(pages: PendingRow[][], refreshResults: boolean[] = []) {
  const fetchCalls: SqlQuery[] = [];
  const refreshCalls = { count: 0 };
  const markedCalls: string[][] = [];
  const r2Calls: SummaryPartition[][] = [];
  const deps: SummarizeLoopDeps = {
    fetchRows: async (q) => {
      fetchCalls.push(q);
      return pages.shift() ?? [];
    },
    refreshLock: async () => {
      const result = refreshResults[refreshCalls.count] ?? true;
      refreshCalls.count += 1;
      return result;
    },
    writeSummaryToR2: async (partitions: SummaryPartition[]) => {
      r2Calls.push(partitions);
    },
    markSummarized: async (matchIds: string[]) => {
      markedCalls.push(matchIds);
      return matchIds.length;
    },
  };
  return { deps, fetchCalls, refreshCalls, markedCalls, r2Calls };
}

describe("summarizeLoop", () => {
  it("refresca el lock (heartbeat) en cada vuelta del loop", async () => {
    const pages = [
      [pendingRow("LA2_1", Date.UTC(2026, 6, 20))],
      [pendingRow("LA2_2", Date.UTC(2026, 6, 20))],
      [], // la tercera vuelta no encuentra más pendientes y corta
    ];
    const { deps, refreshCalls } = fakeLoopDeps(pages);
    const processed = await summarizeLoop(deps, SET, 100, 1);
    // Tres vueltas de loop (dos con filas, una vacía que corta) → tres refrescos:
    // el heartbeat corre ANTES de pedir la página, en cada vuelta, sin excepción.
    expect(refreshCalls.count).toBe(3);
    expect(processed).toBe(2);
  });

  it("devuelve el total de partidas procesadas cuando el lock se mantiene todo el tiempo", async () => {
    const pages = [
      [pendingRow("LA2_1", Date.UTC(2026, 6, 20)), pendingRow("LA2_2", Date.UTC(2026, 6, 20))],
      [],
    ];
    const { deps } = fakeLoopDeps(pages);
    const processed = await summarizeLoop(deps, SET, 100, 2);
    expect(processed).toBe(2);
  });

  it("si otra corrida robó el lock, aborta ruidosamente en vez de seguir escribiendo", async () => {
    const pages = [
      [pendingRow("LA2_1", Date.UTC(2026, 6, 20))],
      [pendingRow("LA2_2", Date.UTC(2026, 6, 20))], // nunca debería llegar a pedirse
    ];
    // Primer refresco (antes de la vuelta 1) da true; segundo (antes de la vuelta 2) da false.
    const { deps, markedCalls, r2Calls, fetchCalls } = fakeLoopDeps(pages, [true, false]);

    await expect(summarizeLoop(deps, SET, 100, 1)).rejects.toThrow(/lock/i);

    // Nada se escribió ni se marcó: con el resumen en R2, escribir y marcar pasan
    // al FINAL de la corrida, así que abortar a mitad de camino no deja ni
    // contadores a medias ni partidas marcadas sin contar.
    expect(r2Calls.length).toBe(0);
    expect(markedCalls.length).toBe(0);
    expect(fetchCalls.length).toBe(1);
  });
});

describe("summarizeLoop — currentPatches llega hasta rowsFor (Cambio 1)", () => {
  it("una partida de un parche viejo se marca igual que las demás, pero rowsOut no suma nada de su parche", async () => {
    const oldRow = pendingRowWithBoard("LA2_old", versionFor("16.9"), Date.UTC(2026, 6, 18));
    const newRow = pendingRowWithBoard("LA2_new", versionFor("16.14"), Date.UTC(2026, 6, 20));
    const pages = [[oldRow, newRow], []];
    const { deps, markedCalls, r2Calls } = fakeLoopDeps(pages);

    const processed = await summarizeLoop(deps, SET, 100, 2, () => true, ["16.13", "16.14"]);

    expect(processed).toBe(2);
    // Las dos partidas, vieja y nueva, llegan a marcarse — la marca las recibe
    // juntas, igual que si no hubiera ningún filtro de parche.
    expect(markedCalls[0].slice().sort()).toEqual(["LA2_new", "LA2_old"]);
    // Pero lo que de verdad se sumó (rowsOut) sólo tiene el parche vigente: si
    // currentPatches no hubiera llegado hasta rowsFor, este set tendría los dos.
    const patchesSummed = new Set(r2Calls[0].flatMap((p) => p.rows.compStats).map((r) => r.patch));
    expect(patchesSummed).toEqual(new Set(["16.14"]));
  });

  it("sin currentPatches, summarizeLoop sigue sumando todos los parches (compatibilidad hacia atrás)", async () => {
    const oldRow = pendingRowWithBoard("LA2_old", versionFor("16.9"), Date.UTC(2026, 6, 18));
    const pages = [[oldRow], []];
    const { deps, r2Calls } = fakeLoopDeps(pages);

    await summarizeLoop(deps, SET, 100, 2);

    expect(r2Calls[0].flatMap((p) => p.rows.compStats).length).toBeGreaterThan(0);
  });
});

/**
 * La escritura a R2 (ver r2Summary.ts): se llama UNA sola vez por corrida, con
 * TODOS los lotes ya acumulados — nunca una vez por lote, que multiplicaría los
 * objetos por el número de páginas.
 */
describe("summarizeLoop — writeSummaryToR2", () => {
  it("se llama una sola vez, al final, aunque la corrida tenga varios lotes", async () => {
    const pages = [
      [pendingRowWithBoard("LA2_1", VERSION, Date.UTC(2026, 6, 20))],
      [pendingRowWithBoard("LA2_2", VERSION, Date.UTC(2026, 6, 20))],
      [],
    ];
    const calls: SummaryPartition[][] = [];
    const deps: SummarizeLoopDeps = {
      fetchRows: async () => pages.shift() ?? [],
      refreshLock: async () => true,
      markSummarized: async (ids) => ids.length,
      writeSummaryToR2: async (partitions) => {
        calls.push(partitions);
      },
    };

    await summarizeLoop(deps, SET, 100, 1);

    expect(calls).toHaveLength(1); // no dos — uno por lote sería incorrecto
  });

  it("dos lotes que tocan el MISMO (parche, día) se acumulan en una sola partición, no en dos", async () => {
    const pages = [
      [pendingRowWithBoard("LA2_1", VERSION, Date.UTC(2026, 6, 20))],
      [pendingRowWithBoard("LA2_2", VERSION, Date.UTC(2026, 6, 20))],
      [],
    ];
    const calls: SummaryPartition[][] = [];
    const deps: SummarizeLoopDeps = {
      fetchRows: async () => pages.shift() ?? [],
      refreshLock: async () => true,
      markSummarized: async (ids) => ids.length,
      writeSummaryToR2: async (partitions) => {
        calls.push(partitions);
      },
    };

    await summarizeLoop(deps, SET, 100, 1);

    const day20 = calls[0].filter((p) => p.key.day === "2026-07-20");
    expect(day20).toHaveLength(1); // acumulado en UNA partición, no dos
    expect(day20[0].matchIds.slice().sort()).toEqual(["LA2_1", "LA2_2"]);
  });

  it("lotes que tocan días distintos producen una partición por día, todas en la misma llamada", async () => {
    const pages = [
      [pendingRowWithBoard("LA2_1", VERSION, Date.UTC(2026, 6, 20))],
      [pendingRowWithBoard("LA2_2", VERSION, Date.UTC(2026, 6, 23))], // "llegó tarde"
      [],
    ];
    const calls: SummaryPartition[][] = [];
    const deps: SummarizeLoopDeps = {
      fetchRows: async () => pages.shift() ?? [],
      refreshLock: async () => true,
      markSummarized: async (ids) => ids.length,
      writeSummaryToR2: async (partitions) => {
        calls.push(partitions);
      },
    };

    await summarizeLoop(deps, SET, 100, 1);

    expect(calls).toHaveLength(1);
    expect(new Set(calls[0].map((p) => p.key.day))).toEqual(new Set(["2026-07-20", "2026-07-23"]));
  });

  it("sin ninguna partida comparable en toda la corrida, no se escribe nada en R2", async () => {
    const pages = [[pendingRow("LA2_1", Date.UTC(2026, 6, 20))], []]; // pendingRow: sin tableros, no comparable
    let calls = 0;
    const deps: SummarizeLoopDeps = {
      fetchRows: async () => pages.shift() ?? [],
      refreshLock: async () => true,
      markSummarized: async (ids) => ids.length,
      writeSummaryToR2: async () => {
        calls += 1;
      },
    };

    await summarizeLoop(deps, SET, 100, 1);

    expect(calls).toBe(0);
  });

  // El orden importa y es lo único que protege los contadores: si se marcara
  // primero y R2 fallara después, esas partidas quedarían marcadas sin que nadie
  // las contara, y no hay forma de recuperarlas.
  it("escribe en R2 ANTES de marcar las partidas", async () => {
    const pages = [[pendingRowWithBoard("LA2_1", VERSION, Date.UTC(2026, 6, 20))], []];
    const orden: string[] = [];
    const deps: SummarizeLoopDeps = {
      fetchRows: async () => pages.shift() ?? [],
      refreshLock: async () => true,
      writeSummaryToR2: async () => {
        orden.push("r2");
      },
      markSummarized: async (ids) => {
        orden.push("marca");
        return ids.length;
      },
    };

    await summarizeLoop(deps, SET, 100, 1);

    expect(orden).toEqual(["r2", "marca"]);
  });

  it("si R2 falla, no se marca nada: la corrida siguiente reprocesa lo mismo", async () => {
    const pages = [[pendingRowWithBoard("LA2_1", VERSION, Date.UTC(2026, 6, 20))], []];
    const marcadas: string[][] = [];
    const deps: SummarizeLoopDeps = {
      fetchRows: async () => pages.shift() ?? [],
      refreshLock: async () => true,
      writeSummaryToR2: async () => {
        throw new Error("R2 caído");
      },
      markSummarized: async (ids) => {
        marcadas.push(ids);
        return ids.length;
      },
    };

    await expect(summarizeLoop(deps, SET, 100, 1)).rejects.toThrow(/R2/);
    expect(marcadas).toEqual([]);
  });
});

/**
 * Una base falsa que de verdad filtra por `summarized_at is null` y
 * `match_id > cursor`, igual que PostgREST — a diferencia de `fakeLoopDeps`
 * arriba, que sólo reparte páginas ya armadas sin mirar la query. Hace falta
 * este nivel de realismo para el test de abajo: probar que ocho partidas sin
 * fecha seguidas NO traban el avance exige que fetchRows reaccione al cursor
 * de `pendingMatchesQuery`, no que un array de páginas fijas lo simule.
 */
function fakeDb(matchIds: string[], dated: Set<string>) {
  const summarized = new Set<string>();
  const fetchRows: SummarizeLoopDeps["fetchRows"] = async (q) => {
    // Los valores ya no viajan en la cadena: el cursor es el primer parámetro
    // atado cuando la consulta lo lleva, y el límite es siempre el último.
    const cursor = q.sql.includes("match_id > ?") ? String(q.params![0]) : "";
    const limit = Number(q.params![q.params!.length - 1]);
    const pending = matchIds
      .filter((id) => !summarized.has(id) && id > cursor)
      .sort()
      .slice(0, limit);
    return pending.map((id) =>
      pendingRow(id, dated.has(id) ? Date.UTC(2026, 6, 20) : null)
    );
  };
  const markSummarized: SummarizeLoopDeps["markSummarized"] = async (ids: string[]) => {
    let marked = 0;
    for (const id of ids) {
      if (!summarized.has(id)) {
        summarized.add(id);
        marked += 1;
      }
    }
    return marked;
  };
  return { fetchRows, markSummarized, summarized };
}

describe("summarizeLoop — ocho partidas sin fecha seguidas no traban el avance (Arreglo 2)", () => {
  it("con el cursor por match_id, el backlog real detrás de las sin fecha se procesa igual", async () => {
    // Ocho partidas consecutivas (por match_id) sin game_datetime, que nunca se
    // marcan — el peor caso que describe el arreglo: exactamente BATCH seguidas.
    const undated = Array.from({ length: 8 }, (_, i) => `LA2_${String(i).padStart(2, "0")}`);
    // Y cuatro partidas reales, con fecha, que ordenan DESPUÉS de las ocho sin
    // fecha por match_id — el backlog que quedaría bloqueado detrás sin el cursor.
    const realBacklog = Array.from({ length: 4 }, (_, i) => `LA2_${String(i + 8).padStart(2, "0")}`);
    const allIds = [...undated, ...realBacklog];
    const { fetchRows, markSummarized, summarized } = fakeDb(allIds, new Set(realBacklog));

    const deps: SummarizeLoopDeps = {
      fetchRows,
      markSummarized,
      refreshLock: async () => true,
      writeSummaryToR2: async () => {},
    };
    const processed = await summarizeLoop(deps, SET, 100, 8);

    // Las doce filas se VIERON (procesadas), pero sólo las cuatro con fecha real
    // llegaron a marcarse — las ocho sin fecha, nunca, tengan cursor o no.
    expect(processed).toBe(12);
    expect(summarized.size).toBe(4);
    for (const id of realBacklog) expect(summarized.has(id)).toBe(true);
    for (const id of undated) expect(summarized.has(id)).toBe(false);
  });

  it("sin el cursor (comportamiento previo al arreglo), las ocho sin fecha se piden para siempre y el backlog real nunca se ve", async () => {
    // Mismo escenario, pero llamando a pendingMatchesQuery SIN pasar el cursor —
    // reproduce el bug: cada página vuelve a pedir exactamente las mismas ocho
    // filas sin fecha (nunca se marcan, así que summarized_at=is.null las sigue
    // trayendo), y el backlog real de atrás nunca se alcanza dentro del LIMIT.
    const undated = Array.from({ length: 8 }, (_, i) => `LA2_${String(i).padStart(2, "0")}`);
    const realBacklog = Array.from({ length: 4 }, (_, i) => `LA2_${String(i + 8).padStart(2, "0")}`);
    const allIds = [...undated, ...realBacklog];
    const { markSummarized, summarized } = fakeDb(allIds, new Set(realBacklog));

    // fetchRows "viejo": ignora el cursor a propósito, como pendingMatchesQuery
    // antes del Arreglo 2 (nunca mandaba match_id=gt.*).
    const noCursorFetchRows: SummarizeLoopDeps["fetchRows"] = async (q) => {
      const limit = Number(q.params![q.params!.length - 1]);
      const pending = allIds
        .filter((id) => !summarized.has(id))
        .sort()
        .slice(0, limit);
      return pending.map((id) => pendingRow(id, undated.includes(id) ? null : Date.UTC(2026, 6, 20)));
    };

    const deps: SummarizeLoopDeps = {
      fetchRows: noCursorFetchRows,
      markSummarized,
      refreshLock: async () => true,
      writeSummaryToR2: async () => {},
    };
    // LIMIT bajo a propósito: alcanza para demostrar que se estanca sin gastar
    // el presupuesto entero del test en vueltas idénticas.
    await summarizeLoop(deps, SET, 40, 8);

    // El backlog real nunca se marcó: las ocho sin fecha volvieron en cada
    // página y el `LIMIT` se agotó sin que ninguna partida real se viera.
    expect(summarized.size).toBe(0);
  });
});

describe("matchesToDelete (Arreglo 4)", () => {
  const cutoffMs = Date.UTC(2026, 6, 22); // la ventana termina acá; más viejo se borra

  // `??` trataría un `null` explícito como "no vino" y lo pisaría con el
  // default — exactamente el valor que estos tests necesitan pasar a propósito
  // (summarizedAt/gameDatetime nulos son casos de prueba, no ausencia de
  // override) — así que se chequea presencia de la clave, no nullishness.
  function match(overrides: Partial<RawMatchState> & { matchId: string }): RawMatchState {
    return {
      matchId: overrides.matchId,
      summarizedAt:
        "summarizedAt" in overrides ? overrides.summarizedAt! : "2026-07-22T00:00:00.000Z",
      gameDatetime:
        "gameDatetime" in overrides ? overrides.gameDatetime! : Date.UTC(2026, 6, 20), // viejo, por defecto
    };
  }

  it("borra una partida contabilizada y jugada antes de la ventana", () => {
    const m = match({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 18) });
    expect(matchesToDelete([m], cutoffMs)).toEqual(["LA2_1"]);
  });

  it("NO borra una partida contabilizada pero jugada DENTRO de la ventana", () => {
    const m = match({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 25) }); // después del cutoff
    expect(matchesToDelete([m], cutoffMs)).toEqual([]);
  });

  it("el límite es estricto: exactamente en el cutoff NO se borra, un milisegundo antes sí", () => {
    const onCutoff = match({ matchId: "LA2_onCutoff", gameDatetime: cutoffMs });
    const beforeCutoff = match({ matchId: "LA2_before", gameDatetime: cutoffMs - 1 });
    expect(matchesToDelete([onCutoff, beforeCutoff], cutoffMs)).toEqual(["LA2_before"]);
  });

  it("NO borra una partida vieja que todavía no se contabilizó, aunque su fecha esté fuera de la ventana", () => {
    // Nunca se puede perder una partida que todavía no aportó a los contadores:
    // no hay forma de recuperarla después de borrada.
    const m = match({
      matchId: "LA2_1",
      summarizedAt: null,
      gameDatetime: Date.UTC(2026, 6, 1),
    });
    expect(matchesToDelete([m], cutoffMs)).toEqual([]);
  });

  it("NO borra por game_datetime nulo, aunque esté marcada (defensivo: no debería ocurrir en la práctica)", () => {
    const m = match({ matchId: "LA2_1", gameDatetime: null });
    expect(matchesToDelete([m], cutoffMs)).toEqual([]);
  });

  it("nunca decide por summarizedAt ni por cuándo se bajó — sólo por gameDatetime", () => {
    // Una partida contabilizada AYER (summarizedAt reciente) pero JUGADA hace
    // meses tiene que borrarse igual: Riot trae las últimas veinte partidas DE
    // CADA JUGADOR, no las últimas veinte recientes, así que "recién bajada" y
    // "recién jugada" no son lo mismo.
    const m = match({
      matchId: "LA2_1",
      summarizedAt: new Date().toISOString(), // contabilizada ahora mismo
      gameDatetime: Date.UTC(2026, 1, 1), // pero jugada meses atrás
    });
    expect(matchesToDelete([m], cutoffMs)).toEqual(["LA2_1"]);
  });

  it("de un conjunto mixto, sólo entran las que cumplen las dos condiciones", () => {
    const matches: RawMatchState[] = [
      match({ matchId: "borrable", summarizedAt: "x", gameDatetime: Date.UTC(2026, 6, 1) }),
      match({ matchId: "sin_contar", summarizedAt: null, gameDatetime: Date.UTC(2026, 6, 1) }),
      match({ matchId: "dentro_de_ventana", summarizedAt: "x", gameDatetime: Date.UTC(2026, 6, 25) }),
      match({ matchId: "sin_fecha", summarizedAt: "x", gameDatetime: null }),
    ];
    expect(matchesToDelete(matches, cutoffMs)).toEqual(["borrable"]);
  });
});

/**
 * `deleteOldRaw` con dependencias falsas — mismo patrón que `fakeLoopDeps` para
 * `summarizeLoop`: nada de red, así que se puede probar el invariante central
 * del archivo en R2 (una subida fallida no borra) sin tocar Postgres ni R2.
 */
function archivableMatch(matchId: string): ArchivableMatch {
  return {
    matchId,
    gameVersion: VERSION,
    gameDatetime: Date.UTC(2026, 6, 1),
    payload: { info: { participants: [] } },
  };
}

function fakeDeleteDeps(overrides: Partial<DeleteOldRawDeps> = {}) {
  const calls = {
    fetchEligible: [] as number[],
    archive: [] as ArchivableMatch[][],
    deleteMatches: [] as string[][],
    countEligible: [] as number[],
  };
  const deps: DeleteOldRawDeps = {
    retentionCutoff: async () => Date.UTC(2026, 6, 15),
    fetchEligible: async (cutoffMs) => {
      calls.fetchEligible.push(cutoffMs);
      return [archivableMatch("A1"), archivableMatch("A2")];
    },
    archive: async (matches) => {
      calls.archive.push(matches);
      return new Set(matches.map((m) => m.matchId));
    },
    deleteMatches: async (ids) => {
      calls.deleteMatches.push(ids);
      return ids.length;
    },
    countEligible: async (cutoffMs) => {
      calls.countEligible.push(cutoffMs);
      return 0;
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("deleteOldRaw — el invariante: sin confirmación de R2, no se borra", () => {
  it("cuando las dos partidas se archivan bien, borra las dos", async () => {
    const { deps, calls } = fakeDeleteDeps();
    const result = await deleteOldRaw(deps);
    expect(result).toEqual({ deleted: 2, remaining: 0, archiveFailed: 0 });
    expect(calls.deleteMatches[0].slice().sort()).toEqual(["A1", "A2"]);
  });

  // La prueba que más importa: una subida que no se confirmó en R2 no puede
  // llegar a deleteMatches bajo ninguna circunstancia.
  it("la partida cuya subida a R2 falló NO se pasa a deleteMatches", async () => {
    const { deps, calls } = fakeDeleteDeps({
      // Simula que archive() sólo confirmó A1 — A2 "falló" en R2.
      archive: async (matches) => {
        calls.archive.push(matches);
        return new Set(matches.filter((m) => m.matchId !== "A2").map((m) => m.matchId));
      },
    });

    const result = await deleteOldRaw(deps);

    expect(calls.deleteMatches).toHaveLength(1);
    expect(calls.deleteMatches[0]).toEqual(["A1"]);
    expect(calls.deleteMatches[0]).not.toContain("A2");
    expect(result.archiveFailed).toBe(1);
  });

  it("si NINGUNA subida se confirma, deleteMatches se llama con una lista vacía — no borra nada", async () => {
    const { deps, calls } = fakeDeleteDeps({
      archive: async (matches) => {
        calls.archive.push(matches);
        return new Set<string>();
      },
      deleteMatches: async (ids) => {
        calls.deleteMatches.push(ids);
        return 0;
      },
    });

    const result = await deleteOldRaw(deps);

    expect(calls.deleteMatches).toEqual([[]]);
    expect(result.deleted).toBe(0);
    expect(result.archiveFailed).toBe(2);
  });

  it("`deleted` es lo que devuelve deleteMatches, no la cantidad de ids que se le pasó", async () => {
    // Un caso real donde el conteo de Postgres (content-range) puede diferir
    // de la cantidad de ids pedidos — deleteOldRaw no debe inventar el número.
    const { deps } = fakeDeleteDeps({
      deleteMatches: async () => 1, // devuelve menos de los 2 ids que recibe
    });
    const result = await deleteOldRaw(deps);
    expect(result.deleted).toBe(1);
  });

  it("sin ventana llena (retentionCutoff null), no toca fetchEligible, archive ni deleteMatches", async () => {
    const { deps, calls } = fakeDeleteDeps({ retentionCutoff: async () => null });
    const result = await deleteOldRaw(deps);
    expect(result).toEqual({ deleted: 0, remaining: 0, archiveFailed: 0 });
    expect(calls.fetchEligible).toEqual([]);
    expect(calls.archive).toEqual([]);
    expect(calls.deleteMatches).toEqual([]);
  });

  it("sin nada elegible, no llama a archive ni a deleteMatches", async () => {
    const { deps, calls } = fakeDeleteDeps({ fetchEligible: async () => [] });
    const result = await deleteOldRaw(deps);
    expect(result).toEqual({ deleted: 0, remaining: 0, archiveFailed: 0 });
    expect(calls.archive).toEqual([]);
    expect(calls.deleteMatches).toEqual([]);
  });

  it("countEligible se consulta con el mismo cutoff que retentionCutoff devolvió, y su resultado es `remaining`", async () => {
    const cutoff = Date.UTC(2026, 6, 10);
    const { deps, calls } = fakeDeleteDeps({
      retentionCutoff: async () => cutoff,
      countEligible: async (c) => {
        calls.countEligible.push(c);
        return 137;
      },
    });
    const result = await deleteOldRaw(deps);
    expect(calls.countEligible).toEqual([cutoff]);
    expect(result.remaining).toBe(137);
  });
});

describe("parseResetArg (Arreglo 5)", () => {
  it("sin el flag, da null", () => {
    expect(parseResetArg([])).toBeNull();
    expect(parseResetArg(["--from=pg", "diamond-emerald"])).toBeNull();
  });

  it("con el flag, devuelve el parche pegado con '='", () => {
    expect(parseResetArg(["--reset-summary=16.14"])).toBe("16.14");
  });

  it("no confunde otro flag que empieza parecido", () => {
    expect(parseResetArg(["--reset-summary-dry-run=16.14"])).toBeNull();
  });

  it("toma el flag entre otros argumentos, en cualquier posición", () => {
    expect(parseResetArg(["--from=pg", "--reset-summary=16.13", "diamond-emerald"])).toBe("16.13");
  });
});

describe("countFromContentRange (Arreglo 5)", () => {
  it("parsea el total después de la barra", () => {
    expect(countFromContentRange("0-9/42")).toBe(42);
  });

  it("da 0 si el header no vino", () => {
    expect(countFromContentRange(null)).toBe(0);
  });

  it("da 0 si el total es '*' (PostgREST no lo pudo calcular)", () => {
    expect(countFromContentRange("*/*")).toBe(0);
  });

  it("da 0 con un header sin la barra esperada", () => {
    expect(countFromContentRange("no-es-un-content-range")).toBe(0);
  });
});

describe("retentionFromEnv", () => {
  // El caso que motivó la función: un workflow_dispatch sin input pasa la variable
  // como cadena vacía, no como ausente. Number("") es 0, y retención 0 sería
  // "borrar todo" en cada corrida programada.
  it("la cadena vacía cae al valor por defecto, no a cero", () => {
    expect(retentionFromEnv("")).toBe(DEFAULT_RAW_RETENTION_MATCHES);
    expect(retentionFromEnv("   ")).toBe(DEFAULT_RAW_RETENTION_MATCHES);
  });

  it("ausente cae al valor por defecto", () => {
    expect(retentionFromEnv(undefined)).toBe(DEFAULT_RAW_RETENTION_MATCHES);
  });

  it("un número válido manda", () => {
    expect(retentionFromEnv("8850")).toBe(8850);
    expect(retentionFromEnv("0")).toBe(0);
  });

  // Un número mal tipeado a mano es un error del que hay que enterarse.
  it("revienta con cualquier otra cosa", () => {
    expect(() => retentionFromEnv("catorce mil")).toThrow(/inválido/);
    expect(() => retentionFromEnv("-5")).toThrow(/inválido/);
    expect(() => retentionFromEnv("1.5")).toThrow(/inválido/);
  });
});
