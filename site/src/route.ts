import type { Lang } from "./i18n";

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

/**
 * Las pestañas de Deadlock. Cada juego declara las suyas: una pestaña de un
 * juego no es una dirección válida en otro.
 */
export type DeadlockSection =
  | "meta"
  | "street-brawl"
  | "heroes"
  | "items"
  | "builder"
  | "ranks"
  | "ladder"
  | "comebacks"
  | "patches"
  | "player"
  | "match";
export type View = "home" | "deadlock" | "poe2" | "valheim" | "d2r" | "zomboid" | "privacy" | "terms";
/**
 * Las pestañas de Path of Exile 2 (2026-09-23). Economía primero, para que la
 * sección esté armada cuando salga la 1.0 (11-dic-2026); la enciclopedia y los
 * parches se suman acá cuando existan. Mismo criterio que `DeadlockSection`:
 * cada juego declara las suyas y una desconocida cae en la de por defecto.
 */
export type Poe2Section = "economy" | "encyclopedia" | "patches" | "tree" | "regex";
/**
 * Las pestañas de Valheim (2026-09-24). "home" es la portada de la sección
 * (`/valheim` a secas); las demás llevan su nombre en la URL y, opcionalmente,
 * el slug de una ficha (`/valheim/bosses/eikthyr`). "patches" es la Crónica
 * (`/valheim/patches/1-0-15`): no es una pestaña de datos del juego. "map" es
 * el mapa interactivo por semilla (`/valheim/map?seed=…`). "planner" es el
 * Planificador (`/valheim/planner?l=…`) y su hoja de ruta
 * (`/valheim/planner/route`), 2026-09-25.
 */
export type ValheimTab = "foods" | "meads" | "weapons" | "armor" | "tools" | "building" | "materials" | "creatures" | "biomes" | "places" | "bosses";
export type ValheimSection = "home" | ValheimTab | "patches" | "map" | "planner";
export const VALHEIM_TABS: ValheimTab[] = ["foods", "meads", "weapons", "armor", "tools", "building", "materials", "creatures", "biomes", "places", "bosses"];
/**
 * Diablo II: Resurrected (2026-09-29). "home" es la portada (`/d2r`); cada
 * pestaña lleva su nombre en la URL y, las que tienen fichas, el slug
 * (`/d2r/runewords/enigma`). Una dirección desconocida debajo de `/d2r` cae en
 * la portada, como en Valheim. El planificador lleva el equipo en `?b=`, que no
 * es parte de la ruta; la calculadora de drops también guarda su estado en la
 * query (`?m=`, `?i=`…) y tiene una ficha por jefe (`/d2r/drops/mephisto`).
 */
export type D2rTab = "runes" | "runewords" | "uniques" | "sets" | "bases" | "cube" | "classes" | "terror-zones" | "breakpoints" | "drops" | "planner" | "grail" | "patches";
export type D2rSection = "home" | D2rTab;
export const D2R_SECTIONS: D2rTab[] = ["runes", "runewords", "uniques", "sets", "bases", "cube", "classes", "terror-zones", "breakpoints", "drops", "planner", "grail", "patches"];
/** Las pestañas con una ficha por cosa (las que recorre el sitemap). */
export const D2R_DETAIL_SECTIONS: D2rTab[] = ["runes", "runewords", "uniques", "sets", "classes", "patches", "drops"];
/**
 * Diablo II en español lleva la dirección en español (2026-09-30):
 * `/es/d2r/palabras-runicas/enigma`, `/es/d2r/unicos/la-rechinante`. Pedido de ZoTaD: con la misma dirección en los
 * dos idiomas, quien busca en español no veía sus palabras en el enlace. Cada idioma ya era una página aparte (con su
 * hreflang), así que no se parte nada: la ruta interna sigue siendo la inglesa (`d2Section: "runewords"`,
 * `detail: "enigma"`) y sólo se traduce al escribir y leer la dirección.
 *
 * Las secciones van acá porque son pocas. Las fichas salen de los nombres del juego en español (`d2rSlugs.ts`) y las
 * anota `registerD2rSlugs` cuando se baja la sección: son ~550 y no tienen por qué viajar en la cáscara.
 */
