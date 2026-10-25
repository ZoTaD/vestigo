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
import type { CropsData } from "./crops/calc";
import { withPrices, type FishData } from "./fishing/state";
import type { CalendarData } from "./calendar/state";
import type { RecipesData } from "./recipes/state";
import type { MinesData, Monster } from "./mines/state";
import type { FarmData } from "./farm/state";
import type { MuseumData } from "./museum/state";
import type { SaveData } from "./save/progress";
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

/** En qué pestaña está un pedido o una misión: los del pueblo y la historia en Misiones; los de Qi en la Isla. */
export type OrderTab = "quests" | "island";

/**
 * De dónde sale: cultivo, árbol frutal, tienda, pesca, recolección, botín de un monstruo, un animal de la granja, un
 * premio del museo o el premio de un pedido.
 */
export type Source =
  | { k: "crop"; seed: string; days: number; seasons: number[]; regrow: number }
  | { k: "tree"; sapling: string; days: number; seasons: number[] }
  /** `cur`: el id de la moneda cuando no es oro (gemas de Qi `858`, nueces doradas `73`); va en `refs`. */
  | { k: "shop"; shop: Pair; price: number; cur?: string }
  | { k: "fish" | "forage"; where: Pair[]; seasons: number[] }
  /**
   * `rate`: la probabilidad de que caiga al menos uno; `n`: cuántas tiradas hay (hasta cuántos caen), si es más de una.
   * `slug`/`slugEs`: la ficha del monstruo en Minas y combate, si la tiene.
   */
  | { k: "monster"; who: Pair; rate: number; n?: number; slug?: string; slugEs?: string }
  /** Lo produce un animal: `key` es el ancla de su fila en Granja; `deluxe`, el producto de mucha amistad. */
  | { k: "animal"; who: Pair; key: string; deluxe?: true }
  /** Premio del museo: `reward` es el ancla de su fila en la vista de premios; `text`, lo que hay que donar. */
  | { k: "museum"; reward: string; text: Pair; n?: number }
  /** Premio de un pedido o una misión: `key` es el ancla de su fila; `n`, cuántos da si es más de uno. */
  | { k: "order"; key: string; name: Pair; tab: OrderTab; n?: number };

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
  /**
   * Para qué sirve fuera de las recetas: si se dona al museo, qué edificios lo piden de material (ancla de la fila en
   * Granja, nombre y cantidad), qué pedidos y misiones lo piden, y qué premio del museo da donarlo (ancla del premio,
   * id, cantidad y nombre; el premio puede ser un mueble o un sombrero sin ficha, y entonces no está en `refs`).
   * No viene cuando no hay nada de eso (3 de cada 4 fichas).
   */
  uses?: {
    donate: boolean;
    builds: [key: string, name: Pair, n: number][];
    orders: [key: string, name: Pair, tab: OrderTab][];
    /** `size`: el tamaño del dibujo de un premio sin ficha (un mueble), para mostrarlo a escala entera. */
    prizes: [reward: string, id: string, n: number, name: Pair, size?: [w: number, h: number]][];
  };
  refs: Record<string, Ref>;
}

export interface Villager {
  key: string;
  slug: string;
  slugEs: string;
  name: Pair;
  /** Estación (0 primavera a 3 invierno) y día. */
  birthday: [season: number, day: number];
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
  /** Las estaciones (0 a 3) de los objetos que se consiguen por temporada; los que no están valen todo el año o no se sabe. */
  seasons: Record<string, number[]>;
}

const rows = once<RawRow[]>(() => import("@stardew/site/list.json"));
const namesEn = once<string[]>(() => import("@stardew/site/names-en.json"));
const namesEs = once<[name: string, slug: string][]>(() => import("@stardew/site/names-es.json"));
const villagers = once<Villager[]>(() => import("@stardew/villagers.json"));

/** Anota los slugs en español de los aldeanos (sólo los que cambian: Rasmodius, Enano): sus fichas y los enlaces de afuera. */
function noteVillagers(list: Villager[]): Villager[] {
  registerStardewSlugs({ villagers: Object.fromEntries(list.filter((v) => v.slugEs !== v.slug).map((v) => [v.slug, v.slugEs])) });
  return list;
}
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
    // Los monstruos que lo sueltan enlazan a su ficha de Minas y combate.
    const mines: Record<string, string> = {};
    for (const s of f.sources) if (s.k === "monster" && s.slug && s.slugEs && s.slugEs !== s.slug) mines[s.slug] = s.slugEs;
    registerStardewSlugs({ items, villagers: villagersEs, mines });
  }
  return f;
}

