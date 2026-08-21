import { fileURLToPath } from "node:url";
import { loadLobbies, isComparable, countMatches, type LobbyRecord } from "./store";
import { loadLobbiesFromPg, newestPatchFromPg } from "./pgStore";
import { d1Fetcher } from "./d1";
import { aggregateComps, aggregateFromSummaries } from "./aggregate/group";
import { aggregateUnits, type UnitStat } from "./aggregate/units";
import { aggregateItems, type ItemStat } from "./aggregate/items";
import { calibrate, type Calibration } from "./aggregate/calibrate";
import { tierComps, estimateShrinkage } from "./aggregate/tier";
import { aggregateHabits } from "./aggregate/habits";
import { writeComps, writeUnits, writeItems, writeHabits, type BandHabits } from "./output";
import { BANDS, BAND_LADDER, EXCLUSIVE, bandCovers, bandPath, type RankBand } from "./bands";
import { patchOf, patchLabel, newestPatch } from "./patch";
import { publishedSet, setFromEnv } from "./sets";
import { archivedSetNumbers } from "./setsArchive";
import { type BandSummary } from "./summaryStore";
import { r2Client, r2Config } from "./r2Archive";
import { listKeysFromR2, getObjectFromR2, loadBandSummariesForSet, newestPatchFromR2 } from "./r2Summary";
import { readFileSync, existsSync } from "node:fs";
import type { Participant } from "./aggregate/signature";

const MIN_COUNT = Number(process.env.MIN_COUNT ?? "20");
/** A champion needs this many boards before its per-star split means anything. */
const MIN_UNIT_GAMES = Number(process.env.MIN_UNIT_GAMES ?? "30");
/** An item needs this many boards before its carrier list is stable. */
const MIN_ITEM_GAMES = Number(process.env.MIN_ITEM_GAMES ?? "40");
/**
 * How many comps the tier list carries. A long tail of near-identical comps
 * reads as choice but is noise: the top of the list is where the boards are.
 */
const MAX_COMPS = Number(process.env.MAX_COMPS ?? "50");
/**
 * Boards a band needs before its list is worth publishing.
 *
 * Not an invented round number: a comp needs MIN_COUNT boards to exist at all,
 * so 2.000 is where the smallest comp we will show is about 1% of the sample
 * rather than noise. Below it the band publishes nothing and says so, which is
 * the only honest option once the meta is cut to a single patch — the
 * alternative is serving April's game under this patch's heading.
 */
const MIN_BAND_BOARDS = Number(process.env.MIN_BAND_BOARDS ?? "2000");
/**
 * Piso para publicar un parche recién salido.
 *
 * Muy por debajo de MIN_BAND_BOARDS y a propósito. La razón para aceptar una muestra
 * fina no es que algo sea mejor que nada: es que la alternativa —el meta del parche
 * anterior— está equivocada. Entre 16.13 y 16.14, 14 de las 30 comps presentes en los
 * dos cambiaron de letra. Por eso aplica SOLO al parche más nuevo: una banda que es
 * fina siempre, como silver-below, sigue publicando vacío y explicando por qué.
 *
 * 500 es el mismo piso que MIN_HABIT_BOARDS, que ya se justificó midiendo: es donde
 * una tasa deja de moverse con un puñado de partidas.
 */
const PROVISIONAL_BAND_BOARDS = Number(process.env.PROVISIONAL_BAND_BOARDS ?? "500");

/**
 * Si esta corrida tiene permitido publicar bandas provisionales.
 *
 * Dos condiciones, las dos necesarias: se está construyendo el parche más
 * nuevo de verdad (no uno pedido a mano), Y ninguna banda de ese parche llegó
 * todavía a MIN_BAND_BOARDS. La segunda es la que expresa "recién empezó el
 * parche" sin inventar una constante nueva — apenas alguna banda junta 2.000
 * tableros la transición terminó para todas, incluida la que sigue por debajo:
 * eso es lo que evita que una banda fina siempre, como silver-below, quede
 * marcada "provisional" el resto de la vida del parche.
 */
export function provisionalAllowed(isNewestPatch: boolean, bandBoards: number[]): boolean {
  return isNewestPatch && bandBoards.every((boards) => boards < MIN_BAND_BOARDS);
}

