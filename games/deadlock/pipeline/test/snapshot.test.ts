import type { ManifestFile } from "../src/snapshot";
import { describe, it, expect } from "vitest";
import {
  windowSql,
  PLAYED_MODE,
  PLAYED_GAME_MODE,
  partitionsCovering,
  horizonFrom,
  rankHoursSql,
  RANK_COVERAGE,
  RANK_MIN_PER_HOUR,
} from "../src/snapshot";

/**
 * El filtro de modo es la única parte de `windowSql` que decide **qué partidas
 * son el juego que decimos medir**, y es invisible mirando la página: una tier
 * list con Street Brawl adentro se dibuja igual de linda.
 *
 * Descubierto el 2026-07-30: `match_mode` y `game_mode` son columnas distintas, y
 * dentro de `Unranked` conviven `Normal` (38,4 min de duración media) y
 * `StreetBrawl` (14,4 min), que son **3.712 de 29.914 partidas, el 12,4%**.
 */
describe("la ventana filtra los dos modos", () => {
  const sql = windowSql([96], "2026-07-28T20:28:00", "2026-07-30T00:00:00");

  /**
   * **Hasta el 2026-07-30 esto valía `Unranked`**, porque Deadlock no tenía cola
   * rankeada y lo competitivo ERA el unranked. Desde que existe `Ranked` son dos
   * juegos distintos —8 héroes de 38 se separan más de dos errores estándar, Lady
   * Geist −5,15 y Sinclair +5,13— y además el rango sobrevivió sólo del lado
   * rankeado: 70-79% de cobertura de badge contra ~3% en standard.
   */
  it("se queda sólo con las partidas rankeadas", () => {
    expect(PLAYED_MODE).toBe("Ranked");
    expect(sql).toContain(`match_mode = '${PLAYED_MODE}'`);
  });

  /**
   * Para héroes el daño es menor —medido: 0,2 puntos típicos, 1,0 en el peor
   * caso, y nadie se mueve más de 3 puestos—, pero para ítems es decisivo: los
   * 17 ítems de coste 9999 se compran **únicamente** en Street Brawl, y sin este
   * filtro encabezan cualquier lista cruda con 61,9%.
   */
  it("descarta Street Brawl, que vive adentro de Unranked", () => {
    expect(PLAYED_GAME_MODE).toBe("Normal");
    expect(sql).toContain(`game_mode = '${PLAYED_GAME_MODE}'`);
  });

  it("recorta al rango de fechas que se le pide", () => {
    expect(sql).toContain("TIMESTAMP '2026-07-28T20:28:00'");
    expect(sql).toContain("TIMESTAMP '2026-07-30T00:00:00'");
  });
});

/**
 * Las particiones NO comparten esquema, y la ventana tiene que sobrevivir a eso.
 *
 * Descubierto el 2026-07-30 de la peor forma: la 95 y la 96 pasaron a traer 153
 * columnas contra las 139 de la 93 y la 94 —deadlock-api sumó catorce columnas de
 * ranked— y `select * ... union all` empezó a fallar con "Set operations can only
 * apply to expressions with the same number of result columns". **Rompió
 * `build:heroes` en producción**, porque la brecha por rango abarca quince días.
 */
describe("la ventana sobrevive a que el snapshot cambie de esquema", () => {
  const sql = windowSql([94, 95, 96], "2026-07-15T00:00:00", "2026-07-30T00:00:00");

  it("nombra las columnas en vez de pedir todas", () => {
    expect(sql).not.toContain("select *");
  });

  it("filtra adentro de cada partición, así el filtro se empuja a cada archivo", () => {
    const veces = sql.split(`match_mode = '${PLAYED_MODE}'`).length - 1;
    expect(veces).toBe(3);
  });
});

/**
 * **`0` no es `null`, y esa distinción costó la banda de abajo.**
 *
 * El 2026-07-30 a las 16:19 UTC Deadlock estrenó la cola rankeada y con ella un
 * soft reset con ocho partidas de calibración. Desde ese momento
 * `average_badge_team0/1` vale **0 en el 100% de las partidas**, no null — así que
 * el filtro viejo (`is not null`) las dejaba pasar, `badge // 10` daba 0, y 0 es
 * Obscurus. Resultado: **todas las partidas de todos los rangos cayeron en
 * `arcanist-below`**, que en una sola corrida pasó de 11.972 a 33.296 partidas
 * mientras las otras tres bandas dejaban de crecer.
 *
 * El corte en `> 0` es exacto y no arbitrario: el badge vale `rango*10 + subnivel`
 * y el subnivel arranca en 1, así que un Obscurus real es 1..9 y **sólo el
 * "sin rango" vale 0**. De paso arregla un caso viejo y chico que ya estaba mal:
 * antes del reset había ~150 partidas por día con badge 0 (0,5%) que también se
 * estaban contando como Obscurus.
 */
