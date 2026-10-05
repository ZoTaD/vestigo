import type { Lang } from "./i18n";
import { copyFor as deadlockCopyFor } from "./deadlockCopy";
import { SEO_COPY } from "./seoCopy";
import { LANGS, parseRoute, routeUrl, SITE_ORIGIN, type Route } from "./route";
import { deadlockDetailSlugs, sitemapPaths, type SitemapData } from "./sitemap";
import { POE2_COPY, type Poe2Copy } from "./poe2Copy";
import { VALHEIM_COPY } from "./valheimCopy";
import { D2R_COPY } from "./d2rCopy";
import { tidyTitleName, ZOMBOID_COPY } from "./zomboidCopy";
import { RUST_COPY } from "./rustCopy";
import { esHeadNames } from "./zomboid/headName";

/** La copia del sitio con Deadlock y los textos de SEO adentro (viven en módulos aparte desde el 2026-09-25). */
const copyOf = (lang: Lang) => ({ ...deadlockCopyFor(lang), seo: SEO_COPY[lang].seo });

/**
 * El `<head>` de cada página, escrito en el build.
 *
 * La app es una sola página que reescribe su `<head>` al navegar, y eso alcanza
 * para Google, que ejecuta JavaScript. **No alcanza para los scrapers de link
 * previews** —Twitter, Discord, WhatsApp, Reddit—, que leen el HTML crudo y se
 * van. Hasta ahora cada link compartido de una unidad, un ítem o una comp se
 * previsualizaba como la home genérica y con la URL equivocada.
 *
 * No es un detalle cosmético: medido en Analytics el 2026-07-25, Organic Social
 * eran **10 de 27 sesiones**. Es el segundo canal del sitio y era justo el que
 * estaba roto en el punto donde se comparte.
 *
 * Mismo patrón que `sitemap.ts`, y por la misma razón: recibe los datos por
 * argumento en vez de importarlos, así el build puede llamarlo desde Node —donde
 * el alias `@data` no existe— mientras los tests lo llaman con los archivos
 * reales.
 */

/** Un nombre que puede estar traducido. `en` siempre existe. */
type Localized = { en: string; [lang: string]: string | undefined };

const say = (loc: Localized | undefined, lang: Lang, fallback: string): string =>
  loc?.[lang] || loc?.en || fallback;

/**
 * El título y la descripción de una ruta.
 *
 * Exportada y compartida con `PageMeta.tsx` a propósito: es la cadena de
 * decisiones que elige qué copia usa cada página, y tenerla dos veces es
 * garantizar que un día digan cosas distintas. Lo único que cada lado resuelve
 * por su cuenta es `detailName`, porque el navegador lo saca del catálogo vivo
 * y el build de los JSON que tiene en la mano. `via` es lo mismo para los
 * rasgos de profesión de Project Zomboid que tienen un gemelo que se elige: las
 * profesiones que lo traen (ver `seo.detail` en `zomboidCopy.ts`).
 */