export const D2R_SECTION_ES: Record<D2rTab, string> = {
  runes: "runas",
  runewords: "palabras-runicas",
  uniques: "unicos",
  sets: "conjuntos",
  bases: "bases",
  cube: "cubo-horadrico",
  classes: "clases",
  "terror-zones": "zonas-de-terror",
  breakpoints: "breakpoints",
  drops: "drops",
  planner: "planificador",
  grail: "grial",
  patches: "parches",
};
const D2R_SECTION_BY_ES = new Map(Object.entries(D2R_SECTION_ES).map(([tab, es]) => [es, tab as D2rTab]));

/**
 * Los slugs en español de las fichas de un juego, por pestaña: id → slug y slug → id. Sólo guarda los que cambian;
 * una ficha que no aparece se llama igual en los dos idiomas. Lo usan Diablo II y Project Zomboid.
 */
class LocalSlugs<T extends string> {
  private byTab: Partial<Record<T, { toEs: Map<string, string>; toId: Map<string, string> }>> = {};
  /**
   * Suma a lo que ya había, no lo pisa (2026-09-30): una pestaña puede anotar sólo los pocos slugs de otra que enlaza
   * (Moodles, los 30 objetos de sus consejos) sin borrar el mapa entero que anotó antes la pestaña Objetos. Todos
   * salen de la misma cuenta del build, así que un id nunca llega con dos slugs distintos.
   */
  register(slugs: Partial<Record<T, Record<string, string>>>): void {
    for (const [tab, map] of Object.entries(slugs) as [T, Record<string, string>][]) {
      const known = (this.byTab[tab] ??= { toEs: new Map(), toId: new Map() });
      for (const [id, es] of Object.entries(map)) {
        known.toEs.set(id, es);
        known.toId.set(es, id);
      }
    }
  }
  toEs(tab: T, id: string): string {
    return this.byTab[tab]?.toEs.get(id) ?? id;
  }
  toId(tab: T, slug: string): string {
    return this.byTab[tab]?.toId.get(slug) ?? slug;
  }
}

/** Los slugs en español de las fichas de Diablo II. */
const d2rSlugsEs = new LocalSlugs<D2rTab>();

/**
 * Anota los slugs en español de las fichas (`{ uniques: { "the-gnasher": "la-rechinante" } }`). Sólo las que cambian:
 * una ficha que no aparece se llama igual en los dos idiomas. La llaman la sección al cargarse (`D2r.tsx`) y el build
 * antes de armar el sitemap; hasta entonces las fichas van con el slug inglés, que también se entiende.
 */
export function registerD2rSlugs(slugs: Partial<Record<D2rTab, Record<string, string>>>): void {
  d2rSlugsEs.register(slugs);
}

/**
 * Project Zomboid (2026-09-30). Diseño: docs/design/2026-09-30-zomboid.md. La dirección lleva el nombre completo
 * (`/project-zomboid`), que es como se busca el juego. `/zomboid` a secas ya no es una página (manda con 301 a la de
 * verdad, ver `netlify.toml`): la carpeta `/zomboid/...` es de assets y no puede ser también una dirección.
 * Como Diablo II, en español las pestañas y las fichas van en español.
 */
