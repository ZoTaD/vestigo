/**
 * Los datos de Stardew Valley (2026-10-22) y cómo bajan: lo que escribe `games/stardew/tools/site_data.py`. Misma forma
 * que `terraria/data.ts`.
 *
 * - La lista liviana (`list.json`) y los nombres del idioma que se está leyendo (`names-en.json` o `names-es.json`).
 * - Las fichas, repartidas en `SD_SHARDS` archivos por el hash del slug inglés.
 * - Un mapa español → inglés repartido igual por el slug español, para abrir en frío una ficha en español sin bajar
 *   la lista entera.
 * - Los aldeanos (`villagers.json`) y el Centro Comunitario (`bundles.json`), que nombran las salas y los paquetes.
 *
 * Cada vez que llega algo que nombra objetos o aldeanos se anotan sus slugs en español en `route.ts`, que es lo que
 * escribe los enlaces. Nunca en el chunk del área: cada JSON es un `import()` aparte (regla 4 de CLAUDE.md).
 */
import { registerStardewSlugs, type Route } from "../route";
import type { Profession, Taste } from "../stardewCopy";
import { pzShardOf } from "../zomboid/shard";
import { once, shardedFichas } from "../zomboid/store";

/** `CHUNKS` de site_data.py: si se cambia uno se cambia el otro (lo prueba stardewData.test.ts). */
export const SD_SHARDS = 64;
const shard = (slug: string) => pzShardOf(slug, SD_SHARDS);

export type Lang = "en" | "es";
export type Pair = [en: string, es: string];

/** Bits de `has` en list.json (`GIFT`… `MONSTER` de site_data.py). */
export const HAS = { gift: 1, bundle: 2, machine: 4, recipe: 8, grows: 16, shop: 32, fish: 64, forage: 128, monster: 256 } as const;

/** Una fila de `list.json`: id, slug inglés, categoría, precio base, ancho y alto del sprite, banderas. */
type RawRow = [id: string, slug: string, cat: number, price: number, w: number, h: number, has: number];
/** Un objeto de la lista, ya con su nombre en el idioma pedido. */
export interface Row {
  id: string;
  slug: string;
  name: string;
  cat: number;
  price: number;
  w: number;
  h: number;
  has: number;
}

/** Otro objeto (o un aldeano) nombrado por una ficha: slug, slug en español, nombres y tamaño del sprite. */
export type Ref = [slug: string, slugEs: string, en: string, es: string, w: number, h: number];

/** Lo que sale de meter el objeto en una máquina. */
export interface MachineIn {
  machine: string;
  /** El producto; en los de sabor, el genérico (el Vino), y su nombre armado va en `outName`. */
  out: string;
  flavor?: string;
  outName?: Pair;
  price: number;
  /** Cantidad mínima producida; -1 es una. */
  stack: number;
  /** Minutos del juego y días (de a uno: listo a la mañana); 0 el que no aplica. */
  minutes: number;
  days: number;
  /** Cuántos entran por vez (0 la colmena, que no recibe nada: usa la flor de al lado). */
  count: number;
}

/** De dónde sale: cultivo, árbol frutal, tienda, pesca, recolección o botín de un monstruo. */
export type Source =
  | { k: "crop"; seed: string; days: number; seasons: number[]; regrow: number }
  | { k: "tree"; sapling: string; days: number; seasons: number[] }
  | { k: "shop"; shop: Pair; price: number }
  | { k: "fish" | "forage"; where: Pair[]; seasons: number[] }
  | { k: "monster"; who: Pair; rate: number };

/** Receta de la que sale: tipo, clave, cuántos salen e ingredientes (id, o categoría en negativo, y cantidad). */
export type MakeRecipe = [kind: "cook" | "craft", key: string, qty: number, ings: [id: string, n: number][]];
/** Receta que lo usa: tipo, clave y qué sale. */
export type UseRecipe = [kind: "cook" | "craft", key: string, out: string];

export interface Ficha {
  id: string;
  slug: string;
  slugEs: string;
  name: Pair;
  desc: Pair;
  cat: number;
  /** Precio de venta por calidad (normal, plata, oro, iridio) y, por profesión que lo sube, lo mismo. */
  prices: { base: number[]; pro: Partial<Record<Profession, number[]>> };
  /** Energía y salud que da al comerlo; null si no se come. */
  energy: [energy: number, health: number] | null;
  /** Claves de aldeano por gusto; `{}` si ninguno tiene un gusto especial. */
  tastes: Partial<Record<Exclude<Taste, "neutral">, string[]>>;
  /** Los paquetes que lo piden: sala, índice del paquete, cantidad y calidad (0 a 3). */
  bundles: [room: string, index: number, qty: number, quality: number][];
  recipes: { make: MakeRecipe[]; use: UseRecipe[] };
  /** En qué se transforma, y de qué máquina sale (máquina, minutos, días). */
  machines: { in: MachineIn[]; madeIn: [machine: string, minutes: number, days: number][] };
  sources: Source[];
  refs: Record<string, Ref>;
}