export function metaFor(
  route: Route,
  lang: Lang,
  detailName: string | null,
  via?: string[] | null
): { title: string; description: string } {
  const copy = copyOf(lang);
  const seo = copy.seo;

  if (detailName && route.view === "deadlock") {
    return {
      title: seo.deadlock.detail.title(detailName, route.dlSection),
      description: seo.deadlock.detail.description(detailName, route.dlSection),
    };
  }
  /**
   * Cada pestaña de Deadlock es su propia página y necesita su propio título.
   *
   * Con uno solo para el juego entero, `/deadlock`, `/deadlock/items` y
   * `/deadlock/patches` iban al sitemap con el mismo texto — tres URLs peleando
   * por la misma búsqueda, y la de objetos perdiendo justo la que debería ganar.
   *
   * El meta conserva el título llano del juego: es la URL indexada.
   */
  if (route.view === "deadlock") {
    const page = seo.deadlock[route.dlSection];
    return { title: page.title(), description: page.description() };
  }
  if (route.view === "poe2") {
    const section = route.p2Section ?? "economy";
    const d = seo.poe2.detail;
    // La categoría de la enciclopedia no necesita nombre: el detalle ya es "gems".
    if (section === "encyclopedia" && route.detail && !route.detail.includes("/")) return d.cat(route.detail);
    if (detailName && route.detail) {
      if (section === "economy") return d.league(detailName);
      if (section === "patches") return d.edition(detailName);
      if (section === "encyclopedia") return d.entry(detailName, route.detail.split("/")[0]);
    }
    const page = seo.poe2[section];
    return { title: page.title(), description: page.description() };
  }
  if (route.view === "valheim") {
    const v = VALHEIM_COPY[lang];
    const sec = route.vhSection ?? "home";
    if (sec === "home") return v.seo.home;
    if (sec === "map") return { title: v.map.seoTitle, description: v.map.seoDesc };
    if (sec === "planner") return { title: v.plan.seoTitle, description: v.plan.seoDesc };
    if (sec === "patches") {
      if (!route.detail) return { title: v.pat.seoTab, description: v.pat.lede };
      const version = route.detail.replace(/-/g, ".");
      return { title: v.pat.seoEdition(detailName ?? version), description: v.pat.seoEditionDesc(version) };
    }
    const tabName = v.tabs[sec];
    if (route.detail) {
      const name = detailName ?? route.detail;
      return { title: v.seo.detail(name, tabName), description: v.seo.detailDesc(name) };
    }
    return { title: v.seo.tab(tabName), description: v.tabLede[sec] };
  }
  // Diablo II (2026-09-29): la portada, cada pestaña y cada ficha (la wiki y los jefes de la calculadora de drops).
  if (route.view === "d2r") {
    const s = D2R_COPY[lang].seo;
    const sec = route.d2Section ?? "home";
    if (sec === "home") return { title: s.title, description: s.description };
    if (route.detail && detailName) {
      if (sec === "runes") return s.rune(detailName);
      if (sec === "runewords") return s.runeword(detailName);
      if (sec === "uniques") return s.unique(detailName);
      if (sec === "sets") return s.set(detailName);
      if (sec === "classes") return s.cls(detailName);
      if (sec === "patches") return s.patch(detailName);
      if (sec === "drops") return s.dropsSource(detailName);
    }
    return s[sec as "runes" | "runewords" | "uniques" | "sets" | "bases" | "cube" | "classes" | "terror-zones" | "breakpoints" | "drops" | "planner" | "grail" | "patches"];
  }
  // Project Zomboid (2026-09-30): la portada, cada pestaña y cada ficha. Una ficha sin nombre (el índice todavía no
  // llegó al navegador) o de una sección sin plantilla lleva el de su pestaña.
  if (route.view === "zomboid") {
    const s = ZOMBOID_COPY[lang].seo;
    const sec = route.pzSection ?? "home";
    const detail = sec !== "home" && route.detail ? s.detail[sec] : undefined;
    // Con los espacios de más de su nombre afuera (ver `tidyTitleName`): sale igual en el título, la descripción y og:*.
    return detail && detailName ? detail(tidyTitleName(detailName), via ?? undefined) : s[sec];
  }
  // Rust (2026-10-05): la portada, cada pestaña y cada ficha de Objetos. Una ficha sin nombre todavía (el archivo no
  // llegó al navegador) lleva el de su pestaña.
  if (route.view === "rust") {
    const r = RUST_COPY[lang];
    if (route.rsSection === "items" && route.detail && detailName) return r.detailSeo(detailName);
    return r.seo[route.rsSection ?? "home"];
  }
  // Lo que queda son la portada y las dos páginas legales.
  const page = seo[route.view];
  return { title: page.title(), description: page.description() };
}

/**
 * De slug a nombre traducido, para las dos pestañas de Deadlock con detalle.
 *
 * Los slugs salen de `deadlockDetailSlugs`, que los arma en el mismo orden que
 * los ids, así que emparejarlos por posición es lo que ata un slug a su
 * entidad. Es el mismo emparejamiento que hace la app;
 * `pageMetaDeadlockParity.test.ts` lo compara contra ella para que no puedan
 * separarse.
 */
