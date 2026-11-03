/**
 * Ordenar una tabla de CS2 tocando su encabezado (2026-11-03, pedido de ZoTaD: "no puedo apretar para ver cuál es la
 * más cara"). Tocar la misma columna invierte el orden; una columna nueva arranca por lo más alto (o por la A si es
 * texto). Lo que no tiene valor (un desgaste que la skin no alcanza, un precio que falta) va siempre al final.
 */
import { useState, type ReactNode } from "react";

export type Sort<K extends string> = { key: K; dir: 1 | -1 };
type Val = string | number | null | undefined;

export function sortRows<T, K extends string>(rows: readonly T[], cols: Record<K, (r: T) => Val>, s: Sort<K>): T[] {
  const get = cols[s.key];
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return (typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number)) * s.dir;
  });
}

export const nextSort = <K extends string>(s: Sort<K>, key: K, text = false): Sort<K> =>
  s.key === key ? { key, dir: (-s.dir as 1 | -1) } : { key, dir: text ? 1 : -1 };

/**
 * El estado del orden de una tabla y el encabezado que lo cambia: `th(clave, rótulo)` devuelve el `<th>` con su botón.
 * Es una función y no un componente, así un clic no remonta el encabezado (y el foco del teclado se queda donde estaba).
 * `text`: las columnas que se ordenan de la A a la Z.
 */
export function useSort<K extends string>(init: Sort<K>, text: readonly K[] = []) {
  const [sort, setSort] = useState<Sort<K>>(init);
  const th = (k: K, children: ReactNode, extra?: { title?: string; className?: string }) => {
    const on = sort.key === k;
    return (
      <th key={k} aria-sort={on ? (sort.dir > 0 ? "ascending" : "descending") : "none"} title={extra?.title} className={extra?.className}>
        <button type="button" className={`c2-sort${on ? " is-on" : ""}`} onClick={() => setSort((s) => nextSort(s, k, text.includes(k)))}>
          {children}
          <span className="c2-sort-i" aria-hidden="true">
            {on ? (sort.dir > 0 ? "↑" : "↓") : "↕"}
          </span>
        </button>
      </th>
    );
  };
  return { sort, th };
}
