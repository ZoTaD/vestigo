import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import {
  connect,
  listPartitions,
  partitionRanges,
  partitionsCovering,
  partitionUrl,
  PLAYED_MODE,
  PLAYED_GAME_MODE,
  MAX_WINDOW_DAYS,
  retryingOnRewrite,
  windowEnd,
  bandablePartitions,
  PROVISIONAL_MATCHES,
  BADGE,
} from "./snapshot";
import { fetchPatches } from "./patches";
import { BANDS, widestBand } from "./bands";
import { MEASURED } from "./mechanism";

/**
 * La referencia del informe de partida.
 *
 *   npm run build:report
 *
 * Publica `report.json`: lo que hicieron **los que ganaron** en cada situación,
 * que es contra lo que se compara tu partida. No publica ni un consejo — los
 * consejos son plantillas que leen esta tabla, y viven en el navegador
 * (`deadlockAdvice.ts`). Acá sólo se mide.
 *
 * Diseño: `docs/design/2026-08-11-informe-de-partida-deadlock-design.md`.
 *
 * **Es una sola banda** —cuatro multiplican por cuatro un archivo que ya es el
 * más pesado que publicamos— pero **desde el 2026-08-16 es la de MÁS MUESTRA y
 * no la publicada por defecto**, al revés que las builds. La diferencia importa:
 * la tier list elige su banda por criterio editorial y la nota es una
 * calibración, que mejora con datos y no con selección. Ver `widestBand`.
 * La página dice contra qué banda te está comparando en vez de callarlo.
 */