function detailNames(data: SitemapData, lang: Lang): Record<string, string> {
  const out: Record<string, string> = {};

  const dlSlugs = deadlockDetailSlugs(data);
  dlSlugs.heroes.forEach((slug, i) => {
    const id = data.dlHeroIds[i];
    out[`dl-meta/${slug}`] = say(data.dlHeroes[id]?.name as Localized, lang, slug);
    out[`dl-heroes/${slug}`] = out[`dl-meta/${slug}`];
  });
  dlSlugs.items.forEach((slug, i) => {
    const id = data.dlItemIds[i];
    out[`dl-items/${slug}`] = say(data.dlItems[id]?.name as Localized, lang, slug);
  });
  for (const e of data.dlNews ?? []) out[`dl-patches/${e.slug}`] = e.title;
  for (const l of data.p2?.leagues ?? []) out[`p2-economy/${l.slug}`] = l.name;
  for (const e of data.p2?.editions ?? []) out[`p2-patches/${e.slug}`] = e.version;
  for (const e of data.p2?.entries ?? []) out[`p2-encyclopedia/${e.id}`] = lang === "es" ? e.es || e.en : e.en;
  for (const e of data.vh?.entries ?? []) out[`vh-${e.tab}/${e.slug}`] = lang === "es" ? e.es || e.en : e.en;
  for (const e of data.d2?.index ?? []) out[`d2-${e.sec}/${e.id}`] = lang === "es" ? e.es || e.en : e.en;
  for (const p of data.d2?.patches ?? []) out[`d2-patches/${p.slug}`] = p.version;
  // En español, las fichas de una sección que el juego llama igual llevan el inglés entre paréntesis (ver `esHeadNames`).
  const pzHead = new Map<string, Map<string, string>>();
  if (lang === "es") {
    const bySec = new Map<string, { id: string; en: string; es: string }[]>();
    for (const e of data.zb?.index ?? []) {
      if (!bySec.has(e.sec)) bySec.set(e.sec, []);
      bySec.get(e.sec)!.push(e);
    }
    for (const [sec, rows] of bySec) pzHead.set(sec, esHeadNames(rows));
  }
  for (const e of data.zb?.index ?? [])
    out[`zb-${e.sec}/${e.id}`] = lang === "es" ? pzHead.get(e.sec)?.get(e.id) || e.es || e.en : e.en;
  for (const p of data.zb?.patches ?? []) out[`zb-patches/${p.slug}`] = p.version;
  for (const e of data.vh?.editions ?? []) {
    const name = (lang === "es" && e.title.es) || e.title.en;
    out[`vh-patches/${e.slug}`] = name ? `${e.version} — ${name}` : e.version;
  }
  for (const e of data.rs?.items ?? []) out[`rs-items/${e.slug}`] = lang === "es" ? e.es || e.en : e.en;

  return out;
}

/**
 * La imagen de vista previa de una ruta.
 *
 * Héroes, objetos y ediciones tienen la suya, dibujada en el build
 * (`og/og.ts`); `/deadlock/patches` a secas lleva la de la última edición,
 * porque es la URL que se comparte. Todo lo demás usa `og.jpg`. `available`
 * dice si el build llegó a dibujarla: si no, la página vuelve a la genérica en
 * vez de apuntar a una imagen que no existe.
 */
export function ogImagePath(route: Route, latestEdition?: string): string | null {
  if (route.view !== "deadlock") return null;
  const { lang, dlSection, detail } = route;
  // Las dos páginas de un héroe comparten su imagen: es el mismo héroe.
  if ((dlSection === "meta" || dlSection === "heroes") && detail) return `/og/${lang}/deadlock/${detail}.jpg`;
  if (dlSection === "items" && detail) return `/og/${lang}/deadlock/items/${detail}.jpg`;
  if (dlSection === "patches") {
    const slug = detail ?? latestEdition;
    return slug ? `/og/${lang}/deadlock/patches/${slug}.jpg` : null;
  }
  return null;
}

export const DEFAULT_OG = `${SITE_ORIGIN}/og.jpg`;

export function ogImageUrl(route: Route, latestEdition?: string, available: (path: string) => boolean = () => true): string {
  // Diablo II tiene su propia vista previa (la puerta y el logo en llamas), para
  // que lo que se comparte en X se vea como el juego y no como la portada del sitio.
  if (route.view === "d2r") return `${SITE_ORIGIN}/d2r/og.jpg`;
  // Rust tiene la suya (un cuadro del juego con el título, `games/rust/tools/ui.py`).
  if (route.view === "rust") return `${SITE_ORIGIN}/rust/og.jpg`;
  const path = ogImagePath(route, latestEdition);
  return path && available(path) ? `${SITE_ORIGIN}${path}` : DEFAULT_OG;
}

