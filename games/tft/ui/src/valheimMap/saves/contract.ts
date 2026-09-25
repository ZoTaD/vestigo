/**
 * El contrato del lector de partidas (2026-09-25, idea del amigo de ZoTaD): la
 * persona arrastra la carpeta de su mundo y/o su personaje y el mapa muestra lo
 * suyo. Todo se lee en el navegador; nada se sube ni se guarda.
 *
 * El visor sólo depende de estas formas. Coordenadas del juego (x este, z norte).
 */

/** Lo que se sabe explorado: una grilla cuadrada centrada en (0, 0), fila 0 = el SUR (como la textura del juego). */
export interface Explored {
  /** Lado de la grilla en celdas (el juego usa 2048 para el mundo entero). */
  size: number;
  /** Metros por celda (el juego: 12). */
  pixelSize: number;
  /** 1 = explorado; `size * size` bytes. */
  cells: Uint8Array;
}

/** Un pin del mapa (de un personaje o compartido en la mesa de cartografía). */
export interface MapPin {
  name: string;
  x: number;
  z: number;
  /** `Minimap.PinType` del juego (0 fuego, 1 casa, 2 martillo, 3 punto, 4 muerte, 5 cama, 6 runa, 9 jefe…). */
  type: number;
  checked: boolean;
  /** De quién es (nombre del personaje), si el archivo lo dice. */
  owner?: string;
}

/** Un portal con su nombre ("tag"): los que tienen el mismo nombre están unidos. */
export interface Portal { prefab: string; x: number; z: number; tag: string }

/** Algo puntual de la partida: una tumba (con de quién es), una cama, un barco… */
export interface SavePoint { kind: "tombstone" | "bed" | "ship" | "cart" | "cartography"; x: number; z: number; label?: string }

export interface WorldSaveData {
  /** Nombre del mundo y semilla de texto (del `.fwl2`/`.fwl`). */
  name: string;
  seedName: string;
  seed: number;
  uid: string;
  worldGenVersion: number;
  portals: Portal[];
  points: SavePoint[];
  /** Lo explorado y los pines de cada mesa de cartografía (lo que compartieron todos). */
  cartography: { x: number; z: number; explored: Explored | null; pins: MapPin[] }[];
  /** Cuántas piezas construidas hay en cada zona de 64 m: `zones[k] = [zx, zz, cantidad]`. */
  buildZones: [number, number, number][];
  /** Los lugares que el juego generó de verdad (prefab y posición), si el archivo los trae. */
  locations: { prefab: string; x: number; z: number }[];
  warnings: string[];
}

export interface CharacterData {
  name: string;
  /** Un registro por mundo que visitó ese personaje. */
  worlds: { uid: string; explored: Explored | null; pins: MapPin[] }[];
  warnings: string[];
}

/** Un archivo elegido por la persona (de una carpeta, un zip o suelto). */
export interface InputFile { name: string; path: string; data: Uint8Array }
