/**
 * El motor del planificador de granja (2026-10-26), sin pantalla: qué admite cada casilla, dónde se puede colocar
 * cada cosa, qué riega y qué protege lo colocado, la cuenta, y la granja como texto para el enlace. Las reglas salen del
 * código del juego 1.6.15 (diseño: docs/superpowers/specs/2026-10-26-stardew-planificador-design.md); los datos, de
 * `games/stardew/tools/planner_data.py`.
 */

export type Pair = [en: string, es: string];
export type Cat = "crop" | "water" | "scare" | "machine" | "path" | "tree" | "building";
/** Qué pide la casilla: azada (cultivo), objeto sólido, piso, árbol o edificio (`planner_data.py`). */
export type Place = "hoe" | "obj" | "floor" | "tree" | "build";
/** Aspersor (radio de `GetSprinklerTiles`), espantapájaros (`Vector2.Distance < r`), colmena (Manhattan ≤ r) y cabaña junimo. */
export type RangeKind = "sprinkler" | "circle" | "diamond" | "junimo";

export interface PlannerItem {
  id: string;
  cat: Cat;
  name: Pair;
  /** La ficha de Objetos (cultivos, frutales y lo fabricable). */
  slug?: string;
  /** La fila de la pestaña Granja (edificios). */
  anchor?: string;
  place: Place;
  /** Dibujo, relativo a `/stardew/`, y su tamaño en px del juego. */
  img: string;
  iw: number;
  ih: number;
  /** Huella en casillas (edificios); lo demás ocupa 1. */
  w?: number;
  h?: number;
  range?: [RangeKind, number];
  seasons?: number[];
  /** Precio de la semilla o del retoño. */
  price?: number;
  /** Costo de obra (edificios). */
  cost?: number;
  mats?: [string, number][];
  seed?: string;
  /** El aspersor con boquilla de presión: el id de la boquilla. */
  nozzle?: string;
}

export interface FixedBuilding {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  name: Pair;
}

export interface Farm {
  key: string;
  map: string;
  name: Pair;
  w: number;
  h: number;
  /** Una letra de `ALPHABET` por casilla, fila por fila: los bits de `planner_data.py`. */
  grid: string;
  fixed: FixedBuilding[];
  img: string;
}

export interface PlannerData {
  farms: Farm[];
  items: PlannerItem[];
  /** id del material -> [nombre en, nombre es, slug de su ficha o null si es una categoría]. */
  mats: Record<string, [string, string, string | null]>;
  /** Slug inglés -> español de las fichas que se enlazan (sólo los que cambian). */
  slugsEs: Record<string, string>;
}

export const HOE = 1;
export const OBJ = 2;
export const FLOOR = 4;
export const BUILD = 8;
export const NO_SPRINKLER = 16;
export const TREE = 32;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export type Season = 0 | 1 | 2 | 3;
export interface Placed {
  id: string;
  x: number;
  y: number;
}
export interface PlanState {
  farm: string;
  season: Season;
  placed: Placed[];
}

/** Lo que pisa cada cosa: el suelo (cultivo, piso, frutal) o arriba (objeto, edificio). Un aspersor va sobre un piso. */
export const layerOf = (it: PlannerItem): "ground" | "top" => (it.place === "hoe" || it.place === "floor" || it.place === "tree" ? "ground" : "top");
export const sizeOf = (it: PlannerItem): [number, number] => [it.w ?? 1, it.h ?? 1];

/** La granja lista para preguntar: bits por casilla y qué ocupa cada una. */
export class Board {
  readonly bits: Uint8Array;
  /** Índice en `placed` de lo que hay en cada casilla, por capa; -1 libre. Los edificios fijos marcan -2 arriba. */
  readonly ground: Int32Array;
  readonly top: Int32Array;

  constructor(
    readonly farm: Farm,
    readonly items: Map<string, PlannerItem>,
    readonly placed: Placed[],
  ) {
    const n = farm.w * farm.h;
    this.bits = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.bits[i] = ALPHABET.indexOf(farm.grid[i]);
    this.ground = new Int32Array(n).fill(-1);
    this.top = new Int32Array(n).fill(-1);
    for (const f of farm.fixed) for (const [x, y] of rect(f.x, f.y, f.w, f.h)) if (this.inside(x, y)) this.top[y * farm.w + x] = -2;
    placed.forEach((p, i) => {
      const it = items.get(p.id);
      if (!it) return;
      const layer = layerOf(it) === "ground" ? this.ground : this.top;
      const [w, h] = sizeOf(it);
      for (const [x, y] of rect(p.x, p.y, w, h)) if (this.inside(x, y)) layer[y * farm.w + x] = i;
    });
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.farm.w && y < this.farm.h;
  }

  has(x: number, y: number, bit: number): boolean {
    return this.inside(x, y) && (this.bits[y * this.farm.w + x] & bit) !== 0;
  }

  groundAt(x: number, y: number): Placed | undefined {
    const i = this.inside(x, y) ? this.ground[y * this.farm.w + x] : -1;
    return i >= 0 ? this.placed[i] : undefined;
  }

