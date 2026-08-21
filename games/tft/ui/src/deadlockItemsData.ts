import { useEffect, useReducer } from "react";
import itemsJson from "@deadlock/items.json";
import { useLang, type Lang } from "./i18n";
import { text, type Localized } from "./catalog";
import { catalog, PUBLISHED_BAND, type BandId } from "./deadlockData";

/**
 * La capa de datos de la tier list de ítems.
 *
 * Mismo reparto que `deadlockData.ts` y por los mismos motivos: la banda por
 * defecto viaja en el bundle con un import estático para que el primer dibujo no
 * necesite red, las otras tres son `import()` y Vite las emite como chunks
 * aparte, y **los nombres se resuelven en tiempo de render** y no de import.
 *
 * Lo que cambia es qué significa el número. Acá no hay winrate en pantalla: hay
 * `delta`, que es **cuántos puntos rinde el ítem por encima de lo que rinde su
 * propio precio**. Ver `items.ts` en el pipeline para por qué.
 */

export type Slot = "weapon" | "vitality" | "spirit";

interface RawItem {
  itemId: number;
  /** Compras. El denominador del pickRate; no se muestra. */
  n: number;
  /** Puntos sobre lo que rinde su precio. Es lo que ordena y lo que se muestra. */
  delta: number;
  winRateRaw: number;
  pickRate: number;
  buyMinute: number;
  thinData?: boolean;
}

export interface ItemsFile {
  generatedAt: string;
  band: string;
  patch: { date: string; title: string; link: string };
  provisional?: boolean;
  /** Lo que rinde cada precio. Sin esto el delta no se puede verificar. */
  costBaselines: Record<string, number>;
  matches: number;
  boards: number;
  from: string;
  to: string;
  items: RawItem[];
}

interface CatalogItems {
  items: Record<
    string,
    {
      name: Localized;
      img: string;
      cost: number;
      tier: number;
      slot: Slot;
      types?: string[];
      upgradesTo?: number[];
      upgradesFrom?: number[];
    }
  >;
  /** Los íconos del juego, una vez cada uno. Las stats y los tipos guardan la clave. */
  icons: Record<string, string>;
  /** Las dos texturas de la tarjeta del juego, por categoría. */
  cardArt: Record<string, { head: string; body: string }>;
  /** El símbolo de alma del juego. */
  soulIcon: string;
}

const itemCatalog = catalog as unknown as CatalogItems;

/**
 * Los cuatro precios de la tienda, del más caro al más barato.
 *
 * En ese orden porque es donde elegir bien cambia algo: medido, el encogimiento
 * estimado da k=296 en los de 3200 y k=1225 en los de 800, o sea que entre dos
 * ítems baratos casi no hay diferencia real que encontrar.
 */
export const COSTS = [6400, 3200, 1600, 800] as const;

/**
 * Qué grupos arrancan abiertos.
 *
 * Los dos caros, por lo mismo de arriba: no es "primero los caros", es que ahí
 * está la decisión. De paso la página abre con la mitad de las filas dibujadas.
 */
export const OPEN_COSTS = new Set<number>([6400, 3200]);

/**
 * De `delta` a letra.
 *
 * **Los mismos cuatro cortes para los cuatro precios, y ése es el punto.** El
 * delta ya está medido contra la base de su propio precio, así que una S de 800
 * y una S de 6400 significan lo mismo: rinde más de dos puntos por encima de lo
 * que rinde comprar cualquier cosa a ese precio. Recalcular los cortes por grupo
 * forzaría a cada precio a tener sus propias S y la letra dejaría de comparar.
 *
 * Los números salen de la distribución medida (q1 −1,04, mediana −0,14, q3
 * +0,75), no de elegir redondos y mirar después qué pasa.
 */
export function tierOfDelta(delta: number): string {
  if (delta >= 2) return "S";
  if (delta >= 0.8) return "A";
  if (delta >= -0.3) return "B";
  if (delta >= -1.8) return "C";
  return "D";
}

/**
 * La URL del ícono de una clave del juego, o "" si no la conocemos.
 *
 * Las claves viajan en los datos y las URLs viven una sola vez en el catálogo:
 * son 17 direcciones de ~90 caracteres que aparecen en 958 stats.
 */
export const iconUrl = (key: string | undefined): string =>
  key ? (itemCatalog.icons?.[key] ?? "") : "";

/**
 * Las texturas con las que el juego dibuja la tarjeta de un ítem.
 *
 * **El efecto de esa tarjeta no es un degradado**: son dos imágenes, una para el
 * encabezado y otra para el cuerpo, distintas por categoría. Se llegó mirando con
 * el inspector cómo lo hace tracklock, después de que un degradado CSS quedara
 * parecido pero no igual.
 */
export const cardArt = (slot: Slot): { head: string; body: string } =>
  itemCatalog.cardArt?.[slot] ?? { head: "", body: "" };

/** El símbolo con el que el juego escribe un precio. */
export const soulIcon = (): string => itemCatalog.soulIcon ?? "";