export type PzTab = "map" | "items" | "recipes" | "crafting" | "traits" | "professions" | "planner" | "skills" | "moodles" | "server" | "patches";
export type PzSection = "home" | PzTab;
export const PZ_SEGMENT = "project-zomboid";
export const PZ_SECTIONS: PzTab[] = ["map", "items", "recipes", "crafting", "traits", "professions", "planner", "skills", "moodles", "server", "patches"];
/** Las pestañas con una ficha por cosa (`/project-zomboid/items/crowbar`). */
export const PZ_DETAIL_SECTIONS: PzTab[] = ["items", "recipes", "traits", "professions", "skills", "moodles", "server", "patches"];
/**
 * Las pestañas que ya tienen página. Las demás se muestran apagadas, no entran al sitemap, y una dirección a una de
 * ellas muestra la portada. Cada pestaña se suma acá el día que se publica: Objetos, Recetas y el Mapa, el 2026-09-30.
 *
 * Rasgos (2026-09-30) entra con `professions`: las profesiones no tienen solapa (la de "Rasgos" queda marcada en sus
 * páginas), pero sí lista (`/profesiones`) y fichas, y sin estar acá no irían al sitemap y su dirección mostraría la
 * portada.
 *
 * Personaje (`planner`, el planificador, 2026-09-30) no tiene fichas: es una página sola con el personaje en `?b=`.
 *
 * Moodles (2026-09-30): la lista de los 26 y una ficha por moodle, que así van al sitemap.
 *
 * Habilidades (2026-09-30): la lista de las 35 y una ficha por habilidad, con sus libros y la calculadora de XP.
 *
 * Servidor (2026-10-01): el generador (`/servidor`, con la configuración en `?p=&s=&i=`) y sus dos fichas del índice,
 * los presets comparados (`/servidor/presets-de-sandbox`) y la calculadora de cortes de agua y luz
 * (`/servidor/cortes-de-agua-y-luz`), que por eso está también en `PZ_DETAIL_SECTIONS`.
 *
 * Fabricación (`crafting`, el planificador de fabricación, 2026-10-02) no tiene fichas: es una página sola con lo que
 * elegiste en `?q=…`.
 *
 * Parches (2026-10-01, conectada el 2026-10-02): la lista y una página por versión (`/parches/42-21`); los slugs son
 * iguales en los dos idiomas. Sus páginas no están en el índice de fichas: el sitemap las saca de `patches/index.json`.
 */
export const PZ_PUBLISHED: PzTab[] = ["map", "items", "recipes", "crafting", "traits", "professions", "planner", "moodles", "skills", "server", "patches"];
/**
 * Fichas del índice que todavía no tienen página propia (2026-10-01): su dirección abre la pestaña, pero el sitemap y
 * el prerender las saltean. Si no, Google vería el generador de Servidor otra vez con otro título (contenido duplicado)
 * si la rama se publicara antes de la Task 5 (los cortes de agua y luz). Cada tarea saca su ficha de acá al conectar su
 * página (y `zomboidPublish.test.ts` lo vigila): los presets comparados y la calculadora de cortes salieron el
 * 2026-10-02 (Tasks 4 y 5). Queda vacía, lista para la próxima ficha que llegue al índice antes que su página.
 */
export const PZ_DETAILS_PENDING: Partial<Record<PzTab, readonly string[]>> = {};
export const PZ_SECTION_ES: Record<PzTab, string> = {
  map: "mapa",
  items: "objetos",
  recipes: "recetas",
  crafting: "fabricacion",
  traits: "rasgos",
  professions: "profesiones",
  planner: "personaje",
  skills: "habilidades",
  moodles: "moodles",
  server: "servidor",
  patches: "parches",
};
const PZ_SECTION_BY_ES = new Map(Object.entries(PZ_SECTION_ES).map(([tab, es]) => [es, tab as PzTab]));

/** Los slugs en español de las fichas de Project Zomboid. */
const pzSlugsEs = new LocalSlugs<PzTab>();

/** Anota los slugs en español de las fichas de Project Zomboid (los arma el build, como los de Diablo II). */
export function registerPzSlugs(slugs: Partial<Record<PzTab, Record<string, string>>>): void {
  pzSlugsEs.register(slugs);
}

