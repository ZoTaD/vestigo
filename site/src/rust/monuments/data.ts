/**
 * Los datos de la pestaña Monumentos de Rust (2026-10-09): `games/rust/data/monuments.json` (`monuments.py`), ~65 KB,
 * bajado con `import()` en su chunk. El botín de cada caja y NPC (`monuments-loot.json`, ~86 KB) va aparte y lo baja la
 * ficha recién cuando se abre una caja.
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
/** Lo que aparece en un monumento lleno: lo seguro, lo máximo y lo esperado; `power`, sólo con la red de Power Trip. */
export interface SpawnRow {
  id: string;
  lo: number;
  hi: number;
  avg: number;
  power?: boolean;
}
export interface Spawns {
  loot: SpawnRow[];
  npc: SpawnRow[];
  pickup: (Omit<SpawnRow, "id"> & { item: Ref })[];
  respawn: [number, number] | null;
}
export interface Source {
  en: string;
  es: string | null;
  kind: "loot" | "npc";
  event: string | null;
  loot: boolean;
}
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
  spawns: Spawns;
  spawnsByTier: boolean;
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
  powergrid: {
    stages: number[];
    boxes: number[];
    fuse: Ref;
    byStage: { stage: number; fuses: number; monuments: string[] }[];
    /** Lo que dura un fusible: los `worst` más gastados, `seconds` con `pop[1]` jugadores o más; el resto, a `slow`. */
    wear: { seconds: number; worst: number; slow: [number, number]; pop: [number, number]; lowPopScale: number };
  };
  apartments: {
    rooms: { size: number; cost: number; rent: number; name: Loc }[];
    tax: { item: Ref; scrap: number }[];
    shops: number;
    scrap: Ref;
    freeHours: number;
    masterKey: number;
    /** Cuánto pesa el impuesto por recursos en el alquiler (0: no se cobra). */
    taxScale: number;
    evictHours: number;
    shopRent: { fee: number; perHour: number; hours: number; protectHours: number };
  };
  shops: Record<string, { name: Loc; orders: Order[] }>;
  sources: Record<string, Source>;
}
/** Una fila de botín: [objeto, probabilidad, mínimo, máximo, plano]. */
export type LootRow = [string, number, number, number, boolean];
export interface MonumentLoot {
  items: Record<string, { slug: string | null; name: Loc }>;
  tables: Record<string, LootRow[]>;
}

const data = once<Monuments>(() => import("@rust/monuments.json"));
export const peekMonuments = (): Monuments | null => data.peek();
export const loadMonuments = (): Promise<Monuments> => data.load();
const loot = once<MonumentLoot>(() => import("@rust/monuments-loot.json"));
export const peekMonumentLoot = (): MonumentLoot | null => loot.peek();
export const loadMonumentLoot = (): Promise<MonumentLoot> => loot.load();
export const say = (loc: Loc, lang: "en" | "es"): string => (lang === "es" && loc.es) || loc.en;

export async function preloadMonumentsRoute(route: Route): Promise<void> {
  await loadMonuments();
  // La ficha trae también el puzzle paso a paso (`Puzzle.tsx`), en su propio chunk.
  if (route.detail) await import("./puzzles").then((m) => m.loadPuzzles());
}
