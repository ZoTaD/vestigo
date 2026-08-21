import { describe, it, expect } from "vitest";
import {
  summaryPath,
  summaryObjectKeyFor,
  toJsonGz,
  fromJsonGz,
  archiveSummaryPartitions,
  patchPrefix,
  fetchSummaryTablesFromR2,
  fetchPatchRowsFromR2,
  loadBandSummaryFromR2,
  snapshotPath,
  absorbBand,
  absorbIntoPatchObjects,
  loadBandSummariesForSet,
  type ListObjectKeys,
  type GetObjectBody,
} from "../src/r2Summary";
import { contentHashFor } from "../src/r2Archive";
import {
  partitionedRowsFor,
  type LobbyWithDate,
  type SummaryPartition,
  type SummaryRows,
} from "../src/summarize-run";
import { summariesFromTables, totalBoardsFromRows } from "../src/summaryStore";
import { RANKED_QUEUE } from "../src/store";

const SET = 17;
const PATCH = "16.14";
const VERSION =
  "Linux Version 16.14.794.5912 (Jul 10 2026/14:56:00) [PUBLIC] <Releases/16.14>";

function board(placement: number, carryId = "TFT17_Zoe", items: string[] = ["Deathblade", "Deathblade"]) {
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

function lobby(overrides: Partial<LobbyWithDate> & { matchId: string; gameDatetime: number }): LobbyWithDate {
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

describe("summaryPath", () => {
  it("arma la ruta: summary/patch=.../day=.../<nombre>", () => {
    expect(summaryPath("16.14", "2026-07-20", "abc123.json.gz")).toBe(
      "summary/patch=16.14/day=2026-07-20/abc123.json.gz"
    );
  });
});

describe("summaryObjectKeyFor", () => {
  it("usa el mismo criterio de hash que r2Archive.ts (contentHashFor), con .json.gz", () => {
    const ids = ["LA2_3", "LA2_1", "LA2_2"];
    expect(summaryObjectKeyFor(ids)).toBe(`${contentHashFor(ids)}.json.gz`);
  });

  it("no depende del orden — reintentar la misma corrida da la misma clave", () => {
    expect(summaryObjectKeyFor(["LA2_1", "LA2_2"])).toBe(summaryObjectKeyFor(["LA2_2", "LA2_1"]));
  });

  it("conjuntos de match_id distintos dan nombres distintos", () => {
    expect(summaryObjectKeyFor(["LA2_1"])).not.toBe(summaryObjectKeyFor(["LA2_2"]));
  });
});

function emptyRows(): SummaryRows {
  return {
    compStats: [],
    compUnitStats: [],
    compUnitItemStats: [],
    compTraitStats: [],
    compItemStats: [],
    bandStats: [],
    discardedMatches: 0,
  };
}

describe("toJsonGz / fromJsonGz — round trip", () => {
  it("recupera exactamente el mismo delta que se comprimió", () => {
    const delta: SummaryRows = {
      ...emptyRows(),
      compStats: [
        {
          band: "global",
          patch: PATCH,
          day: "2026-07-20",
          signature: "s1",
          boards: 5,
          sum_placement: 10,
          sum_placement_sq: 30,
          top4: 3,
          wins: 1,
          sum_level: 40,
          winner_boards: 3,
          winner_sum_placement: 6,
          winner_sum_level: 24,
          winner_sum_gold: 9,
          loser_boards: 2,
          loser_sum_placement: 9,
          loser_sum_level: 16,
          loser_sum_gold: 6,
        },
      ],
    };
    const gz = toJsonGz(delta);
    expect(fromJsonGz(gz)).toEqual(delta);
  });

  it("de verdad comprime: gzip de un delta grande es más chico que el JSON crudo", () => {
    const big: SummaryRows = {
      ...emptyRows(),
      bandStats: Array.from({ length: 500 }, (_, i) => ({
        band: "global",
        patch: PATCH,
        day: "2026-07-20",
        boards: i,
        matches: i,
      })),
    };
    const raw = JSON.stringify(big);
    expect(toJsonGz(big).length).toBeLessThan(raw.length);
  });

  it("un delta vacío hace un round trip limpio", () => {
    expect(fromJsonGz(toJsonGz(emptyRows()))).toEqual(emptyRows());
  });
});

describe("archiveSummaryPartitions — nunca tira, un fallo no aborta las demás particiones", () => {
  function partition(patch: string, day: string, matchIds: string[]): SummaryPartition {
    return { key: { patch, day }, matchIds, rows: emptyRows() };
  }

  it("sube cada partición a su propia ruta", async () => {
    const uploaded: string[] = [];
    const { uploaded: count, failed } = await archiveSummaryPartitions(
      [partition(PATCH, "2026-07-20", ["A1"]), partition(PATCH, "2026-07-21", ["A2"])],
      async (key) => {
        uploaded.push(key);
      }
    );
    expect(count).toBe(2);
    expect(failed).toBe(0);
    expect(uploaded).toEqual([
      summaryPath(PATCH, "2026-07-20", summaryObjectKeyFor(["A1"])),
      summaryPath(PATCH, "2026-07-21", summaryObjectKeyFor(["A2"])),
    ]);
  });

  it("una subida que tira no aborta las demás, y se cuenta como fallida", async () => {
    const attempted: string[] = [];
    const { uploaded, failed } = await archiveSummaryPartitions(
      [partition(PATCH, "2026-07-20", ["A1"]), partition(PATCH, "2026-07-21", ["A2"])],
      async (key) => {
        attempted.push(key);
        if (key.includes("2026-07-21")) throw new Error("R2 caído");
      }
    );
    expect(attempted).toHaveLength(2);
    expect(uploaded).toBe(1);
    expect(failed).toBe(1);
  });

  it("sin particiones, no llama a put y no falla", async () => {
    let calls = 0;
    const { uploaded, failed } = await archiveSummaryPartitions([], async () => {
      calls += 1;
    });
    expect(calls).toBe(0);
    expect(uploaded).toBe(0);
    expect(failed).toBe(0);
  });
});

/**
 * La referencia contra la que se compara todo lo que sale de R2: las mismas filas,
 * armadas de una sola pieza. Antes esto era `loadBandSummary` leyendo Postgres;
 * desde que las seis tablas no existen (migración 0014), lo que importa comprobar
 * es que juntar N objetos da lo mismo que tener las filas todas juntas.
 */
function referencia(rows: SummaryRows, band: string) {
  const de = <T extends { band: string }>(l: T[]) => l.filter((r) => r.band === band);
  const tables = {
    compStats: de(rows.compStats),
    compUnitStats: de(rows.compUnitStats),
    compUnitItemStats: de(rows.compUnitItemStats),
    compTraitStats: de(rows.compTraitStats),
    compItemStats: de(rows.compItemStats),
    bandStats: de(rows.bandStats),
  };
  return { summaries: summariesFromTables(tables), totalBoards: totalBoardsFromRows(tables.bandStats) };
}

/** Un R2 falso en memoria: un Map<clave, bytes>, con list/get inyectables. */
function fakeR2() {
  const store = new Map<string, Buffer>();
  const put = async (key: string, body: Buffer) => {
    store.set(key, body);
  };
  const listKeys: ListObjectKeys = async (prefix) =>
    [...store.keys()].filter((k) => k.startsWith(prefix));
  const getObject: GetObjectBody = async (key) => {
    const body = store.get(key);
    if (!body) throw new Error(`no existe: ${key}`);
    return body;
  };
  return { store, put, listKeys, getObject };
}

describe("patchPrefix", () => {
  it("arma el prefijo de un parche entero", () => {
    expect(patchPrefix("16.14")).toBe("summary/patch=16.14/");
  });
});

describe("fetchSummaryTablesFromR2 — fusiona filas repetidas de comp_unit_stats y comp_unit_item_stats", () => {
  // El caso que summariesFromTables (summaryStore.ts) NO puede resolver solo:
  // dos archivos distintos (dos corridas) tocan la MISMA firma+unidad+ítem.
  // Sin fusionar antes de leer, la segunda fila pisaría a la primera (ver el
  // comentario de mergeUnitStats/mergeUnitItemStats en r2Summary.ts) y el
  // resultado subcontaría justo lo que summarize_batch, en Postgres, ya suma
  // solo gracias al upsert.
  it("dos particiones de días distintos con la misma firma suman, no se pisan", async () => {
    const { put, listKeys, getObject } = fakeR2();
    const lobbies: LobbyWithDate[] = [
      lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) }),
      lobby({ matchId: "LA2_2", gameDatetime: Date.UTC(2026, 6, 21) }),
    ];
    // Cada partición se sube por separado, como haría summarize-run.ts.
    for (const partition of partitionedRowsFor(lobbies, SET)) {
      const key = summaryPath(partition.key.patch, partition.key.day, summaryObjectKeyFor(partition.matchIds));
      await put(key, toJsonGz(partition.rows));
    }

    const tables = await fetchSummaryTablesFromR2(listKeys, getObject, "platinum-gold", PATCH);
    const zoe = tables.compUnitStats.find((r) => r.unit_id === "TFT17_Zoe")!;
    // 2 tableros x 2 partidas (una por día) = 4, igual que sumaría Postgres.
    expect(zoe.boards).toBe(4);
    const deathblade = tables.compUnitItemStats.find((r) => r.item_id === "Deathblade")!;
    expect(deathblade.instances).toBe(8); // 2 copias x 2 tableros x 2 partidas (una por día)

    // Ningún duplicado por clave sobrevive: exactamente una fila por (unidad).
    expect(tables.compUnitStats.filter((r) => r.unit_id === "TFT17_Zoe")).toHaveLength(1);
  });

  it("late arrival: una corrida posterior que sube MÁS datos para el mismo día suma, no reemplaza", async () => {
    const { put, listKeys, getObject } = fakeR2();
    const day = Date.UTC(2026, 6, 20);

    // Corrida 1: una sola partida.
    const run1 = partitionedRowsFor([lobby({ matchId: "LA2_1", gameDatetime: day })], SET);
    for (const p of run1) await put(summaryPath(p.key.patch, p.key.day, summaryObjectKeyFor(p.matchIds)), toJsonGz(p.rows));

    // Corrida 2, más tarde: OTRA partida distinta que cae en el MISMO día
    // (la partida "llegó tarde", ver el diseño en el comentario de r2Summary.ts).
    const run2 = partitionedRowsFor([lobby({ matchId: "LA2_2", gameDatetime: day })], SET);
    for (const p of run2) await put(summaryPath(p.key.patch, p.key.day, summaryObjectKeyFor(p.matchIds)), toJsonGz(p.rows));

    const tables = await fetchSummaryTablesFromR2(listKeys, getObject, "platinum-gold", PATCH);
    const zoe = tables.compUnitStats.find((r) => r.unit_id === "TFT17_Zoe")!;
    expect(zoe.boards).toBe(4); // 2 partidas x 2 tableros, las dos corridas sumadas
  });

  it("reintentar la MISMA corrida (mismo match_id) sobreescribe la misma clave, no duplica", async () => {
    const { put, listKeys, getObject } = fakeR2();
    const lobbies = [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })];
    const partitions = partitionedRowsFor(lobbies, SET);
    for (const p of partitions) {
      const key = summaryPath(p.key.patch, p.key.day, summaryObjectKeyFor(p.matchIds));
      await put(key, toJsonGz(p.rows));
      await put(key, toJsonGz(p.rows)); // "reintento": misma clave, mismo contenido
    }
    const tables = await fetchSummaryTablesFromR2(listKeys, getObject, "platinum-gold", PATCH);
    const zoe = tables.compUnitStats.find((r) => r.unit_id === "TFT17_Zoe")!;
    expect(zoe.boards).toBe(2); // NO 4: la segunda subida pisó el mismo objeto, no sumó un segundo archivo.
  });

  it("filtra por banda, igual que band=eq.<banda> en Postgres", async () => {
    const { put, listKeys, getObject } = fakeR2();
    // GOLD IV cubre "platinum-gold" pero no "apex".
    const lobbies = [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })];
    for (const p of partitionedRowsFor(lobbies, SET)) {
      await put(summaryPath(p.key.patch, p.key.day, summaryObjectKeyFor(p.matchIds)), toJsonGz(p.rows));
    }
    const apex = await fetchSummaryTablesFromR2(listKeys, getObject, "apex", PATCH);
    expect(apex.compStats).toEqual([]);
    const platGold = await fetchSummaryTablesFromR2(listKeys, getObject, "platinum-gold", PATCH);
    expect(platGold.compStats.length).toBeGreaterThan(0);
  });

  it("ignora objetos que no terminan en .json.gz", async () => {
    const { store, listKeys, getObject } = fakeR2();
    store.set(`${patchPrefix(PATCH)}day=2026-07-20/not-a-summary.txt`, Buffer.from("garbage"));
    const tables = await fetchSummaryTablesFromR2(listKeys, getObject, "global", PATCH);
    expect(tables.compStats).toEqual([]);
  });
});