// El parámetro NO se llama `provisionalAllowed`: ese nombre ya es la función de
// arriba que lo resuelve, y taparla adentro de bandOutcome es pedirle un bug al
// próximo que edite acá. Este parámetro es el permiso YA resuelto, no la razón.
export function bandOutcome(
  boards: number,
  canPublishProvisional: boolean
): "full" | "provisional" | "empty" {
  if (boards >= MIN_BAND_BOARDS) return "full";
  if (canPublishProvisional && boards >= PROVISIONAL_BAND_BOARDS) return "provisional";
  return "empty";
}
/**
 * Boards a band needs before its habits are worth publishing.
 *
 * Far below MIN_BAND_BOARDS on purpose. A tier list needs fifty comps each
 * resting on their own boards; a habit is a single rate, and Silver's ~1,000
 * boards give about +/-1.5% on a 33% rate. So the coach speaks to a band whose
 * tier list is empty, which is the whole reason the bands were split.
 */
const MIN_HABIT_BOARDS = Number(process.env.MIN_HABIT_BOARDS ?? "500");
const STORE = "../data/matches";
const OUT = "../data/comps.json";
const UNITS_OUT = "../data/units.json";
const ITEMS_OUT = "../data/items.json";
const HABITS_OUT = "../data/habits.json";
const CATALOG = "../data/catalog.json";

// Exported so summarize-run.ts can reuse the exact same catalog and item
// filter instead of copying them: those two things must never drift apart, or
// the summary counters and the disk/pg build would silently disagree about
// what counts as an item (see the comment on knownItemFilter below, and the
// one on rowsFor in summarize-run.ts).
export interface Catalog {
  champions: Record<string, { cost: number }>;
  items: Record<string, { composition: string[] }>;
}

export function loadCatalog(): Catalog | null {
  if (!existsSync(CATALOG)) {
    console.warn(`no catalog at ${CATALOG} — costs and item filtering will be inert`);
    return null;
  }
  return JSON.parse(readFileSync(CATALOG, "utf-8")) as Catalog;
}

// Champion costs tell a 1-cost reroll from a 3-cost one.
function costLookup(catalog: Catalog | null): (id: string) => number {
  return (id: string) => catalog?.champions[id]?.cost ?? 0;
}

// A player builds items with two components; components and one-off units have
// none. Without a catalog nothing is craftable, so the items file stays empty
// rather than filling with raw components.
function craftableFilter(catalog: Catalog | null): (id: string) => boolean {
  return (id: string) => (catalog?.items[id]?.composition?.length ?? 0) === 2;
}

// What a comp is allowed to show as an item: anything the catalog can name and
// draw. This keeps completed items, components, emblems and artifacts — and
// drops Riot's placeholders (TFT_Item_EmptyBag) and stray items from old sets,
// which have no catalog entry and rendered as a nameless, imageless chip.
// With no catalog, keep everything rather than blank the whole display.
//
// Exported so summarize-run.ts calls this SAME function instead of writing its
// own copy — see the comment on rowsFor there for why the two filters must be
// identical, and why summarize-run.ts (unlike this file) refuses to run at all
// without a catalog rather than falling back to "keep everything".
export function knownItemFilter(catalog: Catalog | null): (id: string) => boolean {
  return (id: string) => (catalog ? id in catalog.items : true);
}

/**
 * De qué set habla lo que este build publica.
 *
 * `publishedSet` y NO `currentSet`: el día que abre un set nuevo, el sitio tiene
 * que seguir mostrando el viejo hasta que se lo congele a mano. Publicar el set
 * nuevo desde su primer minuto dejaría las cinco bandas vacías durante horas,
 * porque todavía no hay ni una partida suya. Ver el comentario de los dos
 * relojes en sets.ts.
 *
 * `TFT_SET` sigue funcionando como override para reconstruir un set archivado.
 */
const SET = setFromEnv(process.env.TFT_SET) ?? publishedSet(archivedSetNumbers());

/**
 *   npm run build:comps                          — todas las bandas, parche vigente
 *   npm run build:comps -- diamond-emerald       — una banda
 *   npm run build:comps -- 16.13                 — un parche archivado
 *   npm run build:comps -- --from=pg             — leyendo de Postgres, no del disco
 *   npm run build:comps -- --from=summary        — leyendo el resumen, sin partidas crudas
 */
