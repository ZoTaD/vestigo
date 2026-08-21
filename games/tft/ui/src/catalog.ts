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

/** A string in every language the site speaks. */
export interface Localized {
  en: string;
  es: string;
}

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
 * One language out of a translated field.
 *
 * Falls back to English and then to the caller's own fallback — usually the id
 * with its set prefix stripped — so a catalog gap shows a rough name instead of
 * an empty cell.
 */
export function text(field: Localized | undefined, lang: Lang, fallback = ""): string {
  return field?.[lang] || field?.en || fallback;
}

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
