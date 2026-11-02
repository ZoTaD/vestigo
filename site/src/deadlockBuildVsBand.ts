import { useEffect, useState } from "react";
import { catalogItem } from "./deadlockItemsData";
import { bandRangeOf, pickParams } from "./deadlockVsBand";
import type { SeasonPick } from "./deadlockSeasons";

/**
 * "Tu build contra la de tu banda": qué comprás distinto que la gente de tu
 * rango con el mismo héroe.
 *
 * Tres pedidos a `analytics`, todos en la temporada elegida:
 *
 * - `hero-stats?account_ids=` → tus partidas por héroe **en la misma base de
 *   datos que las compras**. El historial cuenta partidas que no tienen compras
 *   cargadas (medido el 2/11: la cuenta de prueba tiene 42 de Infernus en el
 *   historial y ninguna con objetos), así que el denominador sale de acá.
 * - `item-stats?account_id=&hero_id=` → tus compras con ese héroe.
 * - `item-stats?hero_id=` + `hero-stats` de la banda → las de tu banda, que se
 *   guardan en memoria por héroe (son las mismas para todos los perfiles).
 *
 * Sólo objetos de 1.600 o más: los de 800 son piezas que se compran casi
 * siempre y diferencias de "lo compraste en el 92 % contra el 88 %" no dicen
 * nada de la build.
 */

const API = "https://api.deadlock-api.com/v1/analytics";

/** Partidas mínimas tuyas con un héroe para comparar su build. */
export const BUILD_VS_MIN = 5;
/** Diferencia de tasa de compra para decir "más seguido" o "lo salteás". */
const RATE_GAP = 0.25;
/** Tasa mínima en la banda para que saltearlo sea noticia. */
const SKIP_FLOOR = 0.35;
/** Diferencia de minuto de compra que vale la pena decir. */
const LATE_GAP_S = 180;
/** Veces mínimas que lo compraste para hablar de tu minuto. */
const MIN_MINE = 3;
const MIN_COST = 1600;
const TOP = 4;

interface ItemRow {
  item_id: number;
  matches: number;
  avg_buy_time_s: number;
}

interface HeroRow {
  hero_id: number;
  matches: number;
}

export interface ItemDiff {
  itemId: number;
  /** Fracción de tus partidas en que lo compraste. */
  mine: number;
  band: number;
  /** Minuto medio de compra, tuyo y de la banda. */
  mineMin: number;
  bandMin: number;
}

export interface BuildVs {
  heroId: number;
  matches: number;
  more: ItemDiff[];
  skip: ItemDiff[];
  later: ItemDiff[];
  earlier: ItemDiff[];
}

const cost = (id: number): number => catalogItem(id)?.cost ?? 0;