/**
 * Los datos estructurados de una página (schema.org), como objetos.
 *
 * Poco y concreto: `WebSite` en la portada, migas de pan en las páginas de
 * Deadlock, y `NewsArticle` con fecha en cada edición de Vestigo News, que es
 * lo que puede llevarla a las noticias de Google. Nada que la página no diga.
 */
export function jsonLdFor(
  route: Route,
  lang: Lang,
  page: { title: string; description: string; canonical: string; image: string },
  data: SitemapData,
  detailName: string | null
): object[] {
  const copy = copyOf(lang);
  const brand = copy.brand;
  const home = routeUrl({ ...route, view: "home", detail: undefined });
  const org = { "@type": "Organization", name: brand, url: SITE_ORIGIN };
  const crumbs = (items: { name: string; url: string }[]) => ({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  });

  if (route.view === "home") {
    return [{ "@context": "https://schema.org", "@type": "WebSite", name: brand, url: home, inLanguage: lang }];
  }
  if (route.view === "poe2") {
    // Vestigo › Path of Exile 2 › pestaña › categoría › ficha.
    const section = route.p2Section ?? "economy";
    const trail = [{ name: brand, url: home }, { name: "Path of Exile 2", url: routeUrl({ ...route, p2Section: "economy", detail: undefined }) }];
    if (section !== "economy") trail.push({ name: copy.poe2.tabs[section], url: routeUrl({ ...route, detail: undefined }) });
    if (section === "encyclopedia" && route.detail) {
      const cat = route.detail.split("/")[0];
      const catName = POE2_COPY[lang].enc.cats[cat as keyof Poe2Copy["enc"]["cats"]];
      if (catName) trail.push({ name: catName, url: routeUrl({ ...route, detail: cat }) });
      if (route.detail.includes("/") && detailName) trail.push({ name: detailName, url: page.canonical });
    } else if (route.detail && detailName) trail.push({ name: detailName, url: page.canonical });
    return trail.length > 2 ? [crumbs(trail)] : [];
  }
  if (route.view === "valheim") {
    // Vestigo › Valheim › pestaña › ficha; las ediciones de la Crónica, además, como noticia.
    const sec = route.vhSection ?? "home";
    const v = VALHEIM_COPY[lang];
    const trail = [{ name: brand, url: home }, { name: "Valheim", url: routeUrl({ ...route, vhSection: "home", detail: undefined }) }];
    if (sec !== "home") trail.push({ name: sec === "patches" ? v.pat.tab : sec === "map" ? v.map.tab : sec === "planner" ? v.plan.tab : v.tabs[sec], url: routeUrl({ ...route, detail: undefined }) });
    if (route.detail && detailName) trail.push({ name: detailName, url: page.canonical });
    const out: object[] = trail.length > 2 ? [crumbs(trail)] : [];
    if (sec === "map" || sec === "planner") {
      // El mapa y el Planificador son herramientas: se presentan como aplicación web gratuita.
      const app = sec === "map" ? v.map : v.plan;
      out.push({
        "@context": "https://schema.org", "@type": "WebApplication", name: app.seoTitle.replace(/\s*\|.*$/, ""),
        description: app.seoDesc, url: page.canonical, applicationCategory: "GameApplication", operatingSystem: "Any",
        inLanguage: lang, isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      });
    }
    const ed = sec === "patches" && route.detail ? data.vh?.editions.find((e) => e.slug === route.detail) : undefined;
    if (ed) {
      out.push({
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: page.title.replace(/\s*\|.*$/, ""),
        description: page.description,
        image: [page.image],
        datePublished: ed.date,
        dateModified: ed.date,
        author: org,
        publisher: org,
        mainEntityOfPage: page.canonical,
        inLanguage: lang,
        isAccessibleForFree: true,
        about: { "@type": "VideoGame", name: "Valheim" },
      });
    }
    return out;
  }
  if (route.view === "d2r") {
    // Vestigo › Diablo II › pestaña › ficha; el planificador, el Grial y la calculadora de drops (no las fichas de cada
    // jefe), además, como aplicaciones web gratuitas.
    const sec = route.d2Section ?? "home";
    const tabs = D2R_COPY[lang].tabs;
    const trail = [{ name: brand, url: home }, { name: "Diablo II: Resurrected", url: routeUrl({ ...route, d2Section: "home", detail: undefined }) }];
    if (sec !== "home") trail.push({ name: tabs[sec], url: routeUrl({ ...route, detail: undefined }) });
    if (route.detail && detailName) trail.push({ name: detailName, url: page.canonical });
    const out: object[] = trail.length > 2 ? [crumbs(trail)] : [];
    if (sec === "planner" || sec === "grail" || (sec === "drops" && !route.detail)) {
      // La calculadora se presenta con el nombre de la herramienta y no con la etiqueta corta de su pestaña ("Drops"),
      // que dice poco fuera de la barra; el planificador y el Grial ya se llaman parecido a su pestaña.
      const name = sec === "drops" ? D2R_COPY[lang].tools.drops.name : tabs[sec];
      out.push({
        "@context": "https://schema.org", "@type": "WebApplication", name, description: page.description, url: page.canonical,
        applicationCategory: "GameApplication", operatingSystem: "Any", inLanguage: lang, isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, about: { "@type": "VideoGame", name: "Diablo II: Resurrected" },
      });
    }
    return out;
  }
  if (route.view === "zomboid") {
    // Vestigo › Project Zomboid › pestaña › ficha.
    const sec = route.pzSection ?? "home";
    const trail = [{ name: brand, url: home }, { name: "Project Zomboid", url: routeUrl({ ...route, pzSection: "home", detail: undefined }) }];
    if (sec !== "home") trail.push({ name: ZOMBOID_COPY[lang].tabs[sec], url: routeUrl({ ...route, detail: undefined }) });
    if (route.detail && detailName) trail.push({ name: tidyTitleName(detailName), url: page.canonical });
    const out: object[] = trail.length > 2 ? [crumbs(trail)] : [];
    // El Planificador de personaje (2026-09-30) y el de fabricación (2026-10-02) son herramientas, como los de Diablo II:
    // además, aplicaciones web gratuitas. Con el nombre de la herramienta (el título sin la marca), no con el de su solapa
    // ("Personaje", "Fabricación").
    if (sec === "planner" || sec === "crafting") {
      out.push({
        "@context": "https://schema.org", "@type": "WebApplication", name: page.title.replace(/\s*\|.*$/, ""), description: page.description,
        url: page.canonical, applicationCategory: "GameApplication", operatingSystem: "Any", inLanguage: lang, isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, about: { "@type": "VideoGame", name: "Project Zomboid" },
      });
    }
    return out;
  }
  if (route.view === "rust") {
    // Vestigo › Rust › pestaña › ficha. La portada y la calculadora de raideo, además, como aplicación web gratuita (el buscador, la cuenta del
    // wipe y las herramientas), con el nombre de la guía.
    const sec = route.rsSection ?? "home";
    const trail = [{ name: brand, url: home }, { name: "Rust", url: routeUrl({ ...route, rsSection: "home", detail: undefined }) }];
    if (sec !== "home") trail.push({ name: RUST_COPY[lang].tabs[sec], url: routeUrl({ ...route, detail: undefined }) });
    if (route.detail && detailName) trail.push({ name: detailName, url: page.canonical });
    const out: object[] = trail.length > 2 ? [crumbs(trail)] : [];
    if (sec === "home" || sec === "raid") {
      out.push({
        "@context": "https://schema.org", "@type": "WebApplication", name: sec === "raid" ? RUST_COPY[lang].raid.h1 : RUST_COPY[lang].home.h1, description: page.description,
        url: page.canonical, applicationCategory: "GameApplication", operatingSystem: "Any", inLanguage: lang, isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, about: { "@type": "VideoGame", name: "Rust" },
      });
    }
    return out;
  }
  if (route.view !== "deadlock") return [];

  const deadlockUrl = routeUrl({ ...route, dlSection: "meta", detail: undefined });
  const sectionUrl = routeUrl({ ...route, detail: undefined });
  const sectionName = copy.deadlock.tabs[route.dlSection as keyof typeof copy.deadlock.tabs] ?? route.dlSection;
  const trail = [{ name: brand, url: home }, { name: "Deadlock", url: deadlockUrl }];
  if (route.dlSection !== "meta") trail.push({ name: sectionName, url: sectionUrl });

  if (route.dlSection === "patches" && route.detail && detailName) {
    const edition = data.dlNews?.find((e) => e.slug === route.detail);
    trail.push({ name: detailName, url: page.canonical });
    return [
      crumbs(trail),
      {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: page.title.replace(/\s*\|.*$/, ""),
        alternativeHeadline: edition?.headline,
        description: page.description,
        image: [page.image],
        datePublished: edition?.date,
        dateModified: edition?.date,
        author: org,
        publisher: org,
        mainEntityOfPage: page.canonical,
        inLanguage: lang,
        isAccessibleForFree: true,
        about: { "@type": "VideoGame", name: "Deadlock" },
      },
    ];
  }
  if (route.detail && detailName) trail.push({ name: detailName, url: page.canonical });
  return [crumbs(trail)];
}

