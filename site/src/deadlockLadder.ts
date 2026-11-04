import { ladderSeason, seasonParams } from "./deadlockSeasons";

/**
 * La ladder de jugadores: quiénes son los mejores del mundo en clasificatorias.
 *
 * **Sale de `/v1/analytics/scoreboards/players`, no del leaderboard de Valve.**
 * Medido el 2026-08-12: el leaderboard trae región pero no rango, sus cuentas
 * son un array de candidatos —el jugador llamado "n" trae 178— y en Sudamérica
 * da entre 0 y 6 jugadores por héroe. El scoreboard trae `account_id` real,
 * filtra por héroe y dice sobre cuántas partidas habla.
 *
 * Lo que se pierde es la región: el scoreboard la rechaza con HTTP 500.
 */

const API = "https://api.deadlock-api.com/v1";

/**
 * `LadderMetric` vivía acá y **se borró el 2026-08-13 con el selector**.
 *
 * Dejaba elegir entre ordenar por ganadas, por winrate o por almas por partida,
 * y esa perilla era el problema: "quién es el mejor" no puede depender de cuál
 * de las tres elija el lector, y dos de las tres dan respuestas equivocadas
 * (medido — ver `wilsonScore`). Hoy hay un solo orden y la página lo explica.
 *
 * Las almas por partida contestan otra pregunta —economía, no habilidad— y
 * pueden volver como su propia vista el día que se midan como tales.
 */

export interface LadderRow {
  rank: number;
  accountId: number;
  /** Partidas ganadas en la ventana. */
  wins: number;
  /** La tasa cruda, 0 a 1. Es lo que se muestra; NO es lo que ordena. */
  winRate: number;
  /** El piso de Wilson. **Rompe empates**; ya no es lo primero que ordena. */
  score: number;
  /**
   * El puntaje del propio juego: el progreso plano del rango (ver
   * `RawRankRow`). Antes era `player_score` de `/v1/players/mmr`, que
   * deadlock-api sacó el 2026-11-04.
   *
   * **Es lo que ordena la tabla**, y es lo correcto: es la respuesta del juego a
   * "quién es mejor", tiene en cuenta contra quién jugaste —cosa que un winrate
   * no puede— y no es una fórmula nuestra.
   */
  gameScore: number;
  matches: number;
  name?: string;
  country?: string;
  /**
   * El rango real del jugador, del scoreboard con `sort_by=rank`. **No** el
   * `last_team_avg_badge` de `/v1/players/steam`, que es el promedio de su
   * equipo. Se lee con `rankOf` de `deadlockReportData.ts`, la misma que usa el
   * perfil. Ausente o 0 significa sin rango, no rango cero.
   */
  badge?: number;
}

export interface Ladder {
  rows: LadderRow[];
  floor: number;
  thin: boolean;
}

/**
 * Los escalones del piso de partidas, de más exigente a menos.
 *
 * **Existe porque el winrate crudo premia a las cuentas nuevas.** Medido sobre
 * Victor: con 30 partidas mínimas el primero tenía 100% en 32; con 200, 72,5%
 * en 240 — y todavía quedaban 701 jugadores, porque el Victor más jugado tiene
 * 946 partidas. El piso baja solo cuando la combinación no da muestra: un héroe
 * poco jugado cruzado con una banda alta deja seis personas.
 */
export const FLOORS = [50, 25, 10];

/**
 * **Por qué 50 y no 100** (decidido el 2026-08-13, midiendo).
 *
 * El piso arrancaba en 200 y en la práctica caía en 100. Con 100 partidas
 * clasificatorias sólo califican **782 personas en el mundo**, así que "top 100"
 * significaba estar entre los 782 que más juegan — y el número cien de esa lista
 * tenía **56,0% de victorias**, apenas sobre el promedio.
 *
 * Con 50, la población elegible pasa a **7.490** y el número cien tiene
 * **68,4%**: la lista se vuelve más difícil de entrar, no más fácil, porque hay
 * diez veces más gente compitiendo por los mismos cien lugares.
 *
 * Y 50 no es un número inventado: **es el que usa el propio Deadlock** para sus
 * leaderboards globales ("50 partidas en los últimos 30 días"). El otro requisito
 * de Valve —500 partidas totales— hoy no lo cumple nadie, porque el modo
 * clasificatorio abrió hace dos semanas.
 */

