import { COPY, type Lang } from "./i18n";
import { LANGS, parseRoute, routeUrl, SITE_ORIGIN, type Route } from "./route";
import { deadlockDetailSlugs, sitemapPaths, type SitemapData } from "./sitemap";

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
 * y el build de los JSON que tiene en la mano.
 *
 * Ya no recibe el número de set: las ramas de TFT (sus pestañas, sus bandas y
 * el detalle de unidad/ítem/comp) se fueron el 2026-09-15 con el juego, y eran
 * las únicas que lo usaban. `parseRoute` no produce la vista "tft", así que
 * ninguna ruta llega acá con ella.
 */
export function metaFor(
  route: Route,
  lang: Lang,
  detailName: string | null
): { title: string; description: string } {
  const copy = COPY[lang];
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
   * Es la misma corrección que ya se hizo con las bandas de TFT.
   *
   * El meta conserva el título llano del juego: es la URL indexada.
   */
  if (route.view === "deadlock") {
    const page = seo.deadlock[route.dlSection];
    return { title: page.title(), description: page.description() };
  }
  // Lo que queda son la portada y las dos páginas legales. El `as` recorta
  // "tft" del tipo, que sigue en `View` sólo para que su código compile.
  const page = seo[route.view as "home" | "privacy" | "terms"];
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
  const copy = COPY[lang];
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

  return sitemapPaths(data).map((path) => {
    const route = parseRoute(path);
    const lang = route.lang;
    const detailKey =
      route.detail && route.view === "deadlock" ? `dl-${route.dlSection}/${route.detail}` : null;
    const detail = detailKey ? (names[lang][detailKey] ?? null) : null;
    const { title, description } = metaFor(route, lang, detail);

    const alternates = LANGS.map((l) => ({
      hreflang: l as string,
      href: routeUrl({ ...route, lang: l }),
    }));
    // Inglés es lo que recibe un idioma sin coincidencia, el mismo default que
    // usa la app.
    alternates.push({ hreflang: "x-default", href: routeUrl({ ...route, lang: "en" }) });

    const canonical = routeUrl(route);
    const image = ogImageUrl(route, data.dlNews?.[0]?.slug, ogAvailable);
    const isEdition = route.view === "deadlock" && route.dlSection === "patches" && !!route.detail;
    const edition = isEdition ? data.dlNews?.find((e) => e.slug === route.detail) : undefined;
    return {
      path,
      title,
      description,
      canonical,
      alternates,
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

  return (
    html
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(page.title)}</title>`)
      // Fuera todo lo que este bloque vuelve a declarar, para no dejar dos
      // versiones de la misma etiqueta.
      .replace(/\s*<meta name="description"[^>]*>/g, "")
      .replace(/\s*<link rel="canonical"[^>]*>/g, "")
      .replace(/\s*<meta property="og:[^"]+"[^>]*>/g, "")
      .replace(/\s*<meta name="twitter:[^"]+"[^>]*>/g, "")
      .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "")
      .replace("</head>", `    ${head}${jsonLd}\n  </head>`)
      // El div de montaje deja de estar vacío. Se busca por su id y no por
      // posición: si `index.html` cambiara de forma, esto deja de sustituir y se
      // nota, en vez de escribir el cuerpo en el lugar equivocado.
      .replace('<div id="root"></div>', `<div id="root">${body ?? ""}</div>`)
  );
}
