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
/**
 * De las grabaciones de RM 1v1 (2026-11-26; los resúmenes viejos no lo traen): `rec` `"<banda>|<civ>"` → [jugadores,
 * victorias]; `units` `"<banda>|<civ>|<línea>"` → [partidas en que entrenó 10 o más, victorias]; `apm` `"<banda>"` y
 * `age` `"<banda>|<edad 0-2>"` → [jugadores, suma]; `top` → las marcas (`Marca`).
 */
export type Window = {
  games: number; days: number; civ: Pares; map: Pares; vs: Pares; dur: Pares; open?: Pares; n?: Pares;
  rec?: Pares; units?: Pares; apm?: Pares; age?: Pares; top?: Partial<Record<MarcaKey, Marca[]>>;
};
export type MarcaKey = "feudal" | "imperial" | "apm" | "villagers" | "army";
/** `[valor, partida, perfil, civ, extra (la línea en army), alias]`. */
export type Marca = [number, number, number, string, number | null, string?];
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
export const preloadAoe2Route = async (route: { a2Section?: string; detail?: string }): Promise<void> => {
  const lista = route.a2Section === "units" && !route.detail; // la tier list de unidades (2026-11-26)
  if (route.a2Section === "civilizations" || route.a2Section === "matchups" || route.a2Section === "maps" || lista) await loadSummary();
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

// ---------- Unidades (2026-11-26) ----------

export type Tier = "S" | "A" | "B" | "C" | "D";
export type UnitRow = { line: number; games: number; wins: number; wr: number; pick: number; tier: Tier; small: boolean };
/** Muestra chica para una unidad: menos partidas que esto y no lleva nota. */
export const UNIT_MIN = 30;
/** Barcos pesqueros, de transporte y comerciales, carros de comercio y aldeanos: no son ejército. */
const ECONOMICAS = new Set([13, 17, 83, 128, 545]);
/**
 * La nota es relativa (puesto entre las unidades con muestra): masear una unidad ya sube el % (las partidas largas las
 * gana el que llegó a juntar ejército), así que lo que dice algo es la comparación. S el 10% de arriba, A el 20%
 * siguiente, B el 40% del medio, C el 20% y D el 10% de abajo.
 */
export function tierDe(puesto: number, total: number): Tier {
  const q = total > 1 ? puesto / (total - 1) : 0.5;
  return q < 0.1 ? "S" : q < 0.3 ? "A" : q < 0.7 ? "B" : q < 0.9 ? "C" : "D";
}

function porLinea(p: Pares | undefined, band: BandOrAll, civ?: string): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  for (const [k, [g, w]] of Object.entries(p ?? {})) {
    const [b, c, l] = k.split("|");
    if ((band !== "all" && b !== band) || (civ && c !== civ)) continue;
    const x = out.get(Number(l)) ?? [0, 0];
    out.set(Number(l), [x[0] + g, x[1] + w]);
  }
  return out;
}

/** Jugadores con grabación de cada civ (la base para "cuántos la usan"). */
function base(s: Summary, window: WindowKey, band: BandOrAll): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, [g]] of Object.entries(s.windows[window]?.rec ?? {})) {
    const [b, c] = k.split("|");
    if (band !== "all" && b !== band) continue;
    out.set(c, (out.get(c) ?? 0) + g);
  }
  return out;
}

/**
 * La tier list de unidades: por línea, en cuántas partidas se entrenó 10 o más y cuántas se ganaron; `pick` = esas
 * partidas sobre los jugadores (con grabación) de las civs que tienen la unidad (`civsDe`).
 */
export function unitTable(s: Summary, window: WindowKey, band: BandOrAll, civsDe: (line: number) => string[]): UnitRow[] {
  const b = base(s, window, band);
  const filas = [...porLinea(s.windows[window]?.units, band)]
    .filter(([line]) => !ECONOMICAS.has(line))
    .map(([line, [g, w]]) => {
      const civs = civsDe(line);
      const total = (civs.length ? civs : [...b.keys()]).reduce((a, c) => a + (b.get(c) ?? 0), 0);
      return { line, games: g, wins: w, wr: w / g, pick: total ? g / total : 0, tier: "B" as Tier, small: g < UNIT_MIN };
    })
    .sort((x, y) => Number(x.small) - Number(y.small) || y.wr - x.wr || y.games - x.games);
  const conNota = filas.filter((r) => !r.small).length;
  filas.forEach((r, i) => {
    if (!r.small) r.tier = tierDe(i, conNota);
  });
  return filas;
}

/** Con qué civs rinde más una unidad (las que la usaron al menos `UNIT_MIN` veces). */
export function unitByCiv(s: Summary, window: WindowKey, band: BandOrAll, line: number): { civ: string; games: number; wr: number }[] {
  const out: { civ: string; games: number; wr: number }[] = [];
  for (const [k, [g, w]] of Object.entries(s.windows[window]?.units ?? {})) {
    const [b, c, l] = k.split("|");
    if (Number(l) !== line || (band !== "all" && b !== band)) continue;
    const x = out.find((r) => r.civ === c);
    if (x) {
      x.wr = (x.wr * x.games + w) / (x.games + g);
      x.games += g;
    } else out.push({ civ: c, games: g, wr: w / g });
  }
  return out.filter((r) => r.games >= UNIT_MIN).sort((a, b) => b.wr - a.wr);
}

/** Promedios por banda (`apm` o el clic a una edad, en segundos de juego). */
export function promedios(s: Summary, window: WindowKey, que: "apm" | 0 | 1 | 2): { band: Band; avg: number; n: number }[] {
  const w = s.windows[window];
  return BANDS.map((band) => {
    const x = que === "apm" ? w?.apm?.[band] : w?.age?.[`${band}|${que}`];
    return x && x[0] >= UNIT_MIN ? { band, avg: x[1] / x[0], n: x[0] } : null;
  }).filter((r): r is { band: Band; avg: number; n: number } => r != null);
}

/** La línea más usada en serio (más partidas con 10 o más) y en qué parte de las partidas con grabación. */
export function masUsada(s: Summary, window: WindowKey): { line: number; share: number } | null {
  const porL = porLinea(s.windows[window]?.units, "all");
  const total = [...base(s, window, "all").values()].reduce((a, b) => a + b, 0);
  let mejor: [number, number] | null = null;
  for (const [l, [g]] of porL) if (!ECONOMICAS.has(l) && (!mejor || g > mejor[1])) mejor = [l, g];
  return mejor && total ? { line: mejor[0], share: mejor[1] / total } : null;
}
