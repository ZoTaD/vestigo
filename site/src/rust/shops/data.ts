/**
 * Los datos de la pestaña Tiendas de Rust (2026-10-06): `shops.json` (~2 KB con gzip) y la lista de Objetos, que pone el
 * nombre, el slug y el ícono de cada oferta. Como Cajas (`crates/data.ts`): bajan una sola vez y `peek*` devuelve lo que
 * ya llegó para el primer render y el prerender.
 *
 * Son dos cargas: `loadShopIndex` baja sólo `shops.json` y anota los slugs en español (lo que necesita "Dónde
 * comprarlo" en la ficha de un objeto para enlazar la tienda, sin pagar la lista de Objetos); `loadShops` suma la lista
 * para la pestaña.
 */
import { registerRustSlugs } from "../../route";
import { once } from "../../zomboid/store";
import { loadList, type ListRow } from "../items/data";
import { shopIndex, shopRows, shopSlugsEs, type ShopEntry, type ShopFile, type ShopRow } from "./model";

export interface ShopIndex {
  index: ShopEntry[];
  bySlug: Map<string, ShopEntry>;
  /** Por el nombre en inglés: la ficha de un objeto nombra la tienda, no su clave (`shops` de site_data.py). */
  byName: Map<string, ShopEntry>;
}
export interface Shops extends ShopIndex {
  rows: Map<string, { scrap: ShopRow[]; other: ShopRow[] }>;
  /** Unos íconos por tienda para la lista, sin repetir objeto. */
  preview: Map<string, ListRow[]>;
}

const file = once<ShopFile>(() => import("@rust/shops.json"));
let idx: ShopIndex | null = null;
let idxPending: Promise<ShopIndex> | null = null;
let shops: Shops | null = null;
let pending: Promise<Shops> | null = null;

export const peekShopIndex = (): ShopIndex | null => idx;
export const peekShops = (): Shops | null => shops;

/** Cuántos íconos lleva cada tienda en la lista. */
const PREVIEW = 6;

export function loadShopIndex(): Promise<ShopIndex> {
  idxPending ??= file.load().then(
    (f) => {
      const index = shopIndex(f);
      registerRustSlugs({ shops: shopSlugsEs(index) });
      idx = { index, bySlug: new Map(index.map((e) => [e.slug, e])), byName: new Map(index.map((e) => [e.en, e])) };
      return idx;
    },
    (err) => {
      // Como `once`: un corte de red no deja la pestaña sin datos hasta recargar.
      idxPending = null;
      throw err;
    },
  );
  return idxPending;
}

export function loadShops(): Promise<Shops> {
  pending ??= Promise.all([loadShopIndex(), file.load(), loadList()]).then(
    ([i, f, list]) => {
      const known = new Map<string, ListRow>(list.rows.map((r) => [r.id, r]));
      const rows = shopRows(f, known);
      const preview = new Map<string, ListRow[]>();
      for (const e of i.index) {
        // Lo más caro de lo que se paga con chatarra (el LR-300 y la M39 del Bandit Camp, no los pepinillos), sin repetir
        // objeto: dice de un vistazo para qué se va a cada tienda.
        const ids = [...new Set([...(rows.get(e.key)?.scrap ?? [])].reverse().map((r) => r.item.id))];
        preview.set(e.key, ids.slice(0, PREVIEW).map((id) => known.get(id)).filter((r): r is ListRow => !!r));
      }
      shops = { ...i, rows, preview };
      return shops;
    },
    (err) => {
      pending = null;
      throw err;
    },
  );
  return pending;
}