describe("loadBandSummaryFromR2 — misma firma (BandSummary) que loadBandSummary de Postgres", () => {
  it("la comparación de la Etapa 1: sumar todas las particiones de R2 da lo mismo que leer Postgres", async () => {
    const { put, listKeys, getObject } = fakeR2();
    const lobbies: LobbyWithDate[] = [
      lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) }),
      lobby({ matchId: "LA2_2", gameDatetime: Date.UTC(2026, 6, 21) }),
      lobby({ matchId: "LA2_3", tier: "CHALLENGER", gameDatetime: Date.UTC(2026, 6, 21) }),
    ];
    for (const p of partitionedRowsFor(lobbies, SET)) {
      await put(summaryPath(p.key.patch, p.key.day, summaryObjectKeyFor(p.matchIds)), toJsonGz(p.rows));
    }

    const rows = (await import("../src/summarize-run")).rowsFor(lobbies, SET);
    const esperado = referencia(rows, "platinum-gold");
    const fromR2 = await loadBandSummaryFromR2(listKeys, getObject, "platinum-gold", PATCH);

    expect(fromR2.totalBoards).toBe(esperado.totalBoards);
    const sortBySignature = (l: typeof fromR2.summaries) => [...l].sort((a, b) => a.signature.localeCompare(b.signature));
    expect(sortBySignature(fromR2.summaries)).toEqual(sortBySignature(esperado.summaries));
  });
});

