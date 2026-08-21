import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RANKS } from "./bands";
import {
  BADGE,
  PLAYED_GAME_MODE,
  PLAYED_MODE,
  bandablePartitions,
  connect,
  listPartitions,
  partitionRanges,
  partitionUrl,
  partitionsCovering,
  partitionsWithColumn,
  retryingOnRewrite,
  windowEnd,
} from "./snapshot";

/**
 * La escalera de rangos: cuánta gente hay en cada escalón y cómo se mueve.
 *
 * **Es la única medición del sitio que no va por banda**, y no es una excepción
 * caprichosa: la escalera *es* el eje sobre el que se definen las bandas.
 * Preguntar "¿cuánta gente hay en cada rango, dentro de Oráculo?" no significa
 * nada.
 *
 * Contesta tres cosas distintas con dos fuentes distintas, y conviene no
 * mezclarlas:
 *
 * - **En qué rango se juega** sale de `average_badge`, el promedio de la sala.
 *   Cubre el 100% de las partidas y es el mismo dato con el que se arman las
 *   bandas, así que no puede contradecir a la tier list.
 * - **Cuánta gente hay en cada rango** sale de
 *   `player_rank_initial_display_rank`, que es por jugador y **sólo existe en
 *   partidas rankeadas**. Al 2026-08-01 cubría el 47,6% de las filas y subía
 *   todos los días (2,3% el 30/7, 23,8% el 31/7).
 * - **Cómo se mueve día a día** son las dos series cortadas por fecha. Es el eje
 *   que ningún competidor publica, y describe algo que sólo se puede mirar una
 *   vez en la vida del juego: la escalera reconstruyéndose después del reset del
 *   2026-07-30.
 *
 * Diseño en `docs/design/2026-08-01-escalera-lados-maestria-y-parche-design.md`.
 */

