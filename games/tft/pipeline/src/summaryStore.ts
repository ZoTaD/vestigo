import { newestPatch } from "./patch";
import type { FetchRows } from "./pgStore";
import type {
  CompStatsRow,
  CompUnitStatsRow,
  CompUnitItemStatsRow,
  CompTraitStatsRow,
  CompItemStatsRow,
  BandStatsRow,
} from "./summarize-run";
import type { SignatureSummary, OutcomeCounts, ItemFilter } from "./aggregate/summary";

/**
 * Lee las seis tablas del resumen (ver 0006_comp_summary.sql, y summarize-run.ts,
 * que las escribe) y reconstruye lo que build.ts necesita para armar la tier list
 * SIN leer una sola partida cruda: un SignatureSummary por firma y el total de
 * tableros de la banda.
 *
 * Este archivo es el espejo exacto de summarize-run.ts: cada columna que ese
 * archivo escribe (ver compStatsRow y pushDetailRows ahí) se lee de vuelta acá al
 * mismo lugar del SignatureSummary de donde salió.
 */

export interface SummaryTables {
  compStats: CompStatsRow[];
  compUnitStats: CompUnitStatsRow[];
  compUnitItemStats: CompUnitItemStatsRow[];
  compTraitStats: CompTraitStatsRow[];
  compItemStats: CompItemStatsRow[];
  bandStats: BandStatsRow[];
}

function emptyOutcome(): OutcomeCounts {
  return { boards: 0, sumPlacement: 0, sumLevel: 0, sumGoldLeft: 0 };
}

function emptySignature(signature: string): SignatureSummary {
  return {
    signature,
    boards: 0,
    sumPlacement: 0,
    sumPlacementSq: 0,
    top4: 0,
    wins: 0,
    sumLevel: 0,
    winner: emptyOutcome(),
    loser: emptyOutcome(),
    units: {},
    traits: {},
    itemInstances: {},
  };
}

