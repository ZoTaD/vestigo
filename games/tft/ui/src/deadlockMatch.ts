/**
 * La partida de Deadlock: de dónde sale y en qué se convierte.
 *
 * **El navegador le pega directo a `deadlock-api.com`, sin pasar por el Worker.**
 * El Worker de Cloudflare existe para esconder la key de Riot, y acá no hay
 * ninguna key: la API de Deadlock es pública, sin autenticación, y contesta con
 * `access-control-allow-origin: *` (verificado el 2026-08-11). Meter un
 * intermediario sería sumar una pieza que se puede caer para no ganar nada — y
 * de paso el límite por IP de ellos pasa a contarse por visitante en vez de por
 * nuestro Worker entero, que es mejor para todos.
 *
 * Lo que llega es grande (1,2 MB por partida) y lo que se usa es poco, así que
 * `parseMatch` lo baja a lo mínimo antes de que nada más lo toque.
 */

const API = "https://api.deadlock-api.com/v1";

export type MatchErrorCode = "NOT_FOUND" | "RATE_LIMITED" | "UPSTREAM" | "NETWORK";

export class MatchError extends Error {
  constructor(readonly code: MatchErrorCode, message: string) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}/${path}`);
  } catch {
    throw new MatchError("NETWORK", "no se pudo alcanzar deadlock-api");
  }
  if (res.status === 404) throw new MatchError("NOT_FOUND", `404 en ${path}`);
  if (res.status === 429) throw new MatchError("RATE_LIMITED", "429");
  if (!res.ok) throw new MatchError("UPSTREAM", `HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Una cuenta de Steam tal como la devuelve la búsqueda. */
export interface SteamAccount {
  accountId: number;
  name: string;
  avatar: string | null;
  country: string | null;
  recent: number;
  /**
   * El perfil público de Steam de esa persona.
   *
   * Lo devuelve el mismo endpoint (`profileurl`), así que no cuesta un pedido
   * más. Va como enlace saliente en el perfil: quien mira a un jugador de la
   * escalera suele querer ver quién es, y hoy tenía que buscarlo a mano.
   */
  steamUrl: string | null;
}

interface RawSteam {
  account_id: number;
  personaname: string;
  avatarfull?: string;
  avatarmedium?: string;
  avatar?: string;
  countrycode?: string | null;
  matches_played_last_30d?: number;
  profileurl?: string;
}

/**
 * Busca cuentas por nombre.
 *
 * Se ordena por partidas de los últimos treinta días y **no por parecido del
 * nombre**: quien busca "zota" quiere a alguien que juega, no a la cuenta que
 * escribió ese nombre en 2014 y no abrió nunca el juego.
 */
export async function searchAccounts(query: string): Promise<SteamAccount[]> {
  const raw = await get<RawSteam[]>(`players/steam-search?search_query=${encodeURIComponent(query)}`);
  return raw
    .map((r) => ({
      accountId: r.account_id,
      name: r.personaname,
      avatar: r.avatarmedium ?? r.avatar ?? null,
      country: r.countrycode ?? null,
      recent: r.matches_played_last_30d ?? 0,
      steamUrl: r.profileurl ?? null,
    }))
    .sort((a, b) => b.recent - a.recent);
}

/** Una cuenta puntual, para poder dibujar el perfil de un link compartido. */
export async function fetchAccount(accountId: number): Promise<SteamAccount> {
  const r = await get<RawSteam | RawSteam[]>(`players/${accountId}/steam`);
  const one = Array.isArray(r) ? r[0] : r;
  if (!one) throw new MatchError("NOT_FOUND", "sin cuenta");
  return {
    accountId: one.account_id,
    name: one.personaname,
    avatar: one.avatarfull ?? one.avatarmedium ?? one.avatar ?? null,
    country: one.countrycode ?? null,
    recent: one.matches_played_last_30d ?? 0,
    steamUrl: one.profileurl ?? null,
  };
}

/**
 * Cuántas partidas de calibración pide Deadlock antes de destapar el rango.
 *
 * **Son ocho.** Medido el 2026-08-13 sobre once cuentas calibrando: para cada
 * una, el contador de su última clasificatoria menos uno, más las que le
 * faltaban al empezarla, da **8 en las once** — ver `PlayerRank.calibrationLeft`
 * para por qué va ese "menos uno". Se probó publicarlo como 9 y estaba mal.
 */
