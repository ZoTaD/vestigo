import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

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

/** 2026-07-30 16:19 UTC, cuando ranked volvió. El modo existió hace dos años. */
const RANKED_SINCE = Date.UTC(2026, 6, 30, 16, 19, 0) / 1000;

const Z = 1.96;

/** El mismo puntaje que usa la pestaña. Ver `wilsonScore` en `deadlockLadder.ts`. */
function wilson(wins: number, matches: number): number {
  if (matches <= 0) return 0;
  const p = wins / matches;
  const z2 = Z * Z;
  return (
    (p + z2 / (2 * matches) - Z * Math.sqrt((p * (1 - p) + z2 / (4 * matches)) / matches)) /
    (1 + z2 / matches)
  );
}

interface RawRow {
  account_id: number;
  value: number;
  matches: number;
}

export interface HeroLadderFile {
  generatedAt: string;
  /** Desde cuándo cuentan las partidas, en segundos. */
  since: number;
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
 * últimos 30 días. Ese MMR sigue disponible en `/v1/players/mmr/{hero_id}`
 * aunque el juego dejó de mostrarlo en la interfaz el 2026-07-30.
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
    sort_by: "winrate",
    sort_direction: "desc",
    min_matches: String(MIN_MATCHES),
    // Se piden 400 y se reordena acá: la API no sabe ordenar por MMR de héroe,
    // así que el pool tiene que CONTENER a los mejores. Pedirlo por winrate es
    // lo más ancho que hay con el piso de partidas puesto.
    limit: "400",
    hero_id: String(heroId),
    match_mode: RANKED,
    min_unix_timestamp: String(RANKED_SINCE),
  });
  const res = await fetch(`${API}/analytics/scoreboards/players?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} en el héroe ${heroId}`);
  const raw = (await res.json()) as RawRow[];
  const pool = raw.map((r) => {
    const wins = Math.round(r.value * r.matches);
    return { id: r.account_id, score: wilson(wins, r.matches), matches: r.matches };
  });
  if (pool.length === 0) return [];

  const mmr = await mmrDe(pool.map((p) => p.id), heroId);
  return pool
    .map((p) => ({ ...p, heroRank: mmr.get(p.id)?.rank ?? 0, heroScore: mmr.get(p.id)?.score ?? 0 }))
    /**
     * Sin MMR de héroe la cuenta queda en 0 y cae al final, **no arriba**: es la
     * misma regla que el resto del sitio usa para los huecos. Un jugador del que
     * no sabemos el rango no puede encabezar un ranking de rango.
     */
    .sort(
      (a, b) =>
        b.heroRank - a.heroRank ||
        b.heroScore - a.heroScore ||
        b.score - a.score ||
        b.matches - a.matches
    )
    .slice(0, TOP)
    .map((r) => r.id);
}

/**
 * El MMR del juego para un montón de cuentas, de a mil por pedido.
 *
 * Con `heroId` pregunta por `/players/mmr/{hero}` —el rango de esa persona **con
 * ese héroe**— y sin él por el global. Es la misma llamada, el mismo problema de
 * 429 y el mismo reintento, así que vive en un solo lugar: cuando se agregó el
 * orden por héroe, copiar este bucle habría dejado dos manejos de límite de tasa
 * que se desincronizan.
 *
 * **Ocho tandas seguidas dan 429**, medido: la primera corrida perdió tres de
 * ocho y dejó al 33% del mundo sin puntaje, hundido al final de la tabla. Un
 * ranking al que le falta un tercio de la gente no es un ranking. Se reintenta
 * con espera creciente y se respeta `Retry-After` cuando viene.
 */
