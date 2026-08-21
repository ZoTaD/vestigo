import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  BANDS, PREFERRED_BAND, MIN_FOR_DEFAULT, defaultBandFor, bandPath,
  type Band, type BandId,
} from "./bands";
import {
  connect,
  listPartitions,
  partitionRanges,
  partitionsCovering,
  windowSql,
  windowEnd,
  bandablePartitions,
  MAX_WINDOW_DAYS,
  retryingOnRewrite,
  PROVISIONAL_MATCHES,
} from "./snapshot";
import { fetchPatches, patchWindows, type Patch } from "./patches";

/**
 * La tier list de héroes de Deadlock, por banda de rango.
 *
 *   npm run build:heroes
 *
 * Lee el snapshot público donde está (ver snapshot.ts), agrega por su cuenta y
 * escribe un JSON por banda en `games/deadlock/data`. Lo que se publica son
 * **nuestros números**: del snapshot sale la partida cruda, nunca la lectura del
 * juego que hace quien lo publica.
 *
 * ---
 *
 * **La ventana arranca en el último parche, no hace quince días** (desde el
 * 2026-07-29). Medido sobre el parche del día anterior: Mirage pasó de 47,8% a
 * 43,2% y Haze de 53,7% a 49,1% de un día para el otro, y seis héroes se movieron
 * 2+ puntos. Una ventana a caballo de un parche promedia dos juegos distintos y
 * publica un número que no describe a ninguno.
 *
 * Eso trae de arrastre la sección de ganadores y perdedores: si ya hay que medir
 * los dos lados del corte para saber cuál usar, la comparación entre ellos sale
 * gratis. Por eso `trend` y "cuánto cambió con el parche" son **el mismo número**
 * — antes eran dos cosas distintas porque la ventana no sabía de parches.
 *
 * **Qué se publica y qué no.** Los ocho sitios de stats de Deadlock que existen
 * muestran winrate y pickrate, alguno con el conteo de partidas. Se cayeron tres
 * que no rankean un héroe —almas (mide el farmeo del jugador), KDA (mide quién lo
 * juega) y partidas (el pickrate sin normalizar)— y entraron dos que contestan
 * preguntas que nadie contesta con números: `skillGap` y `trend`.
 */