export function parseArgs(
  argv: string[]
): { patch: string; band: string; source: "disk" | "pg" | "summary" } {
  const args = argv.map((a) => a.trim().toLowerCase()).filter(Boolean);
  const flags = args.filter((a) => a.startsWith("-"));
  const plain = args.filter((a) => !a.startsWith("-"));
  return {
    patch: plain.find((a) => /^\d+\.\d+$/.test(a)) ?? "",
    band: plain.find((a) => !/^\d+\.\d+$/.test(a)) ?? "",
    source: flags.includes("--from=summary") ? "summary" : flags.includes("--from=pg") ? "pg" : "disk",
  };
}

const { patch: requestedPatch, band: requested, source } = parseArgs(process.argv.slice(2));
const targets = requested ? BANDS.filter((b) => b.id === requested) : BANDS;

/**
 * Todo lo que unit.json, items.json, `calibration` y `habits` necesitan de
 * tableros crudos agrupados por lobby — la mitad de buildBand que NUNCA sale
 * de un contador por firma, porque mide la mesa entera (qué llevó cada
 * asiento, quién contestó a quién). Separada de buildBand para que
 * mainFromSummary (--from=summary) pueda pedir exactamente esto sobre la
 * ventana móvil de partidas crudas, sin duplicar la lógica ni recalcular
 * comps desde tableros — esas SÍ salen del resumen ahí (ver el comentario
 * grande de mainFromSummary sobre por qué las dos cosas usan muestras
 * distintas a propósito).
 *
 * El umbral (MIN_BAND_BOARDS / MIN_HABIT_BOARDS) se aplica con la muestra de
 * ESTOS lobbies — nunca con la del resumen, que mide otra cosa. Los hábitos
 * se miden ANTES del portón de MIN_BAND_BOARDS, igual que antes de este
 * refactor: una banda demasiado fina para cincuenta comps puede seguir
 * siendo suficiente para una tasa.
 */
export function buildBandExtras(
  band: RankBand,
  lobbies: LobbyRecord[],
  catalog: Catalog | null,
  canPublishProvisional: boolean
): {
  boards: Participant[];
  outcome: "full" | "provisional" | "empty";
  provisional: boolean;
  units: UnitStat[];
  items: ItemStat[];
  calibration: Calibration | undefined;
  habits: BandHabits | null;
} {
  const grouped = lobbies.map((l) => l.boards);
  const boards = grouped.flat();
  const label = band.id.padEnd(16);
  const costOf = costLookup(catalog);

  const habits: BandHabits | null =
    boards.length >= MIN_HABIT_BOARDS
      ? {
          boards: boards.length,
          matches: lobbies.length,
          habits: aggregateHabits(grouped, costOf),
        }
      : null;
  if (habits) {
    const shown = Object.entries(habits.habits)
      .map(([id, s]) => `${id} ${(s.rate * 100).toFixed(1)}%`)
      .join("  ");
    console.log(`${label} habits: ${shown}`);
  } else {
    console.warn(
      `${label} ${String(boards.length).padStart(6)} boards — under ${MIN_HABIT_BOARDS}, ` +
        `no habits published either`
    );
  }

  const outcome = bandOutcome(boards.length, canPublishProvisional);
  if (outcome === "empty") {
    return { boards, outcome, provisional: false, units: [], items: [], calibration: undefined, habits };
  }

  const calibration = calibrate(grouped);
  const units = aggregateUnits(boards, MIN_UNIT_GAMES, costOf);
  const items = aggregateItems(boards, MIN_ITEM_GAMES, craftableFilter(catalog));

  return { boards, outcome, provisional: outcome === "provisional", units, items, calibration, habits };
}

