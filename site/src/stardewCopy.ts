/**
 * Los textos de la sección Stardew Valley (2026-10-22), en inglés y español. Fuera de un componente (prerender,
 * buscador de la barra) se usa `STARDEW_COPY[lang]`; adentro, `useStardewCopy()`.
 *
 * Acá van sólo los textos de la interfaz del sitio. Los nombres de las cosas del juego (objetos, aldeanos, festivales,
 * paquetes) salen de sus textos, en los datos. Las excepciones son las estaciones y las profesiones, que la interfaz
 * nombra sin dato al lado: van copiadas tal cual de los textos del juego, con la clave de donde salen.
 */
import { useLang } from "./i18n";
import type { StardewSection, StardewTab } from "./route";
import type { Group, SourceFilter } from "./stardew/data";

/** El orden de las pestañas en la barra, como las del menú del juego. */
export const STARDEW_TABS: StardewSection[] = ["home", "items", "villagers", "bundles"];

export type Quality = "normal" | "silver" | "gold" | "iridium";
export const QUALITIES: Quality[] = ["normal", "silver", "gold", "iridium"];
/** Las profesiones que cambian el precio de venta. */
export type Profession = "tiller" | "artisan" | "rancher" | "fisher" | "angler" | "blacksmith" | "gemologist" | "tapper";
/** Los gustos de regalo, del que más suma al que más resta. */
export type Taste = "love" | "like" | "neutral" | "dislike" | "hate";
export const TASTES: Taste[] = ["love", "like", "neutral", "dislike", "hate"];

/** Los textos de la pestaña Objetos: la lista y la ficha. */
export interface ItemsCopy {
  h1: string;
  lede: (n: string) => string;
  /** La dirección traía un objeto que no existe: se muestra la lista con este aviso. */
  missing: string;
  back: string;
  search: string;
  searchPlaceholder: string;
  category: string;
  all: string;
  groups: Record<Group, string>;
  from: string;
  anySource: string;
  sources: Record<SourceFilter, string>;
  count: (n: string) => string;
  none: string;
  // La ficha.
  sellPrice: string;
  profession: string;
  noProfession: string;
  energy: string;
  health: string;
  /** Los títulos de los gustos de regalo: "Le encanta a" y la fila de retratos. */
  tasteHeads: Record<Exclude<Taste, "neutral">, string>;
  bundlesTitle: string;
  /** Lo que pide un paquete: "5 de calidad Oro". */
  bundleNeed: (qty: number, quality: string | null) => string;
  turnsInto: string;
  madeIn: string;
  /** Cuántos entran por vez en la máquina, si es más de uno. */
  perBatch: (n: number) => string;
  /** Cuánto tarda: minutos, horas o días, con "≈" si está redondeado. */
  time: (t: { unit: "m" | "h" | "d"; n: number; approx: boolean }) => string;
  usedIn: string;
  madeWith: string;
  kinds: Record<"cook" | "craft", string>;
  /** Cuántos salen de una receta, si es más de uno. */
  yields: (n: number) => string;
  whereTitle: string;
  src: {
    crop: string;
    tree: string;
    shop: string;
    fish: string;
    forage: string;
    monster: string;
    grow: (days: number) => string;
    regrow: (days: number) => string;
    mature: (days: number) => string;
    allYear: string;
  };
}

/** Los textos de la pestaña Aldeanos: la lista y la ficha. */
export interface VillagersCopy {
  h1: string;
  lede: (n: string) => string;
  /** La dirección traía un aldeano que no existe: se muestra la lista con este aviso. */
  missing: string;
  back: string;
  count: (n: string) => string;
  /** Los filtros: cortejables y estación del cumpleaños. */
  filterBirthday: string;
  filterRomance: string;
  allSeasons: string;
  /** "Otoño 13". */
  birthday: (season: string, day: number) => string;
  birthdayLabel: string;
  romanceable: string;
  region: string;
  /**
   * Dónde vive, por la `HomeRegion` del juego. `Other` (el Mago, Krobus, el Enano, Leo) no tiene un lugar que nombrar
   * y no se muestra. `Town` y `Desert` son los nombres del mapa del juego (`Utility.cs.5786` y `5861`).
   */
  regions: Record<string, string>;
  easyTitle: string;
  easyHint: string;
  /** Los títulos de las filas de gustos. */
  tasteHeads: Record<Exclude<Taste, "neutral">, string>;
  /** Cuántos objetos hay en una fila de gustos. */
  tasteCount: (n: string) => string;
}