const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/heroes.json`;

/**
 * El historial de parches, que la pestaña "Parches" muestra como lista.
 *
 * **Se escribe desde acá y no desde un script propio porque este build ya tiene
 * la lista en la mano**: la baja para saber dónde cortar la ventana. Un segundo
 * script sería un segundo pedido a la misma API para el mismo dato.
 *
 * Doce y no las veinte que devuelve el feed: más atrás son parches de un juego
 * que ya no se parece al que se mide, y la lista dejaría de leerse de un vistazo.
 */
const PATCHES_OUT = `${OUT_DIR}/patches.json`;
const PATCHES_SHOWN = 12;

/** Debajo de esto un winrate se mueve con un puñado de partidas. */
const MIN_MATCHES = 200;

/**
 * La brecha y la tendencia son **restas de dos winrates**, así que arrastran el
 * ruido de los dos lados. Pedirles más muestra que a un winrate suelto no es
 * exceso de cuidado: con 200 partidas de cada lado, una diferencia de un punto es
 * indistinguible de cero, y publicarla como "sube" sería inventar una tendencia.
 */
const MIN_FOR_DELTA = 1000;

export interface HeroStat {
  heroId: number;
  /** Partidas de este héroe en la banda. No se muestra: es el denominador. */
  matches: number;
  /**
   * El winrate estimado: lo que midió, encogido hacia 50% según cuánta muestra
   * lo respalda. Es el número que ordena la lista y el que se muestra.
   */
  winRate: number;
  /** Lo que midió sin encoger. Publicado para poder auditar el encogimiento. */
  winRateRaw: number;
  /** Qué fracción de las partidas de la banda lo tuvieron en algún equipo. */
  pickRate: number;
  /**
   * Cuánto mejor rinde arriba que abajo, en puntos de winrate.
   *
   * Positivo = premia saber jugarlo. Negativo = rinde sin saber y deja de rendir
   * cuando el rival sí sabe. Es el mismo número en todas las bandas a propósito:
   * describe al héroe, no a la banda desde la que se lo mira.
   */
  skillGap?: number;
  /** Cuánto movió el parche su winrate, en puntos. */
  trend?: number;
  /** Winrate y uso antes del parche, para dibujar el "de → a" del cambio. */
  winRateBefore?: number;
  pickRateBefore?: number;
  /** True cuando el héroe no llega a `MIN_MATCHES` en esta banda. */
  thinData?: boolean;
}

export interface HeroesFile {
  generatedAt: string;
  band: string;
  /** El parche que describe esta medición. */
  patch: { date: string; title: string; link: string };
  /**
   * True cuando el parche es tan reciente que la muestra todavía es fina. La UI
   * lo dice en pantalla en vez de hacer pasar una lista de horas por asentada.
   */
  provisional?: boolean;
  /** Partidas distintas de la banda — el denominador del pickRate. */
  matches: number;
  /** Filas jugador-partida, que es sobre lo que se calcula todo lo demás. */
  boards: number;
  from: string;
  to: string;
  heroes: HeroStat[];
}

/** Redondeo estable, para que dos corridas del mismo dato den el mismo archivo. */
const r = (n: number, d = 4): number => Number(n.toFixed(d));

export interface RawRow {
  hero_id: number;
  matches: bigint;
  wins: bigint;
}

export interface Rate {
  wr: number;
  n: number;
}

/** Winrate por héroe de una consulta cruda, con su muestra. */
export function ratesFrom(rows: RawRow[]): Map<number, Rate> {
  return new Map(
    rows.map((row) => [row.hero_id, { wr: Number(row.wins) / Number(row.matches), n: Number(row.matches) }])
  );
}

/**
 * La diferencia de winrate entre dos mediciones del mismo héroe, en puntos.
 *
 * `undefined` —y no 0— cuando falta cualquiera de los dos lados o cuando alguno
 * no llega a `MIN_FOR_DELTA`. Cero significaría "no se movió", que es una
 * afirmación; la ausencia significa "no sé", que es la verdad.
 */
export function deltaPoints(a: Rate | undefined, b: Rate | undefined): number | undefined {
  if (!a || !b) return undefined;
  if (a.n < MIN_FOR_DELTA || b.n < MIN_FOR_DELTA) return undefined;
  return r((a.wr - b.wr) * 100, 1);
}

/**
 * El winrate "verdadero" de un héroe estimado con la evidencia que hay, en vez
 * del crudo.
 *
 * **Por qué hace falta.** La ventana arranca en el último parche, así que el día
 * que sale uno hay horas de partidas: medido, ±3,5 puntos al 95% por héroe, con
 * el top 8 entero cabiendo en 3,8 puntos. Ese orden es ruido — Vyper aparecía
 * tercero con 360 partidas, que es ±5,2. Publicarlo tal cual sería inventar una
 * tier list que se rebaraja sola todas las mañanas.
 *
 * **Por qué acá es más limpio que en TFT.** Allá `estimateShrinkage` tiene que
 * estimar hacia dónde encoger; acá el centro se **sabe**: en un juego de dos
 * equipos el winrate medio es 50% por construcción. Lo único que se estima es
 * cuánto encoger, y sale de los datos igual que en TFT (momentos): se compara lo
 * que varían los héroes entre sí contra lo que varía una medición por azar.
 *
 * `k` es el resultado en "partidas equivalentes": un héroe con `k` partidas queda
 * a mitad de camino entre lo que midió y 50%. Con muchas partidas el crudo casi
 * no se mueve, que es lo que tiene que pasar.
 */
export function shrinkageFrom(rates: Rate[]): number {
  const usables = rates.filter((r) => r.n > 0);
  if (usables.length < 2) return 0;

  const media = usables.reduce((a, r) => a + r.wr, 0) / usables.length;
  const observada = usables.reduce((a, r) => a + (r.wr - media) ** 2, 0) / usables.length;
  // Lo que una medición se mueve sola, por azar: p(1-p)/n promediado.
  const porAzar = usables.reduce((a, r) => a + (r.wr * (1 - r.wr)) / r.n, 0) / usables.length;
  // Lo que queda es la diferencia real entre héroes. Si el azar explica todo,
  // no hay señal que preservar y se encoge todo lo posible.
  const entreHeroes = observada - porAzar;
  if (entreHeroes <= 0) return Number.POSITIVE_INFINITY;
  return 0.25 / entreHeroes;
}

/** Aplica el encogimiento hacia 50%. Sin `k` (o con 0) devuelve el crudo. */
export function shrink(wr: number, n: number, k: number): number {
  if (!Number.isFinite(k)) return 0.5;
  if (k <= 0 || n <= 0) return wr;
  return (n * wr + k * 0.5) / (n + k);
}

export interface BandExtras {
  skillGap: Map<number, number | undefined>;
  before: Map<number, Rate>;
  /** Partidas distintas de la banda antes del parche, para el uso comparable. */
  matchesBefore: number;
}

/**
 * Arma el archivo de una banda.
 *
 * Separado de las consultas a propósito: es donde vive todo el criterio —qué se
 * marca como muestra fina, cómo se ordena— y es lo único que tiene sentido
 * probar sin red.
 */
export function heroesFileFrom(
  rows: RawRow[],
  band: Band,
  totals: { matches: number; boards: number; from: string; to: string },
  extra: BandExtras,
  patch: Patch,
  generatedAt: string
): HeroesFile {
  const ahora = ratesFrom(rows);
  // Cuánto encoger sale de esta misma banda: una banda flaca merece más
  // desconfianza que una gorda, y el número lo dice sola.
  const k = shrinkageFrom([...ahora.values()]);

  const heroes: HeroStat[] = rows
    .map((row) => {
      const matches = Number(row.matches);
      const skillGap = extra.skillGap.get(row.hero_id);
      const antes = extra.before.get(row.hero_id);
      const trend = deltaPoints(ahora.get(row.hero_id), antes);
      return {
        heroId: row.hero_id,
        matches,
        winRate: r(shrink(Number(row.wins) / matches, matches, k)),
        /** Lo que midió sin encoger, para quien quiera el número crudo. */
        winRateRaw: r(Number(row.wins) / matches),
        pickRate: r(matches / totals.matches),
        ...(skillGap === undefined ? {} : { skillGap }),
        // El "de → a" sólo se publica cuando el cambio es publicable: sin trend,
        // dos números sueltos invitarían a restarlos a ojo sin la guarda de
        // muestra que deltaPoints aplica.
        ...(trend === undefined
          ? {}
          : {
              trend,
              winRateBefore: r(antes!.wr),
              pickRateBefore: extra.matchesBefore > 0 ? r(antes!.n / extra.matchesBefore) : 0,
            }),
        ...(matches < MIN_MATCHES ? { thinData: true } : {}),
      };
    })
    .sort((a, b) => b.winRate - a.winRate || b.matches - a.matches);

  return {
    generatedAt,
    band: band.id,
    patch: { date: patch.date, title: patch.title, link: patch.link },
    ...(totals.matches < PROVISIONAL_MATCHES ? { provisional: true } : {}),
    matches: totals.matches,
    boards: totals.boards,
    from: totals.from,
    to: totals.to,
    heroes,
  };
}

/** La banda más alta y la más baja, que es entre las que se mide la brecha. */
const TOP_BAND: BandId = "phantom-above";
const BOTTOM_BAND: BandId = "arcanist-below";

async function main() {
  const [partitions, patches] = await Promise.all([listPartitions(), fetchPatches()]);
  const patch = patches[0];
  console.log(`último parche: ${patch.date} — ${patch.title}`);

  const con = await connect();
  const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjects();

  const ranges = await partitionRanges(con, partitions);
  const ahora = await windowEnd(con, ranges);

  const { after, before } = patchWindows(patch.date, ahora, MAX_WINDOW_DAYS);
  const partsAfter = await bandablePartitions(con, partitionsCovering(ranges, after.from, after.to));
  const partsBefore = await bandablePartitions(con, partitionsCovering(ranges, before.from, before.to));

  /**
   * La brecha se mide sobre los últimos quince días **sin mirar el parche**, y
   * eso es deliberado.
   *
   * Winrate y brecha son preguntas de velocidades distintas. El winrate es lo que
   * un parche mueve —para eso se corta la ventana ahí— pero "cuánto premia saber
   * jugar a este héroe" es una propiedad del diseño del personaje, y no cambia
   * porque le toquen un número. Medirla sobre el día que lleva el parche fue el
   * primer intento y dejó **7 héroes de 38 con muestra**: se perdía casi toda la
   * información por cuidar algo que no estaba en peligro.
   */
  const desde = new Date(ahora.getTime() - MAX_WINDOW_DAYS * 86_400_000).toISOString();
  const hasta = ahora.toISOString();
  const partsGap = await bandablePartitions(con, partitionsCovering(ranges, desde, hasta));
  if (partsAfter.length === 0) {
    throw new Error(
      `el snapshot no tiene ni una partición posterior al parche del ${patch.date}. ` +
        "O el parche es de hace minutos, o el snapshot dejó de actualizarse."
    );
  }
  console.log(`  después: ${partsAfter.join(", ")} | antes: ${partsBefore.join(", ") || "—"}`);

  const baseAfter = windowSql(partsAfter, after.from, after.to);
  const baseBefore = partsBefore.length > 0 ? windowSql(partsBefore, before.from, before.to) : null;

  const tiersOf = (id: BandId) => BANDS.find((b) => b.id === id)!.tiers.join(", ");
  const winrateSql = (from: string, tiers: string) => `
    select hero_id, count(*)::BIGINT as matches,
           sum(case when won then 1 else 0 end)::BIGINT as wins
    from (${from}) where tier in (${tiers}) group by hero_id`;
  const totalsSql = (from: string, tiers: string) => `
    select count(distinct match_id)::BIGINT as matches, count(*)::BIGINT as boards,
           strftime(min(start_time), '%Y-%m-%d') as "from",
           strftime(max(start_time), '%Y-%m-%d') as "to"
    from (${from}) where tier in (${tiers})`;

  // La brecha se mide una sola vez y viaja igual en las cuatro bandas: describe
  // al héroe, no a la banda desde la que se lo mira.
  const t0 = Date.now();
  const baseGap = windowSql(partsGap, desde, hasta);
  const arriba = ratesFrom((await rows(winrateSql(baseGap, tiersOf(TOP_BAND)))) as unknown as RawRow[]);
  const abajo = ratesFrom((await rows(winrateSql(baseGap, tiersOf(BOTTOM_BAND)))) as unknown as RawRow[]);
  const skillGap = new Map<number, number | undefined>();
  for (const id of arriba.keys()) skillGap.set(id, deltaPoints(arriba.get(id), abajo.get(id)));
  const conBrecha = [...skillGap.values()].filter((v) => v !== undefined).length;
  console.log(`  brecha: ${conBrecha} héroes con muestra en los dos extremos (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  mkdirSync(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();

  // El historial, para la pestaña de parches. Va acá porque la lista ya está
  // bajada; el archivo pesa ~2 KB.
  writeFileSync(
    PATCHES_OUT,
    JSON.stringify({ generatedAt, patches: patches.slice(0, PATCHES_SHOWN) })
  );

  // Se miden las cuatro y **después** se elige cuál va sin sufijo: la banda por
  // defecto sale de la muestra (ver `defaultBandFor`), así que no se puede saber
  // cuál es hasta tenerlas todas medidas.
  const medidas: { band: Band; file: HeroesFile; segundos: string }[] = [];
  for (const band of BANDS) {
    const tiers = band.tiers.join(", ");
    const t = Date.now();

    const [tot] = (await rows(totalsSql(baseAfter, tiers))) as unknown as {
      matches: bigint;
      boards: bigint;
      from: string;
      to: string;
    }[];
    const agg = (await rows(winrateSql(baseAfter, tiers))) as unknown as RawRow[];

    let before2 = new Map<number, Rate>();
    let matchesBefore = 0;
    if (baseBefore) {
      before2 = ratesFrom((await rows(winrateSql(baseBefore, tiers))) as unknown as RawRow[]);
      const [tb] = (await rows(totalsSql(baseBefore, tiers))) as unknown as { matches: bigint }[];
      matchesBefore = Number(tb.matches);
    }

    medidas.push({
      band,
      file: heroesFileFrom(
        agg,
        band,
        { matches: Number(tot.matches), boards: Number(tot.boards), from: tot.from, to: tot.to },
        { skillGap, before: before2, matchesBefore },
        patch,
        generatedAt
      ),
      segundos: ((Date.now() - t) / 1000).toFixed(1),
    });
  }

  const porBanda = Object.fromEntries(medidas.map((m) => [m.band.id, m.file.matches])) as Record<BandId, number>;
  const defecto = defaultBandFor(porBanda);

  for (const { band, file, segundos } of medidas) {
    writeFileSync(bandPath(OUT, band.id), JSON.stringify(file));
    // Y una copia sin sufijo de la que sea el defecto: es la que el bundle
    // importa estático, para que la primera pantalla no espere una descarga.
    if (band.id === defecto) writeFileSync(OUT, JSON.stringify(file));
    const conCambio = file.heroes.filter((h) => h.trend !== undefined).length;
    console.log(
      `  ${band.id.padEnd(20)} ${file.heroes.length} héroes (${conCambio} con cambio de parche), ` +
        `${file.matches.toLocaleString("es")} partidas${file.provisional ? " [PROVISIONAL]" : ""}, ` +
        `${file.from} → ${file.to} (${segundos}s)` +
        `${band.id === defecto ? "  [por defecto]" : ""}`
    );
  }
  if (defecto !== PREFERRED_BAND) {
    console.log(
      `  ⚠ el defecto es ${defecto} y no ${PREFERRED_BAND}: ` +
        `${porBanda[PREFERRED_BAND].toLocaleString("es")} partidas no llegan a las ${MIN_FOR_DEFAULT.toLocaleString("es")} que hacen falta.`
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // El snapshot se reescribe cada ~70 minutos y estas consultas duran
  // minutos: si la partición cambia en el medio, DuckDB aborta. Reintentar
  // es más honesto que desactivar el chequeo, que dejaría leer mitad de un
  // archivo y mitad de otro sin decir nada.
  retryingOnRewrite(main).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