/** Calibration needs boards grouped by lobby: being contested is a fact about a table. */
function buildBand(
  band: RankBand,
  lobbies: LobbyRecord[],
  catalog: Catalog | null,
  now: string,
  patch: string,
  canPublishProvisional: boolean
): BandHabits | null {
  const label = band.id.padEnd(16);
  const costOf = costLookup(catalog);
  const extras = buildBandExtras(band, lobbies, catalog, canPublishProvisional);
  const meta = {
    generatedAt: now,
    patch,
    patchLabel: patchLabel(SET, patch),
    band: band.id,
    sampleSize: extras.boards.length,
  };

  // A band without enough of this patch behind it publishes an empty file rather
  // than a stale list. The file still exists so the site never 404s on a band,
  // and it fills itself in as the puller brings more of this patch in.
  if (extras.outcome === "empty") {
    const thin = { ...meta, insufficient: true as const };
    writeComps(bandPath(OUT, band.id), { ...thin, comps: [] });
    writeUnits(bandPath(UNITS_OUT, band.id), { ...thin, units: [] });
    writeItems(bandPath(ITEMS_OUT, band.id), { ...thin, items: [] });
    console.warn(
      `${label} ${String(extras.boards.length).padStart(6)} boards — under ${MIN_BAND_BOARDS}, ` +
        `published empty (needs more of patch ${patch})`
    );
    return extras.habits;
  }
  if (extras.provisional) {
    console.warn(
      `${label} ${String(extras.boards.length).padStart(6)} boards — provisional: patch ${patch} ` +
        `is new and this is under ${MIN_BAND_BOARDS}`
    );
  }

  // The shrinkage strength is estimated from this band's own comps, not fixed.
  const raw = aggregateComps(extras.boards, MIN_COUNT, costOf, MAX_COMPS, knownItemFilter(catalog));
  const confidence = estimateShrinkage(raw);
  const comps = tierComps(raw, confidence);

  writeComps(bandPath(OUT, band.id), {
    ...meta,
    provisional: extras.provisional,
    calibration: extras.calibration!,
    comps,
  });
  writeUnits(bandPath(UNITS_OUT, band.id), { ...meta, provisional: extras.provisional, units: extras.units });
  writeItems(bandPath(ITEMS_OUT, band.id), { ...meta, provisional: extras.provisional, items: extras.items });

  console.log(
    `${label} ${String(lobbies.length).padStart(5)} matches  ` +
      `${String(extras.boards.length).padStart(6)} boards  →  ` +
      `${String(comps.length).padStart(2)} comps, ${extras.units.length} units, ${extras.items.length} items  ` +
      `(shrink C=${confidence.toFixed(0)}, contest ${extras.calibration!.contest.placementCost}, ` +
      `carry short ${(extras.calibration!.carryItems.shortRate * 100).toFixed(1)}%)`
  );

  if (comps.length === 0) {
    console.warn(`${label} produced no comp above ${MIN_COUNT} boards — the band is too thin`);
  }

  return extras.habits;
}

/**
 * Si el resumen no tiene NADA para (banda, parche), --from=summary no puede
 * seguir: escribir `comps: []` acá pisaría una tier list buena ya publicada
 * con una vacía, y la causa casi segura no es "no hay datos" (esa banda YA
 * tiene MIN_BAND_BOARDS/PROVISIONAL_BAND_BOARDS para decidir eso con datos
 * reales, publicando vacío y explicando por qué) sino que `summarize` todavía
 * no corrió para este parche, o corrió antes de que existieran estas tablas.
 * Fallar ruidosamente en vez de degradar en silencio.
 */
export function assertSummaryHasBoards(
  bandId: string,
  patch: string,
  totalBoards: number,
  patchHasAnyBoards = false
): void {
  // Una banda vacía significa dos cosas distintas y sólo una es un error.
  //
  // Si NINGUNA banda del parche tiene nada, el resumidor no corrió: eso es el
  // problema que esta guarda existe para gritar. Pero si otra banda sí tiene
  // tableros, el resumidor corrió perfecto y esta banda simplemente todavía no
  // vio ninguna partida — que es exactamente lo que pasa **las primeras horas de
  // un parche nuevo**, cuando las partidas entran de a poco y las bandas bajas
  // tardan más en aparecer.
  //
  // Sin esta distinción, cada cambio de parche bloquea la publicación entera
  // hasta que las cinco bandas junten algo. Pasó de verdad con 16.15 el
  // 2026-07-29: `diamond-emerald` en cero mientras apex y global ya tenían 96
  // tableros, y el sitio dejó de publicar. Una banda genuinamente vacía publica
  // vacío y explica por qué, que es lo que ya hace el resto del build.
  if (totalBoards === 0 && !patchHasAnyBoards) {
    throw new Error(
      `${bandId}: el resumen no tiene ninguna partida contabilizada para el parche ${patch} — ` +
        "publicar comps vacías pisaría la tier list ya publicada. Correr `npm run summarize` " +
        "primero (o revisar --reset-summary si se sospecha que el resumen de este parche está mal)."
    );
  }
}

