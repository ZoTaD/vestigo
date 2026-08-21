import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { BANDS, bandPath, publishedDefaultBand, type Band } from "./bands";
import {
  connect,
  listPartitions,
  partitionRanges,
  partitionsCovering,
  itemsWindowSql,
  windowEnd,
  bandablePartitions,
  MAX_WINDOW_DAYS,
  retryingOnRewrite,
  PROVISIONAL_MATCHES,
} from "./snapshot";
import { fetchPatches, patchWindows, type Patch } from "./patches";

/**
 * La tier list de ítems de Deadlock, medida contra el precio de cada ítem.
 *
 *   npm run build:items
 *
 * ---
 *
 * **Por qué no se rankea por winrate, que es lo que hacen los cuatro sitios de
 * stats de Deadlock que existen.** Medido sobre la ventana del parche vigente:
 *
 * | precio | winrate | minuto mediano de compra |
 * |--------|---------|--------------------------|
 * | 800    | 50,13%  | 5,6                      |
 * | 1600   | 50,79%  | 13,5                     |
 * | 3200   | 50,66%  | 21,7                     |
 * | 6400   | 55,06%  | 32,2                     |
 *
 * Los de 6400 no ganan porque sean mejores objetos: ganan porque **comprar uno
 * significa que la partida llegó al minuto 32 y se llegó con almas de sobra**.
 * Ordenar por winrate es ordenar por precio, y por eso los cuatro competidores
 * publican la misma lista.
 *
 * Adentro de un mismo precio, en cambio, la señal es enorme: entre los de 3200,
 * Blood Tribute gana 56,4% y Metal Skin 39,9%. Dieciséis puntos y medio entre dos
 * objetos que cuestan lo mismo. Eso es lo que mide este archivo.
 *
 * **El `k` que sale de los datos dice algo que ningún sitio dice**: 1225 en los de
 * 800 contra 296 en los de 3200. Entre dos ítems baratos casi no hay diferencia
 * real; entre dos de 3200 sí la hay. Elegir bien sólo paga donde los ítems de
 * verdad se diferencian.
 *
 * Ver `docs/design/2026-07-30-tier-list-de-items-deadlock-design.md`.
 */

