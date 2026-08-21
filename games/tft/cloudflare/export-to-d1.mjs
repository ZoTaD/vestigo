/**
 * Vuelca las tablas de Supabase a archivos .sql listos para `wrangler d1 import`.
 *
 * Descartable: corre una vez, el día de la migración, y se borra. Por eso no
 * tiene tests ni vive en el pipeline.
 *
 * Dos cosas que no son obvias:
 * - Se pagina de a 1000 porque PostgREST corta ahí pase lo que pase con el
 *   `limit` que se le pida (el tope que ya documentan pgStore.ts y summaryStore.ts).
 * - `matches` se parte en varios archivos: son ~130 MB de payload crudo, y un
 *   solo .sql de ese tamaño es incómodo de reintentar si falla a la mitad.
 *
 * Uso: node --env-file=games/tft/pipeline/.env games/tft/cloudflare/export-to-d1.mjs <dir>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const URL_BASE = process.env.SUPABASE_URL.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT = process.argv[2] ?? ".";
const PAGE = 1000;
const MATCHES_POR_ARCHIVO = 500;

mkdirSync(OUT, { recursive: true });

/** Un valor de SQLite: null, número, o texto con las comillas simples duplicadas. */
function sql(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return `'${s.replace(/'/g, "''")}'`;
}

async function page(table, select, order, offset) {
  const res = await fetch(
    `${URL_BASE}/rest/v1/${table}?select=${select}&order=${order}&limit=${PAGE}&offset=${offset}`,
    { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } }
  );
  if (!res.ok) throw new Error(`${table} respondió ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Baja una tabla entera, paginando por filas recibidas (nunca por el limit pedido). */
async function todas(table, select, order) {
  const out = [];
  for (;;) {
    const rows = await page(table, select, order, out.length);
    out.push(...rows);
    process.stdout.write(`\r  ${table}: ${out.length} filas`);
    if (rows.length === 0) break;
  }
  process.stdout.write("\n");
  return out;
}

function inserts(table, columnas, filas) {
  return filas
    .map((f) => `INSERT INTO ${table} (${columnas.join(",")}) VALUES (${columnas.map((c) => sql(f[c])).join(",")});`)
    .join("\n");
}

const plan = [
  { tabla: "players", cols: ["puuid", "game_name", "tag_line", "region", "updated_at", "pulled_at"], order: "puuid.asc" },
  { tabla: "ladder", cols: ["region", "puuid", "league_points", "wins", "losses", "fetched_at"], order: "region.asc,puuid.asc" },
  { tabla: "rank_snapshots", cols: ["puuid", "region", "set_number", "tier", "division", "league_points", "games", "taken_at"], order: "puuid.asc,taken_at.asc" },
  { tabla: "pull_runs", cols: ["id", "started_at", "finished_at", "players", "matches", "riot_calls", "status", "detail", "pruned"], order: "id.asc" },
  { tabla: "match_players", cols: ["match_id", "puuid", "placement"], order: "match_id.asc,puuid.asc" },
];

for (const { tabla, cols, order } of plan) {
  const filas = await todas(tabla, "*", order);
  writeFileSync(join(OUT, `${tabla}.sql`), inserts(tabla, cols, filas) + "\n", "utf8");
}

// matches va aparte: es el volumen, y se corta en archivos.
const cols = ["match_id", "region", "set_number", "queue_id", "game_datetime", "game_version", "payload", "fetched_at", "tier", "summarized_at"];
const filas = await todas("matches", "*", "match_id.asc");
for (let i = 0, n = 0; i < filas.length; i += MATCHES_POR_ARCHIVO, n += 1) {
  const trozo = filas.slice(i, i + MATCHES_POR_ARCHIVO);
  writeFileSync(join(OUT, `matches_${String(n).padStart(3, "0")}.sql`), inserts("matches", cols, trozo) + "\n", "utf8");
}
console.log(`listo: ${filas.length} partidas en ${Math.ceil(filas.length / MATCHES_POR_ARCHIVO)} archivos`);