export const peekItem = (slug: string): Ficha | null | undefined => fichas.peek(slug);
export const loadItem = (slug: string): Promise<Ficha | null> => fichas.load(slug).then(note);

export const peekVillagers = (): Villager[] | null => {
  const list = villagers.peek();
  return list && noteVillagers(list);
};
export const loadVillagers = (): Promise<Villager[]> => villagers.load().then(noteVillagers);
export const peekBundles = (): Room[] | null => rooms.peek();
export const loadBundles = (): Promise<Room[]> => rooms.load();

/** Los cultivos y frutales de la calculadora (`crops.json`, un solo archivo chico). */
const crops = once<CropsData>(() => import("@stardew/crops.json"));
/** Anota los slugs en español de lo que se cosecha: cada fila enlaza a la ficha del objeto. */
function noteCrops(d: CropsData): CropsData {
  const all = [...d.crops, ...d.fruitTrees];
  registerStardewSlugs({ items: Object.fromEntries(all.filter((c) => c.slugEs !== c.slug).map((c) => [c.slug, c.slugEs])) });
  return d;
}
export const peekCrops = (): CropsData | null => {
  const d = crops.peek();
  return d && noteCrops(d);
};
export const loadCrops = (): Promise<CropsData> => crops.load().then(noteCrops);

/**
 * Los peces de la pestaña Pesca (`fish.json`), con el precio de cada uno sacado de la lista de objetos (`list.json`, la
 * misma que usa Objetos: si ya bajó, no se pide de nuevo). Anota los slugs en español: cada pez enlaza a su ficha.
 */
const fishRaw = once<Omit<FishData, "prices">>(() => import("@stardew/fish.json"));
let fishData: FishData | null = null;
function buildFish(): FishData | null {
  if (fishData) return fishData;
  const raw = fishRaw.peek();
  const list = rows.peek();
  if (!raw || !list) return null;
  registerStardewSlugs({ items: Object.fromEntries(raw.fish.filter((f) => f.slugEs !== f.slug).map((f) => [f.slug, f.slugEs])) });
  return (fishData = withPrices(raw, list));
}
export const peekFish = (): FishData | null => buildFish();
export const loadFish = (): Promise<FishData> => Promise.all([fishRaw.load(), rows.load()]).then(() => buildFish()!);

/**
 * Las recetas y las máquinas de la pestaña Recetas (`recipes.json`, un solo archivo). Anota los slugs en español de todo
 * lo que nombra: cada plato, ingrediente, producto y máquina enlaza a su ficha de Objetos.
 */
const recipesRaw = once<RecipesData>(() => import("@stardew/recipes.json"));
let recipesNoted = false;
function noteRecipes(d: RecipesData): RecipesData {
  if (!recipesNoted) {
    const items = Object.values(d.refs.items).filter((r) => r[1] !== r[0]);
    registerStardewSlugs({ items: Object.fromEntries([...items.map((r) => [r[0], r[1]]), ...d.machines.filter((m) => m.slugEs !== m.slug).map((m) => [m.slug, m.slugEs])]) });
    recipesNoted = true;
  }
  return d;
}
export const peekRecipes = (): RecipesData | null => {
  const d = recipesRaw.peek();
  return d && noteRecipes(d);
};
export const loadRecipes = (): Promise<RecipesData> => recipesRaw.load().then(noteRecipes);

/**
 * El Calendario: los días de cada estación (`calendar.json`, chico), los aldeanos (nombre, ficha y lo que les encanta) y
 * la lista de objetos del idioma, de donde salen el nombre y el sprite de cada regalo. Aldeanos y lista son los mismos
 * archivos de Aldeanos y Objetos: si ya bajaron, no se piden de nuevo.
 */
const calendar = once<CalendarData>(() => import("@stardew/calendar.json"));
export interface CalendarBundle {
  cal: CalendarData;
  villagers: Villager[];
  rows: Row[];
}
/** Uno por idioma, el mismo objeto en cada dibujo. */
const calendars: Partial<Record<Lang, CalendarBundle>> = {};
export function peekCalendar(lang: Lang): CalendarBundle | null {
  if (calendars[lang]) return calendars[lang]!;
  const cal = calendar.peek();
  const people = peekVillagers();
  const list = peekList(lang);
  return cal && people && list ? (calendars[lang] = { cal, villagers: people, rows: list }) : null;
}
export const loadCalendar = (lang: Lang): Promise<CalendarBundle> =>
  Promise.all([calendar.load(), loadVillagers(), loadList(lang)]).then(() => peekCalendar(lang)!);