export const LANGS: Lang[] = ["en", "es"];
/**
 * En el orden en que se dibujan las pestañas.
 *
 * `heroes` (2026-09-22) es la tabla de los 38 con sus atributos del juego, y su
 * detalle `/deadlock/heroes/<héroe>` es **otra página** que `/deadlock/<héroe>`:
 * la de la tier list es la build y nada más (la que se abre en medio de una
 * partida); la de Héroes es el héroe entero — kit, números, enfrentamientos,
 * historia. Pedido de ZoTaD: desde la tier list "yo quiero la build nada más".
 */
export const DEADLOCK_SECTIONS: DeadlockSection[] = [
  "meta",
  "heroes",
  "items",
  "builder",
  "ranks",
  "ladder",
  "comebacks",
  "patches",
  "player",
];
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
export const POE2_SECTIONS: Poe2Section[] = ["economy", "encyclopedia", "patches", "tree", "regex"];
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

export const DEFAULT_LANG: Lang = "en";
const DEFAULT_DL_SECTION: DeadlockSection = "meta";
/**
 * La tier list de Deadlock vive en `/deadlock/tier-list` desde el 2026-09-30 (antes, `/deadlock` a secas). Pedido de
 * ZoTaD: quien busca "deadlock tier list" no veía esas palabras en el enlace. En los dos idiomas igual: en español
 * también se busca "tier list". La dirección vieja manda con 301 (`_redirects`) y la app la sigue entendiendo.
 */
export const DL_TIER_LIST = "tier-list";
const DEFAULT_P2_SECTION: Poe2Section = "economy";

export interface Route {
  lang: Lang;
  view: View;
  /** Qué pestaña de Deadlock. Se conserva fuera de /deadlock, así volver a Deadlock cae donde se dejó. */
  dlSection: DeadlockSection;
  /** Qué pestaña de PoE2. Opcional: fuera de /poe2 no hace falta, y sin ella es Economía. */
  p2Section?: Poe2Section;
  /** Qué pestaña de Valheim. Sin ella es la portada de la sección. */
  vhSection?: ValheimSection;
  /** Qué pestaña de Diablo II. Sin ella es la portada de la sección. */
  d2Section?: D2rSection;
  /** Qué pestaña de Project Zomboid. Sin ella es la portada de la sección. */
  pzSection?: PzSection;
  /** El slug de lo que se abre (un héroe, un ítem, una ficha, una edición), si la URL apunta a uno. */
  detail?: string;
}

const isLang = (v: string): v is Lang => (LANGS as string[]).includes(v);
const isDlSection = (v: string): v is DeadlockSection => (DEADLOCK_ROUTES as string[]).includes(v);
const isP2Section = (v: string): v is Poe2Section => (POE2_SECTIONS as string[]).includes(v);
/**
 * Las vistas que el sitio sirve. TFT salió del sitio el 2026-09-15 y del repo el
 * 2026-09-25: una `/tft/...` vieja cae en la portada (y en Netlify ni llega,
 * porque `netlify.toml` la redirige con 301 antes).
 */
const isView = (v: string): v is View => ["home", "deadlock", "poe2", "valheim", "d2r", "privacy", "terms"].includes(v);
const isVhTab = (v: string | undefined): v is ValheimTab => !!v && (VALHEIM_TABS as string[]).includes(v);
const isD2Tab = (v: string | undefined): v is D2rTab => !!v && (D2R_SECTIONS as string[]).includes(v);
/**
 * La pestaña de Diablo II de un segmento, escrito en cualquiera de los dos idiomas: `/es/d2r/runewords` (las
 * direcciones del 29/9, antes de traducirlas) sigue abriendo la pestaña, y la app corrige la barra a la de su idioma.
 */
const d2Tab = (v: string | undefined): D2rTab | undefined => (isD2Tab(v) ? v : v ? D2R_SECTION_BY_ES.get(v) : undefined);