export const CALIBRATION_MATCHES = 8;

/** El rango actual de una cuenta, tal como lo cuenta el juego. */
export interface PlayerRank {
  /** `rango*10 + subnivel`. 0 mientras no haya rango. */
  badge: number;
  /**
   * Cuántas partidas de calibración le faltan **ahora**. Sólo importa mientras
   * `badge` sea 0.
   *
   * **La API no da este número: da el de antes de la última partida.** El campo
   * se llama `player_rank_initial_calibration_games`, y ese `initial` es literal
   * — como en sus hermanos del mismo bloque (`initial_display_rank`,
   * `initial_flat_progress`, `initial_win_streak`, verificado contra la racha
   * real), describe el estado **al empezar** esa partida, no al terminarla. Así
   * que las que faltan hoy son ese número menos uno.
   *
   * La prueba, sobre once cuentas: `(contador de esa partida − 1) + campo = 8`
   * en las once. El caso más limpio es el de quien lleva una sola calibración
   * —contador 1— y trae el campo en 8: antes de esa partida le faltaban las 8.
   *
   * **Se equivocó dos veces antes de quedar así.** Primero se leía como "cuántas
   * lleva", y una cuenta con 7 de 8 mostraba "2 de 8 · faltan 6" — el sitio le
   * decía que recién empezaba estando a una partida del rango, que es el "dice
   * que no tengo rango cuando ya terminé" que reportó ZoTaD. Después se
   * corrigió el sentido pero se tomó el número como si fuera el de ahora, y el
   * total se publicó como 9. **El nombre del campo era la pista las dos veces.**
   */
  calibrationLeft: number;
  /** Cuántas lleva jugadas, que es lo mismo dicho al derecho. */
  calibrationPlayed: number;
  /**
   * Si la cuenta está calibrando, que **no es lo mismo que `calibrationLeft > 0`**.
   *
   * Quien terminó las ocho y todavía no tiene insignia lleva 0 partidas por
   * delante y sigue calibrando; sin este campo aparte, esa persona vería
   * "todavía sin clasificatorias" justo el día que terminó de jugarlas.
   */
  calibrating: boolean;
  /** Lo que se movió el progreso en la última partida. Es el "LP" de Deadlock. */
  lastChange: number;
}

/**
 * El rango, del endpoint que lo sabe.
 *
 * **No sale del historial, y eso está medido**: de las 461 partidas de una
 * cuenta real, **ninguna** trae `ranked_display_badge` distinto de cero. Leerlo
 * de ahí mostraría "sin rango" a todo el mundo para siempre. `players/{id}/rank`
 * además distingue las dos cosas que se ven igual: un 0 porque la cuenta está
 * calibrando y un 0 porque no jugó ranked.
 */
export async function fetchRank(accountId: number): Promise<PlayerRank> {
  const r = await get<{
    badge?: number;
    last_match?: {
      player_rank_initial_calibration_games?: number;
      player_rank_desired_progress_change?: number;
    };
  }>(`players/${accountId}/rank`);
  /**
   * El `-1` es el corazón del asunto: el campo describe el estado ANTES de la
   * última partida, y esa partida ya se jugó. Se acota a [0, 8] para que una
   * cuenta ya calibrada —que trae el campo en 0— no produzca un "faltan −1".
   */
  const antes = r.last_match?.player_rank_initial_calibration_games ?? 0;
  const left = Math.min(CALIBRATION_MATCHES, Math.max(0, antes - 1));
  return {
    badge: r.badge ?? 0,
    calibrationLeft: left,
    calibrationPlayed: CALIBRATION_MATCHES - left,
    // Sin `last_match` la cuenta no jugó una sola clasificatoria: eso es "sin
    // rango", no "calibrando en cero".
    calibrating: antes > 0,
    lastChange: r.last_match?.player_rank_desired_progress_change ?? 0,
  };
}

/**
 * Los nombres de varias cuentas de una sola vez.
 *
 * **Un marcador sin nombres no es un marcador.** La metadata de la partida trae
 * `account_id` y nada más, así que sin esto los doce jugadores son doce números.
 * Se piden todos juntos —un pedido, ~90 KB— en vez de doce sueltos.
 *
 * Falla en silencio devolviendo lo que haya: quedarse sin nombres tiene que
 * costar los nombres, no el informe.
 */
