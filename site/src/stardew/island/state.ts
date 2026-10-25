/**
 * La Isla Jengibre de Stardew Valley (etapa 4, tarea 8): la forma de `island.json` (`games/stardew/tools/island_data.py`),
 * la vista que se elige en la pestaña y cómo viaja en la dirección (`?v=qi`), y las cuentas del checklist de las 130
 * nueces doradas.
 *
 * Lo tildado se guarda en el navegador con la clave `sdv-nuts-v1` (`checklist.ts`): cada clave es la del juego
 * ("Darts") y vale `true` (la fila entera) o, en las de caída limitada traídas de una partida a medias, cuántas lleva
 * (`{"VolcanoBarrel": 2}`). El ancla de cada fila es su slug; la de cada zona, su clave en minúsculas (`#volcano`).
 */
import type { Marks } from "../checklist";

type Pair = [en: string, es: string];
/** Un objeto nombrado, igual que `Ref` de data.ts: slug, slug en español, nombres y tamaño del sprite. */
type Ref = [slug: string, slugEs: string, en: string, es: string, w: number, h: number];

export interface Area {
  key: string;
  name: Pair;
}

export interface Nut {
  /** La clave del juego (`collectedNutTracker`, `limitedNutDrops`, o `GoldenCoconut`). */
  key: string;
  slug: string;
  area: string;
  /** Cuántas nueces da la fila. */
  n: number;
  kind: "bush" | "buried" | "puzzle" | "limited" | "event";
  /** Cómo se lee en la partida: una clave de `collectedNutTracker`, una cantidad de `limitedNutDrops` o el coco. */
  track: "collected" | "limited" | "coconut";
  text: Pair;
  /** La casilla del mapa, en arbustos y enterradas. */
  tile?: [x: number, y: number];
}

export interface Upgrade {
  key: string;
  slug: string;
  name: Pair;
  /** En nueces. */
  cost: number;
  area: string;
  /** La carta que deja al hacerse: así se lee en la partida. */
  mail: string;
  /** Las mejoras (claves) que pide antes. */
  needs: string[];
  /** Lo que pide además, en palabras (el puente del volcán). */
  needsText: Pair | null;
}

export interface ShopItem {
  id: string;
  slug: string;
  name: Pair;
  recipe: boolean;
  /** En gemas Qi; null en la gema Qi, que se paga con `walnuts` nueces. */
  gems: number | null;
  walnuts?: number;
  /** La condición de la venta ("El primero", "Una sola vez"). */
  note: Pair | null;
  /** Sin ficha de Objetos (muebles, el sombrero, la Llave de la ciudad): el tamaño de su dibujo. */
  sprite?: [w: number, h: number];
}

export interface QiOrder {
  key: string;
  slug: string;
  name: Pair;
  /** Lo que dice Qi. */
  text: Pair;
  /** Los objetivos, en una frase. */
  goal: Pair;
  gems: number;
  days: number;
  /** false: el juego no lo ofrece nunca (`NOT_IMPLEMENTED`); no se muestra. */
  inGame: boolean;
}

export interface IslandData {
  total: number;
  areas: Area[];
  nuts: Nut[];
  upgrades: Upgrade[];
  walnutRoom: ShopItem[];
  qiOrders: QiOrder[];
  refs: Record<string, Ref>;
}

/** La clave del checklist en el navegador. */
export const ISLAND_KEY = "sdv-nuts-v1";
/** El total que cuenta el juego (`IslandHut.TOTAL_WALNUTS`). */
export const TOTAL_NUTS = 130;
/** Los ids de la nuez dorada y la gema Qi, para sus dibujos. */
export const WALNUT_ID = "73";
export const QI_GEM_ID = "858";

// --- La vista y la dirección ------------------------------------------------------------------------------------

export const ISLAND_VIEWS = ["nuts", "upgrades", "walnut-room", "qi"] as const;
export type IslandView = (typeof ISLAND_VIEWS)[number];
export const DEFAULT_ISLAND_VIEW: IslandView = "nuts";

/** La vista escrita en la dirección (`?v=qi`); lo que no se conoce, las Nueces. */
export function readIslandView(search: string): IslandView {
  const v = new URLSearchParams(search).get("v");
  return (ISLAND_VIEWS as readonly string[]).includes(v ?? "") ? (v as IslandView) : DEFAULT_ISLAND_VIEW;
}
/** Lo contrario: `?v=…`, vacío en la vista por defecto. */
export const writeIslandView = (v: IslandView): string => (v === DEFAULT_ISLAND_VIEW ? "" : `?v=${v}`);

/** El ancla de una zona: su clave en minúsculas. */
export const areaAnchor = (a: Area | string): string => (typeof a === "string" ? a : a.key).toLowerCase();

