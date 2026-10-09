/**
 * El recorrido de los puzzles de cada monumento de Rust (2026-10-09): `games/rust/data/puzzles.json` (`puzzles.py`,
 * escrito a mano), ~60 KB, en su propio chunk. Lo baja la ficha de un monumento (y el prerender, con
 * `preloadMonumentsRoute`).
 */
import { once } from "../../zomboid/store";
import type { Ref } from "./data";

export type Conf = "high" | "medium" | "low";
export interface ItemN {
  item: Ref;
  n: number;
}
export interface PuzzleStep {
  en: string;
  es: string;
  conf: Conf;
  items: ItemN[];
}
export interface MonumentPuzzle {
  conf: Conf;
  verified: string;
  cards: Partial<Record<"green" | "blue" | "red", number>>;
  fuseBoxes: number;
  resetMin: number;
  needs: ItemN[];
  steps: PuzzleStep[];
  reward: { en: string; es: string; items: ItemN[] } | null;
  changes: { date: string; en: string; es: string }[];
}
export interface Puzzles {
  verified: string;
  monuments: Record<string, MonumentPuzzle>;
}

const data = once<Puzzles>(() => import("@rust/puzzles.json"));
export const peekPuzzles = (): Puzzles | null => data.peek();
export const loadPuzzles = (): Promise<Puzzles> => data.load();