  topAt(x: number, y: number): Placed | undefined {
    const i = this.inside(x, y) ? this.top[y * this.farm.w + x] : -1;
    return i >= 0 ? this.placed[i] : undefined;
  }

  isFixed(x: number, y: number): boolean {
    return this.inside(x, y) && this.top[y * this.farm.w + x] === -2;
  }

  private itemOf(p: Placed | undefined): PlannerItem | undefined {
    return p && this.items.get(p.id);
  }

  /** ¿Se puede poner `it` con su esquina de arriba a la izquierda en (x, y)? Las reglas de `planner_data.py` y del juego. */
  canPlace(it: PlannerItem, x: number, y: number): boolean {
    if (it.place === "build") {
      const [w, h] = sizeOf(it);
      for (const [tx, ty] of rect(x, y, w, h)) {
        if (!this.has(tx, ty, BUILD) || this.isFixed(tx, ty) || this.groundAt(tx, ty) || this.topAt(tx, ty)) return false;
      }
      return true;
    }
    if (!this.inside(x, y) || this.isFixed(x, y) || this.topAt(x, y)) return false;
    const under = this.itemOf(this.groundAt(x, y));
    switch (it.place) {
      case "hoe":
        return this.has(x, y, HOE) && !under;
      case "floor":
        return this.has(x, y, FLOOR) && !under;
      case "obj":
        // Sobre un piso sí (un aspersor en el camino); sobre un cultivo o un frutal, no.
        if (under && under.place !== "floor") return false;
        return this.has(x, y, OBJ) && !(it.cat === "water" && this.has(x, y, NO_SPRINKLER));
      case "tree":
        return !under && this.has(x, y, TREE) && this.has(x, y, FLOOR) && !this.treeNear(x, y) && !this.treeCrowded(x, y);
    }
  }

  /** `FruitTree.IsTooCloseToAnotherTree`: otro frutal a 2 casillas o menos. */
  private treeNear(x: number, y: number, self?: Placed): boolean {
    for (const [tx, ty] of rect(x - 2, y - 2, 5, 5)) {
      const g = this.groundAt(tx, ty);
      if (g && g !== self && this.itemOf(g)?.place === "tree") return true;
    }
    return false;
  }

  /** `FruitTree.IsGrowthBlocked`: algo en las 8 casillas de alrededor (objeto, piso, cultivo, frutal o edificio). */
  treeCrowded(x: number, y: number, self?: Placed): boolean {
    for (const [tx, ty] of rect(x - 1, y - 1, 3, 3)) {
      if (tx === x && ty === y) continue;
      if (!this.inside(tx, ty) || this.isFixed(tx, ty) || this.topAt(tx, ty)) return true;
      const g = this.groundAt(tx, ty);
      if (g && g !== self) return true;
    }
    return false;
  }
}

/** Las casillas de un rectángulo. */
export function rect(x: number, y: number, w: number, h: number): [number, number][] {
  const out: [number, number][] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
  return out;
}

/** Las casillas que alcanza una cosa colocada en (x, y) (su esquina; la cabaña junimo cuenta desde `tileX+1, tileY+1`). */
export function rangeTiles(it: PlannerItem, x: number, y: number): [number, number][] {
  if (!it.range) return [];
  const [kind, r] = it.range;
  const out: [number, number][] = [];
  if (kind === "sprinkler") {
    if (r === 0) return [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) out.push([x + i, y + j]);
    return out;
  }
  if (kind === "junimo") {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) out.push([x + 1 + i, y + 1 + j]);
    return out;
  }
  for (let j = -r; j <= r; j++)
    for (let i = -r; i <= r; i++) {
      const inside = kind === "circle" ? Math.hypot(i, j) < r : Math.abs(i) + Math.abs(j) <= r;
      if (inside && (i || j || kind === "circle")) out.push([x + i, y + j]);
    }
  return out;
}

