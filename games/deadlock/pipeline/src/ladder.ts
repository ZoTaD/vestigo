import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ladderSeason, seasonParams } from "./seasons";

/**
 * El top 100 de cada héroe, publicado como archivo.
 *
 * **Existe para que el perfil pueda decir "sos el #56 del mundo con Abrams" sin
 * pedirle nada a nadie.** Contestar esa pregunta en vivo obligaría a bajar la
 * tabla de los 38 héroes y buscarse en cada una: 38 pedidos contra
 * deadlock-api por cada perfil que alguien abra. Acá el bucle corre **una vez
 * cada dos horas en CI**, que es el único lugar donde un bucle así es correcto,
 * y el navegador se lleva un archivo de ~40 KB que además cachea.
 *
 * **El orden es el mismo que el de la pestaña**: el piso del intervalo de
 * Wilson sobre partidas clasificatorias desde el reset. Si este archivo y la
 * pestaña ordenaran distinto, un jugador podría verse #3 en un lado y #7 en el
 * otro — que es exactamente la clase de contradicción que hace desconfiar de
 * todos los números de la página.
 */

const API = "https://api.deadlock-api.com/v1";
const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/heroLadder.json`;
const CATALOG = `${OUT_DIR}/catalog.json`;

/** Cuántos puestos se publican por héroe. */
const TOP = 100;

/**
 * El piso de partidas clasificatorias para entrar al ranking del mundo.
 *
 * **Es el mismo que usa el propio Deadlock** para sus leaderboards globales
 * ("50 partidas en los últimos 30 días"); su otro requisito, 500 partidas
 * totales, hoy no lo cumple nadie porque el modo abrió hace dos semanas.
 *
 * Medido el 2026-08-13: con 100 califican 782 personas y el número cien del
 * mundo tiene 56% de victorias; con 50 califican 7.490 y el número cien tiene
 * 68,4%. Bajar el piso hace la lista **más** difícil de entrar, no menos.
 */
const WORLD_MIN_MATCHES = 50;

/**
 * Tope de puestos del mundo que se publican.
 *
 * Con 7.490 elegibles el archivo pesa ~90 KB, que es aceptable para algo que
 * sólo baja quien abre un perfil. **La población va a crecer** a medida que
 * madure el modo clasificatorio, así que el tope está para que el archivo no se
 * vuelva una descarga sorpresa: si se alcanza, el script avisa y hay que decidir
 * —percentiles en vez de puestos exactos, probablemente— en vez de enterarse por
 * una página lenta.
 */
const WORLD_CAP = 20_000;

/**
 * El piso de partidas con un héroe.
 *
 * **20, que es el que usa el propio Deadlock** para sus leaderboards por héroe
 * (el global pide 50). Medido el 2026-08-13 con ese piso: Abrams deja 471
 * elegibles, Haze 204, Bebop 399 — de sobra para un top 100 que signifique algo.
 *
 * Es más bajo que el del mundo a propósito: son dos semanas de clasificatorias, y
 * pedir cincuenta partidas **con un héroe puntual** dejaría casi todas las listas
 * vacías.
 */
const MIN_MATCHES = 20;

/** El modo, por nombre: el scoreboard rechaza el entero. Ver `deadlockLadder.ts`. */
const RANKED = "Ranked";

/**
 * La temporada que mide la escalera: la vigente tras una semana, si no la que
 * terminó (ver `ladderSeason`). Se fija una vez por corrida.
 */
const LADDER = ladderSeason();
const SEASON_Q = seasonParams(LADDER.season);

interface RawRow {
  account_id: number;
  value: number;
  matches: number;
}

export interface HeroLadderFile {
  generatedAt: string;
  /** Desde cuándo cuentan las partidas, en segundos. */
  since: number;
  /** La temporada medida, y si es la tabla final de una que ya terminó. */
  season?: number;
  seasonFinal?: boolean;
  minMatches: number;
  /** El piso de partidas para entrar al ranking del mundo. */
  worldMinMatches: number;
  /**
   * El ranking del mundo entero: los `account_id` en orden de mérito.
   *
   * **La posición es el puesto**, igual que en las listas por héroe. Existe para
   * que el perfil pueda poner "#1.234 del mundo" al lado del rango sin pedirle
   * nada a nadie, y para que ese número sea **el mismo** que ordena la pestaña
   * de la escalera: si se calcularan por separado, un jugador podría verse #40
   * en un lado y #58 en el otro.
   */
  world: number[];
  /**
   * Por héroe, los `account_id` en orden de mérito. **La posición ES el puesto**
   * (índice 0 = el número uno), así que no se guarda un campo con el número: son
   * 3.800 enteros que no aportan nada y que podrían quedar desalineados del
   * orden si alguien reordena el array.
   */
  heroes: Record<string, number[]>;
}

/**
 * El top de un héroe: **quién es el mejor CON ese héroe.**
 *
 * **Ordena el rango que el juego le da a la persona EN ESE HÉROE, y el winrate
 * sólo desempata.** Antes ordenaba Wilson sobre el winrate y a secas, y eso da
 * una respuesta equivocada por una razón de fondo: **el winrate es relativo al
 * rival**. Ganar el 78% en partidas de Mystic no es mejor que ganar el 55% en
 * partidas de Eternus — es ganarle a gente peor.
 *
 * Lo agarró ZoTaD el 2026-08-14 apretando al "mejor Abrams del mundo" que
 * publicábamos: un Mystic que juega dos partidas por día. Medido sobre nuestro
 * propio top 5 de Abrams, el que teníamos primero era **el peor de los cinco**
 * según el juego (Mystic 2, puntaje 26) y el que debía ser primero estaba
 * cuarto (Emissary 4, puntaje 40).
 *
 * **Es lo que hacía el propio Deadlock.** Sus leaderboards por héroe se
 * ordenaban por el MMR de ese héroe, con un piso de 20 partidas con él en los
 * últimos 30 días. **Ese MMR por héroe ya no existe**: deadlock-api sacó
 * `/v1/players/mmr/{hero_id}` (404 el 2026-11-04), así que hoy se ordena por el
 * rango GENERAL de quienes lo juegan (`/v1/players/rank`), con Wilson
 * —calculado con ese héroe— de desempate. Sigue sabiendo contra quién se juega.
 *
 * **No se usa el leaderboard oficial (`/v1/leaderboard/{region}/{hero_id}`)
 * y ese descarte está medido**: pide 500 partidas totales, así que para Abrams
 * devuelve 26 personas en Europa, 39 en Norteamérica, 5 en Asia y **0 en
 * Sudamérica** — unas 72 en el mundo. Y muchas entradas vienen sin
 * `account_id`, así que no se pueden ni enlazar a un perfil. Nuestra lista usa
 * el mismo criterio de orden que la suya sobre una población que sí alcanza
 * para cien puestos.
 */
async function topOf(heroId: number): Promise<number[]> {
  const q = new URLSearchParams({
    // Ya ordenado por rango (`sort_by=rank`, 2026-11-04): `value` es el
    // progreso plano del rango, el mismo número que ordena la pestaña.
    sort_by: "rank",
    sort_direction: "desc",
    min_matches: String(MIN_MATCHES),
    limit: String(TOP),
    hero_id: String(heroId),
    match_mode: RANKED,
    ...SEASON_Q,
  });
  const res = await fetch(`${API}/analytics/scoreboards/players?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} en el héroe ${heroId}`);
  return byProgress((await res.json()) as RawRow[]);
}

/**
 * Los `account_id` en orden de progreso del rango. La API ya los manda así; se
 * reordena por las dudas, y sin cuentas repetidas (entre páginas el scoreboard
 * repite alguna: 72 de 135.891 el 2026-11-04).
 *
 * **Antes el pool se pedía por winrate y se reordenaba con `/players/mmr`**, y
 * ese pool dejaba afuera a los mejores: el #1 del mundo por rango tenía 69,6% y
 * no entraba entre los 20.000 de más winrate. `/players/mmr` además dejó de
 * existir el 2026-11-04.
 */
export function byProgress(rows: RawRow[]): number[] {
  const vistos = new Set<number>();
  return [...rows]
    .sort((a, b) => b.value - a.value || b.matches - a.matches)
    .filter((r) => !vistos.has(r.account_id) && vistos.add(r.account_id))
    .map((r) => r.account_id);
}

/** Trae las páginas del scoreboard, ya ordenadas por rango, hasta el tope. */
async function poolOf(minMatches: number): Promise<RawRow[]> {
  const out: RawRow[] = [];
  for (let start = 0; start < WORLD_CAP; start += 10_000) {
    const q = new URLSearchParams({
      sort_by: "rank",
      sort_direction: "desc",
      min_matches: String(minMatches),
      limit: "10000",
      start: String(start),
      match_mode: RANKED,
      ...SEASON_Q,
    });
    const res = await fetch(`${API}/analytics/scoreboards/players?${q}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} en el pool del mundo`);
    const page = (await res.json()) as RawRow[];
    out.push(...page);
    if (page.length < 10_000) break;
  }
  return out;
}

/**
 * El ranking del mundo: los `WORLD_CAP` de más progreso en el rango del juego,
 * que es su propia respuesta a quién es mejor y tiene en cuenta contra quién se
 * jugó — cosa que un winrate no puede.
 */
async function worldRanking(): Promise<number[]> {
  const pool = await poolOf(WORLD_MIN_MATCHES);
  console.log(`  mundo: los ${pool.length} de más rango con ${WORLD_MIN_MATCHES}+ clasificatorias`);
  return byProgress(pool).slice(0, WORLD_CAP);
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    heroes: Record<string, unknown>;
  };
  const ids = Object.keys(catalog.heroes).map(Number).sort((a, b) => a - b);
  console.log(`escalera por héroe: ${ids.length} héroes, top ${TOP} cada uno`);

  /**
   * El mundo va primero: si el límite de tasa tiene que castigar a alguien, que
   * sea la cola de una lista de héroe y no la tabla del mundo, que alimenta el
   * "Mundo #N" de todos los perfiles.
   */
  const world = await worldRanking();

  const heroes: Record<string, number[]> = {};
  let vacíos = 0;
  for (const id of ids) {
    try {
      const top = await topOf(id);
      // Un héroe sin nadie que llegue al piso no se publica vacío: se omite, y
      // el perfil simplemente no lo encuentra. Una lista vacía y un héroe que
      // todavía no tiene jugadores se leen igual desde el otro lado.
      if (top.length > 0) heroes[String(id)] = top;
      else vacíos++;
    } catch (e) {
      // Un héroe que falla no puede llevarse el archivo entero: se avisa y se
      // sigue. El que quede afuera se recupera en la próxima corrida.
      console.warn(`  héroe ${id}: ${(e as Error).message}`);
      vacíos++;
    }
    // Un respiro entre héroes: sin él son 44 pedidos casi simultáneos.
    await new Promise((r) => setTimeout(r, 1500));
  }

  const file: HeroLadderFile = {
    generatedAt: new Date().toISOString(),
    since: LADDER.season.start,
    season: LADDER.season.id,
    seasonFinal: LADDER.final,
    minMatches: MIN_MATCHES,
    worldMinMatches: WORLD_MIN_MATCHES,
    world,
    heroes,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(file));

  const filas = Object.values(heroes).reduce((a, x) => a + x.length, 0);
  const kb = (JSON.stringify(file).length / 1024).toFixed(1);
  console.log(`  ${Object.keys(heroes).length} héroes con lista, ${vacíos} sin nadie`);
  console.log(`  ${filas} puestos publicados · ${kb} KB`);
}

// Sólo al correrlo, no al importarlo desde un test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
