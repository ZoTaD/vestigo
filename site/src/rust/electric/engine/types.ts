/**
 * Los tipos del simulador de electricidad de Rust (2026-10-09). Plan: docs/superpowers/plans/2026-10-09-rust-electricidad.md.
 *
 * `ComponentDef` es una fila de `games/rust/data/electricity.json` (lo arma `games/rust/tools/electricity.py`).
 * `Circuit` es lo que se guarda en el link: partes con su posición y configuración, y cables de enchufe a enchufe.
 */

/** `IOEntity.IOType` del juego: el tipo de un enchufe y de una red. */
export const IO = { Electric: 0, Fluidic: 1, Kinetic: 2, Generic: 3, Industrial: 4 } as const;
export type IOType = (typeof IO)[keyof typeof IO];

export interface SlotDef {
  /** `niceName`: el nombre del enchufe en el juego ("Power In", "Branch Out"…). */
  n: string;
  t: IOType;
  /** `mainPowerSlot`: la entrada que alimenta (las otras son señales). */
  m: 0 | 1;
}

export type Category = "source" | "battery" | "route" | "logic" | "switch" | "sensor" | "defense" | "light" | "appliance";

export interface ComponentDef {
  /** shortname del objeto que lo coloca. */
  id: string;
  /** Clase del juego: elige el comportamiento. */
  cls: string;
  cat: Category;
  name: { en: string; es: string | null };
  slug: string | null;
  slugEs: string | null;
  in: SlotDef[];
  out: SlotDef[];
  /** `ConsumptionAmount()`. */
  use: number;
  useSrc: "field" | "code" | "formula" | "base" | "nocode";
  /** Lo máximo que genera, si es fuente. */
  gen?: number;
  /** Campos del prefab que usa el comportamiento. */
  p: Record<string, number>;
  /** Lo que el jugador puede configurar, con su rango. */
  range?: Record<string, [number, number]>;
  craft: { id: string; amount: number }[];
}

export interface ElectricityData {
  categories: Category[];
  components: ComponentDef[];
  names: Record<string, { en: string; es: string | null }>;
}

/** La configuración y el estado guardable de una parte (interruptor prendido, tiempo del temporizador…). */
export type PartCfg = Record<string, number>;

export interface Part {
  /** Id de la parte dentro del circuito (corto: "a", "b"…). */
  id: string;
  /** shortname del componente. */
  type: string;
  x: number;
  y: number;
  cfg?: PartCfg;
}

/** Un cable: de la salida `from[1]` de la parte `from[0]` a la entrada `to[1]` de `to[0]`. */
export interface Wire {
  from: [string, number];
  to: [string, number];
}

/** El entorno: hora del día (sol), viento y agua para las fuentes. */
export interface Env {
  /** 0-24. */
  hour: number;
  /** Ruido de viento del juego (0-1). */
  gust: number;
  /** Altura del molino sobre el terreno, en metros. */
  height: number;
}

export interface Circuit {
  parts: Part[];
  wires: Wire[];
  env?: Partial<Env>;
}

export const DEFAULT_ENV: Env = { hour: 12, gust: 0.5, height: 20 };
