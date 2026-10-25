/**
 * El Museo de Stardew Valley (etapa 4, tarea 7): la forma de `museum.json` (`games/stardew/tools/museum_data.py`), la
 * vista que se elige en la pestaña y cómo viaja en la dirección (`?v=rewards`), y las cuentas del checklist: cuántas
 * piezas se donaron y qué premios ya se ganaron con lo tildado.
 *
 * Lo tildado se guarda en el navegador con la clave `sdv-museum-v1` (`checklist.ts`); cada clave es el id de una pieza
 * ("96"). El ancla de cada fila es el slug: el de su ficha de Objetos en las piezas (`museo#emerald`) y en los libros,
 * `reward-` y el de la clave del juego en los premios (`museo?v=rewards#reward-dwarf`).
 */
import type { Done } from "../checklist";

type Pair = [en: string, es: string];
/** Un objeto nombrado, igual que `Ref` de data.ts: slug, slug en español, nombres y tamaño del sprite. */
type Ref = [slug: string, slugEs: string, en: string, es: string, w: number, h: number];

/** De dónde sale una pieza. */
export type Where =
  /** Se excava en lugares de artefacto (o con la azada en las Minas): los lugares, ya con su nombre. */
  | { k: "dig"; places: Pair[] }
  /** Sale al romper estas geodas (ids, en `refs`). */
  | { k: "geode"; geodes: string[] }
  /** La suelta un monstruo: `slug`/`slugEs`, su ficha en Minas y combate. */
  | { k: "monster"; who: Pair; slug: string; slugEs: string }
  /** En el cofre del tesoro de pesca. */
  | { k: "fish" }
  /** Lo demás (vetas, piedras, la caja misteriosa), ya en palabras. */
  | { k: "other"; text: Pair };
export type WhereKind = Where["k"];

export interface Piece {
  id: string;
  slug: string;
  kind: "arch" | "mineral";
  where: Where[];
}

/** Lo que cuenta una etiqueta de un premio: artefactos, minerales o cualquier pieza. */
export type Tag = "arch" | "mineral" | "any";

export interface Reward {
  key: string;
  slug: string;
  /** Las piezas que pide (ids) y cuántas de cada tipo. Las pedidas por id también cuentan para el tipo. */
  need: { ids: string[]; tags: [tag: Tag, n: number][] };
  /** Lo que pide, en palabras. */
  text: Pair;
  /**
   * El premio: id, cuántos, si es la receta, el nombre (la receta lo lleva con "(Receta)") y, si no tiene ficha (un
   * mueble, un `(BC)` o la Llave oxidada), el tamaño de su dibujo.
   */
  reward: { id: string; n: number; recipe: boolean; name: Pair; sprite?: [w: number, h: number] };
}

export interface Book {
  id: string;
  /** La ficha de Objetos; null si no tiene. */
  slug: string | null;
  name: Pair;
  effect: Pair;
  /** El precio más bajo del Librero; null si no lo vende. */
  price: number | null;
  /** La condición de esa venta del Librero ("uno de sus libros al azar, desde el año 3"); null si no tiene. */
  priceNote: Pair | null;
  /** Dónde se consigue fuera del Librero (que va en `price`): una frase por tienda o fuente. */
  where: Pair[];
}

export interface MuseumData {
  pieces: Piece[];
  rewards: Reward[];
  books: Book[];
  /** Cuántos libros perdidos tiene la biblioteca, y el objeto que los representa. */
  lostBooks: number;
  lostBook: string;
  refs: Record<string, Ref>;
}

/** La clave del checklist en el navegador. */
export const MUSEUM_KEY = "sdv-museum-v1";

// --- La vista y la dirección ------------------------------------------------------------------------------------

export const MUSEUM_VIEWS = ["collection", "rewards", "books"] as const;
export type MuseumView = (typeof MUSEUM_VIEWS)[number];
export const DEFAULT_MUSEUM_VIEW: MuseumView = "collection";

/** La vista escrita en la dirección (`?v=rewards`); lo que no se conoce, la Colección. */
export function readMuseumView(search: string): MuseumView {
  const v = new URLSearchParams(search).get("v");
  return (MUSEUM_VIEWS as readonly string[]).includes(v ?? "") ? (v as MuseumView) : DEFAULT_MUSEUM_VIEW;
}
/** Lo contrario: `?v=…`, vacío en la vista por defecto. */
export const writeMuseumView = (v: MuseumView): string => (v === DEFAULT_MUSEUM_VIEW ? "" : `?v=${v}`);