/** Con menos filas que esto, la tabla no es un ranking. */
export const MIN_ROWS = 20;

/**
 * Los pisos del podio de un héroe.
 *
 * **20, que es el que usa el propio Deadlock** para sus leaderboards por héroe
 * —el global pide 50—. Medido el 2026-08-13 con ese piso: Abrams deja 471
 * elegibles, Haze 204, Bebop 399.
 *
 * Más flojo que el del mundo a propósito: en dos semanas de clasificatorias,
 * pedir cincuenta partidas **con un héroe puntual** deja casi todos los podios
 * vacíos. Es el mismo número que usa `build:ladder` en el pipeline: si
 * divergieran, el podio de la pestaña y el ranking del perfil hablarían de
 * poblaciones distintas.
 *
 * **Y por eso es UN solo piso, sin el 10 de respaldo que tenía.** Ese respaldo
 * dejaba entrar al podio a alguien con 10-19 clasificatorias, que el pipeline
 * nunca va a incluir: su perfil no diría "#2 con este héroe" sino nada. Está
 * medido que no hace falta — con piso 20, los 38 héroes llenan los 100 puestos
 * del archivo publicado, así que ningún podio se queda sin sus tres.
 */
export const PODIUM_FLOORS = [20];

/** Un podio son tres. */
export const PODIUM_SIZE = 3;

/**
 * El orden de mérito de la escalera: **primero el rango del juego, después
 * Wilson, y las partidas al final**.
 *
 * Está afuera del `fetch` para poder probarlo sin red, y eso no es cosmético:
 * **esta comparación se equivocó dos veces en dos días** y las dos veces el
 * defecto era invisible salvo apretando un jugador y mirando quién era.
 *
 * `gameScore` es el rango que el juego le da a la persona — el global en la
 * tabla del mundo, y el de ESE héroe en la lista de un héroe. Es lo único de
 * los tres que sabe **contra quién se jugó**, y por eso va primero: el winrate
 * no distingue ganarle a un Eternus de ganarle a un Mystic.
 */
export function byMerit(a: LadderRow, b: LadderRow): number {
  return b.gameScore - a.gameScore || b.score - a.score || b.matches - a.matches;
}

/**
 * `bandToBadges` vivía acá y **se borró el 2026-08-13 con el filtro de banda**.
 * Traducía una banda del sitio a un rango de badges para pasárselo a
 * `min_average_badge`, que es el promedio del LOBBY y no el rango del jugador:
 * la pestaña decía "Emissary / Oracle" y mostraba "partidas jugadas en salas de
 * ese promedio". Si algún día vuelve el filtro, que sea sobre el rango de la
 * persona, no sobre el de la sala.
 */

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface RawRow {
  rank: number;
  account_id: number;
  value: number;
  matches: number;
}

interface RawSteam {
  account_id: number;
  personaname?: string;
  countrycode?: string;
}

/**
 * Una fila del scoreboard con `sort_by=rank`: `value` es el **progreso plano**
 * del rango (crece mil puntos por subnivel y distingue a dos Eternus 2) y
 * `badge` el rango, `rango*10 + subnivel`.
 *
 * Reemplaza a `/v1/players/mmr`, que deadlock-api sacó el 2026-11-04.
 */
export interface RawRankRow {
  account_id: number;
  value: number;
  matches: number;
  badge?: number;
}

/**
 * Junta el pool por rango con las victorias (`sort_by=wins`, `value` = ganadas).
 * Sin fila de victorias, la cuenta queda con 0 ganadas: se ve, y el orden lo
 * pone el rango igual.
 */
export function joinRankWins(rank: RawRankRow[], wins: RawRow[]): LadderRow[] {
  const ganadas = new Map(wins.map((w) => [w.account_id, w.value]));
  return rank.map((r) => {
    const w = Math.round(ganadas.get(r.account_id) ?? 0);
    return {
      rank: 0,
      accountId: r.account_id,
      wins: w,
      winRate: r.matches > 0 ? w / r.matches : 0,
      score: wilsonScore(w, r.matches),
      gameScore: r.value,
      matches: r.matches,
      ...(r.badge ? { badge: r.badge } : {}),
    };
  });
}