export interface Villager {
  key: string;
  slug: string;
  slugEs: string;
  name: Pair;
  birthday: [season: string, day: number];
  romance: boolean;
  region: string;
  tastes: Record<Exclude<Taste, "neutral">, string[]>;
}

export interface Bundle {
  index: number;
  name: Pair;
  /** id (−1 es oro), cantidad y calidad. */
  items: [id: string, qty: number, quality: number][];
  need: number;
  reward: [id: string, qty: number] | null;
}
export interface Room {
  /** La clave de la sala en el juego ("Pantry"). */
  room: string;
  name: Pair;
  bundles: Bundle[];
  refs: Record<string, Ref>;
}

const rows = once<RawRow[]>(() => import("@stardew/site/list.json"));
const namesEn = once<string[]>(() => import("@stardew/site/names-en.json"));
const namesEs = once<[name: string, slug: string][]>(() => import("@stardew/site/names-es.json"));
const villagers = once<Villager[]>(() => import("@stardew/villagers.json"));
const rooms = once<Room[]>(() => import("@stardew/bundles.json"));
const fichas = shardedFichas<Ficha>(import.meta.glob<{ default: Record<string, Ficha> }>("@stardew/site/items/*.json"), shard);
const esToEn = shardedFichas<string>(import.meta.glob<{ default: Record<string, string> }>("@stardew/site/es/*.json"), shard);

/**
 * El orden de la lista: por categoría, como se ordena un cofre (cultivos y recolección primero, las máquinas al final),
 * y dentro de cada una por nombre. Las categorías que no están acá van antes de las máquinas.
 */
const CAT_ORDER = [-75, -79, -80, -81, -4, -5, -6, -18, -26, -27, -7, -2, -12, -15, -16, -28, -74, -19, -21, -22, -8, -24, -20];
const catRank = (cat: number): number => {
  if (cat === -9) return CAT_ORDER.length + 1;
  const i = CAT_ORDER.indexOf(cat);
  return i < 0 ? CAT_ORDER.length : i;
};

const lists: Partial<Record<Lang, Row[]>> = {};

function buildList(lang: Lang): Row[] | null {
  if (lists[lang]) return lists[lang]!;
  const raw = rows.peek();
  const en = namesEn.peek();
  const es = namesEs.peek();
  if (!raw || (lang === "es" ? !es : !en)) return null;
  if (lang === "es") registerStardewSlugs({ items: Object.fromEntries(raw.flatMap((r, i) => (es![i][1] !== r[1] ? [[r[1], es![i][1]]] : []))) });
  const list = raw.map((r, i): Row => ({
    id: r[0],
    slug: r[1],
    name: lang === "es" ? es![i][0] : en![i],
    cat: r[2],
    price: r[3],
    w: r[4],
    h: r[5],
    has: r[6],
  }));
  list.sort((a, b) => catRank(a.cat) - catRank(b.cat) || a.name.localeCompare(b.name, lang));
  return (lists[lang] = list);
}

export const peekList = (lang: Lang): Row[] | null => buildList(lang);
export const loadList = (lang: Lang): Promise<Row[]> =>
  Promise.all([rows.load(), lang === "es" ? namesEs.load() : namesEn.load()]).then(() => buildList(lang)!);

/** Anota los slugs en español de una ficha y de todo lo que nombra: objetos, y los aldeanos de sus gustos. */
function note(f: Ficha | null): Ficha | null {
  if (f) {
    const people = new Set(Object.values(f.tastes).flat());
    const items: Record<string, string> = f.slugEs !== f.slug ? { [f.slug]: f.slugEs } : {};
    const villagersEs: Record<string, string> = {};
    for (const [key, r] of Object.entries(f.refs)) if (r[1] !== r[0]) (people.has(key) ? villagersEs : items)[r[0]] = r[1];
    registerStardewSlugs({ items, villagers: villagersEs });
  }
  return f;
}

export const peekItem = (slug: string): Ficha | null | undefined => fichas.peek(slug);
export const loadItem = (slug: string): Promise<Ficha | null> => fichas.load(slug).then(note);

