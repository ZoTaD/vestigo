import type { Lang } from "./i18n";
import { DEFAULT_BAND, isBandId, type BandId } from "./bands";

/**
 * The site's addresses.
 *
 * Until now the app kept where-you-are in memory, so every screen shared one
 * URL: vestigo.gg. That is invisible to a search engine — there is only one
 * page to index, and no way to link to the tier list or to a single unit.
 *
 * Language leads the path (/en/…, /es/…) rather than hiding in local storage,
 * so each translation is a page of its own that Google can serve to the right
 * reader. It also means a shared link arrives in the language it was shared in.
 *
 * Pure on purpose: parsing and building live here and touch no catalog and no
 * React, so the tests can cover every shape of URL cheaply.
 */

export type Section = "meta" | "units" | "items" | "ladder" | "player";
/**
 * Las pestañas de Deadlock, que son **otro conjunto** que las de TFT.
 *
 * Un tipo aparte y no una unión con `Section`: si "patches" entrara ahí,
 * `/tft/patches` parsearía a una pestaña que no existe y el sitio contestaría
 * 200 en una URL vacía. Cada juego declara las suyas.
 */
export type DeadlockSection = "meta" | "items" | "ranks" | "ladder" | "patches" | "player" | "match";
export type View = "home" | "tft" | "deadlock" | "privacy" | "terms";

export const LANGS: Lang[] = ["en", "es"];
export const SECTIONS: Section[] = ["meta", "units", "items", "ladder", "player"];
/** En el orden en que se dibujan las pestañas. */
export const DEADLOCK_SECTIONS: DeadlockSection[] = ["meta", "items", "ranks", "ladder", "patches", "player"];
/**
 * Las direcciones válidas, que son **más que las pestañas**.
 *
 * `/deadlock/match/<id>` es una página de verdad —es lo que alguien pega en
 * Discord— pero no una pestaña: no hay una partida "en general" que mostrar, y
 * una pestaña que no se puede apretar sin haber buscado antes no es una pestaña.
 * Por eso la lista de parseo y la de dibujo son dos.
 */
export const DEADLOCK_ROUTES: DeadlockSection[] = [...DEADLOCK_SECTIONS, "match"];
/**
 * Qué pestañas de Deadlock tienen página de detalle **enumerable**. "meta" son
 * héroes, "items" son ítems; rangos y parches no tienen una unidad que abrir.
 *
 * `player` y `match` también llevan detalle en la URL, pero no están acá a
 * propósito: sus detalles son cuentas y partidas, o sea infinitos y ajenos. El
 * sitemap recorre esta lista, y listar partidas sería prometerle a Google
 * páginas que no existen hasta que alguien las busca.
 */
export const DL_DETAIL_SECTIONS: DeadlockSection[] = ["meta", "items"];
/** Las que llevan algo después del nombre de la sección, para parsear la URL. */
const DL_WITH_DETAIL: DeadlockSection[] = [...DL_DETAIL_SECTIONS, "player", "match"];
/** Detail pages exist for the three things people search by name. */
export const DETAIL_SECTIONS: Section[] = ["units", "items", "meta"];

export const DEFAULT_LANG: Lang = "en";
const DEFAULT_SECTION: Section = "meta";
const DEFAULT_DL_SECTION: DeadlockSection = "meta";

export interface Route {
  lang: Lang;
  view: View;
  /** Which TFT tab. Carried even off /tft so returning to it lands where you left. */
  section: Section;
  /** Which Deadlock tab, con el mismo criterio: se conserva fuera de /deadlock. */
  dlSection: DeadlockSection;
  /**
   * Which rank band the meta shows. Absent means the default one, which is why
   * apex keeps the plain /tft/meta address it has always had.
   */
  band?: BandId;
  /** A unit, item or comp slug, when the URL points at one. */
  detail?: string;
}

const isLang = (v: string): v is Lang => (LANGS as string[]).includes(v);
const isSection = (v: string): v is Section => (SECTIONS as string[]).includes(v);
const isDlSection = (v: string): v is DeadlockSection => (DEADLOCK_ROUTES as string[]).includes(v);
const isView = (v: string): v is View =>
  ["home", "tft", "deadlock", "privacy", "terms"].includes(v);

/**
 * A name as it appears in a URL: lowercase, ASCII, hyphen-separated.
 *
 * Always built from the English name even when the page renders in Spanish, so
 * switching language never changes the address of a thing — one page, one URL,
 * and no split ranking between two spellings of the same unit.
 */
