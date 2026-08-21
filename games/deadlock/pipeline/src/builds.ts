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
import { BANDS, publishedDefaultBand } from "./bands";
import { matchedCells, type MatchedCell, type StratumRow } from "./matching";
import { fitMechanism, predictWin, shrinkageToMechanism, shrinkToward } from "./mechanism";
import {
  terminalsOf, chainTo, groupBuilds, traitOf, damageSplit, countersFrom, collapseChains, byTier,
  buyOrder,
  type Group, type BuildsFile, type HeroEntry, type HeroBuild, type BuildItem,
  MIN_GROUP, MAX_SLOTS,
} from "./buildCard";
import {
  fetchAbilityOrder, fetchBuildAbilityOrder, fetchAbilityAssets, fetchAbilitySlots,
  badgeRange, enParalelo,
} from "./abilities";
import { archetypesForHero } from "./grouping";
import { recommend, soporteDe, type Candidate } from "./recommend";
import type { ItemMeta, PlayerRow } from "./features";

/**
 * Las tres builds de cada héroe de Deadlock.
 *
 *   npm run build:builds
 *
 * **Sólo Fantasma+**, que es donde se piden las builds. Una banda en vez de
 * cuatro también resuelve el peso: cuatro pesaban 2,2 MB por corrida, o sea ~1,6
 * GB de historia de git al año, y la historia de git no se recorta.
 *
 * Lo que sale es lo que muestra la tarjeta que se despliega al apretar un héroe
 * en la tier list: hasta tres builds distinguibles entre sí, cada una con sus 12
 * ítems finales, el reparto de daño, el orden de habilidades y los ítems de
 * counter aparte.
 *
 * El motor de medición —parear cada compra contra quien llegó al mismo punto,
 * traducir el mecanismo a victorias y encoger hacia él— es el de
 * `matching.ts` + `mechanism.ts` y no cambió. Ver
 * `docs/design/2026-07-31-tarjeta-de-build-deadlock-design.md`.
 */