/**
 * Minas y combate (`mines.json`, un solo archivo): armas, botas, anillos, baratijas, monstruos, pisos y cofres. Anota los
 * slugs en español de los monstruos (sus fichas) y de los objetos que nombra (botín, minerales, anillos y premios), que
 * enlazan a Objetos.
 */
const minesRaw = once<MinesData>(() => import("@stardew/mines.json"));
let minesNoted = false;
function noteMines(d: MinesData): MinesData {
  if (!minesNoted) {
    const items = [...Object.values(d.refs).map((r) => [r[0], r[1]]), ...d.rings.map((r) => [r.slug, r.slugEs])].filter(([en, es]) => en !== es);
    registerStardewSlugs({
      items: Object.fromEntries(items),
      mines: Object.fromEntries(d.monsters.filter((m) => m.slugEs !== m.slug).map((m) => [m.slug, m.slugEs])),
    });
    minesNoted = true;
  }
  return d;
}
export const peekMines = (): MinesData | null => {
  const d = minesRaw.peek();
  return d && noteMines(d);
};
export const loadMines = (): Promise<MinesData> => minesRaw.load().then(noteMines);

/**
 * La Granja (`farm.json`, un solo archivo chico): animales, edificios, la casa y los cuidados. Anota los slugs en
 * español de los objetos que nombra (productos, materiales, máquinas), que enlazan a Objetos.
 */
const farmRaw = once<FarmData>(() => import("@stardew/farm.json"));
let farmNoted = false;
function noteFarm(d: FarmData): FarmData {
  if (!farmNoted) {
    registerStardewSlugs({ items: Object.fromEntries(Object.values(d.refs).filter((r) => r[1] !== r[0]).map((r) => [r[0], r[1]])) });
    farmNoted = true;
  }
  return d;
}
export const peekFarm = (): FarmData | null => {
  const d = farmRaw.peek();
  return d && noteFarm(d);
};
export const loadFarm = (): Promise<FarmData> => farmRaw.load().then(noteFarm);

/**
 * El Museo (`museum.json`, un solo archivo chico): las 95 piezas con dónde salen, los premios y los libros. Anota los
 * slugs en español de los objetos que nombra (piezas, geodas, premios, libros), que enlazan a Objetos, y los de los
 * monstruos que las sueltan, que enlazan a Minas y combate.
 */
const museumRaw = once<MuseumData>(() => import("@stardew/museum.json"));
let museumNoted = false;
function noteMuseum(d: MuseumData): MuseumData {
  if (!museumNoted) {
    const mines: Record<string, string> = {};
    for (const p of d.pieces) for (const w of p.where) if (w.k === "monster" && w.slugEs !== w.slug) mines[w.slug] = w.slugEs;
    registerStardewSlugs({ items: Object.fromEntries(Object.values(d.refs).filter((r) => r[1] !== r[0]).map((r) => [r[0], r[1]])), mines });
    museumNoted = true;
  }
  return d;
}
export const peekMuseum = (): MuseumData | null => {
  const d = museumRaw.peek();
  return d && noteMuseum(d);
};
export const loadMuseum = (): Promise<MuseumData> => museumRaw.load().then(noteMuseum);

export const say = (pair: readonly [string, string], lang: Lang): string => (lang === "es" && pair[1]) || pair[0];
/** El nombre de una referencia en el idioma pedido. */
export const refName = (r: Ref, lang: Lang): string => (lang === "es" && r[3]) || r[2];

/** El aldeano de una dirección: por su slug inglés o por el español (en frío todavía no se anotó cuál es cuál). */
export const findVillager = (list: readonly Villager[], slug: string): Villager | undefined => list.find((v) => v.slug === slug || v.slugEs === slug);
/** El monstruo de una dirección de Minas y combate, igual: por su slug inglés o por el español. */
export const findMonster = (data: MinesData, slug: string): Monster | undefined => data.monsters.find((m) => m.slug === slug || m.slugEs === slug);

/**
 * Lo que una dirección de Aldeanos necesita antes de dibujarse: los aldeanos (que anotan los slugs en español) y, si es
 * una ficha, la lista de objetos del idioma, de donde salen los nombres y sprites de sus gustos.
 */