export const peekVillagers = (): Villager[] | null => villagers.peek();
export const loadVillagers = (): Promise<Villager[]> => villagers.load();
export const peekBundles = (): Room[] | null => rooms.peek();
export const loadBundles = (): Promise<Room[]> => rooms.load();

export const say = (pair: readonly [string, string], lang: Lang): string => (lang === "es" && pair[1]) || pair[0];
/** El nombre de una referencia en el idioma pedido. */
export const refName = (r: Ref, lang: Lang): string => (lang === "es" && r[3]) || r[2];

/**
 * Lo que una dirección de Objetos necesita antes de dibujarse: la ficha (y los nombres de las salas si va en un
 * paquete), o la lista si no hay ficha (o no existe). En español y en frío el slug todavía no se conoce: se busca en su
 * pedacito del mapa y se anota, así la dirección leída de nuevo ya es la ficha.
 */
export async function preloadItemsRoute(route: Route): Promise<void> {
  if (route.detail) {
    let slug = route.detail;
    if (route.lang === "es") {
      const en = await esToEn.load(slug).catch(() => null);
      if (en) {
        registerStardewSlugs({ items: { [en]: slug } });
        slug = en;
      }
    }
    const f = await loadItem(slug);
    if (f) {
      if (f.bundles.length) await loadBundles();
      return;
    }
  }
  await loadList(route.lang);
}

// --- Filtros de la lista --------------------------------------------------------------------------------------------

/** Los grupos de categorías de los chips. Cultivos junta verduras, frutas y flores; Máquinas, los objetos grandes. */
export const GROUPS = {
  crops: [-75, -79, -80],
  fish: [-4],
  artisan: [-26, -27],
  minerals: [-2, -12],
  cooking: [-7],
  forage: [-81],
  machines: [-9],
} as const satisfies Record<string, readonly number[]>;
export type Group = keyof typeof GROUPS;
/** Los chips por fuente: qué bit de `has` piden. */
export const SOURCES = { grown: HAS.grows, fished: HAS.fish, bought: HAS.shop, bundle: HAS.bundle } as const;
export type SourceFilter = keyof typeof SOURCES;
export interface Filters {
  group: Group | null;
  source: SourceFilter | null;
}

/** Los filtros escritos en la dirección (`?cat=crops&from=fished`); lo que no se conoce se ignora. */
export function readFilters(search: string): Filters {
  const q = new URLSearchParams(search);
  const cat = q.get("cat");
  const from = q.get("from");
  return {
    group: cat && Object.hasOwn(GROUPS, cat) ? (cat as Group) : null,
    source: from && Object.hasOwn(SOURCES, from) ? (from as SourceFilter) : null,
  };
}
/** Lo contrario: el `?…` de unos filtros, vacío si no hay ninguno. */
export function writeFilters(f: Filters): string {
  const q = new URLSearchParams();
  if (f.group) q.set("cat", f.group);
  if (f.source) q.set("from", f.source);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Sin acentos ni mayúsculas, para buscar "melon" y encontrar "Melón". */
export const normalize = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function filterRows(list: readonly Row[], f: Filters, query: string): Row[] {
  const q = normalize(query);
  const cats: readonly number[] | null = f.group ? GROUPS[f.group] : null;
  const bit = f.source ? SOURCES[f.source] : 0;
  return list.filter((r) => (!cats || cats.includes(r.cat)) && (!bit || (r.has & bit) > 0) && (!q || normalize(r.name).includes(q)));
}

// --- Tiempos de las máquinas ----------------------------------------------------------------------------------------

/** Minutos del juego en un día, para las máquinas: de 6:00 a 6:00 (la noche cuenta entera). */
const DAY_MINUTES = 1440;

/**
 * Cuánto tarda una máquina, en la unidad que se lee mejor: minutos, horas o días (redondeado, con `approx` si no es
 * exacto: el barril tarda 10.000 minutos, unos 7 días). `days` es la otra forma de contar del juego: listo a la mañana
 * después de N noches. null si no tarda nada.
 */
export function machineTime(minutes: number, days: number): { unit: "m" | "h" | "d"; n: number; approx: boolean } | null {
  if (days > 0) return { unit: "d", n: days, approx: false };
  if (minutes <= 0) return null;
  if (minutes < 60) return { unit: "m", n: minutes, approx: false };
  if (minutes < DAY_MINUTES) return { unit: "h", n: Math.round(minutes / 60), approx: minutes % 60 !== 0 };
  return { unit: "d", n: Math.round(minutes / DAY_MINUTES), approx: minutes % DAY_MINUTES !== 0 };
}