/** La vista donde está un ancla, para un enlace que llega sin `?v=`; null si el ancla no es de ninguna fila. */
export function viewOfAnchor(data: IslandData, anchor: string): IslandView | null {
  if (!anchor) return null;
  if (data.areas.some((a) => areaAnchor(a) === anchor) || data.nuts.some((n) => n.slug === anchor)) return "nuts";
  if (data.upgrades.some((u) => u.slug === anchor)) return "upgrades";
  if (data.walnutRoom.some((w) => w.slug === anchor)) return "walnut-room";
  if (data.qiOrders.some((q) => q.inGame && q.slug === anchor)) return "qi";
  return null;
}

// --- El checklist -----------------------------------------------------------------------------------------------

/** Cuántas nueces de la fila están tildadas: `true` es la fila entera; un número, eso (entre 0 y `n`). */
export function nutGot(nut: Nut, marks: Marks): number {
  const v = marks[nut.key];
  if (v === true) return nut.n;
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.min(nut.n, Math.max(0, Math.floor(v)));
}

/** Las nueces tildadas de las 130, y por zona [halladas, total] en el orden de las zonas. Ignora claves que no son filas. */
export function nutCount(data: IslandData, marks: Marks): { found: number; total: typeof TOTAL_NUTS; byArea: Record<string, [found: number, total: number]> } {
  const byArea: Record<string, [number, number]> = Object.fromEntries(data.areas.map((a) => [a.key, [0, 0]]));
  let found = 0;
  for (const nut of data.nuts) {
    const got = nutGot(nut, marks);
    const a = (byArea[nut.area] ??= [0, 0]);
    a[0] += got;
    a[1] += nut.n;
    found += got;
  }
  return { found, total: TOTAL_NUTS, byArea };
}

/** Tocar una fila: si estaba completa se destilda; si no (vacía o a medias), queda completa. Sin tocar el original. */
export function toggleNut(marks: Marks, nut: Nut): Marks {
  const { [nut.key]: _antes, ...rest } = marks;
  return nutGot(nut, marks) >= nut.n ? rest : { ...rest, [nut.key]: true };
}

/**
 * Las nueces de una partida (`Save.nuts`) como marcas del checklist: una clave de `collectedNutTracker` o el coco
 * completan su fila (el esqueleto grande da 6 con una sola clave); una de caída limitada, si llegó a su `n`, y si no
 * queda a medias con lo que lleva. Sólo las claves que son filas.
 */
export function nutsFromSave(saved: Readonly<Record<string, number>>, data: IslandData): Marks {
  const out: Marks = {};
  for (const nut of data.nuts) {
    const v = saved[nut.key];
    if (!v || v <= 0) continue;
    if (nut.track !== "limited" || v >= nut.n) out[nut.key] = true;
    else out[nut.key] = Math.floor(v);
  }
  return out;
}

/** Junta dos listas de marcas quedándose con lo más avanzado de cada clave: traer la partida nunca destilda. */
export function mergeMarks(a: Marks, b: Marks): Marks {
  const out: Marks = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const old = out[k];
    if (old === true) continue;
    out[k] = v === true || typeof old !== "number" ? v : Math.max(old, v);
  }
  return out;
}

/**
 * ¿Es una de las nueces de frase genérica ("Arbusto escondido en el norte (casilla 4, 42)")? Esas se dibujan juntas,
 * como casilleros chicos con su casilla, debajo de las de frase propia. Se reconocen por la frase en inglés que arma
 * `_arbusto` / `_enterrada` en `island_data.py`.
 */
export const isGenericNut = (n: Nut): boolean => !!n.tile && /^(Hidden bush|Buried) in the (north|west) \(tile \d+, \d+\)/.test(n.text[0]);

// --- Mejoras y pedidos ------------------------------------------------------------------------------------------

/** Las mejoras del loro en el orden de las zonas (y, dentro de una zona, en el del dato). */
export function upgradesInOrder(data: IslandData): Upgrade[] {
  const rank = new Map(data.areas.map((a, i) => [a.key, i]));
  return data.upgrades.map((u, i) => [u, i] as const).sort(([a, i], [b, j]) => (rank.get(a.area) ?? 99) - (rank.get(b.area) ?? 99) || i - j).map(([u]) => u);
}

/** Las mejoras hechas según el correo de una partida (cada una deja su carta). */
export function upgradesDone(mail: Iterable<string>, data: IslandData): Set<string> {
  const got = new Set(mail);
  return new Set(data.upgrades.filter((u) => got.has(u.mail)).map((u) => u.key));
}

/** Los pedidos de Qi que el juego ofrece. */
export const shownOrders = (data: IslandData): QiOrder[] => data.qiOrders.filter((q) => q.inGame);
