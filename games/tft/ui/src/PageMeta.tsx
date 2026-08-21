import { useEffect } from "react";
import { useCopy, useLang } from "./i18n";
import { catalog, text } from "./catalog";
import { LANGS, SITE_ORIGIN, routeUrl, type Route } from "./route";
import { units as unitSlugs, items as itemSlugs, compSlugs, compName } from "./slugs";
import { buildComps } from "./data";
import { DEFAULT_BAND, type BandId } from "./bands";
import { metaFor } from "./prerender";
import { heroes as dlHeroSlugs, items as dlItemSlugs } from "./deadlockSlugs";
import { buildHeroes, PUBLISHED_BAND as DL_PUBLISHED_BAND } from "./deadlockData";
import { buildItems as buildDlItems } from "./deadlockItemsData";

/**
 * What a search engine and a chat preview see.
 *
 * A single-page app keeps its <head> from the first HTML it was served, so
 * without this every screen would share one title, one description and one
 * canonical — and Google would have no way to tell the tier list from the item
 * stats. Each navigation rewrites them.
 *
 * Renders nothing: it is a side effect on the document, and keeping it a
 * component means it re-runs on the same signal the page does.
 */

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Tell Google the two translations are the same page.
 *
 * Rebuilt wholesale each time rather than patched: the set of alternates is
 * small, and reusing stale ones is how a page ends up pointing at the wrong
 * translation of itself.
 */
function setAlternates(route: Route) {
  document.head
    .querySelectorAll('link[rel="alternate"][data-vestigo]')
    .forEach((el) => el.remove());

  const add = (hreflang: string, href: string) => {
    const el = document.createElement("link");
    el.rel = "alternate";
    el.hreflang = hreflang;
    el.href = href;
    el.setAttribute("data-vestigo", "");
    document.head.appendChild(el);
  };

  for (const lang of LANGS) add(lang, routeUrl({ ...route, lang }));
  // English is what an unmatched language gets, the same default the app uses.
  add("x-default", routeUrl({ ...route, lang: "en" }));
}

// Moved to prerender.ts, which the build imports from Node — a component file
// would drag React and the catalog along with it. Re-exported so the callers
// and tests that already know it by this address keep working.
export { titleBand } from "./prerender";

/** The display name behind a detail slug, in the language on screen. */
function detailName(route: Route, lang: "en" | "es"): string | null {
  if (!route.detail) return null;
  if (route.view === "deadlock") {
    if (route.dlSection === "meta") {
      const id = dlHeroSlugs.toId.get(route.detail);
      if (!id) return null;
      const hero = buildHeroes(DL_PUBLISHED_BAND, lang).find((h) => String(h.heroId) === id);
      return hero?.name ?? null;
    }
    if (route.dlSection === "items") {
      const id = dlItemSlugs.toId.get(route.detail);
      if (!id) return null;
      const item = buildDlItems(DL_PUBLISHED_BAND, lang).find((i) => String(i.itemId) === id);
      return item?.name ?? null;
    }
    return null;
  }
  if (route.section === "units") {
    const id = unitSlugs.toId.get(route.detail);
    return id ? text(catalog.champions[id]?.name, lang, route.detail) : null;
  }
  if (route.section === "items") {
    const id = itemSlugs.toId.get(route.detail);
    return id ? text(catalog.items[id]?.name, lang, route.detail) : null;
  }
  if (route.section === "meta") {
    const band = route.band ?? DEFAULT_BAND;
    const id = compSlugs(band).toId.get(route.detail);
    const comp = id ? buildComps(band, lang).find((c) => c.id === id) : undefined;
    return comp ? compName(comp) : null;
  }
  return null;
}

export default function PageMeta({ route }: { route: Route }) {
  const copy = useCopy();
  const { lang } = useLang();

  useEffect(() => {
    // The branching that picks which copy a page uses lives in prerender.ts and
    // is shared with the build, which writes the same head into static HTML for
    // the scrapers that never run this. Two copies of that chain would be two
    // chances to say different things about the same page.
    const { title, description } = metaFor(route, lang, catalog.set, detailName(route, lang));
    const url = routeUrl(route);

    document.title = title;
    setMeta("name", "description", description);
    setCanonical(url);
    setAlternates(route);

    // Open Graph, kept in step with the page.
    //
    // Worth knowing what this does and does not buy: the scrapers behind link
    // previews do not run JavaScript, so they read the tags baked into
    // index.html and never see these. Rewriting them here is for the crawlers
    // that do execute the page — Google among them — and for anything reading
    // the live DOM. The card someone sees when they paste a link comes from
    // index.html, which is why the image is declared in both places.
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", copy.brand);
    setMeta("property", "og:locale", lang === "es" ? "es_AR" : "en_US");
    setMeta("property", "og:image", `${SITE_ORIGIN}/og.jpg`);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", `${SITE_ORIGIN}/og.jpg`);
  }, [route, copy, lang]);

  return null;
}
