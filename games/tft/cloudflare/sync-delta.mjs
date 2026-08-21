/**
 * Trae de Supabase a D1 lo que entró DESPUÉS del volcado inicial.
 *
 * Existe porque la migración es en caliente: el cron sigue escribiendo en
 * Supabase cada 5 minutos mientras se exporta, así que el volcado siempre queda
 * corto. Se corre las veces que haga falta —es idempotente— y una última vez
 * justo antes de apagar el cron viejo.
 *
 * El corte es por `fetched_at`, no por `match_id`: los ids ordenan bien dentro
 * de una región (`LA2_5601…`) pero no entre regiones, así que "el id más grande"
 * no significa "lo más nuevo" en cuanto hay más de una plataforma.
 *
 * Uso: node --env-file=games/tft/pipeline/.env sync-delta.mjs <dir-salida>
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const URL_BASE = process.env.SUPABASE_URL.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT = process.argv[2] ?? ".";

const esc = (v) =>
  v === null || v === undefined
    ? "NULL"
    : typeof v === "number"
      ? String(v)
      : `'${(typeof v === "object" ? JSON.stringify(v) : String(v)).replace(/'/g, "''")}'`;

/**
 * Consulta D1 por wrangler y devuelve la primera fila.
 *
 * El SQL va entre comillas dobles armado a mano: con `shell: true` en Windows,
 * cmd parte el comando por espacios antes de que Node vea el array de argumentos,
 * y `select coalesce(max(fetched_at), '')` llega como seis argumentos sueltos.
 */
function d1(sql) {
  const salida = execSync(`npx wrangler d1 execute vestigo --remote --json --command "${sql}"`, {
    encoding: "utf8",
    maxBuffer: 50e6,
  });
  const json = JSON.parse(salida.slice(salida.indexOf("[")));
  return json[0].results[0];
}

async function pg(query) {
  const res = await fetch(`${URL_BASE}/rest/v1/${query}`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${query} respondió ${res.status}: ${await res.text()}`);
  return res.json();
}

const { corte } = d1("select coalesce(max(fetched_at), '') as corte from matches");
console.log(`última partida en D1: ${corte || "(ninguna)"}`);

// Paginado por cursor de fetched_at, nunca por offset: la tabla crece mientras
// se lee, y con offset la ventana se corre y devuelve filas repetidas — el error
// que rechazó la clave primaria en el primer intento de esta migración.
let cursor = corte;
const partidas = [];
const jugadores = [];
for (;;) {
  const filas = await pg(
    `matches?select=*&fetched_at=gt.${encodeURIComponent(cursor)}&order=fetched_at.asc&limit=500`
  );
  if (filas.length === 0) break;
  partidas.push(...filas);
  cursor = filas[filas.length - 1].fetched_at;
  process.stdout.write(`\r  partidas nuevas: ${partidas.length}`);
}
process.stdout.write("\n");

// Los jugadores de esas partidas, de a 100 ids por request (una URL con miles de
// ids la corta cualquier proxy delante de PostgREST).
for (let i = 0; i < partidas.length; i += 100) {
  const ids = partidas.slice(i, i + 100).map((m) => m.match_id);
  if (ids.length === 0) continue;
  jugadores.push(...(await pg(`match_players?select=*&match_id=in.(${ids.map(encodeURIComponent).join(",")})`)));
  process.stdout.write(`\r  tableros: ${jugadores.length}`);
}
process.stdout.write("\n");

// Las marcas de `summarized_at`, que es lo que evita contar dos veces.
//
// Mientras las dos bases convivan, el resumidor sigue marcando en Supabase y D1
// no se entera. Si el corte se hiciera sin esto, la primera corrida contra D1
// reprocesaría todo lo que Supabase ya contó — y `absorbed` en los objetos de R2
// lo detectaría, pero como un solapamiento PARCIAL, que por diseño falla ruidoso
// en vez de sumar. O sea: sin esta parte, el corte no arranca.
//
// Se piden las pendientes (unos cientos) en vez de las marcadas (unas siete mil):
// la lista chica es la misma información.
const pendientes = new Set();
let cursorPend = "";
for (;;) {
  const filas = await pg(
    `matches?select=match_id&summarized_at=is.null&order=match_id.asc&limit=1000` +
      (cursorPend ? `&match_id=gt.${encodeURIComponent(cursorPend)}` : "")
  );
  if (filas.length === 0) break;
  for (const f of filas) pendientes.add(f.match_id);
  cursorPend = filas[filas.length - 1].match_id;
}
console.log(`pendientes de resumir en Supabase: ${pendientes.size}`);

const cols = ["match_id", "region", "set_number", "queue_id", "game_datetime", "game_version", "payload", "fetched_at", "tier", "summarized_at"];
const lineas = [
  ...partidas.map(
    (m) => `INSERT OR REPLACE INTO matches (${cols.join(",")}) VALUES (${cols.map((c) => esc(m[c])).join(",")});`
  ),
  ...jugadores.map(
    (p) => `INSERT OR IGNORE INTO match_players (match_id,puuid,placement) VALUES (${esc(p.match_id)},${esc(p.puuid)},${esc(p.placement)});`
  ),
  // Todo lo que Supabase ya contó queda marcado en D1. Las que trajo el cron
  // nuevo directo a D1 nunca estuvieron en Supabase, así que no aparecen en
  // `pendientes` y hay que excluirlas por fecha: son las posteriores al corte.
  `UPDATE matches SET summarized_at = '${new Date().toISOString()}'` +
    ` WHERE summarized_at IS NULL AND fetched_at <= '${corte}'` +
    (pendientes.size > 0 ? ` AND match_id NOT IN (${[...pendientes].map(esc).join(",")})` : "") +
    ";",
];

if (lineas.length === 0) {
  console.log("nada nuevo: D1 está al día");
  process.exit(0);
}
const archivo = join(OUT, "delta.sql");
writeFileSync(archivo, lineas.join("\n") + "\n", "utf8");
console.log(`${partidas.length} partidas y ${jugadores.length} tableros en ${archivo}`);
