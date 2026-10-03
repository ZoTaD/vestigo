/**
 * Lo de las capas del Mapa de Project Zomboid (2026-09-30, Task 3) que necesita la página antes que el visor: los
 * colores y sellos de la leyenda, qué tipo de zona va a qué capa, desde qué zoom se dibuja cada una, las cifras, qué
 * esconde un escondite y los tipos de los datos. Lo usan `Legend.tsx`, `StashCard.tsx` y `data.ts`, que van en el chunk
 * de la pestaña; el resto de la lógica de las capas (leer, dibujar, nombrar zonas) está en `layers.ts`, que sólo usa el
 * visor y viaja con él.
 *
 * Lógica pura, sin Leaflet ni `window`: se prueba en `test/zomboidMapLayers.test.ts`.
 */
import type { ForageKind, StashLoot } from "./copy";
import type { LayerId } from "./url";

// ─────────────────────────────── zonas ───────────────────────────────

export type ZoneKind =
  | ForageKind
  | "ParkingStall"
  | "Ranch"
  | "Basement"
  | "ZombiesType"
  | "ZoneStory"
  | "LootZone"
  | "BuildingName";

/** A qué capa va cada tipo de zona. `Region` (los nombres de pueblos de regions.lua) no es capa: el mapa ya los escribe. */
export const ZONE_LAYER: Record<ZoneKind, LayerId> = {
  ParkingStall: "vehiculos",
  Forest: "recoleccion",
  DeepForest: "recoleccion",
  Vegitation: "recoleccion",
  FarmLand: "recoleccion",
  Farm: "recoleccion",
  TownZone: "recoleccion",
  TrailerPark: "recoleccion",
  Ranch: "animales",
  Basement: "sotanos",
  ZombiesType: "zombis",
  ZoneStory: "historias",
  LootZone: "botin",
  BuildingName: "edificios",
};

/**
 * Desde qué zoom del visor se dibuja cada capa de zonas. De lejos, una tesela toca muchas regiones: al zoom 0 se pedían
 * los 80 archivos de zonas a la vez (283 KB con gzip, 32.000 zonas) para pintar manchas que no se leen. Las capas con
 * más zonas (la recolección cubre casi todo el mapa; los lugares para autos son 9.690) esperan al zoom 2, que ya es un
 * pueblo entero; las demás, al 1. Se compara con el zoom redondeado, como Leaflet elige la tesela (`Math.round`).
 */
export const ZONE_MIN_ZOOM: Partial<Record<LayerId, number>> = { recoleccion: 2, vehiculos: 2 };
/** El zoom más chico al que se dibuja alguna capa de zonas: el `minZoom` de la capa de Leaflet. */
export const ZONES_FROM = 1;
const ZONE_LAYER_IDS = new Set<LayerId>(Object.values(ZONE_LAYER));

/** ¿La capa `id` es de zonas y, al zoom `z` del visor, todavía no se dibuja? (La leyenda dice "acercá".) */
export const zonesTooFar = (id: LayerId, z: number): boolean => ZONE_LAYER_IDS.has(id) && Math.round(z) < (ZONE_MIN_ZOOM[id] ?? ZONES_FROM);

/** Las capas prendidas que se dibujan al zoom `z` (sin las de zonas que todavía no llegaron a su zoom). */
export const layersAtZoom = (on: ReadonlySet<LayerId>, z: number): Set<LayerId> => new Set([...on].filter((id) => !zonesTooFar(id, z)));

/** Los tipos de recolección, en el orden de su clave en la leyenda. */
export const FORAGE_KINDS: ForageKind[] = ["Forest", "DeepForest", "Vegitation", "FarmLand", "Farm", "TownZone", "TrailerPark"];

/**
 * El tinte de cada tipo. Tienen que leerse sobre la vista satelital (verdes y grises) y sobre el papel (beige): la
 * recolección va en verdes y tierras, como el terreno que describe; lo demás en colores que no están en el suelo.
 */
