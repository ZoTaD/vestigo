import { useEffect } from "react";
import { useCopy, useLang } from "./i18n";
import { LANGS, routeUrl, type Route } from "./route";
import { metaFor, ogImageUrl } from "./prerender";
import { editions } from "./deadlockNewsData";
import { heroes as dlHeroSlugs, items as dlItemSlugs } from "./deadlockSlugs";
import { buildHeroes, PUBLISHED_BAND as DL_PUBLISHED_BAND } from "./deadlockData";
import { buildItems as buildDlItems } from "./deadlockItemsData";
import { LEAGUES } from "./poe2EconomyData";
import { EDITIONS as P2_EDITIONS } from "./poe2PatchesData";
import { loadIndex as loadP2Index, peekIndex as peekP2Index } from "./poe2EncyclopediaData";
import { loadIndex as loadVhIndex, peekIndex as peekVhIndex } from "./valheimData";
import { loadEditions as loadVhEditions, peekEditions as peekVhEditions } from "./valheimPatchesData";

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

/** The display name behind a detail slug, in the language on screen. */
function dlDetailName(route: Route, lang: "en" | "es"): string | null {
  if (!route.detail) return null;
  if (route.view === "deadlock") {
    if (route.dlSection === "meta" || route.dlSection === "heroes") {
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
    if (route.dlSection === "patches") return editions.find((e) => e.slug === route.detail)?.title ?? null;
    return null;
  }
  if (route.view === "poe2") {
    const section = route.p2Section ?? "economy";
    if (section === "economy") return LEAGUES.find((l) => l.slug === route.detail)?.name ?? null;
    if (section === "patches") return P2_EDITIONS.find((e) => e.slug === route.detail)?.version ?? null;
    if (section === "tree") return null;
    const e = peekP2Index()?.find((x) => x.id === route.detail);
    return e ? (lang === "es" ? e.es || e.en : e.en) : null;
  }
  if (route.view === "valheim" && route.vhSection === "patches" && route.detail) {
    const e = peekVhEditions()?.find((x) => x.slug === route.detail);
    if (!e) return null;
    const name = (lang === "es" && e.title.es) || e.title.en;
    return name ? `${e.version} — ${name}` : e.version;
  }
  if (route.view === "valheim" && route.detail) {
    const e = peekVhIndex()?.find((x) => x.tab === route.vhSection && x.slug === route.detail);
    return e ? (lang === "es" ? e.es || e.en : e.en) : null;
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
    const apply = (detail: string | null) => {
    const { title, description } = metaFor(route, lang, detail);
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
    const isEdition = route.view === "deadlock" && route.dlSection === "patches" && !!detail;
    setMeta("property", "og:type", isEdition ? "article" : "website");
    setMeta("property", "og:site_name", copy.brand);
    setMeta("property", "og:locale", lang === "es" ? "es_AR" : "en_US");
    // La misma imagen que el HTML estático: la del héroe, el objeto o la
    // edición cuando la tienen (ver `ogImageUrl`), y `og.jpg` para el resto.
    const image = ogImageUrl(route, editions[0]?.slug);
    setMeta("property", "og:image", image);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);
    };
    apply(dlDetailName(route, lang));
    // Una ficha de la enciclopedia de PoE2 saca su nombre del índice, que se
    // pide aparte: si todavía no llegó, se vuelve a escribir el <head> cuando
    // llega, así el título no se queda en el genérico de la pestaña.
    if (route.view === "poe2" && route.p2Section === "encyclopedia" && route.detail?.includes("/") && !peekP2Index()) {
      let vivo = true;
      loadP2Index().then(() => vivo && apply(dlDetailName(route, lang)), () => undefined);
      return () => { vivo = false; };
    }
    // Igual para una ficha de Valheim: el nombre sale del índice de la sección.
    if (route.view === "valheim" && route.vhSection === "patches" && route.detail && !peekVhEditions()) {
      let vivo = true;
      loadVhEditions().then(() => vivo && apply(dlDetailName(route, lang)), () => undefined);
      return () => { vivo = false; };
    }
    if (route.view === "valheim" && route.vhSection !== "patches" && route.detail && !peekVhIndex()) {
      let vivo = true;
      loadVhIndex().then(() => vivo && apply(dlDetailName(route, lang)), () => undefined);
      return () => { vivo = false; };
    }
  }, [route, copy, lang]);

  return null;
}
