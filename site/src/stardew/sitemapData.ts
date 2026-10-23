/**
 * Lo que el sitemap y el prerender necesitan de Stardew Valley (2026-10-22), armado de los archivos que escribe
 * `games/stardew/tools/site_data.py`: `meta.json`, la lista (`site/list.json`) con sus nombres en cada idioma, los
 * aldeanos (`villagers.json`) y los monstruos de Minas y combate (`mines.json`, de `mines_data.py`). Lo llaman el build (`readSitemapData` en vite.config.ts) y los tests, así los dos leen
 * igual.
 *
 * De paso anota en `route.ts` los slugs en español de objetos, aldeanos y monstruos (sólo los que cambian), para que el sitemap y
 * el prerender escriban las direcciones en español.
 */
import { registerStardewSlugs } from "../route";
import type { StardewSitemapData } from "../sitemap";

type Meta = { version: string; generatedAt: string };
/** Una fila de `list.json`: id, slug inglés, categoría, precio, ancho y alto del sprite, banderas (`HAS` de data.ts). */
type Row = [id: string, slug: string, cat: number, price: number, w: number, h: number, has: number];
type Villager = { slug: string; slugEs: string; name: [en: string, es: string] };
/** Un monstruo de `mines.json`: lo mismo que un aldeano. */
type Monster = Villager;

export function stardewSitemapData(
  meta: Meta,
  rows: Row[],
  namesEn: string[],
  namesEs: [name: string, slug: string][],
  villagers: Villager[],
  monsters: Monster[] = [],
): StardewSitemapData {
  const changed = (list: Villager[]) => Object.fromEntries(list.filter((v) => v.slugEs !== v.slug).map((v) => [v.slug, v.slugEs]));
  registerStardewSlugs({
    items: Object.fromEntries(rows.flatMap((r, i) => (namesEs[i][1] !== r[1] ? [[r[1], namesEs[i][1]]] : []))),
    villagers: changed(villagers),
    mines: changed(monsters),
  });
  return {
    version: meta.version,
    generatedAt: meta.generatedAt,
    items: rows.map((r, i) => ({ slug: r[1], en: namesEn[i], es: namesEs[i][0], has: r[6] })),
    villagers: villagers.map((v) => ({ slug: v.slug, en: v.name[0], es: v.name[1] || v.name[0] })),
    monsters: monsters.map((m) => ({ slug: m.slug, en: m.name[0], es: m.name[1] || m.name[0] })),
  };
}