const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/builds.json`;
const CATALOG = `${OUT_DIR}/catalog.json`;

/** Cuánto después de comprar se mide qué cambió el ítem. */
const EFFECT_WINDOW_S = 360;

interface CatalogItem {
  cost: number;
  tier: number;
  slot: string;
  types?: string[];
  upgradesTo?: number[];
  upgradesFrom?: number[];
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    items: Record<string, CatalogItem>;
    heroes: Record<string, unknown>;
  };
  const items = new Map(Object.entries(catalog.items).map(([id, v]) => [Number(id), v]));
  if (items.size === 0) throw new Error("el catálogo no tiene ítems. Corré `npm run catalog` antes que esto.");
  const ids = [...items.keys()].join(", ");

  const partitions = await listPartitions();
  const con = await connect();
  const run = (sql: string) => con.run(sql);
  const rows = async (sql: string) => (await con.runAndReadAll(sql)).getRowObjects();

  // La banda se lee de lo que publicó `build:heroes` en vez de estar clavada en
  // 9/10/11: desde el reset del 2026-07-30 el defecto lo decide la muestra, y una
  // tarjeta de build medida en Fantasma+ debajo de una tier list de Arcón/Oráculo
  // sería dos niveles de juego distintos en la misma fila.
  const bandaDefecto = publishedDefaultBand();
  const tiersDefecto = BANDS.find((b) => b.id === bandaDefecto)!.tiers.join(", ");
  console.log(`banda: ${bandaDefecto} (rangos ${tiersDefecto})`);

  const ranges = await partitionRanges(con, partitions);
  // El techo es el horizonte de rango, no `now`: las builds se miden sobre quince
  // días MÓVILES, así que sin esto una congelación no las congelaría — les iría
  // soltando un día bueno por atrás sin recoger nada por adelante, hasta vaciarlas.
  const hasta = await windowEnd(con, ranges);
  const desde = new Date(hasta.getTime() - MAX_WINDOW_DAYS * 86_400_000);
  const parts = await bandablePartitions(con, partitionsCovering(ranges, desde.toISOString(), hasta.toISOString()));
  if (parts.length === 0) {
    throw new Error("el snapshot no tiene ni una partición en los últimos quince días.");
  }
  const from = desde.toISOString().slice(0, 19);
  const to = hasta.toISOString().slice(0, 19);
  console.log(`ventana ${from.slice(0, 10)} → ${to.slice(0, 10)} · particiones ${parts.join(", ")}`);

  /**
   * La ventana. **Cada partición nombra sus columnas**: no comparten esquema
   * —la 95 y la 96 traen 153 columnas contra 139 de las viejas— y unirlas con
   * `select *` falla. Es la misma trampa que ya rompió `build:heroes`.
   *
   * La build de un jugador es **sin vendidos y sin repetidos**: un ítem
   * revendido y recomprado aparece dos veces en el array, y contarlo dos veces
   * rompe el tope de 12 que el juego impone.
   */
  const rama = (n: number) => `
    select match_id, account_id, hero_id, won, team, start_time,
           list_distinct(list_transform(
             list_filter(range(1, len("items.item_id") + 1),
               i -> "items.item_id"[i] in (${ids}) and coalesce("items.sold_time_s"[i], 0) = 0),
             i -> "items.item_id"[i])) as kept,
           "items.item_id" as item_ids, "items.game_time_s" as item_times,
           list_filter("items.imbued_ability_id", x -> x is not null and x <> 0) as imbued,
           "stats.time_stamp_s" as ts, "stats.net_worth" as nw,
           "stats.player_damage" as dmg, "stats.deaths" as deaths
    from read_parquet('${partitionUrl(n)}')
    where match_mode = '${PLAYED_MODE}' and game_mode = '${PLAYED_GAME_MODE}'
      and ${BADGE} // 10 in (${tiersDefecto})
      and start_time >= TIMESTAMP '${from}' and start_time < TIMESTAMP '${to}'
      and len("stats.time_stamp_s") > 0`;

  let t = Date.now();
  const lap = () => { const s = ((Date.now() - t) / 1000).toFixed(1); t = Date.now(); return s; };

  await run(`create table player as select row_number() over () as pid, * from (${parts.map(rama).join(" union all ")})`);

  /**
   * La ventana se ancla al parche, **si el parche tiene con qué**.
   *
   * Hasta ahora eran quince días móviles sin mirar el parche, con un argumento
   * bueno: medir el aporte de un ítem sobre un día y medio deja sólo a los que
   * compra todo el mundo. El problema es que **la tier list de arriba sí corta
   * por parche**, así que la tarjeta podía describir un juego y la fila que la
   * contiene otro — y no se notaba porque ranked es nuevo y todavía no hay
   * quince días de historia. Se iba a romper solo.
   *
   * Se resuelve midiendo: se carga la ventana ancha, se cuenta cuánto hay desde
   * el parche, y si alcanza se recorta. Si no alcanza se queda la ancha y **el
   * archivo lo dice**, para que la tarjeta pueda avisar en vez de hacer pasar
   * quince días por el parche vigente.
   */
  const parches = await fetchPatches();
  const parche = parches[0];
  let crossesPatch = false;
  if (parche) {
    const iso = new Date(parche.date).toISOString().slice(0, 19);
    const [c] = (await rows(`
      select count(distinct match_id) filter (where start_time >= TIMESTAMP '${iso}')::BIGINT as post
      from player`)) as unknown as { post: bigint }[];
    if (Number(c.post) >= PROVISIONAL_MATCHES) {
      await run(`delete from player where start_time < TIMESTAMP '${iso}'`);
      console.log(`  ventana anclada al parche "${parche.title}" (${Number(c.post).toLocaleString("es")} partidas)`);
    } else {
      crossesPatch = true;
      console.log(
        `  el parche "${parche.title}" tiene ${Number(c.post).toLocaleString("es")} partidas, ` +
          `menos que ${PROVISIONAL_MATCHES.toLocaleString("es")}: se miden ${MAX_WINDOW_DAYS} días y se avisa`
      );
    }
  }

  const [tot] = (await rows(`
    select count(*)::BIGINT as boards, count(distinct match_id)::BIGINT as matches,
           strftime(min(start_time), '%Y-%m-%d') as "from", strftime(max(start_time), '%Y-%m-%d') as "to"
    from player`)) as unknown as { boards: bigint; matches: bigint; from: string; to: string }[];
  console.log(`  ${Number(tot.boards).toLocaleString("es")} filas jugador, ${Number(tot.matches).toLocaleString("es")} partidas (${lap()}s)`);

  // ── El aporte medido de cada ítem en cada héroe ────────────────────────
  await run(`create table costo(item_id UBIGINT, cost INTEGER)`);
  await run(`insert into costo values ${[...items].map(([id, v]) => `(${id}, ${v.cost})`).join(", ")}`);
  await run(`create table estado as
    select match_id, account_id, unnest(ts) as t, unnest(nw) as nw,
           unnest(dmg) as dmg, unnest(deaths) as deaths from player`);
  await run(`create table compra as
    select match_id, account_id, hero_id, won,
           unnest(item_ids) as item_id, unnest(item_times) as buy_s from player`);
  /**
   * `game_time_s` es UINTEGER en el snapshot: una compra con tiempo negativo
   * (antes de que arranque el reloj, en la fase de picks) no queda negativa,
   * envuelve a un número cercano a 2^32 — visto en producción el 2026-08-04:
   * 4.294.967.291, que es -5 leído como UINTEGER. `buy_s <= 0` nunca la agarra
   * así, y sumarle EFFECT_WINDOW_S revienta el UINT32 de DuckDB ("Overflow in
   * addition of UINT32"). El corte de arriba excluye cualquier partida de más
   * de 6 horas, que no existe, así que agarra el envuelto sin tocar ninguna
   * compra real.
   */
  await run(
    `delete from compra where buy_s <= 0 or buy_s > 21600 or item_id not in (select item_id from costo)`
  );
  console.log(`  tablas de pareo listas (${lap()}s)`);

  // Las series son acumuladas, así que la resta es lo que pasó en la ventana —
  // casteada a BIGINT porque son UINTEGER y una resta negativa revienta.
  await run(`create table pareo as
    select c.match_id, c.account_id, c.hero_id, c.won, c.item_id, k.cost, c.buy_s, a.nw as wealth,
           d.dmg::BIGINT - a.dmg::BIGINT as d_damage,
           d.deaths::BIGINT - a.deaths::BIGINT as d_deaths,
           d.nw::BIGINT - a.nw::BIGINT as d_economy
    from compra c
    join costo k on k.item_id = c.item_id
    asof left join estado a on c.match_id = a.match_id and c.account_id = a.account_id and c.buy_s >= a.t
    asof left join estado d on c.match_id = d.match_id and c.account_id = d.account_id
                            and c.buy_s + ${EFFECT_WINDOW_S} >= d.t
    where a.nw is not null and d.nw is not null`);
  /**
   * El desempate del `ntile` NO es cosmético.
   *
   * Dos compras con el mismo patrimonio pueden caer en quintiles distintos según
   * el orden en que SQL las devuelva, y eso cambia los estratos, los efectos
   * medidos y el `k` del encogimiento: con datos idénticos se lo vio moverse
   * entre 854 y 864 de una corrida a otra, arrastrando los aportes en el segundo
   * decimal — que es donde cae el corte de los que cargan la build.
   *
   * `match_id` y `account_id` viajan desde `compra` sólo para esto: son la clave
   * de una fila y ordenan por completo.
   */
  await run(`create table estrato as
    select *, buy_s // 300 as block,
           ntile(5) over (
             partition by hero_id, buy_s // 300
             order by wealth, match_id, account_id, item_id
           ) as q
    from pareo`);
  console.log(`  pareo listo (${lap()}s)`);

  const crudas = (await rows(`
    with p as (
      select hero_id, item_id, cost, block, q, count(*) as n, sum(won::INT) as wins,
             sum(d_damage) as damage, sum(d_deaths) as deaths, sum(d_economy) as economy
      from estrato group by 1,2,3,4,5
    ),
    t as (
      select hero_id, cost, block, q, sum(n) as n, sum(wins) as wins, sum(damage) as damage,
             sum(deaths) as deaths, sum(economy) as economy from p group by 1,2,3,4
    )
    select p.hero_id::INTEGER as "heroId", p.item_id as "itemId", p.cost::INTEGER as cost,
           p.n::INTEGER as n, p.wins::INTEGER as wins, p.damage::DOUBLE as damage,
           p.deaths::DOUBLE as deaths, p.economy::DOUBLE as economy,
           t.n::INTEGER as "totalN", t.wins::INTEGER as "totalWins", t.damage::DOUBLE as "totalDamage",
           t.deaths::DOUBLE as "totalDeaths", t.economy::DOUBLE as "totalEconomy"
    from p join t on t.hero_id = p.hero_id and t.cost = p.cost and t.block = p.block and t.q = p.q
    -- El orden fija el resultado y no es cosmetico: estas filas alimentan un
    -- ajuste por minimos cuadrados, y sumar en distinto orden mueve el
    -- redondeo. Medido con datos identicos, el k del encogimiento iba de 862 a
    -- 854 entre corridas, y con el los aportes en el segundo decimal, que es
    -- donde cae el corte de los que cargan la build. La estructura ya era
    -- estable; esto fija los numeros.
    order by p.hero_id, p.item_id, p.cost, p.block, p.q`)) as unknown as StratumRow[];
  const cells = matchedCells(crudas);
  const usables = cells.filter((c) => c.n >= 50);
  const fit = fitMechanism(usables);
  const k = shrinkageToMechanism(usables, fit);
  const edge = new Map<string, number>();
  // Las compras que respaldan cada aporte. El recomendador las necesita: sin
  // ellas, un aporte alto medido sobre veinte compras decidiría una build.
  const buys = new Map<string, number>();
  for (const c of usables) {
    edge.set(`${c.heroId}|${c.itemId}`, shrinkToward(c.win, predictWin(fit, c), c.n, k) * 100);
    buys.set(`${c.heroId}|${c.itemId}`, c.n);
  }
  console.log(`  aporte medido: ${edge.size} pares héroe×ítem, k=${Number.isFinite(k) ? k.toFixed(0) : "∞"} (${lap()}s)`);

  // ── Las builds reales ──────────────────────────────────────────────────
  const abajo: [number, number][] = [];
  for (const [id] of items) for (const d of terminalsOf(items, id)) abajo.push([id, d]);
  await run(`create table down(item_id UBIGINT, desc_id UBIGINT)`);
  await run(`insert into down values ${abajo.map(([a, b]) => `(${a}, ${b})`).join(", ")}`);

  // Terminal = el ítem se queda sólo si su mejora NO está también en la build.
  await run(`create table term as
    select p.pid, p.hero_id, p.won, x as item_id,
           case when len(p.imbued) > 0 then p.imbued[1] else 0 end as ab
    from player p, unnest(p.kept) as t(x)
    where not exists (select 1 from down d where d.item_id = x and list_contains(p.kept, d.desc_id))`);

  /**
   * Las subidas de habilidad, que viven **adentro del stream de compras**.
   *
   * Cada nivel que se sube aparece como un evento más en `items.item_id`,
   * mezclado con los objetos, y se reconoce porque su id **no está en el
   * catálogo de objetos**. Verificado sobre 400 filas de McGinnis: aparecen
   * exactamente 4 ids ajenos al catálogo —sus cuatro habilidades— repetidos con
   * su minuto.
   *
   * Estaba en el snapshot desde siempre. La nota del proyecto decía que el orden
   * de habilidades no estaba ahí, y es cierto de `ability_stats`, que es donde se
   * lo había buscado y viene vacío: el dato estaba en otro lado.
   */
  await run(`create table ev as
    select pid,
           unnest(list_transform(range(1, len(item_ids) + 1),
             i -> struct_pack(id := item_ids[i], t := item_times[i]))) as e
    from player`);
  await run(`create table habev as
    select pid, e.id as ab, e.t as t from ev where e.id not in (${ids})`);

  // Todo viaja como TEXTO: las listas de DuckDB no llegan a JS como arrays.
  /**
   * **El `order by` no es cosmético: sin él la salida no es determinista.**
   *
   * `MAX_AJUSTE` ajusta los arquetipos sobre una submuestra de paso fijo, así que
   * el orden en que llegan las filas decide cuáles entran. SQL no garantiza
   * ninguno, y dos corridas con exactamente los mismos datos dieron 81 y 90
   * arquetipos, con McGinnis partido 2.525/966 en una y 2.313/1.178 en la otra.
   * Ordenar por `pid` lo fija.
   */
  const filasJugador = (await rows(`
    select t.pid::INTEGER as pid, any_value(t.hero_id)::INTEGER as "heroId",
           any_value(t.won) as won, any_value(t.ab)::UBIGINT as imbued,
           string_agg(t.item_id, ',') as items
    from term t group by t.pid order by t.pid`)) as unknown as
    { pid: number; heroId: number; won: boolean; imbued: bigint; items: string }[];
  // La secuencia ENTERA y en orden, no el conteo: los niveles se derivan de ella
  // y el paso a paso de cada arquetipo la necesita completa.
  const filasHab = (await rows(`
    select pid::INTEGER as pid, string_agg(ab, ',' order by t) as seq
    from habev group by 1`)) as unknown as { pid: number; seq: string }[];
  console.log(`  ${filasJugador.length.toLocaleString("es")} jugadores con build y habilidades (${lap()}s)`);

  const habPorPid = new Map<number, { id: number; levels: number }[]>();
  const seqPorPid = new Map<number, number[]>();
  for (const f of filasHab) {
    const seq = String(f.seq ?? "").split(",").filter(Boolean).map(Number);
    seqPorPid.set(f.pid, seq);
    const niveles = new Map<number, number>();
    for (const id of seq) niveles.set(id, (niveles.get(id) ?? 0) + 1);
    habPorPid.set(f.pid, [...niveles].map(([id, levels]) => ({ id, levels })));
  }

  const porHeroe = new Map<number, PlayerRow[]>();
  for (const f of filasJugador) {
    const fila: PlayerRow = {
      heroId: f.heroId,
      won: Boolean(f.won),
      items: String(f.items ?? "").split(",").filter(Boolean).map(Number),
      abilities: habPorPid.get(f.pid) ?? [],
      abilitySeq: seqPorPid.get(f.pid),
      imbued: Number(f.imbued ?? 0),
    };
    const lista = porHeroe.get(f.heroId);
    if (lista) lista.push(fila);
    else porHeroe.set(f.heroId, [fila]);
  }

  // El catálogo se copia a lo mínimo que necesita el vector: costo y estante.
  const itemMeta = new Map<number, ItemMeta>(
    [...items].map(([id, v]) => [id, { cost: v.cost, slot: v.slot }])
  );

  const grupos: Group[] = [];
  const tamanios: number[] = [];
  for (const [, jugadores] of [...porHeroe].sort((a, b) => a[0] - b[0])) {
    for (const g of archetypesForHero(jugadores, itemMeta, { minGroup: MIN_GROUP })) {
      grupos.push(g);
      tamanios.push(g.matches);
    }
  }
  /**
   * La mediana se imprime para poder decidir cuándo `MIN_GROUP` vuelve a 500.
   * Bajó a 150 cuando el corpus ranked se estrenó y dejaba 31 de 38 héroes sin
   * build; el propio comentario de la constante dice que vuelve a subir cuando
   * la muestra se recupere, y sin este número esa decisión sería a ojo.
   */
  const tamaniosOrdenados = [...tamanios].sort((a, b) => a - b);
  const mediana = tamaniosOrdenados.length
    ? tamaniosOrdenados[Math.floor(tamaniosOrdenados.length / 2)]
    : 0;
  console.log(
    `  ${grupos.length} arquetipos en ${porHeroe.size} héroes · mediana ${mediana} partidas ` +
      `(MIN_GROUP=${MIN_GROUP}) (${lap()}s)`
  );

  // El minuto en que entra cada ítem terminal, por héroe.
  const minutos = new Map<string, number>();
  for (const r of (await rows(`
    select hero_id::INTEGER as h, item_id as i, (median(buy_s) / 60)::DOUBLE as m
    from estrato group by 1,2`)) as unknown as { h: number; i: number; m: number }[]) {
    minutos.set(`${r.h}|${r.i}`, Number(Number(r.m).toFixed(0)));
  }

  // ── Los counter ────────────────────────────────────────────────────────
  await run(`create table rival as
    select a.pid, a.hero_id as mine, b.hero_id as foe
    from player a join player b on a.match_id = b.match_id and a.team <> b.team`);
  const crudosCounter = (await rows(`
    with mio as (select pid, hero_id, kept from player),
    base as (
      select m.hero_id::INTEGER as h, x as item_id, count(*) as n
      from mio m, unnest(m.kept) as t(x) group by 1,2
    ),
    tot as (select hero_id::INTEGER as h, count(*) as n from player group by 1),
    contra as (
      select r.mine::INTEGER as h, r.foe::INTEGER as foe, x as item_id, count(*) as n
      from rival r join player p on p.pid = r.pid, unnest(p.kept) as t(x)
      group by 1,2,3
    ),
    totContra as (select mine::INTEGER as h, foe::INTEGER as foe, count(*) as n from rival group by 1,2)
    select c.h as "heroId", c.item_id as "itemId", c.foe as "foeId",
           (c.n::DOUBLE / tc.n)::DOUBLE as rate,
           (b.n::DOUBLE / t.n)::DOUBLE as base,
           tc.n::INTEGER as n
    from contra c
    join totContra tc on tc.h = c.h and tc.foe = c.foe
    join base b on b.h = c.h and b.item_id = c.item_id
    join tot t on t.h = c.h
    where tc.n >= 300 and b.n >= 100`)) as unknown as {
    heroId: number; itemId: number; foeId: number; rate: number; base: number; n: number;
  }[];
  const counters = countersFrom(crudosCounter);
  console.log(`  counters: ${[...counters.values()].reduce((a, x) => a + x.length, 0)} pares héroe×ítem (${lap()}s)`);

  // ── El orden de habilidades ────────────────────────────────────────────
  //
  // El rango que se le pide a la API sale de la banda que se está publicando, no
  // de una constante: si el panel midiera Fantasma+ debajo de una tarjeta que
  // dice Emisario/Oráculo, estaría describiendo a otra gente.
  const badge = badgeRange(BANDS.find((x) => x.id === bandaDefecto)!.tiers);
  const heroIds = [...new Set(grupos.map((g) => g.heroId))].sort((a, b) => a - b);
  const orden = await fetchAbilityOrder(heroIds, badge);
  console.log(
    `  orden de habilidades: ${orden.size} de ${heroIds.length} héroes ` +
      `(insignias ${badge.min}-${badge.max}) (${lap()}s)`
  );

  // ── El archivo ─────────────────────────────────────────────────────────
  const heroes: HeroEntry[] = [];
  for (const heroId of heroIds) {
    const suyos = grupos.filter((g) => g.heroId === heroId);
    const elegidos = groupBuilds(suyos);
    if (elegidos.length === 0) continue;

    const builds: HeroBuild[] = elegidos.map((g) => {
      const sinCounters = g.core.filter(
        (c) => !counters.get(heroId)?.some((x) => x.itemId === c.itemId)
      );
      const its: BuildItem[] = collapseChains(sinCounters, items)
        .slice(0, MAX_SLOTS)
        .map((c) => {
          const meta = items.get(c.itemId)!;
          return {
            itemId: c.itemId,
            tier: meta.tier as 1 | 2 | 3 | 4,
            minute: minutos.get(`${heroId}|${c.itemId}`) ?? 0,
            edge: Number((edge.get(`${heroId}|${c.itemId}`) ?? 0).toFixed(2)),
            prevalence: Number(c.prevalence.toFixed(3)),
            chain: chainTo(items, c.itemId),
          };
        });
      const escalones = byTier(its, items);
      return {
        id: `${g.damage}-${traitOf(its, items)}`,
        damage: g.damage,
        trait: traitOf(its, items),
        // La misma build partida por escalón: qué comprar en cada tier para
        // llegar a los doce de arriba.
        tiers: Object.fromEntries([...escalones].map(([t, ids]) => [t, ids])) as Record<string, number[]>,
        ...(g.ability ? { aroundAbility: Number(g.ability) } : {}),
        matches: g.matches,
        winRate: Number(g.winRate.toFixed(4)),
        ...(g.commitment !== undefined ? { commitment: Number(g.commitment.toFixed(3)) } : {}),
        items: its,
        damageSplit: damageSplit(its, items),
        // Los doce finales dicen dónde termina; esto dice cómo se llega.
        buyOrder: buyOrder(its, (id) => minutos.get(`${heroId}|${id}`)),
        /**
         * El orden medido sobre **la gente de esta build**, que es lo que se
         * publica cuando existe. El del héroe queda de repliegue para el caso
         * en que el arquetipo no junte las cuatro habilidades — y más abajo,
         * sólo para esos, se le sigue preguntando a la API.
         */
        ...(g.abilityOrder?.length === 4
          ? { abilityOrder: g.abilityOrder, abilityPath: g.abilityPath ?? [] }
          : orden.has(heroId)
            ? { abilityOrder: orden.get(heroId)!.order, abilityPath: orden.get(heroId)!.path }
            : {}),
      };
    });

    // Dos grupos distintos pueden dar el mismo nombre —Seven tiene dos builds de
    // espíritu vampírico que se diferencian en otra cosa— y dos tabs con el
    // mismo rótulo no se pueden elegir. Se numeran, como hace el sitio de
    // referencia con "Vampiric-Spirit" y "Vampiric-Spirit-Extra".
    const vistos = new Map<string, number>();
    for (const b of builds) {
      const n = (vistos.get(b.id) ?? 0) + 1;
      vistos.set(b.id, n);
      if (n > 1) b.id = `${b.id}-${n}`;
    }

    heroes.push({
      heroId,
      matches: builds.reduce((a, b) => a + b.matches, 0),
      builds,
      counters: (counters.get(heroId) ?? []).slice(0, 6),
    });
  }

  /**
   * El orden propio de cada build, que reemplaza al del héroe cuando existe.
   *
   * Va después de armarlas porque necesita los ítems ya elegidos. Se mandan los
   * **cuatro primeros**, no los doce: cada ítem que se exige achica la población,
   * y con los doce se estaría midiendo a quien copió la build exacta en vez de a
   * quien la juega.
   */
  let propios = 0;
  // Sólo las que NO pudieron medir el suyo sobre su propia gente. Desde que el
  // orden sale del snapshot, esto es la excepción y no la regla — y cada pedido
  // que se ahorra son ~7 segundos, que a dos corridas por hora importan.
  const pendientes = heroes
    .flatMap((h) => h.builds.map((b) => ({ h, b })))
    .filter(({ h, b }) => {
      const g = grupos.find((x) => x.heroId === h.heroId && x.matches === b.matches);
      return (g?.abilityOrder?.length ?? 0) !== 4;
    });
  const suyos = await enParalelo(pendientes, ({ h, b }) =>
    fetchBuildAbilityOrder(
      h.heroId,
      b.items.slice(0, 4).map((i) => i.itemId),
      badge,
      orden.get(h.heroId)
    )
  );
  pendientes.forEach(({ b }, n) => {
    const suyo = suyos[n];
    if (!suyo) return;
    if (JSON.stringify(suyo.order) !== JSON.stringify(b.abilityOrder)) propios++;
    b.abilityOrder = suyo.order;
    b.abilityPath = suyo.path;
  });
  const totalBuilds = heroes.reduce((a, h) => a + h.builds.length, 0);
  const distintos = heroes.filter(
    (h) => h.builds.length > 1 && new Set(h.builds.map((b) => JSON.stringify(b.abilityOrder ?? []))).size > 1
  ).length;
  const conVarias = heroes.filter((h) => h.builds.length > 1).length;
  console.log(
    `  orden de subida: ${totalBuilds - pendientes.length} de ${totalBuilds} builds lo miden sobre su propia gente` +
      `${pendientes.length ? ` (${propios} de ${pendientes.length} pedidos a la API difieren)` : ""} · ` +
      `${distintos} de ${conVarias} héroes con varias builds maxean distinto (${lap()}s)`
  );

  // Los nombres e íconos de las habilidades que de verdad se usan. Se piden
  // después de armar las builds para no bajar 152 fichas que nadie va a dibujar.
  const usadas = [...new Set(heroes.flatMap((h) => h.builds[0]?.abilityOrder ?? []))];
  // La casilla del 1 al 4 con la que el juego numera cada habilidad. Es un solo
  // pedido para los 57 héroes, y sirve para que las filas de la grilla salgan en
  // ese orden en vez del de subida — que en algunos héroes daba 1, 3, 2, 4.
  const slots = await fetchAbilitySlots();
  const abilities = await fetchAbilityAssets(usadas, slots);
  /**
   * Cuáles de los doce cuadrados están haciendo el trabajo.
   *
   * El corte es el **percentil 75 del aporte de todo lo publicado en la corrida**,
   * no un número elegido: así "este objeto carga la build" significa lo mismo en
   * la tarjeta de cualquier héroe, y por construcción lo lleva alrededor de uno
   * de cada cuatro — que es lo que hace que la marca se vea. Es el mismo criterio
   * con el que se calibraron las etiquetas de dificultad y tendencia.
   */
  const todosLosEdges = heroes
    .flatMap((h) => h.builds.flatMap((b) => b.items.map((i) => i.edge)))
    .sort((a, b) => a - b);
  const corteEdge = todosLosEdges.length
    ? todosLosEdges[Math.floor(todosLosEdges.length * 0.75)]
    : Infinity;
  let marcados = 0;
  for (const h of heroes) {
    for (const b of h.builds) {
      for (const i of b.items) {
        // Positivo Y arriba del corte: un percentil alto de una distribución que
        // fuera toda negativa no debería marcar nada.
        if (i.edge > 0 && i.edge >= corteEdge) { i.carries = true; marcados++; }
      }
    }
  }
  console.log(
    `  aporte: corte en ${corteEdge.toFixed(2)} pts (p75 de ${todosLosEdges.length} objetos), ` +
      `${marcados} marcados como los que cargan`
  );

  /**
   * La cuarta tarjeta: la build que recomendamos.
   *
   * Corre DESPUÉS de marcar los que cargan, porque el criterio de qué no tocar
   * sale justamente de esa marca. Parte de la build más jugada de cada héroe
   * —que es `builds[0]`, porque los arquetipos vienen ordenados por partidas— y
   * cambia de a un objeto sin salirse de lo que la gente juega.
   *
   * Diseño en `docs/design/2026-08-03-recomendador-de-builds-deadlock-design.md`.
   */
  let conCambios = 0;
  let cambiosTotales = 0;
  for (const h of heroes) {
    const partida = h.builds[0];
    if (!partida) continue;
    const jugadores = (porHeroe.get(h.heroId) ?? []).map((j) => j.items);
    const enBuild = new Set(partida.items.map((i) => i.itemId));

    // El pool son los objetos con aporte medido en ESTE héroe que no están ya
    // en la build.
    const pool: Candidate[] = [];
    for (const [clave, ap] of edge) {
      const [hid, iid] = clave.split("|").map(Number);
      if (hid !== h.heroId || enBuild.has(iid) || !items.has(iid)) continue;
      pool.push({ itemId: iid, edge: ap, buys: buys.get(clave) ?? 0 });
    }

    const rec = recommend(
      partida.items.map((i) => ({ itemId: i.itemId, edge: i.edge, carries: i.carries })),
      pool,
      itemMeta,
      soporteDe(jugadores)
    );
    if (rec.swaps.length > 0) { conCambios++; cambiosTotales += rec.swaps.length; }

    // Cuántos de ESTE héroe llevan cada objeto — para los que entran, que no
    // tenían prevalencia dentro de la build de la que se partió.
    const llevan = (id: number) =>
      jugadores.length === 0
        ? 0
        : jugadores.filter((b) => b.includes(id)).length / jugadores.length;

    const itemsReco: BuildItem[] = rec.items.flatMap((id) => {
      const meta = items.get(id);
      if (!meta) return [];
      const previo = partida.items.find((i) => i.itemId === id);
      return [{
        itemId: id,
        tier: meta.tier as 1 | 2 | 3 | 4,
        minute: minutos.get(`${h.heroId}|${id}`) ?? 0,
        edge: Number((edge.get(`${h.heroId}|${id}`) ?? 0).toFixed(2)),
        prevalence: Number((previo?.prevalence ?? llevan(id)).toFixed(3)),
        ...(previo?.carries ? { carries: true } : {}),
        chain: chainTo(items, id),
      }];
    });

    h.recommended = {
      from: partida.id,
      items: itemsReco,
      // El mismo cálculo que las medidas: los doce finales dicen dónde termina,
      // esto dice cómo se llega. Sin el orden, la recomendación no se puede seguir.
      buyOrder: buyOrder(itemsReco, (id) => minutos.get(`${h.heroId}|${id}`)),
      swaps: rec.swaps.map((s) => ({
        out: s.out,
        in: s.in,
        edgeOut: Number(s.edgeOut.toFixed(2)),
        edgeIn: Number(s.edgeIn.toFixed(2)),
        support: s.support,
      })),
    };
  }
  console.log(
    `  recomendación: ${conCambios} de ${heroes.length} héroes mejoran su build más jugada ` +
      `(${cambiosTotales} cambios en total) (${lap()}s)`
  );

  const conSlot = Object.values(abilities).filter((a) => a.slot).length;
  console.log(
    `  fichas de habilidad: ${Object.keys(abilities).length} de ${usadas.length}` +
      `, ${conSlot} con casilla (${lap()}s)`
  );

  const file: BuildsFile = {
    generatedAt: new Date().toISOString(),
    band: bandaDefecto,
    from: tot.from,
    to: tot.to,
    matches: Number(tot.matches),
    ...(crossesPatch ? { crossesPatch: true } : {}),
    k: Number.isFinite(k) ? Number(k.toFixed(0)) : 0,
    // El ajuste del mecanismo se publica porque **la nota del informe de partida
    // usa este mismo reparto** (ver `report.ts`), y estimarlo pide el pareo
    // entero. Publicarlo acá lo mantiene vivo: la nota hereda lo que midió la
    // última corrida en vez de arrastrar una constante escrita a mano.
    mechanism: {
      damage: Number(fit.damage.toFixed(4)),
      deaths: Number(fit.deaths.toFixed(4)),
      economy: Number(fit.economy.toFixed(4)),
    },
    abilities,
    heroes,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(file));

  const reparto: Record<number, number> = {};
  for (const h of heroes) reparto[h.builds.length] = (reparto[h.builds.length] ?? 0) + 1;
  console.log(
    `\n  ${heroes.length} héroes · builds por héroe ${JSON.stringify(reparto)} · ` +
      `${heroes.reduce((a, h) => a + h.counters.length, 0)} counters · ` +
      `${(JSON.stringify(file).length / 1024).toFixed(0)} KB (${lap()}s)`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // El snapshot se reescribe cada ~70 minutos y estas consultas duran
  // minutos: si la partición cambia en el medio, DuckDB aborta. Reintentar
  // es más honesto que desactivar el chequeo, que dejaría leer mitad de un
  // archivo y mitad de otro sin decir nada.
  retryingOnRewrite(main).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
