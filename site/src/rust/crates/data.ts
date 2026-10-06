/**
 * Los datos de la pestaña Cajas de Rust (2026-10-06): `loot.json` entero (~16 KB con gzip) y la lista de Objetos, que
 * pone el nombre, el slug y el ícono de cada fila. Bajan juntos una sola vez, como la lista de Objetos (`once` de
 * `zomboid/store.ts`); `peekCrates` devuelve lo que ya llegó para el primer render y el prerender.
 *
 * Al llegar se anotan los slugs en español de las fichas: hasta entonces `/es/rust/cajas/caja-de-elite` no se puede
 * traducir, por eso `Rust.tsx` los pide antes de leer la dirección de nuevo.
 */
import { registerRustSlugs } from "../../route";
import { once } from "../../zomboid/store";
import { loadList, type ListRow } from "../items/data";
import { crateIndex, crateRows, crateSlugsEs, type CrateEntry, type CrateRow, type LootFile } from "./model";

export interface Crates {
  index: CrateEntry[];
  bySlug: Map<string, CrateEntry>;
  /** Por la clave de la fuente (`elite`), para enlazarla desde la ficha de un objeto. */
  byKey: Map<string, CrateEntry>;
  rows: Map<string, CrateRow[]>;
  /** La lista de Objetos por shortname: el enlace al objeto que se abre (un regalo, una bolsa). */
  items: Map<string, ListRow>;
}

const loot = once<LootFile>(() => import("@rust/loot.json"));
let crates: Crates | null = null;
let pending: Promise<Crates> | null = null;

export const peekCrates = (): Crates | null => crates;

export function loadCrates(): Promise<Crates> {
  pending ??= Promise.all([loot.load(), loadList()]).then(
    ([file, list]) => {
      const items = new Map<string, ListRow>(list.rows.map((r) => [r.id, r]));
      const rows = crateRows(file, items);
      const index = crateIndex(file, rows);
      registerRustSlugs({ crates: crateSlugsEs(index) });
      crates = { index, bySlug: new Map(index.map((e) => [e.slug, e])), byKey: new Map(index.map((e) => [e.key, e])), rows, items };
      return crates;
    },
    (err) => {
      // Como `once`: un corte de red no deja la pestaña sin datos hasta recargar.
      pending = null;
      throw err;
    },
  );
  return pending;
}