/**
 * El camino `--from=summary`: publica el sitio ENTERO en una sola corrida —
 * comps.json, units.json, items.json, habits.json y el bloque `calibration`
 * de comps.json — sin leer una sola partida cruda para las comps, pero SÍ
 * leyéndolas para esas otras cuatro.
 *
 * Por qué esas cuatro no salen del resumen: miden la mesa entera (qué ítems
 * llevó cada asiento del lobby, quién contestó a quién), no son contadores
 * por firma, y el resumen no las guarda — ver el comentario grande de
 * RAW_RETENTION_MATCHES en summarize-run.ts. Salen de las partidas crudas de la
 * ventana móvil, leídas de Postgres con `loadLobbiesFromPg` — EXACTAMENTE la
 * misma función que usa `--from=pg` — y medidas con `buildBandExtras`, la
 * MISMA función que usa el camino de disco/pg (ver buildBand arriba): no hay
 * una segunda copia de aggregateUnits/aggregateItems/aggregateHabits/
 * calibrate para este camino. La ventana en sí no es un filtro que este
 * archivo tenga que aplicar: `matches` en Postgres YA está acotada a eso,
 * porque summarize-run.ts borra la cruda ya resumida más vieja que
 * RAW_RETENTION_MATCHES — leer "lo que hay" es leer la ventana.
 *
 * Las dos fuentes tienen MUESTRAS DISTINTAS, a propósito — no es un bug: las
 * comps se apoyan en TODO lo acumulado en el resumen desde que existe
 * (histórico, crece para siempre y es lo que sostiene la tier list sin
 * partidas crudas), mientras que units/items/habits/calibration se apoyan
 * sólo en la ventana móvil que Postgres todavía conserva. Que dos archivos
 * publicados el mismo día midan sobre `sampleSize` distintos es correcto:
 * cada uno mide lo único que puede medir con lo que tiene. Los umbrales
 * (MIN_BAND_BOARDS, MIN_HABIT_BOARDS) se aplican, en cada caso, a la muestra
 * que corresponde — la del resumen para las comps, la de la ventana para las
 * otras cuatro — nunca cruzados entre sí.
 *
 * Si el resumen no tiene NADA para una banda y este parche, esta función
 * falla en vez de publicar `comps: []` encima de una tier list buena — ver
 * assertSummaryHasBoards. Eso es distinto de una banda genuinamente fina bajo
 * MIN_BAND_BOARDS (con datos reales, aunque pocos), que sigue publicando
 * vacío y explicando por qué, igual que el camino de disco/pg.
 */