/**
 * El ícono con el que se anuncia un tipo en la fila.
 *
 * **Distinto del ícono de la stat**, y ésa fue la corrección: el de stat va
 * adentro de la tarjeta al lado del número; para decir de un vistazo "esto da
 * espíritu" el juego usa la etiqueta de build, que es el cuadrado de color con
 * el símbolo de la categoría.
 */
export const typeIconUrl = (key: string): string => iconUrl(`tag_${key}`);

/** Un ítem listo para dibujar: los números del pipeline más nombre e imagen. */
export interface Item extends RawItem {
  name: string;
  img: string;
  cost: number;
  slot: Slot;
  tier: string;
  /**
   * Qué da el ítem, por clave de ícono.
   *
   * **No es lo mismo que `slot`.** El slot es el estante de la tienda; esto es lo
   * que el ítem hace. Medido: 57 de los 156 dan más de un tipo, y hay ítems del
   * estante de vitalidad que dan espíritu.
   */
  types: string[];
  /** Los ítems que se construyen a partir de éste, listos para dibujar. */
  upgradesTo: { itemId: number; name: string; img: string; slot: Slot }[];
  /** Los ítems de los que éste se construye. El juego lo llama "mejora de". */
  upgradesFrom: { itemId: number; name: string; img: string; slot: Slot }[];
}

const files = new Map<BandId, ItemsFile>([[PUBLISHED_BAND, itemsJson as unknown as ItemsFile]]);

const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  "phantom-above": () => import("@deadlock/items.phantom-above.json"),
  "archon-oracle": () => import("@deadlock/items.archon-oracle.json"),
  "ritualist-emissary": () => import("@deadlock/items.ritualist-emissary.json"),
  "arcanist-below": () => import("@deadlock/items.arcanist-below.json"),
};

export async function loadItemBand(band: BandId): Promise<void> {
  if (files.has(band)) return;
  const mod = await LOADERS[band]();
  files.set(band, mod.default as ItemsFile);
}

const cache = new Map<string, Item[]>();

/** Ids de ítem a lo mínimo que hace falta para dibujarlos en una lista. */
const resolverIds = (ids: number[] | undefined, lang: Lang) =>
  (ids ?? []).flatMap((id) => {
    const e = itemCatalog.items[String(id)];
    return e ? [{ itemId: id, name: text(e.name, lang, `#${id}`), img: e.img, slot: e.slot }] : [];
  });

/** La lista de una banda, con todo resuelto al idioma pedido. */
export function buildItems(band: BandId, lang: Lang): Item[] {
  const efectiva = files.has(band) ? band : PUBLISHED_BAND;
  const key = `${efectiva}|${lang}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const file = files.get(efectiva)!;
  const built = file.items.flatMap((i) => {
    const entry = itemCatalog.items[String(i.itemId)];
    // Sin entrada en el catálogo no hay ni nombre ni precio, y sin precio no hay
    // grupo donde ponerlo. Sólo puede pasar si el juego suma un ítem entre dos
    // corridas del catálogo, y la fila se omite en vez de dibujarse rota.
    if (!entry) return [];
    return [{
      ...i,
      name: text(entry.name, lang, `#${i.itemId}`),
      img: entry.img,
      cost: entry.cost,
      slot: entry.slot,
      types: entry.types ?? [],
      upgradesTo: resolverIds(entry.upgradesTo, lang),
      upgradesFrom: resolverIds(entry.upgradesFrom, lang),
      tier: tierOfDelta(i.delta),
    }];
  });
  cache.set(key, built);
  return built;
}

export interface ItemsMeta {
  band: BandId;
  items: Item[];
  file: ItemsFile;
}

/* --------------------------------------------------------------------------
   La ficha: que hace el item y que stats da
   -------------------------------------------------------------------------- */

/** Un pedazo de la descripción, ya parseado en el build. Nunca es HTML. */
export interface TextSpan {
  t: string;
  /** La frase que define al ítem. */
  hi?: true;
  /** La aclaración secundaria, que el juego dibuja apagada. */
  dim?: true;
  /** El atributo que nombra, cuando el juego lo etiqueta ("SpiritDamage"). */
  attr?: string;
  /** La clave del ícono de ese atributo. */
  icon?: string;
}

export interface DetailStat {
  label: string;
  value: string;
  unit: string;
  /** Clave del ícono del juego. Se resuelve con `iconUrl`. */
  icon?: string;
  /** True cuando el juego la marca como la línea grande del bloque. */
  big?: true;
}

export interface DetailBlock {
  text: TextSpan[];
  /** Las líneas corridas de arriba. */
  stats: DetailStat[];
  /** Las condicionales, que el juego dibuja en cajas una al lado de la otra. */
  boxed: DetailStat[];
  /** El tiempo de recarga, que va en una pastilla aparte. */
  cooldown?: DetailStat;
}

export interface DetailSection {
  kind: string;
  blocks: DetailBlock[];
}

export interface ItemDetail {
  active?: true;
  sections: DetailSection[];
}

/**
 * Las fichas de los 156 ítems, en los dos idiomas.
 *
 * **Se bajan en el primer clic, no con la página.** Pesan 137 KB contra los 43
 * del catálogo entero, y sólo hacen falta cuando alguien abre un ítem. Es el
 * mismo reparto que las bandas: lo que todos ven viaja en el bundle, lo que
 * algunos abren se pide cuando se abre.
 */