const isPzTab = (v: string | undefined): v is PzTab => !!v && (PZ_SECTIONS as string[]).includes(v);
/** La pestaña de Project Zomboid de un segmento, escrito en cualquiera de los dos idiomas. */
const pzTab = (v: string | undefined): PzTab | undefined => (isPzTab(v) ? v : v ? PZ_SECTION_BY_ES.get(v) : undefined);

/**
 * A name as it appears in a URL: lowercase, ASCII, hyphen-separated.
 *
 * Always built from the English name even when the page renders in Spanish, so
 * switching language never changes the address of a thing — one page, one URL,
 * and no split ranking between two spellings of the same unit.
 *
 * Salvo Diablo II desde el 2026-09-30, que en español lleva el nombre español
 * (ver `D2R_SECTION_ES`).
 *
 * Tiene dos copias en Python, `slugify` de `games/zomboid/tools/extract.py` y de
 * `games/rust/tools/extract.py`, que arman los ids de las fichas de Project
 * Zomboid y de Rust: si cambia una, cambian las otras.
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
  // Only drop the first segment when it really was a language, so an address
  // typed without one (/deadlock) still works.
  const rest = parts[0] && isLang(parts[0]) ? parts.slice(1) : parts;

  const base = { lang, dlSection: DEFAULT_DL_SECTION };
  const head = rest[0];

  // Project Zomboid va con el nombre completo (`/project-zomboid`). `/zomboid` a secas no entra: es la carpeta de los
  // íconos y del mapa, y Netlify lo manda con 301 a la dirección de verdad.
  if (head === PZ_SEGMENT) {
    const tab = pzTab(rest[1]);
    // Una pestaña que todavía no existe (o que no se conoce) muestra la portada, y así la dirección, el título y el
    // canonical dicen lo mismo que la pantalla.
    if (!tab || !PZ_PUBLISHED.includes(tab)) return { ...base, view: "zomboid", pzSection: "home" };
    const slug = PZ_DETAIL_SECTIONS.includes(tab) && rest[2] ? rest[2] : undefined;
    // El slug se traduce en los dos idiomas: el español de una ficha nunca coincide con el inglés de otra (lo cuida el
    // armado de los slugs), así que `/en/…/objetos/palanca` abre la palanca en vez de una ficha rota. Uno que no se
    // conoce se deja como vino.
    const detail = slug ? pzSlugsEs.toId(tab, slug) : undefined;
    return { ...base, view: "zomboid", pzSection: tab, detail };
  }

  if (!head || !isView(head)) return { ...base, view: "home" };

  // Deadlock lleva sus propias pestañas, y una que no se reconoce cae en el
  // meta en vez de dar una página en blanco.
  if (head === "deadlock") {
    const maybeSection = rest[1];
    if (maybeSection === DL_TIER_LIST) return { ...base, view: "deadlock", dlSection: DEFAULT_DL_SECTION, detail: rest[2] || undefined };
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

  // Economía es la de por defecto y se queda con `/poe2` a secas.
  if (head === "poe2") {
    const p2Section = rest[1] && isP2Section(rest[1]) ? rest[1] : DEFAULT_P2_SECTION;
    // El detalle depende de la pestaña: en Economía es la liga
    // (`/poe2/economy/hc-forbidden-rites`), en la Enciclopedia la categoría y la
    // ficha (`/poe2/encyclopedia/gems/untether`, por eso puede llevar una barra)
    // y en Parches la edición (`/poe2/patches/0-5-5c`). El árbol no tiene: la
    // build va en `?b=`, que no es parte de la ruta.
    const depth = p2Section === "encyclopedia" ? 2 : 1;
    const detail = p2Section !== "tree" && p2Section !== "regex" && rest[1] === p2Section && rest[2] ? rest.slice(2, 2 + depth).join("/") : undefined;
    return { ...base, view: "poe2", p2Section, detail };
  }

  if (head === "valheim") {
    if (rest[1] === "patches") return { ...base, view: "valheim", vhSection: "patches", detail: rest[2] || undefined };
    if (rest[1] === "map") return { ...base, view: "valheim", vhSection: "map" };
    if (rest[1] === "planner") return { ...base, view: "valheim", vhSection: "planner", detail: rest[2] === "route" ? "route" : undefined };
    if (!isVhTab(rest[1])) return { ...base, view: "valheim", vhSection: "home" };
    return { ...base, view: "valheim", vhSection: rest[1], detail: rest[2] || undefined };
  }

  if (head === "d2r") {
    const tab = d2Tab(rest[1]);
    if (!tab) return { ...base, view: "d2r", d2Section: "home" };
    const slug = D2R_DETAIL_SECTIONS.includes(tab) && rest[2] ? rest[2] : undefined;
    // El slug se traduce en los dos idiomas (ver Project Zomboid, arriba): uno que no se conoce se deja como vino.
    const detail = slug ? d2rSlugsEs.toId(tab, slug) : slug;
    return { ...base, view: "d2r", d2Section: tab, detail };
  }

  return { ...base, view: head };
}

/** Build the pathname for a route. The inverse of parseRoute. */
export function routePath(route: Route): string {
  const { lang, view, dlSection, detail } = route;
  if (view === "home") return `/${lang}`;
  // La tier list es `/deadlock/tier-list` (ver `DL_TIER_LIST`). La build de cada
  // héroe se queda en `/deadlock/<héroe>`, que es la dirección ya indexada.
  if (view === "deadlock") {
    if (dlSection === DEFAULT_DL_SECTION) {
      return detail ? `/${lang}/deadlock/${detail}` : `/${lang}/deadlock/${DL_TIER_LIST}`;
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
  if (view === "d2r") {
    const sec = route.d2Section ?? "home";
    if (sec === "home") return `/${lang}/d2r`;
    if (lang !== "es") return detail ? `/${lang}/d2r/${sec}/${detail}` : `/${lang}/d2r/${sec}`;
    const path = `/es/d2r/${D2R_SECTION_ES[sec]}`;
    return detail ? `${path}/${d2rSlugsEs.toEs(sec, detail)}` : path;
  }
  if (view === "zomboid") {
    const sec = route.pzSection ?? "home";
    const root = `/${lang}/${PZ_SEGMENT}`;
    if (sec === "home") return root;
    if (lang !== "es") return detail ? `${root}/${sec}/${detail}` : `${root}/${sec}`;
    const path = `${root}/${PZ_SECTION_ES[sec]}`;
    return detail ? `${path}/${pzSlugsEs.toEs(sec, detail)}` : path;
  }
  return `/${lang}/${view}`;
}

/** The same page in the other language, for the hreflang links. */
export const routeInLang = (route: Route, lang: Lang): Route => ({ ...route, lang });

/**
 * La dirección que se escribe en la barra al navegar de `from` a `to` (2026-09-29).
 *
 * Es `routePath(to)`, salvo cuando `to` es **la misma página en otro idioma** (el selector EN / ES): ahí viajan también
 * la query y el hash de la dirección actual. Las pestañas guardan su estado en la query (el ítem de la calculadora de
 * drops, el equipo del planificador, el Grial que se mira) y no se remontan al cambiar de idioma: el estado seguía en
 * pantalla pero la dirección lo perdía, y "Copiar enlace" o recargar lo dejaban afuera. Cualquier otra navegación
 * empieza limpia, como siempre.
 *
 * Pura y con la ubicación por argumento (`at`), para probarla sin navegador.
 */
export function navigationPath(from: Route, to: Route, at: { search: string; hash: string }): string {
  const path = routePath(to);
  const samePage = to.lang !== from.lang && routePath({ ...to, lang: from.lang }) === routePath(from);
  return samePage ? path + at.search + at.hash : path;
}

export const SITE_ORIGIN = "https://vestigo.gg";

export const routeUrl = (route: Route): string => SITE_ORIGIN + routePath(route);