export async function preloadVillagersRoute(route: Route): Promise<void> {
  const list = await loadVillagers();
  if (route.detail && findVillager(list, route.detail)) await loadList(route.lang);
}

/**
 * Lo que le encanta y se consigue sin suerte: lo que se cultiva o se compra (bits `grows` y `shop` de `has`), en el
 * orden de la lista. Es lo que se regala sin salir a buscarlo.
 */
export function giftIdeas(v: Villager, rows: readonly Row[]): Row[] {
  const loved = new Set(v.tastes.love);
  return rows.filter((r) => loved.has(r.id) && (r.has & (HAS.grows | HAS.shop)) > 0);
}

/**
 * Lo que le gusta a un aldeano por gusto, ya con los objetos de la lista (se pierden los ids que la lista no tiene), en
 * el orden de la lista: por categoría y nombre, no por id.
 */
export function tasteRows(v: Villager, taste: Exclude<Taste, "neutral">, rows: readonly Row[]): Row[] {
  const ids = new Set(v.tastes[taste]);
  return rows.filter((r) => ids.has(r.id));
}

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

// --- Filtros de la lista de aldeanos --------------------------------------------------------------------------------

export interface VillagerFilters {
  /** Sólo los que se pueden cortejar. */
  romance: boolean;
  /** Estación del cumpleaños (0 a 3). */
  season: number | null;
}

/** Los filtros escritos en la dirección (`?romance=1&season=2`); lo que no se conoce se ignora. */
export function readVillagerFilters(search: string): VillagerFilters {
  const q = new URLSearchParams(search);
  const season = q.get("season");
  return { romance: q.get("romance") === "1", season: season && /^[0-3]$/.test(season) ? Number(season) : null };
}
export function writeVillagerFilters(f: VillagerFilters): string {
  const q = new URLSearchParams();
  if (f.romance) q.set("romance", "1");
  if (f.season !== null) q.set("season", String(f.season));
  const s = q.toString();
  return s ? `?${s}` : "";
}
export const filterVillagers = (list: readonly Villager[], f: VillagerFilters): Villager[] =>
  list.filter((v) => (!f.romance || v.romance) && (f.season === null || v.birthday[0] === f.season));

// --- Lector de partida ----------------------------------------------------------------------------------------------

/** `save.json` (`save_data.py`): lo de la perfección, más el nombre de los obeliscos y del reloj de oro. */
export type SaveJson = SaveData & { buildingNames: Record<string, Pair> };
const saveRaw = once<SaveJson>(() => import("@stardew/save.json"));

/**
 * Todo lo que el Lector de partida cruza con la partida: la perfección (`save.json`), los aldeanos, el calendario, los
 * cultivos, los peces, las recetas, el Centro Comunitario y la lista de objetos del idioma (nombre, sprite y ficha de
 * cada id). Son los mismos archivos de las otras pestañas: los que ya bajaron no se piden de nuevo. Se pide recién al
 * leer una partida; la pestaña sin partida no baja nada.
 */
export interface SaveBundle {
  save: SaveJson;
  villagers: Villager[];
  calendar: CalendarData;
  crops: CropsData;
  fish: FishData;
  recipes: RecipesData;
  rooms: Room[];
  rows: Row[];
}
const saveBundles: Partial<Record<Lang, SaveBundle>> = {};
export function peekSaveBundle(lang: Lang): SaveBundle | null {
  if (saveBundles[lang]) return saveBundles[lang]!;
  const save = saveRaw.peek();
  const cal = calendar.peek();
  const people = peekVillagers();
  const cropsData = peekCrops();
  const fishData = peekFish();
  const recipes = peekRecipes();
  const roomList = rooms.peek();
  const list = peekList(lang);
  if (!save || !cal || !people || !cropsData || !fishData || !recipes || !roomList || !list) return null;
  return (saveBundles[lang] = { save, villagers: people, calendar: cal, crops: cropsData, fish: fishData, recipes, rooms: roomList, rows: list });
}
export const loadSaveBundle = (lang: Lang): Promise<SaveBundle> =>
  Promise.all([saveRaw.load(), calendar.load(), loadVillagers(), loadCrops(), loadFish(), loadRecipes(), loadBundles(), loadList(lang)]).then(
    () => peekSaveBundle(lang)!,
  );