async function mainFromSummary(): Promise<void> {
  if (requested && targets.length === 0) {
    console.error(`unknown band "${requested}". Known: ${BANDS.map((b) => b.id).join(", ")}`);
    process.exit(1);
  }

  const fetchRows = d1Fetcher();

  // El resumen se lee de R2, no de Postgres. Las partidas crudas de la ventana
  // (más abajo) siguen saliendo de Postgres: son dos fuentes distintas porque
  // son dos cosas distintas — contadores históricos contra tableros recientes.
  const r2 = r2Client(r2Config());
  const listKeys = listKeysFromR2(r2);
  const getObject = getObjectFromR2(r2);

  const newestAtSource = await newestPatchFromR2(listKeys);
  const patch = requestedPatch || newestAtSource;
  if (!patch) {
    console.error("no hay nada resumido todavía — correr summarize primero, o pasar un parche");
    process.exit(1);
  }

  const catalog = loadCatalog();
  const now = new Date().toISOString();
  const costOf = costLookup(catalog);
  const keepItem = knownItemFilter(catalog);

  console.log(`building from the summary tables — patch ${patch} (${patchLabel(SET, patch)})`);

  // Comps: el resumen del SET entero, no del parche.
  //
  // El corte por parche se midió y era real —entre 16.13 y 16.14, 14 de 30 comps
  // compartidas cambian de letra— pero costaba más de lo que valía: cada parche
  // nuevo dejaba la tier list VACÍA en las cinco bandas hasta juntar muestra, o
  // sea un día de sitio inútil cada dos semanas. Decisión de ZoTaD el
  // 2026-07-29: sólo separar por set, que es donde el juego cambia de verdad.
  //
  // Las cinco bandas de una sola bajada de R2, que acá no es un detalle: son los
  // mismos objetos para las cinco.
  const byBand = await loadBandSummariesForSet(
    listKeys,
    getObject,
    BANDS.map((b) => b.id),
    SET,
    keepItem
  );
  const summaryBoardCounts = EXCLUSIVE.map((band) => byBand.get(band.id)!.totalBoards);
  const canPublishProvisionalSummary = provisionalAllowed(patch === newestAtSource, summaryBoardCounts);

  // Las otras cuatro: la ventana móvil de partidas crudas, leída de D1 igual que
  // --from=pg (misma query, mismo filtro de comparabilidad) — una sola vez para
  // las cinco bandas, después repartida por banda con bandCovers. matchesQuery ya
  // filtra por set y cola rankeada en el servidor; isComparable acá abajo agrega
  // el chequeo de "al menos 2 tableros" que el servidor no puede hacer.
  //
  // **Sin parche** (`""`), igual que las comps: filtrar la ventana por el parche
  // vigente dejaba units, items, habits y la calibración en cero cada vez que
  // salía uno nuevo, que es la misma falla que este cambio vino a arreglar. El
  // set sigue filtrando, que es el corte que importa.
  const rawAll = await loadLobbiesFromPg(fetchRows, SET, "");
  const rawUsable = rawAll.filter((l) => isComparable(l, SET));
  const rawByBand = new Map(
    BANDS.map((band) => [band.id, rawUsable.filter((l) => bandCovers(band.id, l.tier))])
  );
  const windowBoardCounts = EXCLUSIVE.map(
    (band) => rawByBand.get(band.id)!.flatMap((l) => l.boards).length
  );
  const canPublishProvisionalWindow = provisionalAllowed(patch === newestAtSource, windowBoardCounts);

  console.log(
    `raw window for units/items/habits/calibration: ${rawUsable.length} matches, ` +
      `${rawUsable.flatMap((l) => l.boards).length} boards (patch ${patch}, whatever Postgres still retains)`
  );

  // Si CUALQUIER banda tiene tableros de este parche, el resumidor corrió y las
  // bandas en cero son bandas finas, no un pipeline roto. Ver assertSummaryHasBoards.
  const patchHasAnyBoards = BANDS.some((b) => (byBand.get(b.id)?.totalBoards ?? 0) > 0);

  const measured: Record<string, BandHabits> = {};
  for (const band of targets) {
    const label = band.id.padEnd(16);
    const { summaries, totalBoards } = byBand.get(band.id)!;
    assertSummaryHasBoards(band.id, patch, totalBoards, patchHasAnyBoards);

    const windowLobbies = rawByBand.get(band.id) ?? [];
    const extras = buildBandExtras(band, windowLobbies, catalog, canPublishProvisionalWindow);

    const compsMeta = {
      generatedAt: now,
      patch,
      patchLabel: patchLabel(SET, patch),
      band: band.id,
      sampleSize: totalBoards,
    };
    const extrasMeta = {
      generatedAt: now,
      patch,
      patchLabel: patchLabel(SET, patch),
      band: band.id,
      sampleSize: extras.boards.length,
    };

    // comps.json: siempre del resumen, nunca de la ventana.
    const compsOutcome = bandOutcome(totalBoards, canPublishProvisionalSummary);
    let compsCount = 0;
    if (compsOutcome === "empty") {
      writeComps(bandPath(OUT, band.id), { ...compsMeta, insufficient: true, comps: [] });
      console.warn(
        `${label} ${String(totalBoards).padStart(6)} summary boards — under ${MIN_BAND_BOARDS}, ` +
          `comps published empty (needs more of patch ${patch})`
      );
    } else {
      if (compsOutcome === "provisional") {
        console.warn(
          `${label} ${String(totalBoards).padStart(6)} summary boards — comps provisional: patch ` +
            `${patch} is new and this is under ${MIN_BAND_BOARDS}`
        );
      }
      const raw = aggregateFromSummaries(summaries, totalBoards, MIN_COUNT, costOf, MAX_COMPS, keepItem);
      const confidence = estimateShrinkage(raw);
      const comps = tierComps(raw, confidence);
      compsCount = comps.length;
      writeComps(bandPath(OUT, band.id), {
        ...compsMeta,
        provisional: compsOutcome === "provisional",
        // calibration mide la ventana, no el resumen (ver el comentario
        // grande de esta función): puede faltar si la ventana está vacía
        // para esta banda aunque el resumen tenga de sobra, y eso es
        // correcto — son dos muestras distintas, no la misma medida dos veces.
        ...(extras.calibration ? { calibration: extras.calibration } : {}),
        comps,
      });
    }

    // units.json / items.json: siempre de la ventana, nunca del resumen.
    if (extras.outcome === "empty") {
      const thinExtras = { ...extrasMeta, insufficient: true as const };
      writeUnits(bandPath(UNITS_OUT, band.id), { ...thinExtras, units: [] });
      writeItems(bandPath(ITEMS_OUT, band.id), { ...thinExtras, items: [] });
      console.warn(
        `${label} ${String(extras.boards.length).padStart(6)} window boards — under ${MIN_BAND_BOARDS}, ` +
          `units/items published empty (needs more of the raw window)`
      );
    } else {
      writeUnits(bandPath(UNITS_OUT, band.id), {
        ...extrasMeta,
        provisional: extras.provisional,
        units: extras.units,
      });
      writeItems(bandPath(ITEMS_OUT, band.id), {
        ...extrasMeta,
        provisional: extras.provisional,
        items: extras.items,
      });
    }

    if (extras.habits && BAND_LADDER.includes(band.id)) measured[band.id] = extras.habits;

    console.log(
      `${label} comps: ${totalBoards} summary boards → ${compsCount} comps  |  ` +
        `window: ${extras.boards.length} boards → ${extras.units.length} units, ${extras.items.length} items`
    );
  }

  // Escrito sólo en una corrida completa, igual que el camino de disco/pg:
  // reconstruir una sola banda dejaría afuera a las otras tres y apagaría el
  // coach para todo el mundo salvo esa banda.
  if (!requested) {
    writeHabits(HABITS_OUT, {
      generatedAt: now,
      patch,
      patchLabel: patchLabel(SET, patch),
      bands: measured,
    });
    console.log(`habits.json: ${Object.keys(measured).join(", ")}`);
  } else {
    console.log(`habits.json left alone: only the "${requested}" band was rebuilt`);
  }
}

