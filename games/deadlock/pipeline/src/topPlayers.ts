import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { HeroLadderFile } from "./ladder";

/**
 * Los mejores de cada héroe y las builds que usan (2026-10-30).
 *
 *   npm run build:top-players   (después de `build:ladder`)
 *
 * Parte del top de `heroLadder.json` (el orden de la pestaña Ladder: rango del
 * juego en ese héroe y Wilson) y le suma lo que el archivo no tiene:
 *
 * - **Partidas y victorias** de los 10 primeros con ese héroe en los últimos
 *   `DAYS` días, para la grilla de "one-tricks" de la escalera.
 * - **Las builds de los 20 primeros**: la que tenían elegida al empezar cada
 *   partida (`hero_build_id` del historial público de deadlock-api), contadas
 *   por cuántos de los 20 la usan y en cuántas partidas. Las 3 más usadas se
 *   publican enteras (nombre, autor y categorías de objetos) para abrirlas en el
 *   Armador de builds.
 *
 * Un pedido de historial por héroe y tres de builds: ~180 pedidos con un respiro
 * entre héroes, una vez por día. Si un héroe falla queda el que había.
 */

const API = "https://api.deadlock-api.com/v1";
const DATA_DIR = "../data";
const OUT = `${DATA_DIR}/top-players.json`;
const DAYS = 30;
/** Cuántos jugadores se muestran por héroe. */
export const SHOW = 10;
/** De cuántos se sacan las builds. */
export const BUILDS_FROM = 20;
/** Cuántas builds se publican por héroe. */
export const BUILDS = 3;
/**
 * Las builds con id chico (7, 42, 50…) no existen en `/v1/builds`: son las
 * predeterminadas del juego. Se cuentan como "sin build propia".
 */
const MIN_BUILD_ID = 1000;

/** [account_id, partidas, victorias] con el héroe en la ventana. */
export type PlayerPoint = [number, number, number];

export interface TopBuild {
  id: number;
  name: string;
  author: number;
  /** Cuántos de los `BUILDS_FROM` la usaron al menos una vez. */
  players: number;
  matches: number;
  wins: number;
  categories: { name: string; items: number[] }[];
}

export interface TopPlayersFile {
  generatedAt: string;
  from: string;
  to: string;
  buildsFrom: number;
  heroes: Record<string, { players: PlayerPoint[]; builds: TopBuild[] }>;
}

interface MetaPlayer {
  account_id: number;
  hero_id: number;
  team: string;
  hero_build_id?: number | null;
}
interface MetaMatch {
  match_id: number;
  winning_team: string;
  players: MetaPlayer[];
}

export interface Tally {
  players: Map<number, { n: number; w: number }>;
  builds: Map<number, { n: number; w: number; who: Set<number> }>;
}

/** Cuenta partidas, victorias y builds de los jugadores pedidos con ese héroe. */
export function tally(matches: MetaMatch[], hero: number, accounts: number[]): Tally {
  const nuestros = new Set(accounts);
  const players = new Map<number, { n: number; w: number }>();
  const builds = new Map<number, { n: number; w: number; who: Set<number> }>();
  const vistas = new Set<string>();
  for (const m of matches) {
    for (const p of m.players) {
      if (p.hero_id !== hero || !nuestros.has(p.account_id)) continue;
      // Una partida no cuenta dos veces aunque la API la repita.
      const k = `${m.match_id}:${p.account_id}`;
      if (vistas.has(k)) continue;
      vistas.add(k);
      const gano = p.team === m.winning_team ? 1 : 0;
      const x = players.get(p.account_id) ?? { n: 0, w: 0 };
      x.n++;
      x.w += gano;
      players.set(p.account_id, x);
      const b = p.hero_build_id;
      if (typeof b === "number" && b >= MIN_BUILD_ID) {
        const y = builds.get(b) ?? { n: 0, w: 0, who: new Set<number>() };
        y.n++;
        y.w += gano;
        y.who.add(p.account_id);
        builds.set(b, y);
      }
    }
  }
  return { players, builds };
}

