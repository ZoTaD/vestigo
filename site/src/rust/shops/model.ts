/**
 * La pestaña Tiendas de Rust (2026-10-06), sin React ni `import()`: de `shops.json` (`NPCVendingOrder` del juego) y de
 * la lista de Objetos salen las cinco tiendas de NPC (Outpost, Bandit Camp, el poblado pesquero, el rancho y el granero),
 * con su slug en cada idioma y cuántas ofertas tienen, y las filas de cada una. Lo usan la pestaña (`data.ts`), la
 * ficha de un objeto (para enlazar "Dónde comprarlo") y el build (`vite.config.ts`: sitemap, slugs en español, `<head>`),
 * así las cuentas no se separan.
 */
import { slugify } from "../../route";
import type { ListRow, Loc } from "../items/data";

export interface ShopOrder {
  shop: string;
  /** Lo que se recibe: shortname y cuántos. */
  item: string;
  amount: number;
  bp: boolean;
  /** Con qué se paga (un shortname: casi siempre `scrap`) y cuánto. */
  currency: string;
  price: number;
}
export interface ShopFile {
  shops: Record<string, { en: string; es: string }>;
  orders: ShopOrder[];
}

export interface ShopEntry {
  key: string;
  en: string;
  es: string;
  slug: string;
  slugEs: string;
  /** Cuántas ofertas tiene (una tienda puede vender el mismo objeto en dos tandas: piedra por chatarra y por madera). */
  n: number;
  /** Si alguna oferta es un plano. */
  bp: boolean;
}

/** Un objeto de una oferta, ya con su nombre y slug de la lista de Objetos. */
export interface ShopRef {
  id: string;
  slug: string;
  name: Loc;
}
export interface ShopRow {
  item: ShopRef;
  amount: number;
  bp: boolean;
  currency: ShopRef;
  price: number;
}

/** La moneda de casi todas las ofertas: las que cobran en chatarra van en su propia tabla, ordenadas por precio. */
export const SCRAP = "scrap";

/**
 * Las tiendas en el orden del archivo (las dos zonas seguras primero, que es lo que más se busca). El slug sale del
 * nombre en cada idioma (`bandit-camp`, `campamento-de-bandoleros`); si dos tiendas dieran el mismo, suman la clave.
 */
export function shopIndex(file: ShopFile): ShopEntry[] {
  const keys = Object.keys(file.shops);
  const taken = new Map<string, number>();
  for (const k of keys) taken.set(slugify(file.shops[k].en), (taken.get(slugify(file.shops[k].en)) ?? 0) + 1);
  return keys.map((key) => {
    const s = file.shops[key];
    const tail = (taken.get(slugify(s.en)) ?? 0) > 1 ? `-${slugify(key)}` : "";
    const own = file.orders.filter((o) => o.shop === key);
    return { key, en: s.en, es: s.es, slug: slugify(s.en) + tail, slugEs: slugify(s.es || s.en) + tail, n: own.length, bp: own.some((o) => o.bp) };
  });
}

/** Los slugs en español que cambian, para `registerRustSlugs({ shops })`. */
export const shopSlugsEs = (index: readonly ShopEntry[]): Record<string, string> =>
  Object.fromEntries(index.filter((e) => e.slugEs !== e.slug).map((e) => [e.slug, e.slugEs]));

/** El nombre de una tienda en el idioma de la página. */
export const shopName = (e: Pick<ShopEntry, "en" | "es">, lang: "en" | "es"): string => (lang === "es" && e.es) || e.en;

/**
 * Las ofertas de cada tienda, sólo con objetos que tienen ficha (hoy son todos; uno que el juego retire saldría con el
 * id crudo de nombre), partidas en dos: las que se pagan con chatarra y las que se pagan con otra cosa (vender pescado,
 * flores o tela a cambio de chatarra, cambiar madera por piedra).
 *
 * Las de chatarra van de la más barata a la más cara: todas cobran en la misma moneda, así que el precio se compara de
 * verdad y es lo que se mira con la chatarra contada ("¿qué me alcanza?"); a igual precio, por nombre. Las otras cobran
 * cada una en una moneda distinta y su precio no se compara entre filas: van agrupadas por lo que se paga (el pescado
 * con el pescado) y, adentro, por lo que se recibe y la cantidad.
 */
export function shopRows(file: ShopFile, known: ReadonlyMap<string, ListRow>): Map<string, { scrap: ShopRow[]; other: ShopRow[] }> {
  const ref = (id: string): ShopRef | null => {
    const r = known.get(id);
    return r ? { id, slug: r.slug, name: { en: r.en, es: r.es } } : null;
  };
  const out = new Map<string, { scrap: ShopRow[]; other: ShopRow[] }>(Object.keys(file.shops).map((k) => [k, { scrap: [], other: [] }]));
  for (const o of file.orders) {
    const item = ref(o.item);
    const currency = ref(o.currency);
    const box = out.get(o.shop);
    if (!item || !currency || !box) continue;
    (o.currency === SCRAP ? box.scrap : box.other).push({ item, amount: o.amount, bp: o.bp, currency, price: o.price });
  }
  const byName = (a: ShopRef, b: ShopRef) => a.name.en.localeCompare(b.name.en, "en") || a.id.localeCompare(b.id);
  for (const { scrap, other } of out.values()) {
    scrap.sort((a, b) => a.price - b.price || byName(a.item, b.item) || a.amount - b.amount);
    other.sort((a, b) => byName(a.currency, b.currency) || byName(a.item, b.item) || a.amount - b.amount || a.price - b.price);
  }
  return out;
}