const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/items.json`;
const CATALOG = `${OUT_DIR}/catalog.json`;

/**
 * Debajo de esto un ítem se publica marcado como muestra fina.
 *
 * Medido: con 300 compras los **156 ítems califican en las cuatro bandas**, así
 * que hoy esta marca no se dispara para nadie. Existe para el día que Valve sume
 * un ítem, o para una banda que se adelgace — no para esconder filas, sino para
 * que la que se dibuje diga cuánta evidencia tiene atrás.
 */
export const MIN_BUYS = 300;

/** Redondeo estable, para que dos corridas del mismo dato den el mismo archivo. */
const r = (n: number, d = 4): number => Number(n.toFixed(d));

/** Una fila cruda de la consulta: un ítem en una banda. */
export interface RawItemRow {
  item_id: number;
  /** El precio, que viene del catálogo del snapshot. */
  cost: number;
  buys: bigint;
  wins: bigint;
  /** Segundo mediano de compra. Se guarda en minutos. */
  buy_seconds: number;
}

export interface Rate {
  wr: number;
  n: number;
}

export interface ItemStat {
  itemId: number;
  /** Compras. No se muestra: es el denominador. */
  n: number;
  /**
   * Puntos de winrate sobre lo que rinde un ítem cualquiera de ese precio.
   *
   * Es el número que ordena la lista y el que va en pantalla. Positivo significa
   * que el ítem le gana a su propio precio; negativo, que le está costando la
   * partida a quien lo compra.
   */
  delta: number;
  /** Lo que midió sin encoger, para poder auditar el encogimiento. */
  winRateRaw: number;
  /** Qué fracción de las filas jugador de la banda lo compraron. */
  pickRate: number;
  /** Minuto mediano de compra. Ubica al ítem en la partida. */
  buyMinute: number;
  /** True cuando el ítem no llega a `MIN_BUYS` en esta banda. */
  thinData?: boolean;
}

export interface ItemsFile {
  generatedAt: string;
  band: string;
  patch: { date: string; title: string; link: string };
  provisional?: boolean;
  /**
   * Lo que rinde cada precio en esta banda. **Se publica a propósito**: el
   * `delta` es una resta contra estos números, y sin ellos el lector tendría que
   * confiar. Misma regla que `winRateRaw` en la tier list de héroes.
   */
  costBaselines: Record<string, number>;
  matches: number;
  boards: number;
  from: string;
  to: string;
  items: ItemStat[];
}

/**
 * Lo que rinde cada precio: el winrate **agregado** de todas sus compras.
 *
 * Agregado y no promedio de los ítems: un ítem que se compra cien veces no puede
 * pesar lo mismo que uno que se compra cien mil. Lo que la base contesta es
 * "¿cuánto vale gastar 3200 almas?", y eso lo contestan las compras, no la lista
 * de objetos disponibles.
 */
export function baselinesFrom(rows: RawItemRow[]): Map<number, number> {
  const acc = new Map<number, { buys: number; wins: number }>();
  for (const row of rows) {
    const cur = acc.get(row.cost) ?? { buys: 0, wins: 0 };
    acc.set(row.cost, { buys: cur.buys + Number(row.buys), wins: cur.wins + Number(row.wins) });
  }
  return new Map([...acc].map(([cost, { buys, wins }]) => [cost, buys > 0 ? wins / buys : 0.5]));
}

/**
 * Cuánto encoger, estimado de los propios datos por el método de los momentos.
 *
 * Es `shrinkageFrom` de la tier list de héroes con el centro como parámetro en
 * vez de clavado en 50%. Allá el centro se sabe por construcción —en un juego de
 * dos equipos el winrate medio es 50%—; acá el centro es lo que rinde el precio,
 * que hay que medir.
 *
 * Se compara lo que varían los ítems entre sí contra lo que varía una medición
 * por puro azar. Si el azar explica todo lo observado, no hay señal que preservar
 * y se encoge todo lo posible.
 */
export function shrinkageToward(rates: Rate[], center: number): number {
  const usables = rates.filter((x) => x.n > 0);
  if (usables.length < 2) return Number.POSITIVE_INFINITY;

  const observada = usables.reduce((a, x) => a + (x.wr - center) ** 2, 0) / usables.length;
  const porAzar = usables.reduce((a, x) => a + (x.wr * (1 - x.wr)) / x.n, 0) / usables.length;
  const entreItems = observada - porAzar;
  if (entreItems <= 0) return Number.POSITIVE_INFINITY;
  return 0.25 / entreItems;
}

/** Aplica el encogimiento hacia el centro dado. */
export function shrinkTo(wr: number, n: number, k: number, center: number): number {
  if (!Number.isFinite(k)) return center;
  if (k <= 0 || n <= 0) return center;
  return (n * wr + k * center) / (n + k);
}

/**
 * Arma el archivo de una banda.
 *
 * Separado de las consultas a propósito: es donde vive todo el criterio y es lo
 * único que tiene sentido probar sin red. Mismo reparto que `heroesFileFrom`.
 */
export function itemsFileFrom(
  rows: RawItemRow[],
  band: Band,
  totals: { matches: number; boards: number; from: string; to: string },
  patch: Patch,
  generatedAt: string
): ItemsFile {
  const bases = baselinesFrom(rows);

  // El encogimiento se estima por precio, no una vez para todos: los ítems de
  // 800 se parecen mucho más entre sí que los de 3200, y un k global los trataría
  // igual. Medido: 1225 contra 296.
  const kPorPrecio = new Map<number, number>();
  for (const [cost, base] of bases) {
    const delPrecio = rows
      .filter((row) => row.cost === cost)
      .map((row) => ({ wr: Number(row.wins) / Number(row.buys), n: Number(row.buys) }));
    kPorPrecio.set(cost, shrinkageToward(delPrecio, base));
  }

  const items: ItemStat[] = rows
    .map((row) => {
      const n = Number(row.buys);
      const wr = Number(row.wins) / n;
      const base = bases.get(row.cost)!;
      const encogido = shrinkTo(wr, n, kPorPrecio.get(row.cost)!, base);
      return {
        itemId: row.item_id,
        n,
        delta: r((encogido - base) * 100, 2),
        winRateRaw: r(wr),
        pickRate: totals.boards > 0 ? r(n / totals.boards) : 0,
        buyMinute: r(row.buy_seconds / 60, 1),
        ...(n < MIN_BUYS ? { thinData: true } : {}),
      };
    })
    .sort((a, b) => b.delta - a.delta || b.n - a.n);

  return {
    generatedAt,
    band: band.id,
    patch: { date: patch.date, title: patch.title, link: patch.link },
    ...(totals.matches < PROVISIONAL_MATCHES ? { provisional: true } : {}),
    costBaselines: Object.fromEntries([...bases].map(([cost, base]) => [String(cost), r(base)])),
    matches: totals.matches,
    boards: totals.boards,
    from: totals.from,
    to: totals.to,
    items,
  };
}

interface CatalogItem {
  cost: number;
}

async function main() {
  // El catálogo manda qué ítems existen: el snapshot tiene ids que la tienda no
  // ofrece, y publicar una fila sin nombre ni imagen no le sirve a nadie.
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as { items: Record<string, CatalogItem> };
  const costOf = new Map(Object.entries(catalog.items).map(([id, i]) => [Number(id), i.cost]));
  if (costOf.size === 0) {
    throw new Error("el catálogo no tiene ítems. Corré `npm run catalog` antes que esto.");
  }
  const ids = [...costOf.keys()].join(", ");

  const [partitions, patches] = await Promise.all([listPartitions(), fetchPatches()]);
  const patch = patches[0];
  console.log(`último parche: ${patch.date} — ${patch.title}`);
  console.log(`  ${costOf.size} ítems de tienda en el catálogo`);

  const con = await connect();
  const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjects();

  const defecto = publishedDefaultBand();
  const ranges = await partitionRanges(con, partitions);
  const { after } = patchWindows(patch.date, await windowEnd(con, ranges), MAX_WINDOW_DAYS);
  const partsAfter = await bandablePartitions(con, partitionsCovering(ranges, after.from, after.to));
  if (partsAfter.length === 0) {
    throw new Error(
      `el snapshot no tiene ni una partición posterior al parche del ${patch.date}. ` +
        "O el parche es de hace minutos, o el snapshot dejó de actualizarse."
    );
  }
  console.log(`  particiones: ${partsAfter.join(", ")}`);

  const base = itemsWindowSql(partsAfter, after.from, after.to);

  const statsSql = (tiers: string) => `
    select item_id, count(*)::BIGINT as buys,
           sum(case when won then 1 else 0 end)::BIGINT as wins,
           median(compra_s)::INTEGER as buy_seconds
    from (
      select tier, won, unnest(item_ids) as item_id, unnest(item_times) as compra_s
      from (${base})
    ) where compra_s > 0 and tier in (${tiers}) and item_id in (${ids})
    group by item_id`;

  const totalsSql = (tiers: string) => `
    select count(distinct match_id)::BIGINT as matches, count(*)::BIGINT as boards,
           strftime(min(start_time), '%Y-%m-%d') as "from",
           strftime(max(start_time), '%Y-%m-%d') as "to"
    from (${base}) where tier in (${tiers})`;

  mkdirSync(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();

  for (const band of BANDS) {
    const tiers = band.tiers.join(", ");
    const t = Date.now();

    const [tot] = (await rows(totalsSql(tiers))) as unknown as {
      matches: bigint; boards: bigint; from: string; to: string;
    }[];
    const crudas = (await rows(statsSql(tiers))) as unknown as {
      item_id: number; buys: bigint; wins: bigint; buy_seconds: number;
    }[];
    const agg: RawItemRow[] = crudas.map((x) => ({
      item_id: x.item_id,
      cost: costOf.get(x.item_id)!,
      buys: x.buys,
      wins: x.wins,
      buy_seconds: Number(x.buy_seconds),
    }));

    const file = itemsFileFrom(
      agg,
      band,
      { matches: Number(tot.matches), boards: Number(tot.boards), from: tot.from, to: tot.to },
      patch,
      generatedAt
    );
    writeFileSync(bandPath(OUT, band.id), JSON.stringify(file));
    // La copia sin sufijo va para la MISMA banda que eligió `build:heroes`. Si
    // los dos archivos abrieran en bandas distintas, la pestaña de ítems diría
    // otra cosa que la de héroes sin que nada lo explique.
    if (band.id === defecto) writeFileSync(OUT, JSON.stringify(file));
    const bases = Object.entries(file.costBaselines)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([c, b]) => `${c}:${(b * 100).toFixed(2)}%`)
      .join(" ");
    console.log(
      `  ${band.id.padEnd(20)} ${file.items.length} ítems, ` +
        `${file.matches.toLocaleString("es")} partidas${file.provisional ? " [PROVISIONAL]" : ""} — ` +
        `${bases} (${((Date.now() - t) / 1000).toFixed(1)}s)` +
        `${band.id === defecto ? "  [por defecto]" : ""}`
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
