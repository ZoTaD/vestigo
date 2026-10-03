/**
 * El buscador del Mapa de Project Zomboid (2026-09-30, Task 4): calles, pueblos, escondites, edificios con nombre e
 * historias, con `search.json` de `map.py` (`{ k, en, es, x, y }` por cosa; el contrato está en `write_web`).
 *
 * Este módulo entero (la lógica y `search.json`, 99 KB crudo) no viaja con la pestaña: `MapSearch.tsx` lo pide con
 * `import()` recién cuando alguien entra al buscador, así el chunk de la pestaña lleva sólo el renglón y la lista. Se
 * prueba en `test/zomboidMapSearch.test.ts`.
 *
 * **El orden**: primero lo que es igual a lo escrito, después lo que empieza así y al final lo que lo contiene (en
 * cada grupo, la palabra entera antes que el pedazo de una palabra). Se busca en los dos idiomas (alguien en la página
 * en español escribe "Fallas Lake" porque así se llama en su partida en inglés) y se muestra el nombre del idioma de la
 * página. Dentro de cada grupo van primero los pueblos y los edificios, que es lo que más se busca, y después lo más
 * corto: escribiendo "main" se quiere Main St antes que una calle larga.
 */
import entries from "@zomboid/map/web/search.json";
import type { Lang } from "../../i18n";
import { fold } from "../ui";

export type SearchKind = "town" | "building" | "story" | "street" | "stash";

export interface SearchEntry {
  k: SearchKind;
  en: string;
  es: string;
  x: number;
  y: number;
}

export interface SearchHit extends SearchEntry {
  /** El nombre en el idioma de la página. */
  label: string;
  /** El zoom al que va el mapa al elegirlo (`SEARCH_ZOOM` de su clase). */
  z: number;
}

/** Todo lo que se puede buscar, de `search.json`. */
export const SEARCH_INDEX = entries as SearchEntry[];

/** El orden de las clases cuando empatan: lo que se busca más seguido, primero. */
const KIND_ORDER: Record<SearchKind, number> = { town: 0, building: 1, story: 2, street: 3, stash: 4 };

/**
 * El zoom al que va el mapa al elegir cada clase: el pueblo entero (2,5), la calle con sus cuadras (4), y un edificio,
 * una historia o un escondite de cerca, como para tocarlo (5).
 */
export const SEARCH_ZOOM: Record<SearchKind, number> = { town: 2.5, street: 4, building: 5, story: 4.5, stash: 5 };

/** El texto para comparar: el mismo `fold` que las listas de las otras pestañas. */
export const normalize = fold;

/**
 * 0 si es igual, 1 si empieza así, 2 si lo contiene; `null` si no. Dentro del prefijo y del "contiene", medio punto
 * menos si lo escrito es una palabra entera o el comienzo de una: "main" pone Main St antes que Mainland Bank, y "bank"
 * pone Knox Bank antes que Embankment Rd.
 */
function tier(name: string, q: string): number | null {
  if (name === q) return 0;
  const wordEnd = (at: number) => at >= name.length || name[at] === " ";
  if (name.startsWith(q)) return wordEnd(q.length) ? 1 : 1.5;
  if (name.includes(` ${q}`)) return 2;
  return name.includes(q) ? 2.5 : null;
}

/**
 * Lo que coincide con `query`, en orden y como mucho `limit`. Con menos de dos letras no se busca nada: con una sola
 * coincide medio mapa y la lista no ayuda.
 */
export function searchMap(entries: readonly SearchEntry[], query: string, lang: Lang, limit = 8): SearchHit[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const hits: { e: SearchEntry; t: number; label: string }[] = [];
  for (const e of entries) {
    const label = lang === "es" ? e.es : e.en;
    const mine = tier(normalize(label), q);
    const other = tier(normalize(lang === "es" ? e.en : e.es), q);
    const t = mine === null ? other : other === null ? mine : Math.min(mine, other);
    if (t !== null) hits.push({ e, t, label });
  }
  hits.sort(
    (a, b) =>
      a.t - b.t ||
      KIND_ORDER[a.e.k] - KIND_ORDER[b.e.k] ||
      a.label.length - b.label.length ||
      a.label.localeCompare(b.label, lang),
  );
  return hits.slice(0, limit).map(({ e, label }) => ({ ...e, label, z: SEARCH_ZOOM[e.k] }));
}
