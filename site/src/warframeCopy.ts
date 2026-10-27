/**
 * Los textos de la sección Warframe (2026-10-27), en inglés y español. Fuera de un componente (prerender, buscador de
 * la barra) se usa `WF_COPY[lang]`; adentro, `useWfCopy()`.
 *
 * Acá van sólo los textos de la interfaz del sitio. Los nombres, descripciones y estadísticas de las cosas del juego
 * salen siempre del export oficial (`_en` y `_es`), en los datos. Las excepciones son las rarezas, las polaridades, los
 * tipos de daño y las eras de reliquia, que la interfaz nombra sin dato al lado.
 */
import { useLang } from "./i18n";
import type { WfSection, WfTab } from "./route";

/** El orden de las pestañas en la barra. */
export const WF_TABS: WfSection[] = ["home", "arsenal", "relics", "farming", "mods"];

/** Las rarezas de un mod, como las deja `site_data.py` (`r.title()`). */
export type WfRarity = "Common" | "Uncommon" | "Rare" | "Legendary";
/** Las polaridades de `POLARITIES` en `site_data.py`. */
export type WfPolarity = "madurai" | "vazarin" | "naramon" | "zenurik" | "unairu" | "umbra" | "penjaga" | "universal" | "any";
/** Los tipos de daño de `DAMAGE_TYPES` en `site_data.py`, en el mismo orden. */
export type WfDamage =
  | "impact" | "puncture" | "slash" | "heat" | "cold" | "electricity" | "toxin" | "blast" | "radiation" | "gas"
  | "magnetic" | "viral" | "corrosive" | "void" | "tau" | "cinematic" | "shield_drain" | "health_drain" | "energy_drain" | "true";
/** Las eras de reliquia (`ERAS` en `site_data.py`) y Omnia, que sólo aparece en las fisuras en vivo. */
export type WfEra = "Lith" | "Meso" | "Neo" | "Axi" | "Requiem" | "Vanguard" | "Omnia";

type Seo = { title: string; description: string };

export interface WfCopy {
  tabs: Record<WfSection, string>;
  /** La insignia de una pestaña que todavía no tiene página. */
  soon: string;
  loading: string;
  loadError: string;
  retry: string;
  seo: Record<WfSection, Seo>;
  home: {
    kicker: string;
    h1: string;
    lede: (arsenal: string, relics: string, farming: string, mods: string) => string;
    /** Qué hay en cada pestaña: la tarjeta de la portada. */
    cards: Record<WfTab, string>;
    live: {
      heading: string;
      cycles: string;
      cetus: string;
      vallis: string;
      cambion: string;
      /** Cada ciclo: el estado. */
      state: { day: string; night: string; warm: string; cold: string; fass: string; vome: string };
      left: (time: string) => string;
      baro: string;
      baroAt: (place: string) => string;
      baroHere: (time: string) => string;
      baroSoon: (time: string) => string;
      fissures: string;
      fissuresNone: string;
      steel: string;
      sortie: string;
      sortieBoss: (boss: string) => string;
    };
    about: string;
  };
  arsenal: { h1: string; lede: (n: string) => string };
  relics: { h1: string; lede: (n: string) => string };
  farming: { h1: string; lede: (n: string) => string };
  mods: { h1: string; lede: (n: string) => string };
  rarity: Record<WfRarity, string>;
  polarity: Record<WfPolarity, string>;
  /** Los nombres de los tipos de daño (`DAMAGE_TYPES`). */
  damage: Record<WfDamage, string>;
  era: Record<WfEra, string>;
  /** El rótulo de una reliquia que no cae en ninguna misión. */
  vault: string;
  /** El texto de una parte o plano que no aparece en ninguna tabla de drops. */
  noDrops: string;
}