/** Las builds más usadas: primero por cuántos la usan, después por partidas. */
export function topBuildIds(t: Tally, n = BUILDS): number[] {
  return [...t.builds.entries()]
    .sort((a, b) => b[1].who.size - a[1].who.size || b[1].n - a[1].n || a[0] - b[0])
    .slice(0, n)
    .map(([id]) => id);
}

interface RawBuild {
  hero_build: {
    hero_build_id: number;
    author_account_id: number;
    name: string;
    details?: { mod_categories?: { name?: string; mods?: { ability_id: number }[] }[] };
  };
}

/** Las categorías de una build, sin las vacías, con los nombres recortados. */
export function categoriesOf(raw: RawBuild): TopBuild["categories"] {
  return (raw.hero_build.details?.mod_categories ?? [])
    .map((c) => ({
      name: (c.name ?? "").trim().slice(0, 40),
      items: [...new Set((c.mods ?? []).map((m) => m.ability_id))].slice(0, 30),
    }))
    .filter((c) => c.items.length > 0)
    .slice(0, 12);
}

async function traer<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/${path}`, { headers: { "User-Agent": "vestigo.gg pipeline" }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`${path.split("?")[0]} contestó ${res.status}`);
  return (await res.json()) as T;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const ladder = JSON.parse(readFileSync(`${DATA_DIR}/heroLadder.json`, "utf8")) as HeroLadderFile;
  const anterior: TopPlayersFile | null = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - DAYS * 86_400_000);
  const out: TopPlayersFile = {
    generatedAt: ahora.toISOString(),
    from: desde.toISOString().slice(0, 10),
    to: ahora.toISOString().slice(0, 10),
    buildsFrom: BUILDS_FROM,
    heroes: {},
  };

  for (const [heroId, cuentas] of Object.entries(ladder.heroes)) {
    const hero = Number(heroId);
    const top = cuentas.slice(0, BUILDS_FROM);
    try {
      const q =
        `account_ids=${top.join(",")}&hero_ids=${hero}&only_filtered_players=true&include_player_info=true` +
        `&game_mode=normal&min_unix_timestamp=${Math.floor(desde.getTime() / 1000)}&limit=5000`;
      const partidas = await traer<MetaMatch[]>(`matches/metadata?${q}`);
      const t = tally(partidas, hero, top);
      const players: PlayerPoint[] = top.slice(0, SHOW).map((id) => {
        const x = t.players.get(id);
        return [id, x?.n ?? 0, x?.w ?? 0];
      });
      const builds: TopBuild[] = [];
      for (const id of topBuildIds(t)) {
        try {
          const [raw] = await traer<RawBuild[]>(`builds?hero_id=${hero}&build_id=${id}&only_latest=true`);
          if (!raw) continue;
          const x = t.builds.get(id)!;
          builds.push({
            id,
            name: raw.hero_build.name.trim().slice(0, 60),
            author: raw.hero_build.author_account_id,
            players: x.who.size,
            matches: x.n,
            wins: x.w,
            categories: categoriesOf(raw),
          });
        } catch {
          /* una build borrada no tira al héroe */
        }
      }
      out.heroes[heroId] = { players, builds };
      console.log(`  ${heroId}: ${partidas.length} partidas, ${t.builds.size} builds, ${builds.length} publicadas`);
    } catch (e) {
      console.log(`  ${heroId}: ${e instanceof Error ? e.message : e}; queda el anterior`);
      if (anterior?.heroes[heroId]) out.heroes[heroId] = anterior.heroes[heroId];
    }
    await espera(1500);
  }
  if (!Object.keys(out.heroes).length) throw new Error("ningún héroe salió");
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`  ${(JSON.stringify(out).length / 1024).toFixed(1)} KB`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
