/**
 * La isla de datos de la ficha de un jefe (2026-09-29): las listas de siempre (Infierno, 300% de hallazgo mágico, 1 jugador)
 * que el prerender deja escritas en el HTML, dentro de un `<script type="application/json">`.
 *
 * Calcular esas listas cuesta 110 a 220 ms en escritorio y de medio segundo a uno en un celular de gama media, y la ficha es
 * la página a la que llega quien busca "qué suelta Mefisto". La app no hidrata: `createRoot` reemplaza el HTML prerenderizado,
 * pero recién al terminar el primer render, así que durante ese render la isla sigue en el documento y la ficha la lee en vez de
 * volver a calcular.
 */
import type { DropLine, DropLists } from "./places";

export const ISLAND_ID = "d2-src-lists";

type Compact = { r: [string, number][]; u: [string, number][]; s: [string, number][] };

/**
 * Las listas en forma compacta: las runas como [código, chance] y los únicos y las piezas como [id, chance]. Los números van
 * como los escribe JSON, que al leerlos da exactamente los mismos. El `<` va escapado: la isla vive dentro de un `<script>`,
 * y un "</script>" en el texto la cortaría.
 */
export function islandText(lists: DropLists): string {
  const pair = (l: DropLine): [string, number] => [l.target.k === "b" ? l.target.code : l.target.id, l.p];
  const compact: Compact = { r: lists.runes.map(pair), u: lists.uniques.map(pair), s: lists.sets.map(pair) };
  return JSON.stringify(compact).replace(/</g, "\\u003c");
}

/** Las listas de una isla, o null si no se puede leer (entonces la ficha calcula). */
export function parseIsland(text: string): DropLists | null {
  try {
    const x = JSON.parse(text) as Compact;
    return {
      runes: x.r.map(([code, p]) => ({ target: { k: "b", code }, p })),
      uniques: x.u.map(([id, p]) => ({ target: { k: "u", id }, p })),
      sets: x.s.map(([id, p]) => ({ target: { k: "s", id }, p })),
    };
  } catch {
    return null;
  }
}

/**
 * La isla que dejó el prerender para este jefe, si está en el documento (sólo durante el primer render del navegador). Otra
 * página no la tiene, y la de otro jefe no vale: lleva su id en `data-key`.
 */
export function readIsland(id: string): DropLists | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById(ISLAND_ID);
  return el && el.getAttribute("data-key") === id ? parseIsland(el.textContent ?? "") : null;
}
