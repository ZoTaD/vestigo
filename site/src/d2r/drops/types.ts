/**
 * Los tipos de la calculadora de drops (2026-09-29): lo que escribe
 * `games/d2r/tools/drops.py` y lo que usan el motor, los lugares y el
 * simulador. Diseño: docs/design/2026-09-29-d2r-calculadora-drops.md.
 */
import type { Loc } from "../stats";

export type Diff = 0 | 1 | 2;
/** Único, conjunto, raro, mágico: los modificadores de calidad de un TC o de una entrada. */
export type Q4 = [number, number, number, number];
/** Una calidad en itemratio: rareza, divisor y mínimo. */
export type Ratio3 = [number, number, number];

export interface TcCond {
  diff?: Diff;
  desec?: boolean;
  herald?: boolean;
  tier?: [number, number];
}
/** Una entrada: otra TC, un código de base, "gld", o un único o pieza por nombre; su peso; sus modificadores. */
export type TcEntry = [target: string, prob: number, mods?: Q4];
export interface Tc {
  /** Tiradas: positivas al azar (con NoDrop), negativas en orden (sin NoDrop). */
  p: number;
  e: TcEntry[];
  g?: number;
  l?: number;
  q?: Q4;
  nd?: number;
  c?: TcCond;
  lad?: [number, number];
}
export interface BaseItem {
  /** Nivel de calidad (qlvl). */
  q: number;
  t: string;
  /** Excepcional o élite: usa la fila "Uber" de itemratio. */
  u: 0 | 1;
  /** De una clase: usa la fila de clase de itemratio. */
  cl: 0 | 1;
  /** 0 cualquier calidad · 1 siempre normal (runas, gemas, oro) · 2 mínimo mágico (anillos, amuletos, joyas) · 3 mínimo mágico y nunca raro (talismanes). */
  qf: 0 | 1 | 2 | 3;
  k: "w" | "a" | "m";
  n: Loc;
  img: string | null;
}
export interface DropUnique {
  id: string;
  key: string;
  code: string;
  lvl: number;
  rar: number;
  lad?: [number, number];
  c?: TcCond;
  /** Sólo sale por nombre desde un TC (no entra al sorteo de su base). */
  f?: 1;
  n: Loc;
  img: string | null;
}
export interface DropSetItem {
  id: string;
  /** El conjunto (su ficha de la wiki). */
  set: string;
  key: string;
  code: string;
  lvl: number;
  rar: number;
  lad?: [number, number];
  n: Loc;
  img: string | null;
}
export interface RatioRow {
  u: 0 | 1;
  cl: 0 | 1;
  U: Ratio3;
  S: Ratio3;
  R: Ratio3;
  M: Ratio3;
}
export interface DropMonster {
  n: Loc;
  lv: [number, number, number];
  boss?: 1;
  /** Peso de aparición en un área. */
  rar: number;
  /** Por dificultad: común, campeón, único, misión, y los aterrorizados (común, campeón, único) y el Heraldo. */
  tc: [string[], string[], string[]];
}
export interface DropArea {
  id: number;
  n: Loc;
  act: number;
  lv: [number, number, number];
  /** Normal: comunes y campeones. */
  mon: string[];
  /** Pesadilla e Infierno: todos. */
  nmon: string[];
  /** Normal: los que pueden ser únicos. */
  umon: string[];
  tz?: 1;
  /**
   * Sólo existe en Infierno (las áreas del evento de Pandemonio): las tablas le dan monstruos y niveles en las tres
   * dificultades, pero en Normal y Pesadilla no se llega nunca.
   */
  hell?: 1;
}
export interface DropSource {
  id: string;
  kind: "boss" | "super";
  n: Loc;
  mon: string;
  area: number | null;
  /** Los superúnicos traen su TC por dificultad (y el aterrorizado); los jefes usan el de su monstruo, salvo el Clon de Diablo, que trae uno vacío fuera de Infierno. */
  tc?: [string, string, string];
  tcd?: [string, string, string];
}
export interface TzRules {
  /** [mínimo, máximo] del nivel aterrorizado por dificultad. */
  b: [[number, number], [number, number], [number, number]];
  boost: number;
  /** Cuánto sube el nivel de TC el Heraldo de cada nivel (índice = nivel − 1). */
  heraldTc: number[];
  maxTier: number;
}
export interface DropData {
  tcs: Record<string, Tc>;
  bases: Record<string, BaseItem>;
  uniques: DropUnique[];
  sets: DropSetItem[];
  ratio: RatioRow[];
  monsters: Record<string, DropMonster>;
  areas: DropArea[];
  sources: DropSource[];
  tz: TzRules;
}

/** Lo que cambia la cuenta: hallazgo mágico, jugadores, grupo, Clasificación y temporada. */
export interface Settings {
  mf: number;
  players: number;
  party: number;
  ladder: boolean;
  season: number;
}
/** Cómo muere el monstruo: su TC (ya mejorado), su nivel y las condiciones. */
export interface KillCtx {
  tc: string;
  mlvl: number;
  diff: Diff;
  desec: boolean;
  herald: boolean;
  tier: number;
}
/** Lo que se busca: un único o una pieza por id, o una base (runas incluidas) de cualquier calidad por código. */
export type Target = { k: "u"; id: string } | { k: "s"; id: string } | { k: "b"; code: string };
