/**
 * The text side of the catalog: turning CommunityDragon's raw strings into
 * something displayable, in every language we ship.
 *
 * Kept apart from catalog.ts because that file is a script — importing it runs
 * the download. These are pure functions, so the tests can reach them.
 */

/** A string in every language the site speaks. English is the fallback. */
export interface Localized {
  en: string;
  es: string;
}

/** CDragon's per-item numbers, keyed by the same names the descriptions cite. */
export type Effects = Record<string, number | string | null | undefined>;

/**
 * CDragon serialises float32, so 15% arrives as 0.15000000596046448. Two
 * decimals is past anything the game actually shows.
 */
function tidy(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Descriptions cite their own stats as `@Variable@`, sometimes scaled:
 * `@BonusPercentHP*100@%` against `{ BonusPercentHP: 0.18 }` reads "18%".
 *
 * A variable we cannot resolve is left exactly as it came. A wrong number in a
 * stats site is worse than visible punctuation: the reader can see that `@X@`
 * is a defect, but not that "20% Health" was invented.
 */
export function resolvePlaceholders(desc: string, effects: Effects = {}): string {
  const value = (name: string): number | null => {
    const raw = effects[name];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  };

  return (
    desc
      // `TFTUnitProperty` reads live state from the unit holding the item —
      // a stack counter, a tracker — which only exists inside a running game.
      // No static catalog can carry it, so the reference comes out entirely
      // rather than sitting on the page forever unresolved.
      .replace(/\s*@TFTUnitProperty[^@\s]*@/g, "")
      // @Var@ and @Var*100@
      .replace(/@([A-Za-z0-9_.]+?)(?:\*(\d+(?:\.\d+)?))?@/g, (whole, name: string, mult?: string) => {
        const n = value(name);
        if (n === null) return whole;
        return tidy(mult ? n * Number(mult) : n);
      })
      // Some stats are cited by hash instead of by name, and the hash is a key
      // in `effects` too. Falling back to "?" keeps the old behaviour.
      .replace(/\{([0-9a-f]{6,})\}/gi, (whole, hash: string) => {
        const n = value(`{${hash}}`);
        return n === null ? "?" : tidy(n);
      })
  );
}

/**
 * One description, ready to render: stats resolved, markup gone.
 *
 * Placeholders are resolved before the markup is stripped, because a stat can
 * sit inside a tag and stripping first would take the number with it.
 */
export function cleanDesc(desc: string | undefined, effects: Effects = {}): string {
  if (!desc) return "";
  return resolvePlaceholders(desc, effects)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The same field in both languages.
 *
 * English carries the structure: when a locale is missing an entry — a new item
 * mid-patch, a set the translators have not reached — we show the English
 * rather than a blank.
 */
export function localized(en: string | undefined, es: string | undefined): Localized {
  const fallback = en ?? "";
  return { en: fallback, es: es || fallback };
}