/**
 * El modo clasificatorio, tal como lo nombra el scoreboard.
 *
 * Verificado el 2026-08-13 pegándole a la API: `match_mode=Ranked` (y `ranked`,
 * es indiferente a mayúsculas) devuelve filas; **un `4` la rompe** con "Failed
 * to parse comma separated list". O sea que este endpoint quiere el nombre, no
 * el entero que devuelve `match-history` — ver `RANKED_MODE` en
 * `deadlockMatch.ts`, que es el mismo modo contado del otro lado.
 */
const RANKED = "Ranked";

/**
 * Desde cuándo cuentan las partidas clasificatorias: 2026-07-30 16:19 UTC.
 *
 * **No alcanza con pedir el modo.** El modo clasificatorio existió hace dos años,
 * se dejó de usar y volvió con el reset; sin este corte, la tabla mezclaría a
 * quienes lo jugaron en 2024 con los de esta temporada. Es la misma trampa que
 * ya documenta `RANKED_SINCE` en `deadlockMatch.ts`.
 */
export const RANKED_SINCE = Date.UTC(2026, 6, 30, 16, 19, 0) / 1000;

/** El z de un intervalo de confianza del 95%. */
const Z = 1.96;

/**
 * El puntaje que decide quién es mejor: **el piso del intervalo de Wilson**.
 *
 * Ordenar por ganadas y ordenar por winrate son las dos formas equivocadas, y
 * las dos se midieron el 2026-08-13 sobre las clasificatorias reales:
 *
 * - **Por ganadas**, el número uno del mundo tenía **47,4% de victorias** en 270
 *   partidas. Es un jugador por debajo del promedio que jugó mucho; encabezar
 *   con él es decir que "el mejor" significa "el que más tiempo tiene".
 * - **Por winrate crudo**, gana el que menos jugó: una racha de 25 partidas le
 *   pasa por encima a una temporada entera.
 *
 * Wilson contesta la pregunta correcta: *dado que ganaste `w` de `n`, ¿cuál es
 * el winrate más bajo que es compatible con esa evidencia?* Una muestra chica
 * ensancha el intervalo y hunde el piso; una grande lo aprieta contra el
 * promedio real. Así el ranking premia ganar **y** sostenerlo, sin una perilla
 * que le pase la decisión al lector.
 *
 * Es el método que Evan Miller popularizó en *How Not To Sort By Average
 * Rating* y el mismo espíritu del encogimiento que la tier list de TFT ya
 * aplica a las comps: no publicar un promedio crudo de muestra chica.
 *
 * Medido sobre el pool real: reordena a los que empatan en winrate según cuánto
 * lo sostuvieron — 79 victorias en 111 partidas (71,2%) le pasa a 68 en 95
 * (71,6%), porque hay más evidencia detrás.
 */
export function wilsonScore(wins: number, matches: number): number {
  if (matches <= 0) return 0;
  const p = wins / matches;
  const z2 = Z * Z;
  return (
    (p + z2 / (2 * matches) - Z * Math.sqrt((p * (1 - p) + z2 / (4 * matches)) / matches)) /
    (1 + z2 / matches)
  );
}

/**
 * La tabla, con los nombres puestos.
 *
 * **Dos pedidos, no uno por fila**: `/v1/players/steam` toma `account_ids`
 * repetido y resuelve todos juntos. Ese segundo pedido **puede fallar sin
 * llevarse la página** — si no llega, las filas se dibujan con el id, que es el
 * mismo criterio que usa el perfil con la ficha de Steam.
 *
 * **Mide sólo clasificatorias desde el reset.** Antes filtraba por banda con
 * `min_average_badge`, que es el promedio del LOBBY y no el rango del jugador:
 * la pestaña decía "Emissary / Oracle" y en realidad mostraba "partidas jugadas
 * en salas de ese promedio", que no es lo que nadie lee. Un ranking de los
 * mejores no necesita esa perilla — necesita que las partidas cuenten.
 */
