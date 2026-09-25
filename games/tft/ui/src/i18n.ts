import { createContext, useContext } from "react";

/**
 * Every word on screen, in both languages.
 *
 * English is the default and the source of truth: the first readers of this site
 * are Riot's third-party review and Overwolf's dev-rel team, and the app has to
 * describe itself to them in their language without anyone flipping a switch.
 * Spanish is typed against the English shape, so a missing translation is a
 * compile error rather than a blank on the page.
 *
 * Prose lives here and only here. Nothing that renders text should hold a
 * sentence of its own — that is what let the whole app end up single-language.
 */

export type Lang = "en" | "es";

export const DEFAULT_LANG: Lang = "en";
const STORAGE_KEY = "vestigo.lang";

export function storedLang(): Lang {
  if (typeof localStorage === "undefined") return DEFAULT_LANG;
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "es" || saved === "en" ? saved : DEFAULT_LANG;
}

export function rememberLang(lang: Lang): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, lang);
}

const EN = {
  brand: "Vestigo",
  games: {
    tft: "Teamfight Tactics",
    tftShort: "TFT",
    deadlock: "Deadlock",
    dota: "Dota 2",
    poe2: "Path of Exile 2",
    poe2Short: "PoE 2",
    valheim: "Valheim",
    diablo2: "Diablo II: Resurrected",
    diablo2Short: "Diablo II",
    soon: "Soon",
    /** La insignia de una pestaña que ya se puede usar pero todavía se mueve. */
    beta: "Beta",
  },
  sections: {
    home: "Home",
    meta: "Meta",
    units: "Units",
    items: "Items",
    ladder: "Ladder",
    player: "Player",
  },
  language: {
    label: "Language",
    en: "EN",
    es: "ES",
  },

  /** La cáscara del rediseño del 2026-09-06: buscador, "cómo se mide", pie. */
  shell: {
    search: "Search a player",
    searchFor: (game: string) => `Search a ${game} player`,
    searchItem: "Search an item",
    searchItemFor: (game: string) => `Search a ${game} item`,
    how: "How it's measured",
    menu: "Menu",
    measuredAt: (when: string) => `Measured ${when}`,
  },

  home: {
    eyebrow: "Data, guides and tools",
    /**
     * **"Vestigo" is Latin for "I track".** The line says so, which is a better
     * job for a masthead than promising an improvement: it tells a first-time
     * visitor what the name means in four words.
     *
     * "Every game" and not "every match" since 2026-09-23: the site stopped being
     * only match analysis — tier lists, builds, a wiki for Valheim, tools for
     * Diablo II — and "match" left half of it out. Chosen by ZoTaD.
     *
     * It is set in two parts because the home prints the second one as an
     * outline — see `title-break` in `styles/home.css`.
     */
    title: "Every game",
    titleBreak: "leaves a trace",
    lead:
      "Tier lists, builds, guides and match analysis, built from each game's own data " +
      "instead of opinions.",
    counts: {
      matches: "matches read",
      measured: "last measured",
    },
    /** How old the freshest measurement is, said in words. */
    fresh: {
      today: "today",
      yesterday: "yesterday",
      days: (n: number) => `${n} days ago`,
    },
    /** The captions under each panel's figures. The figures themselves are
     *  measured — these only name them. */
    figures: {
      placement: (name: string) => `average placement · ${name}`,
      winRate: (name: string) => `win rate · ${name}`,
      matchesSet: (set: string) => `matches · set ${set}`,
      matchesBand: (band: string) => `matches · ${band}`,
      /** La banda que publica `heroes.json`, que es la que muestra el panel. */
      topBand: "Phantom+",
      unmeasured: "not measured yet",
    },
    /** El buscador grande de la portada (rediseño del 2026-09-06). */
    search: {
      label: "Find your profile",
      placeholder: { deadlock: "Steam name", tft: "Riot ID, e.g. Name#TAG" },
      go: "Search",
      lastSeen: "Last seen",
    },
    /** "Hoy en el meta": tres datos por juego que cambian todos los días. */
    today: {
      heading: "Today in the meta",
      bestHero: "Best hero",
      rising: "Rising since the patch",
      mostPlayed: "Most played",
      bestValue: "Best value item",
      bestComp: "Best comp",
      bestItem: "Best item",
      wins: "win rate",
      use: "use",
      placement: "avg placement",
      over: (pts: string) => `+${pts} over its price`,
      better: (pts: string) => `${pts} better placement`,
      band: (band: string) => `in ${band}`,
      set: (set: string) => `set ${set}`,
    },
    games: {
      heading: "Where you can use it",
      cta: "Open",
      soonCta: "Coming soon",
      tft: "Meta report and match analysis, live now.",
      deadlock: "Hero and item tier lists, live now.",
      dota: "Match analysis, each patch's meta, and the heroes and items that win.",
      poe2: "Each league's meta and the builds that top players actually run.",
      valheim: "A wiki and tools for Valheim 1.0.",
      diablo2: "Breakpoints, runewords and terror zones.",
      soonHeading: "On the way",
      tftCta: (set: string, n: string) => `Set ${set} comps · ${n}`,
      deadlockCta: (n: string) => `Hero tier list · ${n}`,
      profile: "Your profile",
      valheimLive: "Every recipe, food, weapon, piece and creature in Valheim 1.0, where each thing comes from, and every patch.",
      valheimCta: (n: string) => `Encyclopedia · ${n} entries`,
      valheimPatches: "Patch notes",
      valheimEntries: "entries, with official names in English and Spanish",
      valheimBiomes: "biomes, each with its guide and its boss",
    },
  },


  /** Path of Exile 2 (2026-09-23): por ahora sólo la pestaña Economía. */
  poe2: {
    tabs: { economy: "Economy", encyclopedia: "Encyclopedia", patches: "Patches", tree: "Passive Tree", regex: "Regex" },
    soon: "Soon",
    league: "League",
    title: "Economy",
    lede: "What everything is worth this league, and what is moving this week.",
    loading: "Loading prices…",
    loadError: "We couldn't load this league's prices.",
    empty: "This league has no prices yet.",
    fewData: "Too little trading in this league to tell.",
    mode: "Mode",
    softcore: "Softcore",
    hardcore: "Hardcore",
    permanent: "permanent",
    market: (league: string) => `${league} market`,
    reference: "Reference currency",
    perDivine: "per divine",
    days7: "7 d",
    rising: "Rising",
    falling: "Falling",
    traded: "Most traded",
    tradedWord: "traded",
    priceList: "Price list",
    exchange: "Exchange",
    uniques: "Uniques",
    searchTab: "Search this tab… (name, base or modifier)",
    count: (n: number) => `${n} items`,
    colItem: "Item",
    colPrice: "Price",
    colWeek: "7 days",
    colChange: "Change",
    colVolume: "Volume",
    colListings: "Listings",
    fewSales: "few sales",
    priceIn: (league: string) => `Price in ${league}`,
    reqLevel: "Requires level",
    corrupted: "Corrupted",
    listings: (n: string) => `${n} listings`,
    chaos: "chaos",
    exalted: "exalted",
    note: (league: string, date: string) =>
      `${league} league prices, updated ${date}. "Rising", "Falling" and "Most traded" only count items with at least 5 divines of volume, so things that barely sell don't take over.`,
  },

  footer: {
    sources:
      "Match data from the Riot Games API · Portraits, items and names from CommunityDragon",
    // The footer is on every page, but the sources are not the same on every
    // page: nothing on /deadlock ever touched Riot or CommunityDragon. Naming
    // the wrong source is worse than naming none, so the line follows the game.
    sourcesDeadlock:
      "Match data from the public deadlock-api.com snapshot · Hero and item art from Valve",
    sourcesPoe2: "Fontin typeface by Jos Buivenga (exljbris)",
    sourcesValheim: "Data and pictures from the Valheim game files. Averia typeface by Dan Sayers (SIL Open Font License).",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    // Both documents are English-only, so a Spanish reader deserves fair warning
    // before the click rather than a surprise after it.
    englishOnly: "",
    disclaimer:
      "Vestigo isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot " +
      "Games or anyone officially involved in producing or managing Riot Games properties. Riot " +
      "Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.",
    disclaimerValve:
      "Vestigo isn't endorsed by Valve Corporation. Deadlock, Dota 2 and all associated " +
      "properties are trademarks or registered trademarks of Valve Corporation.",
  },

  // Said plainly, and without a pre-ticked box or a greyed-out "decline": the
  // refusal has to be as easy as the acceptance, or the consent is not consent.
  //
  // The provider is named in the Privacy Policy, not here (ZoTaD, 2026-09-23):
  // informed consent needs the kind of cookie and its purpose, and the link
  // below carries the rest — which cookies, what reaches Google, for how long.
  consent: {
    title: "Analytics cookies",
    body: "We use cookies to see which pages get used and what to improve next. If you decline, nothing loads and the site works the same.",
    accept: "Accept",
    decline: "Decline",
    more: "Privacy Policy",
    settings: "Cookies",
    on: "Analytics: on",
    off: "Analytics: off",
  },

};