/**
 * Arma los SignatureSummary de una banda y un parche a partir de las seis tablas,
 * ya bajadas de Postgres.
 *
 * `comp_stats` lleva el día en la clave (una fila por firma Y día): se suma sobre
 * todos los días del parche para tener la comp completa, que es la regla de
 * granularidad del diseño (el día va solo ahí). Las cuatro tablas de detalle
 * (unidad, unidad-ítem, trait, ítem) NO llevan día — summarize-run.ts ya las
 * fusiona sobre todos los días de un lote antes de escribirlas (ver
 * pushDetailRows), y el upsert de la Action (summarize_batch) sigue sumando sobre
 * esa misma fila en cada corrida nueva — así que acá alcanza con una fila por
 * clave, sin volver a sumar por día.
 *
 * `keepItem` filtra ACÁ, no en aggregateFromSummaries: esa función ignora su
 * propio parámetro `keepItem` a propósito (ver el comentario en group.ts) porque
 * en el camino de tableros, summarize() ya filtró antes de que
 * aggregateFromSummaries viera los contadores. Acá no hay ningún summarize() de
 * por medio, así que este sigue siendo un lugar donde ese filtro puede
 * aplicarse.
 *
 * ACTUALIZACIÓN (Arreglo 3 de inc-task-6): summarize-run.ts YA filtra al
 * escribir — `rowsFor` recibe el mismo `keepItem` que build.ts y summarize()
 * lo aplica antes de que un solo contador llegue a las seis tablas (y
 * `main()` se niega a correr sin catálogo, ver `assertCatalogPresent` ahí).
 * Antes de ese fix, summarize-run.ts guardaba todo sin filtrar, y este
 * `keepItem` de acá era el ÚNICO lugar donde el filtro se aplicaba. Ese
 * comportamiento viejo sigue siendo la realidad de cualquier fila escrita
 * ANTES del fix — no se reescribe sola —, así que este filtro de lectura
 * sigue haciendo falta como red para esas filas viejas hasta que se
 * rehagan con `--reset-summary` (ver summarize-run.ts) o salgan de la
 * ventana móvil por su cuenta. Sobre filas ya escritas con el filtro nuevo,
 * aplicarlo acá otra vez es un no-op (el mismo catálogo, dos veces, no cambia
 * nada) — no hace daño, así que no vale la pena distinguir "fila vieja" de
 * "fila nueva" para saltearlo.
 *
 * Con eso hay un límite real para las filas viejas, medido contra el parche
 * vigente (16.14) antes del Arreglo 3, no hipotético: `sumItems` se recalcula
 * abajo a partir de las instancias YA filtradas de comp_unit_item_stats, y esa
 * cuenta es exacta — summarize() suma exactamente lo mismo, ítem por ítem,
 * filtro incluido. Pero `itemized` (¿tuvo esta unidad AL MENOS UN ítem que
 * pasó el filtro, en este tablero?) no se puede reconstruir con la misma
 * exactitud sobre filas viejas: la tabla guarda cuántos tableros tuvo cada
 * ítem por separado, no qué combinación de ítems tenía cada tablero, así que
 * no hay forma de deshacer la unión a partir de los márgenes. Se usa la
 * columna guardada tal cual, sin filtrar, y diverge de la cuenta exactamente
 * filtrada cada vez que el catálogo excluye un ítem que de verdad apareció en
 * una partida — no es un caso de laboratorio: catalog.ts descarta a propósito
 * todo ítem cuyo `apiName` no empiece con `TFT_Item_` ni `TFT{SET}_` ("CDragon
 * ships every item from every set ever... keep only what matters here"), y
 * eso incluye ítems Radiant, artefactos de Ornn y objetos Shimmerscale que un
 * augment del set vigente SÍ puede otorgar. Medido sobre comp_unit_item_stats
 * sin filtrar (banda global, parche 16.14): 46 de 178 item_id distintos
 * usados no están en el catálogo, ~1,6% de las instancias de ítem del parche.
 * La comparación resumen-vs-crudas de la Tarea 5 (ver inc-task-5-report.md)
 * confirma que esta era la ÚNICA fuente real de diferencia entre los dos
 * caminos — con el filtro de catálogo neutralizado en los dos lados,
 * comps.json salía bit a bit idéntico en las cinco bandas — y que, en un caso
 * raro, esa diferencia numérica en itemizedRate podía cruzar el umbral
 * CARRY_ITEMIZED (0.8) que decide `carries`, cambiando qué firmas crudas
 * terminan fusionadas en el mismo comp. El Arreglo 3 corrige esto para todo
 * lo que se resuma de ahora en más; ampliar catalog.ts para incluir esos
 * ítems (arreglaría también el itemizedRate que publica hoy el camino de
 * tableros) o extender el esquema para guardar la combinación de ítems por
 * tablero en vez de por ítem suelto quedan fuera de esta tarea igual.
 */
