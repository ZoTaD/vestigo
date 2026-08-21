import { COPY, type Lang } from "./i18n";
import { LANGS, parseRoute, routeUrl, SITE_ORIGIN, type Route } from "./route";
import { DEFAULT_BAND, type BandId } from "./bands";
import { detailSlugs, deadlockDetailSlugs, sitemapPaths, type SitemapData } from "./sitemap";

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
 * La banda que titula una página, o null para usar la copia de la sección.
 *
 * La banda por defecto queda excluida a propósito: vive en el `/tft/meta` pelado
 * —la página más valiosa del sitio— y esa tiene que conservar el título apuntado
 * a "tier list" y no uno apuntado a "Master+". La ruta lleva una banda apenas el
 * visitante elige una, así que preguntar sólo si existe retitulaba la página
 * principal, que es exactamente lo que pasó una vez.
 *
 * Vive acá y no en PageMeta.tsx porque el build la necesita desde Node, donde
 * importar un componente de React arrastraría el catálogo entero.
 */
export function titleBand(route: Route): BandId | null {
  if (route.view !== "tft" || route.section !== "meta" || route.detail) return null;
  if (!route.band || route.band === DEFAULT_BAND) return null;
  return route.band;
}

/**
 * El título y la descripción de una ruta.
 *
 * Exportada y compartida con `PageMeta.tsx` a propósito: es la cadena de
 * decisiones que elige qué copia usa cada página, y tenerla dos veces es
 * garantizar que un día digan cosas distintas. Lo único que cada lado resuelve
 * por su cuenta es `detailName`, porque el navegador lo saca del catálogo vivo
 * y el build de los JSON que tiene en la mano.
 */
export function metaFor(
  route: Route,
  lang: Lang,
  set: string,
  detailName: string | null
): { title: string; description: string } {
  const copy = COPY[lang];
  const seo = copy.seo;
  const banded = titleBand(route);

  if (detailName && route.view === "deadlock") {
    return {
      title: seo.deadlock.detail.title(detailName, route.dlSection),
      description: seo.deadlock.detail.description(detailName, route.dlSection),
    };
  }
  if (detailName) {
    return {
      title: seo.detail.title(detailName, route.section, set),
      description: seo.detail.description(detailName, route.section, set),
    };
  }
  if (banded) {
    // El meta de un rango es su propia página y necesita su propio título, o las
    // cuatro competirían por un mismo listado con las mismas palabras.
    const name = copy.meta.bands.names[banded];
    return {
      title: seo.tft.metaBand.title(name, set),
      description: seo.tft.metaBand.description(name, set),
    };
  }
  if (route.view === "tft") {
    return {
      title: seo.tft[route.section].title(set),
      description: seo.tft[route.section].description(set),
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
  // Las páginas sin texto atado al set declaran su copia como `() => string`.
  // Se las llama igual con el set para que todas las ramas se lean iguales;
  // JavaScript ignora el argumento de más.
  const page = seo[route.view] as {
    title: (set: string) => string;
    description: (set: string) => string;
  };
  return { title: page.title(set), description: page.description(set) };
}

/**
 * De slug a nombre traducido, para las tres secciones que tienen detalle.
 *
 * Los slugs salen de `detailSlugs`, que los arma en el mismo orden que los ids,
 * así que emparejarlos por posición es lo que ata un slug a su entidad. Es el
 * mismo emparejamiento que hace la app; `prerender.test.ts` lo compara contra
 * ella para que no puedan separarse.
 */
function detailNames(data: SitemapData, lang: Lang): Record<string, string> {
  const slugs = detailSlugs(data);
  const out: Record<string, string> = {};

  slugs.units.forEach((slug, i) => {
    const id = data.unitIds[i];
    out[`units/${slug}`] = say(data.champions[id]?.name as Localized, lang, slug);
  });
  slugs.items.forEach((slug, i) => {
    const id = data.itemIds[i];
    out[`items/${slug}`] = say(data.items[id]?.name as Localized, lang, slug);
  });
  slugs.meta.forEach((slug, i) => {
    const comp = data.comps[i];
    if (!comp) return;
    const trait = say(data.traits[comp.trait]?.name as Localized, lang, "");
    const carries = comp.carries.map((id) => say(data.champions[id]?.name as Localized, lang, ""));
    out[`meta/${slug}`] = [trait, ...carries].filter(Boolean).join(" ");
  });

  const dlSlugs = deadlockDetailSlugs(data);
  dlSlugs.heroes.forEach((slug, i) => {
    const id = data.dlHeroIds[i];
    out[`dl-meta/${slug}`] = say(data.dlHeroes[id]?.name as Localized, lang, slug);
  });
  dlSlugs.items.forEach((slug, i) => {
    const id = data.dlItemIds[i];
    out[`dl-items/${slug}`] = say(data.dlItems[id]?.name as Localized, lang, slug);
  });

  return out;
}

export interface PrerenderPage {
  /** La ruta, tal como la pide el visitante: "/es/tft/units/lissandra". */
  path: string;
  title: string;
  description: string;
  canonical: string;
  /** hreflang → URL, incluido x-default. */
  alternates: { hreflang: string; href: string }[];
  /** Para og:locale. */
  locale: string;
}

/** Una entrada por cada dirección que el sitemap declara. */
export function prerenderPages(data: SitemapData, set: string): PrerenderPage[] {
  const names: Record<Lang, Record<string, string>> = {
    en: detailNames(data, "en"),
    es: detailNames(data, "es"),
  };

  return sitemapPaths(data).map((path) => {
    const route = parseRoute(path);
    const lang = route.lang;
    const detailKey = route.detail
      ? route.view === "deadlock"
        ? `dl-${route.dlSection}/${route.detail}`
        : `${route.section}/${route.detail}`
      : null;
    const detail = detailKey ? (names[lang][detailKey] ?? null) : null;
    const { title, description } = metaFor(route, lang, set, detail);

    const alternates = LANGS.map((l) => ({
      hreflang: l as string,
      href: routeUrl({ ...route, lang: l }),
    }));
    // Inglés es lo que recibe un idioma sin coincidencia, el mismo default que
    // usa la app.
    alternates.push({ hreflang: "x-default", href: routeUrl({ ...route, lang: "en" }) });

    return {
      path,
      title,
      description,
      canonical: routeUrl(route),
      alternates,
      locale: lang === "es" ? "es_AR" : "en_US",
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
    meta("property", "og:type", "website"),
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
    meta("property", "og:image", `${SITE_ORIGIN}/og.jpg`),
    meta("name", "twitter:image", `${SITE_ORIGIN}/og.jpg`),
  ].join("\n    ");

  return (
    html
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(page.title)}</title>`)
      // Fuera todo lo que este bloque vuelve a declarar, para no dejar dos
      // versiones de la misma etiqueta.
      .replace(/\s*<meta name="description"[^>]*>/g, "")
      .replace(/\s*<link rel="canonical"[^>]*>/g, "")
      .replace(/\s*<meta property="og:[^"]+"[^>]*>/g, "")
      .replace(/\s*<meta name="twitter:[^"]+"[^>]*>/g, "")
      .replace("</head>", `    ${head}\n  </head>`)
      // El div de montaje deja de estar vacío. Se busca por su id y no por
      // posición: si `index.html` cambiara de forma, esto deja de sustituir y se
      // nota, en vez de escribir el cuerpo en el lugar equivocado.
      .replace('<div id="root"></div>', `<div id="root">${body ?? ""}</div>`)
  );
}