const EN: WfCopy = {
  tabs: { home: "Home", arsenal: "Arsenal", relics: "Relics", farming: "Where to farm", mods: "Mods" },
  soon: "Soon",
  loading: "Loading…",
  loadError: "This page couldn't load.",
  retry: "Try again",
  seo: {
    home: {
      title: "Warframe: Arsenal, relics, where to farm and mods | Vestigo",
      description: "Every Warframe and weapon with its parts, every relic with its drops, where to farm each resource and every mod, with the day's fissures, Baro and cycles.",
    },
    arsenal: { title: "Warframe Arsenal: Warframes, weapons and their parts | Vestigo", description: "Every Warframe, weapon and companion with its stats, abilities, recipe and where each part drops." },
    relics: { title: "Warframe relics: drops and Vault status | Vestigo", description: "Every Lith, Meso, Neo and Axi relic with its six rewards by refinement, where it drops, and whether it is in the Vault." },
    farming: { title: "Warframe: where to farm every resource | Vestigo", description: "Every resource with the planets and missions where it drops, and what you need it for." },
    mods: { title: "Warframe mods and arcanes: stats and drops | Vestigo", description: "Every mod and arcane with its polarity, drain, rank-by-rank stats and where it drops." },
  },
  home: {
    kicker: "Warframe guide",
    h1: "Everything for your Arsenal",
    lede: (arsenal, relics, farming, mods) =>
      `${arsenal} Warframes and weapons with their parts and recipes, ${relics} relics with every reward, ${farming} resources with where to farm them and ${mods} mods and arcanes.`,
    cards: {
      arsenal: "Stats, abilities, recipe and where each part drops, for every Warframe and weapon.",
      relics: "The six rewards by refinement, where the relic drops and whether it is in the Vault.",
      farming: "Which planets and missions drop each resource, and what it is for.",
      mods: "Polarity, drain, stats by rank and where each mod and arcane drops.",
    },
    live: {
      heading: "Right now",
      cycles: "Open worlds",
      cetus: "Plains of Eidolon",
      vallis: "Orb Vallis",
      cambion: "Cambion Drift",
      state: { day: "Day", night: "Night", warm: "Warm", cold: "Cold", fass: "Fass", vome: "Vome" },
      left: (time) => `${time} left`,
      baro: "Baro Ki'Teer",
      baroAt: (place) => `At ${place}`,
      baroHere: (time) => `Leaves in ${time}`,
      baroSoon: (time) => `Arrives in ${time}`,
      fissures: "Void fissures",
      fissuresNone: "No open fissures.",
      steel: "Steel Path",
      sortie: "Sortie",
      sortieBoss: (boss) => `Boss: ${boss}`,
    },
    about: "Warframe is a trademark of Digital Extremes. Vestigo is an unofficial fan site.",
  },
  arsenal: { h1: "Warframe Arsenal", lede: (n) => `All ${n} Warframes and weapons with their stats, recipes and parts.` },
  relics: { h1: "Warframe relics", lede: (n) => `All ${n} relics with their rewards and where to get them.` },
  farming: { h1: "Where to farm in Warframe", lede: (n) => `All ${n} resources with the missions where they drop.` },
  mods: { h1: "Warframe mods and arcanes", lede: (n) => `All ${n} mods and arcanes with their stats and drops.` },
  rarity: { Common: "Common", Uncommon: "Uncommon", Rare: "Rare", Legendary: "Legendary" },
  polarity: { madurai: "Madurai", vazarin: "Vazarin", naramon: "Naramon", zenurik: "Zenurik", unairu: "Unairu", umbra: "Umbra", penjaga: "Penjaga", universal: "Universal", any: "Any" },
  damage: {
    impact: "Impact", puncture: "Puncture", slash: "Slash", heat: "Heat", cold: "Cold", electricity: "Electricity", toxin: "Toxin", blast: "Blast",
    radiation: "Radiation", gas: "Gas", magnetic: "Magnetic", viral: "Viral", corrosive: "Corrosive", void: "Void", tau: "Tau", cinematic: "Cinematic",
    shield_drain: "Shield drain", health_drain: "Health drain", energy_drain: "Energy drain", true: "True",
  },
  era: { Lith: "Lith", Meso: "Meso", Neo: "Neo", Axi: "Axi", Requiem: "Requiem", Vanguard: "Vanguard", Omnia: "Omnia" },
  vault: "Vault · doesn't drop in missions",
  noDrops: "Doesn't drop in missions",
};

