/**
 * Las estadísticas de civs de AoE2 (2026-11-20), sin React: leen `games/aoe2/stats/summary.json` (lo escribe
 * `games/aoe2/tools/daily.py`) y arman las tablas de Civilizaciones, Matchups y Mapas. Tests en `test/aoe2Stats.test.ts`.
 * Toda cifra con menos de 200 partidas lleva `small`.
 */
export type Band = "<1000" | "1000-1400" | "1400-1800" | "1800+";
export type BandOrAll = Band | "all";
export type WindowKey = "7" | "14" | "28" | "patch";
export type StatMode = "rm1v1" | "rmteam" | "ew1v1" | "ewteam";
type Pares = Record<string, [number, number]>;
/** `n`: `"<modo>|<banda>"` → [partidas, jugadores] (desde el 21/11; los resúmenes viejos no lo traen). */
export type Window = { games: number; days: number; civ: Pares; map: Pares; vs: Pares; dur: Pares; open?: Pares; n?: Pares };
export type Summary = {
  generatedAt: string;
  patch: { name: string; since: string } | null;
  windows: Partial<Record<WindowKey, Window>>;
  prev: Partial<Record<string, { games: number; civ: Pares }>>;
};

export const BANDS: Band[] = ["<1000", "1000-1400", "1400-1800", "1800+"];
export const SMALL = 200;
/** Cuántas civs hay por partida en cada modo, para pasar de "civs jugadas" a partidas (los de equipo varían: 2v2 a 4v4). */
const CIVS_POR_PARTIDA: Record<StatMode, number> = { rm1v1: 2, ew1v1: 2, rmteam: 6, ewteam: 6 };

let resumen: Summary | null | undefined;
let pedido: Promise<Summary | null> | null = null;
/** Carga el resumen una sola vez (en su propio chunk, regla 4). */
export const loadSummary = (): Promise<Summary | null> =>
  (pedido ??= import("../../../../games/aoe2/stats/summary.json")
    .then((m) => (resumen = m.default as unknown as Summary))
    .catch(() => (resumen = null)));
/** Lo ya cargado (undefined si todavía no): así el prerender dibuja la tabla en vez de "Cargando". */
export const peekSummary = (): Summary | null | undefined => resumen;
/** Lo que el prerender tiene que esperar para una ruta de AoE2 (las pestañas de estadísticas). */
export const preloadAoe2Route = async (route: { a2Section?: string }): Promise<void> => {
  if (route.a2Section === "civilizations" || route.a2Section === "matchups" || route.a2Section === "maps") await loadSummary();
};

export type CivRow = { civ: string; games: number; wins: number; wr: number; pick: number; trend: number | null; small: boolean };

function sumarCiv(p: Pares | undefined, mode: StatMode, band: BandOrAll): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const [k, [g, w]] of Object.entries(p ?? {})) {
    const [m, b, c] = k.split("|");
    if (m !== mode || (band !== "all" && b !== band)) continue;
    const x = out.get(c) ?? [0, 0];
    out.set(c, [x[0] + g, x[1] + w]);
  }
  return out;
}

/** Una fila por civ: % de victorias, elección (partidas en que aparece / partidas del filtro) y tendencia contra la
 * ventana anterior de igual largo. Ordenada por % de victorias. */
export function civTable(s: Summary, f: { mode: StatMode; band: BandOrAll; window: WindowKey }): CivRow[] {
  const w = s.windows[f.window];
  if (!w) return [];
  const hoy = sumarCiv(w.civ, f.mode, f.band);
  const antes = sumarCiv(s.prev[f.window]?.civ, f.mode, f.band);
  const total = [...hoy.values()].reduce((a, [g]) => a + g, 0);
  const contadas = Object.entries(w.n ?? {})
    .filter(([k]) => {
      const [m, b] = k.split("|");
      return m === f.mode && (f.band === "all" || b === f.band);
    })
    .reduce((a, [, [g]]) => a + g, 0);
  // Sin la cuenta (resúmenes viejos), se estima con las civs por partida típicas del modo.
  const partidas = contadas || total / CIVS_POR_PARTIDA[f.mode];
  return [...hoy.entries()]
    .map(([civ, [g, v]]) => {
      const p = antes.get(civ);
      return {
        civ,
        games: g,
        wins: v,
        wr: v / g,
        pick: partidas ? g / partidas : 0,
        trend: p && p[0] >= SMALL && g >= SMALL ? v / g - p[1] / p[0] : null,
        small: g < SMALL,
      };
    })
    .sort((a, b) => b.wr - a.wr || b.games - a.games);
}

