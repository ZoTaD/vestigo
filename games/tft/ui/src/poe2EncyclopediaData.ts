/**
 * Datos de la Enciclopedia de PoE2 (2026-09-23).
 *
 * `games/poe2/data/encyclopedia/` lo escribe `games/poe2/pipeline/encyclopedia.py`
 * con lo que publica RePoE y los textos oficiales en español que trae el juego
 * instalado (ver docs/design/2026-09-23-poe2-enciclopedia-y-parches.md).
 *
 * Nada entra al bundle principal: el índice (lo buscable, ~600 KB) y cada
 * categoría se piden al abrir la pestaña, y quedan en memoria para la visita.
 */
import type { Lang } from "./i18n";

export type Cat = "gems" | "uniques" | "bases" | "currency";
export const CATS: Cat[] = ["gems", "uniques", "bases", "currency"];
export const isCat = (v: string | undefined): v is Cat => !!v && (CATS as string[]).includes(v);

export interface Txt { en: string; es: string }

/** Lo buscable de todo el juego, liviano: sirve al buscador y al diario de parches. */
export interface IndexEntry {
  /** `<cat>/<slug>`, el mismo detalle que va en la URL. */
  id: string;
  cat: Cat;
  en: string;
  es: string;
  icon: string | null;
  /** Clase del objeto o tipo de gema, en inglés (se traduce del lado de cada categoría). */
  sub: string;
}

/** Una línea que cambia con el nivel: la plantilla con {0}, {1}… y los números de cada nivel. */
export interface LevelText {
  /** null cuando la línea cambia de forma entre niveles: entonces `v` trae el texto entero de cada nivel. */
  t: string | null;
  v: (string[] | string | null)[] | null;
}
export interface LevelLine { en: LevelText; es: LevelText }
/** Una variante de la habilidad ("Fire-Infused" en Cometa); la primera no lleva etiqueta. */
export interface StatSet { label: Txt | null; static: Txt[]; levels: LevelLine[] }

export interface Gem {
  slug: string;
  en: string;
  es: string;
  icon: string | null;
  kind: "active" | "support" | "spirit";
  color: "str" | "dex" | "int" | "none";
  tags: Txt[];
  desc: Txt;
  sets: StatSet[];
  nlev: number;
  /** Tiempo de lanzamiento en milisegundos, si la habilidad lo tiene. */
  cast: number | null;
  lineage: boolean;
  types: string[];
  supports: string[];
}

export interface Base {
  slug: string;
  en: string;
  es: string;
  icon: string | null;
  group: "weapon" | "armour" | "jewellery" | "flask";
  cls: Txt;
  w: number;
  h: number;
  drop: number;
  req: { level?: number; strength?: number; dexterity?: number; intelligence?: number };
  props: Record<string, number | [number, number]>;
  implicits: Txt[];
}

export interface Unique {
  slug: string;
  en: string;
  es: string;
  icon: string | null;
  cls: Txt;
  w: number;
  h: number;
  base: Txt | null;
  baseSlug: string | null;
  lvl: number;
  imps: Txt[];
  mods: Txt[];
  flavour: Txt | null;
  /** Precio en divinos en la liga donde más se vende, para enlazar a la Economía. */
  price: { league: string; v: number; id: string } | null;
}

export interface Currency {
  slug: string;
  en: string;
  es: string;
  icon: string | null;
  cls: Txt;
  desc: Txt | null;
  dirs: Txt | null;
  stack: number | null;
  lvl: number | null;
  /** Runas, núcleos de alma e ídolos: qué dan según dónde se engarzan. */
  effects: { on: Txt; lines: Txt[] }[];
}

export interface CatData { gems: Gem[]; uniques: Unique[]; bases: Base[]; currency: Currency[] }
export type Entry = Gem | Unique | Base | Currency;

const archivos = import.meta.glob<{ default: unknown }>("@poe2/encyclopedia/*.json");
const pedidos = new Map<string, Promise<unknown>>();
/**
 * Lo ya cargado, para leerlo sin esperar. El prerender del build
 * (`entry-server.tsx`) precarga lo que usa cada página y los componentes
 * arrancan con esto: `renderToString` no espera promesas ni corre efectos, y
 * sin esta caché Google recibía "Abriendo la enciclopedia…".
 */
const listos = new Map<string, unknown>();
function load<T>(name: string): Promise<T> {
  let p = pedidos.get(name);
  if (!p) {
    const key = Object.keys(archivos).find((k) => k.endsWith(`/${name}.json`));
    if (!key) return Promise.reject(new Error(`sin datos: ${name}`));
    p = archivos[key]().then((m) => {
      listos.set(name, m.default);
      return m.default;
    });
    pedidos.set(name, p);
  }
  return p as Promise<T>;
}

export const loadIndex = () => load<IndexEntry[]>("index");
export function loadCat<C extends Cat>(cat: C): Promise<CatData[C]> {
  return load<CatData[C]>(cat);
}
export const peekIndex = (): IndexEntry[] | null => (listos.get("index") as IndexEntry[] | undefined) ?? null;
export function peekCat<C extends Cat>(cat: C): CatData[C] | null {
  return (listos.get(cat) as CatData[C] | undefined) ?? null;
}

/** Una ficha por su id `<cat>/<slug>`, o null. */
export async function loadEntry(id: string): Promise<{ cat: Cat; entry: Entry } | null> {
  const [cat, slug] = id.split("/");
  if (!isCat(cat)) return null;
  const rows = (await loadCat(cat)) as Entry[];
  const entry = rows.find((r) => r.slug === slug);
  return entry ? { cat, entry } : null;
}

export const tx = (t: Txt | null | undefined, lang: Lang): string => (t ? (lang === "es" ? t.es || t.en : t.en) : "");
export const nameOf = (r: { en: string; es: string }, lang: Lang): string => (lang === "es" ? r.es || r.en : r.en);

/** El texto de una línea por nivel en el nivel pedido (1-indexado). */
export function levelText(l: LevelText, level: number): string | null {
  if (!l.v) return l.t;
  const v = l.v[Math.min(level, l.v.length) - 1];
  if (v == null) return null;
  if (l.t == null) return typeof v === "string" ? v : null;
  const nums = Array.isArray(v) ? v : [];
  return l.t.replace(/\{(\d+)\}/g, (_m, i) => nums[Number(i)] ?? "?");
}

/** Para buscar sin tildes ni mayúsculas: "Núcleo" encuentra "nucleo". */
export const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Nombre de la clase de objeto del índice, legible (el índice guarda el id interno en inglés). */
export function subLabel(sub: string): string {
  return sub.replace(/([a-z])([A-Z])/g, "$1 $2");
}