export async function fetchNames(accountIds: number[]): Promise<Map<number, SteamAccount>> {
  const out = new Map<number, SteamAccount>();
  if (accountIds.length === 0) return out;
  try {
    const r = await get<RawSteam[]>(`players/steam?account_ids=${accountIds.join(",")}`);
    for (const s of r) {
      out.set(s.account_id, {
        accountId: s.account_id,
        name: s.personaname,
        steamUrl: s.profileurl ?? null,
        avatar: s.avatarmedium ?? s.avatar ?? null,
        country: s.countrycode ?? null,
        recent: s.matches_played_last_30d ?? 0,
      });
    }
  } catch {
    /* sin nombres, pero con informe */
  }
  return out;
}

/** Una fila del historial. Lo mínimo para elegir cuál abrir. */
export interface HistoryRow {
  matchId: number;
  heroId: number;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  durationS: number;
  startTime: number;
  /** El badge que el juego le mostró al jugador esa partida. 0 = sin rango. */
  badge: number;
  /** Golpes de gracia rematados. Medido sobre 475 filas: 99,8% distinto de cero, mediana 174. */
  lastHits: number;
  /** Súbditos negados al rival. Medido sobre 475 filas: 82,9% distinto de cero, mediana 4. */
  denies: number;
  /** El modo de esa partida, tal como lo manda la API. Ver `RANKED_MODE`. */
  mode: number;
  /**
   * En qué mapa se jugó. Ver `BRAWL_GAME_MODE`.
   *
   * **Es un campo distinto de `mode`, y hacen falta los dos**: `match_mode` dice
   * si contó para el rango y `game_mode` dice qué se jugó. La pelea callejera es
   * siempre `match_mode` sin rango, así que sólo con `mode` no se puede separar
   * de una partida normal.
   */
  gameMode: number;
}

interface RawHistory {
  match_id: number;
  hero_id: number;
  match_result: number;
  player_team: number;
  player_kills: number;
  player_deaths: number;
  player_assists: number;
  net_worth: number;
  match_duration_s: number;
  start_time: number;
  match_mode: number;
  game_mode: number;
  ranked_display_badge?: number;
  last_hits?: number;
  denies?: number;
}

/**
 * El historial de una cuenta, de la más nueva a la más vieja.
 *
 * `match_result` es **el equipo que ganó**, no si ganó este jugador: hay que
 * compararlo contra `player_team`. Leerlo como un booleano da el resultado dado
 * vuelta para la mitad de las partidas, que es la clase de error que se ve bien
 * en una captura y está mal en la mitad de los casos.
 *
 * **Trae todo lo que la API contesta, sin cortar.** El pedido ya baja el
 * historial entero en una sola respuesta (475 filas medidas sobre la cuenta de
 * prueba); cortarlo acá tiraba 435 filas que no costaban nada de guardar, y
 * filtrar por un héroe poco jugado devolvía dos partidas de las cuarenta
 * visibles en vez de las veinte que existen de verdad. `limit` queda
 * disponible para quien de verdad quiera un tope.
 */
export async function fetchHistory(accountId: number, limit = Infinity): Promise<HistoryRow[]> {
  const raw = await get<RawHistory[]>(`players/${accountId}/match-history`);
  return raw
    .slice(0, limit)
    .map((r) => ({
      matchId: r.match_id,
      heroId: r.hero_id,
      won: r.match_result === r.player_team,
      kills: r.player_kills,
      deaths: r.player_deaths,
      assists: r.player_assists,
      netWorth: r.net_worth,
      durationS: r.match_duration_s,
      startTime: r.start_time,
      badge: r.ranked_display_badge ?? 0,
      lastHits: r.last_hits ?? 0,
      denies: r.denies ?? 0,
      mode: r.match_mode,
      gameMode: r.game_mode,
    }));
}

/**
 * El modo de las partidas clasificatorias.
 *
 * **[asumido]**, sin documentación oficial: se dedujo de que el 4 es el único
 * modo donde aparece `ranked_calibration_match`, y de que las seis partidas
 * jugadas después del reset del 2026-07-30 lo traen todas. Ver el diseño.
 */
export const RANKED_MODE = 4;

/** La apertura de ranked, 2026-07-30 16:19 UTC, en segundos. */
export const RANKED_SINCE = Date.UTC(2026, 6, 30, 16, 19, 0) / 1000;

