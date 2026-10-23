/**
 * Lo que la portada de Stardew Valley baja aparte de su chunk (2026-10-22). `home.json` sólo trae ids (los 12
 * destacados) y claves de aldeanos (los cumpleaños); los nombres y los slugs salen de la lista de objetos, de los nombres
 * del idioma que se lee y de `villagers.json`. Son los mismos archivos que van a usar Objetos y Aldeanos, así que la
 * segunda pestaña ya los encuentra bajados. Al llegar, se anotan los slugs en español en `route.ts`.
 *
 * Nunca en el chunk del área: cada JSON es un `import()` aparte (regla 4 de CLAUDE.md).
 */
import { registerStardewSlugs } from "../route";

type Lang = "en" | "es";
/** Una fila de `list.json`: id, slug inglés, categoría, precio base, ancho y alto del sprite, banderas de fuentes. */
type ListRow = [id: string, slug: string, cat: number, price: number, w: number, h: number, has: number];
type Villager = { key: string; slug: string; slugEs: string; name: [string, string] };

/** Un objeto de la portada, con su nombre en el idioma pedido. */
export interface HomeItem {
  id: string;
  slug: string;
  name: string;
  price: number;
  w: number;
  h: number;
}
/** Un aldeano de la portada, por su clave del juego (`Abigail`, `Wizard`). */
export interface HomeVillager {
  key: string;
  slug: string;
  name: string;
}
export interface HomeData {
  items: Map<string, HomeItem>;
  villagers: Map<string, HomeVillager>;
}

const cache = new Map<Lang, HomeData>();
const pending = new Map<Lang, Promise<HomeData>>();

const loadNames = (lang: Lang): Promise<(string | [string, string])[]> =>
  lang === "es" ? import("@stardew/site/names-es.json").then((m) => m.default as [string, string][]) : import("@stardew/site/names-en.json").then((m) => m.default as string[]);

/** Lo de la portada en el idioma pedido, si ya bajó. */
export const peekHome = (lang: Lang): HomeData | null => cache.get(lang) ?? null;

/** Baja (una sola vez por idioma) la lista, los nombres y los aldeanos, y anota sus slugs en español. */
export function loadHome(lang: Lang): Promise<HomeData> {
  const hit = cache.get(lang);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(lang);
  if (!p) {
    p = Promise.all([import("@stardew/site/list.json"), loadNames(lang), import("@stardew/villagers.json")]).then(([list, names, vill]) => {
      const rows = list.default as ListRow[];
      const people = vill.default as unknown as Villager[];
      const items = new Map<string, HomeItem>();
      const slugsEs: Record<string, string> = {};
      rows.forEach((r, i) => {
        const n = names[i];
        const name = typeof n === "string" ? n : n?.[0] ?? r[1];
        if (Array.isArray(n) && n[1] !== r[1]) slugsEs[r[1]] = n[1];
        items.set(r[0], { id: r[0], slug: r[1], name, price: r[3], w: r[4], h: r[5] });
      });
      const villagers = new Map(people.map((v) => [v.key, { key: v.key, slug: v.slug, name: v.name[lang === "es" ? 1 : 0] }]));
      registerStardewSlugs({
        items: slugsEs,
        villagers: Object.fromEntries(people.filter((v) => v.slugEs !== v.slug).map((v) => [v.slug, v.slugEs])),
      });
      const data = { items, villagers };
      cache.set(lang, data);
      return data;
    });
    p.catch(() => pending.delete(lang));
    pending.set(lang, p);
  }
  return p;
}
