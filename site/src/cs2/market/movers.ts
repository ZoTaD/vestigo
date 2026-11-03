/**
 * Suben, bajan y más vendidas (2026-11-03, etapa 4) a partir de `prices/market.json`: las ventas reales de Skinport de
 * las variantes de skins y cajas que pasan los umbrales de `prices.py` (30 ventas en el mes, mediana de 0,50 US$).
 * Se compara la **mediana** (una venta a precio de broma no la mueve). Puro.
 */

/** `[nombre, slug, rareza ("case" en cajas), m24, m7, m30, m90, v7, v30]`. */
export type MarketRow = [name: string, slug: string, rarity: string, m24: number | null, m7: number | null, m30: number | null, m90: number | null, v7: number, v30: number];
export type Period = "7v30" | "1v7" | "30v90";
export type MarketKind = "all" | "skins" | "cases";

/** El cambio de la mediana nueva contra la anterior (0,1 = +10 %), o null si falta alguna. */
export function change(r: MarketRow, p: Period): number | null {
  const [now, before] = p === "7v30" ? [r[4], r[5]] : p === "1v7" ? [r[3], r[4]] : [r[5], r[6]];
  return now != null && before ? now / before - 1 : null;
}

export const PERIOD_MEDIANS: Record<Period, [before: 3 | 4 | 5 | 6, now: 3 | 4 | 5 | 6]> = { "7v30": [5, 4], "1v7": [4, 3], "30v90": [6, 5] };

export function movers(rows: readonly MarketRow[], p: Period, minSales: number, kind: MarketKind, n = 20) {
  const ok = rows.filter((r) => r[8] >= minSales && (kind === "all" || (kind === "cases") === (r[2] === "case")));
  const withCh = ok.map((r) => ({ r, c: change(r, p) })).filter((x): x is { r: MarketRow; c: number } => x.c != null);
  return {
    up: withCh.filter((x) => x.c > 0).sort((a, b) => b.c - a.c).slice(0, n).map((x) => x.r),
    down: withCh.filter((x) => x.c < 0).sort((a, b) => a.c - b.c).slice(0, n).map((x) => x.r),
    top: [...ok].sort((a, b) => b[8] - a[8]).slice(0, n),
  };
}
