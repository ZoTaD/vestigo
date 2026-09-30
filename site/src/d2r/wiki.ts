/**
 * Los datos compartidos de la wiki de Diablo II (2026-09-29), tal como los
 * escribe `games/d2r/tools/wiki.py`: el motor de textos, las bases, los tipos y
 * las categorías. Cada pestaña importa además su propio archivo (runas,
 * palabras rúnicas, únicos, conjuntos), que viaja en su chunk.
 */
import engineJson from "@d2r/wiki/engine.json";
import basesJson from "@d2r/wiki/bases.json";
import typesJson from "@d2r/wiki/types.json";
import categoriesJson from "@d2r/wiki/categories.json";
import type { Engine, Lang, Loc, Prop } from "./stats";

export const E = engineJson as unknown as Engine;

export interface Base {
  code: string;
  kind: "weapon" | "armor" | "misc";
  name: Loc;
  type: string;
  type2: string | null;
  /** n normal, x excepcional, e élite. */
  tier: "n" | "x" | "e" | null;
  family: [string | null, string | null, string | null] | null;
  lvl: number;
  req: { lvl: number; str: number; dex: number };
  sockets: number;
  size: [number, number];
  spawnable: boolean;
  img: string | null;
  /** Dónde van las runas: 0 arma, 1 casco o armadura, 2 escudo. */
  gat: 0 | 1 | 2;
  chain?: string[];
  cat: string | null;
  def?: [number, number];
  block?: number;
  dmg?: { one?: [number, number]; two?: [number, number]; throw?: [number, number] };
  speed?: number;
  /** El tipo de animación del arma ("1HS", "STF"…): decide la tabla de breakpoints. */
  wclass?: string;
  hands?: 1 | 2 | 12;
  dur?: number;
}

export const BASES = basesJson as unknown as Base[];
export const BASE_BY_CODE = new Map(BASES.map((b) => [b.code, b]));
export const TYPES = typesJson as unknown as Record<string, { name: Loc; equiv: string[]; sockets: number[]; class: string | null }>;
export const CATEGORIES = categoriesJson as unknown as Record<string, { name: Loc; parent: string | null }>;

export interface Rune {
  id: string;
  code: string;
  name: Loc;
  lvl: number;
  img: string | null;
  mods: { weapon: Prop[]; helm: Prop[]; shield: Prop[] };
}

export interface Runeword {
  id: string;
  key: string;
  name: Loc;
  runes: string[];
  types: string[];
  exclude: string[];
  props: Prop[];
  lvl: number;
  ladder: number | null;
  ladderEnd: number | null;
  patch: string | null;
  rotw: boolean;
  slots: (0 | 1 | 2)[];
  bases: number;
}

export interface Unique {
  id: string;
  key: string;
  name: Loc;
  base: string;
  lvl: number;
  req: number;
  props: Prop[];
  img: string | null;
  ladder: number | null;
  /** El grupo de "sólo uno" del juego: no se pueden llevar dos del mismo (Annihilus, Antorcha, Fortuna de Gheed). */
  carry?: number;
}

export interface SetItem {
  id: string;
  key: string;
  name: Loc;
  base: string;
  lvl: number;
  req: number;
  addFunc: number;
  props: Prop[];
  bonus: { n: number; props: Prop[] }[];
  img: string | null;
}

export interface GameSet {
  id: string;
  key: string;
  name: Loc;
  items: SetItem[];
  partial: { n: number; props: Prop[] }[];
  full: Prop[];
}

export const tr = (l: Loc | undefined, lang: Lang): string => (l ? (lang === "es" ? l.es : l.en) : "");

/** Un texto del juego (`engine.str`), por su clave. */
export const gameStr = (key: string, lang: Lang): string => E.str[key]?.[lang] ?? "";

/** El ícono de inventario de un ítem, servido desde el sitio. */
export const itemImg = (asset: string | null | undefined): string | null => (asset ? `/d2r/items/${asset}.webp` : null);

/** El tipo de ítem y todos sus padres ("swor" → "blde" → "mele" → "weap"). */
export function typeChain(...codes: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const stack = codes.filter((c): c is string => !!c);
  while (stack.length) {
    const t = stack.pop()!;
    if (out.includes(t)) continue;
    out.push(t);
    stack.push(...(TYPES[t]?.equiv ?? []));
  }
  return out;
}

/** El nombre de la categoría de una base ("Espadas", "Yelmos"…). */
export const catName = (cat: string | null | undefined, lang: Lang): string => (cat ? tr(CATEGORIES[cat]?.name, lang) : "");

/** Los tres lugares donde se engarza una runa, en el orden de `gat` (0 arma, 1 casco o armadura, 2 escudo). */
export const RUNE_SLOT_NAMES = ["weapon", "helm", "shield"] as const;