describe("el filtro de rango pide un rango de verdad", () => {
  const sql = windowSql([96], "2026-07-28T20:28:00", "2026-07-30T00:00:00");

  it("descarta el badge 0, que es 'sin rango' y no Obscurus", () => {
    expect(sql).toContain("> 0");
  });

  it("ya no alcanza con que la columna venga", () => {
    expect(sql).not.toContain("is not null");
  });
});

/**
 * El horizonte de rango: hasta cuándo el snapshot sabe a qué nivel se jugó.
 *
 * Es lo que congela la tier list sola durante la calibración **y lo que la
 * descongela sola cuando termine**, sin que haya que acordarse de volver a tocar
 * nada. Sin él, filtrar por `> 0` congelaría los héroes pero **le iría vaciando el
 * corpus a las builds**, que usan quince días móviles: cada día que pasa la
 * ventana suelta un día bueno por atrás y no recoge nada por adelante.
 */
describe("el horizonte de rango", () => {
  const hora = (h: string, matches: number, ranked: number) => ({ hour: `2026-07-30T${h}:00:00Z`, matches, ranked });

  it("es el final de la última hora con rangos", () => {
    const horas = [hora("14", 2400, 2390), hora("15", 2437, 2420), hora("16", 2437, 453), hora("17", 3416, 0)];
    expect(horizonFrom(horas)).toBe("2026-07-30T16:00:00.000Z");
  });

  it("no se mueve porque calibre un puñado suelto", () => {
    // Lo que se espera al volver los rangos: un goteo de los que terminan primero.
    // Descongelar con eso publicaría la muestra de los que más juegan, y nada más.
    const horas = [hora("14", 2400, 2390), hora("17", 3416, 0), hora("18", 3420, 120)];
    expect(horizonFrom(horas)).toBe("2026-07-30T15:00:00.000Z");
    expect(RANK_COVERAGE).toBe(0.5);
  });

  it("descongela cuando la mayoría de la partida ya tiene rango", () => {
    const horas = [hora("17", 3416, 0), hora("18", 3420, 120), hora("19", 2582, 1800)];
    expect(horizonFrom(horas)).toBe("2026-07-30T20:00:00.000Z");
  });

  // Una hora flaca —la que está a medio escribir, o las 5 de la mañana— no puede
  // decidir esto: con siete partidas, cuatro con rango ya dan 57%.
  it("no deja que una hora sin volumen decida", () => {
    const horas = [hora("14", 2400, 2390), hora("17", 3416, 0), hora("18", 7, 7)];
    expect(horizonFrom(horas)).toBe("2026-07-30T15:00:00.000Z");
    expect(RANK_MIN_PER_HOUR).toBe(100);
  });

  it("avisa en vez de adivinar cuando no hay ni una hora con rangos", () => {
    expect(horizonFrom([hora("17", 3416, 0), hora("18", 3420, 2)])).toBeNull();
  });

  /**
   * DuckDB devuelve un `DuckDBTimestampValue` sin huso y `new Date()` sobre eso lo
   * lee como hora **local**. Medido: acá (UTC−3) el horizonte salía tres horas
   * adelantado y en el runner de CI (UTC) salía bien — un bug que no se reproduce
   * donde corre. La hora tiene que venir ya formateada en UTC desde el SQL.
   */
  it("pide la hora en UTC explícito, no un timestamp sin huso", () => {
    const sql = rankHoursSql([96], "2026-07-16T00:00:00");
    expect(sql).toContain("%Y-%m-%dT%H:%M:%SZ");
    expect(sql).not.toMatch(/date_trunc\('hour', start_time\) as hour/);
  });

  it("cuenta la cobertura sobre el mismo corpus que se publica", () => {
    const sql = rankHoursSql([96], "2026-07-16T00:00:00");
    expect(sql).toContain(`match_mode = '${PLAYED_MODE}'`);
    expect(sql).toContain(`game_mode = '${PLAYED_GAME_MODE}'`);
  });
});

