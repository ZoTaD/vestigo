/**
 * Qué busca la barra de arriba dentro de cada juego (2026-10-11).
 *
 * Hasta ese día sólo Valheim buscaba sus fichas mientras se escribe; en Diablo II, Project Zomboid y Rust la barra
 * seguía diciendo "Buscar un jugador" y mandaba a la pestaña Jugador de Deadlock. Ahora cada uno busca en su propio
 * índice y cada resultado lleva a su ficha.
 *
 * Todo se pide recién al enfocar la barra y con `import()`: los índices pesan (el de objetos de Zomboid, ~115 KB con
 * gzip) y la barra viaja en el JS de entrada de todo el sitio.
 */
import type { Lang } from "./i18n";
import type { Route } from "./route";

export interface NavHit {
  key: string;
  name: string;
  /** El nombre en el otro idioma, chico y debajo. */
  alt?: string;
  /** La pestaña a la que pertenece. */
  tab?: string;
  img?: string | null;
  /** La imagen es una foto y no un ícono: llena el recuadro. */
  art?: boolean;
  /** Lo que cambia en la ruta para abrir la ficha. */
  to: Partial<Route>;
}

/** Lo que devuelve un juego ya cargado: busca al instante, sin red. */
export type NavSearcher = (query: string, lang: Lang, max: number) => NavHit[];

/** Los juegos donde la barra busca fichas mientras se escribe. */
export const NAV_SEARCH_GAMES = ["valheim", "d2r", "zomboid", "rust", "terraria", "stardew"] as const;
export type NavSearchGame = (typeof NAV_SEARCH_GAMES)[number];
export const hasNavSearch = (game: string): game is NavSearchGame => (NAV_SEARCH_GAMES as readonly string[]).includes(game);

/** Sin tildes ni mayúsculas, como buscan las secciones. */
const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

interface Entry extends Omit<NavHit, "name" | "alt" | "tab"> {
  en: string;
  es: string;
  tab?: Record<Lang, string>;
  /** Texto de más donde también se busca (el shortname de Rust, `rifle.ak`). */
  extra?: string;
}

/**
 * Primero los que empiezan con lo escrito, después los que lo contienen en el idioma de la página y al final los que
 * sólo coinciden por el otro idioma o por el texto de más. Con varias palabras, las pide todas.
 */
export function searchEntries(entries: Entry[], query: string, lang: Lang, max: number): NavHit[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const words = q.split(" ");
  const starts: Entry[] = [], has: Entry[] = [], other: Entry[] = [];
  for (const e of entries) {
    const own = fold(lang === "es" ? e.es : e.en);
    if (own.startsWith(q)) starts.push(e);
    else if (words.every((w) => own.includes(w))) has.push(e);
    else {
      const hay = `${own} ${fold(lang === "es" ? e.en : e.es)} ${e.extra ? fold(e.extra) : ""}`;
      if (words.every((w) => hay.includes(w))) other.push(e);
    }
    if (starts.length >= max) break;
  }
  return [...starts, ...has, ...other].slice(0, max).map(({ en, es, tab, extra: _extra, ...hit }) => ({
    ...hit,
    name: lang === "es" ? es : en,
    alt: en !== es ? (lang === "es" ? en : es) : undefined,
    tab: tab?.[lang],
  }));
}

