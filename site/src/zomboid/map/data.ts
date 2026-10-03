/**
 * Los datos del Mapa de Project Zomboid (2026-09-30), tal como los escribe `games/zomboid/tools/map.py` en
 * `games/zomboid/data/map/web/` (el contrato está en el docstring de `write_web`):
 *
 * - `common.json` (251 KB, 65 KB con gzip): la paleta, los textos del mapa, las calles, los escondites, los puntos de
 *   aparición y la lista de regiones con qué archivos tiene cada una. Se pide una vez, al montar el visor.
 * - `regions/<id>.json` y `zones/<id>.json`: el dibujo y las zonas de cada región, en `regionData.ts` (sólo los pide el
 *   visor, y la lista de sus archivos viaja con él).
 *
 * Nada de esto viaja en el chunk de la pestaña: cada archivo es un `import()` aparte, así el Mapa pide sólo lo que se
 * ve. Acá quedan los tipos y `common.json`, que la página pide junto con el visor.
 */
import { once } from "../store";
import type { SpawnData, StampDef, Stash, ZoneDefs } from "./layerMeta";

export type RGB = [number, number, number];
/** Un anillo o una línea: `[x0, y0, x1, y1, …]` en casillas del mundo. */
export type Ring = number[];
/** Un polígono: el anillo de afuera y sus huecos. */
export type Poly = Ring[];

export interface MapStyle {
  background: RGB;
  forest: RGB;
  water: RGB;
  roads: Record<string, RGB>;
  railway: RGB;
  buildings: Record<string, RGB>;
}

/** Un texto del mapa (pueblos, ríos, bosques, lugares). `minZoom`/`maxZoom` son del zoom del mapa del juego. */
export interface MapLabel {
  key?: string;
  text: string;
  es?: string;
  layer: string;
  x: number;
  y: number;
  scale: number;
  rotation?: number;
  minZoom: number;
  maxZoom: number;
}

/** Una calle con nombre: su recorrido, su ancho y dónde va el nombre (`[x, y, ángulo en grados]`). */
export interface Street {
  name: string;
  width: number;
  points: Ring;
  label: [number, number, number];
}

export interface RegionRef {
  id: string;
  box: [number, number, number, number];
  draw?: 1;
  zones?: 1;
  bld?: 1;
}

/** La ficha de un objeto que nombra un escondite (el mapa que hay que encontrar, la bolsa del botín). */
export interface ItemRef {
  id: string;
  en: string;
  es: string;
}

/** La grilla de densidad de zombis (`web/zombies.bin`, ver `zombie_density` de `map.py`): `w`×`h` chunks de `cell` casillas. */
export interface DensityHeader {
  w: number;
  h: number;
  cell: number;
  /** El valor más alto del mapa: la capa pinta relativo a él. */
  max: number;
}

export interface MapCommon {
  style: MapStyle;
  bounds: [number, number, number, number];
  rooms: string[];
  labels: MapLabel[];
  streets: Street[];
  regions: RegionRef[];
  stamps: Record<string, StampDef>;
  stashes: Stash[];
  spawns: SpawnData;
  /** Por objeto del juego ("Base.RosewoodMap"), su ficha; los que no tienen ficha no vienen. */
  items: Record<string, ItemRef>;
  /** Los nombres de zona que el juego define: sólo esos se traducen (ver `ZoneDefs`). */
  zoneDefs: ZoneDefs;
  /** La cabecera de `zombies.bin`: el binario no trae su tamaño, así se sabe cómo leerlo antes de pedirlo. */
  zombies: DensityHeader;
  // Lo demás (lugares) lo tipa quien lo use.
  [more: string]: unknown;
}

/** El dibujo de una región para el mapa de papel. Lo que no hay en la región no viene. */
export interface RegionDraw {
  b?: Record<string, Poly[]>;
  roads?: Record<string, Poly[]>;
  roadLines?: Record<string, Ring[]>;
  water?: Poly[];
  railway?: Poly[];
  wood?: Poly[];
  driveways?: Poly[];
}

const common = once<MapCommon>(() => import("@zomboid/map/web/common.json"));
export const loadCommon = (): Promise<MapCommon> => common.load();