/** La vista donde está un ancla, para un enlace que llega sin `?v=`; null si el ancla no es de ninguna fila. */
export function viewOfAnchor(data: MuseumData, anchor: string): MuseumView | null {
  if (!anchor) return null;
  if (data.pieces.some((p) => p.slug === anchor)) return "collection";
  if (data.rewards.some((r) => rewardAnchor(r) === anchor)) return "rewards";
  if (anchor === "lost-books" || data.books.some((b) => b.slug === anchor || b.id === anchor)) return "books";
  return null;
}

/**
 * El ancla de la fila de un premio: `reward-` y su slug (`reward-dwarf`). El prefijo hace falta: el slug de un premio
 * puede ser el de una pieza ("ancient-seed" es el premio y la semilla milenaria). `site_data.py` arma igual los enlaces
 * de las fichas de Objetos.
 */
export const rewardAnchor = (r: Pick<Reward, "slug">): string => `reward-${r.slug}`;

/** El ancla de la fila de un libro: su slug, o el id si no tiene ficha. */
export const bookAnchor = (b: Book): string => b.slug ?? b.id;

// --- El checklist -----------------------------------------------------------------------------------------------

export interface RewardState {
  key: string;
  ok: boolean;
  /** Cuántas piezas faltan todavía (las pedidas por id más lo que falte de cada tipo). */
  missing: number;
}

/**
 * Cuántas piezas donó (sólo las claves que son piezas: lo guardado puede traer otras) y, por premio, si ya lo ganó y
 * cuántas le faltan. Como `LibraryMuseum.getRewardsForPlayer`: cada etiqueta cuenta todo lo donado de su tipo, también
 * las piezas que el premio pide por id (la estatua de gallina es uno de los 5 artefactos de su premio).
 */
export function progress(data: MuseumData, done: Done): { pieces: number; total: number; rewards: RewardState[] } {
  const have = { arch: 0, mineral: 0, any: 0 };
  for (const p of data.pieces) {
    if (!done[p.id]) continue;
    have[p.kind]++;
    have.any++;
  }
  const rewards = data.rewards.map((r) => {
    const missing = r.need.ids.filter((i) => !done[i]).length + r.need.tags.reduce((n, [tag, need]) => n + Math.max(0, need - have[tag]), 0);
    return { key: r.key, ok: missing === 0, missing };
  });
  return { pieces: have.any, total: data.pieces.length, rewards };
}

export const MUSEUM_FILTERS = ["all", "arch", "mineral", "missing"] as const;
export type MuseumFilter = (typeof MUSEUM_FILTERS)[number];

/** Las piezas que muestra el filtro: todas, los artefactos, los minerales o lo que falta donar. */
export function shownPieces(data: MuseumData, filter: MuseumFilter, done: Done): Piece[] {
  if (filter === "all") return data.pieces;
  if (filter === "missing") return data.pieces.filter((p) => !done[p.id]);
  return data.pieces.filter((p) => p.kind === filter);
}

/** De dónde sale una pieza en pocas palabras: los tipos, sin repetir, en el orden del dato. */
export function pieceKinds(p: Piece): WhereKind[] {
  return [...new Set(p.where.map((w) => w.k))];
}

/**
 * Lo que se usa de la partida guardada del Lector: lo donado y si la partida se guardó antes de que el Lector leyera el
 * museo (`store.ts` completó `museum` con una lista vacía: no dice que no haya donaciones).
 */
export type SavedMuseum = { ids: string[]; stale: boolean };

/** ¿Se puede traer lo donado? `none` sin partida, `stale` si hay que volver a abrirla en el Lector, `ok` si no. */
export function museumSync(saved: SavedMuseum | null): "none" | "stale" | "ok" {
  if (!saved) return "none";
  return saved.stale ? "stale" : "ok";
}

/** Lo donado en una partida (`Save.museum`), como casilleros del checklist: sólo los ids que son piezas. */
export function doneFromSave(ids: readonly string[], data: MuseumData): Done {
  const pieces = new Set(data.pieces.map((p) => p.id));
  const out: Done = {};
  for (const raw of ids) {
    const id = raw.startsWith("(O)") ? raw.slice(3) : raw;
    if (pieces.has(id)) out[id] = true;
  }
  return out;
}
