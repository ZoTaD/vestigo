import { useEffect, useState } from "react";
import { bandRangeOf, percentileOf, pickParams, type MetricDist } from "./deadlockVsBand";
import type { SeasonPick } from "./deadlockSeasons";

/**
 * "Tus héroes contra tu banda": cada héroe tuyo contra la gente de tu banda
 * **con ese mismo héroe**.
 *
 * "Tú contra tu banda" compara tus promedios generales; un Lash de 900 de daño
 * por minuto se ve flojo al lado de la mediana de todos los héroes y es bueno
 * para un Lash. Con `bucket=hero` la API devuelve la distribución por héroe
 * (medido el 2/11: 8 héroes de la cuenta de prueba en 80 KB). Son dos pedidos:
 * el tuyo y el de la banda, que se guarda 12 h en el navegador como el de
 * `deadlockVsBand.ts`.
 */

const API = "https://api.deadlock-api.com/v1";

/** Las cuatro que se miden por héroe, en este orden. */
export const HERO_METRICS: { key: string; lowerIsBetter?: boolean }[] = [
  { key: "net_worth_per_min" },
  { key: "player_damage_per_min" },
  { key: "kda" },
  { key: "deaths", lowerIsBetter: true },
];

/** Partidas mínimas con un héroe en la temporada para medirlo. */
export const HERO_VS_MIN = 5;
/** Cuántos héroes se muestran. */
export const HERO_VS_TOP = 6;

type ByHero = Record<string, MetricDist> & { bucket?: unknown };

export interface HeroVsRow {
  heroId: number;
  matches: number;
  /** Percentil 1–99 por métrica, en el orden de `HERO_METRICS`; `null` si falta. */
  percentiles: (number | null)[];
  /** El promedio de los percentiles que hay: el número grande de la fila. */
  overall: number;
}

/** Lo puro: tus distribuciones y las de la banda → filas. */
export function heroVsRows(mine: ByHero[], band: ByHero[], matches: Map<number, number>): HeroVsRow[] {
  const deBanda = new Map(band.map((b) => [Number(b.bucket), b]));
  const out: HeroVsRow[] = [];
  for (const m of mine) {
    const id = Number(m.bucket);
    const n = matches.get(id) ?? 0;
    const b = deBanda.get(id);
    if (!b || n < HERO_VS_MIN) continue;
    const percentiles = HERO_METRICS.map(({ key, lowerIsBetter }) => {
      const a = m[key];
      const d = b[key];
      if (!a || !d || !Number.isFinite(a.avg)) return null;
      return percentileOf(a.avg, d, lowerIsBetter);
    });
    const hay = percentiles.filter((p): p is number => p !== null);
    if (hay.length === 0) continue;
    out.push({ heroId: id, matches: n, percentiles, overall: Math.round(hay.reduce((x, y) => x + y, 0) / hay.length) });
  }
  return out.sort((a, b) => b.matches - a.matches).slice(0, HERO_VS_TOP);
}

async function metrics(params: Record<string, string>): Promise<ByHero[]> {
  const q = new URLSearchParams({ match_mode: "Ranked", bucket: "hero", ...params });
  const res = await fetch(`${API}/analytics/player-stats/metrics?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) throw new Error("no es una lista");
  return raw as ByHero[];
}

const TTL = 12 * 3600 * 1000;
const memo = new Map<string, Promise<ByHero[]>>();

function bandByHero(min: number, max: number, pick: SeasonPick): Promise<ByHero[]> {
  const dates = pickParams(pick);
  const key = `vestigo:dl:bandhero:${dates.min_unix_timestamp}:${dates.max_unix_timestamp ?? ""}:${min}-${max}`;
  const m = memo.get(key);
  if (m) return m;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as { at: number; data: ByHero[] } | null;
    if (saved && Date.now() - saved.at < TTL) return Promise.resolve(saved.data);
  } catch {
    /* sin almacenamiento: se pide */
  }
  const p = metrics({ ...dates, min_average_badge: String(min), max_average_badge: String(max) }).then((data) => {
    try {
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
    } catch {
      /* lleno o bloqueado */
    }
    return data;
  });
  p.catch(() => memo.delete(key));
  memo.set(key, p);
  return p;
}

export type HeroVsState =
  | { status: "idle" | "loading" | "failed" }
  | { status: "ready"; rows: HeroVsRow[] };

/**
 * Tus héroes de la temporada contra tu banda. `matches` son tus partidas
 * clasificatorias por héroe en esa temporada (salen del historial, sin pedido).
 */
export function useHeroVsBand(
  accountId: number | null,
  badge: number,
  pick: SeasonPick,
  matches: Map<number, number>
): HeroVsState {
  const [state, setState] = useState<HeroVsState>({ status: "idle" });
  const clave = [...matches].map(([h, n]) => `${h}:${n}`).join(",");
  useEffect(() => {
    const range = accountId ? bandRangeOf(badge) : null;
    const alguno = [...matches.values()].some((n) => n >= HERO_VS_MIN);
    if (!accountId || !range || !alguno) {
      setState({ status: "idle" });
      return;
    }
    let vivo = true;
    setState({ status: "loading" });
    Promise.all([
      metrics({ ...pickParams(pick), account_ids: String(accountId) }),
      bandByHero(range.min, range.max, pick),
    ]).then(
      ([mine, band]) => vivo && setState({ status: "ready", rows: heroVsRows(mine, band, matches) }),
      () => vivo && setState({ status: "failed" })
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, badge, pick, clave]);
  return state;
}
