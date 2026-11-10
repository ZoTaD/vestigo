import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { badgeRange } from "./abilities";
import { BANDS } from "./bands";

/**
 * Objetos infravalorados y sobrevalorados por héroe (2026-11-10).
 *
 *   npm run build:item-value   (después de `build:items`)
 *
 * Para la vista "Infravalorados" de Objetos: con cada héroe, lo que casi nadie
 * le compra y gana más que los objetos de su precio, y lo que le compran casi
 * todos y gana menos.
 *
 * **La vara es la de su precio, no el winrate del héroe.** Un objeto de 6.400
 * lo compra quien va ganando y siempre "gana" más que uno de 800; contra el
 * winrate del héroe todo lo caro saldría infravalorado. Cada objeto se compara
 * con todas las compras del mismo costo en ese héroe, igual que el delta de la
 * tier list de objetos.
 *
 * Misma ventana que `items.<banda>.json`. Un pedido de héroes por banda y uno de
 * objetos por héroe y banda: ~180 pedidos con un respiro, una vez por día. Si
 * una banda falla queda su archivo anterior; si falla un héroe, el suyo.
 */

const API = "https://api.deadlock-api.com/v1/analytics";
const DATA = "../data";
/** Compras mínimas para que un objeto entre: con menos, el winrate es ruido. */
export const MIN_MATCHES = 150;
/** Debajo de esto, "casi nadie lo compra". */
export const LOW_BUY = 0.15;
/** Arriba de esto, "lo compran casi todos". */
export const HIGH_BUY = 0.35;
const TOP_UNDER = 10;
const TOP_OVER = 6;

/** `[item_id, compras, % de partidas del héroe ×1000, puntos contra su precio ×1000]`. */
export type ValueRow = [number, number, number, number];

export interface ItemValueFile {
  generatedAt: string;
  band: string;
  from: string;
  to: string;
  heroes: Record<string, { n: number; under: ValueRow[]; over: ValueRow[] }>;
}

interface ItemStat {
  item_id: number;
  wins: number;
  matches: number;
}

/** Las dos listas de un héroe. `cost` es el precio de cada objeto de la tienda. */
export function classify(items: ItemStat[], heroMatches: number, cost: Map<number, number>): { under: ValueRow[]; over: ValueRow[] } {
  const filas = items.filter((i) => cost.has(i.item_id) && i.matches >= MIN_MATCHES);
  const base = new Map<number, { w: number; n: number }>();
  for (const i of filas) {
    const c = cost.get(i.item_id)!;
    const b = base.get(c) ?? { w: 0, n: 0 };
    b.w += i.wins;
    b.n += i.matches;
    base.set(c, b);
  }
  const rows = filas.map((i) => {
    const b = base.get(cost.get(i.item_id)!)!;
    return { id: i.item_id, n: i.matches, buy: heroMatches ? i.matches / heroMatches : 0, delta: i.wins / i.matches - b.w / b.n };
  });
  const fila = (r: (typeof rows)[number]): ValueRow => [r.id, r.n, Math.round(r.buy * 1000), Math.round(r.delta * 1000)];
  return {
    under: rows.filter((r) => r.buy < LOW_BUY && r.delta > 0.01).sort((a, b) => b.delta - a.delta).slice(0, TOP_UNDER).map(fila),
    over: rows.filter((r) => r.buy >= HIGH_BUY && r.delta < -0.005).sort((a, b) => a.delta - b.delta).slice(0, TOP_OVER).map(fila),
  };
}

async function traer<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/${path}`, { headers: { "User-Agent": "vestigo.gg pipeline" }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`${path.split("?")[0]} contestó ${res.status}`);
  return (await res.json()) as T;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const catalog = JSON.parse(readFileSync(`${DATA}/catalog.json`, "utf8")) as { items: Record<string, { cost?: number }> };
  const cost = new Map(
    Object.entries(catalog.items)
      .filter(([, it]) => typeof it.cost === "number" && it.cost > 0)
      .map(([id, it]) => [Number(id), it.cost as number])
  );
  const unix = (d: string) => Math.floor(Date.parse(d) / 1000);

  for (const band of BANDS) {
    const tl = `${DATA}/items.${band.id}.json`;
    if (!existsSync(tl)) continue;
    const { from, to } = JSON.parse(readFileSync(tl, "utf8")) as { from?: string; to?: string };
    if (!from || !to) continue;
    const out = `${DATA}/item-value.${band.id}.json`;
    const anterior: ItemValueFile | null = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
    const b = badgeRange(band.tiers);
    const q =
      `min_average_badge=${b.min}&max_average_badge=${b.max}&game_mode=normal` +
      `&min_unix_timestamp=${unix(`${from}T00:00:00Z`)}&max_unix_timestamp=${unix(`${to}T23:59:59Z`)}`;
    try {
      const heroes = await traer<{ hero_id: number; matches: number }[]>(`hero-stats?${q}`);
      const file: ItemValueFile = { generatedAt: new Date().toISOString(), band: band.id, from, to, heroes: {} };
      for (const h of heroes) {
        try {
          const items = await traer<ItemStat[]>(`item-stats?hero_id=${h.hero_id}&${q}`);
          file.heroes[String(h.hero_id)] = { n: h.matches, ...classify(items, h.matches, cost) };
        } catch (e) {
          console.log(`  ${band.id} ${h.hero_id}: ${e instanceof Error ? e.message : e}; queda el anterior`);
          const viejo = anterior?.heroes[String(h.hero_id)];
          if (viejo) file.heroes[String(h.hero_id)] = viejo;
        }
        await espera(400);
      }
      writeFileSync(out, JSON.stringify(file));
      console.log(`  ${band.id}: ${Object.keys(file.heroes).length} héroes, ${(JSON.stringify(file).length / 1024).toFixed(1)} KB`);
    } catch (e) {
      console.log(`  ${band.id}: ${e instanceof Error ? e.message : e}; queda el archivo anterior`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