const ES: typeof EN = {
  brand: "Vestigo",
  games: {
    tft: "Teamfight Tactics",
    tftShort: "TFT",
    deadlock: "Deadlock",
    dota: "Dota 2",
    poe2: "Path of Exile 2",
    poe2Short: "PoE 2",
    valheim: "Valheim",
    diablo2: "Diablo II: Resurrected",
    diablo2Short: "Diablo II",
    soon: "Pronto",
    /** La insignia de una pestaña que ya se puede usar pero todavía se mueve. */
    beta: "Beta",
  },
  sections: {
    home: "Inicio",
    meta: "Meta",
    units: "Unidades",
    items: "Ítems",
    ladder: "Ladder",
    player: "Jugador",
  },
  language: {
    label: "Idioma",
    en: "EN",
    es: "ES",
  },

  shell: {
    search: "Buscar un jugador",
    searchFor: (game: string) => `Buscar un jugador de ${game}`,
    searchItem: "Buscar un objeto",
    searchItemFor: (game: string) => `Buscar un objeto de ${game}`,
    how: "Cómo se mide",
    menu: "Menú",
    measuredAt: (when: string) => `Medido ${when}`,
  },

  home: {
    eyebrow: "Datos, guías y herramientas",
    /** Ver la nota de la versión en inglés: el lema explica el nombre. */
    title: "Todo juego",
    titleBreak: "deja rastro",
    lead:
      "Tier lists, builds, guías y análisis de partidas, hechos con los datos de cada juego " +
      "y no con opiniones.",
    counts: {
      matches: "partidas leídas",
      measured: "última medición",
    },
    fresh: {
      today: "hoy",
      yesterday: "ayer",
      days: (n: number) => `hace ${n} días`,
    },
    figures: {
      placement: (name: string) => `posición media · ${name}`,
      winRate: (name: string) => `victorias · ${name}`,
      matchesSet: (set: string) => `partidas · set ${set}`,
      matchesBand: (band: string) => `partidas · ${band}`,
      topBand: "Phantom+",
      unmeasured: "todavía sin medir",
    },
    search: {
      label: "Buscá tu perfil",
      placeholder: { deadlock: "Nombre de Steam", tft: "Riot ID, p. ej. Nombre#TAG" },
      go: "Buscar",
      lastSeen: "Último visto",
    },
    today: {
      heading: "Hoy en el meta",
      bestHero: "Mejor héroe",
      rising: "Sube desde el parche",
      mostPlayed: "Más jugado",
      bestValue: "Ítem que más rinde",
      bestComp: "Mejor comp",
      bestItem: "Mejor ítem",
      wins: "victorias",
      use: "uso",
      placement: "posición media",
      over: (pts: string) => `+${pts} sobre su precio`,
      better: (pts: string) => `${pts} mejor posición`,
      band: (band: string) => `en ${band}`,
      set: (set: string) => `set ${set}`,
    },
    games: {
      heading: "Dónde puedes usarlo",
      cta: "Entrar",
      soonCta: "Muy pronto",
      tft: "Reporte del meta y análisis de partidas, funcionando ya.",
      deadlock: "Tier list de héroes e ítems, funcionando ya.",
      dota: "Análisis de tus partidas, la meta de cada parche y los héroes y objetos que ganan.",
      poe2: "La meta de cada liga y las builds que usan de verdad los de arriba.",
      valheim: "Una wiki y herramientas para Valheim 1.0.",
      diablo2: "Breakpoints, palabras rúnicas y zonas de terror.",
      soonHeading: "En camino",
      tftCta: (set: string, n: string) => `Comps del set ${set} · ${n}`,
      deadlockCta: (n: string) => `Tier list de héroes · ${n}`,
      profile: "Tu perfil",
      valheimLive: "Cada receta, comida, arma, pieza y criatura de Valheim 1.0, de dónde sale cada cosa y todos los parches.",
      valheimCta: (n: string) => `Enciclopedia · ${n} fichas`,
      valheimPatches: "Parches",
      valheimEntries: "fichas, con los nombres oficiales en español e inglés",
      valheimBiomes: "biomas, cada uno con su guía y su jefe",
    },
  },


  poe2: {
    tabs: { economy: "Economía", encyclopedia: "Enciclopedia", patches: "Parches", tree: "Árbol de pasivas", regex: "Regex" },
    soon: "Pronto",
    league: "Liga",
    title: "Economía",
    lede: "Qué vale cada cosa en la liga y qué se está moviendo esta semana.",
    loading: "Cargando precios…",
    loadError: "No pudimos cargar los precios de esta liga.",
    empty: "Esta liga todavía no tiene precios.",
    fewData: "En esta liga se comercia demasiado poco para saberlo.",
    mode: "Modo",
    softcore: "Softcore",
    hardcore: "Hardcore",
    permanent: "permanente",
    market: (league: string) => `Mercado de ${league}`,
    reference: "Moneda de referencia",
    perDivine: "por divino",
    days7: "7 d",
    rising: "Lo que más sube",
    falling: "Lo que más baja",
    traded: "Lo más comerciado",
    tradedWord: "comerciados",
    priceList: "Lista de precios",
    exchange: "Intercambio",
    uniques: "Únicos",
    searchTab: "Buscar en la pestaña… (nombre, base o modificador)",
    count: (n: number) => `${n} objetos`,
    colItem: "Objeto",
    colPrice: "Precio",
    colWeek: "7 días",
    colChange: "Cambio",
    colVolume: "Volumen",
    colListings: "Publicaciones",
    fewSales: "pocas ventas",
    priceIn: (league: string) => `Precio en ${league}`,
    reqLevel: "Requiere nivel",
    corrupted: "Corrompido",
    listings: (n: string) => `${n} publicaciones`,
    chaos: "caos",
    exalted: "exaltados",
    note: (league: string, date: string) =>
      `Precios de la liga ${league}, actualizados el ${date}. "Sube", "baja" y "comerciado" cuentan sólo objetos con al menos 5 divinos de volumen, para que no manden los que casi no se venden.`,
  },

  footer: {
    sources:
      "Datos de partidas de la API de Riot Games · Retratos, ítems y nombres de CommunityDragon",
    sourcesDeadlock:
      "Datos de partidas del snapshot público de deadlock-api.com · Arte de héroes y objetos de Valve",
    sourcesPoe2: "Tipografía Fontin de Jos Buivenga (exljbris)",
    sourcesValheim: "Datos e imágenes de los archivos del juego Valheim. Tipografía Averia de Dan Sayers (SIL Open Font License).",
    privacy: "Política de Privacidad",
    terms: "Términos del Servicio",
    englishOnly: "(en inglés)",
    disclaimer:
      "Vestigo no está avalado por Riot Games y no refleja las opiniones ni los puntos de vista " +
      "de Riot Games ni de nadie oficialmente involucrado en la producción o gestión de las " +
      "propiedades de Riot Games. Riot Games y todas sus propiedades asociadas son marcas " +
      "comerciales o marcas registradas de Riot Games, Inc.",
    disclaimerValve:
      "Vestigo tampoco está avalado por Valve Corporation. Deadlock, Dota 2 y todas sus " +
      "propiedades asociadas son marcas comerciales o marcas registradas de Valve Corporation.",
  },

  consent: {
    title: "Cookies de análisis",
    body: "Usamos cookies para saber qué páginas se usan y qué conviene mejorar. Si las rechazás, no se carga nada y el sitio funciona igual.",
    accept: "Aceptar",
    decline: "Rechazar",
    more: "Política de privacidad",
    settings: "Cookies",
    on: "Analítica: activada",
    off: "Analítica: desactivada",
  },

};

export const COPY: Record<Lang, typeof EN> = { en: EN, es: ES };

export const LangContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({
  lang: DEFAULT_LANG,
  setLang: () => {},
});

export const useLang = () => useContext(LangContext);
export const useCopy = () => COPY[useLang().lang];
/** Dates and thousands separators follow the language, not the machine. */
export const useLocale = () => (useLang().lang === "es" ? "es-AR" : "en-US");
