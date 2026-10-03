/**
 * Los slugs en español de las fichas de un juego (2026-09-30): `/es/d2r/unicos/la-rechinante` en vez de
 * `/es/d2r/unicos/the-gnasher`, `/es/project-zomboid/objetos/palanca` en vez de `…/objetos/crowbar`. Nació en Diablo II
 * (`d2r/slugs.ts`) y se sacó acá cuando llegó Project Zomboid, que arma los suyos igual.
 *
 * Cada juego los arma en el build, desde el mismo índice de fichas que usan el sitemap y el `<head>`, y los sirve como
 * módulo (`virtual:d2r-slugs-es`, `virtual:pz-slugs-es`, ver `vite.config.ts`). La sección los anota en `route.ts` al
 * cargarse.
 */
import { slugify } from "./route";

/**
 * Por pestaña, id → slug en español. Sólo las fichas cuyo slug cambia: una que no aparece se llama igual en los dos
 * idiomas.
 *
 * `sameSlug` son las pestañas que no se traducen (en Diablo II, las runas, que se llaman igual en los dos idiomas, y
 * los parches, que son un número).
 *
 * `route.ts` traduce el slug en los dos idiomas (`/en/…/objetos/palanca` abre la palanca), así que un slug en español
 * nunca puede ser el inglés de otra ficha de su pestaña: abriría la equivocada. Ni dos fichas pueden compartir uno.
 * En los dos casos la ficha lleva también su id.
 */
export function buildEsSlugs<T extends string>(
  index: readonly { sec: T; id: string; es: string }[],
  sameSlug: readonly T[],
): Partial<Record<T, Record<string, string>>> {
  const bySec = new Map<T, { id: string; es: string }[]>();
  for (const e of index) {
    if (sameSlug.includes(e.sec)) continue;
    const list = bySec.get(e.sec) ?? [];
    list.push({ id: e.id, es: slugify(e.es ?? "") || e.id });
    bySec.set(e.sec, list);
  }
  const out: Partial<Record<T, Record<string, string>>> = {};
  for (const [sec, list] of bySec) {
    const ids = new Set(list.map((e) => e.id));
    const uses = new Map<string, number>();
    for (const e of list) uses.set(e.es, (uses.get(e.es) ?? 0) + 1);
    const map: Record<string, string> = {};
    for (const e of list) {
      // Dos fichas con el mismo nombre en español (Wrath y Temper son las dos "Ira"), o un nombre en español que es el
      // slug inglés de otra ficha: llevan también el inglés, así ninguna dirección abre dos cosas.
      const clash = (uses.get(e.es) ?? 0) > 1 || (e.es !== e.id && ids.has(e.es));
      const slug = clash ? `${e.es}-${e.id}` : e.es;
      if (slug !== e.id) map[e.id] = slug;
    }
    if (Object.keys(map).length) out[sec] = map;
  }
  return out;
}