/** Las casillas de una recta entre dos casillas, las dos puntas incluidas (Bresenham). */
export function line([x0, y0]: [number, number], [x1, y1]: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

export interface Coverage {
  watered: Set<number>;
  scared: Set<number>;
  /** Cultivos sin riego, sin espantapájaros y frutales que no van a crecer (índices en `placed`). */
  dry: number[];
  exposed: number[];
  blocked: number[];
}

/** Qué riegan los aspersores, qué protegen los espantapájaros y qué quedó afuera. */
export function coverage(board: Board): Coverage {
  const { farm, placed, items } = board;
  const watered = new Set<number>();
  const scared = new Set<number>();
  placed.forEach((p) => {
    const it = items.get(p.id);
    if (!it?.range) return;
    const set = it.cat === "water" ? watered : it.cat === "scare" ? scared : null;
    if (!set) return;
    for (const [x, y] of rangeTiles(it, p.x, p.y)) if (board.inside(x, y)) set.add(y * farm.w + x);
  });
  const dry: number[] = [];
  const exposed: number[] = [];
  const blocked: number[] = [];
  placed.forEach((p, i) => {
    const it = items.get(p.id);
    if (it?.cat === "crop") {
      const k = p.y * farm.w + p.x;
      if (!watered.has(k)) dry.push(i);
      if (!scared.has(k)) exposed.push(i);
    } else if (it?.cat === "tree" && board.treeCrowded(p.x, p.y, p)) {
      blocked.push(i);
    }
  });
  return { watered, scared, dry, exposed, blocked };
}

// --- Cambios ---------------------------------------------------------------------------------------------------

/** Coloca `id` en (x, y) si se puede; si no, devuelve la misma lista. */
export function place(board: Board, id: string, x: number, y: number): Placed[] {
  const it = board.items.get(id);
  if (!it || !board.canPlace(it, x, y)) return board.placed;
  return [...board.placed, { id, x, y }];
}

/** Saca lo de arriba de la casilla, y si no hay nada arriba, lo del suelo. */
export function erase(board: Board, x: number, y: number): Placed[] {
  const hit = board.topAt(x, y) ?? board.groundAt(x, y);
  return hit ? board.placed.filter((p) => p !== hit) : board.placed;
}

// --- La cuenta -------------------------------------------------------------------------------------------------

export interface Line {
  item: PlannerItem;
  n: number;
}

/** Lo colocado agrupado por cosa, en el orden de la barra. */
export function lines(items: PlannerItem[], placed: Placed[]): Line[] {
  const n = new Map<string, number>();
  for (const p of placed) n.set(p.id, (n.get(p.id) ?? 0) + 1);
  return items.filter((it) => n.has(it.id)).map((item) => ({ item, n: n.get(item.id)! }));
}

export interface Totals {
  /** Semillas y retoños. */
  seeds: number;
  /** Obra de los edificios. */
  build: number;
  /** Materiales de lo fabricado y de las obras, sumados, por id. */
  mats: [string, number][];
}

export function totals(list: Line[]): Totals {
  let seeds = 0;
  let build = 0;
  const mats = new Map<string, number>();
  for (const { item, n } of list) {
    if (item.cat === "crop" || item.cat === "tree") seeds += (item.price ?? 0) * n;
    if (item.cat === "building") build += (item.cost ?? 0) * n;
    for (const [m, q] of item.mats ?? []) mats.set(m, (mats.get(m) ?? 0) + q * n);
  }
  return { seeds, build, mats: [...mats].sort((a, b) => b[1] - a[1]) };
}

// --- El enlace -------------------------------------------------------------------------------------------------

/**
 * La granja como texto corto: `farm|season|id:x.y,x.y;id:…` (versión 1). Va comprimido en el hash (`encodePlan`); sin
 * `CompressionStream` va tal cual, en `#t=`.
 */
export function serialize(s: PlanState): string {
  const byId = new Map<string, string[]>();
  for (const p of s.placed) {
    const list = byId.get(p.id) ?? [];
    list.push(`${p.x}.${p.y}`);
    byId.set(p.id, list);
  }
  return ["1", s.farm, String(s.season), [...byId].map(([id, xy]) => `${id}:${xy.join(",")}`).join(";")].join("|");
}

/** Lo contrario de `serialize`: descarta lo que no reconoce (una cosa que ya no existe, una casilla afuera). */
export function deserialize(text: string, data: PlannerData): PlanState | null {
  const [v, farmKey, season, body = ""] = text.split("|");
  if (v !== "1") return null;
  const farm = data.farms.find((f) => f.key === farmKey);
  const sn = Number(season);
  if (!farm || !(sn >= 0 && sn <= 3)) return null;
  const items = new Map(data.items.map((it) => [it.id, it]));
  let board = new Board(farm, items, []);
  for (const group of body ? body.split(";") : []) {
    const cut = group.lastIndexOf(":");
    const id = group.slice(0, cut);
    if (!items.has(id)) continue;
    for (const xy of group.slice(cut + 1).split(",")) {
      const [x, y] = xy.split(".").map(Number);
      if (Number.isInteger(x) && Number.isInteger(y)) board = new Board(farm, items, place(board, id, x, y));
    }
  }
  return { farm: farm.key, season: sn as Season, placed: board.placed };
}

const toB64 = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** El hash del enlace: `p=` comprimido (deflate) si el navegador sabe, `t=` en claro si no. */
export async function encodePlan(s: PlanState): Promise<string> {
  const text = serialize(s);
  if (typeof CompressionStream === "undefined") return `t=${encodeURIComponent(text)}`;
  return `p=${toB64(await pipe(new TextEncoder().encode(text), new CompressionStream("deflate-raw")))}`;
}

export async function decodePlan(hash: string, data: PlannerData): Promise<PlanState | null> {
  const h = hash.replace(/^#/, "");
  try {
    if (h.startsWith("t=")) return deserialize(decodeURIComponent(h.slice(2)), data);
    if (h.startsWith("p=") && typeof DecompressionStream !== "undefined") {
      const bytes = await pipe(fromB64(h.slice(2)), new DecompressionStream("deflate-raw"));
      return deserialize(new TextDecoder().decode(bytes), data);
    }
  } catch {
    return null;
  }
  return null;
}
