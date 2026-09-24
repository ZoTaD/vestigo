import { bansWindowSql } from "./snapshot";

/**
 * Cuánto se banea cada héroe, por banda.
 *
 * **Sale del lake y no de `/v1/analytics/hero-ban-stats`.** La API devuelve
 * conteos de baneos sin denominador: dice que el héroe 81 fue baneado 1.335
 * veces, pero no de cuántas partidas. El lake trae `banned_hero_ids` partida
 * por partida, así que se puede contar las dos cosas y publicar una tasa: "baneado
 * en el 37% de las partidas".
 *
 * **La muestra es chica y está sesgada hacia arriba, y las dos cosas se miden
 * acá.** Los baneos sólo se conocen de las partidas cuya demo analizó
 * deadlock-api. Medido el 2026-09-24 sobre quince días de rankeadas:
 *
 * | Rango | Partidas | Con baneos | % |
 * |---|---|---|---|
 * | 1–8 | 165.192 | 1.339 | 0,6–0,95% |
 * | 9 (Fantasma) | 19.765 | 335 | 1,7% |
 * | 10 (Ascendente) | 6.603 | 362 | 5,5% |
 * | 11 (Eterno) | 1.135 | 188 | 16,6% |
 *
 * Por eso **no hay una tasa global**: mezclaría rangos en la proporción en que
 * se analizan, y un Eterno pesaría veinte veces más que un Iniciado. Se publica
 * por banda, y adentro de cada banda cada rango pesa lo que pesa en las
 * partidas jugadas, no en las analizadas (`banRatesFor`).
 *
 * Tres baneos por partida rankeada, siempre: medido, las 727 partidas con
 * baneos de una semana traen exactamente tres.
 */

/** Por rango: partidas jugadas y cuántas de ésas traen los baneos. */
export interface TierBanRow {
  tier: number;
  matches: number;
  banned: number;
}

/** Por rango y héroe: en cuántas partidas analizadas lo banearon. */
export interface HeroTierBanRow {
  tier: number;
  hero_id: number;
  bans: number;
}

/**
 * Debajo de esto una banda no publica baneos.
 *
 * Con 250 partidas, un héroe baneado en el 10% se mide ±3,7 puntos al 95%, y
 * uno en el 35% ±5,9. Alcanza para ordenar quién se banea mucho y quién no,
 * que es lo que la página dice; no alcanza para distinguir 12% de 14%, y por
 * eso la cifra se muestra sin decimales.
 */
export const MIN_BAN_MATCHES = 250;

export interface BandBans {
  /** Partidas con baneos de la banda: la muestra de la que sale todo. */
  matches: number;
  /** Héroe → fracción de las partidas en que estuvo baneado (0 a 1). */
  rates: Map<number, number>;
}

/**
 * La tasa de baneo de cada héroe en una banda, o `null` si la banda no llega a
 * `MIN_BAN_MATCHES`.
 *
 * Cada rango de la banda aporta su propia tasa, pesada por las partidas que se
 * juegan en él (post-estratificación). Un rango sin ninguna partida analizada
 * no aporta nada y su peso se reparte entre los demás: no hay de dónde sacar
 * su tasa, y suponerla 0 bajaría a todos los héroes.
 */
export function banRatesFor(tiers: number[], tierRows: TierBanRow[], heroRows: HeroTierBanRow[]): BandBans | null {
  const enBanda = tierRows.filter((t) => tiers.includes(t.tier) && t.banned > 0);
  const muestra = enBanda.reduce((n, t) => n + t.banned, 0);
  if (muestra < MIN_BAN_MATCHES) return null;

  const jugadas = enBanda.reduce((n, t) => n + t.matches, 0);
  const porRango = new Map(enBanda.map((t) => [t.tier, t]));
  const rates = new Map<number, number>();
  for (const row of heroRows) {
    const t = porRango.get(row.tier);
    if (!t) continue;
    const peso = t.matches / jugadas;
    rates.set(row.hero_id, (rates.get(row.hero_id) ?? 0) + peso * (row.bans / t.banned));
  }
  return { matches: muestra, rates };
}

/**
 * Las dos cuentas en una consulta: por rango (`hero_id` nulo) y por rango y
 * héroe. La ventana se lee una sola vez gracias al CTE materializado; cada
 * partida se reduce a una fila antes de contar, porque el lake trae una por
 * jugador y los baneos se repiten en las doce.
 */
export function bansSql(partitions: number[], from: string, to: string): string {
  return `
    with m as materialized (
      select match_id, any_value(tier) as tier, any_value(banned_hero_ids) as b
      from (${bansWindowSql(partitions, from, to)})
      group by match_id
    )
    select tier, null::INTEGER as hero_id, count(*)::BIGINT as n,
           sum(case when len(b) > 0 then 1 else 0 end)::BIGINT as banned
    from m group by tier
    union all
    select tier, h::INTEGER as hero_id, count(*)::BIGINT as n, 0::BIGINT as banned
    from (select tier, unnest(b) as h from m where len(b) > 0)
    group by tier, h`;
}

/** Separa el resultado de `bansSql` en las dos listas que usa `banRatesFor`. */
export function splitBanRows(
  rows: { tier: number | bigint; hero_id: number | null; n: number | bigint; banned: number | bigint }[]
): { tiers: TierBanRow[]; heroes: HeroTierBanRow[] } {
  const tiers: TierBanRow[] = [];
  const heroes: HeroTierBanRow[] = [];
  for (const r of rows) {
    if (r.hero_id === null) tiers.push({ tier: Number(r.tier), matches: Number(r.n), banned: Number(r.banned) });
    else heroes.push({ tier: Number(r.tier), hero_id: Number(r.hero_id), bans: Number(r.n) });
  }
  return { tiers, heroes };
}
