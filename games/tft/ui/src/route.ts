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
export type DeadlockSection =
  | "meta"
  | "street-brawl"
  | "heroes"
  | "items"
  | "builder"
  | "ranks"
  | "ladder"
  | "patches"
  | "player"
  | "match";
export type View = "home" | "tft" | "deadlock" | "poe2" | "valheim" | "privacy" | "terms";
/**
 * Las pestañas de Path of Exile 2 (2026-09-23). Economía primero, para que la
 * sección esté armada cuando salga la 1.0 (11-dic-2026); la enciclopedia y los
 * parches se suman acá cuando existan. Mismo criterio que `DeadlockSection`:
 * cada juego declara las suyas y una desconocida cae en la de por defecto.
 */
export type Poe2Section = "economy" | "encyclopedia" | "patches";
/**
 * Las pestañas de Valheim (2026-09-24). "home" es la portada de la sección
 * (`/valheim` a secas); las demás llevan su nombre en la URL y, opcionalmente,
 * el slug de una ficha (`/valheim/bosses/eikthyr`). "patches" es la Crónica
 * (`/valheim/patches/1-0-15`): no es una pestaña de datos del juego.
 */
export type ValheimTab = "foods" | "meads" | "weapons" | "armor" | "tools" | "building" | "materials" | "creatures" | "biomes" | "bosses";
export type ValheimSection = "home" | ValheimTab | "patches";
export const VALHEIM_TABS: ValheimTab[] = ["foods", "meads", "weapons", "armor", "tools", "building", "materials", "creatures", "biomes", "bosses"];

export const LANGS: Lang[] = ["en", "es"];
export const SECTIONS: Section[] = ["meta", "units", "items", "ladder", "player"];
/**
 * En el orden en que se dibujan las pestañas.
 *
 * `heroes` (2026-09-22) es la tabla de los 38 con sus atributos del juego, y su
 * detalle `/deadlock/heroes/<héroe>` es **otra página** que `/deadlock/<héroe>`:
 * la de la tier list es la build y nada más (la que se abre en medio de una
 * partida); la de Héroes es el héroe entero — kit, números, enfrentamientos,
 * historia. Pedido de ZoTaD: desde la tier list "yo quiero la build nada más".
 */
export const DEADLOCK_SECTIONS: DeadlockSection[] = ["meta", "heroes", "items", "builder", "ranks", "ladder", "patches", "player"];
/**
 * Las direcciones válidas, que son **más que las pestañas**.
 *
 * `/deadlock/match/<id>` es una página de verdad —es lo que alguien pega en
 * Discord— pero no una pestaña: no hay una partida "en general" que mostrar, y
 * una pestaña que no se puede apretar sin haber buscado antes no es una pestaña.
 * Por eso la lista de parseo y la de dibujo son dos.
 */
export const DEADLOCK_ROUTES: DeadlockSection[] = [...DEADLOCK_SECTIONS, "match", "street-brawl"];
/**
 * La tier list de Street Brawl (2026-09-24) tiene dirección propia
 * (`/deadlock/street-brawl`) pero no pestaña: es la misma pestaña Tier list en
 * otro modo de juego, y se elige con el selector de modo de su cabecera. La
 * dirección aparte es para que "deadlock street brawl tier list" encuentre una
 * página que hable de eso y no la lista rankeada.
 */
export const DEADLOCK_PAGES: DeadlockSection[] = [...DEADLOCK_SECTIONS, "street-brawl"];
/** En el orden en que se dibujan las pestañas de PoE2. */
export const POE2_SECTIONS: Poe2Section[] = ["economy", "encyclopedia", "patches"];
/**
 * Qué pestañas de Deadlock tienen página de detalle **enumerable**. "meta" son
 * héroes, "items" son ítems; rangos y parches no tienen una unidad que abrir.
 *
 * `player` y `match` también llevan detalle en la URL, pero no están acá a
 * propósito: sus detalles son cuentas y partidas, o sea infinitos y ajenos. El
 * sitemap recorre esta lista, y listar partidas sería prometerle a Google
 * páginas que no existen hasta que alguien las busca.
 */
export const DL_DETAIL_SECTIONS: DeadlockSection[] = ["meta", "heroes", "items"];
/**
 * Las que llevan algo después del nombre de la sección, para parsear la URL.
 *
 * `patches` lleva la fecha de una edición de Vestigo News
 * (`/deadlock/patches/2026-09-16`). No está en `DL_DETAIL_SECTIONS` porque las
 * ediciones salen del índice de noticias, no de los slugs de héroes e ítems.
 */
