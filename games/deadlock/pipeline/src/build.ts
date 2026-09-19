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
  FROZEN_AFTER_H,
} from "./snapshot";
import { fetchPatches, patchWindows, prePatchWeight, type Patch } from "./patches";
import { fetchLiveCounts, type BandCounts } from "./liveStats";

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
 * **La ventana son los últimos quince días, y las partidas de antes del parche
 * pesan cada vez menos a medida que el parche nuevo junta muestra** (desde el
 * 2026-09-17, ver `prePatchWeight` y `blendRows`). Antes arrancaba en el
 * último parche (desde el 2026-07-29). Medido sobre el parche del día anterior: Mirage pasó de 47,8% a
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
  /**
   * True cuando la ventana incluye partidas de antes del parche: el parche es
   * nuevo y todavía no junta muestra, así que las partidas viejas entran con
   * un peso que se desvanece (ver `prePatchWeight`). La UI lo dice al lado de
   * la lista.
   */
  crossesPatch?: boolean;
  /**
   * Qué parte de la muestra medida es del parche nuevo, de 0 a 1. Sólo cuando
   * `crossesPatch`: es lo que la UI muestra como "las partidas del parche ya
   * pesan el 63%".
   */
  patchShare?: number;
  /**
   * De dónde salieron las partidas desde el parche. Falta cuando salieron del
   * snapshot, que es lo normal. `live` cuando el snapshot estaba congelado o
   * inaccesible y se pidieron a la API en vivo (ver `liveStats.ts`).
   */
  postSource?: "live";
  /** Hasta cuándo llegaba el snapshot cuando se congeló. Sólo con `postSource`. */
  snapshotUntil?: string;
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
  /** BigInt desde DuckDB; número cuando ya pasó por `blendRows`. */
  matches: bigint | number;
  wins: bigint | number;
}

/**
 * Las partidas de después del parche con las de antes, éstas pesadas por
 * `alpha` (ver `prePatchWeight`).
 *
 * Con `alpha` = 1 es la ventana entera con todo al mismo peso; con 0 son sólo
 * las de después. Entre medio, un héroe con 300 partidas nuevas y 3.000 viejas a
 * `alpha` = 0,5 se mide como 1.800, donde las nuevas son la sexta parte pero
 * cada una vale el doble. Las partidas se redondean para publicarse como
 * entero; las victorias se escalan con ellas para que el winrate no cambie.
 */