describe("leer varios parches del mismo set", () => {
  /**
   * La regresión que rompió la tier list en producción el 2026-07-29: con el corte
   * por set, el lector recibe la misma comp en dos parches. `summariesFromTables`
   * lee `comp_unit_stats` **asignando**, no sumando, así que si la fusión separa
   * por parche la segunda fila pisa a la primera: la unidad se queda con los
   * tableros de un parche mientras la comp tiene los de los dos, cae debajo del
   * 50% que la hace "core" y el roster se dibuja con dos campeones.
   */
  it("una unidad de la misma comp en dos parches suma, no se pisa", async () => {
    const { put, listKeys, getObject } = fakeR2();
    const viejo = [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })];
    const nuevo = [
      lobby({
        matchId: "LA2_2",
        gameDatetime: Date.UTC(2026, 6, 28),
        // El parche sale del marcador `<Releases/…>`, NO del número del principio:
        // reemplazar el primero deja las dos partidas en el mismo parche y el test
        // no prueba nada.
        gameVersion: VERSION.replace("<Releases/16.14>", "<Releases/16.15>"),
      }),
    ];
    const rowsFor = (await import("../src/summarize-run")).rowsFor;
    await put(snapshotPath("16.14", "platinum-gold"), toJsonGz(rowsFor(viejo, SET)));
    await put(snapshotPath("16.15", "platinum-gold"), toJsonGz(rowsFor(nuevo, SET)));

    const { summaries } = await loadBandSummariesForSet(
      listKeys,
      getObject,
      ["platinum-gold"],
      SET
    ).then((m) => m.get("platinum-gold")!);

    // Las dos partidas son la misma comp, así que hay una sola firma y su carry
    // tiene que estar en los CUATRO tableros, no en dos.
    expect(summaries).toHaveLength(1);
    expect(summaries[0].boards).toBe(4);
    expect(summaries[0].units["TFT17_Zoe"].boards).toBe(4);
  });
});