const LOADERS: Record<NavSearchGame, () => Promise<NavSearcher>> = {
  async valheim() {
    const [data, copy] = await Promise.all([import("./valheimData"), import("./valheimCopy")]);
    const index = await data.loadIndex();
    return (query, lang, max) =>
      data.searchIndex(index, query, lang, max).map((h) => ({
        key: `${h.tab}/${h.slug}`,
        name: lang === "es" ? h.es : h.en,
        alt: lang === "es" ? h.en : h.es,
        tab: copy.VALHEIM_COPY[lang].tabs[h.tab],
        img: h.icon ? data.iconUrl(h.icon) : h.photo ?? (h.art ? data.artUrl(h.art) : null),
        art: !h.icon,
        to: { view: "valheim", vhSection: h.tab, detail: h.slug },
      }));
  },

  async d2r() {
    const [idx, wiki, copy] = await Promise.all([import("./d2r/index"), import("./d2r/wiki"), import("./d2rCopy")]);
    const tabs = (sec: keyof typeof copy.D2R_COPY.en.tabs) => ({ en: copy.D2R_COPY.en.tabs[sec], es: copy.D2R_COPY.es.tabs[sec] });
    const entries: Entry[] = (await idx.loadD2Index()).map((e) => ({
      key: `${e.sec}/${e.id}`,
      en: e.en,
      es: e.es,
      tab: tabs(e.sec),
      img: wiki.itemImg(e.img),
      to: { view: "d2r", d2Section: e.sec, detail: e.id },
    }));
    return (query, lang, max) => searchEntries(entries, query, lang, max);
  },

  async zomboid() {
    const [items, ui, copy] = await Promise.all([import("./zomboid/items/data"), import("./zomboid/ui"), import("./zomboidCopy")]);
    const tabs = (sec: keyof typeof copy.ZOMBOID_COPY.en.tabs) => ({ en: copy.ZOMBOID_COPY.en.tabs[sec], es: copy.ZOMBOID_COPY.es.tabs[sec] });
    // Los objetos salen de la lista de la pestaña, que trae el ícono. Lo demás son pocas fichas y van sólo con el nombre;
    // las recetas quedan afuera: son 1.170 y casi todas se llaman como el objeto que hacen.
    const entries: Entry[] = (await items.loadItemsList()).rows.map((r) => ({
      key: `items/${r.id}`,
      en: r.en,
      es: r.es,
      tab: tabs("items"),
      img: ui.itemIcon(r.icon),
      to: { view: "zomboid", pzSection: "items", detail: r.id },
    }));
    // Explícitos, como en `zomboid/index.ts`: así Rollup ve cada módulo. Uno que no llegue no tira a los demás.
    const small = await Promise.allSettled([
      import("virtual:pz-names/traits").then((m) => ["traits", m.default] as const),
      import("virtual:pz-names/professions").then((m) => ["professions", m.default] as const),
      import("virtual:pz-names/skills").then((m) => ["skills", m.default] as const),
      import("virtual:pz-names/moodles").then((m) => ["moodles", m.default] as const),
    ]);
    for (const part of small) {
      if (part.status !== "fulfilled") continue;
      const [sec, list] = part.value;
      for (const [id, [en, es]] of Object.entries(list)) {
        entries.push({ key: `${sec}/${id}`, en, es, tab: tabs(sec), to: { view: "zomboid", pzSection: sec, detail: id } });
      }
    }
    return (query, lang, max) => searchEntries(entries, query, lang, max);
  },

  async terraria() {
    const [data, copy] = await Promise.all([import("./terraria/data"), import("./terrariaCopy")]);
    const tab = { en: copy.TERRARIA_COPY.en.tabs.items, es: copy.TERRARIA_COPY.es.tabs.items };
    // Las dos listas: el buscador se arma una vez y sirve en los dos idiomas.
    const [en, es] = await Promise.all([data.loadList("en"), data.loadList("es")]);
    const esName = new Map(es.map((r) => [r.id, r.name]));
    const entries: Entry[] = en.map((r) => ({
      key: String(r.id),
      en: r.name,
      es: esName.get(r.id) ?? r.name,
      tab,
      img: r.w ? `/terraria/items/${r.id}.png` : undefined,
      to: { view: "terraria", trSection: "items", detail: r.slug },
    }));
    return (query, lang, max) => searchEntries(entries, query, lang, max);
  },
  // Stardew Valley (2026-10-22): los objetos y los aldeanos, cada uno a su ficha.
  async stardew() {
    const [data, ui, copy] = await Promise.all([import("./stardew/data"), import("./stardew/ui"), import("./stardewCopy")]);
    const tabs = (sec: "items" | "villagers") => ({ en: copy.STARDEW_COPY.en.tabs[sec], es: copy.STARDEW_COPY.es.tabs[sec] });
    // Las dos listas, como en Terraria: el buscador se arma una vez y sirve en los dos idiomas.
    const [en, es, people] = await Promise.all([data.loadList("en"), data.loadList("es"), data.loadVillagers()]);
    const esName = new Map(es.map((r) => [r.id, r.name]));
    const entries: Entry[] = en.map((r) => ({
      key: `items/${r.id}`,
      en: r.name,
      es: esName.get(r.id) ?? r.name,
      tab: tabs("items"),
      img: `/stardew/items/${ui.spriteFile(r.id)}`,
      to: { view: "stardew", sdSection: "items", detail: r.slug },
    }));
    for (const v of people) {
      entries.push({
        key: `villagers/${v.key}`,
        en: v.name[0],
        es: v.name[1] || v.name[0],
        tab: tabs("villagers"),
        img: `/stardew/portraits/${v.key.toLowerCase()}.png`,
        to: { view: "stardew", sdSection: "villagers", detail: v.slug },
      });
    }
    return (query, lang, max) => searchEntries(entries, query, lang, max);
  },
  async rust() {
    const [data, copy] = await Promise.all([import("./rust/items/data"), import("./rustCopy")]);
    const tab = { en: copy.RUST_COPY.en.tabs.items, es: copy.RUST_COPY.es.tabs.items };
    const entries: Entry[] = (await data.loadList()).rows.map((r) => ({
      key: r.id,
      en: r.en,
      es: r.es ?? r.en,
      extra: r.id,
      tab,
      img: `/rust/items/${r.id}.webp`,
      to: { view: "rust", rsSection: "items", detail: r.slug },
    }));
    return (query, lang, max) => searchEntries(entries, query, lang, max);
  },
};

const pending = new Map<NavSearchGame, Promise<NavSearcher>>();

/** El buscador de un juego, pedido una sola vez. Si la red falla, la próxima vez que se enfoque la barra se reintenta. */
export function loadNavSearcher(game: NavSearchGame): Promise<NavSearcher> {
  if (!pending.has(game)) {
    pending.set(
      game,
      LOADERS[game]().catch((err) => {
        pending.delete(game);
        throw err;
      }),
    );
  }
  return pending.get(game)!;
}
