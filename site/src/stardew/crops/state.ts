/**
 * El estado de la calculadora de cultivos (etapa 2, tarea 4): las opciones que se eligen arriba, el orden de la tabla,
 * cómo viajan en la dirección (`?season=1&fert=deluxe&sort=gross&dir=asc`) y las filas ya calculadas y ordenadas.
 * Las cuentas son las de `calc.ts`; acá sólo se arman, se filtran y se ordenan.
 */
import { growDays, profit, speedOf, type Crop, type Fert, type FruitTree, type Opts, type Profit } from "./calc";

type Lang = "en" | "es";

/** Las columnas por las que se ordena la tabla de cultivos. */
export const SORT_KEYS = ["name", "harvests", "days", "gross", "seeds", "net", "perDay", "sell"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type Sort = { key: SortKey; dir: "asc" | "desc" };

export const FERTS: Fert[] = ["none", "basic", "quality", "deluxe", "speed", "deluxeSpeed", "hyper"];

/** Lo que se elige en la pestaña: las opciones del motor (sin el arrozal, que va siempre prendido) y el orden. */
export type CropState = Omit<Opts, "paddyBonus"> & { sort: Sort };

/** Primavera, día 1, nivel 0, sin fertilizante ni profesiones, lo mejor, semillas compradas y por oro por día. */
export const DEFAULT_STATE: CropState = {
  season: 0,
  day: 1,
  level: 0,
  fert: "none",
  tiller: false,
  agriculturist: false,
  artisan: false,
  sell: "best",
  seeds: "buy",
  greenhouse: false,
  sort: { key: "perDay", dir: "desc" },
};

/** Las opciones del motor: el bonus del arrozal va prendido (Arroz y Taro junto al agua, como se plantan siempre). */
export const toOpts = (s: CropState): Opts => {
  const { sort: _sort, ...opts } = s;
  return { ...opts, paddyBonus: true };
};

/** Cómo arranca cada columna al tocarla: los números de mayor a menor, el nombre y la venta de la A a la Z. */
export const firstDir = (key: SortKey): Sort["dir"] => (key === "name" || key === "sell" ? "asc" : "desc");

/** Las profesiones en la dirección (`prof=tiller,agri,artisan`). */
const PROFS = { tiller: "tiller", agri: "agriculturist", artisan: "artisan" } as const;

const intIn = (v: string | null, lo: number, hi: number): number | null => (v && /^\d{1,2}$/.test(v) && +v >= lo && +v <= hi ? +v : null);

/** El estado escrito en la dirección; lo que no se conoce se ignora y queda el valor por defecto. */
export function readCropState(search: string): CropState {
  const q = new URLSearchParams(search);
  const d = DEFAULT_STATE;
  const fert = q.get("fert");
  const key = q.get("sort");
  const sortKey = key && (SORT_KEYS as readonly string[]).includes(key) ? (key as SortKey) : d.sort.key;
  const dir = q.get("dir");
  const prof = new Set((q.get("prof") ?? "").split(","));
  return {
    season: (intIn(q.get("season"), 0, 3) ?? d.season) as Opts["season"],
    day: intIn(q.get("day"), 1, 28) ?? d.day,
    level: intIn(q.get("level"), 0, 10) ?? d.level,
    fert: fert && (FERTS as string[]).includes(fert) ? (fert as Fert) : d.fert,
    tiller: prof.has("tiller"),
    agriculturist: prof.has("agri"),
    artisan: prof.has("artisan"),
    sell: q.get("sell") === "raw" ? "raw" : "best",
    seeds: q.get("seeds") === "own" ? "own" : "buy",
    greenhouse: q.get("gh") === "1",
    sort: { key: sortKey, dir: dir === "asc" || dir === "desc" ? dir : key === sortKey ? firstDir(sortKey) : d.sort.dir },
  };
}

/** Lo contrario: el `?…` del estado, sólo con lo que no es el valor por defecto (vacío si no cambió nada). */
export function writeCropState(s: CropState): string {
  const d = DEFAULT_STATE;
  const q = new URLSearchParams();
  if (s.season !== d.season) q.set("season", String(s.season));
  if (s.day !== d.day) q.set("day", String(s.day));
  if (s.level !== d.level) q.set("level", String(s.level));
  if (s.fert !== d.fert) q.set("fert", s.fert);
  const prof = (Object.keys(PROFS) as (keyof typeof PROFS)[]).filter((k) => s[PROFS[k]]);
  if (prof.length) q.set("prof", prof.join(","));
  if (s.sell !== d.sell) q.set("sell", s.sell);
  if (s.seeds !== d.seeds) q.set("seeds", s.seeds);
  if (s.greenhouse) q.set("gh", "1");
  if (s.sort.key !== d.sort.key || s.sort.dir !== d.sort.dir) {
    q.set("sort", s.sort.key);
    q.set("dir", s.sort.dir);
  }
  const out = q.toString().replace(/%2C/g, ",");
  return out ? `?${out}` : "";
}

const say = (pair: readonly [string, string], lang: Lang): string => (lang === "es" && pair[1]) || pair[0];

/** Una fila de la tabla: el cultivo, lo que da y sus días de crecimiento con las opciones. */
export interface CropRow {
  crop: Crop;
  p: Profit;
  days: number;
  name: string;
}

/** Con qué se vende: "raw" primero, después las máquinas por nombre. */
const sellRank = (r: CropRow): string => (r.p.best === "raw" ? "" : r.p.best);

const VALUE: Record<Exclude<SortKey, "name" | "sell">, (r: CropRow) => number> = {
  harvests: (r) => r.p.harvests,
  days: (r) => r.days,
  gross: (r) => r.p.gross,
  seeds: (r) => r.p.seedCost,
  net: (r) => r.p.net,
  perDay: (r) => r.p.perDay,
};

/**
 * La tabla de cultivos: sin los que no se plantan en la estación elegida, ordenada por la columna pedida, y los que no
 * llegan a cosecharse al final (en el mismo orden entre ellos). Los empates se resuelven por nombre. Las semillas
 * silvestres nunca compiten (`wildTable`); con semillas compradas, tampoco las que no se venden en ninguna tienda
 * (`noShopTable`).
 */
export function cropTable(crops: readonly Crop[], s: CropState, lang: Lang): CropRow[] {
  return ranked(crops.filter((c) => !c.wild && !(s.seeds === "buy" && noShopSeed(c))), s, lang);
}

/** La semilla no se vende en ninguna tienda, ni de festival: con "Compradas" no compite en el ranking. */
export const noShopSeed = (crop: Crop): boolean => crop.seedPrice == null;

/**
 * Con semillas compradas, los cultivos sin semilla en tienda (Fruta milenaria, Café, Zanahoria…), aparte y con las
 * cuentas de semillas propias, en el mismo orden que la tabla. Con semillas propias, ninguno: compiten todos.
 */
export function noShopTable(crops: readonly Crop[], s: CropState, lang: Lang): CropRow[] {
  return s.seeds === "buy" ? ranked(crops.filter((c) => !c.wild && noShopSeed(c)), { ...s, seeds: "own" }, lang) : [];
}

/**
 * Las semillas silvestres (de primavera, verano, otoño e invierno): dan una recolección al azar de la estación, así que
 * no compiten en el ranking. Van aparte, con las cuentas del objeto de su fila y semillas propias (se fabrican).
 */
export function wildTable(crops: readonly Crop[], s: CropState, lang: Lang): CropRow[] {
  return ranked(crops.filter((c) => c.wild), { ...s, seeds: "own" }, lang);
}

function ranked(crops: readonly Crop[], s: CropState, lang: Lang): CropRow[] {
  const opts = toOpts(s);
  const rows = crops
    .map((crop): CropRow => ({ crop, p: profit(crop, opts), days: growDays(crop.phases, speedOf(opts, crop.paddy)), name: say(crop.name, lang) }))
    .filter((r) => !r.p.outOfSeason);
  const sign = s.sort.dir === "asc" ? 1 : -1;
  const byName = (a: CropRow, b: CropRow) => a.name.localeCompare(b.name, lang);
  const key = s.sort.key;
  const cmp =
    key === "name"
      ? (a: CropRow, b: CropRow) => sign * byName(a, b)
      : key === "sell"
        ? (a: CropRow, b: CropRow) => sign * sellRank(a).localeCompare(sellRank(b)) || byName(a, b)
        : (a: CropRow, b: CropRow) => sign * (VALUE[key](a) - VALUE[key](b)) || byName(a, b);
  return rows.sort((a, b) => Number(a.p.harvests === 0) - Number(b.p.harvests === 0) || cmp(a, b));
}

/** Los días que tarda un retoño en dar fruto (`FruitTree.DaysUntilMature` del juego: 28 siempre). */
export const TREE_DAYS = 28;

export interface TreeRow {
  tree: FruitTree;
  /** Una estación de un árbol adulto: 28 frutos, uno por día. */
  p: Profit;
  name: string;
  /** Estaciones de fruta para pagar el retoño; null si el retoño no se vende siempre. */
  payback: number | null;
}

/**
 * Lo que da un frutal adulto en una estación, con el mismo motor: un "cultivo" que madura el día de siembra y rebrota
 * cada día durante su estación, una unidad por vez y en calidad normal (la calidad del árbol sube con los años y el
 * fertilizante no lo toca). Valen las profesiones de venta y "lo mejor o crudo"; el retoño no entra en la cuenta.
 */
export function treeTable(trees: readonly FruitTree[], s: CropState, lang: Lang): TreeRow[] {
  return trees.map((tree) => {
    const season = tree.seasons[0] ?? 0;
    const crop: Crop = {
      seed: tree.sapling,
      harvest: tree.harvest,
      slug: tree.slug,
      slugEs: tree.slugEs,
      name: tree.name,
      seasons: [season],
      phases: [0],
      regrow: 1,
      stack: [1, 1],
      extraChance: 0,
      perLevel: 0,
      raised: false,
      paddy: false,
      price: tree.price,
      cat: tree.cat,
      seedPrice: null,
      seedShop: null,
      products: tree.products,
      maxQuality: 0,
    };
    const p = profit(crop, {
      ...toOpts(DEFAULT_STATE),
      season: season as Opts["season"],
      tiller: s.tiller,
      artisan: s.artisan,
      sell: s.sell,
      seeds: "own",
    });
    const payback = tree.saplingPrice != null && p.gross > 0 ? Math.ceil(tree.saplingPrice / p.gross) : null;
    return { tree, p, name: say(tree.name, lang), payback };
  });
}