const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/ranks.json`;

/**
 * Desde cuándo hay escalera que medir.
 *
 * La cola rankeada abrió el **2026-07-30 16:19 UTC** y el rango por jugador sólo
 * existe en partidas rankeadas, así que antes de esa fecha no hay nada que
 * contar.
 *
 * **Esta ventana no es la de quince días del resto del pipeline, a propósito.**
 * "¿Cómo se reconstruye la escalera?" es una pregunta acumulativa: recortarla a
 * quince días borraría la historia justo cuando empiece a ser interesante. El
 * corpus sigue siendo ranked-only, que es lo que manda en todo el sitio.
 */
const RANKED_FROM = "2026-07-30";

/**
 * Cuántas partidas necesita un rango para que su lado del mapa se dibuje.
 *
 * A 20.000 partidas el error estándar de un winrate es 0,35 pp, que alcanza para
 * separar del 50% al efecto medido en los extremos de la escalera (de −1,3 a
 * +2,4 pp sobre una ventana ancha). Con la muestra ranked de hoy no lo alcanza
 * ningún rango —el más poblado, Oráculo, tenía 8.181 partidas el 2026-08-01— y
 * eso es correcto: **la tabla se completa sola** a medida que el corpus crece,
 * a razón de unas 15.000 partidas rankeadas por día.
 */
const SIDE_MIN_MATCHES = 20_000;

/**
 * El rango de un badge, en SQL.
 *
 * **`floor` y no un cast a secas.** DuckDB divide de verdad: `86 / 10` es `8.6` y
 * `(8.6)::INT` **redondea a 9**, así que un Oráculo 6 aparecería como Fantasma.
 * La primera medición hecha para diseñar esto salió mal exactamente por acá, y el
 * error no se ve en el resultado: devuelve una escalera creíble con la gente
 * corrida un escalón. Hay un test que fija la forma de la expresión.
 */
export const tierOfBadgeSql = (col = "badge"): string => `floor(${col} / 10.0)::INT`;

/**
 * El error estándar de un winrate, en puntos (0..1).
 *
 * Se usa `0,5/√n` y no `√(p(1−p)/n)` porque cerca del 50% son el mismo número, y
 * el primero **no depende de la estimación**: sirve para decidir si vale la pena
 * mirarla antes de haberla mirado.
 */
export const seOf = (matches: number): number => (matches > 0 ? 0.5 / Math.sqrt(matches) : Infinity);

export interface SideRaw {
  tier: number;
  matches: number;
  team0Wins: number;
}

export interface SideRow {
  tier: number;
  matches: number;
  /** Winrate del lado 0, en 0..1. */
  team0: number;
  /** Error estándar, en la misma escala. */
  se: number;
}

/**
 * El lado del mapa por rango, dejando afuera lo que no se puede leer.
 *
 * **Un rango con poca muestra no se dibuja.** Es el mismo criterio que
 * `MIN_FOR_DELTA` en `build.ts`: la ausencia dice "no sé", mientras que un punto
 * dibujado sobre el 50% diría "acá no pasa nada", que es una afirmación distinta
 * y probablemente falsa.
 */
export function sidesFrom(raw: SideRaw[], min: number): SideRow[] {
  return raw
    .filter((r) => r.matches >= min)
    .map((r) => ({
      tier: r.tier,
      matches: r.matches,
      team0: r.team0Wins / r.matches,
      se: seOf(r.matches),
    }))
    .sort((a, b) => a.tier - b.tier);
}

/**
 * Cuánta gente tiene rango conocido: **la del último día, no la del período**.
 *
 * El período arrastra los días de calibración temprana —2,3% el 30/7— que ya no
 * describen a nadie. El cartel que va en pantalla tiene que decir cómo está hoy,
 * porque de eso depende cuánto creerle a la mitad de la página.
 */
export function coverageOf(dias: { day: string; rows: number; ranked: number }[]): number {
  if (dias.length === 0) return 0;
  const ultimo = [...dias].sort((a, b) => a.day.localeCompare(b.day))[dias.length - 1];
  return ultimo.rows > 0 ? ultimo.ranked / ultimo.rows : 0;
}

export interface DayRaw {
  day: string;
  tier: number;
  matches: number;
  players: number;
}

export interface RankDay {
  day: string;
  /** Indexado por rango, 0 = Obscurus … 11 = Eternus. */
  matches: number[];
  players: number[];
}

/**
 * De filas sueltas a una serie sin huecos.
 *
 * Cada día trae los doce rangos aunque estén en cero. Un gráfico que recibe
 * arrays de distinto largo según el día se dibuja torcido, y acá el cero es
 * información real: "ese día nadie jugó en Fantasma" es justamente lo que la
 * página quiere mostrar mientras dure la reconstrucción.
 */
export function daysFrom(raw: DayRaw[]): RankDay[] {
  const porDia = new Map<string, RankDay>();
  for (const r of raw) {
    let dia = porDia.get(r.day);
    if (!dia) {
      dia = {
        day: r.day,
        matches: Array(RANKS.length).fill(0) as number[],
        players: Array(RANKS.length).fill(0) as number[],
      };
      porDia.set(r.day, dia);
    }
    // Un rango fuera de tabla se descarta en vez de agrandar el array: el día que
    // Valve agregue un escalón, esto tiene que fallar en `RANKS` y no acá.
    if (r.tier >= 0 && r.tier < RANKS.length) {
      dia.matches[r.tier] = r.matches;
      dia.players[r.tier] = r.players;
    }
  }
  return [...porDia.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Un escalón real de la escalera: rango **y subnivel**.
 *
 * **La granularidad fina es lo que convierte una lista en una distribución.** Con
 * los doce rangos agregados, la escalera son doce barras y no se ve la forma; con
 * los subniveles son hasta 72 escalones y aparece la curva —dónde se amontona la
 * gente, dónde hay un escalón vacío, dónde corta el techo—. El dato siempre
 * estuvo: el badge vale `rango*10 + subnivel`, y dividir por diez lo tiraba.
 *
 * La muestra lo aguanta: 37.569 jugadores repartidos en ~48 escalones ocupados
 * dan ~780 cada uno.
 */
export interface RankBin {
  /** El badge crudo: `rango*10 + subnivel`. */
  badge: number;
  tier: number;
  /** 1 a 6. El juego numera los subniveles desde 1, no desde 0. */
  sub: number;
  matches: number;
  players: number;
}

export interface RanksFile {
  generatedAt: string;
  from: string;
  to: string;
  /** Fracción de filas de jugador con rango conocido, del último día medido. */
  coverage: number;
  accounts: { seen: number; ranked: number };
  days: RankDay[];
  totals: { matches: number[]; players: number[] };
  /** La distribución fina, un escalón por subrango. */
  bins: RankBin[];
  sides: SideRow[];
  sidesOverall: SideRow;
}

/**
 * De filas sueltas a la distribución fina, sin escalones fantasma.
 *
 * **Se rellenan los huecos interiores pero no los extremos.** Un escalón vacío
 * entre dos poblados es información real y el gráfico tiene que mostrar el bache;
 * en cambio, dibujar los veinte escalones de Ascendente y Eternus a cero mientras
 * la escalera topea en Oráculo sería media pantalla en blanco que no dice nada.
 */
export function binsFrom(raw: { badge: number; matches: number; players: number }[]): RankBin[] {
  const porBadge = new Map<number, { matches: number; players: number }>();
  for (const r of raw) {
    const prev = porBadge.get(r.badge) ?? { matches: 0, players: 0 };
    porBadge.set(r.badge, { matches: prev.matches + r.matches, players: prev.players + r.players });
  }

  const badges = [...porBadge.keys()].filter((b) => b > 0);
  if (badges.length === 0) return [];
  const min = Math.min(...badges);
  const max = Math.max(...badges);

  const out: RankBin[] = [];
  for (let badge = min; badge <= max; badge++) {
    const sub = badge % 10;
    // El subnivel 0 no existe: el juego los numera de 1 a 6, así que `x0` es un
    // hueco de la numeración y no un escalón al que se pueda llegar.
    if (sub < 1 || sub > 6) continue;
    const v = porBadge.get(badge) ?? { matches: 0, players: 0 };
    out.push({ badge, tier: Math.floor(badge / 10), sub, matches: v.matches, players: v.players });
  }
  return out;
}

/**
 * La ventana, partición por partición y nombrando las columnas.
 *
 * **Nombrarlas es obligatorio**: las particiones no comparten esquema (139
 * columnas las viejas, 153 las nuevas) y un `select *` entre dos de distinto
 * ancho falla con "Set operations can only apply to expressions with the same
 * number of result columns". Y `player_rank_initial_display_rank` sólo existe en
 * las nuevas, así que a las que no la tienen se les pone `NULL` en su lugar en
 * vez de descartarlas.
 */
function windowFrom(parts: number[], conRango: Set<number>, from: string, to: string): string {
  return parts
    .map(
      (n) => `
    select start_time, strftime(start_time, '%Y-%m-%d') as day, match_id, account_id, won, team,
           ${BADGE} as badge,
           ${conRango.has(n) ? "player_rank_initial_display_rank" : "NULL::INTEGER"} as rango
    from read_parquet('${partitionUrl(n)}')
    where match_mode = '${PLAYED_MODE}' and game_mode = '${PLAYED_GAME_MODE}'
      and start_time >= TIMESTAMP '${from}' and start_time < TIMESTAMP '${to}'`
    )
    .join(" union all ");
}

async function main() {
  const con = await connect();
  const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjects();

  const partitions = await listPartitions();
  const ranges = await partitionRanges(con, partitions);
  const hasta = (await windowEnd(con, ranges)).toISOString();
  const parts = await bandablePartitions(con, partitionsCovering(ranges, RANKED_FROM, hasta));
  if (parts.length === 0) {
    throw new Error(
      `no hay ni una partición con rangos entre ${RANKED_FROM} y ${hasta.slice(0, 10)}. ` +
        "O el snapshot dejó de actualizarse, o dejó de traer el badge."
    );
  }

  const conRango = new Set(await partitionsWithColumn(con, parts, "player_rank_initial_display_rank"));
  const sinRango = parts.filter((n) => !conRango.has(n));
  if (sinRango.length > 0) {
    console.log(`  particiones sin rango por jugador (esquema viejo): ${sinRango.join(", ")}`);
  }

  console.log(`  ventana ${RANKED_FROM} → ${hasta.slice(0, 10)}, particiones ${parts.join(", ")}`);
  await con.run(`create or replace table w as ${windowFrom(parts, conRango, RANKED_FROM, hasta)}`);

  const T = tierOfBadgeSql();
  const R = tierOfBadgeSql("rango");

  /**
   * Las dos series se cuentan por separado y se unen con `full outer join`: un
   * día puede tener partidas en un rango y ningún jugador clasificado ahí, o al
   * revés. Un `inner join` borraría justamente los escalones que la página
   * quiere mostrar vacíos.
   */
  const porDia = (await rows(`
    with m as (
      select day, ${T} as tier, count(distinct match_id)::BIGINT as matches
      from w where badge > 0 group by 1, 2
    ), p as (
      select day, ${R} as tier, count(distinct account_id)::BIGINT as players
      from w where rango > 0 group by 1, 2
    )
    select coalesce(m.day, p.day) as day,
           coalesce(m.tier, p.tier)::INTEGER as tier,
           coalesce(m.matches, 0)::BIGINT as matches,
           coalesce(p.players, 0)::BIGINT as players
    from m full outer join p on m.day = p.day and m.tier = p.tier
    order by 1, 2`)) as unknown as { day: string; tier: number; matches: bigint; players: bigint }[];

  /**
   * La distribución fina, por subrango.
   *
   * Las dos mitades se cuentan por separado y se unen con `full outer join`, por
   * lo mismo que la serie diaria: un escalón puede tener partidas y ningún
   * jugador clasificado, o al revés.
   *
   * Los jugadores van por su **último** badge conocido, igual que los totales por
   * rango: contarlos en cada escalón por el que pasaron sumaría más gente que la
   * que hay.
   */
  const finos = (await rows(`
    with m as (
      select badge::INTEGER as badge, count(distinct match_id)::BIGINT as matches
      from w where badge > 0 group by 1
    ), u as (
      select account_id, rango::INTEGER as badge,
             row_number() over (partition by account_id order by start_time desc) as n
      from w where rango > 0
    ), p as (
      select badge, count(*)::BIGINT as players from u where n = 1 group by 1
    )
    select coalesce(m.badge, p.badge)::INTEGER as badge,
           coalesce(m.matches, 0)::BIGINT as matches,
           coalesce(p.players, 0)::BIGINT as players
    from m full outer join p on m.badge = p.badge
    order by 1`)) as unknown as { badge: number; matches: bigint; players: bigint }[];

  const cobertura = (await rows(`
    select day, count(*)::BIGINT as rows, count(case when rango > 0 then 1 end)::BIGINT as ranked
    from w group by 1 order by 1`)) as unknown as { day: string; rows: bigint; ranked: bigint }[];

  const [cuentas] = (await rows(`
    select count(distinct account_id)::BIGINT as seen,
           count(distinct case when rango > 0 then account_id end)::BIGINT as ranked
    from w`)) as unknown as { seen: bigint; ranked: bigint }[];

  /**
   * El lado del mapa. `won` ya viene resuelto por el snapshot, así que no hay que
   * comparar `team` contra `winning_team`: se cuentan las filas del lado 0 que
   * ganaron sobre las partidas que tuvieron lado 0, que son todas.
   */
  const lados = (await rows(`
    select ${T} as tier,
           count(distinct match_id)::BIGINT as matches,
           count(distinct case when team::VARCHAR = 'Team0' and won then match_id end)::BIGINT as team0Wins
    from w where badge > 0 group by 1 order by 1`)) as unknown as {
    tier: number;
    matches: bigint;
    team0Wins: bigint;
  }[];

  const [global] = (await rows(`
    select count(distinct match_id)::BIGINT as matches,
           count(distinct case when team::VARCHAR = 'Team0' and won then match_id end)::BIGINT as team0Wins
    from w where badge > 0`)) as unknown as { matches: bigint; team0Wins: bigint }[];

  const days = daysFrom(
    porDia.map((r) => ({
      day: r.day,
      tier: Number(r.tier),
      matches: Number(r.matches),
      players: Number(r.players),
    }))
  );

  /**
   * Los totales del período.
   *
   * Las partidas **se suman** —cada una pasó un día y uno solo— pero los
   * jugadores **no se pueden sumar**: quien jugó tres días aparecería tres veces,
   * y quien subió de rango aparecería en dos escalones. Se cuenta cada cuenta una
   * vez, **en su último rango conocido**, que es la respuesta a la pregunta que
   * hace la página ("¿cuánta gente hay hoy en cada escalón?").
   */
  const ultimoRango = (await rows(`
    with u as (
      select account_id, ${R} as tier,
             row_number() over (partition by account_id order by start_time desc) as n
      from w where rango > 0
    )
    select tier::INTEGER as tier, count(*)::BIGINT as players
    from u where n = 1 group by 1 order by 1`)) as unknown as { tier: number; players: bigint }[];

  const cero = () => Array(RANKS.length).fill(0) as number[];
  const jugadores = cero();
  for (const f of ultimoRango) {
    const t = Number(f.tier);
    if (t >= 0 && t < RANKS.length) jugadores[t] = Number(f.players);
  }
  const totals = {
    matches: days.reduce((acc, d) => acc.map((v, i) => v + d.matches[i]), cero()),
    players: jugadores,
  };

  const file: RanksFile = {
    generatedAt: new Date().toISOString(),
    from: days[0]?.day ?? RANKED_FROM,
    to: days[days.length - 1]?.day ?? RANKED_FROM,
    coverage: coverageOf(
      cobertura.map((c) => ({ day: c.day, rows: Number(c.rows), ranked: Number(c.ranked) }))
    ),
    accounts: { seen: Number(cuentas.seen), ranked: Number(cuentas.ranked) },
    days,
    totals,
    bins: binsFrom(
      finos.map((f) => ({ badge: Number(f.badge), matches: Number(f.matches), players: Number(f.players) }))
    ),
    sides: sidesFrom(
      lados.map((l) => ({ tier: Number(l.tier), matches: Number(l.matches), team0Wins: Number(l.team0Wins) })),
      SIDE_MIN_MATCHES
    ),
    // El global se arma con el mismo constructor y umbral cero: es el único
    // número del panel que hoy tiene muestra, y `tier: -1` lo marca como "todos".
    sidesOverall: sidesFrom(
      [{ tier: -1, matches: Number(global.matches), team0Wins: Number(global.team0Wins) }],
      0
    )[0],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(file));

  const top = totals.matches.reduce((mejor, n, i) => (n > 0 ? i : mejor), 0);
  console.log(
    `  ${days.length} días (${file.from} → ${file.to}), rango más alto con partidas: ${RANKS[top]}`
  );
  console.log(
    `  ${file.bins.length} escalones de subrango, de ${file.bins[0]?.badge ?? "—"} a ` +
      `${file.bins[file.bins.length - 1]?.badge ?? "—"}`
  );
  console.log(
    `  ${file.accounts.ranked.toLocaleString("es")} de ${file.accounts.seen.toLocaleString("es")} cuentas con rango, ` +
      `cobertura del último día ${(file.coverage * 100).toFixed(1)}%`
  );
  console.log(
    `  lado del mapa: global ${(file.sidesOverall.team0 * 100).toFixed(2)}% ` +
      `±${(file.sidesOverall.se * 100).toFixed(2)} en ${file.sidesOverall.matches.toLocaleString("es")} partidas, ` +
      `${file.sides.length} rangos con muestra propia`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // La partición viva se reescribe cada ~70 minutos; si cambia en el medio,
  // DuckDB aborta por ETag. Reintentar es más honesto que desactivar el chequeo.
  retryingOnRewrite(main).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