/**
 * El `game_mode` de la pelea callejera.
 *
 * **Medido, no leído de una tabla de enums**: el `GameMode` del OpenAPI es un
 * enum de strings (`normal`, `street_brawl`, …) y no dice qué número es cuál.
 * Sobre las 475 partidas de una cuenta real, las **42** filas con `game_mode` 4
 * son exactamente las que traen `brawl_score_team0/1` cargado, y ninguna de las
 * 433 con `game_mode` 1 lo trae. El marcador de rondas sólo existe en la pelea
 * callejera, así que el 4 es ese modo.
 */
export const BRAWL_GAME_MODE = 4;

/**
 * En qué modo mirar el perfil.
 *
 * **Los tres PARTEN el historial sin superponerse y sin dejar nada afuera**, que
 * es lo que hace que las cuentas cierren contra "todas". El orden importa: se
 * pregunta primero por la pelea callejera y después por las clasificatorias.
 *
 * `normal` es "ni una ni la otra", y eso incluye tres cosas que conviene saber
 * que están adentro: las sin clasificar de siempre, alguna partida contra bots
 * (1 de 475 en la cuenta medida) y **las de `match_mode` 4 anteriores al reset
 * del 2026-07-30** —40 en esa cuenta, de hasta 632 días antes, de una época en
 * la que ese modo significaba otra cosa—. Meterlas en "clasificatorias" sería
 * mezclar dos juegos distintos: no dan insignia ni cuentan para el rango de hoy.
 */
export type MatchScope = "all" | "ranked" | "normal" | "brawl";

export const MATCH_SCOPES: MatchScope[] = ["all", "ranked", "normal", "brawl"];

/** Si una partida entra en un modo. */
export function inScope(r: HistoryRow, scope: MatchScope): boolean {
  if (scope === "all") return true;
  const brawl = r.gameMode === BRAWL_GAME_MODE;
  if (scope === "brawl") return brawl;
  const ranked = !brawl && r.mode === RANKED_MODE && r.startTime >= RANKED_SINCE;
  return scope === "ranked" ? ranked : !brawl && !ranked;
}

export function scopeRows(rows: HistoryRow[], scope: MatchScope): HistoryRow[] {
  return scope === "all" ? rows : rows.filter((r) => inScope(r, scope));
}

/**
 * Cuántas partidas hay en cada modo.
 *
 * Va en las pastillas del filtro: **una opción que no dice cuántas tiene obliga
 * a apretarla para descubrir que está vacía.** Se recorre una sola vez y no
 * cuatro, que sobre 475 filas da igual pero deja la suma a la vista.
 */
export function scopeCounts(rows: HistoryRow[]): Record<MatchScope, number> {
  const out: Record<MatchScope, number> = { all: rows.length, ranked: 0, normal: 0, brawl: 0 };
  for (const r of rows) {
    if (r.gameMode === BRAWL_GAME_MODE) out.brawl++;
    else if (r.mode === RANKED_MODE && r.startTime >= RANKED_SINCE) out.ranked++;
    else out.normal++;
  }
  return out;
}

/**
 * Mínimo de partidas ranked para medir sólo sobre ellas.
 *
 * **[asumido]**: no sale de una medición —no hay con qué medirla todavía—, sino
 * de que 10 es la mitad de la ventana de `FORM_WINDOW` y el mínimo con el que
 * una racha no es anécdota. Revisar cuando haya cuentas con ranked de verdad.
 */
export const RANKED_MIN = 10;

/** La ventana de "forma reciente". */
export const FORM_WINDOW = 20;

export interface Corpus {
  /** Las filas sobre las que se mide, de la más nueva a la más vieja. */
  rows: HistoryRow[];
  /** true = no había ranked suficiente y se está midiendo sobre todas. */
  fallback: boolean;
  /** Cuántas ranked posteriores al reset se encontraron, se use o no ese camino. */
  ranked: number;
  /** Qué modo está mirando el perfil, para que el pie diga la verdad. */
  scope: MatchScope;
}

