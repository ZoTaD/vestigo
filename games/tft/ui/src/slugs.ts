import { buildComps, bandLoaded } from "./data";
import { buildUnits } from "./unitsData";
import { buildItems } from "./itemsData";
import { DEFAULT_BAND, type BandId } from "./bands";
import { slugify } from "./route";

/**
 * The names in the URL bar, and how to get back from them.
 *
 * Every slug is built from the English name even when the page renders in
 * Spanish. A unit that lived at /tft/units/master-yi in one language and
 * /tft/units/maestro-yi in the other would be two pages competing for the same
 * search, and every shared link would break on a language switch.
 *
 * Built once at import: these are a few hundred short strings over data that is
 * already in the bundle.
 */

/** How a comp is named on screen: its defining trait, then its carries. */
export const compName = (comp: { traitName: string; carryNames: string[] }): string =>
  [comp.traitName, ...comp.carryNames].filter(Boolean).join(" ");

interface SlugMap {
  /** slug → id, for reading a URL. */
  toId: Map<string, string>;
  /** id → slug, for writing one. */
  toSlug: Map<string, string>;
}

/**
 * Two different things can flatten to the same slug — the same carry in two
 * comps, say. Rather than let one silently shadow the other, the second gets a
 * numbered suffix, which keeps every entity addressable.
 */
function buildMap(entries: { id: string; name: string }[]): SlugMap {
  const toId = new Map<string, string>();
  const toSlug = new Map<string, string>();
  for (const { id, name } of entries) {
    const base = slugify(name) || slugify(id);
    let slug = base;
    for (let n = 2; toId.has(slug) && toId.get(slug) !== id; n++) slug = `${base}-${n}`;
    if (toSlug.has(id)) continue;
    toId.set(slug, id);
    toSlug.set(id, slug);
  }
  return { toId, toSlug };
}

const en = "en" as const;

export const units: SlugMap = buildMap(
  buildUnits(en).map((u) => ({ id: u.id, name: u.name }))
);

export const items: SlugMap = buildMap(
  buildItems(en).map((i) => ({ id: i.id, name: i.name }))
);

/**
 * Comp slugs, per band.
 *
 * Each band has its own tier list, so a comp that exists in Diamond may not
 * exist in Apex and needs a slug of its own. Always built from the English
 * names, whatever language the page is in, for the same reason every other slug
 * is: one thing, one address.
 */
const compMaps = new Map<BandId, SlugMap>();

export function compSlugs(band: BandId): SlugMap {
  const hit = compMaps.get(band);
  if (hit) return hit;
  const map = buildMap(buildComps(band, en).map((c) => ({ id: c.id, name: compName(c) })));
  // Only remember it once the band's own file is here. Before that the comps
  // come from the default band, and caching those under this band's name would
  // outlive the download and hand out the wrong slugs for good.
  if (bandLoaded(band)) compMaps.set(band, map);
  return map;
}

/** The default band's map, which is the one the sitemap lists. */
export const comps: SlugMap = compSlugs(DEFAULT_BAND);

/** Every detail URL the sitemap should list, as `section/slug` pairs. */
export function detailPaths(): { section: "units" | "items" | "meta"; slug: string }[] {
  return [
    ...[...units.toSlug.values()].map((slug) => ({ section: "units" as const, slug })),
    ...[...items.toSlug.values()].map((slug) => ({ section: "items" as const, slug })),
    ...[...comps.toSlug.values()].map((slug) => ({ section: "meta" as const, slug })),
  ];
}
