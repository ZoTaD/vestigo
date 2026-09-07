import { useEffect, useState } from "react";
import { BANDS, type BandId } from "./deadlockData";
import { RANKED_SINCE } from "./deadlockMatch";

/**
 * "¿Cómo estás vos respecto a los demás?": tus promedios contra los de los
 * jugadores de tu banda, en clasificatorias de esta temporada.
 *
 * **La fuente es `/v1/analytics/player-stats/metrics`**, medida el 2026-09-07:
 * devuelve, por métrica, el promedio y los percentiles 1-5-10-25-50-75-90-95-99
 * de la población (DDSketch, error relativo máximo 0,01), y acepta los mismos
 * filtros que el resto de analytics. Con `account_ids` da lo mismo pero sólo
 * sobre tus partidas, así que **dos pedidos** contestan la pregunta: el tuyo y
 * el de tu banda. La respuesta se cachea una hora del lado de la API.
 *
 * **La banda es la del lobby, no la tuya.** `min/max_average_badge` filtra por
 * el promedio de la sala, que es exactamente lo que miden las tier lists del
 * sitio ("cada banda se mide con sus propias partidas"): comparás contra la
 * gente que juega en salas como las tuyas. Es la misma unidad en todo Vestigo.
 *
 * El percentil propio se interpola entre los nueve puntos publicados; no es
 * exacto (el sketch tampoco lo es) y se muestra redondeado a enteros.
 */

const API = "https://api.deadlock-api.com/v1";

/** Las claves que devuelve la API, tal cual. */
export interface MetricDist {
  avg: number;
  std: number;
  percentile1: number;
  percentile5: number;
  percentile10: number;
  percentile25: number;
  percentile50: number;
  percentile75: number;
  percentile90: number;
  percentile95: number;
  percentile99: number;
}

export type MetricsFile = Record<string, MetricDist>;

/** Las seis que se muestran, en este orden. `lowerIsBetter` invierte el percentil. */
export const VS_METRICS: { key: string; lowerIsBetter?: boolean; digits: number }[] = [
  { key: "net_worth_per_min", digits: 0 },
  { key: "player_damage_per_min", digits: 0 },
  { key: "kda", digits: 2 },
  { key: "last_hits", digits: 0 },
  { key: "deaths", lowerIsBetter: true, digits: 1 },
  { key: "accuracy", digits: 1 },
];

/** La banda que contiene un badge (`rango*10 + subnivel`), y su rango de badges. */
export function bandRangeOf(badge: number): { band: BandId; min: number; max: number } | null {
  if (!badge || badge <= 0) return null;
  const tier = Math.floor(badge / 10);
  const b = BANDS.find((x) => x.tiers.includes(tier));
  if (!b) return null;
  const lo = Math.min(...b.tiers);
  const hi = Math.max(...b.tiers);
  return { band: b.id, min: Math.max(1, lo * 10 + 1), max: hi * 10 + 6 };
}

const POINTS: [number, keyof MetricDist][] = [
  [1, "percentile1"],
  [5, "percentile5"],
  [10, "percentile10"],
  [25, "percentile25"],
  [50, "percentile50"],
  [75, "percentile75"],
  [90, "percentile90"],
  [95, "percentile95"],
  [99, "percentile99"],
];

/**
 * En qué percentil de la distribución cae un valor, interpolando entre los
 * nueve puntos publicados. Devuelve 1..99. Con `lowerIsBetter`, 99 es el mejor
 * igual que en las demás: "mejor que el 99 %".
 */
export function percentileOf(value: number, dist: MetricDist, lowerIsBetter = false): number {
  const pts = POINTS.map(([p, k]) => [p, dist[k]] as [number, number]);
  let pct: number;
  if (value <= pts[0][1]) pct = 1;
  else if (value >= pts[pts.length - 1][1]) pct = 99;
  else {
    pct = 99;
    for (let i = 1; i < pts.length; i++) {
      const [p0, v0] = pts[i - 1];
      const [p1, v1] = pts[i];
      if (value <= v1) {
        pct = v1 === v0 ? p1 : p0 + ((value - v0) / (v1 - v0)) * (p1 - p0);
        break;
      }
    }
  }
  pct = Math.min(99, Math.max(1, pct));
  return Math.round(lowerIsBetter ? 100 - pct : pct);
}

export interface VsRow {
  key: string;
  mine: number;
  median: number;
  /** "Mejor que el N %" de la banda. */
  percentile: number;
  lowerIsBetter: boolean;
  digits: number;
}

export function compare(mine: MetricsFile, band: MetricsFile): VsRow[] {
  const out: VsRow[] = [];
  for (const m of VS_METRICS) {
    const a = mine[m.key];
    const b = band[m.key];
    if (!a || !b || !Number.isFinite(a.avg) || !Number.isFinite(b.percentile50)) continue;
    out.push({
      key: m.key,
      mine: a.avg,
      median: b.percentile50,
      percentile: percentileOf(a.avg, b, m.lowerIsBetter),
      lowerIsBetter: m.lowerIsBetter === true,
      digits: m.digits,
    });
  }
  return out;
}

async function fetchMetrics(params: Record<string, string>): Promise<MetricsFile> {
  const q = new URLSearchParams({
    match_mode: "Ranked",
    min_unix_timestamp: String(RANKED_SINCE),
    ...params,
  });
  const res = await fetch(`${API}/analytics/player-stats/metrics?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as MetricsFile;
}

export type VsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; band: BandId; rows: VsRow[] };

/** Tus promedios contra los de tu banda; `idle` mientras no haya rango. */
export function useVsBand(accountId: number | null, badge: number): VsState {
  const [state, setState] = useState<VsState>({ status: "idle" });

  useEffect(() => {
    const range = accountId ? bandRangeOf(badge) : null;
    if (!accountId || !range) {
      setState({ status: "idle" });
      return;
    }
    let vivo = true;
    setState({ status: "loading" });
    Promise.all([
      fetchMetrics({ account_ids: String(accountId) }),
      fetchMetrics({ min_average_badge: String(range.min), max_average_badge: String(range.max) }),
    ]).then(
      ([mine, band]) => {
        if (!vivo) return;
        const rows = compare(mine, band);
        setState(rows.length === 0 ? { status: "failed" } : { status: "ready", band: range.band, rows });
      },
      () => vivo && setState({ status: "failed" })
    );
    return () => {
      vivo = false;
    };
  }, [accountId, badge]);

  return state;
}