export function summariesFromTables(
  tables: SummaryTables,
  keepItem: ItemFilter = () => true
): SignatureSummary[] {
  const bySignature = new Map<string, SignatureSummary>();
  const get = (signature: string): SignatureSummary => {
    let s = bySignature.get(signature);
    if (!s) {
      s = emptySignature(signature);
      bySignature.set(signature, s);
    }
    return s;
  };

  // comp_stats: un día por fila. Sumar todos los días da la firma completa del
  // parche.
  for (const row of tables.compStats) {
    const s = get(row.signature);
    s.boards += row.boards;
    s.sumPlacement += row.sum_placement;
    s.sumPlacementSq += row.sum_placement_sq;
    s.top4 += row.top4;
    s.wins += row.wins;
    s.sumLevel += row.sum_level;
    s.winner.boards += row.winner_boards;
    s.winner.sumPlacement += row.winner_sum_placement;
    s.winner.sumLevel += row.winner_sum_level;
    s.winner.sumGoldLeft += row.winner_sum_gold;
    s.loser.boards += row.loser_boards;
    s.loser.sumPlacement += row.loser_sum_placement;
    s.loser.sumLevel += row.loser_sum_level;
    s.loser.sumGoldLeft += row.loser_sum_gold;
  }

  // comp_unit_stats: ya fusionada sobre los días, una fila por (firma, unidad).
  for (const row of tables.compUnitStats) {
    const s = get(row.signature);
    s.units[row.unit_id] = {
      boards: row.boards,
      sumStars: row.sum_stars,
      threeStar: row.three_star,
      // NO sale de row.sum_items: en filas escritas antes del Arreglo 3 esa
      // columna se guardó sin el filtro de catálogo (ver el comentario de la
      // función), así que se recalcula siempre abajo a partir de las
      // instancias ya filtradas de comp_unit_item_stats — exacto en los dos
      // casos, viejo o nuevo.
      sumItems: 0,
      itemized: row.itemized,
      winnerBoards: row.winner_boards,
      loserBoards: row.loser_boards,
      sumPlacement: row.sum_placement,
      items: {},
    };
  }

  // comp_unit_item_stats: acá se aplica keepItem. sumItems por unidad es la suma
  // de las instancias de los ítems que sobreviven al filtro — exactamente lo que
  // summarize() habría contado, porque summarize-run.ts guardó las instancias SIN
  // filtrar (con keepItem = siempre true), así que sumar solo las que pasan
  // reproduce el resultado bit a bit.
  for (const row of tables.compUnitItemStats) {
    if (!keepItem(row.item_id)) continue;
    const s = get(row.signature);
    const unit = s.units[row.unit_id];
    if (!unit) continue; // no debería pasar: toda fila de ítem tiene su fila de unidad
    unit.items[row.item_id] = {
      boards: row.boards,
      winnerBoards: row.winner_boards,
      instances: row.instances,
    };
    unit.sumItems += row.instances;
  }

  // comp_trait_stats: cada fila es un balde del histograma de numUnits, y
  // trait.boards es su suma — igual que summarize(), donde cada tablero
  // incrementa `boards` y su propio balde a la vez.
  for (const row of tables.compTraitStats) {
    const s = get(row.signature);
    const trait = s.traits[row.trait_id] ?? { boards: 0, units: {} };
    s.traits[row.trait_id] = trait;
    trait.units[row.num_units] = (trait.units[row.num_units] ?? 0) + row.boards;
    trait.boards += row.boards;
  }

  // comp_item_stats: prioridad de ítem del comp entero. Mismo filtro que arriba.
  for (const row of tables.compItemStats) {
    if (!keepItem(row.item_id)) continue;
    const s = get(row.signature);
    s.itemInstances[row.item_id] = (s.itemInstances[row.item_id] ?? 0) + row.instances;
  }

  return [...bySignature.values()];
}

/**
 * Cuántos tableros tuvo la banda en total, con firma o sin ella.
 *
 * NO sale de sumar los SignatureSummary reconstruidos: ese total excluye los
 * tableros sin firma (summarize() los descarta antes de contarlos), que sin
 * embargo son parte real del denominador de playRate. band_stats los cuenta
 * aparte precisamente para esto — sumar sus tableros por día da el total
 * correcto de la banda para el parche.
 */
export function totalBoardsFromRows(rows: BandStatsRow[]): number {
  return rows.reduce((sum, row) => sum + row.boards, 0);
}

/**
 * Lo que build.ts necesita de una banda y un parche. La interfaz sobrevivió al
 * cambio de fuente sin tocarse: quien la consume no se entera de si los números
 * salieron de seis tablas o de un objeto en R2.
 */
export interface BandSummary {
  summaries: SignatureSummary[];
  totalBoards: number;
}

// La lectura de estas seis tablas desde Postgres vivía acá y se fue con ellas
// (migración 0014): el resumen es un objeto en R2 y quien lo baja es r2Summary.ts.
// Lo que queda es lo que NO dependía de dónde venían las filas — reconstruir el
// SignatureSummary a partir de ellas — y por eso sobrevivió al cambio de fuente
// sin tocarse una línea.