export interface StardewCopy {
  tabs: Record<StardewSection, string>;
  /** La insignia de una pestaña que todavía no tiene página. */
  soon: string;
  loading: string;
  loadError: string;
  retry: string;
  /** La marca de oro del juego, pegada a la cifra ("250g"). */
  gold: string;
  home: {
    kicker: string;
    h1: string;
    lede: (items: string, villagers: string, bundles: string) => string;
    /** Qué hay en cada pestaña: la tarjeta de la portada. */
    cards: Record<StardewTab, string>;
    featured: string;
    featuredHint: string;
    season: string;
    seasonPick: string;
    birthdays: string;
    festivals: string;
    day: (n: number) => string;
    about: (version: string) => string;
  };
  items: ItemsCopy;
  villagers: VillagersCopy;
  bundles: { h1: string; lede: (n: string) => string };
  qualities: Record<Quality, string>;
  professions: Record<Profession, string>;
  tastes: Record<Taste, string>;
  /** Primavera, verano, otoño, invierno: `Utility.cs.5680` a `5683` de `Strings/StringsFromCSFiles`. */
  seasons: [string, string, string, string];
}

const EN: StardewCopy = {
  tabs: { home: "Home", items: "Items", villagers: "Villagers", bundles: "Community Center" },
  soon: "Soon",
  loading: "Loading…",
  loadError: "This page couldn't load.",
  retry: "Try again",
  gold: "g",
  home: {
    kicker: "Stardew Valley 1.6 guide",
    h1: "Everything in the valley, in one menu",
    lede: (items, villagers, bundles) =>
      `${items} items with their price by quality and where to get them, ${villagers} villagers with every gift they love or hate, and the ${bundles} Community Center bundles.`,
    cards: {
      items: "Price by quality, gifts, bundles, machines and where to find each one.",
      villagers: "Birthdays, loved gifts and the whole list of what each villager likes.",
      bundles: "Every room and bundle with what goes in it. Tick them off as you go.",
    },
    featured: "Most looked up",
    featuredHint: "Open an item to see its prices, who loves it and what it turns into.",
    season: "This season",
    seasonPick: "Season",
    birthdays: "Birthdays",
    festivals: "Festivals",
    day: (n) => `Day ${n}`,
    about: (version) => `Updated for version ${version}.`,
  },
  items: {
    h1: "Stardew Valley items",
    lede: (n) => `All ${n} items with their price by quality, gifts, bundles and uses.`,
    missing: "That item isn't in the game: here's the whole list.",
    back: "All items",
    search: "Search",
    searchPlaceholder: "Melon, Keg, Pufferfish…",
    category: "Category",
    all: "All",
    groups: { crops: "Crops", fish: "Fish", artisan: "Artisan goods", minerals: "Minerals & gems", cooking: "Cooking", forage: "Forage", machines: "Machines" },
    from: "Where it comes from",
    anySource: "Anywhere",
    sources: { grown: "Grown", fished: "Fished", bought: "Sold in shops", bundle: "For the Community Center" },
    count: (n) => `${n} items`,
    none: "No item matches.",
    sellPrice: "Sell price",
    profession: "Profession",
    noProfession: "None",
    energy: "Energy",
    health: "Health",
    tasteHeads: { love: "Loved by", like: "Liked by", dislike: "Disliked by", hate: "Hated by" },
    bundlesTitle: "Community Center",
    bundleNeed: (qty, quality) => `${qty}${quality ? ` · ${quality} quality` : ""}`,
    turnsInto: "Turns into",
    madeIn: "Comes out of",
    perBatch: (n) => `takes ${n}`,
    time: ({ unit, n, approx }) => `${approx ? "≈ " : ""}${unit === "m" ? `${n} min` : unit === "h" ? `${n} h` : n === 1 ? "1 day" : `${n} days`}`,
    usedIn: "Used in",
    madeWith: "Recipe",
    kinds: { cook: "Cooking", craft: "Crafting" },
    yields: (n) => `makes ${n}`,
    whereTitle: "Where to get it",
    src: {
      crop: "Grows from",
      tree: "Fruit tree",
      shop: "Sold by",
      fish: "Caught in",
      forage: "Found in",
      monster: "Dropped by",
      grow: (d) => `${d} days to grow`,
      regrow: (d) => `regrows every ${d} days`,
      mature: (d) => `${d} days to mature`,
      allYear: "All year",
    },
  },
  villagers: {
    h1: "Stardew Valley villagers",
    lede: (n) => `All ${n} villagers with their birthday and the gifts they love and hate.`,
    missing: "That villager does not exist. Here are all of them.",
    back: "All villagers",
    count: (n) => `${n} villagers`,
    filterBirthday: "Birthday",
    filterRomance: "Romanceable",
    allSeasons: "Any season",
    birthday: (season, day) => `${season} ${day}`,
    birthdayLabel: "Birthday",
    romanceable: "Romanceable",
    region: "Lives in",
    regions: { Town: "Pelican Town", Desert: "Calico Desert" },
    easyTitle: "Easy gifts",
    easyHint: "Loved gifts you can grow or buy.",
    tasteHeads: { love: "Loves", like: "Likes", dislike: "Dislikes", hate: "Hates" },
    tasteCount: (n) => `${n} items`,
  },
  bundles: { h1: "Community Center bundles", lede: (n) => `The ${n} bundles of the Community Center, room by room.` },
  qualities: { normal: "Normal", silver: "Silver", gold: "Gold", iridium: "Iridium" },
  // `LevelUp_ProfessionName_*` de `Strings/UI`.
  professions: {
    tiller: "Tiller",
    artisan: "Artisan",
    rancher: "Rancher",
    fisher: "Fisher",
    angler: "Angler",
    blacksmith: "Blacksmith",
    gemologist: "Gemologist",
    tapper: "Tapper",
  },
  tastes: { love: "Loves it", like: "Likes it", neutral: "Neutral", dislike: "Dislikes it", hate: "Hates it" },
  seasons: ["Spring", "Summer", "Fall", "Winter"],
};