const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/report.json`;
const CATALOG = `${OUT_DIR}/catalog.json`;
const DETAIL = `${OUT_DIR}/items-detail.json`;
const BUILDS = `${OUT_DIR}/builds.json`;

/**
 * Cuántos ganadores necesita una celda (héroe × perfil rival) para publicar sus
 * tasas de compra.
 *
 * Con menos que esto, "el 62% de los ganadores compró X" es una frase construida
 * sobre trece personas. El informe prefiere no decir nada: una celda que no llega
 * simplemente no aparece, y las familias que la necesitaban se callan.
 */
const MIN_CELL = 200;

/** Debajo de esta tasa un ítem no entra en la tabla: no describe a la situación. */
const MIN_RATE = 0.05;

/**
 * Cuántos jugadores necesita un (héroe × tramo de duración) para tener nota.
 *
 * Los cortes son percentiles, así que el ruido no se promedia: con muestra fina
 * el corte de "A+" lo fija un puñado de partidas. Sin esto no hay letra, que es
 * lo acordado — un hueco es honesto y una letra inventada no.
 */
const MIN_GRADE_CELL = 300;

/**
 * Los cortes de la nota, en percentiles del compuesto.
 *
 * Nueve letras, y **la escala no es simétrica a propósito**: A+ es el 4% de
 * arriba y D el 5% de abajo, con el grueso en las tres B. Una nota que reparte
 * nueve letras en partes iguales convierte a la mediana en un aprobado raspando,
 * y la mitad de las partidas son medianas.
 */
const GRADE_CUTS = [0.05, 0.15, 0.3, 0.45, 0.6, 0.75, 0.88, 0.96];

/** De peor a mejor, en el mismo orden en que `GRADE_CUTS` las separa. */
export const LETTERS = ["D", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];

interface CatalogItem {
  cost: number;
  tier: number;
  slot: string;
  upgradesTo?: number[];
  upgradesFrom?: number[];
}

interface Stat {
  label: string;
  value: string;
}

/**
 * Qué ítems dan resistencia, leído de la ficha del juego.
 *
 * **No es una lista escrita a mano y no puede serlo**: son 34 objetos y cambian
 * con cada parche. Un ítem da resistencia de espíritu si su sección **innata**
 * declara la stat `Spirit Resist` con valor positivo, que es exactamente lo que
 * el jugador ve en la tienda.
 *
 * La sección importa: `Escalating Exposure` declara también `Spirit Resist On
 * Spirit Damage = -8`, que es lo que le saca al rival, y esa etiqueta no es
 * ésta. Y el valor positivo importa por lo mismo. Ojo con la trampa contraria,
 * que ya casi cuesta una lista negra: `Mystic Vulnerability` y `Bullet Resist
 * Shredder` **sí te dan resistencia** (8 y 9) además de sacársela al rival, así
 * que están bien adentro.
 */
export function resistItems(detail: Record<string, { en: { sections: unknown[] } }>, label: string): number[] {
  const out: number[] = [];
  for (const [id, v] of Object.entries(detail)) {
    const secciones = (v.en?.sections ?? []) as {
      kind: string;
      blocks: { stats?: Stat[]; boxed?: { stats?: Stat[] }[] }[];
    }[];
    const da = secciones
      .filter((s) => s.kind === "innate")
      .some((s) =>
        (s.blocks ?? []).some((b) =>
          [...(b.stats ?? []), ...(b.boxed ?? []).flatMap((x) => x.stats ?? [])].some(
            (st) => st.label === label && Number(st.value) > 0
          )
        )
      );
    if (da) out.push(Number(id));
  }
  return out.sort((a, b) => a - b);
}

/** Lo que se publica. La UI no vuelve a calcular nada de esto. */
export interface ReportFile {
  generatedAt: string;
  band: string;
  window: { from: string; to: string; matches: number; players: number };
  crossesPatch: boolean;
  patch: { title: string; date: string } | null;
  /** Los dos cortes que parten la cuota de espíritu del rival en tres perfiles. */
  profileCuts: [number, number];
  /** Los dos cortes de duración, en segundos. */
  durationCuts: [number, number];
  /**
   * Un peso por señal, en el orden de `SIGNALS`, ya normalizados para que sus
   * magnitudes sumen 1. El de muertes es negativo: morir resta.
   */
  weights: number[];
  signals: string[];
  /**
   * Cuánto se solapan los rangos intercuartiles de la nota entre ganadores y
   * perdedores.
   *
   * **Es el número que decide si la nota sirve**, y por eso se publica en vez de
   * quedarse en un log: si los que perdieron sacaran todos una letra baja, la
   * nota sería el marcador con otro nombre. Hay un test que lo vigila.
   */
  overlap: number;
  /** Los ítems que dan cada resistencia, según la ficha del juego. */
  resist: { spirit: number[]; weapon: number[] };
  heroes: Record<string, HeroReport>;
}

export interface HeroReport {
  /** Ganadores medidos, por si hace falta explicar una ausencia. */
  n: number;
  /** Por tramo de duración: los ocho cortes del compuesto. Falta si no hay muestra. */
  grade: Record<string, number[]>;
  /** Media y desvío de cada señal, por tramo: el navegador normaliza igual que acá. */
  norm: Record<string, [number, number][]>;
  /** Por perfil rival: `itemId -> [tasa entre ganadores, minuto mediano]`. */
  buys: Record<string, Record<string, [number, number]>>;
  /** Reparto mediano de almas de un ganador: arma, vitalidad, espíritu. */
  split: [number, number, number];
  /** Qué fracción de los ganadores imbuyó alguna habilidad. */
  imbue: number;
  /** Almas sin gastar al terminar, medianas de un ganador. */
  souls: number;
  /** Cuántos objetos tenía en la mano al terminar, mediana de un ganador. */
  slots: number;
  /** `itemId -> fracción de ganadores que lo compró y lo vendió`. */
  sold: Record<string, number>;
}

/**
 * Las tres señales de la nota, en el orden en que viajan los pesos.
 *
 * Son las mismas que midió el mecanismo —economía, daño y muertes—, y por eso
 * son tres: el daño a objetivos y el mitigado quedan afuera porque nadie midió
 * cuánto valen. Cada una es **cuota del propio equipo**, no un número por
 * minuto; el porqué está en el comentario de `base`.
 */
const SIGNALS = ["souls", "damage", "deaths"];

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as { items: Record<string, CatalogItem> };
  const items = new Map(Object.entries(catalog.items).map(([id, v]) => [Number(id), v]));
  if (items.size === 0) throw new Error("el catálogo no tiene ítems. Corré `npm run catalog` antes que esto.");
  const ids = [...items.keys()].join(", ");

  const detail = JSON.parse(readFileSync(DETAIL, "utf8")) as Record<string, { en: { sections: unknown[] } }>;
  const resist = {
    spirit: resistItems(detail, "Spirit Resist"),
    weapon: resistItems(detail, "Bullet Resist"),
  };
  console.log(`resistencias: ${resist.spirit.length} de espíritu, ${resist.weapon.length} de bala`);

  const partitions = await listPartitions();
  /**
   * Sólo para desarrollo: `REPORT_CACHE=1` guarda la ventana en un archivo local
   * y la reusa. Cargarla tarda cinco minutos y afinar la fórmula de la nota pide
   * correr esto varias veces seguidas.
   *
   * Avisa fuerte porque los datos quedan viejos, y una medición vieja con cara de
   * fresca es exactamente el tipo de error que después nadie encuentra.
   */
  const cache = process.env.REPORT_CACHE === "1";
  // Al lado del pipeline y **nunca adentro de `data/`**: la Action publica ese
  // directorio con `git add games/deadlock/data`, así que un archivo de 449 MB
  // ahí sería un commit de 449 MB. Igual está en `.gitignore`, con cinturón y
  // tiradores.
  const con = await connect(cache ? ".report-cache.duckdb" : ":memory:");
  const run = (sql: string) => con.run(sql);
  const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjects();
  if (cache) console.log("⚠ REPORT_CACHE=1: ventana cacheada en disco, los datos pueden ser viejos");

  /**
   * **La banda con más muestra, no la publicada por defecto.** La nota es una
   * calibración y mejora con datos, no con selección; ver `widestBand`. La
   * página sigue diciendo contra qué banda te compara, así que el visitante no
   * pierde el contexto.
   */
  const banda = widestBand();
  const tiers = BANDS.find((b) => b.id === banda)!.tiers.join(", ");
  console.log(`banda: ${banda} (rangos ${tiers}) — la de más muestra`);

  const ranges = await partitionRanges(con, partitions);
  const hasta = await windowEnd(con, ranges);
  const desde = new Date(hasta.getTime() - MAX_WINDOW_DAYS * 86_400_000);
  const parts = await bandablePartitions(
    con,
    partitionsCovering(ranges, desde.toISOString(), hasta.toISOString())
  );
  if (parts.length === 0) throw new Error("el snapshot no tiene ni una partición en los últimos quince días.");
  const from = desde.toISOString().slice(0, 19);
  const to = hasta.toISOString().slice(0, 19);
  console.log(`ventana ${from.slice(0, 10)} → ${to.slice(0, 10)} · particiones ${parts.join(", ")}`);

  /**
   * La ventana. Cada partición nombra sus columnas porque no comparten esquema
   * —la trampa que ya rompió `build:heroes` dos veces—, y las series de `stats`
   * se leen por su último elemento, que es el acumulado al terminar.
   */
  const rama = (n: number) => `
    select match_id, account_id, hero_id, won, team, start_time, duration_s,
           net_worth, deaths,
           list_extract("stats.player_damage", len("stats.player_damage")) as damage,
           list_extract("stats.boss_damage", len("stats.boss_damage")) as boss,
           list_distinct(list_transform(
             list_filter(range(1, len("items.item_id") + 1),
               i -> "items.item_id"[i] in (${ids}) and coalesce("items.sold_time_s"[i], 0) = 0),
             i -> "items.item_id"[i])) as kept,
           "items.item_id" as item_ids, "items.game_time_s" as item_times,
           "items.sold_time_s" as sold_times,
           len(list_filter("items.imbued_ability_id", x -> x is not null and x <> 0)) as imbued
    from read_parquet('${partitionUrl(n)}')
    where match_mode = '${PLAYED_MODE}' and game_mode = '${PLAYED_GAME_MODE}'
      and ${BADGE} // 10 in (${tiers})
      and start_time >= TIMESTAMP '${from}' and start_time < TIMESTAMP '${to}'
      and len("stats.player_damage") > 0 and duration_s > 600`;

  let t = Date.now();
  const lap = () => {
    const s = ((Date.now() - t) / 1000).toFixed(1);
    t = Date.now();
    return s;
  };

  const [cargada] = (await rows(
    `select count(*)::BIGINT as n from information_schema.tables where table_name = 'player'`
  )) as unknown as { n: bigint }[];
  const yaEstaba = cache && Number(cargada.n) > 0;
  if (!yaEstaba) {
    await run(
      `create or replace table player as select row_number() over () as pid, * from (${parts.map(rama).join(" union all ")})`
    );
  } else {
    console.log("  ventana leída del cache local, sin bajar nada");
  }

  // La ventana se ancla al parche si el parche tiene con qué, igual que las
  // builds: la tarjeta y la tier list tienen que describir el mismo juego.
  const parches = await fetchPatches();
  const parche = parches[0] ?? null;
  let crossesPatch = false;
  if (parche && !yaEstaba) {
    const iso = new Date(parche.date).toISOString().slice(0, 19);
    const [c] = (await rows(`
      select count(distinct match_id) filter (where start_time >= TIMESTAMP '${iso}')::BIGINT as post
      from player`)) as unknown as { post: bigint }[];
    if (Number(c.post) >= PROVISIONAL_MATCHES) {
      await run(`delete from player where start_time < TIMESTAMP '${iso}'`);
      console.log(`  ventana anclada al parche "${parche.title}"`);
    } else {
      crossesPatch = true;
      console.log(`  el parche "${parche.title}" no llega a ${PROVISIONAL_MATCHES} partidas: se miden ${MAX_WINDOW_DAYS} días`);
    }
  }

  const [tot] = (await rows(`
    select count(*)::BIGINT as players, count(distinct match_id)::BIGINT as matches,
           strftime(min(start_time), '%Y-%m-%d') as "from", strftime(max(start_time), '%Y-%m-%d') as "to"
    from player`)) as unknown as { players: bigint; matches: bigint; from: string; to: string }[];
  console.log(`  ${Number(tot.players).toLocaleString("es")} jugadores, ${Number(tot.matches).toLocaleString("es")} partidas (${lap()}s)`);

  // ── El perfil del rival ────────────────────────────────────────────────
  //
  // De qué está hecho lo que tenías enfrente: la cuota de espíritu de las almas
  // que el equipo rival puso en daño. Es el mismo reparto por categoría de
  // tienda que usa `damageSplit` en la tarjeta de build, y por el mismo motivo
  // —cada objeto tiene un coste y una categoría, así que se reparte sin huecos,
  // mientras que repartir por lo que el ítem DA no cierra: el 23% no declara
  // tipo y el 30% declara dos.
  await run(`create or replace table meta(item_id UBIGINT, cost INTEGER, slot VARCHAR)`);
  await run(
    `insert into meta values ${[...items]
      .map(([id, v]) => `(${id}, ${v.cost ?? 0}, '${v.slot}')`)
      .join(", ")}`
  );

  await run(`create or replace table gasto as
    select p.pid, p.match_id, p.team,
           sum(case when m.slot = 'weapon' then m.cost else 0 end) as w,
           sum(case when m.slot = 'vitality' then m.cost else 0 end) as v,
           sum(case when m.slot = 'spirit' then m.cost else 0 end) as s
    from player p, unnest(p.kept) as t(x)
    join meta m on m.item_id = t.x
    group by 1, 2, 3`);

  await run(`create or replace table equipo as
    select match_id, team, sum(w) as w, sum(s) as s from gasto group by 1, 2`);

  // El perfil de un jugador es el del OTRO equipo, así que se cruza por partida
  // exigiendo equipos distintos — el mismo join que ya usan los counters.
  await run(`create or replace table perfil as
    select g.pid, coalesce(e.s / nullif(e.s + e.w, 0), 0.5) as share
    from gasto g join equipo e on e.match_id = g.match_id and e.team <> g.team`);

  // Los percentiles se piden uno por uno y no como lista: `quantile_cont(x,
  // [a, b])` devuelve un LIST, y lo que llega a JavaScript por el driver es un
  // valor de DuckDB, no un array. Dos escalares se leen sin traducir nada.
  const [cortes] = (await rows(
    `select quantile_cont(share, 0.3333)::DOUBLE as a, quantile_cont(share, 0.6667)::DOUBLE as b from perfil`
  )) as unknown as { a: number; b: number }[];
  const profileCuts: [number, number] = [Number(cortes.a), Number(cortes.b)];
  console.log(`  perfil rival: cuota de espíritu ${profileCuts.map((x) => x.toFixed(3)).join(" / ")} (${lap()}s)`);

  const [durq] = (await rows(
    `select quantile_cont(duration_s, 0.3333)::DOUBLE as a, quantile_cont(duration_s, 0.6667)::DOUBLE as b from player`
  )) as unknown as { a: number; b: number }[];
  const durationCuts: [number, number] = [Math.round(Number(durq.a)), Math.round(Number(durq.b))];
  console.log(`  duración: ${durationCuts.map((x) => (x / 60).toFixed(1)).join(" / ")} min`);

  /**
   * Las señales de la nota son **cuota del propio equipo**, no números por
   * minuto, y ese cambio es el hallazgo de la primera medición.
   *
   * Con almas por minuto y daño por minuto el compuesto salía siendo el
   * marcador: medido, los rangos intercuartiles de ganadores y perdedores **no
   * se solapaban nada** (−21,8%, o sea que quedaba un hueco entre los dos), y el
   * peso más grande se lo llevaba el daño a objetivos, que es prácticamente la
   * definición de ganar — el equipo que gana rompe las torres y se lleva las
   * almas. Una letra así no dice nada que el resultado no diga.
   *
   * Dividiendo por el total del equipo, la suerte del equipo se cancela y lo que
   * queda es cuánto de lo suyo puso cada uno. **No es rankear adentro del lobby**
   * —lo que se rechazó—: la letra sigue saliendo de la distribución de todos los
   * que jugaron ese héroe, la cuota es sólo la señal.
   *
   * Los seis de un equipo suman 1 por construcción, así que el `coalesce` a un
   * sexto es el reparto parejo, que es lo correcto cuando el total es cero.
   */
  await run(`create or replace table equipo_tot as
    select match_id, team, sum(net_worth) as nw, sum(damage) as dmg,
           sum(boss) as boss, sum(deaths) as deaths
    from player group by 1, 2`);

  await run(`create or replace table base as
    select p.pid, p.hero_id, p.won, p.duration_s, p.imbued, p.net_worth,
           case when p.duration_s < ${durationCuts[0]} then 0
                when p.duration_s < ${durationCuts[1]} then 1 else 2 end as dur,
           case when f.share < ${profileCuts[0]} then 0
                when f.share < ${profileCuts[1]} then 1 else 2 end as prof,
           coalesce(p.net_worth / nullif(e.nw, 0), 1.0/6) as souls,
           coalesce(p.damage / nullif(e.dmg, 0), 1.0/6) as damage,
           coalesce(p.deaths / nullif(e.deaths, 0), 1.0/6) as deaths,
           g.w as gw, g.v as gv, g.s as gs
    from player p
    join perfil f on f.pid = p.pid
    join gasto g on g.pid = p.pid
    join equipo_tot e on e.match_id = p.match_id and e.team = p.team`);

  // ── La nota ────────────────────────────────────────────────────────────
  //
  // Se normaliza DENTRO de héroe × tramo de duración, que es lo acordado: un Mo
  // & Krill nunca va a tener el daño de una Haze, y quien juega 45 minutos
  // farmea más almas por existir. Lo que se compara es tu lugar entre los tuyos.
  const norm = `select hero_id, dur, ${SIGNALS.map(
    (s) => `avg(${s}) as ${s}_m, coalesce(stddev_samp(${s}), 0) as ${s}_d`
  ).join(", ")}, count(*)::BIGINT as n from base group by 1, 2`;
  await run(`create or replace table norma as ${norm}`);

  const z = SIGNALS.map((s) => `(b.${s} - n.${s}_m) / nullif(n.${s}_d, 0)`);
  await run(`create or replace table zeta as
    select b.pid, b.hero_id, b.dur, b.won, ${z.map((e, i) => `coalesce(${e}, 0) as z${i}`).join(", ")}
    from base b join norma n on n.hero_id = b.hero_id and n.dur = b.dur`);

  /**
   * Los pesos NO se estiman acá: son los del mecanismo, que ya están medidos.
   *
   * Es lo acordado —"con los pesos que ya medimos"— y además es lo único que
   * funciona. **Ajustar los pesos contra `won` sobre estas señales se probó y
   * falla**: como las cuotas de un equipo suman 1, son casi ortogonales al
   * resultado, y la regresión devuelve coeficientes de milésimas con el signo
   * dado vuelta en la señal de objetivos. Con pesos así, la letra la decide el
   * ruido.
   *
   * El mecanismo contesta otra pregunta, que es la correcta: cuánto vale una
   * muerte, un alma y un punto de daño **al margen**, medido sobre miles de
   * compras pareadas. Sale de `builds.json` para que se actualice solo con cada
   * corrida de `build:builds`, con la última medición publicada como respaldo.
   *
   * Los objetivos quedan afuera por lo mismo que el daño mitigado: el mecanismo
   * no midió cuánto valen, y una señal sin peso medido no entra.
   */
  let mech = MEASURED;
  try {
    const b = JSON.parse(readFileSync(BUILDS, "utf8")) as { mechanism?: typeof MEASURED };
    if (b.mechanism && Number.isFinite(b.mechanism.deaths)) mech = { intercept: 0, ...b.mechanism };
    else console.log("  builds.json todavía no publica el mecanismo: se usa la última medición conocida");
  } catch {
    console.log("  no pude leer builds.json: se usa la última medición conocida del mecanismo");
  }
  const crudo = [mech.economy, mech.damage, mech.deaths];
  const escala = crudo.reduce((a, w) => a + Math.abs(w), 0);
  if (escala === 0) throw new Error("el mecanismo vino en cero: no hay con qué armar la nota.");
  const weights = crudo.map((w) => Number((w / escala).toFixed(6)));
  console.log(`  pesos (del mecanismo): ${SIGNALS.map((s, i) => `${s} ${weights[i].toFixed(3)}`).join(", ")}`);

  const compuesto = weights.map((w, i) => `${w} * z${i}`).join(" + ");
  await run(`create or replace table nota as select hero_id, dur, won, (${compuesto}) as c from zeta`);

  const cutRows = (await rows(`
    select hero_id::INTEGER as hero, dur::INTEGER as dur, count(*)::BIGINT as n,
           ${GRADE_CUTS.map((q, i) => `quantile_cont(c, ${q})::DOUBLE as q${i}`).join(", ")}
    from nota group by 1, 2`)) as unknown as Record<string, number | bigint>[];

  // El test que decide si la nota sirve: si ganadores y perdedores no se
  // solapan, la letra es el marcador con otro nombre. Se mide acá y se imprime
  // siempre, porque es el número que hay que mirar cuando algo huela raro.
  const [solape] = (await rows(`
    with g as (select quantile_cont(c, 0.25) as lo, quantile_cont(c, 0.75) as hi from nota where won),
         p as (select quantile_cont(c, 0.25) as lo, quantile_cont(c, 0.75) as hi from nota where not won)
    select ((least(g.hi, p.hi) - greatest(g.lo, p.lo)) /
            nullif(greatest(g.hi, p.hi) - least(g.lo, p.lo), 0))::DOUBLE as overlap
    from g, p`)) as unknown as { overlap: number }[];
  console.log(`  solapamiento ganadores/perdedores (rango intercuartil): ${(Number(solape.overlap) * 100).toFixed(1)}%`);

  // ── Lo que compraron los que ganaron ───────────────────────────────────
  await run(`create or replace table compra as
    select pid, unnest(item_ids) as item_id, unnest(item_times) as buy_s,
           unnest(sold_times) as sold_s
    from player`);
  // `game_time_s` es UINTEGER: una compra anterior al reloj envuelve a ~2^32 en
  // vez de quedar negativa. El corte por arriba la agarra sin tocar ninguna
  // compra real, porque no hay partidas de seis horas.
  await run(`delete from compra where buy_s <= 0 or buy_s > 21600 or item_id not in (select item_id from meta)`);

  await run(`create or replace table celda as
    select hero_id, prof, count(*)::BIGINT as n from base where won group by 1, 2`);

  const buyRows = (await rows(`
    with g as (
      select b.hero_id, b.prof, c.item_id, count(distinct c.pid)::BIGINT as k,
             median(c.buy_s) / 60.0 as m
      from compra c join base b on b.pid = c.pid
      where b.won and c.sold_s = 0
      group by 1, 2, 3
    )
    select g.hero_id::INTEGER as hero, g.prof::INTEGER as prof, g.item_id as item,
           (g.k::DOUBLE / e.n) as rate, g.m::DOUBLE as min
    from g join celda e on e.hero_id = g.hero_id and e.prof = g.prof
    where e.n >= ${MIN_CELL} and g.k::DOUBLE / e.n >= ${MIN_RATE}
    order by 1, 2, 3`)) as unknown as { hero: number; prof: number; item: bigint; rate: number; min: number }[];
  console.log(`  ${buyRows.length.toLocaleString("es")} filas de compra (${lap()}s)`);

  // Por héroe, sin partir por perfil: son cosas del personaje, no del rival.
  const heroRows = (await rows(`
    select base.hero_id::INTEGER as hero, count(*)::BIGINT as n,
           median(base.gw)::DOUBLE as w, median(base.gv)::DOUBLE as v, median(base.gs)::DOUBLE as s,
           avg((base.imbued > 0)::INT)::DOUBLE as imbue,
           median(base.net_worth - (base.gw + base.gv + base.gs))::DOUBLE as souls,
           median(len(p.kept))::DOUBLE as slots
    from base join player p on p.pid = base.pid
    where base.won group by 1`)) as unknown as {
    hero: number; n: bigint; w: number; v: number; s: number; imbue: number; souls: number; slots: number;
  }[];

  /**
   * Vender y mejorar son **lo mismo en el snapshot**, y confundirlos arruina la
   * tasa: al mejorar un ítem, el escalón anterior queda anotado con
   * `sold_time_s`. Medido en crudo, el 79% de los ganadores "vendía" *Compress
   * Cooldown* y el 62% *Improved Spirit* — que es la tasa de mejora, no la de
   * venta.
   *
   * Se separan por lo que quedó en la mano: si el jugador **terminó con algún
   * descendiente del ítem**, lo mejoró. Si no, lo vendió de verdad.
   */
  await run(`create or replace table descendiente(item_id UBIGINT, desc_id UBIGINT)`);
  const desc: string[] = [];
  for (const [id] of items) {
    const vistos = new Set<number>();
    const cola = [...(items.get(id)?.upgradesTo ?? [])];
    while (cola.length > 0) {
      const n = cola.pop()!;
      if (vistos.has(n)) continue;
      vistos.add(n);
      cola.push(...(items.get(n)?.upgradesTo ?? []));
    }
    for (const d of vistos) desc.push(`(${id}, ${d})`);
  }
  if (desc.length > 0) await run(`insert into descendiente values ${desc.join(", ")}`);

  const soldRows = (await rows(`
    with v as (
      select c.pid, c.item_id,
             max(case when c.sold_s <> 0 then 1 else 0 end) as vendido
      from compra c group by 1, 2
    ),
    c as (
      select b.hero_id, v.item_id,
             count(distinct v.pid)::BIGINT as bought,
             count(distinct case when v.vendido = 1
                   and not exists (
                     select 1 from descendiente d
                     where d.item_id = v.item_id and list_contains(p.kept, d.desc_id)
                   ) then v.pid end)::BIGINT as sold
      from v join base b on b.pid = v.pid join player p on p.pid = v.pid
      where b.won group by 1, 2
    )
    -- Se publican también las tasas cero, y eso no es desperdicio: la familia
    -- que avisa "vendiste algo que nadie vende" necesita distinguir "medido y da
    -- cero" de "no lo medimos". Sin la fila, las dos se ven igual.
    select hero_id::INTEGER as hero, item_id as item, (sold::DOUBLE / bought) as rate
    from c where bought >= ${MIN_CELL}
    order by 1, 2`)) as unknown as { hero: number; item: bigint; rate: number }[];

  // ── El archivo ─────────────────────────────────────────────────────────
  const heroes: Record<string, HeroReport> = {};
  const round = (x: number, d = 4) => Number(x.toFixed(d));

  for (const h of heroRows) {
    heroes[h.hero] = {
      n: Number(h.n),
      grade: {},
      norm: {},
      buys: {},
      split: [Math.round(h.w), Math.round(h.v), Math.round(h.s)],
      imbue: round(h.imbue, 3),
      souls: Math.round(h.souls),
      slots: Math.round(h.slots),
      sold: {},
    };
  }
  for (const c of cutRows) {
    const h = heroes[Number(c.hero)];
    if (!h || Number(c.n) < MIN_GRADE_CELL) continue;
    h.grade[String(c.dur)] = GRADE_CUTS.map((_, i) => round(Number(c[`q${i}`]), 4));
  }
  for (const n of (await rows(`select hero_id::INTEGER as hero, dur::INTEGER as dur, ${SIGNALS.flatMap(
    (s) => [`${s}_m::DOUBLE as ${s}_m`, `${s}_d::DOUBLE as ${s}_d`]
  ).join(", ")} from norma`)) as unknown as Record<string, number>[]) {
    const h = heroes[n.hero];
    if (!h || !h.grade[n.dur]) continue;
    h.norm[n.dur] = SIGNALS.map((s) => [round(Number(n[`${s}_m`]), 3), round(Number(n[`${s}_d`]), 3)]);
  }
  for (const b of buyRows) {
    const h = heroes[b.hero];
    if (!h) continue;
    (h.buys[b.prof] ??= {})[String(b.item)] = [round(b.rate, 3), round(b.min, 1)];
  }
  for (const s of soldRows) {
    const h = heroes[s.hero];
    if (h) h.sold[String(s.item)] = round(s.rate, 3);
  }

  const file: ReportFile = {
    generatedAt: new Date().toISOString(),
    band: banda,
    window: {
      from: tot.from,
      to: tot.to,
      matches: Number(tot.matches),
      players: Number(tot.players),
    },
    crossesPatch,
    patch: parche ? { title: parche.title, date: parche.date } : null,
    profileCuts: profileCuts.map((x) => round(x, 4)) as [number, number],
    durationCuts,
    weights,
    signals: SIGNALS,
    overlap: round(Number(solape.overlap), 3),
    resist,
    heroes,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  // Sin sangría: en TFT eso ahorró el 47% del archivo, y éste es de los más
  // pesados que publica Deadlock.
  writeFileSync(OUT, JSON.stringify(file));
  const conNota = Object.values(heroes).filter((h) => Object.keys(h.grade).length > 0).length;
  console.log(
    `escrito ${OUT}: ${Object.keys(heroes).length} héroes (${conNota} con nota), ` +
      `${(JSON.stringify(file).length / 1024).toFixed(0)} KB (${lap()}s)`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // El snapshot se reescribe cada ~70 minutos y estas consultas duran minutos:
  // si la partición cambia en el medio, DuckDB aborta. Reintentar es más honesto
  // que desactivar el chequeo, que dejaría leer mitad de un archivo y mitad de
  // otro sin decir nada.
  retryingOnRewrite(main).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

export { main };