async function main() {
  if (source === "summary") return mainFromSummary();

  if (requested && targets.length === 0) {
    console.error(`unknown band "${requested}". Known: ${BANDS.map((b) => b.id).join(", ")}`);
    process.exit(1);
  }

  let all: LobbyRecord[];
  // El parche más nuevo DEL ORIGEN, no recalculado sobre lo ya filtrado: sobre
  // Postgres `all` (y por lo tanto `inSet`) va a contener solo las partidas del
  // parche pedido, así que recalcular "el más nuevo" ahí siempre devolvería ese
  // mismo parche — incluido uno archivado. El valor real ya lo sabe
  // newestPatchFromPg, pedido ANTES de filtrar. En disco no hace falta: `inSet`
  // trae todos los parches, así que se calcula más abajo, una vez que existe.
  let newestAtSource: string;
  if (source === "pg") {
    // Un solo fetcher para las dos consultas, y la de versiones primero: pedir los
    // payloads de todos los parches serían ~300 MB para tirar el 80%.
    const fetchRows = d1Fetcher();
    newestAtSource = await newestPatchFromPg(fetchRows, SET);
    all = await loadLobbiesFromPg(fetchRows, SET, requestedPatch || newestAtSource);
  } else {
    all = loadLobbies(STORE);
    newestAtSource = ""; // se completa abajo, una vez que `inSet` existe
  }
  // Everything a searched player has played lands in the store, including
  // Double Up, PvE and older sets. None of it belongs in the meta.
  const inSet = all.filter((l) => isComparable(l, SET));
  console.log(
    source === "pg"
      ? `loaded ${inSet.length} usable matches from Postgres`
      : `loaded ${inSet.length} usable matches of ${countMatches(STORE)} on disk`
  );

  const dropped = all.length - inSet.length;
  if (dropped > 0) {
    const why = new Map<string, number>();
    for (const l of all) {
      if (isComparable(l, SET)) continue;
      const reason = l.set !== SET ? `set ${l.set}` : l.gameType;
      why.set(reason, (why.get(reason) ?? 0) + 1);
    }
    console.log(
      `skipped ${dropped} matches outside standard set ${SET}: ` +
        [...why.entries()].map(([k, n]) => `${k} (${n})`).join(", ")
    );
  }
  if (inSet.length === 0) {
    console.error("store is empty — run the pull script first");
    process.exit(1);
  }

  // En disco, a diferencia de Postgres, `inSet` todavía trae todos los parches:
  // el más nuevo del origen se lee directamente de acá.
  if (source === "disk") {
    newestAtSource = newestPatch(inSet.map((l) => patchOf(l.gameVersion)));
  }

  /**
   * One patch only. The meta moves between patches by more than most of the
   * differences this site reports: across 16.13 and 16.14, 14 of the 30 comps
   * present in both changed tier letter and the survivors moved 9.8 places on
   * average. Averaging them describes neither patch.
   */
  const patch = requestedPatch || newestAtSource;
  const usable = inSet.filter((l) => patchOf(l.gameVersion) === patch);
  const olderPatches = inSet.length - usable.length;
  console.log(
    `patch ${patch} (${patchLabel(SET, patch)}): ${usable.length} matches; ` +
      `${olderPatches} on earlier patches, kept on disk but not published`
  );
  if (usable.length === 0) {
    console.error(`no matches on patch ${patch} — pull first, or pass another patch`);
    process.exit(1);
  }

  const catalog = loadCatalog();
  const now = new Date().toISOString();

  // Las partidas de cada banda, ANTES de construir ninguna: decidir si esta
  // corrida puede publicar provisional depende de la forma del parche entero
  // (¿ya cruzó 2.000 alguna banda?), no de la banda que se esté construyendo en
  // el momento — así que hace falta conocerlas todas primero.
  const lobbiesByBand = new Map(
    BANDS.map((band) => [band.id, usable.filter((l) => bandCovers(band.id, l.tier))])
  );
  // EXCLUSIVE, no BANDS: "global" es la banda agregada, se solapa con las
  // demás a propósito y es, por eso mismo, la más grande — sería la primera en
  // cruzar MIN_BAND_BOARDS y le revocaría el permiso a todas las demás antes
  // de tiempo. bandOf ya se niega a mirarla por la misma razón (ver bands.ts).
  //
  // Esto reduce pero no elimina que una banda publique provisional y vuelva a
  // vacío antes de llegar a completa: una banda exclusiva grande (apex, por
  // ejemplo) puede cruzar el piso ella sola y revocarle el permiso a otra que
  // sigue por debajo. Eliminarlo del todo pide una regla por banda, que este
  // arreglo no toca.
  const bandBoardCounts = EXCLUSIVE.map(
    (band) => lobbiesByBand.get(band.id)!.flatMap((l) => l.boards).length
  );
  const canPublishProvisional = provisionalAllowed(patch === newestAtSource, bandBoardCounts);

  // Selected by coverage rather than by classification, because the default band
  // deliberately overlaps the others.
  const measured: Record<string, BandHabits> = {};
  for (const band of targets) {
    const lobbies = lobbiesByBand.get(band.id) ?? [];
    const habits = buildBand(band, lobbies, catalog, now, patch, canPublishProvisional);
    // Only the bands that partition the ladder: the coach compares one rung to
    // the next, and the overlapping default band sits on no rung.
    if (habits && BAND_LADDER.includes(band.id)) measured[band.id] = habits;
  }

  // Written only on a full run. Rebuilding a single band would otherwise drop
  // the other three from the file and blank the coach for everyone else.
  if (!requested) {
    writeHabits(HABITS_OUT, {
      generatedAt: now,
      patch,
      patchLabel: patchLabel(SET, patch),
      bands: measured,
    });
    console.log(`habits.json: ${Object.keys(measured).join(", ")}`);
  } else {
    console.log(`habits.json left alone: only the "${requested}" band was rebuilt`);
  }
}

// Guarded so importing this file for parseArgs (as buildArgs.test.ts
// does) doesn't also fire off a live build that overwrites the published data.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
