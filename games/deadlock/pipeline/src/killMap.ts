import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Dónde mata y dónde muere cada héroe: el mapa de calor de la ficha.
 *
 *   npm run build:kill-map
 *
 * `kill-death-stats?hero_ids=X` (medido el 2/11: ~1,8 MB y ~5 s por héroe)
 * devuelve celdas de 128 unidades del mundo con las kills del héroe y sus
 * muertes, separadas por el equipo del que mata. Se reduce a una grilla de
 * 64×64 por capa y se cuantiza a un byte por celda: ~6 KB por héroe.
 *
 * **Los dos equipos se pliegan sobre uno.** El mapa tiene simetría de rotación
 * (los 12 guardianes de base coinciden con (1−x, 1−y), ver `map.json`), y el
 * equipo 0 tiene la base abajo. Así que lo del equipo 1 se gira 180° y el mapa
 * se lee siempre con "tu base" abajo. Para una kill el equipo del héroe es el
 * que mata; para una muerte, el otro.
 *
 * **Una sola franja**: todos los rangos, 14 días. La geografía de las peleas no
 * cambia con el rango y así cada héroe junta muestra.
 */

const API = "https://api.deadlock-api.com/v1/analytics";
const OUT_DIR = "../data";
const DAYS = 14;
/** Celdas por lado. */
export const SIZE = 64;
/** El borde del mundo, igual que `map.json`. */
export const BOUND = 10752;

export interface KdRow {
  position_x: number;
  position_y: number;
  killer_team: number;
  kills: number;
  deaths: number;
}

export interface KillMapFile {
  generatedAt: string;
  heroId: number;
  from: string;
  to: string;
  size: number;
  /** Un byte por celda, fila por fila desde arriba, en base64. 0 = nada, 255 = la celda más caliente. */
  kills: string;
  deaths: string;
  totals: { kills: number; deaths: number };
}

/** La celda de una posición del mundo, con el equipo 1 girado 180°. */
export function cellOf(x: number, y: number, rotate: boolean): number | null {
  const wx = rotate ? -x : x;
  const wy = rotate ? -y : y;
  if (Math.abs(wx) > BOUND || Math.abs(wy) > BOUND) return null;
  // Justo sobre el borde (x = BOUND) cae en la última celda, no afuera.
  const col = Math.min(SIZE - 1, Math.floor(((wx + BOUND) / (2 * BOUND)) * SIZE));
  const row = Math.min(SIZE - 1, Math.floor(((BOUND - wy) / (2 * BOUND)) * SIZE));
  return row * SIZE + col;
}

/**
 * De conteo a byte. Raíz cuadrada: con escala lineal, el punto más caliente
 * (la base en un empuje final) apaga todo el resto del mapa.
 */
export function quantize(grid: Float64Array): Uint8Array {
  let max = 0;
  for (const v of grid) if (v > max) max = v;
  const out = new Uint8Array(grid.length);
  if (max <= 0) return out;
  const m = Math.sqrt(max);
  for (let i = 0; i < grid.length; i++) out[i] = Math.round((Math.sqrt(grid[i]) / m) * 255);
  return out;
}

export function buildKillMap(rows: KdRow[]): { kills: Uint8Array; deaths: Uint8Array; totals: { kills: number; deaths: number } } {
  const k = new Float64Array(SIZE * SIZE);
  const d = new Float64Array(SIZE * SIZE);
  const totals = { kills: 0, deaths: 0 };
  for (const r of rows) {
    if (r.kills > 0) {
      // La kill es del héroe: su equipo es el que mata.
      const c = cellOf(r.position_x, r.position_y, r.killer_team === 1);
      if (c != null) k[c] += r.kills;
      totals.kills += r.kills;
    }
    if (r.deaths > 0) {
      // La muerte es del héroe: su equipo es el otro.
      const c = cellOf(r.position_x, r.position_y, r.killer_team === 0);
      if (c != null) d[c] += r.deaths;
      totals.deaths += r.deaths;
    }
  }
  return { kills: quantize(k), deaths: quantize(d), totals };
}

async function main() {
  const catalog = JSON.parse(readFileSync(`${OUT_DIR}/catalog.json`, "utf8")) as {
    heroes: Record<string, unknown>;
  };
  const heroIds = Object.keys(catalog.heroes).map(Number);
  const now = new Date();
  const from = new Date(now.getTime() - DAYS * 86_400_000);
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  mkdirSync(`${OUT_DIR}/kill-map`, { recursive: true });

  let ok = 0;
  for (const id of heroIds) {
    const q = `hero_ids=${id}&min_unix_timestamp=${Math.floor(from.getTime() / 1000)}`;
    try {
      const res = await fetch(`${API}/kill-death-stats?${q}`, { headers: { "User-Agent": "vestigo.gg pipeline" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as KdRow[];
      const m = buildKillMap(rows);
      // Con poca muestra no se publica: un mapa de diez kills es una anécdota.
      if (m.totals.kills + m.totals.deaths < 500) {
        console.log(`  héroe ${id}: ${m.totals.kills + m.totals.deaths} eventos, lo salteo`);
        continue;
      }
      const file: KillMapFile = {
        generatedAt: now.toISOString(),
        heroId: id,
        from: dia(from),
        to: dia(now),
        size: SIZE,
        kills: Buffer.from(m.kills).toString("base64"),
        deaths: Buffer.from(m.deaths).toString("base64"),
        totals: m.totals,
      };
      writeFileSync(`${OUT_DIR}/kill-map/${id}.json`, JSON.stringify(file));
      ok++;
    } catch (e) {
      console.log(`  héroe ${id}: ${e instanceof Error ? e.message : e}; queda el archivo anterior`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`  ${ok} de ${heroIds.length} héroes con mapa`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