/**
 * Elige sobre qué filas medir la racha y la forma: mismo mecanismo que ya usa
 * la tier list para publicar una banda con muestra (`ON_FALLBACK_BAND`).
 *
 * **El modo 4 anterior al reset no cuenta nunca, ni en el camino de
 * respaldo.** Medido: hay 40 filas modo 4 de hasta 632 días antes del reset,
 * de una época del juego donde ese modo significaba otra cosa. Por eso el
 * corte exige el modo Y la fecha, no uno de los dos.
 *
 * **Con un modo elegido a mano no hay elección que hacer: manda el modo.** El
 * respaldo automático existe para cuando nadie dijo nada; si el visitante pidió
 * pelea callejera, medir sobre "todas porque hay pocas clasificatorias" sería
 * contestarle otra pregunta.
 */
export function rankedCorpus(rows: HistoryRow[], scope: MatchScope = "all"): Corpus {
  const ranked = rows.filter((r) => inScope(r, "ranked"));
  if (scope !== "all") {
    return { rows: scopeRows(rows, scope), fallback: false, ranked: ranked.length, scope };
  }
  if (ranked.length < RANKED_MIN) {
    return { rows: [...rows], fallback: true, ranked: ranked.length, scope: "all" };
  }
  return { rows: ranked, fallback: false, ranked: ranked.length, scope: "all" };
}

export interface Streak {
  length: number;
  won: boolean;
}

/**
 * La racha actual, contando desde la partida más reciente.
 *
 * Menos de dos partidas seguidas no es una racha: "1 victoria seguida" es la
 * última partida, no una tendencia.
 */
export function streakOf(rows: HistoryRow[]): Streak | null {
  if (rows.length === 0) return null;
  const won = rows[0].won;
  let length = 0;
  for (const r of rows) {
    if (r.won !== won) break;
    length++;
  }
  return length < 2 ? null : { length, won };
}

export interface Form {
  wins: number;
  losses: number;
  /** Un booleano por partida, la más reciente primero. Nunca se rellena. */
  results: boolean[];
}

/**
 * El resultado de las últimas `n` partidas del corpus.
 *
 * Con menos filas que la ventana, se informa lo que hay: no se rellena hasta
 * `n` con partidas que no se jugaron.
 */
export function formOf(rows: HistoryRow[], n: number = FORM_WINDOW): Form | null {
  if (rows.length === 0) return null;
  const results = rows.slice(0, n).map((r) => r.won);
  const wins = results.filter(Boolean).length;
  return { wins, losses: results.length - wins, results };
}

/** El resumen de un jugador sobre las partidas que trajo el historial. */
export interface PlayerSummary {
  matches: number;
  wins: number;
  winRate: number;
  kills: number;
  deaths: number;
  assists: number;
  /** (muertes + asistencias) / muertes, con las muertes en cero tratadas como una. */
  kda: number;
  netWorth: number;
  /** Almas por minuto, que es lo comparable entre partidas de distinto largo. */
  soulsPerMin: number;
  /** Golpes de gracia rematados, promedio por partida. */
  lastHits: number;
  /** Súbditos negados al rival, promedio por partida. */
  denies: number;
  /** El badge más reciente que no sea cero. 0 si ninguna partida lo trae. */
  badge: number;
  /** Los héroes más jugados, del más al menos. */
  heroes: { heroId: number; matches: number; wins: number }[];
}

/**
 * El resumen del perfil, calculado sobre lo que ya se bajó.
 *
 * **No pide un endpoint más**: sale del mismo historial que dibuja la lista. La
 * API tiene `players/hero-stats` con la carrera entera, pero eso contesta otra
 * pregunta —cómo jugaste siempre— y acá lo que se muestra es cómo venís.
 *
 * El badge sale de la partida más reciente que traiga uno **distinto de cero**:
 * desde el reset del 2026-07-30 una partida sin rango trae 0, y 0 no es Obscurus
 * —es "todavía no calibró"—. Ver `deadlock-ranked-y-reset`.
 */