describe("fetchPatchRowsFromR2 — a escala de producción", () => {
  /**
   * La regresión que sólo aparece con datos reales: juntar las filas de un
   * objeto con `into.push(...from)` pasa CADA fila como argumento y revienta el
   * stack. El snapshot de `global` son 339.090 filas; acá alcanzan 200.000 para
   * pasarse del límite de V8, y con dos lobbies (lo que prueba todo el resto de
   * este archivo) nunca se llega.
   */
  it("un objeto con 200.000 filas no revienta el stack", async () => {
    const { put, listKeys, getObject } = fakeR2();
    const rows: SummaryRows = {
      compStats: [],
      compUnitStats: [],
      compUnitItemStats: Array.from({ length: 200_000 }, (_, i) => ({
        band: "global",
        patch: PATCH,
        signature: `sig${i % 100}`,
        unit_id: `TFT17_U${i % 60}`,
        item_id: `Item${i}`,
        boards: 1,
        winner_boards: 0,
        instances: 1,
      })),
      compTraitStats: [],
      compItemStats: [],
      bandStats: [],
      discardedMatches: 0,
    };
    await put(snapshotPath(PATCH, "global"), toJsonGz(rows));

    const all = await fetchPatchRowsFromR2(listKeys, getObject, PATCH);
    expect(all.compUnitItemStats.length).toBe(200_000);
  });
});

