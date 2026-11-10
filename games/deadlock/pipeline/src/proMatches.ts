import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { HeroLadderFile } from "./ladder";

/**
 * Las partidas de los mejores con cada héroe (2026-11-10).
 *
 *   npm run build:pro-matches   (después de `build:ladder`)
 *
 * Para la sección "Partidas de pros" de la ficha: las últimas partidas de los
 * `FROM` primeros de la escalera de ese héroe en los últimos `DAYS` días, con
 * lo que terminó comprando cada uno, el orden en que subió las habilidades, el
 * KDA y el resultado. Un archivo por héroe (`pro-matches/<id>.json`, ~10 KB):
 * la ficha baja sólo el suyo.
 *
 * Un pedido por héroe con un respiro entre uno y otro: ~45 pedidos, una vez por
 * día. Si un héroe falla queda el archivo que había.
 */

const API = "https://api.deadlock-api.com/v1";
const DATA_DIR = "../data";
const OUT_DIR = `${DATA_DIR}/pro-matches`;
export const DAYS = 7;
/** De cuántos jugadores de la escalera del héroe se buscan partidas. */
export const FROM = 50;
/** Cuántas partidas se publican por héroe. */
export const KEEP = 30;
/** Cuántos pasos del orden de habilidades se guardan (los 16 de la grilla y un poco más). */
const PATH_STEPS = 20;

/**
 * Una partida, en una fila corta para que el archivo no pese:
 * `[match_id, cuenta, inicio (unix), duración (s), ganó (1/0), kills, muertes,
 *   asistencias, almas, rango mostrado (tier*10+sub), carril, objetos, orden]`.
 *
 * - **objetos**: los que tenía al terminar, en el orden en que los compró.
 * - **orden**: el id de la habilidad en cada punto gastado (desbloquear y mejorar).
 */
export type ProMatch = [number, number, number, number, 0 | 1, number, number, number, number, number, number, number[], number[]];

export interface ProMatchesFile {
  generatedAt: string;
  heroId: number;
  days: number;
  from: number;
  matches: ProMatch[];
}

interface RawItem {
  game_time_s: number;
  item_id: number;
  upgrade_id?: number;
  sold_time_s?: number;
}
interface RawPlayer {
  account_id: number;
  hero_id: number;
  team: string;
  kills: number;
  deaths: number;
  assists: number;
  net_worth: number;
  assigned_lane?: number;
  player_rank_initial_display_rank?: number;
  items?: RawItem[];
}
interface RawMatch {
  match_id: number;
  start_time: string;
  winning_team: string;
  duration_s: number;
  players: RawPlayer[];
}

/** Las seis horas de partida: una compra con `game_time_s` envuelto (~2^32) no existe. */
const MAX_S = 6 * 3600;

/**
 * Reduce la partida a la fila del archivo. `shop` son los objetos de la tienda;
 * `abilities`, las cuatro del héroe. Lo que no es ni una cosa ni la otra
 * (mejoras de estadística, consumibles raros) se deja afuera.
 */
export function toRow(m: RawMatch, p: RawPlayer, shop: Set<number>, abilities: Set<number>): ProMatch {
  const items = (p.items ?? []).filter((i) => i.game_time_s < MAX_S).sort((a, b) => a.game_time_s - b.game_time_s);
  const finales: number[] = [];
  const orden: number[] = [];
  for (const i of items) {
    if (abilities.has(i.item_id)) {
      if (orden.length < PATH_STEPS) orden.push(i.item_id);
    } else if (shop.has(i.item_id) && !i.sold_time_s && !finales.includes(i.item_id)) {
      finales.push(i.item_id);
    }
  }
  const inicio = Math.floor(Date.parse(`${m.start_time.replace(" ", "T")}Z`) / 1000);
  return [
    m.match_id,
    p.account_id,
    inicio,
    m.duration_s,
    p.team === m.winning_team ? 1 : 0,
    p.kills,
    p.deaths,
    p.assists,
    p.net_worth,
    p.player_rank_initial_display_rank ?? 0,
    p.assigned_lane ?? 0,
    finales,
    orden,
  ];
}

async function traer<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/${path}`, { headers: { "User-Agent": "vestigo.gg pipeline" }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`${path.split("?")[0]} contestó ${res.status}`);
  return (await res.json()) as T;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const ladder = JSON.parse(readFileSync(`${DATA_DIR}/heroLadder.json`, "utf8")) as HeroLadderFile;
  const catalog = JSON.parse(readFileSync(`${DATA_DIR}/catalog.json`, "utf8")) as { items: Record<string, unknown> };
  const shop = new Set(Object.keys(catalog.items).map(Number));
  mkdirSync(OUT_DIR, { recursive: true });
  const desde = Math.floor(Date.now() / 1000) - DAYS * 86_400;
  let bien = 0;

  for (const [heroId, cuentas] of Object.entries(ladder.heroes)) {
    const hero = Number(heroId);
    const top = cuentas.slice(0, FROM);
    const kitPath = `${DATA_DIR}/hero-kit/${heroId}.json`;
    if (!top.length || !existsSync(kitPath)) continue;
    const kit = JSON.parse(readFileSync(kitPath, "utf8")) as { abilities: { en: { id: number }[] } };
    const abilities = new Set(kit.abilities.en.map((a) => a.id));
    try {
      const q =
        `account_ids=${top.join(",")}&hero_ids=${hero}&only_filtered_players=true` +
        `&include_info=true&include_player_info=true&include_player_kda=true&include_player_items=true` +
        `&game_mode=normal&min_unix_timestamp=${desde}&order_by=match_id&order_direction=desc&limit=${KEEP * 2}`;
      const partidas = await traer<RawMatch[]>(`matches/metadata?${q}`);
      const nuestros = new Set(top);
      const vistas = new Set<string>();
      const filas: ProMatch[] = [];
      for (const m of partidas) {
        for (const p of m.players) {
          if (p.hero_id !== hero || !nuestros.has(p.account_id)) continue;
          const k = `${m.match_id}:${p.account_id}`;
          if (vistas.has(k)) continue;
          vistas.add(k);
          filas.push(toRow(m, p, shop, abilities));
        }
      }
      filas.sort((a, b) => b[2] - a[2]);
      const out: ProMatchesFile = { generatedAt: new Date().toISOString(), heroId: hero, days: DAYS, from: top.length, matches: filas.slice(0, KEEP) };
      writeFileSync(`${OUT_DIR}/${heroId}.json`, JSON.stringify(out));
      bien++;
      console.log(`  ${heroId}: ${filas.length} partidas, ${(JSON.stringify(out).length / 1024).toFixed(1)} KB`);
    } catch (e) {
      console.log(`  ${heroId}: ${e instanceof Error ? e.message : e}; queda el anterior`);
    }
    await espera(1500);
  }
  if (!bien) throw new Error("ningún héroe salió");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