/** Cómo le va a `a` contra `b` en 1v1 (la clave se guarda en un solo orden: `civA < civB`). */
export function matchup(s: Summary, window: WindowKey, band: BandOrAll, a: string, b: string): { games: number; wr: number | null; small: boolean } {
  if (a === b) return { games: 0, wr: null, small: true };
  const [x, y] = a < b ? [a, b] : [b, a];
  let g = 0;
  let wx = 0;
  for (const bb of band === "all" ? BANDS : [band]) {
    const v = s.windows[window]?.vs[`${bb}|${x}|${y}`];
    if (v) {
      g += v[0];
      wx += v[1];
    }
  }
  if (!g) return { games: 0, wr: null, small: true };
  const wrX = wx / g;
  return { games: g, wr: a === x ? wrX : 1 - wrX, small: g < SMALL };
}

/** Las civs en un mapa (todas las bandas), por % de victorias. */
export function mapTable(s: Summary, window: WindowKey, mode: StatMode, map: string): CivRow[] {
  const p = s.windows[window]?.map ?? {};
  const out: CivRow[] = [];
  for (const [k, [g, v]] of Object.entries(p)) {
    const [m, mp, c] = k.split("|");
    if (m === mode && mp === map) out.push({ civ: c, games: g, wins: v, wr: v / g, pick: 0, trend: null, small: g < SMALL });
  }
  return out.sort((a, b) => b.games - a.games || b.wr - a.wr);
}

/** Los mapas de un modo con sus partidas, de más a menos jugados. */
export function mapsByGames(s: Summary, window: WindowKey, mode: StatMode): { map: string; games: number }[] {
  const c = new Map<string, number>();
  for (const [k, [g]] of Object.entries(s.windows[window]?.map ?? {})) {
    const [m, mp] = k.split("|");
    if (m === mode) c.set(mp, (c.get(mp) ?? 0) + g);
  }
  return [...c.entries()].map(([map, g]) => ({ map, games: Math.round(g / CIVS_POR_PARTIDA[mode]) })).sort((a, b) => b.games - a.games);
}

/** La duración promedio (minutos) de las partidas de una civ en un modo. */
export function avgMinutes(s: Summary, window: WindowKey, mode: StatMode, civ: string): number | null {
  const d = s.windows[window]?.dur[`${mode}|${civ}`];
  return d && d[0] ? Math.round(d[1] / d[0] / 60) : null;
}

// ---------- Aperturas (de las grabaciones de RM 1v1: `open`, "<banda>|<civ>|<apertura>") ----------

type OpRow = { civ: string; opening: string; games: number; wins: number };
function aperturas(s: Summary, window: WindowKey, band: BandOrAll): OpRow[] {
  const out = new Map<string, OpRow>();
  for (const [k, [g, w]] of Object.entries(s.windows[window]?.open ?? {})) {
    const [b, civ, opening] = k.split("|");
    if (band !== "all" && b !== band) continue;
    const x = out.get(`${civ}|${opening}`) ?? { civ, opening, games: 0, wins: 0 };
    x.games += g;
    x.wins += w;
    out.set(`${civ}|${opening}`, x);
  }
  return [...out.values()];
}

/** Las civs que abren con `opening`, de la más jugada a la menos. */
export function openingTable(s: Summary, window: WindowKey, band: BandOrAll, opening: string): (OpRow & { wr: number; small: boolean })[] {
  return aperturas(s, window, band)
    .filter((r) => r.opening === opening)
    .map((r) => ({ ...r, wr: r.wins / r.games, small: r.games < SMALL }))
    .sort((a, b) => b.games - a.games || b.wr - a.wr);
}

/** Para cada apertura, la civ con mejor % de victorias entre las que la jugaron al menos 30 veces. */
export function bestPerOpening(s: Summary, window: WindowKey, band: BandOrAll): { opening: string; civ: string; wr: number; games: number }[] {
  const por = new Map<string, { opening: string; civ: string; wr: number; games: number }>();
  for (const r of aperturas(s, window, band)) {
    if (r.games < 30 || r.opening === "other") continue;
    const wr = r.wins / r.games;
    const x = por.get(r.opening);
    if (!x || wr > x.wr) por.set(r.opening, { opening: r.opening, civ: r.civ, wr, games: r.games });
  }
  return [...por.values()].sort((a, b) => b.games - a.games);
}

/** Las aperturas de una civ, de la más jugada a la menos. */
export function civOpenings(s: Summary, window: WindowKey, band: BandOrAll, civ: string): { opening: string; games: number; wins: number; wr: number; small: boolean }[] {
  return aperturas(s, window, band)
    .filter((r) => r.civ === civ)
    .map((r) => ({ opening: r.opening, games: r.games, wins: r.wins, wr: r.wins / r.games, small: r.games < SMALL }))
    .sort((a, b) => b.games - a.games);
}