export function summarize(rows: HistoryRow[]): PlayerSummary | null {
  if (rows.length === 0) return null;
  const n = rows.length;
  const suma = (f: (r: HistoryRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const wins = rows.filter((r) => r.won).length;
  const deaths = suma((r) => r.deaths) / n;
  const kills = suma((r) => r.kills) / n;
  const assists = suma((r) => r.assists) / n;

  const porHeroe = new Map<number, { heroId: number; matches: number; wins: number }>();
  for (const r of rows) {
    const h = porHeroe.get(r.heroId) ?? { heroId: r.heroId, matches: 0, wins: 0 };
    h.matches++;
    if (r.won) h.wins++;
    porHeroe.set(r.heroId, h);
  }

  return {
    matches: n,
    wins,
    winRate: wins / n,
    kills,
    deaths,
    assists,
    kda: (kills + assists) / Math.max(1, deaths),
    netWorth: suma((r) => r.netWorth) / n,
    soulsPerMin: suma((r) => r.netWorth) / Math.max(1, suma((r) => r.durationS) / 60),
    lastHits: suma((r) => r.lastHits) / n,
    denies: suma((r) => r.denies) / n,
    badge: rows.find((r) => r.badge > 0)?.badge ?? 0,
    heroes: [...porHeroe.values()].sort((a, b) => b.matches - a.matches || b.wins - a.wins),
  };
}

/**
 * El rango partida por partida, para marcar en cuál se ascendió.
 *
 * **No sale del historial**: `ranked_display_badge` da 0 en las 475 filas
 * medidas. Sale de `players/{id}/mmr-history`, que devuelve una entrada por
 * partida clasificatoria con su `rank` — verificado el 2026-08-13 sobre una
 * cuenta real: 75 entradas en 9,8 KB, y se ven los saltos (111→112→113→114).
 *
 * Un pedido por perfil, y **puede fallar sin llevarse la página**: sin esto el
 * historial se dibuja igual, sin las marcas de ascenso.
 */
export interface RankStep {
  matchId: number;
  /** El badge después de esa partida. */
  badge: number;
  /** El badge que traía antes. 0 si es la primera con rango. */
  previo: number;
  /** Cuánto se movió respecto de la partida anterior. */
  delta: number;
}

interface RawMmrHistory {
  match_id: number;
  rank?: number;
  player_score?: number;
}

export async function fetchRankSteps(accountId: number): Promise<Map<number, RankStep>> {
  const out = new Map<number, RankStep>();
  try {
    const raw = await get<RawMmrHistory[]>(`players/${accountId}/mmr-history`);
    // Viene de la más vieja a la más nueva, que es lo que hace que el delta se
    // pueda calcular mirando la anterior.
    let previo: number | null = null;
    for (const r of raw) {
      const badge = r.rank ?? 0;
      if (badge > 0) {
        out.set(r.match_id, {
          matchId: r.match_id,
          badge,
          previo: previo ?? 0,
          delta: previo === null ? 0 : badge - previo,
        });
        previo = badge;
      }
    }
  } catch {
    /* sin marcas de ascenso, pero con historial */
  }
  return out;
}

/** Una compra: qué, cuándo, y si dejó de estar. */
export interface Purchase {
  itemId: number;
  /** Segundo de partida en que se compró. */
  buyS: number;
  /** Segundo en que dejó de tenerlo, 0 si lo terminó con él. Mejorar también cuenta. */
  soldS: number;
  /** La habilidad a la que se imbuyó, 0 si a ninguna. */
  imbued: number;
}

/** Un punto de la partida: cuántas almas llevaba ese jugador en ese segundo. */
export interface SoulPoint {
  t: number;
  netWorth: number;
}

export interface MatchPlayer {
  accountId: number;
  slot: number;
  heroId: number;
  team: number;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  level: number;
  /** Daño a héroes al terminar. */
  damage: number;
  /** Daño a objetivos al terminar. */
  boss: number;
  /** Curación repartida al terminar, propia y a compañeros. */
  healing: number;
  /** Cuántos puntos de habilidad llegó a gastar. */
  abilityPoints: number;
  /** El carril que le tocó, si la partida lo trae. */
  lane: number;
  purchases: Purchase[];
  /**
   * La curva de patrimonio, muestreada cada ~4 minutos.
   *
   * Viene en la misma metadata que todo lo demás, así que dibujarla no cuesta
   * un pedido más: es la serie `stats` que ya se lee para sacar el daño final.
   */
  souls: SoulPoint[];
  /** Cuánto daño le hizo cada rival, por `slot`. */
  damageFrom: Map<number, number>;
}

export interface ParsedMatch {
  matchId: number;
  durationS: number;
  startTime: number;
  winningTeam: number;
  /** El promedio de rango de la sala, `rango*10 + subnivel`. 0 si no lo trae. */
  badge: number;
  players: MatchPlayer[];
}

interface RawPlayer {
  account_id: number;
  player_slot: number;
  hero_id: number;
  team: number;
  kills: number;
  deaths: number;
  assists: number;
  net_worth: number;
  level: number;
  ability_points?: number;
  assigned_lane?: number;
  items?: { item_id: number; game_time_s: number; sold_time_s?: number; imbued_ability_id?: number }[];
  stats?: Record<string, number>[];
}

interface RawMatch {
  match_info: {
    match_id: number;
    duration_s: number;
    start_time: number;
    winning_team: number;
    average_badge_team0?: number;
    average_badge_team1?: number;
    players: RawPlayer[];
    damage_matrix?: {
      damage_dealers?: {
        dealer_player_slot: number;
        damage_sources?: { damage_to_players?: { target_player_slot: number; damage: number[] }[] }[];
      }[];
    };
  };
}

/** El último valor de una serie acumulada, que es el total al terminar. */
const last = (rows: Record<string, number>[] | undefined, key: string): number => {
  if (!rows || rows.length === 0) return 0;
  return Number(rows[rows.length - 1]?.[key] ?? 0);
};

/**
 * Reduce la metadata cruda a lo que el informe usa.
 *
 * **El `game_time_s` de una compra puede venir envuelto.** Es UINTEGER del lado
 * del snapshot y una compra anterior al reloj —en la pantalla de picks— aparece
 * como ~2^32 en vez de negativa. Se descartan las que caen fuera de las seis
 * horas, que no existen como partida.
 */
export function parseMatch(raw: RawMatch): ParsedMatch {
  const mi = raw.match_info;
  const desde = new Map<number, Map<number, number>>();

  for (const d of mi.damage_matrix?.damage_dealers ?? []) {
    for (const s of d.damage_sources ?? []) {
      for (const t of s.damage_to_players ?? []) {
        const serie = t.damage ?? [];
        if (serie.length === 0) continue;
        const porVictima = desde.get(t.target_player_slot) ?? new Map<number, number>();
        // Las series son acumuladas: el último punto es el total de esa fuente.
        porVictima.set(d.dealer_player_slot, (porVictima.get(d.dealer_player_slot) ?? 0) + serie[serie.length - 1]);
        desde.set(t.target_player_slot, porVictima);
      }
    }
  }

  const players = mi.players.map((p) => ({
    accountId: p.account_id,
    slot: p.player_slot,
    heroId: p.hero_id,
    team: p.team,
    won: p.team === mi.winning_team,
    kills: p.kills ?? 0,
    deaths: p.deaths ?? 0,
    assists: p.assists ?? 0,
    netWorth: p.net_worth ?? 0,
    level: p.level ?? 0,
    damage: last(p.stats, "player_damage"),
    boss: last(p.stats, "boss_damage"),
    healing: last(p.stats, "player_healing") + last(p.stats, "teammate_healing"),
    abilityPoints: p.ability_points ?? 0,
    lane: p.assigned_lane ?? 0,
    purchases: (p.items ?? [])
      .filter((i) => i.item_id > 0 && i.game_time_s >= 0 && i.game_time_s <= 21_600)
      .map((i) => ({
        itemId: i.item_id,
        buyS: i.game_time_s,
        soldS: i.sold_time_s ?? 0,
        imbued: i.imbued_ability_id ?? 0,
      }))
      .sort((a, b) => a.buyS - b.buyS),
    souls: (p.stats ?? [])
      .map((s) => ({ t: Number(s.time_stamp_s ?? 0), netWorth: Number(s.net_worth ?? 0) }))
      .filter((s) => s.t > 0),
    damageFrom: desde.get(p.player_slot) ?? new Map<number, number>(),
  }));

  return {
    matchId: mi.match_id,
    durationS: mi.duration_s,
    startTime: mi.start_time,
    winningTeam: mi.winning_team,
    // Se promedian **los que vinieron**: uno de los dos equipos puede llegar en
    // cero, y dividir siempre por dos convertiría un Oráculo en un Ritualista.
    badge: (() => {
      const b = [mi.average_badge_team0 ?? 0, mi.average_badge_team1 ?? 0].filter((x) => x > 0);
      return b.length === 0 ? 0 : Math.round(b.reduce((a, x) => a + x, 0) / b.length);
    })(),
    players,
  };
}

export async function fetchMatch(matchId: number): Promise<ParsedMatch> {
  return parseMatch(await get<RawMatch>(`matches/${matchId}/metadata`));
}