export const ZONE_COLOR: Record<ZoneKind, string> = {
  Forest: "#2fa84a",
  DeepForest: "#0a5a32",
  Vegitation: "#cde04a",
  FarmLand: "#e6b53a",
  Farm: "#ee7a28",
  TownZone: "#5b82c4",
  TrailerPark: "#bd6ad8",
  ParkingStall: "#e0452f",
  Ranch: "#a8672e",
  Basement: "#7b55b8",
  ZombiesType: "#c22f78",
  ZoneStory: "#1c9c96",
  LootZone: "#e7b416",
  BuildingName: "#2f6fc0",
};

/** El color de los puntos de aparición (no son zonas: van como sellos). */
export const SPAWN_COLOR = "#f0c531";

/** El sello de cada capa en la leyenda (el sufijo de `map_<nombre>.png`). */
export const LAYER_STAMP: Record<LayerId, string> = {
  vehiculos: "steeringwheel",
  recoleccion: "leaf",
  animales: "cow",
  sotanos: "ladder",
  zombis: "z",
  densidad: "skull",
  historias: "exclamation",
  botin: "dollarsign",
  edificios: "house",
  apariciones: "star",
  escondites: "x",
};

/** El tinte de cada capa en la leyenda. */
export const LAYER_COLOR: Record<LayerId, string> = {
  vehiculos: ZONE_COLOR.ParkingStall,
  recoleccion: ZONE_COLOR.Forest,
  animales: ZONE_COLOR.Ranch,
  sotanos: ZONE_COLOR.Basement,
  zombis: ZONE_COLOR.ZombiesType,
  // El lápiz rojo de la Libreta, el mismo con que se pinta la capa (`HEAT_RGB`).
  densidad: "#b3261e",
  historias: ZONE_COLOR.ZoneStory,
  botin: ZONE_COLOR.LootZone,
  edificios: ZONE_COLOR.BuildingName,
  apariciones: "#b8900c",
  escondites: "#a60e0e",
};

/** Las cifras de `map/meta.json` que usa la leyenda. */
export interface LayerCounts {
  zones: Record<string, number>;
  /** Las zonas de botín `Rich`: la capa se llama "Botín rico" y objects.lua trae además una `Poor`. */
  lootRich?: number;
  spawns: number;
  stashes: number;
}

/**
 * Cuántas cosas tiene una capa en todo el mapa: las zonas distintas de sus tipos, los puntos o los escondites. `null`
 * si no hay una cifra honesta: la densidad no es una cuenta (cuántos zombis salen lo decide la configuración de cada
 * partida), y poner "148.819 chunks" al lado del nombre se leería como zombis.
 *
 * Las cifras de zonas (`map_counts` en `map.py`) cuentan sólo lo que el juego usa, y eso no siempre coincide con lo que se
 * dibuja: las historias que no arman nada (18 de 171) ni se dibujan ni se cuentan, pero los lugares para autos sin tabla
 * de vehículos se dibujan, rotulados "acá no aparecen autos", y no entran en la cifra de "Vehículos".
 */
export function layerCount(id: LayerId, counts: LayerCounts): number | null {
  if (id === "densidad") return null;
  if (id === "apariciones") return counts.spawns;
  if (id === "escondites") return counts.stashes;
  if (id === "botin" && counts.lootRich !== undefined) return counts.lootRich;
  let n = 0;
  for (const [kind, layer] of Object.entries(ZONE_LAYER)) if (layer === id) n += counts.zones[kind] ?? 0;
  return n;
}

// ─────────────────────────────── densidad de zombis ───────────────────────────────

/** El lápiz rojo de la Libreta (`--pz-pencil`): la densidad se pinta como un sombreado a lápiz. */
export const HEAT_RGB: [number, number, number] = [179, 38, 30];

/**
 * La opacidad (0–1) de un chunk con densidad `v`, relativa al máximo del mapa. Raíz cuadrada: en la 42.21 casi todos
 * los chunks con zombis valen 1 a 3 de 10 y en lineal un pueblo entero quedaba casi invisible. Tope 0,85: el satélite y
 * el papel se siguen leyendo debajo.
 */
