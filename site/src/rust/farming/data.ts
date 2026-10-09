/**
 * Los datos de la pestaña Granjas de Rust (2026-10-09): `games/rust/data/farming.json` (`games/rust/tools/farming.py`),
 * ~32 KB, bajados con `import()` en un chunk aparte; nada viaja en el de la pestaña. `peek` da lo que ya llegó para el
 * primer render y el prerender.
 */
import type { Route } from "../../route";
import { once } from "../../zomboid/store";
import type { Gene } from "./genetics";

export type Loc = { en: string; es: string | null };
export interface Ref {
  id: string;
  slug: string | null;
  name: Loc;
}
export interface Stage {
  state: "seed" | "seedling" | "sapling" | "crossbreed" | "mature" | "fruiting" | "ripe" | "dying";
  minutes: number;
  yield: number;
  resources: number;
  fixed?: true;
}
export interface Plant {
  id: string;
  slugEs: string;
  key: string;
  name: Loc;
  stages: Stage[];
  water: number;
  optimal: Record<"light" | "water" | "ground" | "temperature", number>;
  temp: { min: number | null; max: number | null; best: number };
  light: number;
  /** El objeto cuyo ícono la representa (lo que da; el esqueje si da tela). */
  icon: string;
  harvest: { item: Ref; mult: number; max: number };
  seed: Ref;
  clone: Ref;
  clones: number;
  market: number;
  seasons: number;
}
export interface Farming {
  genes: { letter: Gene; positive: boolean; name: Loc; base: number; cross: number }[];
  rules: {
    slots: number; radius: number; growthPerG: number; yieldPerY: number; waterPerW: number; hardinessTemp: number;
    hardinessGround: number; planterGround: number; fertilizerGround: number; tick: number; lightRange: number;
    heatRange: number; saturation: number; marketPerGene: number;
  };
  plants: Plant[];
  planters: { item: Ref; water: number; pot: boolean }[];
  compost: { item: Ref; fert: number }[];
  composter: { item: Ref; slots: number; out: Ref; interval: number };
  sprinkler: { item: Ref; water: number; every: number };
  lights: Ref[];
  heater: Ref;
  chickens: { coop: Ref; max: number; hatch: number; egg: Ref; every: [number, number] };
  beehive: { item: Ref; comb: Ref; nucleus: Ref };
  trough: Ref;
  biofuel: { item: Ref; waste: Ref[] };
  livestock: {
    species: "cow" | "sheep";
    grow: number;
    pregnant: number;
    product: { item: Ref; amount: number; cooldown: number };
    dung: { item: Ref; every: number };
    herd: [number, number];
  }[];
  horses: { id: string; name: Loc; health: number; speed: number; stamina: number; drain: number; pic: string | null }[];
  animalPics: Record<"cow" | "sheep" | "chicken", string>;
}

const farming = once<Farming>(() => import("@rust/farming.json"));
export const peekFarming = (): Farming | null => farming.peek();
export const loadFarming = (): Promise<Farming> => farming.load();

/** El nombre en el idioma de la página; lo que el juego no traduce va en inglés. */
export const say = (loc: Loc, lang: "en" | "es"): string => (lang === "es" && loc.es) || loc.en;

/** Para el prerender y `preloadTab`: toda la pestaña usa el mismo archivo. */
export async function preloadFarmingRoute(_route: Route): Promise<void> {
  await loadFarming();
}
