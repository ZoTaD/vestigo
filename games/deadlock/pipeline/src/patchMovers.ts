import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { badgeRange } from "./abilities";
import { BANDS } from "./bands";

/**
 * Quién se movió con cada parche (2026-10-30), para la edición de Vestigo News.
 *
 *   npm run build:patch-movers
 *
 * Para cada edición de `news.json`: el winrate de cada héroe y de cada objeto
 * los `DAYS` días antes del parche contra los `DAYS` días después, en Fantasma+
 * (`hero-stats` / `item-stats` de deadlock-api). Se publican los que más
 * subieron y más bajaron, con un piso de partidas a cada lado.
 *
 * **Una edición cerrada no se vuelve a pedir**: cuando ya pasaron `DAYS` días
 * del parche, su ventana de después está completa y los números no cambian. Así
 * la corrida diaria pide sólo los parches recientes.
 */

const API = "https://api.deadlock-api.com/v1/analytics";
const DATA_DIR = "../data";
const OUT = `${DATA_DIR}/patch-movers.json`;
export const DAYS = 7;
const BAND = "phantom-above";
/** Cuántas ediciones hacia atrás. */
const EDITIONS = 8;
export const MIN_HERO = 300;
export const MIN_ITEM = 1000;
const TOP = 5;

/** [id, winrate antes, winrate después, partidas antes, partidas después] */
export type Mover = [number, number, number, number, number];

export interface EditionMovers {
  date: string;
  band: string;
  /** El día en que termina la ventana de después: si es hoy, se sigue midiendo. */
  until: string;
  complete: boolean;
  heroes: { up: Mover[]; down: Mover[] };
  items: { up: Mover[]; down: Mover[] };
}

export interface PatchMoversFile {
  generatedAt: string;
  days: number;
  editions: Record<string, EditionMovers>;
}

interface Row {
  wins: number;
  matches: number;
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

/** Los que más subieron y más bajaron entre las dos ventanas. */
export function movers<T extends Row>(
  antes: T[],
  despues: T[],
  id: (r: T) => number,
  min: number,
  top = TOP
): { up: Mover[]; down: Mover[] } {
  const a = new Map(antes.map((r) => [id(r), r]));
  const lista: Mover[] = [];
  for (const d of despues) {
    const x = a.get(id(d));
    if (!x || x.matches < min || d.matches < min) continue;
    lista.push([id(d), r4(x.wins / x.matches), r4(d.wins / d.matches), x.matches, d.matches]);
  }
  const delta = (m: Mover) => m[2] - m[1];
  return {
    up: lista.filter((m) => delta(m) > 0).sort((p, q) => delta(q) - delta(p)).slice(0, top),
    down: lista.filter((m) => delta(m) < 0).sort((p, q) => delta(p) - delta(q)).slice(0, top),
  };
}

async function traer<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/${path}`, { headers: { "User-Agent": "vestigo.gg pipeline" }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`${path.split("?")[0]} contestó ${res.status}`);
  return (await res.json()) as T;
}

async function main() {
  const news = JSON.parse(readFileSync(`${DATA_DIR}/news.json`, "utf8")) as { editions: { slug: string; date: string }[] };
  const anterior: PatchMoversFile | null = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const out: PatchMoversFile = { generatedAt: new Date().toISOString(), days: DAYS, editions: {} };
  const badge = badgeRange(BANDS.find((b) => b.id === BAND)!.tiers);
  const q = `min_average_badge=${badge.min}&max_average_badge=${badge.max}&game_mode=normal`;
  const ahora = Date.now();

  for (const ed of news.editions.slice(0, EDITIONS)) {
    const viejo = anterior?.editions[ed.slug];
    if (viejo?.complete) {
      out.editions[ed.slug] = viejo;
      continue;
    }
    const t = Math.floor(Date.parse(ed.date) / 1000);
    const antes = `min_unix_timestamp=${t - DAYS * 86_400}&max_unix_timestamp=${t}`;
    const hasta = Math.min(t + DAYS * 86_400, Math.floor(ahora / 1000));
    const despues = `min_unix_timestamp=${t}&max_unix_timestamp=${hasta}`;
    try {
      type H = Row & { hero_id: number };
      type I = Row & { item_id: number };
      const [ha, hd, ia, id] = await Promise.all([
        traer<H[]>(`hero-stats?${q}&${antes}`),
        traer<H[]>(`hero-stats?${q}&${despues}`),
        traer<I[]>(`item-stats?${q}&${antes}`),
        traer<I[]>(`item-stats?${q}&${despues}`),
      ]);
      out.editions[ed.slug] = {
        date: ed.date,
        band: BAND,
        until: new Date(hasta * 1000).toISOString(),
        complete: hasta >= t + DAYS * 86_400,
        heroes: movers(ha, hd, (r) => r.hero_id, MIN_HERO),
        items: movers(ia, id, (r) => r.item_id, MIN_ITEM),
      };
      console.log(`  ${ed.slug}: ${out.editions[ed.slug].complete ? "cerrada" : "abierta"}`);
    } catch (e) {
      console.log(`  ${ed.slug}: ${e instanceof Error ? e.message : e}; queda la anterior`);
      if (viejo) out.editions[ed.slug] = viejo;
    }
  }
  writeFileSync(OUT, JSON.stringify(out));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