export function heatAlpha(v: number, max: number): number {
  if (v <= 0 || max <= 0) return 0;
  return 0.2 + 0.65 * Math.sqrt(Math.min(1, v / max));
}

/** La clave de la leyenda, de menos a más zombis. */
export const HEAT_KEY: string[] = [0.1, 0.3, 0.5, 0.75, 1].map((t) => `rgba(${HEAT_RGB.join(",")},${heatAlpha(t, 1).toFixed(2)})`);

/**
 * Los nombres de zona que el juego define (`common.zoneDefs`, lo escribe `zone_defs` de `map.py`): sólo esos se
 * traducen. El juego no arregla erratas: una zona de zombis " Offices" o "Church" usa los de `Default`, y una de autos
 * "burnt" no pone ninguno, y una de historias "forest" no arma ninguna. Así que el sitio tampoco las arregla: dice lo que
 * pasa en la partida.
 */
export interface ZoneDefs {
  /** Por nombre de zona (tal cual, con mayúsculas y espacios), la tabla de ZombiesZoneDefinition que usa. */
  zombies: Record<string, string>;
  /** Las tablas de VehicleZoneDistribution que una zona puede encontrar (en minúsculas). */
  vehicles: string[];
  /**
   * Los nombres de zona de historia con los que el juego arma algo (`story_zone_names` de `map.py`, de las clases RZS del
   * .jar). El juego compara con `String.equals`: una zona que se llama "forest", "NewsStory" o "KirstyCormick" (el juego
   * dice "KirstyKormick") o que no tiene nombre no arma ninguna historia, y el visor no la muestra como historia.
   */
  stories: string[];
}

/** Un nombre del juego separado en palabras ("KnoxBank" → "Knox Bank"): lo que se muestra si no está en la tabla. */
export const humanize = (name: string): string =>
  name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");

// ─────────────────────────────── puntos de aparición y escondites ───────────────────────────────

export type SpawnPoint = [number, number, number, string[]];
export interface SpawnData {
  towns: { id: string; name: string; points: SpawnPoint[] }[];
  zones: SpawnPoint[];
}

export interface StampDef {
  file: string;
  group: string;
}

/** Una anotación de un mapa de escondite: un sello o un texto (con su traducción del juego, si la tiene). */
export interface Annotation {
  x: number;
  y: number;
  color: string;
  stamp?: string;
  text?: string;
  es?: string;
}

export interface Stash {
  id: string;
  /** El pueblo del escondite; `null` los del campo (de WorldStashDesc.lua), que traen el más cercano en `near`. */
  town: string | null;
  near?: string;
  /** El mapa del juego sobre el que están las anotaciones ("Base.RosewoodMap"): el que hay que encontrar. */
  item: string;
  annotations: Annotation[];
  /** El punto del escondite; si viene `buildingRaw`, es el centro de las anotaciones (aproximado). */
  building: [number, number];
  buildingRaw?: unknown;
  spawnTable?: string;
  zombies?: number;
  barricades?: number;
  containers?: { type?: string; item?: string }[];
  traps?: string;
  daysToSpawn?: string;
  spawnOnlyOnZed?: boolean;
}

/** Qué esconde, por la tabla de botín del juego ("GunCache1" → armas); `null` si no esconde nada (un mapa de datos). */
export function stashLoot(spawnTable: string | undefined): StashLoot | null {
  if (!spawnTable) return null;
  const t = spawnTable.toLowerCase();
  const kinds: [string, StashLoot][] = [
    ["shotgun", "shotgun"],
    ["gun", "gun"],
    ["survivor", "survivor"],
    ["tool", "tools"],
    ["food", "food"],
    ["medical", "medical"],
    ["booze", "booze"],
  ];
  return kinds.find(([p]) => t.startsWith(p))?.[1] ?? "other";
}
