/**
 * Los datos de la pestaña Monumentos de Rust (2026-10-09): `games/rust/data/monuments.json` (`monuments.py`), ~44 KB,
 * bajado con `import()` en su chunk.
 */
import type { Route } from "../../route";
import { once } from "../../zomboid/store";

export type Loc = { en: string; es: string | null };
export interface Ref {
  id: string;
  slug: string | null;
  name: Loc;
}
export type Card = "green" | "blue" | "red";
export type RecyclerColor = "green" | "yellow" | "red";
export type PowerWhat = "lootroom" | "fridge" | "systems";
export interface Monument {
  id: string;
  slugEs: string;
  key: string;
  name: Loc;
  type: string;
  tiers: number[];
  minWorldSize: number | null;
  safeZone: boolean;
  size: [number, number] | null;
  variants: number;
  photo: string | null;
  cards: Partial<Record<Card, number>>;
  recyclers: Partial<Record<RecyclerColor, number>>;
  fuses: number;
  radiation: "minimal" | "low" | "medium" | "high" | null;
  power: { stage: number; what: PowerWhat; n: number }[];
  shop: string | null;
  apartments: boolean;
}
export interface Order {
  item: Ref;
  amount: number;
  bp: boolean;
  currency: Ref;
  price: number;
}
export interface Monuments {
  monuments: Monument[];
  powergrid: { stages: number[]; boxes: number[]; fuse: Ref; byStage: { stage: number; fuses: number; monuments: string[] }[] };
  apartments: { rooms: { size: number; cost: number; rent: number; name: Loc }[]; tax: { item: Ref; scrap: number }[]; shops: number; scrap: Ref };
  shops: Record<string, { name: Loc; orders: Order[] }>;
}

const data = once<Monuments>(() => import("@rust/monuments.json"));
export const peekMonuments = (): Monuments | null => data.peek();
export const loadMonuments = (): Promise<Monuments> => data.load();
export const say = (loc: Loc, lang: "en" | "es"): string => (lang === "es" && loc.es) || loc.en;

export async function preloadMonumentsRoute(route: Route): Promise<void> {
  await loadMonuments();
  // La ficha trae también el puzzle paso a paso (`Puzzle.tsx`), en su propio chunk.
  if (route.detail) await import("./puzzles").then((m) => m.loadPuzzles());
}
