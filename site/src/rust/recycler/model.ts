/**
 * La pestaña Reciclador de Rust (2026-10-06), sin React: lo que da cada objeto en una recicladora, con las mismas
 * cuentas que el reciclaje de la ficha (`items/recycle.ts`, como `Recycler.RecycleThink` del juego). Los datos llegan del
 * build (`virtual:rust-recycle`, ver vite.config.ts) y la lista de Objetos pone los nombres y los slugs.
 */
import type { ListRow, Recycler, RecyclerKey } from "../items/data";
import { normalize } from "../items/filter";
import { recycleScrap, recycleYield, type RecycleYield } from "../items/recycle";

export interface RecycleFile {
  recyclers: Recycler[];
  /** `amount` es por objeto y al 100 %; `scrap`, la chatarra fija de la receta (`scrapFromRecycle`). */
  rows: { id: string; scrap: number; out: { id: string; amount: number }[] }[];
}

/**
 * La recicladora de entrada: la verde de los monumentos sin la red eléctrica prendida (`green`, tipo 0 de
 * `RecyclerConfig`, ver `RECYCLERS` en extract.py). Es la de siempre: la roja sólo anda con la red de la planta de
 * energía completa, la verde rinde de más sólo mientras su monumento tiene la red prendida, y la amarilla es la de las
 * zonas seguras. Es también la primera columna de "Se obtiene reciclando" en la ficha (`FROM_KEYS` de FichaRecycle.tsx).
 */
export const DEFAULT_RECYCLER: RecyclerKey = "green";

export interface RecycleOut {
  id: string;
  slug: string | null;
  name: { en: string; es: string | null };
  yield: RecycleYield;
}
export interface RecycleRow {
  id: string;
  slug: string;
  name: { en: string; es: string | null };
  /** La chatarra en promedio por objeto, ya escalada a la recicladora. */
  scrap: number;
  /** Lo demás, sin lo que no da nada en esa recicladora (un 0,25 al 40 % es 10 % de uno: eso sí sale). */
  out: RecycleOut[];
}

/**
 * Las filas en una recicladora. La chatarra va aparte (es la fija de la receta y se escala distinto, ver `recycle.ts`).
 * Lo que no tiene ficha va con el shortname de nombre y sin enlace.
 */
export function recycleRows(file: RecycleFile, eff: number, known: ReadonlyMap<string, ListRow>): RecycleRow[] {
  const out: RecycleRow[] = [];
  for (const r of file.rows) {
    const it = known.get(r.id);
    if (!it) continue;
    const outs: RecycleOut[] = [];
    for (const o of r.out) {
      const y = recycleYield(o.amount, eff);
      if (!y.n && !y.pct) continue;
      const k = known.get(o.id);
      outs.push({ id: o.id, slug: k?.slug ?? null, name: k ? { en: k.en, es: k.es } : { en: o.id, es: null }, yield: y });
    }
    out.push({ id: r.id, slug: it.slug, name: { en: it.en, es: it.es }, scrap: recycleScrap(r.scrap, eff), out: outs });
  }
  return out;
}

export type RecycleSort = "scrap" | "name";

/**
 * Busca como la lista de Objetos (nombre inglés, español y shortname, todas las palabras) y ordena: por chatarra, de la
 * que más da a la que menos (lo que se busca: "qué conviene reciclar"), o por nombre en el idioma de la página. A igual
 * chatarra, por nombre.
 */
export function sortRecycleRows(rows: readonly RecycleRow[], sort: RecycleSort, query: string, lang: "en" | "es", locale: string): RecycleRow[] {
  const words = normalize(query).split(" ").filter(Boolean);
  const name = (r: RecycleRow) => (lang === "es" && r.name.es) || r.name.en;
  const hit = words.length
    ? rows.filter((r) => {
        const hay = normalize(`${r.name.en} ${r.name.es ?? ""} ${r.id}`);
        return words.every((w) => hay.includes(w));
      })
    : [...rows];
  const byName = (a: RecycleRow, b: RecycleRow) => name(a).localeCompare(name(b), locale) || a.id.localeCompare(b.id);
  return hit.sort(sort === "scrap" ? (a, b) => b.scrap - a.scrap || byName(a, b) : byName);
}