/**
 * El HTML sin comentarios. `index.html` explica sus decisiones en comentarios
 * largos y eso está bien en el repo, pero salían en cada página servida: eran
 * bytes que ningún visitante ni rastreador usa.
 */
export const stripComments = (html: string): string => html.replace(/<!--[\s\S]*?-->\s*/g, "");

export interface PrerenderPage {
  /** La ruta, tal como la pide el visitante: "/es/deadlock/items/basic-magazine". */
  path: string;
  title: string;
  description: string;
  canonical: string;
  /** hreflang → URL, incluido x-default. */
  alternates: { hreflang: string; href: string }[];
  /** Para `<html lang>`. */
  lang: Lang;
  /** Para og:locale. */
  locale: string;
  /** La imagen de la vista previa, absoluta. */
  image: string;
  /** `article` para las ediciones de Vestigo News, `website` para el resto. */
  ogType: "website" | "article";
  /** Fecha de publicación, sólo en las ediciones. */
  published?: string;
  jsonLd: object[];
}

/** Qué imágenes de vista previa existen. Por defecto todas: el build lo acota a las que dibujó. */
export type OgAvailable = (path: string) => boolean;

/** Una entrada por cada dirección que el sitemap declara. */
export function prerenderPages(data: SitemapData, ogAvailable: OgAvailable = () => false): PrerenderPage[] {
  const names: Record<Lang, Record<string, string>> = {
    en: detailNames(data, "en"),
    es: detailNames(data, "es"),
  };
  // Las profesiones de los rasgos gemelos de Zomboid, por la misma clave que su nombre (ver `metaFor`).
  const vias = new Map<string, { en: string[]; es: string[] }>();
  for (const e of data.zb?.index ?? []) if (e.via) vias.set(`zb-${e.sec}/${e.id}`, e.via);

  return sitemapPaths(data).map((path) => {
    const route = parseRoute(path);
    const lang = route.lang;
    const detailKey = !route.detail
      ? null
      : route.view === "deadlock"
        ? `dl-${route.dlSection}/${route.detail}`
        : route.view === "poe2"
          ? `p2-${route.p2Section ?? "economy"}/${route.detail}`
          : route.view === "valheim"
            ? `vh-${route.vhSection ?? "home"}/${route.detail}`
            : route.view === "d2r"
              ? `d2-${route.d2Section ?? "home"}/${route.detail}`
              : route.view === "zomboid"
                ? `zb-${route.pzSection ?? "home"}/${route.detail}`
                : route.view === "rust"
                  ? `rs-${route.rsSection ?? "home"}/${route.detail}`
                  : null;
    const detail = detailKey ? (names[lang][detailKey] ?? null) : null;
    const { title, description } = metaFor(route, lang, detail, detailKey ? vias.get(detailKey)?.[lang] : null);

    const alternates = LANGS.map((l) => ({
      hreflang: l as string,
      href: routeUrl({ ...route, lang: l }),
    }));
    // Inglés es lo que recibe un idioma sin coincidencia, el mismo default que
    // usa la app.
    alternates.push({ hreflang: "x-default", href: routeUrl({ ...route, lang: "en" }) });

    const canonical = routeUrl(route);
    const image = ogImageUrl(route, data.dlNews?.[0]?.slug, ogAvailable);
    const vhEdition = route.view === "valheim" && route.vhSection === "patches" && route.detail ? data.vh?.editions.find((e) => e.slug === route.detail) : undefined;
    const isEdition = (route.view === "deadlock" && route.dlSection === "patches" && !!route.detail) || !!vhEdition;
    const edition = vhEdition ?? (isEdition ? data.dlNews?.find((e) => e.slug === route.detail) : undefined);
    return {
      path,
      title,
      description,
      canonical,
      alternates,
      lang,
      locale: lang === "es" ? "es_AR" : "en_US",
      image,
      ogType: isEdition ? "article" : "website",
      ...(edition ? { published: edition.date } : {}),
      jsonLd: jsonLdFor(route, lang, { title, description, canonical, image }, data, detail),
    };
  });
}