const DL_WITH_DETAIL: DeadlockSection[] = [...DL_DETAIL_SECTIONS, "patches", "player", "match"];
/** Detail pages exist for the three things people search by name. */
export const DETAIL_SECTIONS: Section[] = ["units", "items", "meta"];

export const DEFAULT_LANG: Lang = "en";
const DEFAULT_SECTION: Section = "meta";
const DEFAULT_DL_SECTION: DeadlockSection = "meta";
const DEFAULT_P2_SECTION: Poe2Section = "economy";

export interface Route {
  lang: Lang;
  view: View;
  /** Which TFT tab. Carried even off /tft so returning to it lands where you left. */
  section: Section;
  /** Which Deadlock tab, con el mismo criterio: se conserva fuera de /deadlock. */
  dlSection: DeadlockSection;
  /** Qué pestaña de PoE2. Opcional: fuera de /poe2 no hace falta, y sin ella es Economía. */
  p2Section?: Poe2Section;
  /** Qué pestaña de Valheim. Sin ella es la portada de la sección. */
  vhSection?: ValheimSection;
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
/**
 * Las vistas que el sitio **sirve**. `View` sigue incluyendo "tft" para que el
 * código de TFT compile, pero una URL `/tft/...` ya no llega a él.
 *
 * **TFT salió del sitio el 2026-09-15.** Su pipeline está apagada desde el 12
 * de agosto y el meta que servía era del set 17, parche 16.16: un mes viejo y
 * presentado como actual. Medido en Analytics del 18-ago al 14-sep, TFT fueron
 * 40 vistas contra 299 de Deadlock, y ninguna de las siete personas que
 * entraron volvió por él. Ocultarlo es mejor que servirlo viejo; la pipeline y
 * las vistas quedan en el repo por si se retoma. Ver
 * docs/design/2026-09-15-tft-sale-del-sitio.md.
 */
const isP2Section = (v: string): v is Poe2Section => (POE2_SECTIONS as string[]).includes(v);
const isView = (v: string): v is View => ["home", "deadlock", "poe2", "valheim", "privacy", "terms"].includes(v);
const isVhTab = (v: string | undefined): v is ValheimTab => !!v && (VALHEIM_TABS as string[]).includes(v);

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
  // Una `/tft/...` cae acá también: en el navegador termina en la portada, y en
  // Netlify ni llega, porque `netlify.toml` la redirige con 301 antes.
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

  // Economía es la de por defecto y se queda con `/poe2` a secas, como el meta
  // de Deadlock con `/deadlock`.
  if (head === "poe2") {
    const p2Section = rest[1] && isP2Section(rest[1]) ? rest[1] : DEFAULT_P2_SECTION;
    // El detalle depende de la pestaña: en Economía es la liga
    // (`/poe2/economy/hc-forbidden-rites`), en la Enciclopedia la categoría y la
    // ficha (`/poe2/encyclopedia/gems/untether`, por eso puede llevar una barra)
    // y en Parches la edición (`/poe2/patches/0-5-5c`).
    const depth = p2Section === "encyclopedia" ? 2 : 1;
    const detail = rest[1] === p2Section && rest[2] ? rest.slice(2, 2 + depth).join("/") : undefined;
    return { ...base, view: "poe2", p2Section, detail };
  }

  if (head === "valheim") {
    if (rest[1] === "patches") return { ...base, view: "valheim", vhSection: "patches", detail: rest[2] || undefined };
    if (!isVhTab(rest[1])) return { ...base, view: "valheim", vhSection: "home" };
    return { ...base, view: "valheim", vhSection: rest[1], detail: rest[2] || undefined };
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
  if (view === "poe2") {
    const p2 = route.p2Section ?? DEFAULT_P2_SECTION;
    if (detail) return `/${lang}/poe2/${p2}/${detail}`;
    return p2 === DEFAULT_P2_SECTION ? `/${lang}/poe2` : `/${lang}/poe2/${p2}`;
  }
  if (view === "valheim") {
    const sec = route.vhSection ?? "home";
    if (sec === "home") return `/${lang}/valheim`;
    return detail ? `/${lang}/valheim/${sec}/${detail}` : `/${lang}/valheim/${sec}`;
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