export function blendRows(post: RawRow[], pre: RawRow[], alpha: number): RawRow[] {
  const byHero = new Map<number, { n: number; w: number }>();
  const add = (rows: RawRow[], peso: number) => {
    for (const row of rows) {
      const cur = byHero.get(row.hero_id) ?? { n: 0, w: 0 };
      cur.n += Number(row.matches) * peso;
      cur.w += Number(row.wins) * peso;
      byHero.set(row.hero_id, cur);
    }
  };
  add(post, 1);
  if (alpha > 0) add(pre, alpha);
  return [...byHero.entries()]
    .filter(([, v]) => v.n > 0)
    .map(([hero_id, v]) => {
      const matches = Math.round(v.n);
      return { hero_id, matches, wins: (v.w / v.n) * matches };
    });
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
  /**
   * Las partidas desde el parche solas, para el "de → a". Sin esto el cambio
   * se medía sobre la mezcla, que recién salido el parche es casi toda partidas
   * viejas: comparaba "antes" contra "antes" y daba cero. Si falta, se usa lo
   * que se está publicando.
   */
  post?: Map<number, Rate>;
  /** Partidas distintas de la banda antes del parche, para el uso comparable. */
  matchesBefore: number;
  /** True si la ventana medida incluye partidas de antes del parche. */
  crossesPatch?: boolean;
  /** Ver `HeroesFile.patchShare`. */
  patchShare?: number;
  /**
   * Partidas de la banda desde el parche. Es lo que decide `provisional`: con
   * la mezcla, `totals.matches` está lleno desde el primer día y ya no dice
   * si el parche juntó muestra. Sin esto, se usa `totals.matches`.
   */
  postMatches?: number;
  postSource?: "live";
  snapshotUntil?: string;
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
      const trend = deltaPoints((extra.post ?? ahora).get(row.hero_id), antes);
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
    ...((extra.postMatches ?? totals.matches) < PROVISIONAL_MATCHES ? { provisional: true } : {}),
    ...(extra.crossesPatch ? { crossesPatch: true } : {}),
    ...(extra.crossesPatch && extra.patchShare !== undefined ? { patchShare: r(extra.patchShare, 3) } : {}),
    ...(extra.postSource ? { postSource: extra.postSource } : {}),
    ...(extra.postSource && extra.snapshotUntil ? { snapshotUntil: extra.snapshotUntil } : {}),
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

interface Window {
  from: string;
  to: string;
}

/**
 * De dónde salen las partidas.
 *
 * Dos fuentes con la misma pregunta —"por héroe, en esta ventana y esta banda,
 * cuántas partidas y cuántas victorias"— para que `main` elija por ventana y no
 * por corrida:
 *
 * - **El snapshot** (DuckDB sobre el bucket) es la fuente normal: exacto, y el
 *   mismo del que salen objetos, builds y maestría.
 * - **La API en vivo** (`liveStats.ts`) entra cuando el snapshot se congela o
 *   no responde. Desde el 2026-09-19: ese día el snapshot llevaba dos días sin
 *   partidas con rango y después el host dejó de resolver, y la tier list
 *   quedó clavada en el día del parche.
 *
 * La regla: las partidas **desde el parche** salen del snapshot mientras esté
 * al día, y de la API en vivo si está congelado. Las de **antes** del parche
 * salen del snapshot mientras responda —son viejas, ya las tiene— y de la API
 * sólo si ni siquiera responde. Cada archivo publicado dice de dónde salió.
 */
interface Source {
  name: "snapshot" | "live";
  counts(window: Window, tiers: number[]): Promise<BandCounts>;
}

const liveSource: Source = {
  name: "live",
  counts: (w, tiers) => fetchLiveCounts(w.from, w.to, tiers),
};

/**
 * El snapshot como fuente, o `null` si no se pudo ni listar: DNS caído, bucket
 * sin responder. En ese caso todo sale de la API en vivo y se avisa.
 */
async function openSnapshot(): Promise<{ source: Source; horizon: Date; con: Awaited<ReturnType<typeof connect>>; ranges: Awaited<ReturnType<typeof partitionRanges>> } | null> {
  try {
    const partitions = await listPartitions();
    const con = await connect();
    const ranges = await partitionRanges(con, partitions);
    const horizon = await windowEnd(con, ranges);
    const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjects();
    const source: Source = {
      name: "snapshot",
      async counts(w, tiers) {
        const parts = await bandablePartitions(con, partitionsCovering(ranges, w.from, w.to));
        const vacio: BandCounts = { rows: [], matches: 0, boards: 0, from: w.from.slice(0, 10), to: w.to.slice(0, 10) };
        if (parts.length === 0) return vacio;
        const base = windowSql(parts, w.from, w.to);
        const lista = tiers.join(", ");
        const agg = (await rows(`
          select hero_id, count(*)::BIGINT as matches,
                 sum(case when won then 1 else 0 end)::BIGINT as wins
          from (${base}) where tier in (${lista}) group by hero_id`)) as unknown as RawRow[];
        const [tot] = (await rows(`
          select count(distinct match_id)::BIGINT as matches, count(*)::BIGINT as boards,
                 strftime(min(start_time), '%Y-%m-%d') as "from",
                 strftime(max(start_time), '%Y-%m-%d') as "to"
          from (${base}) where tier in (${lista})`)) as unknown as { matches: bigint; boards: bigint; from: string | null; to: string | null }[];
        return {
          rows: agg,
          matches: Number(tot.matches),
          boards: Number(tot.boards),
          from: tot.from ?? vacio.from,
          to: tot.to ?? vacio.to,
        };
      },
    };
    return { source, horizon, con, ranges };
  } catch (e) {
    console.log(`⚠ SNAPSHOT INACCESIBLE (${e instanceof Error ? e.message : String(e)}): todo sale de la API en vivo.`);
    return null;
  }
}

async function main() {
  const patches = await fetchPatches();
  const patch = patches[0];
  console.log(`último parche: ${patch.date} — ${patch.title}`);

  const snap = await openSnapshot();
  const reloj = new Date();
  // Congelado: el horizonte de rango del snapshot quedó más de FROZEN_AFTER_H
  // horas atrás (`windowEnd` ya lo avisó en el log). Sin snapshot, también.
  const congelada = !snap || reloj.getTime() - snap.horizon.getTime() >= FROZEN_AFTER_H * 3_600_000;
  // Con el snapshot al día la ventana termina donde él llega (la última hora
  // está a medio escribir). Congelado o sin él, termina ahora: las partidas
  // nuevas las trae la API en vivo.
  const ahora = congelada ? reloj : snap!.horizon;
  const postSource: Source = congelada ? liveSource : snap!.source;
  const pastSource: Source = snap?.source ?? liveSource;
  if (congelada) {
    console.log(
      `  desde el parche: API en vivo${snap ? ` (snapshot congelado en ${snap.horizon.toISOString().slice(0, 16)}Z)` : ""} · ` +
        `antes del parche: ${pastSource.name}`
    );
  }

  const { after, before } = patchWindows(patch.date, ahora, MAX_WINDOW_DAYS);
  const desde = new Date(ahora.getTime() - MAX_WINDOW_DAYS * 86_400_000).toISOString();
  const hasta = ahora.toISOString();
  const wide: Window = { from: desde, to: hasta };
  const post: Window = { from: after.from, to: hasta };
  // Lo de antes del parche dentro de la ventana. Vacío si el parche ya quedó
  // más atrás que los quince días.
  const pre: Window | null = after.from > desde ? { from: desde, to: after.from } : null;

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
   *
   * Sale de la fuente "de antes" (el snapshot mientras responda): la brecha no
   * corre, y así no gasta dos pedidos a la API en vivo por corrida.
   */
  const tiersOf = (id: BandId) => BANDS.find((b) => b.id === id)!.tiers;
  const t0 = Date.now();
  const arriba = ratesFrom((await pastSource.counts(wide, tiersOf(TOP_BAND))).rows);
  const abajo = ratesFrom((await pastSource.counts(wide, tiersOf(BOTTOM_BAND))).rows);
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
    const t = Date.now();

    /**
     * La mezcla de ESTA banda: las partidas desde el parche pesan 1 y las de
     * antes pesan `alpha`, que baja de 1 a 0 a medida que el parche junta
     * `PROVISIONAL_MATCHES` partidas en la banda. Se decide por banda porque
     * cada una junta muestra a su ritmo: Fantasma+ tarda una semana en llegar
     * a lo que las bandas bajas juntan en tres días.
     */
    let postSrc = postSource;
    let cPost: BandCounts;
    try {
      cPost = await postSrc.counts(post, band.tiers);
    } catch (e) {
      // La API en vivo no contestó: si hay snapshot, aunque esté congelado,
      // es mejor que nada. Sin snapshot no hay de dónde sacarlo, y eso sí tira.
      if (!snap || postSrc.name === "snapshot") throw e;
      console.log(`  ⚠ ${band.id}: la API en vivo no contestó (${e instanceof Error ? e.message : e}); desde el parche sale del snapshot congelado`);
      postSrc = snap.source;
      cPost = await postSrc.counts(post, band.tiers);
    }
    const postMatches = cPost.matches;
    const alpha = prePatchWeight(postMatches, PROVISIONAL_MATCHES);
    const cPre = pre && alpha > 0 ? await pastSource.counts(pre, band.tiers) : null;
    const crossesPatch = !!cPre && cPre.matches > 0;
    const agg = blendRows(cPost.rows, crossesPatch ? cPre!.rows : [], alpha);
    const pesadas = postMatches + (crossesPatch ? alpha * cPre!.matches : 0);
    const tot = {
      matches: Math.round(pesadas),
      boards: Math.round(cPost.boards + (crossesPatch ? alpha * cPre!.boards : 0)),
      from: crossesPatch ? cPre!.from : cPost.from,
      to: cPost.to,
    };
    const patchShare = pesadas > 0 ? postMatches / pesadas : 1;

    const cBefore = await pastSource.counts(before, band.tiers);

    medidas.push({
      band,
      file: heroesFileFrom(
        agg,
        band,
        tot,
        {
          skillGap,
          before: ratesFrom(cBefore.rows),
          matchesBefore: cBefore.matches,
          post: ratesFrom(cPost.rows),
          crossesPatch,
          patchShare,
          postMatches,
          ...(postSrc.name === "live" ? { postSource: "live" as const } : {}),
          ...(postSrc.name === "live" && snap ? { snapshotUntil: snap.horizon.toISOString() } : {}),
        },
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
        `${file.matches.toLocaleString("es")} partidas${file.provisional ? " [PROVISIONAL]" : ""}` +
        `${file.crossesPatch ? ` [15 días, el parche pesa ${Math.round((file.patchShare ?? 0) * 100)}%]` : " [desde el parche]"}` +
        `${file.postSource === "live" ? " [parche: API en vivo]" : ""}, ` +
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
