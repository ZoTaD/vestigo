import catalogJson from "@data/catalog.json";
import { useLang, type Lang } from "./i18n";

/**
 * The game's own vocabulary, in both languages.
 *
 * Item, trait and champion names are not ours to write — they are Riot's, and
 * CommunityDragon publishes them translated. The pipeline downloads both
 * locales, so this file only has to pick one at render time.
 *
 * This is the seam that was missing: the data layers used to resolve names when
 * their module was first imported, before any language existed, which is why
 * the catalog stayed English while the rest of the site switched.
 */

// `Localized` y `text` viven en `localized.ts` desde el 2026-09-07, para que
// los módulos de Deadlock puedan usarlos sin arrastrar el catálogo de TFT
// (466 KB) a cada página. Se re-exportan acá para que TFT no cambie.
import { text, type Localized } from "./localized";
export { text, type Localized };

export interface CatalogFile {
  set: string;
  /** `teamId` is the champion's Team Planner code number, absent on summoned units. */
  champions: Record<string, { name: Localized; cost: number; img: string; teamId?: number }>;
  traits: Record<string, { name: Localized; img: string; breakpoints?: number[] }>;
  items: Record<
    string,
    { name: Localized; img: string; composition: string[]; desc: Localized }
  >;
}

export const catalog = catalogJson as unknown as CatalogFile;

/**
 * Wraps a per-language builder so each language is computed once and reused.
 *
 * The views call these on every render; without the cache, switching a filter
 * would rebuild every comp in the meta.
 */
export function byLang<T>(build: (lang: Lang) => T): (lang: Lang) => T {
  const cache = new Map<Lang, T>();
  return (lang: Lang) => {
    const hit = cache.get(lang);
    if (hit !== undefined) return hit;
    const built = build(lang);
    cache.set(lang, built);
    return built;
  };
}

/** The same, as a hook, for views that just want the data in the current language. */
export function useByLang<T>(build: (lang: Lang) => T): T {
  return build(useLang().lang);
}