describe("snapshotPath — la clave del backfill", () => {
  it("es fija por (parche, banda): correr el backfill de nuevo pisa, no duplica", () => {
    expect(snapshotPath("16.14", "apex")).toBe("summary/patch=16.14/pg-apex.json.gz");
    expect(snapshotPath("16.14", "apex")).toBe(snapshotPath("16.14", "apex"));
  });

  it("cae bajo el mismo prefijo que lee el build, al lado de los deltas", () => {
    expect(snapshotPath("16.14", "silver-below").startsWith(patchPrefix("16.14"))).toBe(true);
  });
});

describe("absorbBand — un objeto por banda en vez de uno por corrida", () => {
  const rowsOf = async (lobbies: LobbyWithDate[]) =>
    (await import("../src/summarize-run")).rowsFor(lobbies, SET);

  /**
   * La propiedad que sostiene todo: fusionar dos lotes en el objeto tiene que
   * dar exactamente lo que Postgres tenía después de sus dos upserts. Si una
   * clave estuviera mal (sumar `num_units`, por ejemplo, que es clave y no
   * acumulador), esto se rompe.
   */
  it("fusionar dos lotes da lo mismo que contar los dos juntos", async () => {
    const primero = [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })];
    const segundo = [lobby({ matchId: "LA2_2", gameDatetime: Date.UTC(2026, 6, 21) })];

    const paso1 = absorbBand(null, await rowsOf(primero), "platinum-gold", ["LA2_1"]);
    const paso2 = absorbBand(paso1.object, await rowsOf(segundo), "platinum-gold", ["LA2_2"]);

    const juntos = await rowsOf([...primero, ...segundo]);
    const pick = <T extends { band: string }>(l: T[]) => l.filter((r) => r.band === "platinum-gold");
    const sorted = <T>(l: T[]) => [...l].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

    expect(paso2.outcome).toBe("merged");
    expect(sorted(paso2.object.compStats)).toEqual(sorted(pick(juntos.compStats)));
    expect(sorted(paso2.object.compUnitStats)).toEqual(sorted(pick(juntos.compUnitStats)));
    expect(sorted(paso2.object.compUnitItemStats)).toEqual(sorted(pick(juntos.compUnitItemStats)));
    expect(sorted(paso2.object.compTraitStats)).toEqual(sorted(pick(juntos.compTraitStats)));
    expect(sorted(paso2.object.compItemStats)).toEqual(sorted(pick(juntos.compItemStats)));
    expect(sorted(paso2.object.bandStats)).toEqual(sorted(pick(juntos.bandStats)));
  });

  it("el mismo lote dos veces no suma dos veces: lo reconoce por absorbed", async () => {
    const lote = [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })];
    const rows = await rowsOf(lote);
    const primera = absorbBand(null, rows, "platinum-gold", ["LA2_1"]);
    const segunda = absorbBand(primera.object, rows, "platinum-gold", ["LA2_1"]);

    expect(segunda.outcome).toBe("already");
    expect(segunda.object).toEqual(primera.object);
  });

  /**
   * Un solapamiento parcial tiraba, con el argumento de que subir un objeto es
   * atómico y por lo tanto no debería poder pasar. **Pasa**: `markSummarized`
   * actualiza la base en grupos (D1 no acepta más de 100 parámetros atados), así
   * que una corrida que muere en el medio deja partidas contadas en R2 y sin
   * marcar. El 2026-07-29 eso dejó la publicación de TFT caída seis corridas
   * seguidas, y no se curaba solo: cada corrida rearmaba el mismo lote mezclado.
   */
  it("un solapamiento parcial no suma, y devuelve las que ya estaban", async () => {
    const lote = [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })];
    const rows = await rowsOf(lote);
    const primera = absorbBand(null, rows, "platinum-gold", ["LA2_1"]);
    const segunda = absorbBand(primera.object, rows, "platinum-gold", ["LA2_1", "LA2_9"]);

    expect(segunda.outcome).toBe("partial");
    expect(segunda.known).toEqual(["LA2_1"]);
    // Lo que importa: NO sumó. Sumar inflaría los contadores de LA2_1.
    expect(segunda.object).toEqual(primera.object);
  });

  /**
   * La reparación tiene que dejar el lote siguiente limpio. Marcada la que ya
   * estaba, el reintento con sólo la nueva se fusiona normal.
   */
  it("marcada la repetida, el lote siguiente entra sin problema", async () => {
    const rows1 = await rowsOf([lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })]);
    const rows2 = await rowsOf([lobby({ matchId: "LA2_9", gameDatetime: Date.UTC(2026, 6, 20) })]);
    const primera = absorbBand(null, rows1, "platinum-gold", ["LA2_1"]);
    const limpia = absorbBand(primera.object, rows2, "platinum-gold", ["LA2_9"]);

    expect(limpia.outcome).toBe("merged");
    expect(limpia.object.absorbed).toEqual(["LA2_1", "LA2_9"]);
  });

  /**
   * La otra mitad del arreglo. Antes se leía y escribía banda por banda en el
   * mismo bucle, así que un `throw` en la cuarta dejaba las tres primeras ya
   * escritas: un lote contado a medias, que es el estado que después no se puede
   * deshacer. Ahora la primera pasada sólo decide y la segunda sólo escribe.
   */
  it("si una banda ya tenía parte del lote, NO se escribe ninguna", async () => {
    const { put, listKeys, getObject, store } = fakeR2();
    const lote = [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })];
    const rows = await rowsOf(lote);
    const bandas = ["global", "platinum-gold"];

    // Primera vuelta: entra limpio.
    await absorbIntoPatchObjects(listKeys, getObject, put, "16.14", bandas, rows, ["LA2_1"]);
    const despuesDeLaPrimera = new Map(store);

    // Segunda: el mismo lote más una nueva. Solapamiento parcial en las dos bandas.
    const res = await absorbIntoPatchObjects(listKeys, getObject, put, "16.14", bandas, rows, [
      "LA2_1",
      "LA2_9",
    ]);

    expect(res.alreadyCounted).toEqual(["LA2_1"]);
    expect(res.merged).toBe(0);
    // Ni un byte cambió: el lote se cuenta entero o no se cuenta.
    expect(store).toEqual(despuesDeLaPrimera);
  });

  it("una banda sin filas en el lote no escribe ni anota nada", async () => {
    // El lobby es de GOLD, así que apex no ve nada suyo.
    const lote = [lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) })];
    const res = absorbBand(null, await rowsOf(lote), "apex", ["LA2_1"]);
    expect(res.outcome).toBe("empty");
    expect(res.object.absorbed).toEqual([]);
  });

  it("lo fusionado se lee de vuelta igual que leyendo Postgres", async () => {
    const { put, listKeys, getObject } = fakeR2();
    const lobbies: LobbyWithDate[] = [
      lobby({ matchId: "LA2_1", gameDatetime: Date.UTC(2026, 6, 20) }),
      lobby({ matchId: "LA2_2", gameDatetime: Date.UTC(2026, 6, 21) }),
    ];
    // Dos corridas seguidas, como en producción.
    for (const uno of lobbies) {
      await absorbIntoPatchObjects(
        listKeys,
        getObject,
        put,
        PATCH,
        ["platinum-gold"],
        await rowsOf([uno]),
        [uno.matchId]
      );
    }
    // Un solo objeto para la banda, no uno por corrida: eso es lo que evita que
    // el parche acumule catorce veces las filas que Postgres tenía.
    expect(await listKeys(patchPrefix(PATCH))).toEqual([snapshotPath(PATCH, "platinum-gold")]);

    const juntos = await rowsOf(lobbies);
    const esperado = referencia(juntos, "platinum-gold");
    const fromR2 = await loadBandSummaryFromR2(listKeys, getObject, "platinum-gold", PATCH);

    expect(fromR2.totalBoards).toBe(esperado.totalBoards);
    const sorted = (l: typeof fromR2.summaries) => [...l].sort((a, b) => a.signature.localeCompare(b.signature));
    expect(sorted(fromR2.summaries)).toEqual(sorted(esperado.summaries));
  });
});