const escape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * El index.html del build con el `<head>` de esta página.
 *
 * Sustituye en vez de agregar: el HTML base ya trae un título y unas etiquetas
 * og genéricas, y dejarlas al lado de las buenas es pedirle al scraper que
 * elija. Cada reemplazo es sobre una etiqueta que index.html tiene garantizada,
 * y `prerender.test.ts` falla si alguna deja de estar.
 */
/**
 * @param body La app ya renderizada a texto. Va adentro de `<div id="root">`.
 *   Sin esto el HTML servido son ~4 KB de `<head>` y un div vacío, que es lo
 *   que un rastreador sin JavaScript ve como página en blanco.
 */
export function renderHtml(
  html: string,
  page: PrerenderPage,
  brand: string,
  body?: string
): string {
  const meta = (attr: "name" | "property", key: string, content: string) =>
    `<meta ${attr}="${key}" content="${escape(content)}">`;

  const head = [
    meta("name", "description", page.description),
    `<link rel="canonical" href="${escape(page.canonical)}">`,
    ...page.alternates.map(
      (a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${escape(a.href)}" data-vestigo>`
    ),
    meta("property", "og:type", page.ogType),
    ...(page.published ? [meta("property", "article:published_time", page.published)] : []),
    meta("property", "og:site_name", brand),
    meta("property", "og:locale", page.locale),
    meta("property", "og:title", page.title),
    meta("property", "og:description", page.description),
    meta("property", "og:url", page.canonical),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", page.title),
    meta("name", "twitter:description", page.description),
    // La imagen se vuelve a declarar porque el borrado de abajo se lleva TODAS
    // las og y twitter, incluida esta. Sacarla sin reponerla dejaría la tarjeta
    // sin imagen, que es empeorar justo lo que este archivo viene a arreglar.
    meta("property", "og:image", page.image),
    meta("property", "og:image:width", "1200"),
    meta("property", "og:image:height", "630"),
    meta("property", "og:image:alt", page.title),
    meta("name", "twitter:image", page.image),
  ].join("\n    ");
  // `</script` adentro del JSON cerraría la etiqueta antes de tiempo.
  const jsonLd = page.jsonLd.length
    ? `\n    <script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/<\//g, "<\\/")}</script>`
    : "";

  // Todos los reemplazos con datos van por función y no por texto: en un texto
  // de reemplazo, `$&`, `$'` o `` $` `` insertan partes del documento, y un
  // título o un cuerpo que los contuviera rompería el HTML (auditoría, 2026-09-28).
  return (
    html
      // El idioma de la página: `index.html` dice "en", y todas las páginas en
      // español salían declaradas en inglés (hasta el 2026-09-30).
      .replace(/<html lang="[^"]*"/, () => `<html lang="${page.lang}"`)
      .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escape(page.title)}</title>`)
      // Fuera todo lo que este bloque vuelve a declarar, para no dejar dos
      // versiones de la misma etiqueta. `\s+` y no un espacio: en `index.html`
      // las etiquetas largas cortan la línea después de `<meta` (desde el
      // 25/9), y con un espacio fijo no se borraban. Cada página salía con dos
      // descripciones, la genérica en inglés primero —la que mostraban X y
      // Discord al compartir un enlace— hasta el 2026-09-30.
      .replace(/\s*<meta\s+name="description"[^>]*>/g, "")
      .replace(/\s*<link\s+rel="canonical"[^>]*>/g, "")
      .replace(/\s*<meta\s+property="og:[^"]+"[^>]*>/g, "")
      .replace(/\s*<meta\s+name="twitter:[^"]+"[^>]*>/g, "")
      .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "")
      .replace("</head>", () => `    ${head}${jsonLd}\n  </head>`)
      // El div de montaje deja de estar vacío. Se busca por su id y no por
      // posición: si `index.html` cambiara de forma, esto deja de sustituir y se
      // nota, en vez de escribir el cuerpo en el lugar equivocado.
      .replace('<div id="root"></div>', () => `<div id="root">${body ?? ""}</div>`)
  );
}