export async function fetchLadder(opts: {
  hero?: number;
  /** Cuántas filas se devuelven ya ordenadas por Wilson. */
  limit?: number;
  /** Piso mínimo de partidas. El podio de un héroe se conforma con menos. */
  floors?: number[];
  /** Cuántas filas hacen falta para que la tabla sea un ranking. */
  minRows?: number;
}): Promise<Ladder> {
  /**
   * Cien, no cincuenta (pedido de ZoTaD, 2026-08-13).
   */
  const limit = opts.limit ?? 100;
  const floors = opts.floors ?? FLOORS;
  const minRows = opts.minRows ?? MIN_ROWS;
  /**
   * **El pool se pide ya ordenado por rango** (`sort_by=rank`, desde el
   * 2026-11-04). Antes se pedían los 400 de mejor winrate y se reordenaban acá
   * por rango, y ese pool dejaba afuera a los mejores: el #1 del mundo por rango
   * tenía 69,6% y no entraba entre los 400 de más winrate. Unas filas de más
   * dejan que Wilson desempate en el borde.
   */
  const POOL = limit + 20;

  let raw: RawRankRow[] = [];
  let floor = floors[floors.length - 1];
  const filtros = (f: number) => {
    const q = new URLSearchParams({
      sort_direction: "desc",
      min_matches: String(f),
      match_mode: RANKED,
      // La temporada de la escalera: la vigente tras una semana, si no la
      // que terminó (ver `ladderSeason`).
      ...seasonParams(ladderSeason().season),
    });
    if (opts.hero) q.set("hero_id", String(opts.hero));
    return q;
  };
  for (const f of floors) {
    const q = filtros(f);
    q.set("sort_by", "rank");
    q.set("limit", String(POOL));
    raw = await get<RawRankRow[]>(`${API}/analytics/scoreboards/players?${q}`);
    floor = f;
    if (raw.length >= minRows) break;
  }

  /**
   * Las victorias, en un pedido aparte: con `sort_by=rank` el `value` es el
   * progreso del rango, no las ganadas. El mismo scoreboard con `sort_by=wins`
   * y las cuentas del pool las trae, con los mismos filtros (y el mismo héroe).
   * Si falla, la tabla sale igual, sin victorias.
   */
  let wins: RawRow[] = [];
  if (raw.length > 0) {
    try {
      const q = filtros(floor);
      q.set("sort_by", "wins");
      q.set("limit", String(raw.length));
      const ids = raw.map((r) => `account_ids=${r.account_id}`).join("&");
      wins = await get<RawRow[]>(`${API}/analytics/scoreboards/players?${q}&${ids}`);
    } catch {
      /* sin victorias, pero con tabla */
    }
  }

  /**
   * **Ordena el rango del juego; Wilson rompe los empates.** El rango es el
   * general del jugador también en la lista de un héroe: el rango por héroe se
   * fue con `/players/mmr/{héroe}` (2026-11-04).
   *
   * **Ordenar por winrate está mal y costó dos rondas entenderlo.** El winrate
   * es relativo al rival: ganar el 78% contra Mystic no es mejor que ganar el
   * 55% contra Eternus. El 2026-08-14 ZoTaD apretó al "mejor Abrams del mundo"
   * que publicábamos por winrate: un Mystic que juega dos partidas por día.
   */
  const rows: LadderRow[] = joinRankWins(raw, wins)
    .sort(byMerit)
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  if (rows.length > 0) {
    try {
      const q = rows.map((r) => `account_ids=${r.accountId}`).join("&");
      const steam = await get<RawSteam[]>(`${API}/players/steam?${q}`);
      const byId = new Map(steam.map((s) => [s.account_id, s]));
      for (const r of rows) {
        const s = byId.get(r.accountId);
        if (s?.personaname) r.name = s.personaname;
        if (s?.countrycode) r.country = s.countrycode;
      }
    } catch {
      /* sin nombres, pero con tabla */
    }
  }

  return { rows, floor, thin: rows.length < minRows };
}

/**
 * El podio de un héroe: oro, plata y bronce.
 *
 * **Se pide de a uno, cuando el visitante elige el héroe.** Con 38 héroes,
 * dibujar los 38 podios de entrada serían 38 pedidos contra deadlock-api por
 * cada visita — el mismo bucle que se descartó para el perfil agregado. Así son
 * dos pedidos al abrir la página: la tabla global y el podio del héroe elegido.
 */
export function fetchPodium(hero: number): Promise<Ladder> {
  return fetchLadder({
    hero,
    limit: PODIUM_SIZE,
    floors: PODIUM_FLOORS,
    // Un podio con tres nombres ya es un podio: no se le puede exigir las 20
    // filas que hacen creíble a una tabla, o bajaría el piso hasta el fondo
    // buscando filas que nunca va a mostrar.
    minRows: PODIUM_SIZE,
  });
}