let detail: Record<string, { en: ItemDetail; es: ItemDetail }> | null = null;
let pidiendo: Promise<void> | null = null;

export function loadDetail(): Promise<void> {
  if (detail) return Promise.resolve();
  pidiendo ??= import("@deadlock/items-detail.json").then((m) => {
    detail = m.default as typeof detail;
  });
  return pidiendo;
}

export const detailOf = (itemId: number, lang: Lang): ItemDetail | null =>
  detail?.[String(itemId)]?.[lang] ?? null;

/**
 * La ficha de un ítem, o null mientras se está bajando.
 *
 * Un solo hook para toda la lista y no uno por fila: son 156 filas, y 156
 * efectos esperando el mismo archivo serían 156 suscripciones para un dato que
 * es el mismo. El que abre dispara la carga y avisa cuando llegó.
 */
export function useItemDetail(itemId: number | null): ItemDetail | null {
  const { lang } = useLang();
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (itemId === null || detail) return;
    let alive = true;
    loadDetail()
      .catch(() => undefined)
      .then(() => {
        if (alive) bump();
      });
    return () => {
      alive = false;
    };
  }, [itemId]);

  return itemId === null ? null : detailOf(itemId, lang);
}

/** La mediana de uso, que es el corte vertical de la dispersión. */
export function usageMedian(items: Item[]): number {
  if (items.length === 0) return 0;
  const usos = items.map((i) => i.pickRate).sort((a, b) => a - b);
  return usos[Math.floor(usos.length / 2)];
}

/**
 * En qué cuadrante cae un ítem: lo que rinde contra lo que se lo compra.
 *
 * Los dos que importan son los de las diagonales. **`sleeper`** rinde por encima
 * de su precio y casi nadie lo compra — es plata en el piso. **`trap`** lo compra
 * medio servidor y resta — es el hábito que hay que romper. Los otros dos son la
 * respuesta esperada y no necesitan que nadie los señale.
 *
 * El corte vertical es la mediana de uso de la propia banda y no un número
 * inventado: "poco comprado" sólo significa algo contra lo que se compra ahí.
 */
export type Quadrant = "sleeper" | "trap" | "staple" | "niche";

export function quadrantOf(item: Item, medianUsage: number): Quadrant {
  const rinde = item.delta > 0;
  const popular = item.pickRate >= medianUsage;
  if (rinde) return popular ? "staple" : "sleeper";
  return popular ? "trap" : "niche";
}

export interface ScatterPoint extends Item {
  quadrant: Quadrant;
}

export interface Scatter {
  points: ScatterPoint[];
  medianUsage: number;
  /** Los que la dispersión existe para señalar, ya ordenados. */
  sleepers: ScatterPoint[];
  traps: ScatterPoint[];
}

export function scatterOf(items: Item[]): Scatter {
  const medianUsage = usageMedian(items);
  const points = items.map((i) => ({ ...i, quadrant: quadrantOf(i, medianUsage) }));
  return {
    points,
    medianUsage,
    sleepers: points.filter((p) => p.quadrant === "sleeper").sort((a, b) => b.delta - a.delta),
    traps: points.filter((p) => p.quadrant === "trap").sort((a, b) => a.delta - b.delta),
  };
}

export const SLOTS: Slot[] = ["weapon", "vitality", "spirit"];

export interface ShopCell {
  cost: number;
  slot: Slot;
  /** La ventaja promedio de la celda. */
  delta: number;
  n: number;
}

/**
 * El mapa de la tienda: dónde está el valor, por precio y por categoría.
 *
 * **Se verificó que dice algo antes de dibujarlo.** Comparando las cuatro bandas,
 * 8 de las 12 celdas mantienen el signo, y las 4 que se dan vuelta son justo las
 * que están pegadas a cero — o sea, las celdas que el color pinta fuerte son las
 * que se repiten. La de 3200-vitalidad rinde entre −1,2 y −1,4 en las cuatro
 * bandas; la de 6400-arma es positiva en las cuatro.
 */
export function shopMap(items: Item[]): ShopCell[] {
  const celdas: ShopCell[] = [];
  for (const cost of COSTS) {
    for (const slot of SLOTS) {
      const g = items.filter((i) => i.cost === cost && i.slot === slot);
      if (g.length === 0) continue;
      celdas.push({
        cost,
        slot,
        delta: g.reduce((a, x) => a + x.delta, 0) / g.length,
        n: g.length,
      });
    }
  }
  return celdas;
}

/** La lista de una banda, o null mientras se está bajando. */
export function useItems(band: BandId): ItemsMeta | null {
  const { lang } = useLang();
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (files.has(band)) return;
    let alive = true;
    loadItemBand(band)
      .catch(() => undefined)
      .then(() => {
        if (alive) bump();
      });
    return () => {
      alive = false;
    };
  }, [band]);

  if (!files.has(band)) return null;
  return { band, items: buildItems(band, lang), file: files.get(band)! };
}
