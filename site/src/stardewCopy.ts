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

/** El orden de las pestañas en la barra, como las del menú del juego. */
export const STARDEW_TABS: StardewSection[] = ["home", "items", "villagers", "bundles"];

export type Quality = "normal" | "silver" | "gold" | "iridium";
export const QUALITIES: Quality[] = ["normal", "silver", "gold", "iridium"];
/** Las profesiones que cambian el precio de venta. */
export type Profession = "tiller" | "artisan" | "rancher" | "fisher" | "angler" | "blacksmith" | "gemologist" | "tapper";
/** Los gustos de regalo, del que más suma al que más resta. */
export type Taste = "love" | "like" | "neutral" | "dislike" | "hate";
export const TASTES: Taste[] = ["love", "like", "neutral", "dislike", "hate"];

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
  items: { h1: string; lede: (n: string) => string };
  villagers: { h1: string; lede: (n: string) => string };
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
  items: { h1: "Stardew Valley items", lede: (n) => `All ${n} items with their price by quality, gifts, bundles and uses.` },
  villagers: { h1: "Stardew Valley villagers", lede: (n) => `All ${n} villagers with their birthday and the gifts they love and hate.` },
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
  items: { h1: "Objetos de Stardew Valley", lede: (n) => `Los ${n} objetos con su precio por calidad, regalos, paquetes y usos.` },
  villagers: { h1: "Aldeanos de Stardew Valley", lede: (n) => `Los ${n} aldeanos con su cumpleaños y los regalos que les encantan y que odian.` },
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
