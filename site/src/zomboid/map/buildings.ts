/**
 * Los edificios del Mapa de Project Zomboid (2026-09-30, Task 4): la forma de los `bld/<región>.json` de `map.py` (el
 * contrato está en `write_web`) y la geometría que necesita el visor para encontrar el edificio tocado y dibujar su
 * planta. Lógica pura, sin Leaflet ni `window`, probada en `test/zomboidRooms.test.ts`.
 *
 * Está aparte de `rooms.ts` (los nombres de las habitaciones) para que el visor no baje esas tablas antes de mostrar el
 * mapa: éste va con el visor, los nombres con la hoja del edificio.
 */

/** Una habitación: `[índice en common.rooms, x, y, ancho, alto, x, y, ancho, alto, …]`. */
export type RoomTuple = number[];

export interface Building {
  id: string;
  box: [number, number, number, number];
  type?: string;
  tone?: string;
  name?: string;
  parts?: string[];
  /** Por piso ("0" planta baja, "1", "-1"…), sus habitaciones. */
  floors: Record<string, RoomTuple[]>;
}

/** Las casillas de una habitación: la suma de sus rectángulos. */
export function roomTiles(r: RoomTuple): number {
  let n = 0;
  for (let i = 1; i + 3 < r.length; i += 4) n += r[i + 2] * r[i + 3];
  return n;
}

/** Los rectángulos de una habitación, `[x, y, ancho, alto]` en casillas. */
export function rectsOf(r: RoomTuple): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let i = 1; i + 3 < r.length; i += 4) out.push([r[i], r[i + 1], r[i + 2], r[i + 3]]);
  return out;
}

/** Los pisos de un edificio, de abajo hacia arriba ("-1", "0", "1"…). */
export const floorsOf = (b: Building): string[] => Object.keys(b.floors).sort((a, c) => Number(a) - Number(c));

/** El piso que se muestra al abrir la hoja: la planta baja; si no tiene, el más bajo sobre el suelo; si no, el que haya. */
export function defaultFloor(b: Building): string {
  const fl = floorsOf(b);
  return fl.find((f) => f === "0") ?? fl.find((f) => Number(f) >= 0) ?? fl[0] ?? "0";
}


const inside = (b: Building, x: number, y: number) =>
  Object.values(b.floors).some((rooms) =>
    rooms.some((r) => rectsOf(r).some(([rx, ry, w, h]) => x >= rx && x < rx + w && y >= ry && y < ry + h)),
  );

/**
 * El edificio de la casilla (x, y): el que tiene una habitación en esa casilla, en cualquier piso (la caja sola no
 * alcanza: la de una casa en L cubre el patio de al lado). Si dos se pisan, el más chico, que es el de adentro. Las
 * listas son los `bld/<región>.json` de las regiones de la casilla; un edificio que está en dos cuenta una vez.
 */
export function buildingAt(lists: readonly (readonly Building[])[], x: number, y: number): Building | null {
  let best: Building | null = null;
  let area = Infinity;
  const seen = new Set<string>();
  for (const list of lists)
    for (const b of list) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      const [x1, y1, x2, y2] = b.box;
      if (x < x1 || x > x2 || y < y1 || y > y2 || !inside(b, x, y)) continue;
      const a = (x2 - x1 + 1) * (y2 - y1 + 1);
      if (a < area) {
        best = b;
        area = a;
      }
    }
  return best;
}

/** El cuadrado de 256 casillas donde el juego define el edificio, sacado de su id ("41_37_45" → celda 41, 37). */
export function buildingCell(id: string): [number, number, number, number] | null {
  const m = id.match(/^(\d+)_(\d+)_\d+$/);
  if (!m) return null;
  const cx = Number(m[1]) * 256;
  const cy = Number(m[2]) * 256;
  return [cx, cy, cx + 256, cy + 256];
}

// ── Que la hoja no tape el edificio ──
// La hoja del edificio se apoya sobre el mapa: abajo y a lo ancho en el celular, a la derecha en la pantalla grande. El
// buscador y los links dejan el edificio justo en el centro del mapa, que es donde la hoja del celular lo tapa. Estas dos
// funciones son la cuenta (en píxeles, sin Leaflet) para correr el mapa lo justo.

/** Un rectángulo en píxeles de pantalla. */
export interface PxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
/** Cuánto de cada borde del mapa tapa algo (la hoja), en píxeles. */
export interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export const NO_INSET: Inset = { top: 0, right: 0, bottom: 0, left: 0 };

/** Un respiro entre el edificio y el borde de la hoja. */
const SHEET_GAP = 10;

/** Hasta cuánto se considera que la hoja "toca" el borde del mapa: la hoja del celular deja 10 px a cada lado, la lateral 16 arriba. */
const EDGE_SLACK = 40;

/**
 * Cuánto del mapa tapa la hoja, medido con los rectángulos reales de los dos (nada de números fijos: la hoja crece con
 * sus habitaciones y cambia entre el celular y la pantalla). La hoja del celular va abajo y ocupa el ancho entero del
 * mapa, de borde a borde (con su margen): tapa desde su borde de arriba hasta el pie. Cualquier otra está al costado
 * (escritorio): tapa desde su borde izquierdo hasta el costado derecho. Se decide por esa geometría (pegada a los dos
 * lados o no) y no por qué porción del ancho ocupa: en un escritorio angosto (~870 px) la lateral llega al 74 % del
 * mapa y una regla de proporción la confundía con la del celular. Sin hoja, nada.
 */
export function sheetInset(sheet: PxRect | null, map: PxRect): Inset {
  if (!sheet) return NO_INSET;
  const fullWidth = sheet.left - map.left <= EDGE_SLACK && map.right - sheet.right <= EDGE_SLACK;
  return fullWidth
    ? { ...NO_INSET, bottom: Math.max(0, map.bottom - sheet.top + SHEET_GAP) }
    : { ...NO_INSET, right: Math.max(0, map.right - sheet.left + SHEET_GAP) };
}

/**
 * Cuánto hay que correr el mapa (`map.panBy`) para que `box` (el edificio, en píxeles del contenedor) quede adentro de lo
 * que la hoja deja libre. Si ya está adentro, `[0, 0]`. Si no entra entero (un edificio grande contra una hoja alta),
 * queda centrado en la parte libre. No se usa `map.panInside`: sólo mira un punto, y el edificio tiene que verse entero.
 */
export function shiftIntoView(box: PxRect, view: { width: number; height: number }, inset: Inset): [number, number] {
  const axis = (lo: number, hi: number, from: number, to: number) => {
    // Sin espacio libre (la hoja tapa todo el eje): no hay a dónde acomodarlo, y centrar en un intervalo invertido movería
    // el mapa para cualquier lado.
    if (to <= from) return 0;
    if (hi - lo >= to - from) return (lo + hi) / 2 - (from + to) / 2;
    if (lo < from) return lo - from;
    if (hi > to) return hi - to;
    return 0;
  };
  return [
    axis(box.left, box.right, inset.left, view.width - inset.right),
    axis(box.top, box.bottom, inset.top, view.height - inset.bottom),
  ];
}