describe("las particiones se eligen por solapamiento, no por pertenencia", () => {
  const ranges = [
    { n: 94, from: "2026-07-15", to: "2026-07-21" },
    { n: 95, from: "2026-07-21", to: "2026-07-27" },
    { n: 96, from: "2026-07-27", to: "2026-07-30" },
  ];

  // Una ventana que arranca a mitad de una partición necesita esa partición
  // entera; el filtro por start_time descarta las filas de más. Devolver de
  // menos sería perder partidas en silencio.
  it("trae la partición que la ventana toca por el borde", () => {
    expect(partitionsCovering(ranges, "2026-07-26", "2026-07-29")).toEqual([95, 96]);
  });

  it("deja afuera las que no toca", () => {
    expect(partitionsCovering(ranges, "2026-07-28", "2026-07-30")).toEqual([96]);
  });
});

describe("isSnapshotUnavailable", () => {
  it("reconoce el bucket caído por DNS, por fetch y por DuckDB, y nada más", async () => {
    const { isSnapshotUnavailable, SnapshotUnavailable } = await import("../src/snapshot");
    expect(isSnapshotUnavailable(new SnapshotUnavailable("x"))).toBe(true);
    expect(isSnapshotUnavailable(new TypeError("fetch failed"))).toBe(true);
    expect(isSnapshotUnavailable(new Error("getaddrinfo ENOTFOUND data.deadlock-api.com"))).toBe(true);
    expect(isSnapshotUnavailable(new Error("IO Error: Could not establish connection error for HTTP HEAD"))).toBe(true);
    expect(isSnapshotUnavailable(new Error("Binder Error: column tier not found"))).toBe(false);
    expect(isSnapshotUnavailable(new Error("ETag on reading file changed"))).toBe(false);
  });
});

describe("el lake: la fuente de cada partición", () => {
  it("sin manifiesto, arma una lectura simbólica que los tests de forma pueden inspeccionar", async () => {
    const { partitionSource, EXTRAS } = await import("../src/snapshot");
    expect(partitionSource(96)).toContain("read_parquet(");
    expect(partitionSource(96)).toContain("union_by_name=true");
    expect(partitionSource(EXTRAS)).toContain("read_parquet(");
  });
});

describe("el lake: lo que una base ya consolidó no se lee dos veces", () => {
  const files: ManifestFile[] = [
          { key: "b106", kind: "base", generation: 1, partition: 106, hi: 200, rows: 1, bytes: 1, built_at: "" },
          { key: "b107", kind: "base", generation: 1, partition: 107, hi: 300, rows: 1, bytes: 1, built_at: "" },
          // Todo consolidado: 106 y 107 ya llegan hasta 200.
          { key: "d1", kind: "delta", generation: 1, hi: 200, rows_by_partition: { "106": 5, "107": 9 }, rows: 14, bytes: 1, built_at: "" },
          // Sólo 107 llega hasta 300: de este archivo se leen las filas de 106.
          { key: "d2", kind: "delta", generation: 1, hi: 300, rows_by_partition: { "106": 4, "107": 8 }, rows: 12, bytes: 1, built_at: "" },
          // Más nuevo que todas las bases: se lee entero.
          { key: "d3", kind: "delta", generation: 1, hi: 400, rows_by_partition: { "107": 7 }, rows: 7, bytes: 1, built_at: "" },
          // Un residual viejo de una partición sin base reconstruida: entra.
          { key: "r1", kind: "residual", generation: 1, hi: 150, rows_by_partition: { "69": 3 }, rows: 3, bytes: 1, built_at: "" },
          // De otra generación: afuera.
          { key: "d0", kind: "delta", generation: 0, hi: 500, rows_by_partition: { "107": 1 }, rows: 1, bytes: 1, built_at: "" },
  ];
  const manifest = { public_url: "https://lake/", tables: { match_player: { generation: 1, files } } };

  it("descarta los archivos consolidados y marca las particiones ya consolidadas de los demás", async () => {
    const { lakeFrom } = await import("../src/snapshot");
    const { extras } = lakeFrom(manifest);
    expect(extras).toEqual([
      { url: "https://lake/d2", covered: [107] },
      { url: "https://lake/d3", covered: [] },
      { url: "https://lake/r1", covered: [] },
    ]);
  });

  it("el SQL filtra por archivo y partición, y saca la columna del nombre", async () => {
    const { lakeFrom, extrasSource } = await import("../src/snapshot");
    const sql = extrasSource(lakeFrom(manifest).extras);
    expect(sql).toContain("filename=true");
    expect(sql).toContain("exclude (filename)");
    expect(sql).toContain("(filename = 'https://lake/d2' and match_id // 1000000 in (107))");
    expect(sql).not.toContain("d1");
  });

  it("sin nada consolidado no agrega filtro", async () => {
    const { extrasSource } = await import("../src/snapshot");
    expect(extrasSource([{ url: "u", covered: [] }])).not.toContain("where");
  });
});
