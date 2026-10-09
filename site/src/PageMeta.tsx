import { useEffect } from "react";
import { useCopy, useLang } from "./i18n";
import { LANGS, routeUrl, type PzTab, type Route } from "./route";
import { metaFor, ogImageUrl } from "./prerender";
import { editions } from "./deadlockNewsData";
import { heroes as dlHeroSlugs, items as dlItemSlugs } from "./deadlockSlugs";
import { buildHeroes, PUBLISHED_BAND as DL_PUBLISHED_BAND } from "./deadlockData";
import { buildItems as buildDlItems } from "./deadlockItemsData";
import { LEAGUES } from "./poe2EconomyData";
import { EDITIONS as P2_EDITIONS } from "./poe2PatchesData";
import { loadIndex as loadP2Index, peekIndex as peekP2Index } from "./poe2EncyclopediaData";
import { loadIndex as loadVhIndex, peekIndex as peekVhIndex } from "./valheimData";
import { loadD2Index, peekD2Index } from "./d2r/index";
import { loadPzNames, peekPzName } from "./zomboid/index";
import { pzPatchName } from "./zomboid/patches/slug";
import { loadItem as loadRsItem, peekItem as peekRsItem } from "./rust/items/data";
import { loadFarming as loadRsFarming, peekFarming as peekRsFarming } from "./rust/farming/data";
import { loadEdition as loadRsEdition, peekEdition as peekRsEdition } from "./rust/patches/data";
import { loadMonuments as loadRsMonuments, peekMonuments as peekRsMonuments } from "./rust/monuments/data";
import { circuitMeta } from "./rust/electric/circuitMeta";
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

/**
 * La ficha de Zomboid cuyo nombre hay que buscar, o `null` si la ruta no es una. `patches` queda afuera: sus páginas no
 * están en el índice de nombres, y el nombre de una versión sale del slug mismo si tiene página (`pzPatchName`, en
 * `dlDetailName`).
 */
function pzNameKey(route: Route): { sec: PzTab; id: string } | null {
  const sec = route.pzSection;
  if (route.view !== "zomboid" || !route.detail || !sec || sec === "home" || sec === "patches") return null;
  return { sec, id: route.detail };
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
    if (section === "tree" || section === "regex") return null;
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
  if (route.view === "d2r" && route.detail) {
    const e = peekD2Index()?.find((x) => x.sec === route.d2Section && x.id === route.detail);
    return e ? (lang === "es" ? e.es || e.en : e.en) : null;
  }
  // Una versión de Parches de Zomboid: el nombre es la versión, que sale del slug sin bajar nada; una que no tiene
  // página no tiene nombre, y el <head> queda el de la lista, como la página.
  if (route.view === "zomboid" && route.pzSection === "patches" && route.detail) return pzPatchName(route.detail);
  const pz = pzNameKey(route);
  if (pz) {
    const e = peekPzName(pz.sec, pz.id);
    return e ? (lang === "es" ? e.esHead || e.es || e.en : e.en) : null;
  }
  // Una ficha de Objetos de Rust: el nombre sale de su archivo (uno de los 32 repartidos), que la pestaña pide igual.
  if (route.view === "rust" && route.rsSection === "items" && route.detail) {
    const f = peekRsItem(route.detail);
    return f ? (lang === "es" ? f.name.es || f.name.en : f.name.en) : null;
  }
  // Una planta de Granjas (2026-10-09): el nombre sale de `farming.json`, que la pestaña pide igual.
  if (route.view === "rust" && route.rsSection === "farming" && route.detail && route.detail !== "genetics") {
    const p = peekRsFarming()?.plants.find((x) => x.id === route.detail);
    return p ? (lang === "es" ? p.name.es || p.name.en : p.name.en) : null;
  }
  // Una edición de Parches de Rust: su nombre ("Livestock") es el mismo en los dos idiomas.
  if (route.view === "rust" && route.rsSection === "patches" && route.detail) return peekRsEdition(route.detail)?.name ?? null;
  if (route.view === "rust" && route.rsSection === "monuments" && route.detail) {
    const m = peekRsMonuments()?.monuments.find((x) => x.id === route.detail);
    return m ? (lang === "es" ? m.name.es || m.name.en : m.name.en) : null;
  }
  // Un circuito listo de Electricidad: el nombre lo anota `circuits.ts` (viaja con la pestaña).
  if (route.view === "rust" && route.rsSection === "electricity" && route.detail) return circuitMeta(route.detail)?.name[lang] ?? null;
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
    // Las profesiones de un rasgo gemelo de Zomboid (ver `metaFor`): llegan con los nombres de su sección.
    const key = pzNameKey(route);
    const via = key ? peekPzName(key.sec, key.id)?.via?.[lang] : null;
    const rsItem = route.view === "rust" && route.rsSection === "items" && route.detail ? peekRsItem(route.detail) : null;
    const rsHas = rsItem ? { craft: !!rsItem.craft, shop: rsItem.shops.length > 0, loot: rsItem.loot.length > 0, recycle: !!rsItem.recycle } : null;
    const { title, description } = metaFor(route, lang, detail, via, rsHas);
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
    // Y para una ficha de Diablo II, con el índice de su wiki.
    if (route.view === "d2r" && route.detail && !peekD2Index()) {
      let vivo = true;
      loadD2Index().then(() => vivo && apply(dlDetailName(route, lang)), () => undefined);
      return () => { vivo = false; };
    }
    // Y para una de Project Zomboid, con los nombres de su sección (no los de todas: ver `zomboid/index.ts`).
    const pz = pzNameKey(route);
    if (pz && !peekPzName(pz.sec, pz.id)) {
      let vivo = true;
      loadPzNames(pz.sec).then(() => vivo && apply(dlDetailName(route, lang)), () => undefined);
      return () => { vivo = false; };
    }
    // Y para un circuito listo de Rust, con los circuitos (que la pestaña ya pidió).
    if (route.view === "rust" && route.rsSection === "electricity" && route.detail && !circuitMeta(route.detail)) {
      let vivo = true;
      import("./rust/electric/circuits").then(() => vivo && apply(dlDetailName(route, lang)), () => undefined);
      return () => { vivo = false; };
    }
    // Y para una ficha de Rust, con el archivo de la ficha (que la pestaña ya pidió).
    if (route.view === "rust" && route.rsSection === "items" && route.detail && peekRsItem(route.detail) === undefined) {
      let vivo = true;
      loadRsItem(route.detail).then(() => vivo && apply(dlDetailName(route, lang)), () => undefined);
      return () => { vivo = false; };
    }
    if (route.view === "rust" && route.rsSection === "patches" && route.detail && peekRsEdition(route.detail) === undefined) {
      let vivo = true;
      loadRsEdition(route.detail).then(() => vivo && apply(dlDetailName(route, lang)), () => undefined);
      return () => { vivo = false; };
    }
    if (route.view === "rust" && route.rsSection === "monuments" && route.detail && !peekRsMonuments()) {
      let vivo = true;
      loadRsMonuments().then(() => vivo && apply(dlDetailName(route, lang)), () => undefined);
      return () => { vivo = false; };
    }
    if (route.view === "rust" && route.rsSection === "farming" && route.detail && !peekRsFarming()) {
      let vivo = true;
      loadRsFarming().then(() => vivo && apply(dlDetailName(route, lang)), () => undefined);
      return () => { vivo = false; };
    }
  }, [route, copy, lang]);

  return null;
}
