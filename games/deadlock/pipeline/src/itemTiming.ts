import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { badgeRange } from "./abilities";
import { BANDS } from "./bands";

/**
 * El winrate de cada objeto según el minuto en que se compró.
 *
 *   npm run build:item-timing
 *
 * Un pedido por banda a `item-stats?bucket=game_time_min` (medido el 2/11:
 * 1,4 MB y ~2 s), en la misma ventana que la tier list de objetos de esa banda.
 *
 * **El número crudo engaña, y por eso se publica al lado de una base.** Comprar
 * cualquier cosa temprano "gana más": el que compra un objeto de 3.200 en el
 * minuto 12 va adelante en almas. Así que cada tramo trae también la diferencia
 * contra el promedio de **los objetos del mismo precio comprados en el mismo
 * tramo** — el mismo criterio que la tier list (ver `items.ts`). La tarjeta
 * pinta esa diferencia y escribe el crudo.
 */

const API = "https://api.deadlock-api.com/v1/analytics";
const OUT_DIR = "../data";

/** Bordes de los tramos, en minutos. El último tramo es "40 o más". */
export const EDGES = [0, 10, 15, 20, 25, 30, 40];

/** Compras mínimas para publicar un tramo. Con menos, el winrate es ruido. */
export const MIN_BUYS = 200;

export interface TimingRow {
  item_id: number;
  /** Minuto de compra. */
  bucket: number;
  wins: number;
  matches: number;
}

/** Un tramo publicado: compras, winrate (‰) y diferencia con la base (décimas de punto). */
export type Slot = [n: number, wr: number, delta: number] | null;

export interface ItemTimingFile {
  generatedAt: string;
  band: string;
  from: string;
  to: string;
  edges: number[];
  /** Por objeto, un `Slot` por tramo, en el orden de `edges`. */
  items: Record<string, Slot[]>;
}

/** En qué tramo cae un minuto. */
export function slotOf(minute: number): number {
  let i = 0;
  for (let k = 0; k < EDGES.length; k++) if (minute >= EDGES[k]) i = k;
  return i;
}

/** Filas por minuto → tramos por objeto, con la base de su precio. */
export function buildTiming(rows: TimingRow[], cost: Map<number, number>): Record<string, Slot[]> {
  const S = EDGES.length;
  const acc = new Map<number, { w: number; n: number }[]>();
  const base = new Map<string, { w: number; n: number }>();
  for (const r of rows) {
    const c = cost.get(r.item_id);
    if (c == null || r.matches <= 0) continue;
    const s = slotOf(r.bucket);
    let a = acc.get(r.item_id);
    if (!a) acc.set(r.item_id, (a = Array.from({ length: S }, () => ({ w: 0, n: 0 }))));
    a[s].w += r.wins;
    a[s].n += r.matches;
    const k = `${c}:${s}`;
    const b = base.get(k) ?? { w: 0, n: 0 };
    b.w += r.wins;
    b.n += r.matches;
    base.set(k, b);
  }
  const out: Record<string, Slot[]> = {};
  for (const [id, a] of acc) {
    const c = cost.get(id)!;
    const slots: Slot[] = a.map((x, s) => {
      if (x.n < MIN_BUYS) return null;
      const b = base.get(`${c}:${s}`)!;
      // La base sin el propio objeto: si no, un objeto que domina su tramo se
      // compara contra sí mismo y la diferencia tiende a cero.
      const bn = b.n - x.n;
      const wr = x.w / x.n;
      const bwr = bn > 0 ? (b.w - x.w) / bn : wr;
      return [x.n, Math.round(wr * 1000), Math.round((wr - bwr) * 1000)];
    });
    if (slots.some((x) => x)) out[String(id)] = slots;
  }
  return out;
}

interface ItemsFile {
  from?: string;
  to?: string;
}

async function main() {
  const catalog = JSON.parse(readFileSync(`${OUT_DIR}/catalog.json`, "utf8")) as {
    items: Record<string, { cost?: number }>;
  };
  const cost = new Map(
    Object.entries(catalog.items)
      .filter(([, it]) => typeof it.cost === "number" && it.cost > 0)
      .map(([id, it]) => [Number(id), it.cost as number])
  );
  const unix = (d: string) => Math.floor(Date.parse(d) / 1000);

  for (const band of BANDS) {
    const tl = `${OUT_DIR}/items.${band.id}.json`;
    if (!existsSync(tl)) {
      console.log(`  ${band.id}: no hay ${tl}, la salteo`);
      continue;
    }
    const { from, to } = JSON.parse(readFileSync(tl, "utf8")) as ItemsFile;
    if (!from || !to) continue;
    const b = badgeRange(band.tiers);
    const q =
      `bucket=game_time_min&min_average_badge=${b.min}&max_average_badge=${b.max}` +
      `&min_unix_timestamp=${unix(`${from}T00:00:00Z`)}&max_unix_timestamp=${unix(`${to}T23:59:59Z`)}`;
    try {
      const res = await fetch(`${API}/item-stats?${q}`, { headers: { "User-Agent": "vestigo.gg pipeline" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as TimingRow[];
      const items = buildTiming(rows, cost);
      const file: ItemTimingFile = {
        generatedAt: new Date().toISOString(),
        band: band.id,
        from,
        to,
        edges: EDGES,
        items,
      };
      writeFileSync(`${OUT_DIR}/item-timing.${band.id}.json`, JSON.stringify(file));
      console.log(`  ${band.id}: ${Object.keys(items).length} objetos (${from} a ${to})`);
    } catch (e) {
      console.log(`  ${band.id}: la API no contestó (${e instanceof Error ? e.message : e}); queda el archivo anterior`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