/** Lo puro: compras tuyas y de la banda → las diferencias. */
export function buildDiff(
  heroId: number,
  mine: ItemRow[],
  myMatches: number,
  band: ItemRow[],
  bandMatches: number
): BuildVs {
  const deBanda = new Map(band.map((b) => [b.item_id, b]));
  const ids = new Set([...mine.map((m) => m.item_id), ...band.map((b) => b.item_id)]);
  const mio = new Map(mine.map((m) => [m.item_id, m]));
  const filas: ItemDiff[] = [];
  for (const id of ids) {
    if (cost(id) < MIN_COST) continue;
    const a = mio.get(id);
    const b = deBanda.get(id);
    filas.push({
      itemId: id,
      mine: a ? a.matches / myMatches : 0,
      band: b && bandMatches > 0 ? b.matches / bandMatches : 0,
      mineMin: a ? a.avg_buy_time_s / 60 : 0,
      bandMin: b ? b.avg_buy_time_s / 60 : 0,
    });
  }
  const conMinuto = filas.filter(
    (f) => (mio.get(f.itemId)?.matches ?? 0) >= MIN_MINE && f.band >= 0.1 && f.bandMin > 0
  );
  return {
    heroId,
    matches: myMatches,
    more: filas
      .filter((f) => f.mine - f.band >= RATE_GAP && (mio.get(f.itemId)?.matches ?? 0) >= MIN_MINE)
      .sort((x, y) => y.mine - y.band - (x.mine - x.band))
      .slice(0, TOP),
    skip: filas
      .filter((f) => f.band >= SKIP_FLOOR && f.band - f.mine >= RATE_GAP)
      .sort((x, y) => y.band - y.mine - (x.band - x.mine))
      .slice(0, TOP),
    later: conMinuto
      .filter((f) => (f.mineMin - f.bandMin) * 60 >= LATE_GAP_S)
      .sort((x, y) => y.mineMin - y.bandMin - (x.mineMin - x.bandMin))
      .slice(0, TOP),
    earlier: conMinuto
      .filter((f) => (f.bandMin - f.mineMin) * 60 >= LATE_GAP_S)
      .sort((x, y) => y.bandMin - y.mineMin - (x.bandMin - x.mineMin))
      .slice(0, TOP),
  };
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const memo = new Map<string, Promise<unknown>>();
function once<T>(key: string, f: () => Promise<T>): Promise<T> {
  let p = memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = f();
    p.catch(() => memo.delete(key));
    memo.set(key, p);
  }
  return p;
}

/** Tus partidas por héroe en la temporada, contadas donde están las compras. */
export function useBuildHeroes(accountId: number | null, pick: SeasonPick): Map<number, number> | null {
  const [heroes, setHeroes] = useState<Map<number, number> | null>(null);
  useEffect(() => {
    setHeroes(null);
    if (!accountId) return;
    let vivo = true;
    get<HeroRow[]>("hero-stats", { ...pickParams(pick), account_ids: String(accountId) }).then(
      (rows) => vivo && setHeroes(new Map(rows.map((r) => [r.hero_id, r.matches]))),
      () => vivo && setHeroes(new Map())
    );
    return () => {
      vivo = false;
    };
  }, [accountId, pick]);
  return heroes;
}

/** `diff: null` cuando tus partidas no tienen compras cargadas: sin ellas, todo parecería "lo salteás". */
export type BuildVsState = { status: "idle" | "loading" | "failed" } | { status: "ready"; diff: BuildVs | null };

export function useBuildVsBand(
  accountId: number | null,
  heroId: number | null,
  myMatches: number,
  badge: number,
  pick: SeasonPick
): BuildVsState {
  const [state, setState] = useState<BuildVsState>({ status: "idle" });
  useEffect(() => {
    const range = bandRangeOf(badge);
    if (!accountId || heroId == null || !range || myMatches < BUILD_VS_MIN) {
      setState({ status: "idle" });
      return;
    }
    let vivo = true;
    setState({ status: "loading" });
    const dates = pickParams(pick);
    const banda = { ...dates, min_average_badge: String(range.min), max_average_badge: String(range.max) };
    const bk = JSON.stringify(banda);
    Promise.all([
      get<ItemRow[]>("item-stats", { ...dates, account_id: String(accountId), hero_id: String(heroId) }),
      once(`items:${bk}:${heroId}`, () => get<ItemRow[]>("item-stats", { ...banda, hero_id: String(heroId) })),
      once(`heroes:${bk}`, () => get<HeroRow[]>("hero-stats", banda)),
    ]).then(
      ([mine, band, heroes]) => {
        if (!vivo) return;
        const bandMatches = heroes.find((h) => h.hero_id === heroId)?.matches ?? 0;
        setState({
          status: "ready",
          diff: mine.length === 0 ? null : buildDiff(heroId, mine, myMatches, band, bandMatches),
        });
      },
      () => vivo && setState({ status: "failed" })
    );
    return () => {
      vivo = false;
    };
  }, [accountId, heroId, myMatches, badge, pick]);
  return state;
}