async function mmrDe(
  ids: number[],
  heroId?: number
): Promise<Map<number, { rank: number; score: number }>> {
  const out = new Map<number, { rank: number; score: number }>();
  const ruta = heroId === undefined ? "players/mmr" : `players/mmr/${heroId}`;
  for (let i = 0; i < ids.length; i += 1000) {
    const q = ids.slice(i, i + 1000).map((id) => `account_ids=${id}`).join("&");
    for (let intento = 0; intento < 6; intento++) {
      try {
        const res = await fetch(`${API}/${ruta}?${q}`);
        if (res.status === 429) {
          const espera = Number(res.headers.get("retry-after") ?? 0) * 1000 || 2000 * 2 ** intento;
          console.log(`  429 en ${ruta} (tanda ${i}), esperando ${Math.round(espera / 1000)}s`);
          await new Promise((r) => setTimeout(r, espera));
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        for (const m of (await res.json()) as RawMmr[]) {
          out.set(m.account_id, { rank: m.rank ?? 0, score: m.player_score ?? 0 });
        }
        break;
      } catch (e) {
        // Una tanda que falla del todo deja a esos jugadores sin entrada: caen al
        // final en vez de tirar el archivo. Se avisa para que no pase inadvertido
        // en el log de CI.
        if (intento === 5) console.warn(`  tanda de MMR ${i} en ${ruta}: ${(e as Error).message}`);
      }
    }
    /**
     * Un respiro entre tandas: **3 s, y bajarlo a 1,2 fue un error medido**.
     *
     * El 2026-08-13 se bajó a 1,2 s "porque los pedidos por héroe son de ≤400
     * cuentas y no son ocho seguidos". **Las dos mitades de ese razonamiento
     * estaban mal, y la guarda de acá abajo lo demuestra**: la espera sólo corre
     * cuando quedan tandas por delante, así que con un héroe —una sola tanda—
     * **no se ejecuta nunca**. Bajarla no ahorró ni un segundo ahí, y sí la bajó
     * en el único lugar donde importa: el pool del mundo, que hoy son 11.593
     * cuentas, o sea doce tandas seguidas.
     *
     * Lo que costó, medido el 2026-08-16: la cobertura de puntaje cayó de
     * **99,9% a 91,3%** — ~1.000 jugadores sin `gameScore`, hundidos al fondo del
     * ranking mundial. Es el mismo 86,6% que la nota original ya avisaba para 1,2 s.
     *
     * Y lo que de verdad cuesta volver a 3 s son **once esperas de 1,8 s extra,
     * ~20 segundos por corrida**, no los dos minutos que estimé mal contando 38
     * esperas que nunca existieron.
     */
    if (i + 1000 < ids.length) await new Promise((r) => setTimeout(r, 3000));
  }
  return out;
}

interface RawMmr {
  account_id: number;
  player_score?: number;
  /** `rango*10 + subnivel`. Con `/players/mmr/{hero}` es el de ese héroe. */
  rank?: number;
}

/** Trae todas las páginas del scoreboard hasta que se agoten. */
async function poolOf(minMatches: number): Promise<{ id: number; score: number }[]> {
  const out: { id: number; score: number }[] = [];
  for (let start = 0; start < WORLD_CAP; start += 10_000) {
    const q = new URLSearchParams({
      sort_by: "winrate",
      sort_direction: "desc",
      min_matches: String(minMatches),
      limit: "10000",
      start: String(start),
      match_mode: RANKED,
      min_unix_timestamp: String(RANKED_SINCE),
    });
    const res = await fetch(`${API}/analytics/scoreboards/players?${q}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} en el pool del mundo`);
    const page = (await res.json()) as RawRow[];
    for (const r of page) {
      const wins = Math.round(r.value * r.matches);
      out.push({ id: r.account_id, score: wilson(wins, r.matches) });
    }
    if (page.length < 10_000) break;
  }
  return out;
}

/**
 * El ranking del mundo: **ordena el puntaje del juego, Wilson rompe empates.**
 *
 * El rango del juego es su propia respuesta a quién es mejor, y tiene en cuenta
 * contra quién jugaste — cosa que un winrate no puede. Pero es grueso: medido el
 * 2026-08-13 sobre 1.000 jugadores hay **59 valores distintos y 51 comparten el
 * máximo**, así que ordenar sólo por él dejaría cincuenta y un empatados en el
 * primer puesto. Ahí entra el piso de Wilson.
 *
 * `/v1/players/mmr` toma **1.000 cuentas por pedido**, así que el pool se manda
 * en tandas. Con ~7.500 elegibles son ocho pedidos, en CI, una vez cada dos
 * horas.
 */
async function worldRanking(): Promise<number[]> {
  const pool = await poolOf(WORLD_MIN_MATCHES);
  console.log(`  mundo: ${pool.length} jugadores con ${WORLD_MIN_MATCHES}+ clasificatorias`);
  if (pool.length >= WORLD_CAP) {
    console.warn(
      `  ¡tope alcanzado! ${WORLD_CAP} es el máximo que se publica. ` +
        `Hay que pasar a percentiles antes de que el archivo se vuelva una descarga sorpresa.`
    );
  }

  const mmr = await mmrDe(pool.map((p) => p.id));
  const porCuenta = new Map(
    pool.map((p) => [p.id, { ...p, gameScore: mmr.get(p.id)?.score ?? 0 }])
  );

  const conPuntaje = [...porCuenta.values()].filter((p) => p.gameScore > 0).length;
  console.log(`  ${conPuntaje} con puntaje del juego (${((100 * conPuntaje) / pool.length).toFixed(1)}%)`);

  return [...porCuenta.values()]
    .sort((a, b) => b.gameScore - a.gameScore || b.score - a.score)
    .slice(0, WORLD_CAP)
    .map((p) => p.id);
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    heroes: Record<string, unknown>;
  };
  const ids = Object.keys(catalog.heroes).map(Number).sort((a, b) => a - b);
  console.log(`escalera por héroe: ${ids.length} héroes, top ${TOP} cada uno`);

  /**
   * **El mundo va PRIMERO, y ese orden es el arreglo.**
   *
   * Los 38 héroes hacen dos pedidos cada uno —el scoreboard y el MMR de ese
   * héroe— o sea 76 seguidos, y el pool del mundo son doce tandas más. Con los
   * héroes adelante, el mundo llegaba a una API ya estrangulada: medido el
   * 2026-08-16, la cobertura de puntaje cayó a **82,7%**, con esperas de 32 y 64
   * segundos, y eso son ~2.000 jugadores del ranking mundial sin `gameScore`,
   * hundidos al fondo.
   *
   * Si el límite de tasa tiene que castigar a alguien, que sea la cola de una
   * lista de héroe y no la tabla del mundo, que además alimenta el "Mundo #N" de
   * todos los perfiles.
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
    /**
     * Un respiro entre héroes. **Acá es donde hacía falta y no entre tandas**:
     * cada héroe son dos pedidos y el bucle los dispara sin pausa, así que 38
     * héroes son 76 pedidos casi simultáneos. La espera de `mmrDe` no los toca
     * —vive dentro del bucle de tandas, y un héroe entra en una sola—, que fue
     * exactamente el error de razonamiento del 2026-08-13.
     */
    await new Promise((r) => setTimeout(r, 1500));
  }

  const file: HeroLadderFile = {
    generatedAt: new Date().toISOString(),
    since: RANKED_SINCE,
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