const ES: StardewCopy = {
  tabs: { home: "Inicio", items: "Objetos", villagers: "Aldeanos", bundles: "Centro Comunitario" },
  soon: "Pronto",
  loading: "Cargando…",
  loadError: "Esta página no se pudo cargar.",
  retry: "Reintentar",
  gold: "g",
  home: {
    kicker: "Guía de Stardew Valley 1.6",
    h1: "Todo el valle, en un solo menú",
    lede: (items, villagers, bundles) =>
      `${items} objetos con su precio por calidad y dónde se consiguen, ${villagers} aldeanos con cada regalo que les encanta o que odian, y los ${bundles} paquetes del Centro Comunitario.`,
    cards: {
      items: "Precio por calidad, regalos, paquetes, máquinas y dónde se consigue cada uno.",
      villagers: "Cumpleaños, regalos favoritos y la lista entera de lo que le gusta a cada aldeano.",
      bundles: "Cada sala y cada paquete con lo que lleva. Tachalos a medida que los completás.",
    },
    featured: "Los más buscados",
    featuredHint: "Abrí un objeto para ver sus precios, a quién le encanta y en qué se transforma.",
    season: "Esta temporada",
    seasonPick: "Estación",
    birthdays: "Cumpleaños",
    festivals: "Festivales",
    day: (n) => `Día ${n}`,
    about: (version) => `Al día con la versión ${version}.`,
  },
  items: {
    h1: "Objetos de Stardew Valley",
    lede: (n) => `Los ${n} objetos con su precio por calidad, regalos, paquetes y usos.`,
    missing: "Ese objeto no está en el juego: acá está la lista entera.",
    back: "Todos los objetos",
    search: "Buscar",
    searchPlaceholder: "Melón, barril, pez globo…",
    category: "Categoría",
    all: "Todo",
    groups: { crops: "Cultivos", fish: "Peces", artisan: "Artesanía", minerals: "Minerales y gemas", cooking: "Cocina", forage: "Forraje", machines: "Máquinas" },
    from: "De dónde sale",
    anySource: "De cualquier lado",
    sources: { grown: "Se cultiva", fished: "Se pesca", bought: "Se compra", bundle: "Para el Centro Comunitario" },
    count: (n) => `${n} objetos`,
    none: "Ningún objeto coincide.",
    sellPrice: "Precio de venta",
    profession: "Profesión",
    noProfession: "Ninguna",
    energy: "Energía",
    health: "Salud",
    tasteHeads: { love: "Le encanta a", like: "Le gusta a", dislike: "No le gusta a", hate: "Lo odia" },
    bundlesTitle: "Centro Comunitario",
    bundleNeed: (qty, quality) => `${qty}${quality ? ` · calidad ${quality}` : ""}`,
    turnsInto: "Se transforma en",
    madeIn: "Sale de",
    perBatch: (n) => `entran ${n}`,
    time: ({ unit, n, approx }) => `${approx ? "≈ " : ""}${unit === "m" ? `${n} min` : unit === "h" ? `${n} h` : n === 1 ? "1 día" : `${n} días`}`,
    usedIn: "Se usa en",
    madeWith: "Se fabrica con",
    kinds: { cook: "Cocina", craft: "Fabricación" },
    yields: (n) => `salen ${n}`,
    whereTitle: "Dónde se consigue",
    src: {
      crop: "Se cultiva con",
      tree: "Árbol frutal",
      shop: "Lo vende",
      fish: "Se pesca en",
      forage: "Se encuentra en",
      monster: "Lo suelta",
      grow: (d) => `${d} días hasta la cosecha`,
      regrow: (d) => `vuelve a dar cada ${d} días`,
      mature: (d) => `${d} días hasta dar fruto`,
      allYear: "Todo el año",
    },
  },
  villagers: {
    h1: "Aldeanos de Stardew Valley",
    lede: (n) => `Los ${n} aldeanos con su cumpleaños y los regalos que les encantan y que odian.`,
    missing: "Ese aldeano no existe. Acá están todos.",
    back: "Todos los aldeanos",
    count: (n) => `${n} aldeanos`,
    filterBirthday: "Cumpleaños",
    filterRomance: "Cortejables",
    allSeasons: "Cualquier estación",
    birthday: (season, day) => `${season} ${day}`,
    birthdayLabel: "Cumpleaños",
    romanceable: "Se puede cortejar",
    region: "Vive en",
    regions: { Town: "Pueblo Pelícano", Desert: "Desierto de Calico" },
    easyTitle: "Regalos fáciles",
    easyHint: "Lo que le encanta y podés cultivar o comprar.",
    tasteHeads: { love: "Le encanta", like: "Le gusta", dislike: "No le gusta", hate: "Lo odia" },
    tasteCount: (n) => `${n} objetos`,
  },
  bundles: { h1: "Paquetes del Centro Comunitario", lede: (n) => `Los ${n} paquetes del Centro Comunitario, sala por sala.` },
  qualities: { normal: "Normal", silver: "Plata", gold: "Oro", iridium: "Iridio" },
  // `LevelUp_ProfessionName_*` de `Strings/UI.es-ES`.
  professions: {
    tiller: "Labrador",
    artisan: "Artesano",
    rancher: "Ranchero",
    fisher: "Pescador",
    angler: "Pesquero",
    blacksmith: "Herrero",
    gemologist: "Gemólogo",
    tapper: "Resinador",
  },
  tastes: { love: "Le encanta", like: "Le gusta", neutral: "Le da igual", dislike: "No le gusta", hate: "Lo odia" },
  seasons: ["Primavera", "Verano", "Otoño", "Invierno"],
};

export const STARDEW_COPY: Record<"en" | "es", StardewCopy> = { en: EN, es: ES };
export const useStardewCopy = (): StardewCopy => STARDEW_COPY[useLang().lang];
