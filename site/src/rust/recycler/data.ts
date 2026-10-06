/**
 * Los datos de la pestaña Reciclador de Rust (2026-10-06): lo que da cada objeto (`virtual:rust-recycle`, armado en el
 * build de `items.json`) y la lista de Objetos, que pone el nombre, el slug y el ícono. Bajan juntos una sola vez, como
 * Cajas (`crates/data.ts`); `peekRecycler` devuelve lo que ya llegó para el primer render y el prerender.
 */
import { once } from "../../zomboid/store";
import { loadList, type ListRow } from "../items/data";
import type { RecycleFile } from "./model";

export interface RecyclerData {
  file: RecycleFile;
  known: Map<string, ListRow>;
}

const file = once<RecycleFile>(() => import("virtual:rust-recycle"));
let data: RecyclerData | null = null;
let pending: Promise<RecyclerData> | null = null;

export const peekRecycler = (): RecyclerData | null => data;

export function loadRecycler(): Promise<RecyclerData> {
  pending ??= Promise.all([file.load(), loadList()]).then(
    ([f, list]) => {
      data = { file: f, known: new Map(list.rows.map((r) => [r.id, r])) };
      return data;
    },
    (err) => {
      pending = null;
      throw err;
    },
  );
  return pending;
}