const ES: WfCopy = {
  tabs: { home: "Inicio", arsenal: "Arsenal", relics: "Reliquias", farming: "Dónde farmear", mods: "Mods" },
  soon: "Pronto",
  loading: "Cargando…",
  loadError: "Esta página no se pudo cargar.",
  retry: "Reintentar",
  seo: {
    home: {
      title: "Warframe: Arsenal, reliquias, dónde farmear y mods | Vestigo",
      description: "Cada Warframe y arma con sus partes, cada reliquia con sus recompensas, dónde farmear cada recurso y todos los mods, con las fisuras del día, Baro y los ciclos.",
    },
    arsenal: { title: "Arsenal de Warframe: Warframes, armas y sus partes | Vestigo", description: "Cada Warframe, arma y compañero con sus estadísticas, habilidades, receta y dónde cae cada parte." },
    relics: { title: "Reliquias de Warframe: recompensas y Vault | Vestigo", description: "Cada reliquia Lith, Meso, Neo y Axi con sus seis recompensas por refinamiento, dónde cae y si está en el Vault." },
    farming: { title: "Warframe: dónde farmear cada recurso | Vestigo", description: "Cada recurso con los planetas y misiones donde cae, y para qué sirve." },
    mods: { title: "Mods y arcanos de Warframe: estadísticas y drops | Vestigo", description: "Cada mod y arcano con su polaridad, costo, estadísticas por rango y dónde cae." },
  },
  home: {
    kicker: "Guía de Warframe",
    h1: "Todo para tu Arsenal",
    lede: (arsenal, relics, farming, mods) =>
      `${arsenal} Warframes y armas con sus partes y recetas, ${relics} reliquias con cada recompensa, ${farming} recursos con dónde farmearlos y ${mods} mods y arcanos.`,
    cards: {
      arsenal: "Estadísticas, habilidades, receta y dónde cae cada parte, de cada Warframe y arma.",
      relics: "Las seis recompensas por refinamiento, dónde cae la reliquia y si está en el Vault.",
      farming: "Qué planetas y misiones sueltan cada recurso, y para qué sirve.",
      mods: "Polaridad, costo, estadísticas por rango y dónde cae cada mod y arcano.",
    },
    live: {
      heading: "Ahora mismo",
      cycles: "Mundos abiertos",
      cetus: "Llanuras de Eidolon",
      vallis: "Valle de Orbis",
      cambion: "Deriva Cambion",
      state: { day: "Día", night: "Noche", warm: "Cálido", cold: "Frío", fass: "Fass", vome: "Vome" },
      left: (time) => `faltan ${time}`,
      baro: "Baro Ki'Teer",
      baroAt: (place) => `En ${place}`,
      baroHere: (time) => `Se va en ${time}`,
      baroSoon: (time) => `Llega en ${time}`,
      fissures: "Fisuras del Vacío",
      fissuresNone: "No hay fisuras abiertas.",
      steel: "Sendero de Acero",
      sortie: "Incursión",
      sortieBoss: (boss) => `Jefe: ${boss}`,
    },
    about: "Warframe es marca de Digital Extremes. Vestigo es un sitio de fans no oficial.",
  },
  arsenal: { h1: "Arsenal de Warframe", lede: (n) => `Los ${n} Warframes y armas con sus estadísticas, recetas y partes.` },
  relics: { h1: "Reliquias de Warframe", lede: (n) => `Las ${n} reliquias con sus recompensas y dónde conseguirlas.` },
  farming: { h1: "Dónde farmear en Warframe", lede: (n) => `Los ${n} recursos con las misiones donde caen.` },
  mods: { h1: "Mods y arcanos de Warframe", lede: (n) => `Los ${n} mods y arcanos con sus estadísticas y drops.` },
  rarity: { Common: "Común", Uncommon: "Poco común", Rare: "Rara", Legendary: "Legendaria" },
  polarity: { madurai: "Madurai", vazarin: "Vazarin", naramon: "Naramon", zenurik: "Zenurik", unairu: "Unairu", umbra: "Umbra", penjaga: "Penjaga", universal: "Universal", any: "Cualquiera" },
  damage: {
    impact: "Impacto", puncture: "Perforación", slash: "Tajo", heat: "Calor", cold: "Frío", electricity: "Electricidad", toxin: "Toxina", blast: "Explosión",
    radiation: "Radiación", gas: "Gas", magnetic: "Magnético", viral: "Viral", corrosive: "Corrosivo", void: "Vacío", tau: "Tau", cinematic: "Cinemático",
    shield_drain: "Drenaje de escudo", health_drain: "Drenaje de salud", energy_drain: "Drenaje de energía", true: "Verdadero",
  },
  era: { Lith: "Lith", Meso: "Meso", Neo: "Neo", Axi: "Axi", Requiem: "Réquiem", Vanguard: "Vanguardia", Omnia: "Omnia" },
  vault: "Vault · no cae en misiones",
  noDrops: "No cae en misiones",
};

export const WF_COPY: Record<"en" | "es", WfCopy> = { en: EN, es: ES };
export const useWfCopy = (): WfCopy => WF_COPY[useLang().lang];
