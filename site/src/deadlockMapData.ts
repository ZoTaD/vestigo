import mapJson from "@deadlock/map.json";

/**
 * Los datos de la pestaña Mapa: qué hay en cada lugar del mapa de Deadlock,
 * cuánto aguanta, cuánto da y a qué minuto aparece.
 *
 * Salen del juego instalado con `games/deadlock/tools/map_data.py`, una vez por
 * parche. Diseño: `docs/design/2026-10-12-deadlock-mapa.md`.
 *
 * Las posiciones ya vienen normalizadas de 0 a 1 sobre el minimapa, con el
 * origen arriba a la izquierda.
 */

export type MapGroup = "jungle" | "loot" | "objectives" | "places";

export type MapKindId =
  | "camp-small"
  | "camp-medium"
  | "camp-large"
  | "vault"
  | "midboss"
  | "crate"
  | "tough-crate"
  | "statue"
  | "health"
  | "buff"
  | "walker"
  | "base-guardian"
  | "shrine"
  | "patron"
  | "shop";

export interface MapTimer {
  /** Segundo de la partida en que aparece por primera vez. */
  initial: number;
  /** Cada cuántos segundos vuelve después de caer. */
  respawn: number;
}

export interface MapKind extends Partial<MapTimer> {
  group: MapGroup;
  count: number;
  health?: number;
  /** Cuánto se acorta la reaparición cada vez (negativo), y su piso. */
  respawnStep?: number;
  respawnMin?: number;
  /** Los rompibles reaparecen por grupo: un par de tiempos por grupo. */
  timers?: MapTimer[];
  /** Una caja: las almas que suelta, lo que suma por minuto y con qué probabilidad. */
  souls?: number;
  soulsPerMinute?: number;
  dropChance?: number;
  /** La caja dura: sólo la rompe un golpe pesado cuerpo a cuerpo. */
  heavyMeleeOnly?: boolean;
}

export type UnitSize = "weak" | "normal" | "strong" | "vault" | "boss";

export interface MapCamp {
  kind: MapKindId;
  x: number;
  y: number;
  units: Partial<Record<UnitSize, number>>;
  /** Qué criaturas son, de la más grande a la más chica: el nombre de su retrato. */
  creatures: string[];
  /** La vida de todas sus criaturas juntas. */
  health: number;
  /** Las almas que da entero, al minuto cero. */
  souls: number;
  /** Cuánto crecen esas almas por minuto de partida, en por ciento. */
  growth: number;
  /** Vida que gana por minuto (sólo el jefe del medio). */
  healthGrowth?: number;
}

export interface MapFile {
  generatedAt: string;
  bound: number;
  kinds: Record<MapKindId, MapKind>;
  camps: MapCamp[];
  /** Por tipo: `[x, y]` y, según el tipo, un tercer número (grupo de reaparición o equipo). */
  points: Partial<Record<MapKindId, number[][]>>;
  ziplines: { lane: number; points: number[][] }[];
  /** El mapa calcado a vectores, en coordenadas de 0 a 1000: el suelo y la silueta entera. */
  shape: { ground: string; silhouette: string };
}

export const MAP = mapJson as unknown as MapFile;

/** El orden en que se listan los tipos, en las capas y en la tabla. */
export const MAP_KINDS: MapKindId[] = [
  "camp-small",
  "camp-medium",
  "camp-large",
  "vault",
  "midboss",
  "crate",
  "tough-crate",
  "statue",
  "health",
  "buff",
  "walker",
  "base-guardian",
  "shrine",
  "patron",
  "shop",
];

export const MAP_GROUPS: MapGroup[] = ["jungle", "loot", "objectives", "places"];

/** Lo que se ve al abrir: la jungla y los objetivos. Las 665 cajas y estatuas tapan todo. */
export const DEFAULT_LAYERS: MapKindId[] = MAP_KINDS.filter((k) => {
  const g = MAP.kinds[k].group;
  return g === "jungle" || g === "objectives";
});

/** Hasta qué minuto llega la línea de tiempo. */
export const TIMELINE_MAX_MIN = 40;

/** Los tiempos de un punto: los de su tipo o, en un rompible, los de su grupo. */
export function timerOf(kind: MapKind, group = 0): MapTimer | null {
  if (kind.timers) return kind.timers[group] ?? kind.timers[0] ?? null;
  if (kind.initial === undefined || kind.respawn === undefined) return null;
  return { initial: kind.initial, respawn: kind.respawn };
}

/** Si ya apareció al segundo `t`. Lo que no tiene reloj (una tienda) está siempre. */
export function isUpAt(kind: MapKind, t: number, group = 0): boolean {
  const timer = timerOf(kind, group);
  return timer === null || t >= timer.initial;
}

/** Las almas de un campamento entero al minuto `minute`. */
export function campSoulsAt(camp: MapCamp, minute: number): number {
  return Math.round(camp.souls * (1 + (camp.growth / 100) * minute));
}

/** La vida de un campamento al minuto `minute`: sólo crece la del jefe del medio. */
export function campHealthAt(camp: MapCamp, minute: number): number {
  return Math.round(camp.health + (camp.healthGrowth ?? 0) * minute);
}

/** El menor y el mayor de una cifra entre los campamentos de un tipo. */
export function campRange(kind: MapKindId, pick: (c: MapCamp) => number): [number, number] | null {
  const values = MAP.camps.filter((c) => c.kind === kind).map(pick);
  return values.length === 0 ? null : [Math.min(...values), Math.max(...values)];
}

/** `m:ss` de un tiempo en segundos. */
export const clock = (s: number): string => {
  // Se redondea el total, no el resto: 419,6 s es 7:00 y no "6:60".
  const total = Math.round(s);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