export function slugify(name: string): string {
  return (
    name
      // NFD splits "ó" into "o" + a combining accent; dropping everything
      // outside ASCII then removes the accent and leaves the letter, so "Gólem"
      // and "Golem" cannot become two different pages.
      .normalize("NFD")
      .replace(/[^\x00-\x7F]/g, "")
      .toLowerCase()
      // Apostrophes and dots vanish rather than turn into hyphens:
      // "Guinsoo's Rageblade" reads better as guinsoos-rageblade.
      .replace(/['.]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * Read a pathname. Anything unrecognised falls back to the English home rather
 * than 404ing: a mistyped URL should still show the site.
 */
export function parseRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);

  const lang = parts[0] && isLang(parts[0]) ? parts[0] : DEFAULT_LANG;
  // Only drop the first segment when it really was a language, so /tft still
  // works for anyone who typed it or linked it before languages were in paths.
  const rest = parts[0] && isLang(parts[0]) ? parts.slice(1) : parts;

  const base = { lang, section: DEFAULT_SECTION, dlSection: DEFAULT_DL_SECTION };
  const head = rest[0];
  if (!head || !isView(head)) return { ...base, view: "home" };

  // Deadlock lleva sus propias pestañas, y una que no se reconoce cae en el
  // meta en vez de dar una página en blanco.
  if (head === "deadlock") {
    const maybeSection = rest[1];
    // "meta" (héroes) es la sección por defecto y no lleva su nombre en la
    // URL, así que el segmento después de "deadlock" puede ser el nombre de
    // otra pestaña (items/ranks/patches) O el slug de un héroe. Si no es una
    // pestaña conocida, es un héroe.
    if (maybeSection && isDlSection(maybeSection)) {
      const dlSection = maybeSection;
      const detail = DL_WITH_DETAIL.includes(dlSection) && rest[2] ? rest[2] : undefined;
      return { ...base, view: "deadlock", dlSection, detail };
    }
    return { ...base, view: "deadlock", dlSection: DEFAULT_DL_SECTION, detail: maybeSection || undefined };
  }

  if (head !== "tft") return { ...base, view: head };

  const section = rest[1] && isSection(rest[1]) ? rest[1] : DEFAULT_SECTION;

  // Only the meta carries a band, and only in the first slot after the section.
  // Anything else there is a comp slug, which keeps every /tft/meta/<comp> URL
  // already in the sitemap pointing where it always did.
  const banded = section === "meta" && !!rest[2] && isBandId(rest[2]);
  const band = banded ? (rest[2] as BandId) : undefined;
  const slot = banded ? rest[3] : rest[2];
  const detail = slot && DETAIL_SECTIONS.includes(section) ? slot : undefined;
  return { ...base, view: "tft", section, band, detail };
}

/** Build the pathname for a route. The inverse of parseRoute. */
export function routePath(route: Route): string {
  const { lang, view, section, dlSection, band, detail } = route;
  if (view === "home") return `/${lang}`;
  // El meta de Deadlock se queda con `/deadlock` a secas: es la pestaña por
  // defecto y la URL que ya está indexada, así que agregarle `/meta` partiría
  // el posicionamiento entre dos direcciones de la misma página.
  if (view === "deadlock") {
    if (dlSection === DEFAULT_DL_SECTION) {
      return detail ? `/${lang}/deadlock/${detail}` : `/${lang}/deadlock`;
    }
    const dlPath = `/${lang}/deadlock/${dlSection}`;
    return DL_WITH_DETAIL.includes(dlSection) && detail ? `${dlPath}/${detail}` : dlPath;
  }
  if (view !== "tft") return `/${lang}/${view}`;
  // The default band is left out entirely so the meta keeps one canonical URL
  // instead of answering at both /tft/meta and /tft/meta/apex.
  const showBand = section === "meta" && band && band !== DEFAULT_BAND;
  const base = `/${lang}/tft/${section}` + (showBand ? `/${band}` : "");
  return detail ? `${base}/${detail}` : base;
}

/** The same page in the other language, for the hreflang links. */
export const routeInLang = (route: Route, lang: Lang): Route => ({ ...route, lang });

export const SITE_ORIGIN = "https://vestigo.gg";

export const routeUrl = (route: Route): string => SITE_ORIGIN + routePath(route);
