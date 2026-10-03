/**
 * El botín de Project Zomboid para el sitio (2026-10-01), tal como lo escribe `games/zomboid/tools/loot.py`: dónde
 * aparece cada objeto (`loot/items/<NN>.json`, repartido en 100 archivos por el hash del slug, como las fichas) y los
 * nombres que comparten todas las fichas (`loot/common.json`: muebles, partes de vehículos, atuendos, escondites, zonas,
 * los otros cuartos que usan la misma tabla y un edificio de ejemplo por tabla).
 *
 * Nada de esto viaja en el chunk de Objetos: cada archivo es un `import()` aparte, así una ficha baja sólo el suyo
 * (≤ 5 KB con gzip) y los nombres (~10 KB), y la lista no baja ninguno. `load*` pide una sola vez; `peek*` devuelve lo
 * que ya llegó para el primer render y para el prerender, que los espera en `preloadItemsRoute`.
 */
import { routePath, type Route } from "../../route";
import { once, shardedFichas } from "../store";

export type Loc = { en: string; es: string };

/**
 * Una fila de lugar: la clave (la tabla del cuarto, `_all` para "en cualquier lugar sin botín propio", o el escondite),
 * el mueble y la chance de que un mueble de ésos traiga al menos uno con el botín en Normal. La fuerza, si hay, dice que
 * sólo sale con una condición: `t` (sólo en algunos muebles), `r` (si el edificio tiene cierto cuarto), `i` (junto a
 * ciertos objetos) o `z:<zona>` (sólo en esa zona del mapa).
 */
export type LootRow = [key: string, cont: string, p: number, force?: string];

export interface ItemLoot {
  /** Hasta 10 habitaciones, cada una con su mejor mueble, de la chance más alta a la más baja. */
  rooms: LootRow[];
  /** En cuántas habitaciones aparece en total (las de `rooms` y las que no entraron). */
  nRooms: number;
  stash?: LootRow[];
  /** `m` y `f`: cualquier zombi hombre o mujer; `outfits`, los atuendos que lo traen (hasta 8). */
  zombie?: { m: number; f: number; outfits: [outfit: string, p: number][]; nOutfits: number };
  /** Hasta 5 vehículos, cada uno con su mejor parte. */
  vehicles?: [group: string, part: string, p: number][];
  nVehicles?: number;
  /** Los bolsos y cajas que lo pueden traer adentro, con su ficha. */
  bags?: [bag: { id: string; en: string; es: string; icon: string | null }, p: number][];
}

export interface LootCommon {
  containers: Record<string, Loc>;
  parts: Record<string, Loc>;
  vehicles: Record<string, Loc>;
  outfits: Record<string, Loc>;
  stashes: Record<string, Loc>;
  zones: Record<string, Loc>;
  /** Tabla → los otros cuartos del mapa que la usan tal cual (`mechanic: ["garage"]`). */
  aliases: Record<string, string[]>;
  /** Tabla → cuántas habitaciones del mapa la usan y un edificio de ejemplo (`[id, x, y]`, cerca de Muldraugh). */
  spots: Record<string, { n: number; at?: [building: string, x: number, y: number] }>;
}

// Los `import()` van escritos acá para que Vite los vea y arme un chunk por archivo (ver `store.ts`).
const items = shardedFichas<ItemLoot>(import.meta.glob<{ default: Record<string, ItemLoot> }>("@zomboid/loot/items/*.json"));
const common = once<LootCommon>(() => import("@zomboid/loot/common.json"));

/** Dónde aparece un objeto si su archivo ya llegó: `undefined` si todavía no, `null` si no aparece en ningún lado. */
export const peekItemLoot = (slug: string): ItemLoot | null | undefined => items.peek(slug);
export const loadItemLoot = (slug: string): Promise<ItemLoot | null> => items.load(slug);

// Los nombres de los cuartos que sólo llenan botín (`map/lootRoomNames.ts`) viajan en su propio chunk, con `common`: la
// hoja los necesita siempre juntos, y así no engordan ni la pestaña Objetos ni la hoja del edificio del Mapa.
const roomNames = once<Record<string, [string, string]>>(() => import("../map/lootRoomNames"));

/** Los nombres de los cuartos del botín, si ya llegaron (con `common`, que se pide siempre junto). */
export const peekLootRoomNames = (): Record<string, [string, string]> | null => roomNames.peek();
/**
 * `common` sólo cuando también llegaron los nombres de los cuartos: la hoja nunca se dibuja con uno sin el otro. Por eso
 * hay que pedirlos con `loadLootCommon` (los dos juntos); con `common.load()` solo, esto devolvería `null` para siempre.
 */
export const peekLootCommon = (): LootCommon | null => (roomNames.peek() ? common.peek() : null);
export const loadLootCommon = async (): Promise<LootCommon> => (await Promise.all([common.load(), roomNames.load()]))[0];

/** La dirección del Mapa en el idioma de la página: la misma ruta con la pestaña Mapa, sin ficha. */
const mapPath = (route: Route): string => routePath({ ...route, view: "zomboid", pzSection: "map", detail: undefined });

/**
 * El Mapa mirando un edificio de ejemplo, con su hoja abierta (`edificio=`). Zoom 5: se ve la manzana y el edificio
 * entero, que es lo que sirve para ubicarlo. El Mapa lee la query al cargarse.
 */
export function mapLink(route: Route, at: [string, number, number]): string {
  const [id, x, y] = at;
  return `${mapPath(route)}?x=${x}&y=${y}&z=5&edificio=${id}`;
}

/** El Mapa con la capa de escondites prendida: ahí se ve dónde está cada uno, que es lo que la ficha no puede decir. */
export function stashesLink(route: Route): string {
  return `${mapPath(route)}?capas=escondites`;
}
